"""Enrich saved results from original question/answer records without regenerating feedback."""

from pydantic import ValidationError

from schemas.structured_ai import WeightedRubricCriterion


def scores_match_frozen_rubrics(score, questions):
    """Validate awards against the weights and score bands fixed before answers were submitted."""
    scored = {item.question_id: item for item in score.scores}
    if set(scored) != {item["question_id"] for item in questions}:
        return False
    if score.total_score != round(sum(item.score for item in score.scores) / 3):
        return False
    for question in questions:
        try:
            rubric = [WeightedRubricCriterion.model_validate(item) for item in question["rubric"]]
        except (ValidationError, KeyError):
            return False
        criteria = {item.criterion_id: item for item in rubric}
        if len(criteria) != len(rubric) or sum(item.max_score for item in rubric) != 100:
            return False
        result = scored[question["question_id"]]
        awarded = {item.criterion_id: item for item in result.criterion_scores}
        if set(awarded) != set(criteria) or len(awarded) != len(result.criterion_scores):
            return False
        if sum(item.score for item in result.criterion_scores) != result.score:
            return False
        for identifier, item in awarded.items():
            if item.score not in {rule.score for rule in criteria[identifier].scoring_rules}:
                return False
    return True


def assessment_result_payload(result, questions, answers):
    if not result or "scores" not in result:
        return result
    prompts = {item["question_id"]: item["prompt"] for item in questions or []}
    rubrics = {item["question_id"]: item.get("rubric", []) for item in questions or []}
    reference_answers = {
        item["question_id"]: item["reference_answer"]
        for item in questions or []
        if item.get("reference_answer")
    }
    responses = {item["question_id"]: item["answer"] for item in answers or []}
    return {
        **result,
        "scores": [
            {
                **score,
                "question": prompts.get(score["question_id"], score.get("question", "")),
                "answer": responses.get(score["question_id"], score.get("answer", "")),
                "reference_answer": reference_answers.get(
                    score["question_id"], score.get("reference_answer", "")
                ),
                "rubric": rubrics.get(score["question_id"], score.get("rubric", [])),
                "source_ids": [
                    source["id"]
                    for question in questions or []
                    if question["question_id"] == score["question_id"]
                    for source in question.get("material_sources", [])
                ],
            }
            for score in result["scores"]
        ],
    }
