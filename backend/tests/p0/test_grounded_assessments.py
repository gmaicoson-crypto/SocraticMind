"""Frozen textbook evidence reaches assessment and review scoring, with live revocation."""

import json
from copy import deepcopy
from dataclasses import replace

import pytest

from core.errors import ApiError
from models import AssessmentAttempt, ChatMessage, ReviewAttempt, ReviewTask
from schemas.structured_ai import AssessmentQuestions
from services.agent.presentation import serialize_run
from services.assessments import start_assessment, submit_assessment_answer
from services.chat_context import sync_agent_run_message
from services.knowledge.materials import replace_topic_materials
from services.reviews import answer_review, review_detail
from tests.p0.test_assessment_service import (
    AssessmentGenerator,
    create_assessable_node,
    complete_answers,
)
from tests.p0.test_knowledge_materials import configure, make_document, ref
from tests.p0.test_review_loop import ReviewGenerator, request


class GroundedAssessment(AssessmentGenerator):
    def __init__(self, db, *, callback=None, invalid_source=False, score=50):
        super().__init__(score=score)
        self.db, self.callback, self.invalid_source = db, callback, invalid_source
        self.inputs = []

    def __call__(self, schema, messages, context):
        assert not self.db.in_transaction()
        self.inputs.append(deepcopy(messages))
        evidence = json.loads(messages[-1]["content"].split("：", 1)[1])
        assert any("梯度下降" in source["excerpt"] for source in evidence)
        generated = super().__call__(schema, messages, context)
        if schema is AssessmentQuestions:
            payload = generated.value.model_dump()
            for question in payload["questions"]:
                question["source_ids"] = ["s999" if self.invalid_source else evidence[0]["id"]]
            generated = replace(generated, value=schema.model_validate(payload))
        if self.callback:
            self.callback(schema)
        return generated


def start(db, user, *, generator=None, texts=None):
    node, _ = create_assessable_node(db, user)
    node.label = "梯度下降"
    db.commit()
    document = make_document(db, user, texts=texts)
    replace_topic_materials(db, user_id=user.id, topic_id=node.topic_id, materials=[ref(document)])
    generator = generator or GroundedAssessment(db)
    run = start_assessment(
        db,
        user_id=user.id,
        node_id=node.id,
        request_id="grounded",
        session_id="grounded-session",
        generator=generator,
    )
    return node, document, run, generator


def test_assessment_freezes_rubrics_and_review_keeps_question_sources(
    client, db_session, auth_user
):
    node, document, run, generator = start(db_session, auth_user)
    questions = deepcopy(run.state_json["questions"])
    assert all(not source["excerpt"] for source in run.state_json["evidence"]["sources"])
    extra = make_document(db_session, auth_user, texts=["新章节的评分标准不能改变已开始的评估。"])
    replace_topic_materials(
        db_session,
        user_id=auth_user.id,
        topic_id=node.topic_id,
        materials=[ref(document), ref(extra)],
    )
    run = complete_answers(db_session, auth_user.id, run, generator)
    assert run.status == "completed" and not run.result_json["passed"]
    assert run.state_json["questions"] == questions
    score_input = json.loads(generator.inputs[-1][1]["content"])
    assert score_input["questions"] == questions
    assert "新章节" not in str(generator.inputs[-1])
    assert all(not source["excerpt"] for source in run.result_json["sources"])
    payload = serialize_run(run, db=db_session).model_dump(mode="json")
    assert "梯度下降" in payload["result"]["sources"][0]["excerpt"]
    assert all(item["source_ids"] for item in payload["result"]["scores"])
    sync_agent_run_message(db_session, run=run, payload=payload)
    saved = db_session.query(ChatMessage).filter_by(message_type="assessment_result").one()
    assert not saved.metadata_json["result"]["sources"][0]["excerpt"]
    history = client.get("/api/chat/messages").json()
    assert (
        "梯度下降"
        in next(row for row in history if row["message_type"] == "assessment_result")["metadata"][
            "result"
        ]["sources"][0]["excerpt"]
    )
    review = db_session.query(ReviewTask).first()
    assert review.question_json == questions[0]
    detail = review_detail(db_session, user_id=auth_user.id, review_id=review.id)
    assert detail["sources"][0]["locator"] == {"page": 1}
    assert "rubric" not in detail["step"] and "reference_answer" not in detail["step"]

    def review_generator(schema, messages, context):
        assert not db_session.in_transaction()
        assert "梯度下降" in messages[-1]["content"]
        # Existing fixture validates the exact frozen question in the original user message.
        return ReviewGenerator()(schema, messages[:2], context)

    result = answer_review(
        db_session,
        user_id=auth_user.id,
        review_id=review.id,
        request=request(),
        model_id=run.model,
        generator=review_generator,
    )
    assert result["passed"]
    assert db_session.query(ReviewAttempt).count() == 1
    db_session.refresh(node)
    assert node.state == "available"
    document.status = "deleted"
    db_session.commit()
    restored = client.get(f"/api/agent/runs/{run.id}").json()["result"]
    assert restored["evidence_unavailable"] and not restored["sources"][0]["excerpt"]
    nodes = client.get(f"/api/nodes/topic/{node.topic_id}").json()
    assert nodes[0]["assessment_result"]["evidence_unavailable"]
    history = client.get("/api/chat/messages").json()
    result = next(row for row in history if row["message_type"] == "assessment_result")["metadata"][
        "result"
    ]
    assert result["evidence_unavailable"] and not result["sources"][0]["excerpt"]


def test_bound_material_without_evidence_cannot_fall_back_to_general_questions(
    db_session, auth_user
):
    with pytest.raises(ApiError) as error:
        start(db_session, auth_user, texts=["完全不相关的诗歌朗诵内容。"])
    assert error.value.code == "MATERIAL_NO_EVIDENCE"
    assert db_session.query(AssessmentAttempt).count() == 0


def test_question_source_ids_must_exist(db_session, auth_user):
    _, _, run, _ = start(
        db_session, auth_user, generator=GroundedAssessment(db_session, invalid_source=True)
    )
    assert run.status == "failed" and run.error_code == "MATERIAL_CITATION_INVALID"
    assert db_session.query(AssessmentAttempt).one().questions_json == []


@pytest.mark.parametrize("change", ["unbind", "revision", "delete"])
def test_revoked_material_stops_answers_without_changing_frozen_rubrics(
    db_session, auth_user, change
):
    node, document, run, generator = start(db_session, auth_user)
    frozen = deepcopy(run.state_json["questions"])
    if change == "unbind":
        replace_topic_materials(
            db_session, user_id=auth_user.id, topic_id=node.topic_id, materials=[]
        )
    elif change == "revision":
        document.revision += 1
    else:
        document.status = "deleted"
    db_session.commit()
    run = submit_assessment_answer(
        db_session,
        user_id=auth_user.id,
        run_id=run.id,
        step_id=run.state_json["step_id"],
        version=run.version,
        answer="answer",
        generator=generator,
    )
    assert run.status == "failed" and not run.retryable
    assert run.state_json["questions"] == frozen and run.state_json["answers"] == []
    assert len(generator.calls) == 1


@pytest.mark.parametrize("stage", ["questions", "score"])
def test_revocation_during_model_prevents_publication_and_mastery(db_session, auth_user, stage):
    generator = GroundedAssessment(db_session, score=100)

    # The document exists before the first model call, so resolve it via binding.
    def revoke(schema):
        if (schema is AssessmentQuestions) == (stage == "questions"):
            from models import Attachment

            db_session.query(Attachment).update({"status": "deleted"})
            db_session.commit()

    generator.callback = revoke
    node, _, run, _ = start(db_session, auth_user, generator=generator)
    if stage == "score":
        run = complete_answers(db_session, auth_user.id, run, generator)
    assert run.status == "failed" and run.error_code == "MATERIAL_NOT_FOUND"
    assert not run.result_json and db_session.query(ReviewTask).count() == 0
    db_session.refresh(node)
    assert node.state == "available"


def test_review_revalidates_after_model_and_hides_revoked_excerpts(db_session, auth_user):
    node, document, run, generator = start(db_session, auth_user)
    complete_answers(db_session, auth_user.id, run, generator)
    review = db_session.query(ReviewTask).first()

    def revoke(schema, messages, context):
        document.status = "deleted"
        db_session.commit()
        return ReviewGenerator()(schema, messages[:2], context)

    with pytest.raises(ApiError) as error:
        answer_review(
            db_session,
            user_id=auth_user.id,
            review_id=review.id,
            request=request(),
            model_id=run.model,
            generator=revoke,
        )
    assert error.value.code == "MATERIAL_NOT_FOUND"
    db_session.refresh(review)
    assert review.version == 1 and review.processing_token is None
    assert db_session.query(ReviewAttempt).count() == 0
    detail = review_detail(db_session, user_id=auth_user.id, review_id=review.id)
    assert detail["evidence_unavailable"] and not detail["sources"][0]["excerpt"]
    with pytest.raises(ApiError):
        answer_review(
            db_session,
            user_id=auth_user.id,
            review_id=review.id,
            request=request(),
            model_id=run.model,
            generator=ReviewGenerator(),
        )


def test_assessment_reuses_node_citations_and_refuses_unbound_sources(db_session, auth_user):
    from services.knowledge.assessment_context import freeze_evidence
    from services.knowledge.retrieval import retrieve
    from schemas.knowledge import RetrievalRequest

    node, _ = create_assessable_node(db_session, auth_user)
    document = make_document(db_session, auth_user)
    replace_topic_materials(
        db_session, user_id=auth_user.id, topic_id=node.topic_id, materials=[ref(document)]
    )
    result = retrieve(
        db_session,
        user_id=auth_user.id,
        topic_id=node.topic_id,
        materials=[ref(document)],
        request=RetrievalRequest(query="梯度下降"),
        model_id="knowledge-test",
    )
    node.material_sources = [{**source, "excerpt": ""} for source in result.sources]
    node.label = "无需使用标题重新检索"
    db_session.commit()
    frozen = freeze_evidence(db_session, user_id=auth_user.id, node=node, model_id="knowledge-test")
    assert frozen["method"] == "node_sources"
    assert [
        (source["attachment_id"], source["revision"], source["chunk_id"], source["locator"])
        for source in frozen["sources"]
    ] == [
        (source["attachment_id"], source["revision"], source["chunk_id"], source["locator"])
        for source in node.material_sources
    ]
    assert all(not source["excerpt"] for source in frozen["sources"])
    replace_topic_materials(db_session, user_id=auth_user.id, topic_id=node.topic_id, materials=[])
    with pytest.raises(ApiError) as error:
        freeze_evidence(db_session, user_id=auth_user.id, node=node, model_id="knowledge-test")
    assert error.value.code == "MATERIAL_ACCESS_REVOKED"
