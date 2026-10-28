"""Durable commands, bounded recovery and lease fencing. Lock order: run, job."""

from copy import deepcopy
from datetime import timedelta
from uuid import uuid4

from sqlalchemy import and_, or_

from core.errors import ApiError
from models import AgentJob, AgentRun, User
from services.attachments.service import utcnow
from .observability import interrupt_attempts

LEASE_SECONDS = 45
MAX_ATTEMPTS = 3
ACTIVE = {"queued", "running"}
MAX_PENDING_PER_USER = 4


def conflict(code="AGENT_BUSY", message="流程正在执行，请稍后刷新"):
    return ApiError(status_code=409, code=code, message=message, retryable=False)


def ensure_idle(db, run):
    job = db.query(AgentJob).filter_by(run_id=run.id).with_for_update().first()
    if job is not None and job.status in ACTIVE:
        raise conflict()
    return job


def enqueue(db, run, *, event=None):
    """Called inside the transaction that accepts the input, before commit."""
    job = ensure_idle(db, run)
    if job is None:
        job = AgentJob(run_id=run.id, user_id=run.user_id)
        db.add(job)
    job.status = "queued"
    job.event_json = deepcopy(event)
    job.requested_version = run.version
    job.lease_token = job.lease_until = None
    job.attempts = 0
    job.available_at = utcnow()
    job.error_code = None
    return job


def ensure_capacity(db, user_id, *, run_id=None):
    # Serialize submissions by this user, including SQLite's separate connections.
    db.query(User).filter_by(id=user_id).update({"id": User.id}, synchronize_session=False)
    pending = db.query(AgentJob.run_id).filter(
        AgentJob.user_id == user_id, AgentJob.status.in_(ACTIVE)
    )
    if run_id:
        pending = pending.filter(AgentJob.run_id != run_id)
    # A locking read observes current rows under MySQL REPEATABLE READ too.
    if len(pending.with_for_update().limit(MAX_PENDING_PER_USER).all()) >= MAX_PENDING_PER_USER:
        db.rollback()
        raise ApiError(
            status_code=429,
            code="AGENT_QUEUE_FULL",
            message="执行中的学习任务较多，请稍后再试",
            retryable=True,
        )


def commit_command(db, run, *, state, status=None, event=None, cancel=False):
    """Compare-and-swap works on SQLite too, where SELECT FOR UPDATE is ignored."""
    if not cancel:
        ensure_idle(db, run)
        ensure_capacity(db, run.user_id, run_id=run.id)
    changed = (
        db.query(AgentRun)
        .filter_by(id=run.id, user_id=run.user_id, version=run.version)
        .update(
            {
                "state_json": state,
                "status": status or run.status,
                "version": run.version + 1,
                "error_code": None,
                "retryable": None,
            },
            synchronize_session=False,
        )
    )
    if changed != 1:
        db.rollback()
        raise conflict("AGENT_STATE_CONFLICT", "流程版本已变化，请刷新后重试")
    db.refresh(run)
    if cancel:
        cancel_job(db, run)
    else:
        enqueue(db, run, event=event)
    db.commit()
    return run


def _available(now):
    return or_(
        and_(AgentJob.status == "queued", AgentJob.available_at <= now),
        and_(AgentJob.status == "running", AgentJob.lease_until <= now),
    )


def _claimed_run(db, claim):
    return (
        db.query(AgentRun)
        .populate_existing()
        .filter_by(
            id=claim["run_id"],
            user_id=claim["user_id"],
        )
        .with_for_update()
        .first()
    )


def claim_job(factory, *, run_id=None, now=None):
    now = now or utcnow()
    with factory() as db:
        candidates = db.query(AgentJob.run_id, AgentJob.user_id).filter(_available(now))
        if run_id:
            candidates = candidates.filter(AgentJob.run_id == run_id)
        candidates = candidates.order_by(AgentJob.available_at, AgentJob.run_id).limit(10).all()
        for candidate_id, user_id in candidates:
            run = _claimed_run(db, {"user_id": user_id, "run_id": candidate_id})
            if run is None:
                db.rollback()
                continue
            job = (
                db.query(AgentJob)
                .filter(AgentJob.run_id == candidate_id, _available(now))
                .with_for_update()
                .first()
            )
            if job is None:
                db.rollback()
                continue
            if run.status in {"cancelled", "completed"}:
                job.status = run.status
                job.lease_token = job.lease_until = None
                db.commit()
                continue
            interrupt_attempts(db, run_id=candidate_id, code="AGENT_LEASE_EXPIRED")
            if job.attempts >= MAX_ATTEMPTS:
                _fail(run, job, "AGENT_ATTEMPTS_EXHAUSTED")
                db.commit()
                continue
            token = str(uuid4())
            changed = (
                db.query(AgentJob)
                .filter(AgentJob.run_id == candidate_id, _available(now))
                .update(
                    {
                        "status": "running",
                        "lease_token": token,
                        "lease_until": now + timedelta(seconds=LEASE_SECONDS),
                        "attempts": AgentJob.attempts + 1,
                    },
                    synchronize_session=False,
                )
            )
            event = deepcopy(job.event_json)
            db.commit()
            if changed:
                return {"run_id": candidate_id, "user_id": user_id, "token": token, "event": event}
    return None


def guard_claim(db, claim, *, now=None):
    # A write lock also prevents takeover between validation and transaction commit.
    query = (
        db.query(AgentJob)
        .populate_existing()
        .filter(
            AgentJob.run_id == claim["run_id"],
            AgentJob.user_id == claim["user_id"],
            AgentJob.status == "running",
            AgentJob.lease_token == claim["token"],
            AgentJob.lease_until > (now or utcnow()),
        )
    )
    # A no-op conditional write also fences SQLite's deferred transactions.
    if query.update({"lease_token": AgentJob.lease_token}, synchronize_session=False) != 1:
        raise conflict("AGENT_LEASE_LOST", "流程执行归属已变化")
    return query.first()


def heartbeat(factory, claim, *, now=None):
    now = now or utcnow()
    with factory() as db:
        run = _claimed_run(db, claim)
        if run is None:
            return False
        if run.status == "cancelled":
            return False
        try:
            job = guard_claim(db, claim, now=now)
        except ApiError:
            return False
        job.lease_until = now + timedelta(seconds=LEASE_SECONDS)
        db.commit()
        return True


def _fail(run, job, code):
    job.status = "failed"
    job.error_code = code
    job.lease_token = job.lease_until = None
    state = deepcopy(run.state_json or {})
    state["resume_status"] = run.status
    state["processing_stage"] = state.get("processing_stage") or "resume"
    state["processing"] = False
    run.status, run.error_code, run.retryable = "failed", code, True
    run.state_json = state
    run.version += 1


def finish_job(factory, claim, *, error_code=None, stopped=False, now=None):
    now = now or utcnow()
    with factory() as db:
        run = _claimed_run(db, claim)
        if run is None:
            return False
        try:
            job = guard_claim(db, claim, now=now)
        except ApiError:
            return False
        interrupt_attempts(
            db,
            run_id=run.id,
            token=claim["token"],
            code=error_code or "AGENT_EXECUTION_INTERRUPTED",
        )
        if run.status in {"cancelled", "completed", "failed"}:
            job.status = run.status
        elif stopped or error_code:
            if job.attempts >= MAX_ATTEMPTS and not stopped:
                _fail(run, job, error_code or "AGENT_ATTEMPTS_EXHAUSTED")
            else:
                job.status = "queued"
                job.available_at = now + timedelta(seconds=0 if stopped else 2**job.attempts)
                job.error_code = error_code
                if stopped:
                    job.attempts = max(0, job.attempts - 1)
        else:
            job.status = "waiting"
        job.lease_token = job.lease_until = None
        db.commit()
        return True


def cancel_job(db, run):
    interrupt_attempts(db, run_id=run.id, code="AGENT_CANCELLED")
    job = db.query(AgentJob).filter_by(run_id=run.id).with_for_update().first()
    if job is not None:
        job.status = "cancelled"
        job.lease_token = job.lease_until = None


def fail_claim(factory, claim, *, code, retryable):
    with factory() as db:
        run = _claimed_run(db, claim)
        if run is None:
            return False
        try:
            job = guard_claim(db, claim)
        except ApiError:
            return False
        interrupt_attempts(db, run_id=run.id, token=claim["token"], code=code)
        _fail(run, job, code)
        run.retryable = retryable
        db.commit()
        return True
