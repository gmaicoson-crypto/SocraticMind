from datetime import datetime
from typing import Any, List, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from services.attachments.config import LIMITS as ATTACHMENT_LIMITS


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    request_id: str = Field(min_length=1, max_length=100)
    regenerate_message_id: int | None = Field(default=None, gt=0)
    node_key: str = Field(min_length=1, max_length=200)
    topic_id: int = Field(ge=0)
    session_id: str = Field(min_length=1, max_length=100)
    user_input: str = Field(max_length=5000)
    mode: Literal["socratic", "normal"] = "socratic"
    ai_style: str = Field(default="标准", min_length=1, max_length=20)
    kind: Literal["qa", "topic_overview", "node_overview"] = "qa"
    model: str | None = Field(default=None, min_length=1, max_length=100)
    quote_text: str | None = Field(default=None, max_length=200)
    quote_source_id: int | None = Field(default=None, gt=0)
    attachment_ids: list[str] = Field(
        default_factory=list, max_length=ATTACHMENT_LIMITS["max_attachments"]
    )

    @property
    def web_mode(self) -> Literal["auto", "off"]:
        """The server owns the policy; clients only select the kind of conversation."""
        return "auto" if self.kind == "qa" else "off"

    @field_validator("node_key", "session_id", "ai_style", "request_id")
    @classmethod
    def strip_required_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value

    @model_validator(mode="after")
    def validate_request(self):
        if (
            self.kind == "qa"
            and not self.user_input.strip()
            and not self.attachment_ids
            and self.regenerate_message_id is None
        ):
            raise ValueError("user_input must not be blank for qa")
        if len(self.attachment_ids) != len(set(self.attachment_ids)) or any(
            not item or len(item) > 36 for item in self.attachment_ids
        ):
            raise ValueError("attachment_ids must be unique resource identifiers")
        if self.kind != "qa" and self.attachment_ids:
            raise ValueError("overview requests cannot contain attachments")
        if self.kind != "qa" and self.mode != "socratic":
            raise ValueError("overview requests must use socratic mode")
        return self


class HistoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: int
    role: str
    content: str
    node_key: str = ""
    mode: str = ""
    topic_id: Optional[int] = None
    session_id: str
    message_type: str = "chat"
    metadata: dict[str, Any] | None = Field(default=None, validation_alias="metadata_json")
    created_at: datetime | None = None
    attachments: list[dict[str, Any]] = Field(default_factory=list)


class CancelChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    session_id: str = Field(min_length=1, max_length=100)
    request_id: str = Field(min_length=1, max_length=100)


class DeleteMessagesRequest(BaseModel):
    ids: List[int]


class DeleteSessionRequest(BaseModel):
    session_id: str = Field(min_length=1, max_length=100)

    @field_validator("session_id")
    @classmethod
    def strip_session_id(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("session_id must not be blank")
        return value
