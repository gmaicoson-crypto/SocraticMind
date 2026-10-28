"""Real structured attempts, accounting, limits and caller-scoped inspection."""

import json
from functools import partial

import pytest
from alembic import command
from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import sessionmaker

from core.deps import get_current_user
from core.errors import ApiError
from models import AgentRun, AgentStepAttempt, User
from services.agent.orchestrator import start_onboarding, retry_run
from services.agent.structured_ai import generate_structured, StructuredAIError
from services.agent import observability
from services.reviews import answer_review
from tests.p0.test_agent_orchestrator import onboarding_request, FakeGenerator
from tests.p0.test_migrations import alembic_config
from tests.p0.test_review_loop import wrong_assessment, request, ReviewGenerator
from tests.p0.test_structured_ai import client_with, response, questions_payload


def start(db, user, *responses):
    upstream, calls = client_with(*responses)
    run = start_onboarding(
        db,
        user_id=user.id,
        request=onboarding_request(),
        generator=partial(generate_structured, client=upstream),
    )
    return run, calls


def test_repair_keeps_failed_attempt_and_all_tokens_without_prompt_storage(
    db_session, auth_user, client
):
    run, calls = start(
        db_session,
        auth_user,
        response("sensitive invalid response", 7),
        response(json.dumps(questions_payload()), 11),
    )
    row = db_session.query(AgentStepAttempt).one()
    assert run.status == "diagnosing" and len(calls) == 2
    assert row.status == "succeeded" and row.attempts == 2
    assert row.reported_tokens == 18 and row.usage_known
    assert [item["status"] for item in row.calls_json] == ["failed", "succeeded"]
    assert row.calls_json[0]["error_code"] == "STRUCTURED_OUTPUT_INVALID"
    payload = client.get(f"/api/agent/runs/{run.id}/attempts").json()
    assert payload["items"][0]["tokens"] == 18
    assert payload["items"][0]["input_version"] < run.version
    assert "sensitive" not in json.dumps(payload) and "lease_token" not in json.dumps(payload)


@pytest.mark.parametrize("kind", ["invalid", "timeout_after_repair", "output_limit"])
def test_failed_attempts_keep_reported_usage_and_unknown_remainder(db_session, auth_user, kind):
    if kind == "invalid":
        replies, expected, known, count = [response("bad", 5), response("bad", 9)], 14, True, 2
    elif kind == "timeout_after_repair":
        replies, expected, known, count = (
            [response("bad", 5), TimeoutError("secret upstream")],
            5,
            False,
            2,
        )
    else:
        limited = response(json.dumps(questions_payload()), 12)
        limited.choices[0].finish_reason = "length"
        replies, expected, known, count = [limited], 12, True, 1
    run, calls = start(db_session, auth_user, *replies)
    row = db_session.query(AgentStepAttempt).one()
    assert run.status == row.status == "failed"
    assert row.reported_tokens == expected and row.usage_known is known
    assert row.attempts == len(calls) == count
    assert row.error_code == run.error_code
    if not known:
        item = observability.list_attempts(db_session, user_id=auth_user.id, run_id=run.id)[
            "items"
        ][0]
        assert item["tokens"] is None and item["reported_tokens"] == 5


def test_missing_usage_is_not_reported_as_zero_cost(db_session, auth_user, client):
    reply = response(json.dumps(questions_payload()))
    reply.usage = None
    run, _ = start(db_session, auth_user, reply)
    item = client.get(f"/api/agent/runs/{run.id}/attempts").json()["items"][0]
    assert item["status"] == "succeeded"
    assert item["tokens"] is None and item["usage_known"] is False
    assert item["calls"][0]["tokens"] is None


def test_retry_is_counted_and_attempt_listing_is_paginated_and_owned(
    app, client, db_session, auth_user
):
    run, _ = start(db_session, auth_user, response("bad"), response("bad"))
    run = retry_run(db_session, user_id=auth_user.id, run_id=run.id, generator=FakeGenerator())
    path = f"/api/agent/runs/{run.id}/attempts"
    first = client.get(path, params={"limit": 1}).json()
    second = client.get(path, params={"limit": 1, "after_id": first["next_after_id"]}).json()
    assert first["items"][0]["status"] == "failed"
    assert second["items"][0]["status"] == "succeeded" and second["next_after_id"] is None
    assert first["items"][0]["input_version"] < second["items"][0]["input_version"]
    assert client.get(path, params={"limit": 101}).status_code == 422
    other = User(username="metrics-other", email="metrics@example.test", hashed_password="x")
    db_session.add(other)
    db_session.commit()
    app.dependency_overrides[get_current_user] = lambda: other
    assert client.get(path).status_code == 404


def test_run_budget_blocks_further_models_even_after_manual_retry(
    db_session, auth_user, monkeypatch
):
    monkeypatch.setattr(observability, "MAX_RUN_STEPS", 1)
    run, _ = start(db_session, auth_user, response("bad"), response("bad"))
    generator = FakeGenerator()
    run = retry_run(db_session, user_id=auth_user.id, run_id=run.id, generator=generator)
    assert run.status == "failed" and run.error_code == "AGENT_MODEL_BUDGET_EXHAUSTED"
    assert not run.retryable and generator.calls == []
    assert db_session.query(AgentStepAttempt).count() == 1


def test_review_failure_budget_is_version_scoped_and_metrics_are_visible(
    client, db_session, auth_user
):
    _, _, review = wrong_assessment(db_session, auth_user)
    calls = []

    def failing(*args):
        calls.append(1)
        raise StructuredAIError("AI_TIMEOUT", "timeout", retryable=True)

    for index in range(3):
        with pytest.raises(ApiError) as error:
            answer_review(
                db_session,
                user_id=auth_user.id,
                review_id=review.id,
                request=request(),
                model_id="default",
                generator=failing,
            )
        assert error.value.code == "AI_TIMEOUT"
    with pytest.raises(ApiError) as error:
        answer_review(
            db_session,
            user_id=auth_user.id,
            review_id=review.id,
            request=request(),
            model_id="default",
            generator=ReviewGenerator(),
        )
    assert error.value.code == "AGENT_MODEL_BUDGET_EXHAUSTED" and len(calls) == 3
    payload = client.get(f"/api/plans/reviews/{review.id}/attempts").json()
    assert len(payload["items"]) == 3
    assert all(item["tokens"] is None and item["status"] == "failed" for item in payload["items"])


def test_migration_adds_accounting_without_changing_saved_run(tmp_path):
    url = f"sqlite:///{tmp_path / 'metrics.sqlite'}"
    config = alembic_config(url)
    command.upgrade(config, "0019_agent_jobs")
    engine = create_engine(url)
    factory = sessionmaker(bind=engine)
    with factory() as db:
        user = User(username="metrics-old", email="metrics-old@example.test", hashed_password="x")
        db.add(user)
        db.flush()
        db.add(
            AgentRun(
                id="old-run",
                user_id=user.id,
                run_type="onboarding",
                status="diagnosing",
                state_json={"questions": [{"prompt": "saved question"}]},
                version=7,
            )
        )
        db.commit()
    command.upgrade(config, "head")
    with factory() as db:
        run = db.get(AgentRun, "old-run")
        assert run.version == 7 and run.state_json["questions"][0]["prompt"] == "saved question"
        assert db.query(AgentStepAttempt).count() == 0
    command.downgrade(config, "0019_agent_jobs")
    assert "agent_step_attempts" not in inspect(engine).get_table_names()
    with factory() as db:
        assert db.get(AgentRun, "old-run").version == 7
    engine.dispose()


def test_cancellation_during_provider_call_cannot_rewrite_interrupted_metrics(
    db_session, auth_user
):
    from services.agent.orchestrator import cancel_run

    def generator(schema, messages, context):
        upstream, _ = client_with(response(json.dumps(questions_payload()), 15))
        original = upstream.chat.completions.create

        def cancel_then_respond(**kwargs):
            cancel_run(db_session, user_id=auth_user.id, run_id=context.run_id)
            return original(**kwargs)

        upstream.chat.completions.create = cancel_then_respond
        return generate_structured(schema, messages, context, client=upstream)

    with pytest.raises(ApiError) as error:
        start_onboarding(
            db_session, user_id=auth_user.id, request=onboarding_request(), generator=generator
        )
    assert error.value.code == "AGENT_LEASE_LOST"
    row = db_session.query(AgentStepAttempt).one()
    assert row.status == "interrupted" and row.error_code == "AGENT_CANCELLED"
    assert row.usage_known is False
    assert row.calls_json[0]["status"] == "interrupted"
    assert db_session.query(AgentRun).one().status == "cancelled"


def test_review_metrics_are_private_to_owner(app, client, db_session, auth_user):
    _, _, review = wrong_assessment(db_session, auth_user)
    answer_review(
        db_session,
        user_id=auth_user.id,
        review_id=review.id,
        request=request(),
        model_id="default",
        generator=ReviewGenerator(),
    )
    path = f"/api/plans/reviews/{review.id}/attempts"
    assert len(client.get(path).json()["items"]) == 1
    other = User(
        username="review-metrics", email="review-metrics@example.test", hashed_password="x"
    )
    db_session.add(other)
    db_session.commit()
    app.dependency_overrides[get_current_user] = lambda: other
    assert client.get(path).status_code == 404
