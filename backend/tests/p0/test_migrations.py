from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text


BACKEND_DIR = Path(__file__).resolve().parents[2]


def alembic_config(database_url: str) -> Config:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    config.set_main_option("sqlalchemy.url", database_url)
    return config


def test_empty_database_upgrades_to_head(tmp_path):
    database_url = f"sqlite:///{tmp_path / 'empty.sqlite'}"

    command.upgrade(alembic_config(database_url), "head")

    inspector = inspect(create_engine(database_url))
    assert {
        "users",
        "topics",
        "nodes",
        "chat_messages",
        "agent_runs",
        "learner_memories",
        "study_plans",
        "study_plan_items",
        "assessment_attempts",
        "mastery_events",
    }.issubset(set(inspector.get_table_names()))
    assert {"estimated_minutes", "mastery_source", "mastery_confidence"}.issubset(
        {column["name"] for column in inspector.get_columns("nodes")}
    )
    assert {"message_type", "metadata_json"}.issubset(
        {column["name"] for column in inspector.get_columns("chat_messages")}
    )


def test_legacy_data_is_preserved_and_backfilled(tmp_path):
    database_url = f"sqlite:///{tmp_path / 'legacy.sqlite'}"
    config = alembic_config(database_url)
    command.upgrade(config, "0001_current_schema_baseline")
    engine = create_engine(database_url)

    with engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO users "
                "(id, username, email, hashed_password, is_active) "
                "VALUES (1, 'legacy', 'legacy@example.com', 'hash', 1)"
            )
        )
        connection.execute(
            text("INSERT INTO topics (id, user_id, title) VALUES (1, 1, 'Legacy')")
        )
        connection.execute(
            text(
                "INSERT INTO nodes "
                "(id, topic_id, node_key, label, state, parent_keys) "
                "VALUES (1, 1, 'root', 'Root', 'mastered', '')"
            )
        )
        connection.execute(
            text(
                "INSERT INTO chat_messages "
                "(id, user_id, topic_id, session_id, node_key, role, content, mode) "
                "VALUES (1, 1, 1, 'session', 'root', 'user', 'hello', 'socratic')"
            )
        )

    command.upgrade(config, "head")

    with engine.connect() as connection:
        assert connection.scalar(text("SELECT count(*) FROM users")) == 1
        assert connection.scalar(text("SELECT count(*) FROM topics")) == 1
        assert connection.scalar(text("SELECT count(*) FROM nodes")) == 1
        assert connection.scalar(text("SELECT count(*) FROM chat_messages")) == 1
        assert connection.scalar(
            text("SELECT mastery_source FROM nodes WHERE id = 1")
        ) == "legacy"
        assert connection.scalar(
            text("SELECT message_type FROM chat_messages WHERE id = 1")
        ) == "chat"


def test_p0_downgrade_keeps_legacy_tables(tmp_path):
    database_url = f"sqlite:///{tmp_path / 'downgrade.sqlite'}"
    config = alembic_config(database_url)
    command.upgrade(config, "head")

    command.downgrade(config, "0001_current_schema_baseline")

    inspector = inspect(create_engine(database_url))
    tables = set(inspector.get_table_names())
    assert {"users", "topics", "nodes", "chat_messages"}.issubset(tables)
    assert "agent_runs" not in tables
    assert "study_plans" not in tables
    assert "mastery_events" not in tables
    assert "estimated_minutes" not in {
        column["name"] for column in inspector.get_columns("nodes")
    }
