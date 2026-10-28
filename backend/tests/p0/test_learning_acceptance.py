"""One complete learning path through real HTTP model transport and spawned execution."""

import json
import multiprocessing
import time

from sqlalchemy import text
from sqlalchemy.orm import sessionmaker

from models import (
    AgentCheckpoint,
    AgentCheckpointWrite,
    AgentJob,
    AgentRun,
    AgentStepAttempt,
    Attachment,
    KnowledgeEmbedding,
    KnowledgeIndexJob,
    TopicMaterial,
)
from services.agent.jobs import claim_job, heartbeat, finish_job, fail_claim
from services.agent.orchestrator import start_onboarding
from services.agent.worker import AgentWorker
from tests.p0.agent_model_server import model_server
from tests.p0.test_agent_orchestrator import onboarding_request
from tests.p0.test_knowledge_materials import make_document


def ready(client, run_id):
    deadline = time.monotonic() + 15
    while time.monotonic() < deadline:
        response = client.get(f"/api/agent/runs/{run_id}")
        assert response.status_code == 200
        body = response.json()
        assert body["status"] != "failed", body
        if not body["processing"]:
            return body
        time.sleep(0.05)
    raise AssertionError("durable worker did not finish its current command")


def test_material_plan_teaching_assessment_review_and_deletion(
    client, db_session, auth_user, monkeypatch
):
    with model_server(monkeypatch) as calls:
        document = make_document(db_session, auth_user)
        document_id = document.id
        listed = client.get("/api/knowledge/documents").json()
        assert any(row["id"] == document_id for row in listed)
        selected = next(row for row in listed if row["id"] == document_id)
        assert selected["index_status"]["status"] == "disabled"
        payload = onboarding_request(True).model_dump(mode="json")
        payload.update(
            topic="梯度下降",
            goal="掌握梯度下降",
            request_id="acceptance-create",
            model="acceptance",
            materials=[{"attachment_id": document_id, "revision": 1}],
        )
        started = client.post("/api/agent/onboarding", json=payload)
        assert started.status_code == 201 and started.json()["processing"]
        run_id = started.json()["run_id"]
        assert client.post("/api/agent/onboarding", json=payload).json()["run_id"] == run_id
        db_session.commit()
        worker = AgentWorker(str(db_session.get_bind().url))
        worker.start()
        try:
            run = ready(client, run_id)
            for index in range(3):
                assert run["step"]["current"] == index + 1
                accepted = client.post(
                    f"/api/agent/runs/{run_id}/answers",
                    json={
                        "step_id": run["step"]["step_id"],
                        "version": run["version"],
                        "answer": "理解梯度方向和学习率",
                    },
                )
                assert accepted.status_code == 200
                run = ready(client, run_id)
            assert run["status"] == "awaiting_confirmation"
            assert run["preview"]["sources"][0]["attachment_id"] == document_id
            assert "梯度下降" in run["preview"]["sources"][0]["excerpt"]
            count_before = len(calls)
            edited = client.patch(f"/api/agent/runs/{run_id}", json={"daily_minutes": 60})
            assert edited.status_code == 200
            run = ready(client, run_id)
            assert len(calls) == count_before
            confirmed = client.post(
                f"/api/agent/runs/{run_id}/confirm",
                json={"request_id": "acceptance-confirm", "version": run["version"]},
            )
            assert confirmed.status_code == 200
            run = ready(client, run_id)
            assert run["status"] == "completed"
            topic_id = run["result"]["topic_id"]
            materials = client.get(f"/api/knowledge/topics/{topic_id}/materials").json()
            assert materials[0]["document"]["id"] == document_id
            nodes = client.get(f"/api/nodes/topic/{topic_id}").json()
            root = next(node for node in nodes if node["node_key"] == "root")
            response = client.post(
                "/api/chat/stream",
                json={
                    "request_id": "acceptance-chat",
                    "session_id": "acceptance-teaching",
                    "topic_id": topic_id,
                    "node_key": "root",
                    "mode": "socratic",
                    "user_input": "梯度下降如何更新参数？",
                    "model": "acceptance",
                },
            )
            assert response.status_code == 200
            events = [
                json.loads(line[6:])
                for line in response.text.splitlines()
                if line.startswith("data: {")
            ]
            assert not any(event.get("error") for event in events), events
            assert any("梯度下降" in event.get("text", "") for event in events)
            evidence = [event for event in events if event.get("type") == "web_sources"][-1]["web"]
            final_sources = evidence["sources"]
            assert final_sources[0]["attachment_id"] == document_id
            retrieval = evidence["metrics"]["knowledge_retrieval"]
            assert retrieval["method"] == "lexical"
            assert retrieval["index_status"] == "disabled"
            assert retrieval["query_attempted"] is False
            assessment = client.post(
                "/api/agent/assessments",
                json={
                    "node_id": root["id"],
                    "request_id": "acceptance-assessment",
                    "session_id": "acceptance-assessment",
                    "model": "acceptance",
                },
            ).json()
            for _ in range(3):
                assessment = client.post(
                    f"/api/agent/runs/{assessment['run_id']}/answers",
                    json={
                        "step_id": assessment["step"]["step_id"],
                        "version": assessment["version"],
                        "answer": "部分理解",
                    },
                ).json()
            assert assessment["status"] == "completed" and assessment["result"]["review_count"] == 3
            assert assessment["result"]["sources"][0]["attachment_id"] == document_id
            reviews = client.get("/api/plans/today", params={"timezone": "UTC"}).json()["reviews"]
            review_id = reviews[0]["id"]
            detail = client.get(f"/api/plans/reviews/{review_id}").json()
            assert detail["sources"][0]["locator"]["page"] == 1
            reviewed = client.post(
                f"/api/plans/reviews/{review_id}/answers",
                json={
                    "request_id": "acceptance-review",
                    "version": detail["version"],
                    "answer": "沿负梯度更新参数",
                    "timezone": "UTC",
                    "model": "acceptance",
                },
            )
            assert reviewed.status_code == 200 and reviewed.json()["passed"]
            assert [name for name, _ in calls] == [
                "DiagnosticQuestions",
                "DiagnosticScore",
                "PersonalizedGraphDraft",
                "teaching",
                "AssessmentQuestions",
                "AssessmentScore",
                "ReviewScore",
            ]
            assert all(
                "梯度下降" in json.dumps(messages, ensure_ascii=False) for _, messages in calls
            )
            assert db_session.query(KnowledgeEmbedding).count() == 0
            assert db_session.query(KnowledgeIndexJob).count() == 0
            assert db_session.query(AgentCheckpoint).filter_by(run_id=run_id).count() > 0
            assert db_session.query(AgentCheckpointWrite).filter_by(run_id=run_id).count() > 0
            assert db_session.execute(text("PRAGMA foreign_keys")).scalar() == 1
            deleted = client.request(
                "DELETE", "/api/chat/session", json={"session_id": payload["session_id"]}
            )
            assert deleted.status_code == 200
            for model in (AgentCheckpoint, AgentCheckpointWrite, AgentJob, AgentStepAttempt):
                assert db_session.query(model).filter_by(run_id=run_id).count() == 0
            assert client.delete(f"/api/topics/{topic_id}").status_code == 200
            assert db_session.query(TopicMaterial).filter_by(topic_id=topic_id).count() == 0
            assert db_session.query(AgentStepAttempt).filter_by(review_id=review_id).count() == 0
            assert db_session.get(Attachment, document_id) is not None
        finally:
            worker.stop()
        assert not any(
            child.name == "agent-execution" for child in multiprocessing.active_children()
        )


def test_deleted_queued_run_cannot_be_renewed_or_finished(client, db_session, auth_user):
    run = start_onboarding(
        db_session, user_id=auth_user.id, request=onboarding_request(), deferred=True
    )
    factory = sessionmaker(bind=db_session.get_bind(), expire_on_commit=False)
    claim = claim_job(factory, run_id=run.id)
    assert (
        client.request(
            "DELETE", "/api/chat/session", json={"session_id": run.session_id}
        ).status_code
        == 200
    )
    assert not heartbeat(factory, claim)
    assert not finish_job(factory, claim)
    assert not fail_claim(factory, claim, code="LATE", retryable=False)
    assert claim_job(factory) is None
    assert db_session.query(AgentRun).count() == db_session.query(AgentJob).count() == 0
