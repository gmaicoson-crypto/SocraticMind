"""Coordinate onboarding and plan state transitions."""

from copy import deepcopy
from typing import Any
from sqlalchemy.orm import Session
from core.ai_client import resolve_model_id
from core.errors import ApiError
from models import AgentRun, Node, StudyPlan, Topic
from models.enums import AgentRunStatus, AgentRunType
from schemas.agent import OnboardingRequest, TopicPlanRequest
from .state_machine import transition
from .run_store import (
    Generator,
    RunSnapshot,
    _snapshot,
    _load_owned,
    get_run,
    _begin_processing,
    _mark_failed,
)
from .plan_generation import _generate_questions, _generate_preview
from .plan_confirmation import _serialize_node_snapshot, confirm_run


def start_onboarding(
    db: Session,
    *,
    user_id: int,
    request: OnboardingRequest,
    generator: Generator | None = None,
    model_id: str | None = None,
) -> AgentRun:
    params = request.model_dump(mode="json")
    run = AgentRun(
        user_id=user_id,
        session_id=request.session_id,
        run_type=AgentRunType.ONBOARDING.value,
        status=AgentRunStatus.COLLECTING.value,
        state_json={"params": params, "processing": False},
        model=resolve_model_id(model_id or request.model),
    )
    db.add(run)
    db.flush()
    run_id = run.id
    db.commit()

    if request.use_diagnostic:
        snapshot = _begin_processing(
            db,
            user_id=user_id,
            run_id=run_id,
            target_status=AgentRunStatus.DIAGNOSING,
            stage="diagnostic_questions",
        )
        return _generate_questions(db, snapshot, generator)

    snapshot = _begin_processing(
        db,
        user_id=user_id,
        run_id=run_id,
        target_status=AgentRunStatus.DRAFTING,
        stage="graph_draft",
    )
    return _generate_preview(db, snapshot, generator)


def start_topic_plan(
    db: Session,
    *,
    user_id: int,
    topic_id: int,
    request: TopicPlanRequest,
    generator: Generator | None = None,
    model_id: str | None = None,
) -> AgentRun:
    topic = db.query(Topic).filter(Topic.id == topic_id, Topic.user_id == user_id).first()
    if topic is None:
        raise ApiError(status_code=404, code="TOPIC_NOT_FOUND", message="主题不存在")
    if db.query(StudyPlan.id).filter(StudyPlan.topic_id == topic.id).first():
        raise ApiError(status_code=409, code="PLAN_ALREADY_EXISTS", message="主题已有学习计划")
    nodes = db.query(Node).filter(Node.topic_id == topic.id).order_by(Node.id).all()
    if not nodes:
        raise ApiError(status_code=409, code="TOPIC_HAS_NO_NODES", message="主题没有可排期节点")

    params = request.model_dump(mode="json")
    params.update({"topic": topic.title, "existing_topic_id": topic.id})
    run = AgentRun(
        user_id=user_id,
        session_id=request.session_id,
        topic_id=topic.id,
        run_type=AgentRunType.TOPIC_PLAN.value,
        status=AgentRunStatus.COLLECTING.value,
        state_json={
            "params": params,
            "processing": False,
            "topic_emoji": topic.emoji,
            "node_snapshot": [_serialize_node_snapshot(node) for node in nodes],
        },
        model=resolve_model_id(model_id or request.model),
    )
    db.add(run)
    db.flush()
    run_id = run.id
    db.commit()
    if request.use_diagnostic:
        snapshot = _begin_processing(
            db,
            user_id=user_id,
            run_id=run_id,
            target_status=AgentRunStatus.DIAGNOSING,
            stage="diagnostic_questions",
        )
        return _generate_questions(db, snapshot, generator)
    snapshot = _begin_processing(
        db,
        user_id=user_id,
        run_id=run_id,
        target_status=AgentRunStatus.DRAFTING,
        stage="existing_plan",
    )
    return _generate_preview(db, snapshot, generator)


def update_run_parameters(
    db: Session,
    *,
    user_id: int,
    run_id: str,
    updates: dict[str, Any],
    generator: Generator | None = None,
) -> AgentRun:
    run = _load_owned(db, user_id, run_id, for_update=True)
    if run.status not in {
        AgentRunStatus.COLLECTING.value,
        AgentRunStatus.AWAITING_CONFIRMATION.value,
    }:
        db.rollback()
        raise ApiError(
            status_code=409,
            code="AGENT_STATE_CONFLICT",
            message="当前阶段不能修改计划参数",
            retryable=False,
        )
    state = deepcopy(run.state_json or {})
    params = deepcopy(state["params"])
    params.update(updates)
    state["params"] = params
    state.pop("preview", None)
    state["processing"] = True
    state["processing_stage"] = (
        "existing_plan" if params.get("existing_topic_id") else "graph_draft"
    )
    run.status = transition(run.status, AgentRunStatus.DRAFTING).value
    run.state_json = state
    run.version += 1
    snapshot = _snapshot(run)
    db.commit()
    return _generate_preview(db, snapshot, generator)


def submit_answer(
    db: Session,
    *,
    user_id: int,
    run_id: str,
    step_id: str,
    version: int,
    answer: str,
    generator: Generator | None = None,
) -> AgentRun:
    run = _load_owned(db, user_id, run_id, for_update=True)
    state = deepcopy(run.state_json or {})
    if (
        run.status != AgentRunStatus.DIAGNOSING.value
        or run.version != version
        or state.get("step_id") != step_id
        or state.get("processing")
    ):
        db.rollback()
        raise ApiError(
            status_code=409,
            code="AGENT_STATE_CONFLICT",
            message="问题步骤或版本已过期，请刷新后重试",
            retryable=False,
        )
    answer = answer.strip()
    if not answer:
        raise ApiError(status_code=422, code="ANSWER_REQUIRED", message="回答不能为空")

    questions = state["questions"]
    index = state["current_index"]
    answers = [
        *state.get("answers", []),
        {"question_id": questions[index]["question_id"], "answer": answer},
    ]
    state["answers"] = answers
    state["current_index"] = index + 1
    run.version += 1
    if index + 1 < len(questions):
        state["step_id"] = f"diagnostic-question-{index + 2}"
        run.state_json = state
        db.commit()
        return _load_owned(db, user_id, run_id)

    run.status = transition(run.status, AgentRunStatus.DRAFTING).value
    state.update(
        {
            "step_id": None,
            "processing": True,
            "processing_stage": "diagnostic_score",
        }
    )
    run.state_json = state
    snapshot = _snapshot(run)
    db.commit()
    return _generate_preview(db, snapshot, generator)


def cancel_run(db: Session, *, user_id: int, run_id: str) -> AgentRun:
    run = _load_owned(db, user_id, run_id, for_update=True)
    run.status = transition(run.status, AgentRunStatus.CANCELLED).value
    state = deepcopy(run.state_json or {})
    state["processing"] = False
    run.state_json = state
    run.version += 1
    db.commit()
    return _load_owned(db, user_id, run_id)


def retry_run(
    db: Session,
    *,
    user_id: int,
    run_id: str,
    generator: Generator | None = None,
) -> AgentRun:
    run = _load_owned(db, user_id, run_id, for_update=True)
    if run.status != AgentRunStatus.FAILED.value or not run.retryable:
        db.rollback()
        raise ApiError(
            status_code=409,
            code="AGENT_RETRY_NOT_ALLOWED",
            message="当前流程不可重试",
            retryable=False,
        )
    state = deepcopy(run.state_json or {})
    stage = state.get("processing_stage")
    target = (
        AgentRunStatus.DIAGNOSING if stage == "diagnostic_questions" else AgentRunStatus.DRAFTING
    )
    run.status = transition(run.status, target).value
    state["processing"] = True
    run.state_json = state
    run.error_code = None
    run.retryable = None
    run.version += 1
    snapshot = _snapshot(run)
    db.commit()
    if stage == "diagnostic_questions":
        return _generate_questions(db, snapshot, generator)
    if stage in {"diagnostic_score", "graph_draft", "existing_plan"}:
        return _generate_preview(db, snapshot, generator)
    return _mark_failed(db, snapshot, code="AGENT_STAGE_UNKNOWN", retryable=False)


__all__ = [
    "Generator",
    "RunSnapshot",
    "get_run",
    "confirm_run",
    "start_onboarding",
    "start_topic_plan",
    "update_run_parameters",
    "submit_answer",
    "cancel_run",
    "retry_run",
]
