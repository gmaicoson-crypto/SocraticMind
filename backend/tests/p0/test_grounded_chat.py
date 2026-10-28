"""Topic material retrieval uses real chat preparation, streaming and history paths."""

import json

import pytest

from models import ChatMessage, ChatTurn, Node
from routers import chat
from services.knowledge.materials import replace_topic_materials
from tests.p0.test_knowledge_materials import configure, make_document, make_topic, ref


def scope(db, user):
    topic = make_topic(db, user)
    db.add(Node(topic_id=topic.id, node_key="gradient", label="梯度下降", state="available"))
    db.commit()
    document = make_document(db, user)
    replace_topic_materials(db, user_id=user.id, topic_id=topic.id, materials=[ref(document)])
    return topic, document


def payload(topic, **changes):
    return {
        "request_id": "topic-request",
        "session_id": "new-teaching-session",
        "node_key": "gradient",
        "topic_id": topic.id,
        "mode": "socratic",
        "user_input": "梯度下降如何更新参数？",
        **changes,
    }


def events(response):
    assert response.status_code == 200, response.text
    return [
        json.loads(line[6:]) for line in response.text.splitlines() if line.startswith("data: {")
    ]


def answers(client):
    return [
        message for message in client.get("/api/chat/messages").json() if message["role"] == "ai"
    ]


def test_bound_document_is_used_across_sessions_without_changing_attachment_scope(
    client,
    db_session,
    auth_user,
    monkeypatch,
):
    topic, document = scope(db_session, auth_user)
    calls, searches = [], []
    original_search = chat.iter_web_search

    def search(**kwargs):
        searches.append(kwargs)
        yield from original_search(**kwargs)

    monkeypatch.setattr(chat, "iter_web_search", search)
    monkeypatch.setattr(
        chat,
        "chat_stream",
        lambda **kwargs: calls.append(kwargs) or iter(["沿梯度方向更新参数。[[source:s6]]"]),
    )
    response = client.post("/api/chat/stream", json=payload(topic))
    assert not [event for event in events(response) if event.get("error")], response.text
    assert "梯度下降通过梯度方向更新参数" in json.dumps(
        calls[0]["prepared_messages"], ensure_ascii=False
    )
    source = answers(client)[0]["metadata"]["web"]["sources"][0]
    assert source["topic_id"] == topic.id
    assert source["attachment_id"] == document.id
    assert source["excerpt"] and not source.get("deleted")
    assert searches[0]["web_mode"] == "off" and searches[0]["context_messages"] == []
    warnings = answers(client)[0]["metadata"]["web"]["warnings"]
    assert any("关键词检索" in warning["message"] for warning in warnings)
    assert (
        answers(client)[0]["metadata"]["web"]["metrics"]["knowledge_retrieval"]["method"]
        == "lexical"
    )
    db_session.refresh(document)
    assert document.session_id is None and document.mode == "normal"
    replay = client.post("/api/chat/stream", json=payload(topic))
    assert not [event for event in events(replay) if event.get("error")]
    assert len(calls) == 1


def test_unbinding_revokes_history_and_replay_excerpts(client, db_session, auth_user, monkeypatch):
    topic, document = scope(db_session, auth_user)
    monkeypatch.setattr(chat, "chat_stream", lambda **kwargs: iter(["更新参数。[[source:s6]]"]))
    assert not [
        event
        for event in events(client.post("/api/chat/stream", json=payload(topic)))
        if event.get("error")
    ]
    replace_topic_materials(db_session, user_id=auth_user.id, topic_id=topic.id, materials=[])
    source = answers(client)[0]["metadata"]["web"]["sources"][0]
    assert source["deleted"] and source["excerpt"] == ""
    replay = events(client.post("/api/chat/stream", json=payload(topic)))
    for event in replay:
        for source in event.get("web", {}).get("sources", []):
            assert source["deleted"] and source["excerpt"] == ""


def test_no_evidence_does_not_expand_to_unselected_documents(
    client, db_session, auth_user, monkeypatch
):
    topic, document = scope(db_session, auth_user)
    make_document(db_session, auth_user, texts=["火星基地密码为 PRIVATE-UNSELECTED"])
    calls, searches = [], []
    original_search = chat.iter_web_search

    def search(**kwargs):
        searches.append(kwargs)
        yield from original_search(**kwargs)

    monkeypatch.setattr(chat, "iter_web_search", search)
    monkeypatch.setattr(
        chat,
        "chat_stream",
        lambda **kwargs: calls.append(kwargs) or iter(["选定教材未提供这些信息。 "]),
    )
    response = client.post("/api/chat/stream", json=payload(topic, user_input="火星基地密码？"))
    assert not [event for event in events(response) if event.get("error")], response.text
    sent = json.dumps(calls[0]["prepared_messages"], ensure_ascii=False)
    assert "no_evidence" in sent and "PRIVATE-UNSELECTED" not in sent
    assert searches[0]["web_mode"] == "off"
    assert answers(client)[0]["metadata"]["web"]["sources"] == []


@pytest.mark.parametrize("kind", ["node_overview", "topic_overview"])
def test_overviews_use_materials(client, db_session, auth_user, monkeypatch, kind):
    topic, document = scope(db_session, auth_user)
    calls = []
    monkeypatch.setattr(
        chat,
        "chat_stream",
        lambda **kwargs: calls.append(kwargs) or iter(["介绍梯度下降。[[source:s6]]"]),
    )
    response = client.post("/api/chat/stream", json=payload(topic, user_input="", kind=kind))
    assert not [event for event in events(response) if event.get("error")], response.text
    assert "梯度下降通过梯度方向更新参数" in json.dumps(
        calls[0]["prepared_messages"], ensure_ascii=False
    )
    assert answers(client)[0]["metadata"]["web"]["sources"][0]["attachment_id"] == document.id


def test_current_attachment_and_topic_sources_have_distinct_ids(
    client, db_session, auth_user, monkeypatch
):
    topic, document = scope(db_session, auth_user)
    current = make_document(
        db_session,
        auth_user,
        texts=["补充资料中的梯度下降例题。"],
        draft_session_id="new-teaching-session",
        mode="socratic",
        topic_id=topic.id,
    )
    monkeypatch.setattr(
        chat, "chat_stream", lambda **kwargs: iter(["教材与补充例题。[[source:s6]][[source:s7]]"])
    )
    response = client.post("/api/chat/stream", json=payload(topic, attachment_ids=[current.id]))
    assert not [event for event in events(response) if event.get("error")], response.text
    sources = answers(client)[0]["metadata"]["web"]["sources"]
    assert {source["attachment_id"] for source in sources} == {current.id, document.id}
    assert len({source["id"] for source in sources}) == len(sources)
    assert all(not source.get("deleted") for source in sources)


def test_deletion_during_model_call_prevents_answer_and_redacts_final_sources(
    client, db_session, auth_user, monkeypatch
):
    topic, document = scope(db_session, auth_user)

    def deleting(**kwargs):
        document.status = "deleted"
        db_session.commit()
        yield "不应发布的迟到答案"

    monkeypatch.setattr(chat, "chat_stream", deleting)
    response = client.post("/api/chat/stream", json=payload(topic))
    received = events(response)
    assert any(event.get("error", {}).get("code") == "MATERIAL_NOT_FOUND" for event in received)
    assert not any(event.get("text") for event in received)
    final = [
        event for event in received if event.get("type") == "web_sources" and event.get("final")
    ][-1]
    assert all(source["deleted"] and source["excerpt"] == "" for source in final["web"]["sources"])
    db_session.expire_all()
    assert db_session.query(ChatTurn).one().status == "failed"


def test_forged_topic_id_cannot_authorize_history(client, db_session, auth_user, monkeypatch):
    topic, document = scope(db_session, auth_user)
    other = make_topic(db_session, auth_user)
    monkeypatch.setattr(chat, "chat_stream", lambda **kwargs: iter(["回答。[[source:s6]]"]))
    response = client.post("/api/chat/stream", json=payload(topic))
    assert not [event for event in events(response) if event.get("error")]
    message = db_session.query(ChatMessage).filter_by(role="ai").one()
    metadata = json.loads(json.dumps(message.metadata_json))
    metadata["web"]["sources"][0]["topic_id"] = other.id
    message.metadata_json = metadata
    db_session.commit()
    assert answers(client)[0]["metadata"]["web"]["sources"][0]["deleted"]
