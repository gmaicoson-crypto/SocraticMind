from datetime import datetime, timedelta, timezone
import json

import pytest
from pydantic import ValidationError

from core.errors import ApiError
from models import AgentRun, AssessmentAttempt, ReviewAttempt, ReviewTask, StudyPlan, User
from routers.agent import get_agent_generator
from schemas.review import ReviewAnswerRequest, ReviewScore
from services.agent.structured_ai import StructuredAIError, StructuredResult
from services.assessments import start_assessment
from services.planning import today_in_timezone
from services.plans import replan
from services.reviews import answer_review, enqueue_wrong_answers
from tests.p0.test_assessment_service import (
    AssessmentGenerator,
    create_assessable_node,
    complete_answers,
)


class ReviewGenerator:
    def __init__(self, *, score=4, confidence=0.9, critical=False, callback=None):
        self.score = score
        self.confidence = confidence
        self.critical = critical
        self.callback = callback
        self.calls = []

    def __call__(self, schema, messages, context):
        assert schema is ReviewScore
        data = json.loads(messages[-1]["content"])
        self.calls.append(data)
        if self.callback:
            self.callback()
        return StructuredResult(
            value=ReviewScore(
                question_id=data["question"]["question_id"],
                score=self.score,
                rationale="复习证据",
                evaluation_confidence=self.confidence,
                critical_misconception=self.critical,
            ),
            token_usage=5,
            latency_ms=1,
            attempts=1,
        )


def test_review_scoring_keeps_its_original_scale_and_feedback_contract():
    payload = {
        "question_id": "q1",
        "score": 4,
        "rationale": "Review feedback",
        "evaluation_confidence": 0.9,
        "critical_misconception": False,
    }
    assert ReviewScore.model_validate(payload).score == 4
    with pytest.raises(ValidationError):
        ReviewScore.model_validate({**payload, "score": 5})


def wrong_assessment(db, user):
    node, _ = create_assessable_node(db, user)
    generator = AssessmentGenerator(question_scores=[75, 75, 50])  # One question below 75.
    run = start_assessment(
        db, user_id=user.id, node_id=node.id, request_id="wrong", generator=generator
    )
    run = complete_answers(db, user.id, run, generator)
    return node, run, db.query(ReviewTask).one()


def request(**kwargs):
    return ReviewAnswerRequest(
        request_id="answer-review", version=1, answer="新的回答", timezone="UTC", **kwargs
    )


def test_wrong_question_appears_today_once_and_survives_replan_and_chat_cleanup(
    client, db_session, auth_user
):
    node, run, review = wrong_assessment(db_session, auth_user)
    today, _ = today_in_timezone("UTC")
    assert review.due_date == today
    assert review.question_id == "aq3"
    assert review.previous_answer == "answer 2"
    assert run.result_json["review_count"] == 1
    attempt = db_session.query(AssessmentAttempt).one()
    enqueue_wrong_answers(db_session, attempt=attempt, node=node)
    db_session.commit()
    assert db_session.query(ReviewTask).count() == 1
    plan = db_session.query(StudyPlan).one()
    replan(
        db_session, user_id=auth_user.id, plan_id=plan.id, request_id="replan", timezone_name="UTC"
    )
    db_session.delete(db_session.get(AgentRun, run.id))
    db_session.commit()
    db_session.refresh(review)
    assert review.assessment_id is None
    plan.status = "completed"
    node.state = "mastered"
    db_session.commit()
    response = client.get("/api/plans/today", params={"timezone": "UTC"})
    assert response.status_code == 200
    assert [item["id"] for item in response.json()["reviews"]] == [review.id]
    detail = client.get(f"/api/plans/reviews/{review.id}").json()
    assert detail["step"]["prompt"] == "Question 3"
    assert "rubric" not in detail["step"]
    assert "reference_answer" not in detail["step"]


def test_review_success_is_idempotent_and_preserves_mastery(client, app, db_session, auth_user):
    node, _, review = wrong_assessment(db_session, auth_user)
    generator = ReviewGenerator()
    app.dependency_overrides[get_agent_generator] = lambda: generator
    path = f"/api/plans/reviews/{review.id}/answers"
    payload = request().model_dump()
    first = client.post(path, json=payload)
    second = client.post(path, json=payload)
    assert first.status_code == 200, first.text
    assert second.json() == first.json()
    assert first.json()["passed"] is True
    assert len(generator.calls) == 1
    assert db_session.query(ReviewAttempt).count() == 1
    db_session.refresh(node)
    assert node.state == "available"
    assert client.get("/api/plans/today", params={"timezone": "UTC"}).json()["reviews"] == []
    assert client.post(path, json={**payload, "answer": "不同答案"}).status_code == 409


@pytest.mark.parametrize(
    "score,confidence,critical", [(2, 0.9, False), (4, 0.6, False), (4, 0.9, True)]
)
def test_unpassed_review_is_rescheduled_and_not_available_early(
    db_session, auth_user, score, confidence, critical
):
    node, _, review = wrong_assessment(db_session, auth_user)
    result = answer_review(
        db_session,
        user_id=auth_user.id,
        review_id=review.id,
        request=request(),
        model_id=None,
        generator=ReviewGenerator(score=score, confidence=confidence, critical=critical),
    )
    today, _ = today_in_timezone("UTC")
    assert not result["passed"]
    assert result["next_due_date"] == (today + timedelta(days=1)).isoformat()
    db_session.refresh(review)
    assert review.version == 2 and review.attempt_count == 1
    with pytest.raises(ApiError, match="尚未到"):
        answer_review(
            db_session,
            user_id=auth_user.id,
            review_id=review.id,
            request=request().model_copy(update={"request_id": "early", "version": 2}),
            model_id=None,
            generator=ReviewGenerator(),
        )
    assert node.state == "available"


def test_review_permissions_stale_answers_and_busy_guard(client, db_session, auth_user):
    _, _, review = wrong_assessment(db_session, auth_user)
    review.processing_token = "inflight"
    review.processing_until = datetime.now(timezone.utc) + timedelta(minutes=1)
    db_session.commit()
    with pytest.raises(ApiError) as busy:
        answer_review(
            db_session,
            user_id=auth_user.id,
            review_id=review.id,
            request=request(),
            model_id=None,
            generator=ReviewGenerator(),
        )
    assert busy.value.code == "REVIEW_BUSY"
    review.processing_until = datetime.now(timezone.utc) - timedelta(minutes=1)
    db_session.commit()
    answer_review(
        db_session,
        user_id=auth_user.id,
        review_id=review.id,
        request=request(),
        model_id=None,
        generator=ReviewGenerator(),
    )
    assert db_session.query(ReviewAttempt).count() == 1
    assert (
        client.post(
            f"/api/plans/reviews/{review.id}/answers",
            json={**request().model_dump(), "request_id": "stale"},
        ).status_code
        == 409
    )
    other = User(username="other-review", email="other-review@example.test", hashed_password="x")
    db_session.add(other)
    db_session.commit()
    with pytest.raises(ApiError) as foreign:
        answer_review(
            db_session,
            user_id=other.id,
            review_id=review.id,
            request=request(),
            model_id=None,
            generator=ReviewGenerator(),
        )
    assert foreign.value.status_code == 404


def test_review_upstream_failure_releases_lease_for_retry(db_session, auth_user):
    _, _, review = wrong_assessment(db_session, auth_user)

    def fail(*args):
        raise StructuredAIError("AI_TIMEOUT", "模型超时", retryable=True)

    with pytest.raises(ApiError) as error:
        answer_review(
            db_session,
            user_id=auth_user.id,
            review_id=review.id,
            request=request(),
            model_id=None,
            generator=fail,
        )
    assert error.value.retryable
    db_session.refresh(review)
    assert review.processing_token is None and review.version == 1
    assert db_session.query(ReviewAttempt).count() == 0
    result = answer_review(
        db_session,
        user_id=auth_user.id,
        review_id=review.id,
        request=request(),
        model_id=None,
        generator=ReviewGenerator(),
    )
    assert result["passed"]


def test_topic_deletion_removes_reviews_and_history(client, db_session, auth_user):
    from sqlalchemy import text

    db_session.execute(text("PRAGMA foreign_keys=ON"))
    node, _, review = wrong_assessment(db_session, auth_user)
    answer_review(
        db_session,
        user_id=auth_user.id,
        review_id=review.id,
        request=request(),
        model_id=None,
        generator=ReviewGenerator(),
    )
    assert client.delete(f"/api/topics/{node.topic_id}").status_code == 200
    assert db_session.query(ReviewTask).count() == 0
    assert db_session.query(ReviewAttempt).count() == 0


def test_overall_pass_can_still_schedule_an_individual_weak_question(db_session, auth_user):
    node, _ = create_assessable_node(db_session, auth_user)
    generator = AssessmentGenerator(question_scores=[100, 100, 50])

    run = start_assessment(
        db_session,
        user_id=auth_user.id,
        node_id=node.id,
        request_id="pass-with-review",
        generator=generator,
    )
    run = complete_answers(db_session, auth_user.id, run, generator)
    assert run.result_json["passed"] and run.result_json["review_count"] == 1
    assert db_session.query(ReviewTask).one().question_id == "aq3"


def test_legacy_four_point_scores_still_schedule_weak_questions(db_session, auth_user):
    node, _run, review = wrong_assessment(db_session, auth_user)
    db_session.delete(review)
    attempt = db_session.query(AssessmentAttempt).one()
    attempt.scores_json = [
        {"question_id": f"aq{index}", "score": points, "rationale": "Archived feedback"}
        for index, points in enumerate([3, 3, 2], 1)
    ]
    db_session.flush()
    assert enqueue_wrong_answers(db_session, attempt=attempt, node=node) == 1
    db_session.commit()
    assert db_session.query(ReviewTask).one().question_id == "aq3"
