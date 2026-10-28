"""Diagnostic generation and learning-plan previews."""

import json
from copy import deepcopy
from typing import Any
from sqlalchemy.orm import Session
from models import AgentRun
from core.errors import ApiError
from models.enums import AgentRunStatus
from schemas.structured_ai import DiagnosticQuestions, DiagnosticScore, PersonalizedGraphDraft
from services.graph_validation import GraphValidationError, prepare_graph
from .structured_ai import StructuredAIError
from .grounding import prepare_evidence, grounded_messages, validate_evidence, ground_nodes
from .plan_preview import build_plan_preview
from .run_store import Generator, RunSnapshot, _load_owned, _conditional_save, _mark_failed, _invoke


def _generate_questions(
    db: Session, snapshot: RunSnapshot, generator: Generator | None
) -> AgentRun:
    try:
        snapshot = prepare_evidence(db, snapshot)
    except ApiError as error:
        return _mark_failed(db, snapshot, code=error.code, retryable=bool(error.retryable))
    params = snapshot.state["params"]
    messages = [
        {
            "role": "system",
            "content": (
                "生成三道诊断题，dimension 依次覆盖 prior_knowledge、application、limits。"
                "题目应适配给定领域和学习成果类型，只返回结构化 JSON。"
            ),
        },
        {"role": "user", "content": json.dumps(params, ensure_ascii=False)},
    ]
    try:
        result = _invoke(
            generator,
            DiagnosticQuestions,
            grounded_messages(db, snapshot, messages),
            snapshot,
            "diagnostic_questions",
            db=db,
        )
        validate_evidence(db, snapshot, lock=True)
    except (StructuredAIError, ApiError) as error:
        return _mark_failed(db, snapshot, code=error.code, retryable=error.retryable)

    state = deepcopy(snapshot.state)
    state.update(
        {
            "questions": result.value.model_dump(mode="json")["questions"],
            "answers": [],
            "current_index": 0,
            "step_id": "diagnostic-question-1",
            "processing": False,
        }
    )
    saved = _conditional_save(
        db,
        snapshot,
        status=AgentRunStatus.DIAGNOSING,
        state=state,
        ai_result=result,
    )
    return _load_owned(db, saved.user_id, saved.id)


def _diagnostic_messages(state: dict[str, Any]) -> list[dict]:
    return [
        {
            "role": "system",
            "content": "根据三道题和回答集中评分，返回结构化诊断结果。",
        },
        {
            "role": "user",
            "content": json.dumps(
                {
                    "params": state["params"],
                    "questions": state.get("questions", []),
                    "answers": state.get("answers", []),
                },
                ensure_ascii=False,
            ),
        },
    ]


def _graph_messages(state: dict[str, Any]) -> list[dict]:
    params = state["params"]
    return [
        {
            "role": "system",
            "content": (
                "生成 6 到 10 个严格树结构的学习节点：有且只有一个根节点，每个非根节点必须且只能有一个父节点，"
                "根节点至少有两个直接子节点，整棵树至少有两个分支节点和三个叶子节点，最长路径不超过四层，禁止单链结构。"
                "节点之间无环，每个节点预计 10 到 120 分钟，结构和题材必须适配领域及学习成果类型，只返回结构化 JSON。"
            ),
        },
        {
            "role": "user",
            "content": json.dumps(
                {"params": params, "diagnostic": state.get("diagnostic_result")},
                ensure_ascii=False,
            ),
        },
    ]


def _generate_score(db: Session, snapshot: RunSnapshot, generator: Generator | None) -> AgentRun:
    current = snapshot
    try:
        current = prepare_evidence(db, current)
        state = deepcopy(current.state)
        score = _invoke(
            generator,
            DiagnosticScore,
            grounded_messages(db, current, _diagnostic_messages(state)),
            current,
            "diagnostic_score",
            db=db,
        )
        validate_evidence(db, current, lock=True)
    except (StructuredAIError, ApiError) as error:
        return _mark_failed(db, current, code=error.code, retryable=bool(error.retryable))
    state["diagnostic_result"] = score.value.model_dump(mode="json")
    state["processing_stage"] = "graph_draft"
    saved = _conditional_save(
        db, current, status=AgentRunStatus.DRAFTING, state=state, ai_result=score
    )
    return _load_owned(db, saved.user_id, saved.id)


def _generate_graph(db: Session, snapshot: RunSnapshot, generator: Generator | None) -> AgentRun:
    current = snapshot
    try:
        current = prepare_evidence(db, current)
        state = deepcopy(current.state)
        result = _invoke(
            generator,
            PersonalizedGraphDraft,
            grounded_messages(db, current, _graph_messages(state)),
            current,
            "personalized_graph",
            db=db,
        )
        validate_evidence(db, current, lock=True)
        graph = ground_nodes(prepare_graph(result.value.model_dump(mode="json")["nodes"]), current)
    except (StructuredAIError, ApiError) as error:
        return _mark_failed(db, current, code=error.code, retryable=bool(error.retryable))
    except GraphValidationError:
        return _mark_failed(db, current, code="GRAPH_INVALID", retryable=True)
    state["graph_draft"] = {"nodes": graph, "emoji": result.value.emoji}
    state["processing_stage"] = "schedule"
    # Persist the successful model result before deterministic scheduling. A crash
    # before the graph checkpoint can replay this node without paying for it again.
    saved = _conditional_save(
        db, current, status=AgentRunStatus.DRAFTING, state=state, ai_result=result
    )
    return _load_owned(db, saved.user_id, saved.id)


def _generate_schedule(db: Session, snapshot: RunSnapshot) -> AgentRun:
    current = snapshot
    try:
        current = prepare_evidence(db, current)
        state = deepcopy(current.state)
        existing = bool(state["params"].get("existing_topic_id"))
        draft = (
            {"nodes": state["node_snapshot"], "emoji": state["topic_emoji"]}
            if existing
            else state["graph_draft"]
        )
        preview = build_plan_preview(state, draft["nodes"], draft["emoji"], existing=existing)
        validate_evidence(db, current, lock=True)
    except ApiError as error:
        return _mark_failed(db, current, code=error.code, retryable=bool(error.retryable))
    except (GraphValidationError, ValueError):
        return _mark_failed(db, current, code="EXISTING_GRAPH_INVALID", retryable=False)
    state.update(preview=preview, processing=False, processing_stage=None)
    saved = _conditional_save(db, current, status=AgentRunStatus.AWAITING_CONFIRMATION, state=state)
    return _load_owned(db, saved.user_id, saved.id)
