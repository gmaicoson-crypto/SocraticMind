"""New index tables append to the historical chain and preserve existing material data."""

from alembic import command
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session

from core.database import create_runtime_engine
from models import AgentRun, AgentJob, AgentCheckpoint, AgentCheckpointWrite, AgentStepAttempt, User

from tests.p0.test_migrations import alembic_config


def test_upgrade_from_previous_head_preserves_topic_bindings_and_can_downgrade(tmp_path):
    url = f"sqlite:///{tmp_path / 'knowledge.sqlite'}"
    config = alembic_config(url)
    command.upgrade(config, "0016_review_tasks")
    engine = create_engine(url)
    with engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO users (id, username, email, hashed_password, avatar_url) VALUES (1, 'old', 'old@example.test', 'x', '/avatars/study/boy-read.webp')"
            )
        )
        connection.execute(text("INSERT INTO topics (id, user_id, title) VALUES (1, 1, '旧主题')"))
        connection.execute(
            text(
                "INSERT INTO attachments (id, user_id, client_upload_id, draft_session_id, mode, name, mime_type, kind, size, sha256, storage_key, warnings) VALUES ('doc', 1, 'upload', 'session', 'normal', '教材', 'text/plain', 'document', 1, 'hash', 'key', '[]')"
            )
        )
        connection.execute(
            text(
                "INSERT INTO topic_materials (topic_id, attachment_id, revision) VALUES (1, 'doc', 1)"
            )
        )
    command.upgrade(config, "head")
    assert {"knowledge_embeddings", "knowledge_index_jobs"}.issubset(
        inspect(engine).get_table_names()
    )
    assert "uq_knowledge_index_version" in {
        index["name"] for index in inspect(engine).get_indexes("knowledge_index_jobs")
    }
    with engine.connect() as connection:
        assert connection.execute(
            text("SELECT topic_id, attachment_id, revision FROM topic_materials")
        ).one() == (1, "doc", 1)
    command.downgrade(config, "0016_review_tasks")
    assert "knowledge_embeddings" not in inspect(engine).get_table_names()
    with engine.connect() as connection:
        assert connection.scalar(text("SELECT count(*) FROM topic_materials")) == 1
    engine.dispose()


def test_migrated_runtime_database_cascades_deleted_run(tmp_path):
    url = f"sqlite:///{tmp_path / 'runtime-cleanup.sqlite'}"
    command.upgrade(alembic_config(url), "head")
    engine = create_runtime_engine(url)
    try:
        with Session(engine) as db:
            assert db.scalar(text("PRAGMA foreign_keys")) == 1
            user = User(username="cleanup", email="cleanup@example.test", hashed_password="x")
            db.add(user)
            db.flush()
            run = AgentRun(user_id=user.id, run_type="onboarding")
            db.add(run)
            db.flush()
            identity = {"run_id": run.id, "checkpoint_id": "checkpoint", "namespace": ""}
            payload = {"value_type": "json", "payload": b"{}"}
            db.add_all(
                [
                    AgentJob(run_id=run.id, user_id=user.id, requested_version=0),
                    AgentCheckpoint(**identity, **payload, metadata_json={}),
                    AgentCheckpointWrite(
                        **identity, **payload, task_id="task", write_index=0, channel="state"
                    ),
                    AgentStepAttempt(
                        user_id=user.id, run_id=run.id, input_version=0, step="graph_draft"
                    ),
                ]
            )
            db.commit()
            children = (AgentJob, AgentCheckpoint, AgentCheckpointWrite, AgentStepAttempt)
            assert all(db.query(model).count() == 1 for model in children)
            db.query(AgentRun).filter(AgentRun.id == run.id).delete(synchronize_session=False)
            db.commit()
            assert all(db.query(model).count() == 0 for model in children)
            assert db.query(User).count() == 1
            assert db.execute(text("PRAGMA foreign_key_check")).all() == []
    finally:
        engine.dispose()
