from datetime import date
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from models.enums import AgentRunStatus, AgentRunType, Familiarity, OutcomeType
from schemas.knowledge import MaterialSelection


class OnboardingRequest(MaterialSelection):
    request_id: str | None = Field(default=None, min_length=1, max_length=100)
    topic: str = Field(min_length=1, max_length=200)
    goal: str = Field(min_length=1, max_length=300)
    domain: str = Field(min_length=1, max_length=100)
    outcome_type: OutcomeType
    familiarity: Familiarity
    daily_minutes: int = Field(default=30, ge=5, le=240)
    target_date: date | None = None
    timezone: str = Field(default="UTC", min_length=1, max_length=100)
    use_diagnostic: bool = True
    session_id: str | None = Field(default=None, max_length=100)
    model: str | None = Field(default=None, min_length=1, max_length=100)

    @field_validator("topic", "goal", "domain", "timezone")
    @classmethod
    def strip_required_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value


class AgentStep(BaseModel):
    step_id: str
    prompt: str
    input_type: str = "text"
    choices: list[str] = Field(default_factory=list)
    current: int
    total: int


class AgentRunResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    run_id: str
    type: AgentRunType
    status: AgentRunStatus
    version: int
    processing: bool = False
    stage: str | None = None
    session_id: str | None = None
    step: AgentStep | None = None
    preview: dict[str, Any] | None = None
    result: dict[str, Any] | None = None
    error: dict[str, Any] | None = None


class TopicPlanRequest(MaterialSelection):
    request_id: str | None = Field(default=None, min_length=1, max_length=100)
    goal: str = Field(min_length=1, max_length=300)
    domain: str = Field(min_length=1, max_length=100)
    outcome_type: OutcomeType
    familiarity: Familiarity
    daily_minutes: int = Field(default=30, ge=5, le=240)
    target_date: date | None = None
    timezone: str = Field(default="UTC", min_length=1, max_length=100)
    use_diagnostic: bool = False
    session_id: str | None = Field(default=None, max_length=100)
    model: str | None = Field(default=None, min_length=1, max_length=100)

    @field_validator("goal", "domain", "timezone")
    @classmethod
    def strip_required_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value


class AgentAnswerRequest(BaseModel):
    step_id: str = Field(min_length=1, max_length=100)
    version: int = Field(ge=0)
    answer: str = Field(min_length=1, max_length=5000)


class ConfirmRunRequest(BaseModel):
    request_id: str = Field(min_length=1, max_length=100)
    version: int = Field(ge=0)


class RunUpdateRequest(BaseModel):
    regenerate: bool = False
    request_id: str | None = Field(default=None, min_length=1, max_length=100)
    version: int | None = Field(default=None, ge=0)
    goal: str | None = Field(default=None, min_length=1, max_length=300)
    daily_minutes: int | None = Field(default=None, ge=5, le=240)
    target_date: date | None = None
    timezone: str | None = Field(default=None, min_length=1, max_length=100)

    @field_validator("goal", "timezone")
    @classmethod
    def strip_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value

    @model_validator(mode="after")
    def require_a_change(self):
        for field in {"goal", "daily_minutes", "timezone"} & self.model_fields_set:
            if getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        if self.regenerate and (self.request_id is None or self.version is None):
            raise ValueError("regeneration requires a request id and input version")
        if not self.regenerate and not self.model_fields_set.intersection(
            {"goal", "daily_minutes", "target_date", "timezone"}
        ):
            raise ValueError("at least one field is required")
        return self


__all__ = [
    "AgentRunResponse",
    "AgentRunStatus",
    "AgentRunType",
    "AgentStep",
    "AgentAnswerRequest",
    "ConfirmRunRequest",
    "Familiarity",
    "OnboardingRequest",
    "OutcomeType",
    "RunUpdateRequest",
    "TopicPlanRequest",
]
