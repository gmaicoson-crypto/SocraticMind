"""Assessment attempt lookup and conditional failure persistence shared by stages."""

from copy import deepcopy
from sqlalchemy.orm import Session
from core.errors import ApiError
from models import AgentRun, AssessmentAttempt
from models.enums import AgentRunStatus, AssessmentStatus
from services.agent.run_store import RunSnapshot, _load_owned


def _attempt_for_run(db: Session, run_id: str) -> AssessmentAttempt:
    attempt = db.query(AssessmentAttempt).filter_by(run_id=run_id).first()
    if attempt is None:
        raise ApiError(
            status_code=409,
            code="ASSESSMENT_NOT_FOUND",
            message="评估记录不存在",
        )
    return attempt


def _fail_assessment(
    db: Session,
    snapshot: RunSnapshot,
    *,
    code: str,
    retryable: bool,
    mark_attempt_failed: bool = True,
) -> AgentRun:
    from services.agent.observability import reject_result

    reject_result(db, run_id=snapshot.id, version=snapshot.version, code=code)
    state = deepcopy(snapshot.state)
    state["processing"] = False
    updated = (
        db.query(AgentRun)
        .filter(
            AgentRun.id == snapshot.id,
            AgentRun.user_id == snapshot.user_id,
            AgentRun.version == snapshot.version,
        )
        .update(
            {
                AgentRun.status: AgentRunStatus.FAILED.value,
                AgentRun.state_json: state,
                AgentRun.version: snapshot.version + 1,
                AgentRun.error_code: code,
                AgentRun.retryable: retryable,
            },
            synchronize_session=False,
        )
    )
    if updated != 1:
        db.rollback()
        raise ApiError(
            status_code=409,
            code="AGENT_STATE_CONFLICT",
            message="评估流程已被其他请求更新",
        )
    if mark_attempt_failed:
        db.query(AssessmentAttempt).filter_by(run_id=snapshot.id).update(
            {AssessmentAttempt.status: AssessmentStatus.FAILED.value},
            synchronize_session=False,
        )
    db.commit()
    return _load_owned(db, snapshot.user_id, snapshot.id)
