from copy import deepcopy

import pytest
from pydantic import ValidationError

from schemas.structured_ai import AssessmentQuestion, AssessmentScore, QuestionScore
from services.assessment_results import scores_match_frozen_rubrics


def question_payload():
    return {
        "question_id": "q1",
        "dimension": "concept",
        "prompt": "Explain and apply the concept",
        "reference_answer": "Explain the concept, apply it with an example and discuss its boundary.",
        "rubric": [
            {
                "criterion_id": f"c{index}",
                "criterion": label,
                "max_score": maximum,
                "observable_standards": ["Explain with observable evidence"],
                "scoring_rules": [
                    {"score": maximum, "description": "Correct explanation and concrete example"},
                    {
                        "score": partial,
                        "description": "Correct explanation but missing the example",
                    },
                    {"score": 0, "description": "Missing or incorrect explanation"},
                ],
            }
            for index, (label, maximum, partial) in enumerate(
                [("Understanding", 40, 20), ("Application", 35, 15), ("Boundary", 25, 10)], 1
            )
        ],
    }


@pytest.mark.parametrize(
    "invalid", ["weight_total", "duplicate_id", "duplicate_band", "missing_zero", "over_max"]
)
def test_generated_rubrics_require_consistent_weights_and_explicit_score_bands(invalid):
    payload = question_payload()
    if invalid == "weight_total":
        payload["rubric"][0]["max_score"] = 39
        payload["rubric"][0]["scoring_rules"][0]["score"] = 39
    elif invalid == "duplicate_id":
        payload["rubric"][1]["criterion_id"] = "c1"
    elif invalid == "duplicate_band":
        payload["rubric"][0]["scoring_rules"][1]["score"] = 40
    elif invalid == "missing_zero":
        payload["rubric"][0]["scoring_rules"][2]["score"] = 1
    else:
        payload["rubric"][0]["scoring_rules"][0]["score"] = 41
    with pytest.raises(ValidationError):
        AssessmentQuestion.model_validate(payload)


def test_dimension_scores_reconcile_with_question_and_overall_totals_by_id():
    questions = []
    scores = []
    for index in range(1, 4):
        question = deepcopy(question_payload())
        question["question_id"] = f"q{index}"
        questions.append(AssessmentQuestion.model_validate(question).model_dump())
        scores.append(
            QuestionScore(
                question_id=f"q{index}",
                score=55,
                rationale="Overall feedback",
                mastery_analysis="Partial mastery",
                suggestions=["Add an application example"],
                criterion_scores=[
                    {
                        "criterion_id": f"c{number}",
                        "score": points,
                        "rationale": "Evidence matching the frozen band",
                    }
                    for number, points in [(3, 0), (1, 40), (2, 15)]
                ],
            )
        )
    score = AssessmentScore(
        scores=scores,
        total_score=55,
        evidence="Overall conclusion",
        remediation_route=[
            {
                "title": "Apply",
                "action": "Practice an example",
                "checkpoint": "Explain it independently",
            }
        ],
    )
    assert scores_match_frozen_rubrics(score, questions)
    assert [item.max_score for item in AssessmentQuestion.model_validate(questions[0]).rubric] == [
        40,
        35,
        25,
    ]
    invalid = scores[0].model_dump()
    invalid["score"] = 56
    with pytest.raises(ValidationError, match="sum of criterion scores"):
        QuestionScore.model_validate(invalid)
