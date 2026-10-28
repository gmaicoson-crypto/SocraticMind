"""Public material selection and bounded retrieval contracts."""

from typing import Literal

from pydantic import BaseModel, Field, model_validator

from schemas.attachments import AttachmentSummary


class MaterialRef(BaseModel):
    attachment_id: str = Field(min_length=1, max_length=36)
    revision: int = Field(ge=1)


class MaterialSelection(BaseModel):
    materials: list[MaterialRef] = Field(default_factory=list, max_length=20)

    @model_validator(mode="after")
    def unique_materials(self):
        if len({item.attachment_id for item in self.materials}) != len(self.materials):
            raise ValueError("文档不能重复选择")
        return self


class IndexStatus(BaseModel):
    status: Literal[
        "disabled",
        "not_indexed",
        "pending",
        "running",
        "ready",
        "failed",
        "cancelled",
        "unavailable",
    ]
    completed_chunks: int = 0
    total_chunks: int = 0
    error_code: str | None = None
    api_calls: int = 0
    known_input_tokens: int = 0
    unknown_usage_calls: int = 0


class IndexRequest(BaseModel):
    revision: int = Field(ge=1)


class KnowledgeDocumentSummary(AttachmentSummary):
    index_status: IndexStatus | None = None


class TopicMaterialSummary(BaseModel):
    document: KnowledgeDocumentSummary
    revision: int
    available: bool


class RetrievalRequest(BaseModel):
    query: str = Field(min_length=1, max_length=4000)
    purpose: Literal["question", "plan", "assessment", "review"] = "question"
    token_budget: int = Field(default=4000, ge=256, le=24000)


class RetrievalResult(BaseModel):
    status: Literal["ready", "no_evidence", "unavailable"]
    sources: list[dict] = Field(default_factory=list)
    coverage: list[dict] = Field(default_factory=list)
    method: str = "lexical"
    index_status: str = "not_used"
    metrics: dict = Field(default_factory=dict)
    latency_ms: int = 0
    candidate_count: int = 0
    warnings: list[str] = Field(default_factory=list)
