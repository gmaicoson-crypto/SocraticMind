"""Exercise the compiled production graph, including lost checkpoint writes."""

from copy import deepcopy

import pytest
from sqlalchemy.orm import sessionmaker

from core.errors import ApiError
from models import AgentCheckpoint, AgentRun, Node, StudyPlan, Topic
from services.agent import workflow
from services.agent.checkpointer import SQLRunCheckpointer
from services.agent.orchestrator import (
    cancel_run,
    confirm_run,
    start_onboarding,
    update_run_parameters,
)
from tests.p0.test_agent_orchestrator import FakeGenerator, answer_current, onboarding_request


def compiled(db, run, user_id, generator=None):
    factory = sessionmaker(bind=db.get_bind(), expire_on_commit=False)
    run_id = run.id
    db.commit()
    return workflow.build_workflow(factory, run_id=run_id, user_id=user_id, generator=generator)


def test_actual_graph_pauses_separately_for_each_answer_and_confirmation(db_session, auth_user):
    generator = FakeGenerator()
    user_id = auth_user.id
    run = start_onboarding(
        db_session, user_id=user_id, request=onboarding_request(), generator=generator
    )
    config = {"configurable": {"thread_id": run.id}}
    graph = compiled(db_session, run, user_id, generator)
    for index in range(3):
        state = graph.get_state(config)
        assert state.next == ("await_answer",)
        pending = state.tasks[0].interrupts[0].value
        assert pending["kind"] == "answer"
        assert pending["step_id"] == f"diagnostic-question-{index + 1}"
        assert pending["version"] == run.version
        run = answer_current(db_session, user_id, run, f"answer {index}", generator)
    db_session.commit()
    state = graph.get_state(config)
    assert state.next == ("await_confirmation",)
    assert state.tasks[0].interrupts[0].value["kind"] == "confirmation"
    assert set(state.values) <= {"version", "stage", "command", "request_id"}
    assert db_session.query(AgentCheckpoint).count() > 5
    run = confirm_run(db_session, user_id=user_id, run_id=run.id, request_id="confirmed")
    db_session.commit()
    assert not graph.get_state(config).next
    assert run.status == "completed"


@pytest.mark.parametrize("stage", ["_generate_questions", "_generate_score", "_generate_graph"])
def test_committed_model_result_survives_crash_before_checkpoint(
    db_session, auth_user, monkeypatch, stage
):
    generator = FakeGenerator()
    original = getattr(workflow, stage)

    def crash_after_commit(*args):
        original(*args)
        raise RuntimeError("simulated process loss before checkpoint")

    monkeypatch.setattr(workflow, stage, crash_after_commit)
    user_id = auth_user.id
    if stage == "_generate_questions":
        with pytest.raises(RuntimeError, match="process loss"):
            start_onboarding(
                db_session, user_id=user_id, request=onboarding_request(), generator=generator
            )
        run = db_session.query(AgentRun).one()
    else:
        run = start_onboarding(
            db_session, user_id=user_id, request=onboarding_request(), generator=generator
        )
        run = answer_current(db_session, user_id, run, "one", generator)
        run = answer_current(db_session, user_id, run, "two", generator)
        with pytest.raises(RuntimeError, match="process loss"):
            answer_current(db_session, user_id, run, "three", generator)
    calls_before = [schema for schema, *_ in generator.calls]
    monkeypatch.setattr(workflow, stage, original)
    restored = workflow.execute_workflow(
        db_session, user_id=user_id, run_id=run.id, generator=generator
    )
    calls_after = [schema for schema, *_ in generator.calls]
    for schema in set(calls_before):
        assert calls_after.count(schema) == calls_before.count(schema)
    assert restored.status == (
        "diagnosing" if stage == "_generate_questions" else "awaiting_confirmation"
    )


def test_confirm_transaction_is_not_replayed_after_checkpoint_failure(
    db_session, auth_user, monkeypatch
):
    user_id = auth_user.id
    run = start_onboarding(
        db_session, user_id=user_id, request=onboarding_request(False), generator=FakeGenerator()
    )
    run_id = run.id
    original = workflow.persist_confirmation

    def crash(*args, **kwargs):
        original(*args, **kwargs)
        raise RuntimeError("lost confirmation checkpoint")

    monkeypatch.setattr(workflow, "persist_confirmation", crash)
    with pytest.raises(RuntimeError, match="lost confirmation"):
        confirm_run(db_session, user_id=user_id, run_id=run_id, request_id="confirm")
    monkeypatch.setattr(workflow, "persist_confirmation", original)
    graph = compiled(db_session, run, user_id)
    graph.invoke(None, {"configurable": {"thread_id": run_id}}, durability="sync")
    restored = confirm_run(db_session, user_id=user_id, run_id=run_id, request_id="confirm")
    assert restored.status == "completed"
    assert db_session.query(Topic).count() == 1
    assert db_session.query(Node).count() == 6
    assert db_session.query(StudyPlan).count() == 1


def test_paused_graph_parameter_edit_reuses_graph_and_cancel_prevents_late_publish(
    db_session, auth_user
):
    user_id = auth_user.id
    generator = FakeGenerator()
    run = start_onboarding(
        db_session, user_id=user_id, request=onboarding_request(False), generator=generator
    )
    nodes = deepcopy(run.state_json["preview"]["nodes"])
    run = update_run_parameters(
        db_session,
        user_id=user_id,
        run_id=run.id,
        updates={"daily_minutes": 60},
        generator=generator,
    )
    assert len(generator.calls) == 1 and run.state_json["preview"]["nodes"] == nodes
    run_id = run.id
    cancel_run(db_session, user_id=user_id, run_id=run_id)
    graph = compiled(db_session, run, user_id, generator)
    from langgraph.types import Command

    graph.invoke(
        Command(resume={"kind": "confirm", "request_id": "late"}),
        {"configurable": {"thread_id": run_id}},
        durability="sync",
    )
    assert db_session.query(Topic).count() == 0


def test_checkpoint_access_is_bound_to_authorized_run_and_user(db_session, auth_user):
    user_id = auth_user.id
    run = start_onboarding(
        db_session, user_id=user_id, request=onboarding_request(False), generator=FakeGenerator()
    )
    factory = sessionmaker(bind=db_session.get_bind())
    run_id = run.id
    db_session.commit()
    saver = SQLRunCheckpointer(factory, run_id=run_id, user_id=user_id)
    config = {"configurable": {"thread_id": run_id}}
    latest = saver.get_tuple(config)
    history = list(saver.list(config, limit=3))
    assert latest.config == history[0].config and len(history) == 3
    assert (
        list(saver.list(config, before=history[0].config, limit=1))[0].config == history[1].config
    )
    for denied, forbidden in [
        (saver, {"configurable": {"thread_id": "another-run"}}),
        (SQLRunCheckpointer(factory, run_id=run_id, user_id=user_id + 1), config),
    ]:
        with pytest.raises(ApiError) as error:
            denied.get_tuple(forbidden)
        assert error.value.code == "RUN_NOT_FOUND"
