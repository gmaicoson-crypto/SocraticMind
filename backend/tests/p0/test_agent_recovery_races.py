"""Crash/retry and cancellation interleavings at durable task boundaries."""

from datetime import timedelta

import pytest
from sqlalchemy.orm import Query, sessionmaker

from models import AgentJob, AgentRun, AgentStepAttempt
from services.agent import job_execution, jobs, workflow
from services.agent.job_execution import execute_claim
from services.agent.orchestrator import cancel_run, retry_run, start_onboarding
from services.agent.presentation import serialize_run
from services.agent.structured_ai import StructuredAIError
from services.attachments.service import utcnow
from tests.p0.test_agent_orchestrator import FakeGenerator, onboarding_request


@pytest.mark.parametrize("stage", ["_generate_questions", "_generate_schedule"])
def test_retry_after_committed_waiting_result_exposes_input(
    db_session, auth_user, monkeypatch, stage
):
    user_id = auth_user.id
    run = start_onboarding(
        db_session,
        user_id=user_id,
        request=onboarding_request(stage == "_generate_questions"),
        deferred=True,
    )
    run_id = run.id
    db_session.commit()
    factory = sessionmaker(bind=db_session.get_bind(), expire_on_commit=False)
    generator = FakeGenerator()
    original = getattr(workflow, stage)

    def crash(*args):
        original(*args)
        raise RuntimeError("lost worker after committed result")

    monkeypatch.setattr(workflow, stage, crash)
    monkeypatch.setattr(jobs, "MAX_ATTEMPTS", 1)
    claim = jobs.claim_job(factory)
    with pytest.raises(RuntimeError, match="lost worker"):
        execute_claim(factory, claim, generator=generator)
    assert jobs.finish_job(factory, claim, error_code="AGENT_EXECUTION_FAILED")
    with factory() as db:
        assert db.get(AgentRun, run_id).status == "failed"
    monkeypatch.setattr(workflow, stage, original)
    calls = len(generator.calls)
    with factory() as db:
        restored = retry_run(db, user_id=user_id, run_id=run_id, generator=generator)
        response = serialize_run(restored, db=db)
        assert response.processing is False
        assert (
            response.step is not None
            if stage == "_generate_questions"
            else response.preview is not None
        )
        assert db.get(AgentJob, run_id).status == "waiting"
    assert len(generator.calls) == calls


@pytest.mark.parametrize("interleave", ["cancel", "renew"])
@pytest.mark.parametrize("attempts", [1, jobs.MAX_ATTEMPTS])
@pytest.mark.parametrize("run_status", ["drafting", "failed"])
def test_expired_candidate_cannot_fail_after_cancellation_or_renewal(
    db_session, auth_user, monkeypatch, interleave, attempts, run_status
):
    user_id = auth_user.id
    run = start_onboarding(
        db_session,
        user_id=user_id,
        request=onboarding_request(False),
        deferred=True,
    )
    run_id = run.id
    db_session.commit()
    factory = sessionmaker(bind=db_session.get_bind(), expire_on_commit=False)
    claim = jobs.claim_job(factory)
    now = utcnow()
    with factory() as db:
        db.get(AgentRun, run_id).status = run_status
        job = db.get(AgentJob, run_id)
        job.attempts = attempts
        job.lease_until = now - timedelta(seconds=1)
        db.add(
            AgentStepAttempt(
                user_id=user_id,
                run_id=run_id,
                input_version=0,
                step="graph_draft",
                lease_token=claim["token"],
                status="running",
            )
        )
        db.commit()
    first = Query.first
    armed = True

    def change_after_read(query):
        nonlocal armed
        row = first(query)
        if armed and isinstance(row, AgentJob) and query._for_update_arg is not None:
            armed = False
            with factory() as other:
                if interleave == "cancel":
                    cancel_run(other, user_id=user_id, run_id=run_id)
                else:
                    # Renewal began before expiry but commits after candidate selection.
                    assert jobs.heartbeat(factory, claim, now=now - timedelta(seconds=2))
        return row

    monkeypatch.setattr(Query, "first", change_after_read)
    assert jobs.claim_job(factory, now=now) is None
    assert not armed
    with factory() as db:
        run, job = db.get(AgentRun, run_id), db.get(AgentJob, run_id)
        if interleave == "cancel":
            assert run.status == job.status == "cancelled"
            assert not jobs.heartbeat(factory, claim)
        else:
            assert run.status == run_status and job.status == "running"
            assert job.lease_token == claim["token"]
            assert db.query(AgentStepAttempt).one().status == "running"


def test_terminal_failure_survives_lost_job_acknowledgement(db_session, auth_user, monkeypatch):
    run = start_onboarding(
        db_session,
        user_id=auth_user.id,
        request=onboarding_request(False),
        deferred=True,
    )
    run_id = run.id
    db_session.commit()
    factory = sessionmaker(bind=db_session.get_bind(), expire_on_commit=False)
    claim = jobs.claim_job(factory)

    def fail_model(*_args):
        raise StructuredAIError("PERMANENT_MODEL_ERROR", "unavailable", retryable=False)

    def crash_before_ack(*_args, **_kwargs):
        raise RuntimeError("lost job acknowledgement")

    monkeypatch.setattr(job_execution, "finish_job", crash_before_ack)
    with pytest.raises(RuntimeError, match="lost job acknowledgement"):
        execute_claim(factory, claim, generator=fail_model)
    with factory() as db:
        failed = db.get(AgentRun, run_id)
        before = (failed.version, failed.error_code, failed.retryable, failed.state_json)
        job = db.get(AgentJob, run_id)
        job.attempts = jobs.MAX_ATTEMPTS
        job.lease_until = utcnow() - timedelta(seconds=1)
        db.commit()
    assert jobs.claim_job(factory) is None
    with factory() as db:
        failed = db.get(AgentRun, run_id)
        assert (failed.version, failed.error_code, failed.retryable, failed.state_json) == before
        assert failed.status == db.get(AgentJob, run_id).status == "failed"
