import json
from datetime import datetime, timedelta, timezone
import pytest
from models import ChatSession
from services.chat_context import valid_summary
from services.chat_summaries import MAX_ATTEMPTS, run_one_summary_job, schedule_chat_summary
from summary_helpers import summary_environment, add_session, add_turns, summary_result


def test_failed_jobs_back_off_stop_after_three_attempts_and_new_turn_can_reschedule(
    db_session,
    auth_user,
    summary_environment,
):
    session = add_session(db_session, auth_user)
    add_turns(db_session, session)
    calls = []

    def failing(*_args):
        calls.append(True)
        raise RuntimeError("provider temporarily unavailable")

    for attempt in range(1, MAX_ATTEMPTS + 1):
        assert run_one_summary_job(summary_environment.factory, failing)
        db_session.refresh(session)
        assert session.summary_attempts == attempt
        assert session.summary_status == "failed"
        assert session.summary_next_retry_at.replace(tzinfo=timezone.utc) > datetime.now(
            timezone.utc
        )
        assert not run_one_summary_job(summary_environment.factory, failing)
        session.summary_next_retry_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        db_session.commit()
    assert not run_one_summary_job(summary_environment.factory, failing)
    assert len(calls) == MAX_ATTEMPTS
    schedule_chat_summary(db_session, session_id=session.id, model_id="summary-test")
    db_session.refresh(session)
    assert session.summary_status == "pending"
    assert session.summary_attempts == 0
    assert session.summary_next_retry_at is None


def test_running_job_waits_for_lease_and_recovers_after_process_restart(
    db_session,
    auth_user,
    summary_environment,
):
    session = add_session(db_session, auth_user, status="running")
    add_turns(db_session, session)
    session.summary_attempts = 1
    session.summary_lease_token = "terminated-process"
    session.summary_lease_until = datetime.now(timezone.utc) + timedelta(minutes=1)
    db_session.commit()
    generate = lambda _schema, messages, _context: summary_result(messages)
    assert not run_one_summary_job(summary_environment.factory, generate)
    session.summary_lease_until = datetime.now(timezone.utc) - timedelta(seconds=1)
    db_session.commit()
    assert run_one_summary_job(summary_environment.factory, generate)
    db_session.refresh(session)
    assert valid_summary(session)
    assert session.summary_lease_token is None


def test_repeated_process_crashes_exhaust_durable_retry_limit(
    db_session,
    auth_user,
    summary_environment,
):
    session = add_session(db_session, auth_user, status="running")
    add_turns(db_session, session)
    session.summary_attempts = MAX_ATTEMPTS
    session.summary_lease_token = "crashed-again"
    session.summary_lease_until = datetime.now(timezone.utc) - timedelta(seconds=1)
    db_session.commit()
    assert not run_one_summary_job(
        summary_environment.factory, lambda *_: pytest.fail("attempt limit exceeded")
    )
    db_session.refresh(session)
    assert session.summary_status == "failed"
    assert session.summary_lease_token is None
    assert session.summary_attempts == MAX_ATTEMPTS


def test_expired_worker_cannot_overwrite_reclaimed_workers_summary(
    db_session,
    auth_user,
    summary_environment,
):
    session = add_session(db_session, auth_user)
    add_turns(db_session, session)
    session_id = session.id

    def stale_generator(_schema, messages, _context):
        with summary_environment.factory() as db:
            db.query(ChatSession).filter_by(id=session_id).update(
                {"summary_lease_until": datetime.now(timezone.utc) - timedelta(seconds=1)}
            )
            db.commit()
        assert run_one_summary_job(
            summary_environment.factory,
            lambda _schema, msgs, _context: summary_result(msgs, goal="新工作进程结果"),
        )
        return summary_result(messages, goal="旧工作进程结果")

    assert run_one_summary_job(summary_environment.factory, stale_generator)
    db_session.refresh(session)
    assert session.summary_json["goal"] == "新工作进程结果"
    assert session.summary_version == 2


@pytest.mark.parametrize("status", ["pending", "failed"])
def test_scheduling_queued_work_updates_model_without_resetting_backoff(
    db_session,
    auth_user,
    status,
):
    session = add_session(db_session, auth_user, status=status)
    session.summary_model = "old-model"
    session.summary_attempts = 1
    session.summary_next_retry_at = datetime.now(timezone.utc) + timedelta(minutes=1)
    session.summary_lease_token = "existing-marker"
    db_session.commit()
    db_session.refresh(session)
    retry_at = session.summary_next_retry_at
    schedule_chat_summary(db_session, session_id=session.id, model_id="new-model")
    db_session.refresh(session)
    assert session.summary_model == "new-model"
    assert session.summary_attempts == 1
    assert session.summary_next_retry_at == retry_at
    assert session.summary_status == status
    assert session.summary_lease_token == "existing-marker"


def test_scheduling_running_work_keeps_claimed_model_snapshot(db_session, auth_user):
    session = add_session(db_session, auth_user, status="running")
    session.summary_model = "claimed-model"
    session.summary_attempts = 1
    session.summary_lease_token = "active-lease"
    db_session.commit()
    schedule_chat_summary(db_session, session_id=session.id, model_id="new-model")
    db_session.refresh(session)
    assert session.summary_model == "claimed-model"
    assert session.summary_status == "running"
    assert session.summary_lease_token == "active-lease"


def test_targeted_job_does_not_claim_or_reap_other_sessions(
    db_session, auth_user, summary_environment
):
    other = add_session(db_session, auth_user)
    add_turns(db_session, other)
    crashed = add_session(db_session, auth_user, status="running")
    crashed.summary_attempts = MAX_ATTEMPTS
    crashed.summary_lease_token = "unrelated-expired-lease"
    crashed.summary_lease_until = datetime.now(timezone.utc) - timedelta(seconds=1)
    target = add_session(db_session, auth_user)
    target_turns = add_turns(db_session, target)
    captured = []

    def generate(_schema, messages, context):
        captured.append(context.run_id)
        ids = {
            message_id
            for item in json.loads(messages[-1]["content"])["turns"]
            for message_id in item["message_ids"]
        }
        assert ids.issubset(
            {
                message_id
                for turn in target_turns
                for message_id in (turn.user_message_id, turn.ai_message_id)
            }
        )
        return summary_result(messages)

    assert run_one_summary_job(summary_environment.factory, generate, target_session_id=target.id)
    db_session.expire_all()
    assert captured == [f"chat-summary:{target.id}:1:1"]
    assert valid_summary(target)
    assert other.summary_status == "pending"
    assert other.summary_attempts == 0
    assert other.summary_json is None
    assert crashed.summary_status == "running"
    assert crashed.summary_lease_token == "unrelated-expired-lease"
    assert not run_one_summary_job(
        summary_environment.factory, generate, target_session_id=987654321
    )


@pytest.mark.parametrize("state", ["running", "failed", "exhausted"])
def test_force_does_not_bypass_live_lease_backoff_or_attempt_limit(
    db_session,
    auth_user,
    summary_environment,
    state,
):
    session = add_session(
        db_session, auth_user, status="running" if state == "running" else "failed"
    )
    add_turns(db_session, session)
    session.summary_attempts = MAX_ATTEMPTS if state == "exhausted" else 1
    if state == "running":
        session.summary_lease_token = "active-worker"
        session.summary_lease_until = datetime.now(timezone.utc) + timedelta(minutes=1)
    elif state == "failed":
        session.summary_next_retry_at = datetime.now(timezone.utc) + timedelta(minutes=1)
    db_session.commit()
    old_attempts = session.summary_attempts
    assert not run_one_summary_job(
        summary_environment.factory,
        lambda *_: pytest.fail("force bypassed claim constraints"),
        target_session_id=session.id,
        force=True,
    )
    db_session.refresh(session)
    assert session.summary_attempts == old_attempts
    assert session.summary_json is None
    if state == "running":
        assert session.summary_lease_token == "active-worker"
