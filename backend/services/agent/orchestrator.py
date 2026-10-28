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
    _load_owned,
    get_run,
)
from .job_execution import dispatch
from .jobs import commit_command
from .creation import existing_request, request_hash, persist_new_run
from .plan_confirmation import _serialize_node_snapshot
from .grounding import select_materials


def start_onboarding(
    db: Session,
    *,
    user_id: int,
    request: OnboardingRequest,
    generator: Generator | None = None,
    deferred: bool = False,
    model_id: str | None = None,
) -> AgentRun:
    model = resolve_model_id(model_id or request.model)
    digest = request_hash(request, model_id=model)
    previous = existing_request(db, user_id=user_id, request_id=request.request_id, digest=digest)
    if previous is not None:
        return previous
    params = select_materials(db, user_id=user_id, request=request)
    run = AgentRun(
        user_id=user_id,
        session_id=request.session_id,
        run_type=AgentRunType.ONBOARDING.value,
        status="diagnosing" if request.use_diagnostic else "drafting",
        state_json={
            "workflow_version": 1,
            "params": params,
            "processing": True,
            "processing_stage": "diagnostic_questions" if request.use_diagnostic else "graph_draft",
        },
        model=model,
    )
    run_id = persist_new_run(db, run, request_id=request.request_id, digest=digest)
    return dispatch(db, user_id=user_id, run_id=run_id, generator=generator, deferred=deferred)


def start_topic_plan(
    db: Session,
    *,
    user_id: int,
    topic_id: int,
    request: TopicPlanRequest,
    generator: Generator | None = None,
    deferred: bool = False,
    model_id: str | None = None,
) -> AgentRun:
    model = resolve_model_id(model_id or request.model)
    digest = request_hash(request, model_id=model, topic_id=topic_id)
    previous = existing_request(db, user_id=user_id, request_id=request.request_id, digest=digest)
    if previous is not None:
        return previous
    topic = db.query(Topic).filter(Topic.id == topic_id, Topic.user_id == user_id).first()
    if topic is None:
        raise ApiError(status_code=404, code="TOPIC_NOT_FOUND", message="主题不存在")
    if db.query(StudyPlan.id).filter(StudyPlan.topic_id == topic.id).first():
        raise ApiError(status_code=409, code="PLAN_ALREADY_EXISTS", message="主题已有学习计划")
    nodes = db.query(Node).filter(Node.topic_id == topic.id).order_by(Node.id).all()
    if not nodes:
        raise ApiError(status_code=409, code="TOPIC_HAS_NO_NODES", message="主题没有可排期节点")

    params = select_materials(db, user_id=user_id, request=request, topic_id=topic_id)
    params.update({"topic": topic.title, "existing_topic_id": topic.id})
    run = AgentRun(
        user_id=user_id,
        session_id=request.session_id,
        topic_id=topic.id,
        run_type=AgentRunType.TOPIC_PLAN.value,
        status="diagnosing" if request.use_diagnostic else "drafting",
        state_json={
            "workflow_version": 1,
            "params": params,
            "processing": True,
            "processing_stage": "diagnostic_questions"
            if request.use_diagnostic
            else "existing_plan",
            "topic_emoji": topic.emoji,
            "node_snapshot": [_serialize_node_snapshot(node) for node in nodes],
        },
        model=model,
    )
    run_id = persist_new_run(db, run, request_id=request.request_id, digest=digest)
    return dispatch(db, user_id=user_id, run_id=run_id, generator=generator, deferred=deferred)


def update_run_parameters(
    db: Session,
    *,
    user_id: int,
    run_id: str,
    updates: dict[str, Any],
    generator: Generator | None = None,
    deferred: bool = False,
) -> AgentRun:
    run = _load_owned(db, user_id, run_id, for_update=True)
    updates = dict(updates)
    regenerate = updates.pop("regenerate", False)
    request_id = updates.pop("request_id", None)
    version = updates.pop("version", None)
    state = deepcopy(run.state_json or {})
    intent = {"request_id": request_id, "version": version, "updates": updates}
    prior = state.get("regeneration")
    if regenerate:
        if not request_id or version is None:
            raise ApiError(
                status_code=422, code="VALIDATION_ERROR", message="重新生成需要请求标识和版本"
            )
        if prior and prior["request_id"] == request_id:
            if prior != intent:
                raise ApiError(
                    status_code=409,
                    code="IDEMPOTENCY_CONFLICT",
                    message="同一请求不能修改重新生成参数",
                )
            db.commit()
            return _load_owned(db, user_id, run_id)
    if version is not None and run.version != version:
        raise ApiError(status_code=409, code="AGENT_STATE_CONFLICT", message="计划预览版本已变化")
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
    params = deepcopy(state["params"])
    changed = {key for key, value in updates.items() if params.get(key) != value}
    if not changed and not regenerate:
        db.commit()
        return _load_owned(db, user_id, run_id)
    params.update(updates)
    state["params"] = params
    previous = state.pop("preview", None)
    state.pop("confirmation", None)
    if "goal" in changed:
        state.pop("graph_draft", None)
        state.pop("diagnostic_result", None)
    elif regenerate:
        state.pop("graph_draft", None)
    elif previous and not params.get("existing_topic_id") and not state.get("graph_draft"):
        # Runs created before graph-result caching still reuse their reviewed nodes.
        state["graph_draft"] = {"nodes": previous["nodes"], "emoji": previous["emoji"]}
    if regenerate:
        state["regeneration"] = intent
    state["processing"] = True
    state["processing_stage"] = (
        "existing_plan" if params.get("existing_topic_id") else "graph_draft"
    )
    commit_command(
        db,
        run,
        state=state,
        status=transition(run.status, AgentRunStatus.DRAFTING).value,
        event={"kind": "updated"},
    )
    return dispatch(db, user_id=user_id, run_id=run_id, generator=generator, deferred=deferred)


def submit_answer(
    db: Session,
    *,
    user_id: int,
    run_id: str,
    step_id: str,
    version: int,
    answer: str,
    generator: Generator | None = None,
    deferred: bool = False,
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
    if index + 1 < len(questions):
        state["step_id"] = f"diagnostic-question-{index + 2}"
        commit_command(db, run, state=state, event={"kind": "answer"})
    else:
        state.update(step_id=None, processing=True, processing_stage="diagnostic_score")
        commit_command(
            db,
            run,
            state=state,
            status=transition(run.status, AgentRunStatus.DRAFTING).value,
            event={"kind": "answer"},
        )
    return dispatch(db, user_id=user_id, run_id=run_id, generator=generator, deferred=deferred)


def confirm_run(
    db: Session,
    *,
    user_id: int,
    run_id: str,
    request_id: str,
    version: int | None = None,
    deferred: bool = False,
) -> AgentRun:
    run = _load_owned(db, user_id, run_id, for_update=True)
    if run.status == AgentRunStatus.COMPLETED.value:
        return run
    state = deepcopy(run.state_json or {})
    decision = state.get("confirmation")
    if decision and decision["request_id"] == request_id:
        if version is not None and decision["version"] != version:
            raise ApiError(
                status_code=409, code="IDEMPOTENCY_CONFLICT", message="确认请求版本不一致"
            )
        return run
    if (
        run.status != AgentRunStatus.AWAITING_CONFIRMATION.value
        or version is not None
        and run.version != version
    ):
        db.rollback()
        raise ApiError(
            status_code=409, code="AGENT_STATE_CONFLICT", message="计划预览版本已变化，请刷新后确认"
        )
    state["confirmation"] = {"request_id": request_id, "version": run.version}
    state.update(processing=True, processing_stage="confirm")
    commit_command(db, run, state=state, event={"kind": "confirm", "request_id": request_id})
    return dispatch(db, user_id=user_id, run_id=run_id, deferred=deferred)


def cancel_run(db: Session, *, user_id: int, run_id: str) -> AgentRun:
    run = _load_owned(db, user_id, run_id, for_update=True)
    if run.status == AgentRunStatus.CANCELLED.value:
        return run
    state = deepcopy(run.state_json or {})
    state["processing"] = False
    commit_command(
        db,
        run,
        state=state,
        status=transition(run.status, AgentRunStatus.CANCELLED).value,
        cancel=True,
    )
    return _load_owned(db, user_id, run_id)


def retry_run(
    db: Session,
    *,
    user_id: int,
    run_id: str,
    generator: Generator | None = None,
    deferred: bool = False,
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
    target = state.pop("resume_status", None) or (
        "diagnosing"
        if stage == "diagnostic_questions"
        else "awaiting_confirmation"
        if stage == "confirm"
        else "drafting"
    )
    event = (
        {"kind": "confirm", "request_id": state["confirmation"]["request_id"]}
        if stage == "confirm" and state.get("confirmation")
        else {"kind": "retry"}
    )
    # Results can commit before a worker/checkpoint failure. Replaying their
    # waiting node performs no generation, so retain its ready-for-input state.
    # The queued/running job still keeps the API busy until recovery finishes.
    state["processing"] = not (
        target == "diagnosing"
        and bool(state.get("questions"))
        or target == "awaiting_confirmation"
        and event["kind"] != "confirm"
    )
    commit_command(db, run, state=state, status=transition(run.status, target).value, event=event)
    return dispatch(db, user_id=user_id, run_id=run_id, generator=generator, deferred=deferred)


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
