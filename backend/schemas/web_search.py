"""Stable wire/storage schemas for a bounded automatic web-search preparation."""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

WebMode = Literal["auto", "off"]
WebStatus = Literal["off", "skipped", "deciding", "searching", "ready", "failed", "unavailable"]
Freshness = Literal["any", "day", "week", "month", "year"]
ReasonCode = Literal[
    "stable_knowledge",
    "current_information",
    "verify_claim",
    "find_resources",
    "explicit_search",
    "user_restricted",
    "insufficient_context",
    "unsupported_url_fetch",
]
Query = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=240)]


class SearchDecision(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    need_search: bool
    queries: list[Query] = Field(max_length=2)
    freshness: Freshness
    reason_code: ReasonCode

    @model_validator(mode="after")
    def validate_search(self):
        if self.need_search != bool(self.queries):
            raise ValueError("搜索必须提供查询，不搜索时查询必须为空")
        if self.need_search and self.reason_code in {
            "user_restricted",
            "insufficient_context",
            "unsupported_url_fetch",
            "stable_knowledge",
        }:
            raise ValueError("该决策原因不能发起搜索")
        if len(set(self.queries)) != len(self.queries):
            raise ValueError("查询不能重复")
        return self


class WebWarning(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: str
    message: str
    retryable: bool


class WebSource(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(pattern=r"^s[1-5]$")
    title: str = Field(max_length=300)
    url: str = Field(max_length=2048)
    domain: str = Field(max_length=253)
    excerpt: str = Field(max_length=2400)
    published_at: str | None = None
    retrieved_at: str


class WebMetrics(BaseModel):
    decision_latency_ms: int | None = None
    decision_tokens: int | None = None
    search_latency_ms: int | None = None
    search_queries: int = 0
    search_credits: float | None = None
    invalid_citations: int = 0


class WebSnapshot(BaseModel):
    model_config = ConfigDict(extra="forbid")
    schema_version: Literal[1] = 1
    strategy_version: str = "auto-v1"
    config_version: str
    requested_mode: WebMode
    status: WebStatus
    decision: dict | None = None
    queries: list[Query] = Field(default_factory=list, max_length=2)
    searched_at: str | None = None
    sources: list[WebSource] = Field(default_factory=list, max_length=5)
    cited_source_ids: list[str] = Field(default_factory=list, max_length=5)
    error_code: str | None = None
    warnings: list[WebWarning] = Field(default_factory=list)
    metrics: WebMetrics = Field(default_factory=WebMetrics)
