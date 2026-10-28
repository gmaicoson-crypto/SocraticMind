"""Queue acceptance, replica fencing and concurrency against separate DB connections."""

from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Barrier

import pytest
from sqlalchemy.orm import sessionmaker

from core.errors import ApiError
from models import AgentCheckpoint, AgentJob, AgentRun, StudyPlan, User
from services.agent.job_execution import execute_claim
from services.agent.job_recovery import recover_legacy_runs
from services.agent.jobs import claim_job, finish_job, heartbeat
from services.agent.orchestrator import (
    cancel_run,
    confirm_run,
    start_onboarding,
    submit_answer,
    update_run_parameters,
)
from services.attachments.service import utcnow
from tests.p0.test_agent_orchestrator import FakeGenerator, onboarding_request


def factory_for(db):
    db.commit()
    return sessionmaker(bind=db.get_bind(), expire_on_commit=False, autoflush=False)


def test_creation_returns_before_model_and_same_request_has_one_durable_job(client, db_session):
    payload = onboarding_request(False).model_dump(mode="json")
    payload["request_id"] = "create-once"
    first = client.post("/api/agent/onboarding", json=payload)
    assert first.status_code == 201
    body = first.json()
    assert body["processing"] and body["stage"] == "queued" and body["preview"] is None
    second = client.post("/api/agent/onboarding", json=payload)
    assert second.json() == body
    assert db_session.query(AgentRun).count() == db_session.query(AgentJob).count() == 1
    changed = client.post("/api/agent/onboarding", json={**payload, "goal": "Different"})
    assert changed.status_code == 409 and changed.json()["code"] == "IDEMPOTENCY_CONFLICT"
    recovered = client.get("/api/agent/runs/active", params={"session_id": "session-1"}).json()
    assert recovered == [body]
    assert (
        client.get("/api/agent/runs/active", params={"session_id": "another-session"}).json() == []
    )


def test_expired_worker_cannot_publish_model_or_checkpoint_after_takeover(db_session, auth_user):
    user_id = auth_user.id
    run = start_onboarding(
        db_session, user_id=user_id, request=onboarding_request(False), deferred=True
    )
    run_id = run.id
    factory = factory_for(db_session)
    old = claim_job(factory, run_id=run_id)
    replacement = None
    checkpoints = None

    def lose_lease(schema, messages, context):
        nonlocal replacement, checkpoints
        with factory() as db:
            job = db.get(AgentJob, run_id)
            job.lease_until = utcnow() - timedelta(seconds=1)
            db.commit()
            checkpoints = db.query(AgentCheckpoint).count()
        replacement = claim_job(factory, run_id=run_id)
        return FakeGenerator()(schema, messages, context)

    execute_claim(factory, old, generator=lose_lease)
    with factory() as db:
        assert db.get(AgentRun, run_id).state_json.get("graph_draft") is None
        assert db.query(AgentCheckpoint).count() == checkpoints
        assert db.get(AgentJob, run_id).lease_token == replacement["token"]
    assert not heartbeat(factory, old)
    assert not finish_job(factory, old, error_code="late")
    execute_claim(factory, replacement, generator=FakeGenerator())
    with factory() as db:
        assert db.get(AgentRun, run_id).status == "awaiting_confirmation"
        assert db.get(AgentJob, run_id).status == "waiting"


def test_cancellation_during_model_call_invalidates_all_late_writes(db_session, auth_user):
    user_id = auth_user.id
    run = start_onboarding(
        db_session, user_id=user_id, request=onboarding_request(False), deferred=True
    )
    run_id = run.id
    factory = factory_for(db_session)
    claim = claim_job(factory)

    def cancelled(schema, messages, context):
        with factory() as db:
            cancel_run(db, user_id=user_id, run_id=run_id)
        return FakeGenerator()(schema, messages, context)

    execute_claim(factory, claim, generator=cancelled)
    with factory() as db:
        run = db.get(AgentRun, run_id)
        assert run.status == "cancelled" and "graph_draft" not in run.state_json
        assert db.get(AgentJob, run_id).status == "cancelled"
        assert db.query(StudyPlan).count() == 0


def test_only_one_concurrent_answer_is_accepted(db_session, auth_user):
    user_id = auth_user.id
    run = start_onboarding(
        db_session, user_id=user_id, request=onboarding_request(), generator=FakeGenerator()
    )
    run_id, version, step_id = run.id, run.version, run.state_json["step_id"]
    factory = factory_for(db_session)
    barrier = Barrier(2)

    def answer(text):
        with factory() as db:
            barrier.wait(timeout=5)
            try:
                submit_answer(
                    db,
                    user_id=user_id,
                    run_id=run_id,
                    step_id=step_id,
                    version=version,
                    answer=text,
                    deferred=True,
                )
                return "accepted"
            except ApiError as error:
                return error.status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(answer, ["first", "second"]))
    assert results.count("accepted") == results.count(409) == 1
    with factory() as db:
        assert len(db.get(AgentRun, run_id).state_json["answers"]) == 1


def test_stale_confirmation_is_rejected_and_repeated_acceptance_has_one_job(db_session, auth_user):
    user_id = auth_user.id
    run = start_onboarding(
        db_session, user_id=user_id, request=onboarding_request(False), generator=FakeGenerator()
    )
    old_version = run.version
    run = update_run_parameters(
        db_session, user_id=user_id, run_id=run.id, updates={"daily_minutes": 60}
    )
    with pytest.raises(ApiError) as error:
        confirm_run(
            db_session,
            user_id=user_id,
            run_id=run.id,
            request_id="stale",
            version=old_version,
            deferred=True,
        )
    assert error.value.code == "AGENT_STATE_CONFLICT"
    version = run.version
    accepted = confirm_run(
        db_session,
        user_id=user_id,
        run_id=run.id,
        request_id="correct",
        version=version,
        deferred=True,
    )
    repeated = confirm_run(
        db_session,
        user_id=user_id,
        run_id=run.id,
        request_id="correct",
        version=version,
        deferred=True,
    )
    assert accepted.version == repeated.version
    factory = factory_for(db_session)
    execute_claim(factory, claim_job(factory, run_id=run.id))
    assert db_session.query(StudyPlan).count() == 1


def test_crashed_jobs_have_bounded_retries_and_shutdown_does_not_consume_attempt(
    db_session, auth_user
):
    run = start_onboarding(
        db_session, user_id=auth_user.id, request=onboarding_request(False), deferred=True
    )
    run_id = run.id
    factory = factory_for(db_session)
    now = utcnow()
    first = claim_job(factory, now=now)
    finish_job(factory, first, stopped=True, now=now)
    with factory() as db:
        assert db.get(AgentJob, run_id).attempts == 0
    for attempt in range(3):
        now += timedelta(seconds=20)
        claim = claim_job(factory, now=now)
        assert claim
        finish_job(factory, claim, error_code="AGENT_JOB_TIMEOUT", now=now)
    assert claim_job(factory, now=now + timedelta(hours=1)) is None
    with factory() as db:
        assert db.get(AgentRun, run_id).status == "failed"
        assert db.get(AgentJob, run_id).attempts == 3


def test_pending_jobs_are_bounded_per_user_and_cancellation_releases_capacity(
    db_session, auth_user
):
    user_id = auth_user.id
    runs = [
        start_onboarding(
            db_session, user_id=user_id, request=onboarding_request(False), deferred=True
        )
        for _ in range(4)
    ]
    with pytest.raises(ApiError) as error:
        start_onboarding(
            db_session, user_id=user_id, request=onboarding_request(False), deferred=True
        )
    assert error.value.code == "AGENT_QUEUE_FULL"
    assert db_session.query(AgentRun).count() == 4
    cancel_run(db_session, user_id=user_id, run_id=runs[0].id)
    start_onboarding(db_session, user_id=user_id, request=onboarding_request(False), deferred=True)
    assert db_session.query(AgentJob).filter(AgentJob.status == "queued").count() == 4


def test_concurrent_create_and_confirm_are_idempotent(db_session, auth_user):
    user_id = auth_user.id
    factory = factory_for(db_session)
    request = onboarding_request(False).model_copy(update={"request_id": "race-create"})
    barrier = Barrier(2)

    def create(_):
        with factory() as db:
            barrier.wait(timeout=5)
            return start_onboarding(db, user_id=user_id, request=request, deferred=True).id

    with ThreadPoolExecutor(max_workers=2) as pool:
        ids = list(pool.map(create, range(2)))
    assert ids[0] == ids[1]
    execute_claim(factory, claim_job(factory, run_id=ids[0]), generator=FakeGenerator())
    with factory() as db:
        version = db.get(AgentRun, ids[0]).version
    barrier = Barrier(2)

    def confirm(number):
        with factory() as db:
            barrier.wait(timeout=5)
            try:
                confirm_run(
                    db,
                    user_id=user_id,
                    run_id=ids[0],
                    request_id=f"decision-{number}",
                    version=version,
                    deferred=True,
                )
                return "accepted"
            except ApiError as error:
                return error.status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(confirm, range(2)))
    assert results.count("accepted") == results.count(409) == 1
    execute_claim(factory, claim_job(factory, run_id=ids[0]))
    with factory() as db:
        assert db.query(AgentRun).count() == db.query(StudyPlan).count() == 1


def test_active_discovery_and_creation_keys_are_scoped_to_owner(client, db_session, auth_user):
    own = start_onboarding(
        db_session,
        user_id=auth_user.id,
        request=onboarding_request(False).model_copy(update={"request_id": "same-key"}),
        deferred=True,
    )
    own_id = own.id
    other = User(username="other-queue", email="other-queue@example.test", hashed_password="x")
    db_session.add(other)
    db_session.commit()
    start_onboarding(
        db_session,
        user_id=other.id,
        request=onboarding_request(False).model_copy(update={"request_id": "same-key"}),
        deferred=True,
    )
    response = client.get("/api/agent/runs/active", params={"session_id": "session-1"}).json()
    assert [run["run_id"] for run in response] == [own_id]


def test_old_interrupted_run_is_adopted_without_repeating_saved_questions(db_session, auth_user):
    run = start_onboarding(
        db_session, user_id=auth_user.id, request=onboarding_request(), generator=FakeGenerator()
    )
    run_id = run.id
    # Emulate an older deployment dying after committing questions but before
    # acknowledging the processing flag. The persisted questions are reusable.
    db_session.query(AgentJob).filter_by(run_id=run_id).delete()
    run.state_json = {**run.state_json, "processing": True}
    db_session.commit()
    factory = factory_for(db_session)
    recover_legacy_runs(factory)
    recover_legacy_runs(factory)
    generator = FakeGenerator()
    execute_claim(factory, claim_job(factory, run_id=run_id), generator=generator)
    assert generator.calls == []
    with factory() as db:
        from services.agent.presentation import serialize_run

        restored = db.get(AgentRun, run_id)
        assert restored.status == "diagnosing"
        assert db.get(AgentJob, run_id).status == "waiting"
        payload = serialize_run(restored, db=db)
        assert payload.processing is False and payload.step is not None
