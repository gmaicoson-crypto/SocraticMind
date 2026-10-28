"""Run actual spawned workers against isolated SQLite; only model output is replaced."""

import multiprocessing
import time

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from models import AgentJob, AgentRun, AgentStepAttempt
from services.agent.job_execution import execute_claim
from services.agent.orchestrator import start_onboarding, cancel_run
from services.agent.worker import AgentWorker
from tests.p0.test_agent_orchestrator import FakeGenerator, onboarding_request


def controlled_child(database_url, claim):
    engine = create_engine(database_url)
    try:
        execute_claim(
            sessionmaker(bind=engine, expire_on_commit=False), claim, generator=FakeGenerator()
        )
    finally:
        engine.dispose()


def blocked_child(database_url, claim):
    engine = create_engine(database_url)
    factory = sessionmaker(bind=engine, expire_on_commit=False)

    def blocked(schema, messages, context):
        with factory() as db:
            db.get(AgentJob, claim["run_id"]).error_code = "TEST_MODEL_STARTED"
            db.commit()
        time.sleep(30)
        return FakeGenerator()(schema, messages, context)

    try:
        execute_claim(factory, claim, generator=blocked)
    finally:
        engine.dispose()


def wait_for(factory, run_id, predicate):
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        with factory() as db:
            if predicate(db.get(AgentRun, run_id), db.get(AgentJob, run_id)):
                return
        time.sleep(0.05)
    raise AssertionError("worker did not reach expected durable state")


def test_spawned_worker_executes_real_graph_and_stops_cleanly(db_session, auth_user):
    run = start_onboarding(
        db_session, user_id=auth_user.id, request=onboarding_request(False), deferred=True
    )
    run_id = run.id
    db_session.commit()
    factory = sessionmaker(bind=db_session.get_bind())
    worker = AgentWorker(str(db_session.get_bind().url), target=controlled_child)
    worker.start()
    try:
        wait_for(
            factory,
            run_id,
            lambda run, job: run.status == "awaiting_confirmation" and job.status == "waiting",
        )
    finally:
        worker.stop()
    assert not worker._thread.is_alive()
    assert not any(child.name == "agent-execution" for child in multiprocessing.active_children())


def test_shutdown_terminates_blocked_model_and_requeues_command(db_session, auth_user):
    run = start_onboarding(
        db_session, user_id=auth_user.id, request=onboarding_request(False), deferred=True
    )
    run_id = run.id
    db_session.commit()
    factory = sessionmaker(bind=db_session.get_bind())
    worker = AgentWorker(str(db_session.get_bind().url), target=blocked_child)
    worker.start()
    try:
        wait_for(factory, run_id, lambda run, job: job.error_code == "TEST_MODEL_STARTED")
    finally:
        worker.stop()
    with factory() as db:
        assert db.get(AgentJob, run_id).status == "queued"
        assert db.get(AgentJob, run_id).attempts == 0
        assert "graph_draft" not in db.get(AgentRun, run_id).state_json
        attempt = db.query(AgentStepAttempt).filter_by(run_id=run_id).one()
        assert attempt.status == "interrupted" and not attempt.usage_known
        assert attempt.latency_ms > 0 and attempt.attempts == 1
    assert not any(child.name == "agent-execution" for child in multiprocessing.active_children())


def test_cancel_terminates_inflight_model_without_resurrection(db_session, auth_user):
    user_id = auth_user.id
    run = start_onboarding(
        db_session, user_id=user_id, request=onboarding_request(False), deferred=True
    )
    run_id = run.id
    db_session.commit()
    factory = sessionmaker(bind=db_session.get_bind())
    worker = AgentWorker(str(db_session.get_bind().url), target=blocked_child)
    worker.start()
    try:
        wait_for(factory, run_id, lambda run, job: job.error_code == "TEST_MODEL_STARTED")
        with factory() as db:
            cancel_run(db, user_id=user_id, run_id=run_id)
        deadline = time.monotonic() + 5
        while multiprocessing.active_children() and time.monotonic() < deadline:
            time.sleep(0.05)
        assert not any(
            child.name == "agent-execution" for child in multiprocessing.active_children()
        )
        with factory() as db:
            assert db.get(AgentRun, run_id).status == db.get(AgentJob, run_id).status == "cancelled"
            attempt = db.query(AgentStepAttempt).filter_by(run_id=run_id).one()
            assert attempt.status == "interrupted" and attempt.error_code == "AGENT_CANCELLED"
    finally:
        worker.stop()
