"""Schedule edits reuse reviewed content; semantic edits invalidate model results."""

from copy import deepcopy

import pytest

from schemas.structured_ai import DiagnosticScore, PersonalizedGraphDraft
from services.agent.orchestrator import start_onboarding, update_run_parameters
from tests.p0.test_agent_orchestrator import FakeGenerator, answer_current, onboarding_request


@pytest.mark.parametrize(
    "updates", [{"daily_minutes": 60}, {"timezone": "Asia/Shanghai"}, {"target_date": "2030-12-31"}]
)
def test_schedule_edits_preserve_graph_and_usage(db_session, auth_user, updates):
    generator = FakeGenerator()
    run = start_onboarding(
        db_session, user_id=auth_user.id, request=onboarding_request(False), generator=generator
    )
    nodes = deepcopy(run.state_json["preview"]["nodes"])
    usage = run.token_usage
    call_count = len(generator.calls)

    run = update_run_parameters(
        db_session, user_id=auth_user.id, run_id=run.id, updates=updates, generator=generator
    )

    assert run.status == "awaiting_confirmation"
    assert run.state_json["preview"]["nodes"] == nodes
    assert run.token_usage == usage
    assert len(generator.calls) == call_count
    for key, value in updates.items():
        assert run.state_json["params"][key] == value
    if "daily_minutes" in updates:
        assert (
            len({item["scheduled_date"] for item in run.state_json["preview"]["plan_items"]}) == 2
        )


def test_existing_preview_without_cache_can_be_rescheduled(db_session, auth_user):
    generator = FakeGenerator()
    run = start_onboarding(
        db_session, user_id=auth_user.id, request=onboarding_request(False), generator=generator
    )
    state = deepcopy(run.state_json)
    state.pop("graph_draft")
    run.state_json = state
    db_session.commit()

    run = update_run_parameters(
        db_session,
        user_id=auth_user.id,
        run_id=run.id,
        updates={"daily_minutes": 45},
        generator=generator,
    )
    assert run.state_json["preview"]["nodes"] == state["preview"]["nodes"]
    assert len(generator.calls) == 1


def test_goal_change_recomputes_diagnosis_and_graph(db_session, auth_user):
    generator = FakeGenerator()
    run = start_onboarding(
        db_session, user_id=auth_user.id, request=onboarding_request(), generator=generator
    )
    for index in range(3):
        run = answer_current(db_session, auth_user.id, run, f"answer {index}", generator)
    generator.calls.clear()

    run = update_run_parameters(
        db_session,
        user_id=auth_user.id,
        run_id=run.id,
        updates={"goal": "Prove linear independence"},
        generator=generator,
    )
    assert [schema for schema, *_ in generator.calls] == [DiagnosticScore, PersonalizedGraphDraft]
    assert run.state_json["preview"]["goal"] == "Prove linear independence"


def test_unchanged_update_keeps_version_and_avoids_model_calls(db_session, auth_user):
    generator = FakeGenerator()
    run = start_onboarding(
        db_session, user_id=auth_user.id, request=onboarding_request(False), generator=generator
    )
    version = run.version
    run = update_run_parameters(
        db_session,
        user_id=auth_user.id,
        run_id=run.id,
        updates={"daily_minutes": 30},
        generator=generator,
    )
    assert run.version == version
    assert len(generator.calls) == 1


def test_explicit_regeneration_is_versioned_and_idempotent(db_session, auth_user):
    from core.errors import ApiError

    generator = FakeGenerator()
    run = start_onboarding(
        db_session, user_id=auth_user.id, request=onboarding_request(), generator=generator
    )
    for index in range(3):
        run = answer_current(db_session, auth_user.id, run, f"answer {index}", generator)
    diagnosis = deepcopy(run.state_json["diagnostic_result"])
    updates = {"regenerate": True, "request_id": "regenerate-once", "version": run.version}
    generator.calls.clear()
    run = update_run_parameters(
        db_session, user_id=auth_user.id, run_id=run.id, updates=updates, generator=generator
    )
    assert [schema for schema, *_ in generator.calls] == [PersonalizedGraphDraft]
    assert run.state_json["diagnostic_result"] == diagnosis
    assert not {"regenerate", "request_id", "version"} & run.state_json["params"].keys()
    version = run.version
    run = update_run_parameters(
        db_session, user_id=auth_user.id, run_id=run.id, updates=updates, generator=generator
    )
    assert run.version == version and len(generator.calls) == 1
    with pytest.raises(ApiError) as error:
        update_run_parameters(
            db_session,
            user_id=auth_user.id,
            run_id=run.id,
            updates={**updates, "goal": "different"},
            generator=generator,
        )
    assert error.value.code == "IDEMPOTENCY_CONFLICT"
    with pytest.raises(ApiError) as error:
        update_run_parameters(
            db_session,
            user_id=auth_user.id,
            run_id=run.id,
            updates={**updates, "request_id": "late-old-version"},
            generator=generator,
        )
    assert error.value.code == "AGENT_STATE_CONFLICT"
    assert len(generator.calls) == 1


def test_regeneration_requires_intent_and_version(client):
    response = client.patch("/api/agent/runs/irrelevant", json={"regenerate": True})
    assert response.status_code == 422


@pytest.mark.parametrize("field", ["goal", "daily_minutes", "timezone"])
def test_invalid_null_update_is_rejected_before_enqueue(client, field):
    response = client.patch("/api/agent/runs/irrelevant", json={field: None})
    assert response.status_code == 422


def test_target_date_can_be_cleared():
    from schemas.agent import RunUpdateRequest

    assert RunUpdateRequest(target_date=None).model_dump(exclude_unset=True) == {
        "target_date": None
    }
