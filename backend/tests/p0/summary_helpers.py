import json
import uuid
from types import SimpleNamespace
import pytest
from sqlalchemy.orm import Session
from core import ai_client
from core.config import LLMProfile
from models import ChatMessage, ChatSession, ChatTurn
from services.chat_summaries import SessionSummary


@pytest.fixture
def summary_environment(db_session, monkeypatch):
    profile = LLMProfile(
        id="summary-test",
        name="Summary test",
        model="unknown-summary-model",
        api_key="test-key",
        base_url="https://example.test/v1",
    )
    monkeypatch.setattr(ai_client, "resolve_llm_profile", lambda *_args, **_kwargs: profile)
    monkeypatch.setattr("core.context_budget.resolve_llm_profile", lambda *_args: profile)
    created_sessions = []

    def factory():
        db = Session(bind=db_session.get_bind(), expire_on_commit=False)
        created_sessions.append(db)
        return db

    return SimpleNamespace(factory=factory, profile=profile, sessions=created_sessions)


def add_session(db, user, *, session_id=None, topic_id=None, status="pending"):
    session = ChatSession(
        user_id=user.id,
        session_id=session_id or str(uuid.uuid4()),
        topic_id=topic_id,
        mode="socratic" if topic_id else "normal",
        summary_status=status,
        summary_model="summary-test",
    )
    db.add(session)
    db.flush()
    return session


def add_turns(db, session, count=6, *, characters=10_000, node_key="normal"):
    turns = []
    for index in range(count):
        args = dict(
            user_id=session.user_id,
            session_id=session.session_id,
            topic_id=session.topic_id,
            node_key=node_key,
            mode=session.mode,
            message_type="chat",
            metadata_json={"status": "complete"},
        )
        user = ChatMessage(**args, role="user", content=f"question {index}")
        answer = ChatMessage(**args, role="ai", content=f"answer {index} " + "x" * characters)
        db.add_all([user, answer])
        db.flush()
        turn = ChatTurn(
            chat_session_id=session.id,
            user_id=session.user_id,
            request_id=str(uuid.uuid4()),
            request_fingerprint="test",
            user_message_id=user.id,
            ai_message_id=answer.id,
            status="complete",
            model_id="summary-test",
            node_key=node_key,
            generation_token=str(uuid.uuid4()),
            source_version=session.content_version,
        )
        db.add(turn)
        db.flush()
        turns.append(turn)
    db.commit()
    return turns


def summary_result(messages, *, goal="学习递归", **overrides):
    payload = json.loads(messages[-1]["content"])
    previous = payload.get("previous_summary") or {}
    ids = list(previous.get("source_message_ids", []))
    nodes = list(previous.get("node_keys", []))
    for turn in payload["turns"]:
        ids.extend(turn["message_ids"])
        nodes.append(turn["node_key"])
    data = {
        "goal": goal,
        "conclusions": ["讨论了函数的调用"],
        "unresolved": ["还需验证边界情况"],
        "source_message_ids": list(dict.fromkeys(ids))[-128:],
        "node_keys": list(dict.fromkeys(nodes)),
        **overrides,
    }
    return SimpleNamespace(value=SessionSummary.model_validate(data), token_usage=321)
