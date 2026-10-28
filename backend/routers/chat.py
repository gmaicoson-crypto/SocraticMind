from copy import deepcopy
import hashlib
import logging
import uuid
from typing import List, Literal
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy import exists, func
from sqlalchemy.orm import Session
from ai.agent import chat_stream
from core.database import get_db
from core.avatar_uploads import UPLOAD_DIR, read_avatar_upload
from core import rate_limit
from core.deps import get_current_user
from core.ai_client import get_ai_client, resolve_model_id
from models import ChatSession, ChatTurn
from models.progress import ChatMessage
from models.user import User
from services.chat_context import assemble_chat_context
from services.web_search import iter_web_search, web_search_capabilities
from services.web_search_quota import reserve_web_queries
from services.chat_summaries import run_one_summary_job, schedule_chat_summary
from services.chat_lifecycle import cancel_chat_turn, refresh_generation_lease, recover_chat_turn
from services.progress_archive import archive_and_delete_messages, delete_agent_runs
from services.attachments.service import summaries_for_messages

from schemas.chat import (
    ChatRequest,
    HistoryResponse,
    CancelChatRequest,
    DeleteMessagesRequest,
    DeleteSessionRequest,
)
from services.chat_streaming.preparation import prepare_chat_stream
from services.chat_streaming.types import ChatStreamDependencies
from services.chat_suggestions import get_suggestions as build_suggestions


router = APIRouter(prefix="/api/chat", tags=["对话"])


log = logging.getLogger(__name__)


def _chat_avatar_prefix(user_id: int, session_id: str) -> str:
    session_hash = hashlib.sha256(session_id.encode("utf-8")).hexdigest()[:24]
    return f"ai_{user_id}_{session_hash}_"


def _delete_chat_avatar_files(user_id: int, session_id: str, *, except_name: str = "") -> int:
    deleted = 0
    for image in UPLOAD_DIR.glob(f"{_chat_avatar_prefix(user_id, session_id)}*"):
        if image.name == except_name:
            continue
        try:
            image.unlink()
            deleted += 1
        except OSError:
            log.warning("Failed to remove chat avatar %s", image)
    return deleted


def selected_model(model_id: str | None, user_id: int | None = None) -> str:
    try:
        return resolve_model_id(model_id, user_id=user_id)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.get("/capabilities")
def chat_capabilities(current_user: User = Depends(get_current_user)):
    return web_search_capabilities()


@router.post("/cancel")
def cancel_chat_endpoint(
    req: CancelChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    turn = cancel_chat_turn(
        db, user_id=current_user.id, session_id=req.session_id, request_id=req.request_id
    )
    return {
        "status": turn.status if turn else "interrupted",
        **(
            {"msg_ids": {"user": turn.user_message_id, "ai": turn.ai_message_id}}
            if turn and turn.user_message_id and turn.ai_message_id
            else {}
        ),
    }


@router.get("/requests/{request_id}")
def chat_request_state(
    request_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    turn = recover_chat_turn(db, user_id=current_user.id, request_id=request_id)
    session = db.get(ChatSession, turn.chat_session_id)
    return {
        "request_id": turn.request_id,
        "session_id": session.session_id,
        "status": turn.status,
        "preparation": turn.preparation_json,
        "error_code": turn.error_code,
        "error": {
            "code": turn.error_code,
            "message": "此前请求未完成，请重试或重新生成",
            "retryable": True,
        }
        if turn.error_code
        else None,
        "msg_ids": {"user": turn.user_message_id, "ai": turn.ai_message_id},
    }


def history_responses(db, messages):
    from services.attachments.evidence import hydrate_message_sources
    from services.knowledge.history import (
        plan_previews_for_messages,
        assessment_results_for_messages,
    )

    previews = plan_previews_for_messages(db, messages)
    assessments = assessment_results_for_messages(db, messages)
    attachments = summaries_for_messages(db, [message.id for message in messages])
    sources = (
        hydrate_message_sources(db, user_id=messages[0].user_id, messages=messages)
        if messages
        else {}
    )

    def metadata(message):
        result = deepcopy(message.metadata_json)
        if result and result.get("web") is not None and message.id in sources:
            result["web"]["sources"] = sources[message.id]
        if result and message.id in previews:
            result["preview"] = previews[message.id]
        if result and message.id in assessments:
            result["result"] = assessments[message.id]
        return result

    return [
        {
            "id": message.id,
            "role": message.role,
            "content": message.content,
            "node_key": message.node_key,
            "mode": message.mode,
            "topic_id": message.topic_id,
            "session_id": message.session_id,
            "message_type": message.message_type,
            "metadata": metadata(message),
            "created_at": message.created_at,
            "attachments": attachments.get(message.id, []),
        }
        for message in messages
    ]


def visible_messages(query):
    hidden_retry = exists().where(
        ChatTurn.ai_message_id == ChatMessage.id,
        ChatTurn.regenerate_message_id.is_not(None),
        ChatTurn.status.in_(["failed", "interrupted"]),
    )
    return query.filter(
        func.coalesce(ChatMessage.metadata_json["status"].as_string(), "complete") != "superseded",
        ~hidden_retry,
    )


@router.get("/history/{node_key}", response_model=List[HistoryResponse])
def get_history(
    node_key: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """获取指定节点的对话历史，按消息 ID 升序排列，最多返回 50 条。"""
    messages = (
        visible_messages(db.query(ChatMessage))
        .filter(
            ChatMessage.user_id == current_user.id,
            ChatMessage.node_key == node_key,
        )
        .order_by(ChatMessage.id)
        .limit(50)
        .all()
    )
    return history_responses(db, messages)


@router.get("/messages", response_model=List[HistoryResponse])
def get_all_messages(
    limit: int = 200,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """分页获取当前用户的全部消息，按 ID 倒序。"""
    messages = (
        visible_messages(db.query(ChatMessage))
        .filter(
            ChatMessage.user_id == current_user.id,
        )
        .order_by(ChatMessage.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return history_responses(db, messages)


@router.delete("/messages")
def delete_messages_endpoint(
    req: DeleteMessagesRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """批量删除指定 ID 的消息，过滤 user_id 确保只能删除自己的消息。"""
    if not req.ids:
        return {"deleted": 0}
    deleted = archive_and_delete_messages(db, user_id=current_user.id, ids=req.ids)
    db.commit()
    return {"deleted": deleted}


@router.post("/avatar")
async def upload_chat_avatar(
    session_id: str = Form(min_length=1, max_length=100),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    session_id = session_id.strip()
    if not session_id:
        raise HTTPException(status_code=422, detail="会话 ID 不能为空")
    if not rate_limit.hit(f"chat-avatar:{current_user.id}", max_calls=30, window_seconds=3600):
        raise HTTPException(status_code=429, detail="头像上传过于频繁，请稍后再试")
    suffix, data = await read_avatar_upload(file)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{_chat_avatar_prefix(current_user.id, session_id)}{uuid.uuid4().hex}{suffix}"
    (UPLOAD_DIR / filename).write_bytes(data)
    _delete_chat_avatar_files(current_user.id, session_id, except_name=filename)
    return {"avatar_url": f"/static/avatars/{filename}"}


@router.delete("/avatar")
def delete_chat_avatar(
    req: DeleteSessionRequest,
    current_user: User = Depends(get_current_user),
):
    return {"deleted": _delete_chat_avatar_files(current_user.id, req.session_id)}


@router.delete("/session")
def delete_session_endpoint(
    req: DeleteSessionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """按稳定的 session_id 删除当前用户的完整会话。"""
    deleted = archive_and_delete_messages(db, user_id=current_user.id, session_id=req.session_id)
    delete_agent_runs(db, user_id=current_user.id, session_id=req.session_id)
    db.commit()
    _delete_chat_avatar_files(current_user.id, req.session_id)
    return {"deleted": deleted}


@router.post("/stream")
def chat_stream_endpoint(
    req: ChatRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    runtime = ChatStreamDependencies(
        chat_stream=chat_stream,
        assemble_chat_context=assemble_chat_context,
        iter_web_search=iter_web_search,
        schedule_chat_summary=schedule_chat_summary,
        run_one_summary_job=run_one_summary_job,
        refresh_generation_lease=refresh_generation_lease,
        reserve_web_queries=reserve_web_queries,
    )
    return prepare_chat_stream(req, current_user, db, selected_model, runtime)


@router.get("/suggestions")
def get_suggestions(
    mode: Literal["socratic", "normal"] = "socratic",
    model: str | None = None,
    exclude: list[str] = Query(default=[]),
    topic_id: int | None = Query(default=None, gt=0),
    session_id: str | None = Query(default=None, min_length=1, max_length=100),
    node_key: str | None = Query(default=None, min_length=1, max_length=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return build_suggestions(
        db,
        current_user,
        mode=mode,
        model=model,
        model_resolver=selected_model,
        exclude=exclude,
        topic_id=topic_id,
        session_id=session_id,
        node_key=node_key,
        ai_client=get_ai_client,
    )
