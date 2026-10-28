"""Persist model attempts independently of business-state publication."""

from dataclasses import replace
from datetime import timezone
from time import perf_counter

from sqlalchemy.orm import sessionmaker

from core.errors import ApiError
from models import AgentRun, AgentStepAttempt, ReviewTask
from services.attachments.service import utcnow

MAX_RUN_STEPS = 32
MAX_REVIEW_STEPS = 3


def interrupt_attempts(db, *, run_id, token=None, code="AGENT_EXECUTION_INTERRUPTED"):
    query = db.query(AgentStepAttempt).filter_by(run_id=run_id, status="running")
    if token is not None:
        query = query.filter_by(lease_token=token)
    for row in query.with_for_update().all():
        _interrupt(row, code)


def _interrupt(row, code):
    now = utcnow()
    started = row.created_at
    if started.tzinfo is None:
        started = started.replace(tzinfo=timezone.utc)
    row.status, row.usage_known, row.error_code = "interrupted", False, code
    row.completed_at = now
    row.latency_ms = max(row.latency_ms, round((now - started).total_seconds() * 1000))
    row.calls_json = [
        {**call, "status": "interrupted", "error_code": code}
        if call["status"] == "running"
        else call
        for call in row.calls_json
    ]


def reject_result(db, *, version, code, run_id=None, review_id=None, token=None):
    query = db.query(AgentStepAttempt).filter_by(input_version=version, status="succeeded")
    query = (
        query.filter_by(run_id=run_id)
        if run_id is not None
        else query.filter_by(review_id=review_id, lease_token=token)
    )
    query.update({"status": "rejected", "error_code": code}, synchronize_session=False)


def _begin(factory, *, user_id, run_id, review_id, version, context, token):
    from .run_store import guard_execution

    with factory() as db:
        if run_id is not None:
            guard_execution(db, user_id, run_id)
            changed = (
                db.query(AgentRun)
                .filter(
                    AgentRun.id == run_id,
                    AgentRun.user_id == user_id,
                    AgentRun.version == version,
                    AgentRun.status.notin_(["cancelled", "failed", "completed"]),
                )
                .update({"version": AgentRun.version}, synchronize_session=False)
            )
            query = db.query(AgentStepAttempt).filter_by(run_id=run_id)
            maximum = MAX_RUN_STEPS
        else:
            changed = (
                db.query(ReviewTask)
                .filter_by(
                    id=review_id,
                    user_id=user_id,
                    version=version,
                    processing_token=token,
                )
                .update({"version": ReviewTask.version}, synchronize_session=False)
            )
            query = db.query(AgentStepAttempt).filter_by(review_id=review_id, input_version=version)
            maximum = MAX_REVIEW_STEPS
        if changed != 1:
            raise ApiError(status_code=409, code="AGENT_STATE_CONFLICT", message="执行状态已更新")
        if review_id is not None:
            for abandoned in query.filter_by(status="running").all():
                _interrupt(abandoned, "REVIEW_LEASE_EXPIRED")
        # Owner-row write serializes count + insert, including SQLite.
        if query.count() >= maximum:
            db.commit()  # Keep interrupted review attempts closed even at the limit.
            raise ApiError(
                status_code=429,
                code="AGENT_MODEL_BUDGET_EXHAUSTED",
                message="本次任务的模型尝试次数已达上限，请重新发起评估或学习任务",
                retryable=False,
            )
        row = AgentStepAttempt(
            user_id=user_id,
            run_id=run_id,
            review_id=review_id,
            input_version=version,
            step=context.call_type,
            model=context.model,
            lease_token=token,
            attempts=1,
        )
        db.add(row)
        db.commit()
        return row.id


def invoke_observed(
    db,
    *,
    implementation,
    schema,
    messages,
    context,
    user_id,
    version,
    run_id=None,
    review_id=None,
    token=None,
):
    # Callers must release their business transaction before invoking a model.
    if db.in_transaction():
        raise RuntimeError("Model invocation must not retain a database transaction")
    factory = sessionmaker(bind=db.get_bind(), expire_on_commit=False, info=dict(db.info))
    token = token or db.info.get("agent_lease_token")
    identifier = _begin(
        factory,
        user_id=user_id,
        run_id=run_id,
        review_id=review_id,
        version=version,
        context=context,
        token=token,
    )
    started = perf_counter()
    observed = False

    def observe(values):
        nonlocal observed
        observed = True
        with factory() as session:
            session.query(AgentStepAttempt).filter_by(id=identifier, status="running").update(
                values,
                synchronize_session=False,
            )
            session.commit()

    def finish(value=None, error=None):
        with factory() as session:
            values = {
                "status": "failed" if error is not None else "succeeded",
                "error_code": getattr(error, "code", "AGENT_EXECUTION_FAILED") if error else None,
                "completed_at": utcnow(),
                "latency_ms": round((perf_counter() - started) * 1000),
            }
            if not observed:
                reported = value if value is not None else error
                values.update(
                    attempts=max(1, getattr(reported, "attempts", 1)),
                    reported_tokens=max(0, getattr(reported, "token_usage", 0)),
                    usage_known=bool(getattr(reported, "usage_known", False)),
                )
            session.query(AgentStepAttempt).filter_by(id=identifier, status="running").update(
                values,
                synchronize_session=False,
            )
            session.commit()

    try:
        result = implementation(schema, messages, replace(context, observer=observe))
    except Exception as error:
        finish(error=error)
        raise
    finish(value=result)
    return result


def list_attempts(db, *, user_id, run_id=None, review_id=None, after_id=0, limit=50):
    from .run_store import _load_owned

    if run_id is not None:
        _load_owned(db, user_id, run_id)
        scope = AgentStepAttempt.run_id == run_id
    else:
        from services.reviews import owned_review

        owned_review(db, user_id=user_id, review_id=review_id)
        scope = AgentStepAttempt.review_id == review_id
    rows = (
        db.query(AgentStepAttempt)
        .filter(
            AgentStepAttempt.user_id == user_id,
            scope,
            AgentStepAttempt.id > after_id,
        )
        .order_by(AgentStepAttempt.id)
        .limit(limit + 1)
        .all()
    )
    more = len(rows) > limit
    rows = rows[:limit]
    return {
        "items": [
            {
                "id": row.id,
                "step": row.step,
                "input_version": row.input_version,
                "model": row.model,
                "status": row.status,
                "attempts": row.attempts,
                "tokens": row.reported_tokens if row.usage_known else None,
                "reported_tokens": row.reported_tokens,
                "usage_known": row.usage_known,
                "latency_ms": row.latency_ms,
                "error_code": row.error_code,
                "calls": row.calls_json,
                "created_at": row.created_at,
                "completed_at": row.completed_at,
            }
            for row in rows
        ],
        "next_after_id": rows[-1].id if more else None,
    }
