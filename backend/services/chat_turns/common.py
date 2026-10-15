"""Shared turn contracts and clock."""

from dataclasses import dataclass
from datetime import datetime, timezone
from core.errors import ApiError
from models import ChatMessage, ChatSession, ChatTurn


GENERATION_LEASE_SECONDS = 360


TERMINAL_STATUSES = {"complete", "failed", "interrupted"}


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _error(code: str, message: str, status: int = 409) -> ApiError:
    return ApiError(status_code=status, code=code, message=message, retryable=False)


@dataclass
class StartedChatTurn:
    session: ChatSession
    turn: ChatTurn
    user_message: ChatMessage
    ai_message: ChatMessage
    replayed: bool = False
