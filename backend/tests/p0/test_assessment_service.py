from datetime import date

import pytest

from core.errors import ApiError
from models import (
    AssessmentAttempt,
    LearnerMemory,
    Node,
    StudyPlan,
    StudyPlanItem,
    Topic,
)
from schemas.structured_ai import AssessmentQuestions, AssessmentScore, LegacyAssessmentScore
from services.assessments import (
    retry_assessment,
    start_assessment,
    submit_assessment_answer,
)
from services.agent.structured_ai import StructuredAIError, StructuredResult


def rubric_for_score(score=50):
    return [
        {
            "criterion_id": "c1",
            "criterion": "Observable evidence",
            "observable_standards": ["Specific and correct"],
            "max_score": 100,
            "scoring_rules": [
                {"score": points, "description": f"Observable requirements for {points} points"}
                for points in sorted({0, 50, 100, score})
            ],
        }
    ]


class AssessmentGenerator:
    def __init__(self, *, score=85, question_scores=None):
        self.parts = question_scores if question_scores is not None else [score] * 3
        self.score = round(sum(self.parts) / 3)
        self.calls = []

    def __call__(self, schema, _messages, _context):
        self.calls.append(schema)
        if schema is AssessmentQuestions:
            questions = []
            for index, dimension in enumerate(("concept", "application", "boundary"), 1):
                questions.append(
                    {
                        "question_id": f"aq{index}",
                        "dimension": dimension,
                        "prompt": f"Question {index}",
                        "reference_answer": f"Reference answer {index}",
                        "rubric": rubric_for_score(self.parts[index - 1]),
                    }
                )
            value = schema.model_validate({"questions": questions})
        else:
            value = schema.model_validate(
                {
                    "scores": [
                        {
                            "question_id": f"aq{index}",
                            "score": part,
                            "rationale": f"Evidence {index}",
                            "mastery_analysis": f"Mastery analysis {index}",
                            "suggestions": [f"Practice suggestion {index}"],
                            **(
                                {
                                    "criterion_scores": [
                                        {
                                            "criterion_id": "c1",
                                            "score": part,
                                            "rationale": f"Award evidence {index}",
                                        }
                                    ]
                                }
                                if schema is AssessmentScore
                                else {}
                            ),
                        }
                        for index, part in enumerate(self.parts, 1)
                    ],
                    "total_score": self.score,
                    "evidence": "Overall evidence",
                    "weaknesses": ["A weak point"] if self.score < 75 else [],
                    "remediation_route": [
                        {
                            "title": "Close the gap",
                            "action": "Practice with an example",
                            "checkpoint": "Explain without notes",
                        }
                    ],
                }
            )
        return StructuredResult(value=value, token_usage=5, latency_ms=2, attempts=1)


def create_assessable_node(
    db_session, user, *, domain="education", outcome="concept", state="available"
):
    topic = Topic(user_id=user.id, title="Assessment topic")
    db_session.add(topic)
    db_session.flush()
    node = Node(
        topic_id=topic.id,
        node_key="root",
        label="Root",
        state=state,
        estimated_minutes=30,
    )
    db_session.add(node)
    db_session.flush()
    plan = StudyPlan(
        user_id=user.id,
        topic_id=topic.id,
        goal="Learn",
        domain=domain,
        outcome_type=outcome,
        daily_minutes=30,
        timezone="UTC",
        start_date=date(2026, 9, 7),
        estimated_end_date=date(2026, 9, 7),
        status="active",
    )
    db_session.add(plan)
    db_session.flush()
    item = StudyPlanItem(
        plan_id=plan.id,
        node_id=node.id,
        scheduled_date=date(2026, 9, 7),
        day_order=1,
        estimated_minutes=30,
        status="pending",
    )
    db_session.add(item)
    db_session.commit()
    return node, item


def complete_answers(db_session, user_id, run, generator):
    for index in range(3):
        state = run.state_json
        run = submit_assessment_answer(
            db_session,
            user_id=user_id,
            run_id=run.id,
            step_id=state["step_id"],
            version=run.version,
            answer=f"answer {index}",
            generator=generator,
        )
    return run


def test_passing_assessment_records_evidence_and_mastery(db_session, auth_user):
    node, item = create_assessable_node(db_session, auth_user)
    generator = AssessmentGenerator(score=85)
    run = start_assessment(
        db_session,
        user_id=auth_user.id,
        node_id=node.id,
        request_id="start-pass",
        generator=generator,
    )
    assert run.status == "assessing"
    assert run.state_json["step_id"] == "assessment-question-1"

    run = complete_answers(db_session, auth_user.id, run, generator)
    db_session.refresh(node)
    db_session.refresh(item)
    assert run.status == "completed"
    assert run.result_json["passed"] is True
    assert run.result_json["total_score"] == 85
    assert run.result_json["max_score"] == 100
    assert run.result_json["threshold"] == {"minimum_score": 75}
    assert "evaluation_confidence" not in run.result_json
    assert "critical_misconception" not in run.result_json
    assert run.result_json["remediation_route"][0]["checkpoint"] == "Explain without notes"
    assert node.state == "mastered"
    assert node.mastery_source == "assessment"
    assert item.status == "completed"
    memory = db_session.query(LearnerMemory).one()
    assert memory.topic_id == node.topic_id
    assert memory.kind == "strength"
    assert memory.source == "assessment"
    assert memory.confidence is None


@pytest.mark.parametrize("score,passed", [(0, False), (74, False), (75, True), (100, True)])
def test_percentage_threshold_controls_mastery(db_session, auth_user, score, passed):
    node, _item = create_assessable_node(db_session, auth_user)
    generator = AssessmentGenerator(score=score)
    run = start_assessment(
        db_session,
        user_id=auth_user.id,
        node_id=node.id,
        request_id=f"start-{score}",
        generator=generator,
    )
    run = complete_answers(db_session, auth_user.id, run, generator)
    db_session.refresh(node)
    assert run.status == "completed"
    assert run.result_json["passed"] is passed
    assert node.state == ("mastered" if passed else "available")
    assert run.result_json["total_score"] == score
    assert run.result_json["review_count"] == (3 if score < 75 else 0)
    memory = db_session.query(LearnerMemory).one()
    assert memory.kind == ("strength" if passed else "weakness")
    assert memory.confidence is None
    if not passed:
        assert memory.content == "A weak point"


def test_high_risk_practical_assessment_never_auto_masters(db_session, auth_user):
    node, _item = create_assessable_node(
        db_session, auth_user, domain="medical", outcome="procedure"
    )
    generator = AssessmentGenerator(score=100)
    run = start_assessment(
        db_session,
        user_id=auth_user.id,
        node_id=node.id,
        request_id="high-risk",
        generator=generator,
    )
    run = complete_answers(db_session, auth_user.id, run, generator)
    db_session.refresh(node)
    assert run.result_json["passed"] is False
    assert run.result_json["professional_review_required"] is True
    assert node.state == "available"


def test_locked_node_is_rejected(db_session, auth_user):
    locked, _item = create_assessable_node(db_session, auth_user, state="locked")
    with pytest.raises(ApiError) as error:
        start_assessment(
            db_session,
            user_id=auth_user.id,
            node_id=locked.id,
            request_id="locked",
            generator=AssessmentGenerator(),
        )
    assert error.value.code == "NODE_LOCKED"


def test_active_attempt_and_completed_result_are_reused(db_session, auth_user):
    node, _item = create_assessable_node(db_session, auth_user)
    generator = AssessmentGenerator()
    active = start_assessment(
        db_session,
        user_id=auth_user.id,
        node_id=node.id,
        request_id="active-one",
        generator=generator,
    )
    resumed = start_assessment(
        db_session,
        user_id=auth_user.id,
        node_id=node.id,
        request_id="active-two",
        generator=generator,
    )
    assert resumed.id == active.id
    assert generator.calls.count(AssessmentQuestions) == 1

    completed = complete_answers(db_session, auth_user.id, resumed, generator)
    existing = start_assessment(
        db_session,
        user_id=auth_user.id,
        node_id=node.id,
        request_id="after-complete",
        generator=generator,
    )
    assert existing.id == completed.id


def test_failed_question_generation_can_retry(db_session, auth_user):
    node, _item = create_assessable_node(db_session, auth_user)
    good = AssessmentGenerator()
    calls = 0

    def flaky(schema, messages, context):
        nonlocal calls
        calls += 1
        if calls == 1:
            raise StructuredAIError("AI_TIMEOUT", "slow", retryable=True)
        return good(schema, messages, context)

    failed = start_assessment(
        db_session,
        user_id=auth_user.id,
        node_id=node.id,
        request_id="retry-start",
        generator=flaky,
    )
    assert failed.status == "failed"
    recovered = retry_assessment(
        db_session, user_id=auth_user.id, run_id=failed.id, generator=flaky
    )
    assert recovered.status == "assessing"
    assert recovered.state_json["step_id"] == "assessment-question-1"


def test_invalid_score_question_ids_fail_before_recording_evidence(db_session, auth_user):
    node, _item = create_assessable_node(db_session, auth_user)
    good = AssessmentGenerator(score=85)

    def invalid_score(schema, messages, context):
        result = good(schema, messages, context)
        if schema is AssessmentScore:
            result.value.scores[0].question_id = "unknown-question"
        return result

    run = start_assessment(
        db_session,
        user_id=auth_user.id,
        node_id=node.id,
        request_id="invalid-score-ids",
        generator=invalid_score,
    )
    run = complete_answers(db_session, auth_user.id, run, invalid_score)

    assert run.status == "failed"
    assert run.error_code == "ASSESSMENT_SCORE_INVALID"
    assert run.retryable is True
    attempt = db_session.query(AssessmentAttempt).filter_by(run_id=run.id).one()
    assert attempt.status == "failed"
    assert db_session.query(LearnerMemory).count() == 0


def test_feedback_matches_original_questions_and_answers_by_id(db_session, auth_user):
    node, _ = create_assessable_node(db_session, auth_user)
    base = AssessmentGenerator(question_scores=[90, 75, 60])

    def reversed_scores(schema, messages, context):
        result = base(schema, messages, context)
        if schema is AssessmentScore:
            result.value.scores.reverse()
        return result

    run = start_assessment(
        db_session,
        user_id=auth_user.id,
        node_id=node.id,
        request_id="reordered-scores",
        generator=reversed_scores,
    )
    run = complete_answers(db_session, auth_user.id, run, reversed_scores)
    assert run.result_json["total_score"] == 75
    for index, score in enumerate(run.result_json["scores"], 1):
        assert score["question_id"] == f"aq{index}"
        assert score["question"] == f"Question {index}"
        assert score["answer"] == f"answer {index - 1}"
        assert score["reference_answer"] == f"Reference answer {index}"
        assert score["rationale"] == f"Evidence {index}"
        assert score["mastery_analysis"] == f"Mastery analysis {index}"
        assert score["suggestions"] == [f"Practice suggestion {index}"]
        assert score["max_score"] == 100
    attempt = db_session.query(AssessmentAttempt).one()
    assert attempt.scores_json == run.result_json["scores"]


@pytest.mark.parametrize(
    "invalid", ["unknown_dimension", "out_of_band", "over_max", "missing", "sum"]
)
def test_invalid_dimension_scores_fail_before_mastery(db_session, auth_user, invalid):
    node, _ = create_assessable_node(db_session, auth_user)
    base = AssessmentGenerator()

    def invalid_score(schema, messages, context):
        result = base(schema, messages, context)
        if schema is AssessmentScore:
            item = result.value.scores[0]
            if invalid == "unknown_dimension":
                item.criterion_scores[0].criterion_id = "invented"
            elif invalid == "missing":
                item.criterion_scores = []
            elif invalid == "sum":
                item.score = 80
            else:
                item.score = 84 if invalid == "out_of_band" else 101
                item.criterion_scores[0].score = item.score
            result.value.total_score = round(sum(score.score for score in result.value.scores) / 3)
        return result

    run = start_assessment(
        db_session,
        user_id=auth_user.id,
        node_id=node.id,
        request_id=f"invalid-{invalid}",
        generator=invalid_score,
    )
    run = complete_answers(db_session, auth_user.id, run, invalid_score)
    assert run.status == "failed"
    assert run.error_code == "ASSESSMENT_SCORE_INVALID"
    assert node.state == "available"
    assert db_session.query(AssessmentAttempt).one().scores_json is None
    assert db_session.query(LearnerMemory).count() == 0


def test_already_started_legacy_assessment_finishes_without_fabricated_weights(
    db_session, auth_user
):
    from copy import deepcopy

    node, _ = create_assessable_node(db_session, auth_user)
    generator = AssessmentGenerator()
    run = start_assessment(
        db_session,
        user_id=auth_user.id,
        node_id=node.id,
        request_id="legacy-active",
        generator=generator,
    )
    state = deepcopy(run.state_json)
    state.pop("scoring_version")
    for question in state["questions"]:
        question.pop("reference_answer", None)
        question["rubric"] = [
            {"criterion": "Observable evidence", "observable_standards": ["Specific and correct"]}
        ]
    run.state_json = state
    db_session.query(AssessmentAttempt).one().questions_json = state["questions"]
    db_session.commit()
    run = complete_answers(db_session, auth_user.id, run, generator)
    assert run.status == "completed"
    assert LegacyAssessmentScore in generator.calls
    assert run.result_json["scoring_version"] == 1
    assert "criterion_scores" not in run.result_json["scores"][0]
    assert "max_score" not in run.result_json["scores"][0]["rubric"][0]
    assert run.result_json["scores"][0]["reference_answer"] == ""
