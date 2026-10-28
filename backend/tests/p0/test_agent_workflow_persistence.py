"""Independent-process restoration and storage contracts for real compiled graphs."""

import json
import os
import subprocess
import sys
from typing import TypedDict

import pytest
from alembic import command
from langgraph.graph import END, START, StateGraph
from sqlalchemy import create_engine, inspect, MetaData, Table, select
from sqlalchemy.orm import sessionmaker

from core.errors import ApiError
from models import AgentRun, User
from services.agent.checkpointer import SQLRunCheckpointer
from tests.p0.test_migrations import BACKEND_DIR, alembic_config


def test_new_process_resumes_questions_then_confirms_without_regeneration(tmp_path):
    url = f"sqlite:///{tmp_path / 'workflow.sqlite'}"
    command.upgrade(alembic_config(url), "head")
    script = tmp_path / "workflow_process.py"
    script.write_text("""
import json, sys
from core.database import SessionLocal
from models import AgentRun, User, Topic, StudyPlan
from services.agent.orchestrator import start_onboarding, submit_answer, confirm_run
from tests.p0.test_agent_orchestrator import FakeGenerator, onboarding_request

generator = FakeGenerator()
with SessionLocal() as db:
    if sys.argv[1] == "start":
        user = User(username="restore", email="restore@example.test", hashed_password="unused")
        db.add(user)
        db.commit()
        run = start_onboarding(db, user_id=user.id, request=onboarding_request(), generator=generator)
    else:
        run = db.query(AgentRun).one()
        if sys.argv[1] == "answer":
            for index in range(3):
                run = submit_answer(db, user_id=run.user_id, run_id=run.id,
                    step_id=run.state_json["step_id"], version=run.version,
                    answer="answer " + str(index), generator=generator)
        else:
            run = confirm_run(db, user_id=run.user_id, run_id=run.id, request_id="confirmed")
    print(json.dumps({"run_id": run.id, "status": run.status,
        "calls": [schema.__name__ for schema, *_ in generator.calls],
        "topics": db.query(Topic).count(), "plans": db.query(StudyPlan).count()}))
""")
    env = {
        **os.environ,
        "DATABASE_URL": url,
        "PYTHONPATH": str(BACKEND_DIR),
        "ATTACHMENT_STORAGE_DIR": str(tmp_path / "attachments"),
        "KNOWLEDGE_EMBEDDING_ENABLED": "false",
        "LLM_MODELS": json.dumps(
            [
                {
                    "id": "isolated",
                    "NAME": "isolated",
                    "MODEL": "test-model",
                    "BASE_URL": "https://llm.example.test/v1",
                    "API_KEY": "test-key",
                }
            ]
        ),
    }
    results = []
    for mode in ("start", "answer", "confirm", "confirm"):
        result = subprocess.run(
            [sys.executable, str(script), mode],
            cwd=BACKEND_DIR,
            env=env,
            capture_output=True,
            text=True,
            timeout=20,
        )
        assert result.returncode == 0, result.stdout + result.stderr
        results.append(json.loads(result.stdout.strip().splitlines()[-1]))
    assert len({item["run_id"] for item in results}) == 1
    assert results[0]["calls"] == ["DiagnosticQuestions"]
    assert results[1]["calls"] == ["DiagnosticScore", "PersonalizedGraphDraft"]
    assert results[1]["status"] == "awaiting_confirmation"
    for result in results[2:]:
        assert result["status"] == "completed" and result["calls"] == []
        assert result["topics"] == result["plans"] == 1


def test_checkpoint_migration_preserves_existing_run_and_downgrades(tmp_path):
    url = f"sqlite:///{tmp_path / 'upgrade.sqlite'}"
    config = alembic_config(url)
    command.upgrade(config, "0017_knowledge_indexes")
    engine = create_engine(url)
    factory = sessionmaker(bind=engine)
    with factory() as db:
        user = User(username="old", email="old@example.test", hashed_password="x")
        db.add(user)
        db.flush()
        old_runs = Table("agent_runs", MetaData(), autoload_with=engine)
        db.execute(
            old_runs.insert().values(
                id="existing-run",
                user_id=user.id,
                run_type="onboarding",
                status="diagnosing",
                version=0,
                state_json={"questions": [{"prompt": "existing"}]},
                token_usage=0,
            )
        )
        db.commit()
    command.upgrade(config, "head")
    assert {"agent_checkpoints", "agent_checkpoint_writes"} <= set(
        inspect(engine).get_table_names()
    )
    with factory() as db:
        assert db.get(AgentRun, "existing-run").state_json == {
            "questions": [{"prompt": "existing"}]
        }
    command.downgrade(config, "0017_knowledge_indexes")
    assert "agent_checkpoints" not in inspect(engine).get_table_names()
    with factory() as db:
        assert (
            db.scalar(select(old_runs.c.status).where(old_runs.c.id == "existing-run"))
            == "diagnosing"
        )
    engine.dispose()


def test_pending_writes_preserve_successful_peer_when_other_node_fails(db_session, auth_user):
    run = AgentRun(user_id=auth_user.id, run_type="onboarding", status="collecting", state_json={})
    db_session.add(run)
    db_session.commit()
    saver = SQLRunCheckpointer(
        sessionmaker(bind=db_session.get_bind()), run_id=run.id, user_id=auth_user.id
    )
    config = {"configurable": {"thread_id": run.id}}
    db_session.commit()
    calls = {"success": 0, "failure": 0}

    class State(TypedDict, total=False):
        successful: bool
        recovered: bool

    def success(state):
        calls["success"] += 1
        return {"successful": True}

    def failure(state):
        calls["failure"] += 1
        if calls["failure"] == 1:
            raise RuntimeError("retry only this node")
        return {"recovered": True}

    builder = StateGraph(State)
    for name, node in (("success", success), ("failure", failure)):
        builder.add_node(name, node)
        builder.add_edge(START, name)
        builder.add_edge(name, END)
    with pytest.raises(RuntimeError, match="retry only"):
        builder.compile(checkpointer=saver).invoke({}, config, durability="sync")
    restored = builder.compile(checkpointer=saver).invoke(None, config, durability="sync")
    assert restored == {"successful": True, "recovered": True}
    assert calls == {"success": 1, "failure": 2}


def test_storage_write_guard_fences_lost_execution(db_session, auth_user):
    run = AgentRun(user_id=auth_user.id, run_type="onboarding", status="collecting", state_json={})
    db_session.add(run)
    db_session.commit()

    def revoked(db):
        raise ApiError(status_code=409, code="AGENT_LEASE_LOST", message="执行归属已变化")

    saver = SQLRunCheckpointer(
        sessionmaker(bind=db_session.get_bind()),
        run_id=run.id,
        user_id=auth_user.id,
        write_guard=revoked,
    )
    config = {"configurable": {"thread_id": run.id, "checkpoint_id": "test-checkpoint"}}
    db_session.commit()
    with pytest.raises(ApiError, match="执行归属"):
        saver.put(config, {"id": "new-checkpoint"}, {}, {})
    with pytest.raises(ApiError, match="执行归属"):
        saver.put_writes(config, [("value", 1)], "task")
    assert saver.get_tuple(config) is None
