"""Atomically validate and claim a new generation."""

from datetime import timedelta
import hashlib
import json
import uuid
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from models import ChatMessage, ChatSession, ChatTurn
from services.web_search import empty_web_snapshot
from services.attachments.service import validate_for_message, bind_to_message
from .common import GENERATION_LEASE_SECONDS, TERMINAL_STATUSES, utcnow, _error, StartedChatTurn
from .metadata import _mark_interrupted
from .recovery import get_chat_turn, is_chat_cancelled, _replay


def _attachment_input(db, *, user_id, session_id, mode, topic_id, ids, regenerate_message_id):
    """Freeze immutable resource revisions, including the original question on retry."""
    from models.attachment import Attachment, MessageAttachment

    ids = list(ids or [])
    if len(ids) != len(set(ids)):
        raise _error("ATTACHMENT_DUPLICATE", "同一附件不能重复添加", 422)
    if regenerate_message_id is not None:
        answer = (
            db.query(ChatMessage)
            .filter_by(
                id=regenerate_message_id,
                user_id=user_id,
                session_id=session_id,
                mode=mode,
                topic_id=topic_id,
                role="ai",
            )
            .one_or_none()
        )
        original_id = (answer.metadata_json or {}).get("user_message_id") if answer else None
        original_ids = (
            [
                row.attachment_id
                for row in db.query(MessageAttachment)
                .filter_by(user_message_id=original_id)
                .order_by(MessageAttachment.position)
            ]
            if original_id
            else []
        )
        if ids and ids != original_ids:
            raise _error("CHAT_REGENERATE_INVALID", "重新生成不能替换原问题的附件", 400)
        ids = original_ids
    if not ids:
        return [], []
    records = {
        record.id: record
        for record in db.query(Attachment).filter(
            Attachment.id.in_(ids),
            Attachment.user_id == user_id,
        )
    }
    if len(records) != len(ids):
        raise _error("ATTACHMENT_NOT_FOUND", "附件不存在或不可访问", 404)
    snapshot = [
        {
            "id": key,
            "revision": records[key].revision,
            "accepted_coverage": records[key].accepted_coverage,
        }
        for key in ids
    ]
    return ids, snapshot


def begin_chat_turn(
    db: Session,
    *,
    user_id: int,
    topic_id: int | None,
    session_id: str,
    node_key: str,
    user_input: str,
    mode: str,
    request_id: str,
    model_id: str,
    kind: str = "qa",
    ai_style: str = "标准",
    quote_text: str | None = None,
    quote_source_id: int | None = None,
    regenerate_message_id: int | None = None,
    web_mode: str | None = None,
    attachment_ids: list[str] | None = None,
) -> StartedChatTurn:
    """Claim a session and persist placeholders atomically before streaming starts."""
    topic_id = topic_id or None
    web_mode = web_mode or ("auto" if kind == "qa" else "off")
    if web_mode not in {"auto", "off"} or (kind != "qa" and web_mode != "off"):
        raise ValueError("invalid web mode for chat kind")
    if is_chat_cancelled(db, user_id=user_id, request_id=request_id):
        raise _error("CHAT_REQUEST_CANCELLED", "该请求已停止，请使用新的请求重新发送")
    attachment_ids, attachment_snapshot = _attachment_input(
        db,
        user_id=user_id,
        session_id=session_id,
        mode=mode,
        topic_id=topic_id,
        ids=attachment_ids,
        regenerate_message_id=regenerate_message_id,
    )
    if kind != "qa" and attachment_ids:
        raise _error("ATTACHMENT_SCOPE_MISMATCH", "概览消息不能包含附件", 422)
    fingerprint = hashlib.sha256(
        json.dumps(
            {
                "session_id": session_id,
                "topic_id": topic_id,
                "node_key": node_key,
                "user_input": user_input,
                "mode": mode,
                "model_id": model_id,
                "kind": kind,
                "ai_style": ai_style,
                "quote_text": quote_text,
                "quote_source_id": quote_source_id,
                "regenerate_message_id": regenerate_message_id,
                "web_mode": web_mode,
                "attachments": attachment_snapshot,
            },
            ensure_ascii=False,
            sort_keys=True,
        ).encode()
    ).hexdigest()
    existing = get_chat_turn(db, user_id=user_id, request_id=request_id)
    if existing is not None:
        return _replay(db, existing, fingerprint)

    try:
        session = (
            db.query(ChatSession)
            .filter_by(user_id=user_id, session_id=session_id)
            .populate_existing()
            .one_or_none()
        )
        if session is None:
            # Existing local histories remain isolated by their original scope.
            scopes = (
                db.query(ChatMessage.topic_id, ChatMessage.mode)
                .filter_by(user_id=user_id, session_id=session_id, message_type="chat")
                .distinct()
                .all()
            )
            if any(
                (scope.topic_id or None, scope.mode or "socratic") != (topic_id, mode)
                for scope in scopes
            ):
                raise _error("CHAT_SESSION_SCOPE_CONFLICT", "该会话属于其他主题或模式，请新建会话")
            session = ChatSession(
                user_id=user_id,
                session_id=session_id,
                topic_id=topic_id,
                mode=mode,
                summary_model=model_id,
            )
            db.add(session)
            db.flush()
        if (session.topic_id, session.mode) != (topic_id, mode):
            raise _error("CHAT_SESSION_SCOPE_CONFLICT", "该会话属于其他主题或模式，请新建会话")

        now = utcnow()
        token = str(uuid.uuid4())
        previous_request = session.active_request_id
        claimed = (
            db.query(ChatSession)
            .filter(
                ChatSession.id == session.id,
                or_(
                    ChatSession.active_request_id.is_(None),
                    ChatSession.generation_lease_until < now,
                ),
            )
            .update(
                {
                    "active_request_id": request_id,
                    "generation_lease_token": token,
                    "generation_lease_until": now + timedelta(seconds=GENERATION_LEASE_SECONDS),
                },
                synchronize_session=False,
            )
        )
        if not claimed:
            # A simultaneous identical request may have committed between the reads.
            db.rollback()
            existing = get_chat_turn(db, user_id=user_id, request_id=request_id)
            if existing is not None:
                return _replay(db, existing, fingerprint)
            raise _error("CHAT_SESSION_BUSY", "当前会话正在生成回答，请稍后重试")
        if previous_request:
            previous = get_chat_turn(db, user_id=user_id, request_id=previous_request)
            if previous is not None and previous.status == "generating":
                _mark_interrupted(db, previous, "GENERATION_LEASE_EXPIRED")
        db.refresh(session)
        if session.summary_model is None and session.summary_status != "running":
            session.summary_model = model_id
        if is_chat_cancelled(db, user_id=user_id, request_id=request_id):
            raise _error("CHAT_REQUEST_CANCELLED", "该请求已停止，请使用新的请求重新发送")

        old_turn = None
        if regenerate_message_id is not None:
            old_turn = (
                db.query(ChatTurn)
                .filter_by(
                    user_id=user_id,
                    chat_session_id=session.id,
                    ai_message_id=regenerate_message_id,
                )
                .one_or_none()
            )
            old_ai = (
                db.query(ChatMessage)
                .filter_by(
                    id=regenerate_message_id,
                    user_id=user_id,
                    session_id=session_id,
                    role="ai",
                    message_type="chat",
                )
                .one_or_none()
            )
            if (
                old_ai is None
                or (old_ai.metadata_json or {}).get("status", "complete") not in TERMINAL_STATUSES
            ):
                raise _error("CHAT_REGENERATE_INVALID", "该回答无法重新生成", 400)
            if old_turn is not None and old_turn.status not in TERMINAL_STATUSES:
                raise _error("CHAT_REGENERATE_INVALID", "该回答无法重新生成", 400)
            if old_turn is not None:
                user_message = (
                    db.get(ChatMessage, old_turn.user_message_id)
                    if old_turn.user_message_id
                    else None
                )
                if old_turn.kind != kind or old_turn.node_key != node_key[:100]:
                    raise _error(
                        "CHAT_REGENERATE_INVALID", "重新生成需要使用原问题的节点和类型", 400
                    )
            else:
                user_message = (
                    db.query(ChatMessage)
                    .filter(
                        ChatMessage.user_id == user_id,
                        ChatMessage.session_id == session_id,
                        ChatMessage.role == "user",
                        ChatMessage.message_type == "chat",
                        ChatMessage.id < old_ai.id,
                    )
                    .order_by(ChatMessage.id.desc())
                    .first()
                )
            if user_message is None or user_message.content != user_input:
                raise _error("CHAT_REGENERATE_INVALID", "重新生成需要对应原问题", 400)
            if attachment_snapshot != (user_message.metadata_json or {}).get(
                "attachment_snapshot", []
            ):
                raise _error("CHAT_REGENERATE_INVALID", "原问题附件已改变或不可用", 400)
            if (
                db.query(ChatMessage.id)
                .filter(
                    ChatMessage.user_id == user_id,
                    ChatMessage.session_id == session_id,
                    ChatMessage.role == "user",
                    ChatMessage.message_type == "chat",
                    ChatMessage.id > user_message.id,
                )
                .first()
                is not None
            ):
                raise _error(
                    "CHAT_REGENERATE_NOT_LATEST", "仅支持重新生成当前会话最后一轮回答", 400
                )
        else:
            attachments = (
                validate_for_message(
                    db,
                    user_id=user_id,
                    session_id=session_id,
                    topic_id=topic_id,
                    mode=mode,
                    ids=attachment_ids,
                )
                if attachment_ids
                else []
            )
            if attachment_snapshot != [
                {
                    "id": item.id,
                    "revision": item.revision,
                    "accepted_coverage": item.accepted_coverage,
                }
                for item in attachments
            ]:
                raise _error("ATTACHMENT_NOT_READY", "附件状态已更新，请重新发送")
            user_message = ChatMessage(
                user_id=user_id,
                topic_id=topic_id,
                session_id=session_id,
                node_key=node_key[:100],
                role="user",
                content=user_input,
                mode=mode,
                message_type="chat",
                metadata_json={
                    "status": "complete",
                    "request_id": request_id,
                    "kind": kind,
                    "attachment_snapshot": attachment_snapshot,
                    "attachment_derived": bool(attachment_snapshot),
                    **({"quote": quote_text} if quote_text else {}),
                    **({"quote_source_id": quote_source_id} if quote_source_id else {}),
                },
            )
            db.add(user_message)
            db.flush()
            if attachments:
                bind_to_message(
                    db, message_id=user_message.id, session_id=session_id, attachments=attachments
                )
        ai_message = ChatMessage(
            user_id=user_id,
            topic_id=topic_id,
            session_id=session_id,
            node_key=node_key[:100],
            role="ai",
            content="",
            mode=mode,
            message_type="chat",
            metadata_json={
                "status": "streaming",
                "request_id": request_id,
                "user_message_id": user_message.id,
                "kind": kind,
                "node_key": node_key[:100],
                "web": empty_web_snapshot(web_mode, "off" if web_mode == "off" else "deciding"),
                **(
                    {"regenerate_message_id": regenerate_message_id}
                    if regenerate_message_id
                    else {}
                ),
            },
        )
        db.add(ai_message)
        db.flush()
        turn = ChatTurn(
            chat_session_id=session.id,
            user_id=user_id,
            request_id=request_id,
            request_fingerprint=fingerprint,
            user_message_id=user_message.id,
            ai_message_id=ai_message.id,
            regenerate_message_id=regenerate_message_id,
            model_id=model_id,
            node_key=node_key[:100],
            kind=kind,
            generation_token=token,
            source_version=session.content_version,
        )
        db.add(turn)
        db.commit()
        return StartedChatTurn(session, turn, user_message, ai_message)
    except IntegrityError:
        db.rollback()
        existing = get_chat_turn(db, user_id=user_id, request_id=request_id)
        if existing is not None:
            return _replay(db, existing, fingerprint)
        raise _error("CHAT_SESSION_BUSY", "当前会话状态已更新，请重试")
    except Exception:
        db.rollback()
        raise
