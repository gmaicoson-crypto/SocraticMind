"""Selected document evidence reaches models and survives confirmation safely."""

import json
from copy import deepcopy

import pytest

from core.errors import ApiError
from models import AgentRun, Node, StudyPlan
from routers.agent import get_agent_generator
from schemas.agent import OnboardingRequest
from schemas.structured_ai import PersonalizedGraphDraft
from services.agent.orchestrator import (
    start_onboarding,
    submit_answer,
    update_run_parameters,
    confirm_run,
)
from services.agent.structured_ai import StructuredResult
from services.knowledge.materials import topic_refs
from tests.p0.test_agent_orchestrator import FakeGenerator, graph_payload, onboarding_request
from tests.p0.test_knowledge_materials import configure, make_document, ref


def request_for(document, *, diagnostic=False):
    params = onboarding_request(diagnostic).model_dump(mode="json")
    params["materials"] = [ref(document).model_dump()]
    return OnboardingRequest.model_validate(params)


class GroundedGenerator(FakeGenerator):
    def __init__(self, db, source_id="s6"):
        super().__init__()
        self.db = db
        self.source_id = source_id

    def __call__(self, schema, messages, context):
        assert not self.db.in_transaction()
        assert any("梯度下降" in str(message["content"]) for message in messages)
        if schema is not PersonalizedGraphDraft:
            return super().__call__(schema, messages, context)
        self.calls.append((schema, messages, context))
        value = graph_payload()
        for node in value["nodes"]:
            node["source_ids"] = [self.source_id]
        return StructuredResult(
            value=schema.model_validate(value), token_usage=10, latency_ms=5, attempts=1
        )


def test_grounded_diagnosis_plan_and_confirmation(db_session, auth_user):
    document = make_document(db_session, auth_user)
    generator = GroundedGenerator(db_session)
    run = start_onboarding(
        db_session,
        user_id=auth_user.id,
        request=request_for(document, diagnostic=True),
        generator=generator,
    )
    for _ in range(3):
        run = submit_answer(
            db_session,
            user_id=auth_user.id,
            run_id=run.id,
            step_id=run.state_json["step_id"],
            version=run.version,
            answer="已知概念",
            generator=generator,
        )
    assert run.status == "awaiting_confirmation"
    assert all(source["excerpt"] == "" for source in run.state_json["evidence"]["sources"])
    assert all(
        node["material_sources"][0]["attachment_id"] == document.id
        for node in run.state_json["preview"]["nodes"]
    )
    calls = len(generator.calls)
    run = update_run_parameters(
        db_session,
        user_id=auth_user.id,
        run_id=run.id,
        updates={"daily_minutes": 60},
        generator=generator,
    )
    assert len(generator.calls) == calls
    run = confirm_run(
        db_session, user_id=auth_user.id, run_id=run.id, request_id="confirm-grounded"
    )
    assert run.status == "completed"
    assert topic_refs(db_session, user_id=auth_user.id, topic_id=run.topic_id) == [ref(document)]
    assert all(
        node.material_sources[0]["attachment_id"] == document.id
        for node in db_session.query(Node).all()
    )
    confirm_run(db_session, user_id=auth_user.id, run_id=run.id, request_id="confirm-grounded")
    assert db_session.query(StudyPlan).count() == 1


def test_model_cannot_invent_source_ids(db_session, auth_user, client):
    document = make_document(db_session, auth_user)
    run = start_onboarding(
        db_session,
        user_id=auth_user.id,
        request=request_for(document),
        generator=GroundedGenerator(db_session, "s999"),
    )
    assert run.status == "failed"
    assert run.error_code == "MATERIAL_CITATION_INVALID"
    assert db_session.query(Node).count() == 0
    attempts = client.get(f"/api/agent/runs/{run.id}/attempts").json()["items"]
    assert attempts[0]["status"] == "rejected"
    assert attempts[0]["error_code"] == "MATERIAL_CITATION_INVALID"
    assert attempts[0]["tokens"] == 10


def test_deleting_evidence_during_generation_prevents_publication(db_session, auth_user):
    document = make_document(db_session, auth_user)
    generator = GroundedGenerator(db_session)

    def deleting(schema, messages, context):
        result = generator(schema, messages, context)
        document.status = "deleted"
        db_session.commit()
        return result

    run = start_onboarding(
        db_session, user_id=auth_user.id, request=request_for(document), generator=deleting
    )
    assert run.status == "failed"
    assert run.error_code == "MATERIAL_NOT_FOUND"
    assert "preview" not in run.state_json


def test_api_reloads_sources_and_revokes_deleted_preview(app, client, db_session, auth_user):
    document = make_document(db_session, auth_user)
    app.dependency_overrides[get_agent_generator] = lambda: GroundedGenerator(db_session)
    response = client.post(
        "/api/agent/onboarding", json=request_for(document).model_dump(mode="json")
    )
    assert response.status_code == 201
    from tests.p0.test_agent_api import settle_run

    payload = settle_run(db_session, client, response, GroundedGenerator(db_session)).json()
    assert payload["status"] == "awaiting_confirmation"
    assert "梯度下降" in payload["preview"]["sources"][0]["excerpt"]
    from models import ChatMessage

    saved = db_session.query(ChatMessage).filter_by(message_type="plan_preview").one()
    assert saved.metadata_json["preview"]["sources"][0]["excerpt"] == ""
    history = client.get("/api/chat/messages").json()
    assert (
        "梯度下降"
        in next(message for message in history if message["message_type"] == "plan_preview")[
            "metadata"
        ]["preview"]["sources"][0]["excerpt"]
    )
    run_id = payload["run_id"]
    document.status = "deleted"
    db_session.commit()
    restored = client.get(f"/api/agent/runs/{run_id}").json()
    assert restored["preview"]["evidence_unavailable"] is True
    assert all(source["excerpt"] == "" for source in restored["preview"]["sources"])
    history = client.get("/api/chat/messages").json()
    historical = next(message for message in history if message["message_type"] == "plan_preview")[
        "metadata"
    ]["preview"]
    assert historical["evidence_unavailable"]
    assert all(not source["excerpt"] for source in historical["sources"])
    confirmed = client.post(
        f"/api/agent/runs/{run_id}/confirm",
        json={"request_id": "confirm-deleted", "version": restored["version"]},
    )
    refused = settle_run(db_session, client, confirmed).json()
    assert refused["status"] == "failed" and refused["error"]["retryable"] is False
    assert db_session.query(StudyPlan).count() == 0


def test_missing_material_fails_before_creating_run(client, db_session, auth_user):
    params = onboarding_request(False).model_dump(mode="json")
    params["materials"] = [{"attachment_id": "missing", "revision": 1}]
    assert client.post("/api/agent/onboarding", json=params).status_code == 404
    assert db_session.query(AgentRun).count() == 0
