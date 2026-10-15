"""Publish stop intent and invalidate deleted context."""

from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from models import ChatCancellation, ChatMessage, ChatSession, ChatTurn
from .common import utcnow, _error
from .metadata import _invalidate_summary_values, _mark_interrupted
from .recovery import get_chat_turn


def cancel_chat_turn(
    db: Session,
    *,
    user_id: int,
    session_id: str,
    request_id: str,
) -> ChatTurn | None:
    turn = get_chat_turn(db, user_id=user_id, request_id=request_id)
    if turn is not None:
        owned_session = (
            db.query(ChatSession.id)
            .filter_by(
                id=turn.chat_session_id,
                user_id=user_id,
                session_id=session_id,
            )
            .first()
        )
        if owned_session is None:
            raise _error("CHAT_REQUEST_NOT_FOUND", "请求不属于该会话", 404)
        if turn.status != "generating":
            return turn
    cancellation = (
        db.query(ChatCancellation).filter_by(user_id=user_id, request_id=request_id).one_or_none()
    )
    if cancellation is not None and cancellation.session_id != session_id:
        raise _error("CHAT_REQUEST_CONFLICT", "请求标识已用于其他会话")
    if cancellation is None:
        db.add(ChatCancellation(user_id=user_id, request_id=request_id, session_id=session_id))
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            cancellation = (
                db.query(ChatCancellation)
                .filter_by(user_id=user_id, request_id=request_id)
                .one_or_none()
            )
            if cancellation is None or cancellation.session_id != session_id:
                raise _error("CHAT_REQUEST_CONFLICT", "请求标识已用于其他会话")
    else:
        db.commit()
    # Start a fresh read after publishing the stop intent: begin may have committed
    # while this request was persisting a tombstone for a previously invisible turn.
    turn = get_chat_turn(db, user_id=user_id, request_id=request_id)
    if turn is None:
        return None
    session = (
        db.query(ChatSession)
        .filter_by(id=turn.chat_session_id, user_id=user_id, session_id=session_id)
        .one_or_none()
    )
    if session is None:
        return None
    if turn.status != "generating":
        return turn
    changed = (
        db.query(ChatSession)
        .filter_by(
            id=session.id,
            active_request_id=request_id,
            generation_lease_token=turn.generation_token,
        )
        .update(
            {
                "active_request_id": None,
                "generation_lease_token": None,
                "generation_lease_until": None,
            },
            synchronize_session=False,
        )
    )
    if changed:
        _mark_interrupted(db, turn, "USER_CANCELLED")
        db.commit()
    else:
        db.rollback()
    return get_chat_turn(db, user_id=user_id, request_id=request_id)


def invalidate_chat_contexts_for_messages(
    db: Session,
    *,
    user_id: int,
    message_ids: list[int],
    session_id: str | None = None,
    topic_id: int | None = None,
) -> None:
    """Invalidate derived data in the caller's deletion transaction (no commit)."""
    session_names = {
        value
        for (value,) in db.query(ChatMessage.session_id).filter(
            ChatMessage.user_id == user_id,
            ChatMessage.id.in_(message_ids),
        )
    }
    sessions = db.query(ChatSession).filter(ChatSession.user_id == user_id)
    if session_id is not None:
        sessions = sessions.filter(ChatSession.session_id == session_id)
    elif topic_id is not None:
        sessions = sessions.filter(
            or_(ChatSession.topic_id == topic_id, ChatSession.session_id.in_(session_names))
        )
    else:
        sessions = sessions.filter(ChatSession.session_id.in_(session_names))
    ids = [value for (value,) in sessions.with_entities(ChatSession.id)]
    if not ids:
        return
    if session_id is not None or topic_id is not None:
        # Explicitly delete for SQLite deployments without FK enforcement as well.
        db.query(ChatTurn).filter(ChatTurn.chat_session_id.in_(ids)).delete(
            synchronize_session=False
        )
        sessions.delete(synchronize_session=False)
        return
    sessions.update(
        {
            **_invalidate_summary_values(),
            "active_request_id": None,
            "generation_lease_token": None,
            "generation_lease_until": None,
        },
        synchronize_session=False,
    )
    for active in db.query(ChatTurn).filter(
        ChatTurn.chat_session_id.in_(ids), ChatTurn.status == "generating"
    ):
        _mark_interrupted(db, active, "CHAT_CONTEXT_CHANGED")
    for turn in db.query(ChatTurn).filter(
        ChatTurn.chat_session_id.in_(ids),
        or_(ChatTurn.user_message_id.in_(message_ids), ChatTurn.ai_message_id.in_(message_ids)),
    ):
        turn.status = "deleted"
        turn.finished_at = utcnow()
        if turn.user_message_id in message_ids:
            turn.user_message_id = None
        if turn.ai_message_id in message_ids:
            turn.ai_message_id = None
    db.query(ChatTurn).filter(
        ChatTurn.regenerate_message_id.in_(message_ids), ChatTurn.user_id == user_id
    ).update({"regenerate_message_id": None}, synchronize_session=False)
    db.flush()
