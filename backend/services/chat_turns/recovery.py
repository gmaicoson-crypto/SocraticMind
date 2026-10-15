"""Turn lookup, idempotent replay and abandoned lease recovery."""

from datetime import timezone
from sqlalchemy.orm import Session
from models import ChatCancellation, ChatMessage, ChatSession, ChatTurn
from .common import utcnow, _error, StartedChatTurn
from .metadata import _mark_interrupted


def get_chat_turn(db: Session, *, user_id: int, request_id: str) -> ChatTurn | None:
    return (
        db.query(ChatTurn)
        .filter_by(user_id=user_id, request_id=request_id)
        .populate_existing()
        .one_or_none()
    )


def is_chat_cancelled(db: Session, *, user_id: int, request_id: str) -> bool:
    return (
        db.query(ChatCancellation.id).filter_by(user_id=user_id, request_id=request_id).first()
        is not None
    )


def _replay(db: Session, turn: ChatTurn, fingerprint: str) -> StartedChatTurn:
    if turn.request_fingerprint != fingerprint:
        raise _error("CHAT_REQUEST_CONFLICT", "请求标识已用于不同内容，请重新发送")
    session = db.get(ChatSession, turn.chat_session_id)
    user_message = db.get(ChatMessage, turn.user_message_id) if turn.user_message_id else None
    ai_message = db.get(ChatMessage, turn.ai_message_id) if turn.ai_message_id else None
    if (
        session is None
        or user_message is None
        or ai_message is None
        or turn.status in {"deleted", "superseded"}
    ):
        raise _error("CHAT_REQUEST_DELETED", "该请求的消息已删除或替换，请重新发送")
    deadline = session.generation_lease_until
    if (
        turn.status == "generating"
        and deadline is not None
        and deadline.replace(tzinfo=timezone.utc) < utcnow()
    ):
        changed = (
            db.query(ChatSession)
            .filter(
                ChatSession.id == session.id,
                ChatSession.active_request_id == turn.request_id,
                ChatSession.generation_lease_token == turn.generation_token,
                ChatSession.generation_lease_until < utcnow(),
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
            _mark_interrupted(db, turn, "GENERATION_LEASE_EXPIRED")
            db.commit()
        else:
            db.rollback()
            db.refresh(turn)
    return StartedChatTurn(session, turn, user_message, ai_message, True)


def recover_chat_turn(db: Session, *, user_id: int, request_id: str) -> ChatTurn:
    """Observe a persisted request without starting work; expire abandoned leases."""
    turn = get_chat_turn(db, user_id=user_id, request_id=request_id)
    if turn is None:
        raise _error("CHAT_REQUEST_NOT_FOUND", "请求不存在", 404)
    return _replay(db, turn, turn.request_fingerprint).turn
