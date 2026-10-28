"""Compiled, durable learning-plan graph over the existing business services.

Only step identities are checkpointed. Results and evidence references stay in
AgentRun; each side-effecting node checks its committed result before replay.
"""

from typing import TypedDict

from langgraph.graph import END, START, StateGraph
from langgraph.types import Command, interrupt
from sqlalchemy.orm import sessionmaker
from core.errors import ApiError

from .checkpointer import SQLRunCheckpointer
from .grounding import validate_evidence
from .plan_confirmation import confirm_run as persist_confirmation
from .plan_generation import (
    _generate_graph,
    _generate_questions,
    _generate_schedule,
    _generate_score,
)
from .run_store import _load_owned, _snapshot, guard_execution


class WorkflowState(TypedDict, total=False):
    command: str
    request_id: str
    version: int
    stage: str


def next_stage(run):
    state = run.state_json or {}
    if run.status in {"failed", "cancelled", "completed"}:
        return END
    if run.status == "awaiting_confirmation":
        return "await_confirmation"
    if run.status == "diagnosing":
        return "await_answer" if state.get("questions") else "questions"
    if state.get("answers") and not state.get("diagnostic_result"):
        return "score"
    if not state["params"].get("existing_topic_id") and not state.get("graph_draft"):
        return "draft"
    return "schedule"


def build_workflow(session_factory, *, run_id, user_id, generator=None, checkpointer=None):
    saver = checkpointer or SQLRunCheckpointer(session_factory, run_id=run_id, user_id=user_id)

    def load(db):
        guard_execution(db, user_id, run_id)
        return _load_owned(db, user_id, run_id)

    def projection(run):
        return {"version": run.version, "stage": next_stage(run), "command": "", "request_id": ""}

    def route(state):
        with session_factory() as db:
            run = load(db)
            if run.status in {"completed", "cancelled", "failed"}:
                return END
            if state.get("command") == "confirm":
                return "confirm"
            return next_stage(run)

    def generated(stage, function):
        def execute(state):
            with session_factory() as db:
                run = load(db)
                if next_stage(run) == stage:
                    snapshot = _snapshot(run)
                    db.commit()
                    run = function(db, snapshot, generator)
                return projection(run)

        return execute

    def schedule(state):
        with session_factory() as db:
            run = load(db)
            if next_stage(run) == "schedule":
                snapshot = _snapshot(run)
                db.commit()
                run = _generate_schedule(db, snapshot)
            return projection(run)

    def wait_for(kind):
        def wait(state):
            with session_factory() as db:
                run = load(db)
                expected = "await_answer" if kind == "answer" else "await_confirmation"
                if next_stage(run) != expected:
                    return projection(run)
                validate_evidence(db, _snapshot(run))
                payload = {
                    "kind": kind,
                    "run_id": run_id,
                    "version": run.version,
                    "step_id": (run.state_json or {}).get("step_id"),
                }
            # This node has no model or database writes before the interrupt.
            # Resume re-enters it; committed answers/parameters are read above.
            event = interrupt(payload)
            return {"command": event.get("kind", ""), "request_id": event.get("request_id", "")}

        return wait

    def confirm(state):
        with session_factory() as db:
            run = load(db)
            if run.status == "awaiting_confirmation":
                run = persist_confirmation(
                    db, user_id=user_id, run_id=run_id, request_id=state["request_id"]
                )
            return projection(run)

    graph = StateGraph(WorkflowState)
    graph.add_node("questions", generated("questions", _generate_questions))
    graph.add_node("score", generated("score", _generate_score))
    graph.add_node("draft", generated("draft", _generate_graph))
    graph.add_node("schedule", schedule)
    graph.add_node("await_answer", wait_for("answer"))
    graph.add_node("await_confirmation", wait_for("confirmation"))
    graph.add_node("confirm", confirm)
    destinations = {name: name for name in (*graph.nodes, END)}
    graph.add_conditional_edges(START, route, destinations)
    for name in graph.nodes:
        graph.add_conditional_edges(name, route, destinations)
    return graph.compile(checkpointer=saver)


def execute_workflow(db, *, user_id, run_id, generator=None, event=None, claim=None):
    # Thread id is derived only after authenticating the business run.
    run = _load_owned(db, user_id, run_id)
    if (run.state_json or {}).get("workflow_version", 1) != 1:
        raise ApiError(
            status_code=409,
            code="AGENT_WORKFLOW_VERSION_UNSUPPORTED",
            message="当前流程版本暂不支持恢复",
        )
    if run.status in {"cancelled", "completed"}:
        return run

    def guard(session):
        from .jobs import guard_claim

        _load_owned(session, user_id, run_id, for_update=True)
        guard_claim(session, claim)

    info = {"agent_execution_guard": guard, "agent_lease_token": claim["token"]} if claim else {}
    factory = sessionmaker(bind=db.get_bind(), expire_on_commit=False, autoflush=False, info=info)
    db.commit()
    saver = SQLRunCheckpointer(
        factory, run_id=run_id, user_id=user_id, write_guard=guard if claim else None
    )
    graph = build_workflow(
        factory, run_id=run_id, user_id=user_id, generator=generator, checkpointer=saver
    )
    config = {"configurable": {"thread_id": run_id}, "recursion_limit": 30}
    saved = graph.get_state(config)
    paused = any(task.interrupts for task in saved.tasks)
    if paused and event is None:
        return _load_owned(db, user_id, run_id)
    if paused:
        value = Command(resume=event)
    elif saved.next:
        # A process died between durable steps. Finish that continuation first.
        graph.invoke(None, config, durability="sync")
        saved = graph.get_state(config)
        paused = any(task.interrupts for task in saved.tasks)
        value = Command(resume=event) if paused and event else None
        if value is None:
            return _load_owned(db, user_id, run_id)
    else:
        value = {
            "command": (event or {}).get("kind", ""),
            "request_id": (event or {}).get("request_id", ""),
        }
    graph.invoke(value, config, durability="sync")
    return _load_owned(db, user_id, run_id)
