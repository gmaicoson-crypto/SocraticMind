"""Message metadata and summary invalidation values."""

from copy import deepcopy
from sqlalchemy.orm import Session
from models import ChatMessage, ChatSession, ChatTurn
from services.web_evidence import cited_source_ids
from .common import TERMINAL_STATUSES, utcnow


def _invalidate_summary_values() -> dict:
    return {
        "content_version": ChatSession.content_version + 1,
        "summary_json": None,
        "summary_through_turn_id": None,
        "summary_source_version": None,
        "summary_status": "pending",
        "summary_lease_token": None,
        "summary_lease_until": None,
        "summary_attempts": 0,
        "summary_next_retry_at": None,
    }


def _mark_interrupted(db: Session, turn: ChatTurn, code: str) -> None:
    turn.status = "interrupted"
    turn.error_code = code
    turn.finished_at = utcnow()
    message = db.get(ChatMessage, turn.ai_message_id) if turn.ai_message_id else None
    if message is not None:
        message.metadata_json = {
            **(message.metadata_json or {}),
            **_web_metadata(message, message.content, status="interrupted", error_code=code),
            "status": "interrupted",
            "error_code": code,
        }


def _web_metadata(
    message: ChatMessage,
    content: str,
    *,
    web: dict | None = None,
    status: str = "generating",
    error_code: str | None = None,
) -> dict:
    snapshot = deepcopy(web if web is not None else (message.metadata_json or {}).get("web"))
    if snapshot is None:
        return {}
    snapshot["cited_source_ids"] = cited_source_ids(content, snapshot.get("sources", []))
    if status in TERMINAL_STATUSES and snapshot.get("status") in {"deciding", "searching"}:
        snapshot["status"] = "failed"
        snapshot["error_code"] = error_code or "WEB_PREPARATION_INTERRUPTED"
    return {"web": snapshot}
