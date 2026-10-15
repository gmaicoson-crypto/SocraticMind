"""Diagnostic generation and learning-plan previews."""

import json
from copy import deepcopy
from typing import Any
from sqlalchemy.orm import Session
from models import AgentRun
from models.enums import AgentRunStatus
from schemas.structured_ai import DiagnosticQuestions, DiagnosticScore, PersonalizedGraphDraft
from services.graph_validation import GraphValidationError, prepare_graph
from services.planning import build_schedule, today_in_timezone
from .structured_ai import StructuredAIError, high_risk_notice
from .run_store import Generator, RunSnapshot, _load_owned, _conditional_save, _mark_failed, _invoke


def _generate_questions(
    db: Session, snapshot: RunSnapshot, generator: Generator | None
) -> AgentRun:
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
        result = _invoke(generator, DiagnosticQuestions, messages, snapshot, "diagnostic_questions")
    except StructuredAIError as error:
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


def _existing_topic_preview(state: dict[str, Any]) -> dict[str, Any]:
    params = state["params"]
    graph = deepcopy(state["node_snapshot"])
    start_date, effective_timezone = today_in_timezone(params.get("timezone"))
    target_date = params.get("target_date")
    if target_date:
        from datetime import date

        target_date = date.fromisoformat(target_date)
    plan = build_schedule(
        graph,
        daily_minutes=params["daily_minutes"],
        start_date=start_date,
        target_date=target_date,
        timezone=effective_timezone,
        skip_node_keys={node["key"] for node in graph if node["state"] == "mastered"},
    )
    return {
        "existing_topic_id": params["existing_topic_id"],
        "topic": params["topic"],
        "emoji": state["topic_emoji"],
        "goal": params["goal"],
        "domain": params["domain"],
        "outcome_type": params["outcome_type"],
        "diagnostic": state.get("diagnostic_result"),
        "nodes": graph,
        "plan_items": [
            {
                "node_key": item.node_key,
                "scheduled_date": item.scheduled_date.isoformat(),
                "day_order": item.day_order,
                "estimated_minutes": item.estimated_minutes,
                "status": item.status,
            }
            for item in plan.items
        ],
        "total_minutes": plan.total_minutes,
        "daily_minutes": params["daily_minutes"],
        "start_date": start_date.isoformat(),
        "estimated_end_date": plan.estimated_end_date.isoformat(),
        "target_date": params.get("target_date"),
        "will_miss_target": plan.will_miss_target,
        "delay_days": plan.delay_days,
        "effective_timezone": plan.effective_timezone,
        "risk_notice": high_risk_notice(params["domain"], params["topic"]),
    }


def _generate_preview(db: Session, snapshot: RunSnapshot, generator: Generator | None) -> AgentRun:
    current = snapshot
    state = deepcopy(current.state)
    if state.get("answers") and not state.get("diagnostic_result"):
        try:
            score = _invoke(
                generator,
                DiagnosticScore,
                _diagnostic_messages(state),
                current,
                "diagnostic_score",
            )
        except StructuredAIError as error:
            return _mark_failed(db, current, code=error.code, retryable=error.retryable)
        state["diagnostic_result"] = score.value.model_dump(mode="json")
        state["processing_stage"] = "graph_draft"
        current = _conditional_save(
            db,
            current,
            status=AgentRunStatus.DRAFTING,
            state=state,
            ai_result=score,
        )

    if state["params"].get("existing_topic_id"):
        try:
            preview = _existing_topic_preview(state)
        except (GraphValidationError, ValueError):
            return _mark_failed(db, current, code="EXISTING_GRAPH_INVALID", retryable=False)
        state["preview"] = preview
        state["processing"] = False
        state["processing_stage"] = None
        saved = _conditional_save(
            db,
            current,
            status=AgentRunStatus.AWAITING_CONFIRMATION,
            state=state,
        )
        return _load_owned(db, saved.user_id, saved.id)

    try:
        graph_result = _invoke(
            generator,
            PersonalizedGraphDraft,
            _graph_messages(state),
            current,
            "personalized_graph",
        )
        graph = prepare_graph(graph_result.value.model_dump(mode="json")["nodes"])
    except StructuredAIError as error:
        return _mark_failed(db, current, code=error.code, retryable=error.retryable)
    except GraphValidationError:
        return _mark_failed(db, current, code="GRAPH_INVALID", retryable=True)

    params = state["params"]
    start_date, effective_timezone = today_in_timezone(params.get("timezone"))
    target_date = params.get("target_date")
    if target_date:
        from datetime import date

        target_date = date.fromisoformat(target_date)
    plan = build_schedule(
        graph,
        daily_minutes=params["daily_minutes"],
        start_date=start_date,
        target_date=target_date,
        timezone=effective_timezone,
    )
    preview = {
        "topic": params["topic"],
        "emoji": graph_result.value.emoji,
        "goal": params["goal"],
        "domain": params["domain"],
        "outcome_type": params["outcome_type"],
        "diagnostic": state.get("diagnostic_result"),
        "nodes": graph,
        "plan_items": [
            {
                "node_key": item.node_key,
                "scheduled_date": item.scheduled_date.isoformat(),
                "day_order": item.day_order,
                "estimated_minutes": item.estimated_minutes,
                "status": item.status,
            }
            for item in plan.items
        ],
        "total_minutes": plan.total_minutes,
        "daily_minutes": params["daily_minutes"],
        "start_date": start_date.isoformat(),
        "estimated_end_date": plan.estimated_end_date.isoformat(),
        "target_date": params.get("target_date"),
        "will_miss_target": plan.will_miss_target,
        "delay_days": plan.delay_days,
        "effective_timezone": plan.effective_timezone,
        "risk_notice": high_risk_notice(params["domain"], params["topic"]),
    }
    state["preview"] = preview
    state["processing"] = False
    state["processing_stage"] = None
    saved = _conditional_save(
        db,
        current,
        status=AgentRunStatus.AWAITING_CONFIRMATION,
        state=state,
        ai_result=graph_result,
    )
    return _load_owned(db, saved.user_id, saved.id)
