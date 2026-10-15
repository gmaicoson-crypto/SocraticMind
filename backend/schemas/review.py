from pydantic import BaseModel, Field, field_validator

from schemas.structured_ai import QuestionFeedback


class ReviewAnswerRequest(BaseModel):
    request_id: str = Field(min_length=1, max_length=100)
    version: int = Field(ge=1)
    answer: str = Field(min_length=1, max_length=10000)
    model: str | None = Field(default=None, max_length=100)
    timezone: str | None = Field(default=None, max_length=100)

    @field_validator("answer")
    @classmethod
    def nonblank_answer(cls, value):
        if not value.strip():
            raise ValueError("answer must not be blank")
        return value.strip()


class ReviewScore(QuestionFeedback):
    score: int = Field(ge=0, le=4)
    rationale: str = Field(min_length=1, max_length=1000)
    evaluation_confidence: float = Field(ge=0, le=1)
    critical_misconception: bool
