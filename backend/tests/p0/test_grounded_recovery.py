"""A paused graph must re-authorize materials when a new worker resumes it."""

import pytest
from sqlalchemy.orm import sessionmaker

from models import AgentRun, Attachment, Node, StudyPlan
from schemas.agent import TopicPlanRequest
from services.agent.job_execution import execute_claim
from services.agent.jobs import claim_job
from services.agent.orchestrator import start_topic_plan, submit_answer
from services.knowledge.materials import replace_topic_materials
from tests.p0.test_agent_orchestrator import FakeGenerator, graph_payload, onboarding_request
from tests.p0.test_knowledge_materials import configure as configure
from tests.p0.test_knowledge_materials import make_document, make_topic, ref


@pytest.mark.parametrize(
    "revocation, code",
    [
        ("unbind", "MATERIAL_ACCESS_REVOKED"),
        ("delete", "MATERIAL_NOT_FOUND"),
        ("revision", "MATERIAL_REVISION_CONFLICT"),
    ],
)
def test_resume_rechecks_frozen_material_scope(db_session, auth_user, revocation, code):
    user_id = auth_user.id
    document = make_document(db_session, auth_user)
    topic = make_topic(db_session, auth_user)
    topic_id, document_id = topic.id, document.id
    for node in graph_payload()["nodes"]:
        db_session.add(
            Node(
                topic_id=topic_id,
                node_key=node["key"],
                label=node["label"],
                parent_keys=",".join(node.get("parent_keys", [])),
                state="available",
            )
        )
    db_session.commit()
    replace_topic_materials(
        db_session, user_id=user_id, topic_id=topic_id, materials=[ref(document)]
    )
    payload = onboarding_request(True).model_dump(mode="json", exclude={"topic", "materials"})
    generator = FakeGenerator()
    run = start_topic_plan(
        db_session,
        user_id=user_id,
        topic_id=topic_id,
        request=TopicPlanRequest.model_validate(payload),
        generator=generator,
    )
    run_id, version, step_id = run.id, run.version, run.state_json["step_id"]
    assert run.state_json["evidence"]["sources"]
    db_session.commit()
    factory = sessionmaker(bind=db_session.get_bind(), expire_on_commit=False)
    with factory() as other:
        if revocation == "unbind":
            replace_topic_materials(other, user_id=user_id, topic_id=topic_id, materials=[])
        else:
            row = other.get(Attachment, document_id)
            if revocation == "delete":
                row.status = "deleted"
            else:
                row.revision += 1
            other.commit()
    with factory() as requester:
        submit_answer(
            requester,
            user_id=user_id,
            run_id=run_id,
            version=version,
            step_id=step_id,
            answer="answer",
            deferred=True,
        )
    generator.calls.clear()
    execute_claim(factory, claim_job(factory, run_id=run_id), generator=generator)
    with factory() as db:
        restored = db.get(AgentRun, run_id)
        assert restored.status == "failed" and restored.error_code == code
        assert not restored.state_json.get("preview")
        assert db.query(StudyPlan).count() == 0
    assert generator.calls == []
