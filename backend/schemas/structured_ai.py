from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, model_validator

from models.enums import OutcomeType


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class DiagnosticLevel(str, Enum):
    ENTRY = "entry"
    FOUNDATION = "foundation"
    PROFICIENT = "proficient"


class DomainClassification(StrictModel):
    domain: str = Field(min_length=1, max_length=100)
    outcome_type: OutcomeType
    high_risk: bool = False


class GeneratedQuestion(StrictModel):
    question_id: str = Field(min_length=1, max_length=100)
    dimension: str = Field(min_length=1, max_length=50)
    prompt: str = Field(min_length=1, max_length=2000)
    input_type: str = "text"
    choices: list[str] = Field(default_factory=list, max_length=8)


class DiagnosticQuestions(StrictModel):
    questions: list[GeneratedQuestion] = Field(min_length=3, max_length=3)

    @model_validator(mode="after")
    def cover_required_dimensions(self):
        ids = {question.question_id for question in self.questions}
        dimensions = {question.dimension for question in self.questions}
        if len(ids) != 3:
            raise ValueError("diagnostic question ids must be unique")
        if dimensions != {"prior_knowledge", "application", "limits"}:
            raise ValueError("diagnostic questions must cover all required dimensions")
        return self


class DiagnosticScore(StrictModel):
    score: int = Field(ge=0, le=100)
    level: DiagnosticLevel
    domain: str = Field(min_length=1, max_length=100)
    outcome_type: OutcomeType
    strengths: list[str] = Field(default_factory=list, max_length=10)
    weaknesses: list[str] = Field(default_factory=list, max_length=10)
    graph_guidance: list[str] = Field(default_factory=list, max_length=10)


class GraphDraftNode(StrictModel):
    key: str = Field(min_length=1, max_length=100)
    label: str = Field(min_length=1, max_length=200)
    sub: str = Field(default="", max_length=500)
    parent_keys: list[str] = Field(default_factory=list, max_length=1)
    estimated_minutes: int = Field(ge=10, le=120)
    source_ids: list[str] = Field(default_factory=list, max_length=8)


class PersonalizedGraphDraft(StrictModel):
    emoji: str = Field(default="📚", max_length=10)
    nodes: list[GraphDraftNode] = Field(min_length=6, max_length=10)


class RubricCriterion(StrictModel):
    criterion: str = Field(min_length=1, max_length=300)
    observable_standards: list[str] = Field(min_length=1, max_length=6)


class ScoringRule(StrictModel):
    score: int = Field(ge=0, le=100)
    description: str = Field(min_length=1, max_length=500)


class WeightedRubricCriterion(RubricCriterion):
    criterion_id: str = Field(min_length=1, max_length=100)
    max_score: int = Field(ge=2, le=100)
    scoring_rules: list[ScoringRule] = Field(min_length=3, max_length=5)

    @model_validator(mode="after")
    def rules_cover_score_range(self):
        points = {rule.score for rule in self.scoring_rules}
        if (
            len(points) != len(self.scoring_rules)
            or min(points) != 0
            or max(points) != self.max_score
        ):
            raise ValueError("scoring rules must have unique scores from zero to max_score")
        return self


class AssessmentQuestion(GeneratedQuestion):
    source_ids: list[str] = Field(default_factory=list, max_length=8)
    reference_answer: str = Field(min_length=1, max_length=4000)
    rubric: list[WeightedRubricCriterion] = Field(min_length=1, max_length=6)

    @model_validator(mode="after")
    def rubric_totals_one_hundred(self):
        if len({item.criterion_id for item in self.rubric}) != len(self.rubric):
            raise ValueError("rubric criterion ids must be unique within a question")
        if sum(item.max_score for item in self.rubric) != 100:
            raise ValueError("rubric maximum scores must total 100")
        return self


class AssessmentQuestions(StrictModel):
    questions: list[AssessmentQuestion] = Field(min_length=3, max_length=3)

    @model_validator(mode="after")
    def question_ids_are_unique(self):
        if len({question.question_id for question in self.questions}) != 3:
            raise ValueError("assessment question ids must be unique")
        return self


class QuestionFeedback(StrictModel):
    question_id: str = Field(min_length=1, max_length=100)
    rationale: str = Field(min_length=1, max_length=2000)


class QuestionEvaluation(QuestionFeedback):
    score: int = Field(ge=0, le=100)
    mastery_analysis: str = Field(min_length=1, max_length=1500)
    suggestions: list[str] = Field(min_length=1, max_length=4)


class CriterionScore(StrictModel):
    criterion_id: str = Field(min_length=1, max_length=100)
    score: int = Field(ge=0, le=100)
    rationale: str = Field(min_length=1, max_length=1000)


class QuestionScore(QuestionEvaluation):
    criterion_scores: list[CriterionScore] = Field(min_length=1, max_length=6)

    @model_validator(mode="after")
    def criterion_scores_match_question(self):
        if len({item.criterion_id for item in self.criterion_scores}) != len(self.criterion_scores):
            raise ValueError("criterion score ids must be unique")
        if sum(item.score for item in self.criterion_scores) != self.score:
            raise ValueError("question score must equal the sum of criterion scores")
        return self


class RemediationStep(StrictModel):
    title: str = Field(min_length=1, max_length=100)
    action: str = Field(min_length=1, max_length=800)
    checkpoint: str = Field(min_length=1, max_length=500)


class AssessmentScore(StrictModel):
    scores: list[QuestionScore] = Field(min_length=3, max_length=3)
    total_score: int = Field(ge=0, le=100)
    evidence: str = Field(min_length=1, max_length=3000)
    weaknesses: list[str] = Field(default_factory=list, max_length=10)
    remediation_route: list[RemediationStep] = Field(min_length=1, max_length=5)

    @model_validator(mode="after")
    def total_matches_question_scores(self):
        if len({score.question_id for score in self.scores}) != 3:
            raise ValueError("score question ids must be unique")
        if self.total_score != round(sum(score.score for score in self.scores) / 3):
            raise ValueError("total_score must equal the rounded average of question scores")
        return self


class LegacyAssessmentScore(AssessmentScore):
    """Finish already-started assessments without inventing retrospective scoring weights."""

    scores: list[QuestionEvaluation] = Field(min_length=3, max_length=3)
