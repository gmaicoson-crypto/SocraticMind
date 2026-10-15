from dataclasses import dataclass
from typing import Any, Callable
from sqlalchemy.orm import Session, sessionmaker
from models.progress import ChatMessage
from schemas.chat import ChatRequest
from services.chat_context import PreparedChatContext
from services.chat_lifecycle import StartedChatTurn


@dataclass(frozen=True)
class ChatStreamDependencies:
    chat_stream: Callable[..., Any]
    assemble_chat_context: Callable[..., Any]
    iter_web_search: Callable[..., Any]
    schedule_chat_summary: Callable[..., Any]
    run_one_summary_job: Callable[..., Any]
    refresh_generation_lease: Callable[..., Any]
    reserve_web_queries: Callable[..., Any]


@dataclass(frozen=True)
class ChatStreamContext:
    req: ChatRequest
    db: Session
    started: StartedChatTurn
    model_id: str
    node_label: str
    node_sub: str
    quote_source: ChatMessage | None
    prepared: PreparedChatContext | None
    has_attachment_context: bool
    context_args: dict
    context_session_factory: sessionmaker
    user_id: int
    session_pk: int
    generation_token: str
    model_user_input: str
    ids: dict[str, int]
    initial_web: dict | None
