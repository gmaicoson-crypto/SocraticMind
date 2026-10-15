"""Persist completion, checkpoints and lease refreshes."""

from copy import deepcopy
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from models import ChatMessage, ChatSession, ChatTurn
from .common import GENERATION_LEASE_SECONDS, TERMINAL_STATUSES, utcnow
from .metadata import _invalidate_summary_values, _web_metadata
from .recovery import get_chat_turn, is_chat_cancelled


def finish_chat_turn(
    db: Session,
    *,
    user_id: int,
    request_id: str,
    generation_token: str,
    content: str,
    status: str,
    error_code: str | None = None,
    web: dict | None = None,
) -> bool:
    if status not in TERMINAL_STATUSES:
        raise ValueError("invalid chat turn terminal status")
    turn = get_chat_turn(db, user_id=user_id, request_id=request_id)
    if turn is None or turn.status != "generating" or turn.generation_token != generation_token:
        return False
    if is_chat_cancelled(db, user_id=user_id, request_id=request_id):
        if status == "complete":
            return False
        status = "interrupted"
        error_code = "USER_CANCELLED"
    values = {
        "active_request_id": None,
        "generation_lease_token": None,
        "generation_lease_until": None,
    }
    if status == "complete" and turn.regenerate_message_id is not None:
        values.update(_invalidate_summary_values())
    owned_session = db.query(ChatSession).filter(
        ChatSession.id == turn.chat_session_id,
        ChatSession.active_request_id == request_id,
        ChatSession.generation_lease_token == turn.generation_token,
        ChatSession.content_version == turn.source_version,
    )
    if status == "complete":
        owned_session = owned_session.filter(ChatSession.generation_lease_until >= utcnow())
    # An expired generation may still release its own lease and persist a failure.
    # The request/token/version checks prevent a late callback touching a new owner.
    changed = owned_session.update(values, synchronize_session=False)
    if not changed:
        db.rollback()
        return False
    message = db.query(ChatMessage).filter_by(id=turn.ai_message_id, user_id=user_id).one_or_none()
    question = (
        db.query(ChatMessage).filter_by(id=turn.user_message_id, user_id=user_id).one_or_none()
    )
    if message is None or question is None:
        db.rollback()
        return False
    message.content = content
    message.metadata_json = {
        **(message.metadata_json or {}),
        **_web_metadata(message, content, web=web, status=status, error_code=error_code),
        "status": status,
        **({"error_code": error_code} if error_code else {}),
    }
    turn.status = status
    turn.error_code = error_code
    turn.finished_at = utcnow()
    if status == "complete" and turn.regenerate_message_id is not None:
        # Replace all prior answers for this question, including failed attempts.
        previous = (
            db.query(ChatTurn)
            .filter(
                ChatTurn.chat_session_id == turn.chat_session_id,
                ChatTurn.user_message_id == turn.user_message_id,
                ChatTurn.id != turn.id,
                ChatTurn.status != "deleted",
            )
            .all()
        )
        previous_ids = {turn.regenerate_message_id}
        for old_turn in previous:
            old_turn.status = "superseded"
            if old_turn.ai_message_id:
                previous_ids.add(old_turn.ai_message_id)
        for old_message in db.query(ChatMessage).filter(
            ChatMessage.id.in_(previous_ids), ChatMessage.user_id == user_id
        ):
            old_message.metadata_json = {
                **(old_message.metadata_json or {}),
                "status": "superseded",
            }
    db.commit()
    return True


def refresh_generation_lease(
    db: Session,
    *,
    user_id: int,
    request_id: str,
    generation_token: str,
    content: str | None = None,
    web: dict | None = None,
    preparation: dict | None = None,
    attachment_derived: bool | None = None,
) -> bool:
    turn = get_chat_turn(db, user_id=user_id, request_id=request_id)
    if turn is None or turn.status != "generating" or turn.generation_token != generation_token:
        return False
    if is_chat_cancelled(db, user_id=user_id, request_id=request_id):
        return False
    now = utcnow()
    prepared_state = {**deepcopy(turn.preparation_json or {}), **deepcopy(preparation or {})}
    lease_until = now + timedelta(seconds=GENERATION_LEASE_SECONDS)
    if prepared_state.get("deadline_at"):
        deadline = datetime.fromisoformat(prepared_state["deadline_at"]).replace(
            tzinfo=timezone.utc
        )
        if deadline <= now:
            return False
        lease_until = min(lease_until, deadline)
    claimed = (
        db.query(ChatSession)
        .filter(
            ChatSession.id == turn.chat_session_id,
            ChatSession.active_request_id == request_id,
            ChatSession.generation_lease_token == turn.generation_token,
            ChatSession.content_version == turn.source_version,
            ChatSession.generation_lease_until >= now,
        )
        .update(
            {"generation_lease_until": lease_until},
            synchronize_session=False,
        )
    )
    if not claimed:
        db.rollback()
        return False
    if preparation is not None:
        turn.preparation_json = prepared_state
    if content is not None or web is not None or attachment_derived is not None:
        message = (
            db.query(ChatMessage)
            .filter_by(id=turn.ai_message_id, user_id=user_id)
            .populate_existing()
            .one_or_none()
        )
        if message is None:
            db.rollback()
            return False
        if content is not None:
            message.content = content
        message.metadata_json = {
            **(message.metadata_json or {}),
            **_web_metadata(message, message.content, web=web),
            **(
                {"attachment_derived": attachment_derived} if attachment_derived is not None else {}
            ),
        }
    db.commit()
    return True


def checkpoint_interrupted_content(
    db: Session,
    *,
    user_id: int,
    request_id: str,
    generation_token: str,
    content: str,
) -> bool:
    """Persist the last displayed partial after cancellation without reviving a turn."""
    turn = get_chat_turn(db, user_id=user_id, request_id=request_id)
    if turn is None or turn.generation_token != generation_token or turn.status != "interrupted":
        return False
    # Lock the context version before rechecking the turn; deletion/regeneration use
    # the same session row, so neither can race between this check and persistence.
    changed = (
        db.query(ChatSession)
        .filter(
            ChatSession.id == turn.chat_session_id,
            ChatSession.content_version == turn.source_version,
        )
        .update({"updated_at": utcnow()}, synchronize_session=False)
    )
    if not changed:
        db.rollback()
        return False
    db.refresh(turn)
    if turn.status != "interrupted" or turn.generation_token != generation_token:
        db.rollback()
        return False
    message = (
        db.query(ChatMessage)
        .filter_by(id=turn.ai_message_id, user_id=user_id)
        .populate_existing()
        .one_or_none()
    )
    if (
        message is None
        or not content.startswith(message.content)
        or len(content) <= len(message.content)
    ):
        db.rollback()
        return False
    message.content = content
    message.metadata_json = {
        **(message.metadata_json or {}),
        **_web_metadata(message, content, status="interrupted", error_code=turn.error_code),
    }
    db.commit()
    return True
