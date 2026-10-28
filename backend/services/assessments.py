"""Coordinate assessment creation, answers, retries and cancellation."""

from copy import deepcopy
from sqlalchemy.orm import Session
from core.ai_client import resolve_model_id
from core.errors import ApiError
from models import AgentRun, AssessmentAttempt, Node, StudyPlan, Topic
from models.enums import AgentRunStatus, AgentRunType, AssessmentStatus
from services.agent.run_store import Generator, _load_owned, _snapshot
from services.agent.state_machine import transition
from services.assessment_state import _attempt_for_run, _fail_assessment
from services.assessment_generation import _generate_assessment_questions, _score_assessment
from services.knowledge.assessment_context import freeze_evidence, assessment_sources


def _owned_node(db: Session, user_id: int, node_id: int) -> Node:
    node = (
        db.query(Node)
        .join(Topic, Node.topic_id == Topic.id)
        .filter(Node.id == node_id, Topic.user_id == user_id)
        .with_for_update()
        .first()
    )
    if node is None:
        raise ApiError(status_code=404, code="NODE_NOT_FOUND", message="节点不存在")
    return node


def start_assessment(
    db: Session,
    *,
    user_id: int,
    node_id: int,
    request_id: str,
    session_id: str | None = None,
    generator: Generator | None = None,
    model_id: str | None = None,
) -> AgentRun:
    existing_request = (
        db.query(AgentRun)
        .filter(
            AgentRun.user_id == user_id,
            AgentRun.run_type == AgentRunType.ASSESSMENT.value,
            AgentRun.request_id == request_id,
        )
        .first()
    )
    if existing_request is not None:
        return existing_request
    node = _owned_node(db, user_id, node_id)
    if node.state == "locked":
        raise ApiError(status_code=409, code="NODE_LOCKED", message="节点尚未解锁")
    active = (
        db.query(AssessmentAttempt)
        .filter(
            AssessmentAttempt.user_id == user_id,
            AssessmentAttempt.node_id == node.id,
            AssessmentAttempt.status == AssessmentStatus.ACTIVE.value,
        )
        .first()
    )
    if active is not None:
        return active.run
    if node.state == "mastered":
        completed = (
            db.query(AssessmentAttempt)
            .filter(
                AssessmentAttempt.user_id == user_id,
                AssessmentAttempt.node_id == node.id,
                AssessmentAttempt.status == AssessmentStatus.COMPLETED.value,
            )
            .order_by(AssessmentAttempt.id.desc())
            .first()
        )
        if completed is not None:
            return completed.run
        raise ApiError(
            status_code=409,
            code="NODE_ALREADY_MASTERED",
            message="节点已经掌握",
        )

    plan = db.query(StudyPlan).filter(StudyPlan.topic_id == node.topic_id).first()
    params = {
        "node_id": node.id,
        "node_key": node.node_key,
        "node_label": node.label,
        "node_sub": node.sub or "",
        "topic": node.topic.title,
        "domain": plan.domain if plan else "general",
        "outcome_type": plan.outcome_type if plan else "concept",
        "material_scope_topic_id": node.topic_id,
    }
    model_id = resolve_model_id(model_id)
    evidence = freeze_evidence(db, user_id=user_id, node=node, model_id=model_id)
    run = AgentRun(
        user_id=user_id,
        session_id=session_id,
        topic_id=node.topic_id,
        run_type=AgentRunType.ASSESSMENT.value,
        status=AgentRunStatus.ASSESSING.value,
        version=1,
        state_json={
            "params": params,
            "processing": True,
            "processing_stage": "assessment_questions",
            "evidence": evidence,
        },
        model=model_id,
        request_id=request_id,
    )
    db.add(run)
    db.flush()
    attempt = AssessmentAttempt(
        user_id=user_id,
        node_id=node.id,
        run_id=run.id,
        status=AssessmentStatus.ACTIVE.value,
        questions_json=[],
        answers_json=[],
        rubrics_json=[],
    )
    db.add(attempt)
    db.flush()
    state = deepcopy(run.state_json)
    state["attempt_id"] = attempt.id
    run.state_json = state
    snapshot = _snapshot(run)
    db.commit()
    return _generate_assessment_questions(db, snapshot, generator)


def submit_assessment_answer(
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
        run.run_type != AgentRunType.ASSESSMENT.value
        or run.status != AgentRunStatus.ASSESSING.value
        or run.version != version
        or state.get("step_id") != step_id
        or state.get("processing")
    ):
        db.rollback()
        raise ApiError(
            status_code=409,
            code="AGENT_STATE_CONFLICT",
            message="评估步骤或版本已过期",
            retryable=False,
        )
    answer = answer.strip()
    if not answer:
        raise ApiError(status_code=422, code="ANSWER_REQUIRED", message="回答不能为空")
    try:
        assessment_sources(db, _snapshot(run), lock=True)
    except ApiError as error:
        return _fail_assessment(db, _snapshot(run), code=error.code, retryable=False)
    questions = state["questions"]
    index = state["current_index"]
    answers = [
        *state.get("answers", []),
        {"question_id": questions[index]["question_id"], "answer": answer},
    ]
    state["answers"] = answers
    state["current_index"] = index + 1
    run.version += 1
    attempt = _attempt_for_run(db, run.id)
    attempt.answers_json = answers
    if index + 1 < len(questions):
        state["step_id"] = f"assessment-question-{index + 2}"
        run.state_json = state
        db.commit()
        return _load_owned(db, user_id, run.id)
    state.update(
        {
            "step_id": None,
            "processing": True,
            "processing_stage": "assessment_score",
        }
    )
    run.state_json = state
    snapshot = _snapshot(run)
    db.commit()
    return _score_assessment(db, snapshot, generator)


def retry_assessment(
    db: Session,
    *,
    user_id: int,
    run_id: str,
    generator: Generator | None = None,
) -> AgentRun:
    run = _load_owned(db, user_id, run_id, for_update=True)
    if (
        run.run_type != AgentRunType.ASSESSMENT.value
        or run.status != AgentRunStatus.FAILED.value
        or not run.retryable
    ):
        db.rollback()
        raise ApiError(
            status_code=409,
            code="AGENT_RETRY_NOT_ALLOWED",
            message="当前评估不可重试",
        )
    state = deepcopy(run.state_json or {})
    stage = state.get("processing_stage")
    run.status = transition(run.status, AgentRunStatus.ASSESSING).value
    run.version += 1
    run.error_code = None
    run.retryable = None
    state["processing"] = True
    run.state_json = state
    attempt = _attempt_for_run(db, run.id)
    attempt.status = AssessmentStatus.ACTIVE.value
    snapshot = _snapshot(run)
    db.commit()
    if stage == "assessment_questions":
        return _generate_assessment_questions(db, snapshot, generator)
    if stage == "assessment_score":
        return _score_assessment(db, snapshot, generator)
    return _fail_assessment(db, snapshot, code="ASSESSMENT_STAGE_UNKNOWN", retryable=False)


def cancel_assessment(db: Session, *, user_id: int, run_id: str) -> AgentRun:
    from services.agent.observability import interrupt_attempts

    run = _load_owned(db, user_id, run_id, for_update=True)
    run.status = transition(run.status, AgentRunStatus.CANCELLED).value
    state = deepcopy(run.state_json or {})
    state["processing"] = False
    run.state_json = state
    run.version += 1
    attempt = _attempt_for_run(db, run.id)
    attempt.status = AssessmentStatus.CANCELLED.value
    interrupt_attempts(db, run_id=run_id, code="AGENT_CANCELLED")
    db.commit()
    return _load_owned(db, user_id, run.id)
