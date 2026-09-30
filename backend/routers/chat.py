from datetime import datetime
import hashlib
import json
import logging
import uuid
from time import perf_counter
from typing import Any, List, Literal, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy import exists, func
from sqlalchemy.orm import Session, sessionmaker
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from ai.agent import ChatStreamError, chat_stream
from ai.prompts import build_socratic_suggestions_prompt, NORMAL_SUGGESTIONS_PROMPT
from ai.util import extract_json_from_markdown
from core.database import get_db
from core.avatar_uploads import UPLOAD_DIR, read_avatar_upload
from core import rate_limit
from core.deps import get_current_user
from core.ai_client import get_ai_client, resolve_llm_profile, resolve_model_id
from core.user_llm import load_user_profiles
from models import ChatSession, ChatTurn
from models.progress import ChatMessage
from models.node import Node
from models.topic import Topic
from models.user import User
from core.errors import ApiError
from core.context_budget import (
    ContextWindowExceeded,
    count_messages,
    count_method,
    get_context_policy,
)
from services.chat_context import assemble_chat_context
from services.chat_summaries import run_one_summary_job, schedule_chat_summary
from services.chat_lifecycle import (
    begin_chat_turn,
    finish_chat_turn,
    cancel_chat_turn,
    refresh_generation_lease,
    checkpoint_interrupted_content,
    get_chat_turn,
)
from services.progress_archive import archive_and_delete_messages, delete_agent_runs

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

    @field_validator("node_key", "session_id", "ai_style", "request_id")
    @classmethod
    def strip_required_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value

    @model_validator(mode="after")
    def validate_request(self):
        if self.kind == "qa" and not self.user_input.strip():
            raise ValueError("user_input must not be blank for qa")
        if self.kind != "qa" and self.mode != "socratic":
            raise ValueError("overview requests must use socratic mode")
        return self


def selected_model(model_id: str | None, user_id: int | None = None) -> str:
    try:
        return resolve_model_id(model_id, user_id=user_id)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


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


@router.post("/stream")
def chat_stream_endpoint(
    req: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    load_user_profiles(db, current_user.id)
    # topic_overview 模式下 node_key 承载的是主题名，不需要查节点表
    if req.kind == "topic_overview":
        topic = (
            db.query(Topic)
            .filter(
                Topic.id == req.topic_id,
                Topic.user_id == current_user.id,
            )
            .first()
        )
        if not topic:
            raise HTTPException(status_code=404, detail="主题不存在")
        node_label = topic.title
        node_sub = ""
    elif req.mode == "normal":
        node_label = "通用助手"
        node_sub = "General Assistant"
    else:
        # 通过 join Topic 校验节点归属，防止越权访问其他用户的节点
        node = (
            db.query(Node)
            .join(Topic)
            .filter(
                Node.node_key == req.node_key,
                Topic.id == req.topic_id,
                Topic.user_id == current_user.id,
            )
            .first()
        )
        if not node:
            raise HTTPException(status_code=404, detail="节点不存在")
        node_label = node.label
        node_sub = node.sub

    model_id = selected_model(req.model, current_user.id)

    quote_source = None
    if req.quote_source_id is not None:
        quote_source = (
            db.query(ChatMessage)
            .filter(
                ChatMessage.id == req.quote_source_id,
                ChatMessage.user_id == current_user.id,
                ChatMessage.session_id == req.session_id,
                ChatMessage.mode == req.mode,
                ChatMessage.role == "ai",
            )
            .one_or_none()
        )
        if quote_source is None or not req.quote_text:
            raise HTTPException(status_code=400, detail="引用消息无效")

    started = begin_chat_turn(
        db,
        user_id=current_user.id,
        topic_id=req.topic_id if req.mode == "socratic" else None,
        session_id=req.session_id,
        node_key=node_label if req.kind == "topic_overview" else req.node_key,
        user_input=req.user_input,
        mode=req.mode,
        request_id=req.request_id,
        model_id=model_id,
        kind=req.kind,
        ai_style=req.ai_style,
        quote_text=req.quote_text,
        quote_source_id=req.quote_source_id,
        regenerate_message_id=req.regenerate_message_id,
    )
    user_id = current_user.id
    session_pk = started.session.id
    generation_token = started.turn.generation_token
    user_msg, ai_msg = started.user_message, started.ai_message
    model_user_input = user_msg.content
    ids = {"user": user_msg.id, "ai": ai_msg.id}

    def event(payload):
        return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"

    if started.replayed:
        if started.turn.status == "generating":
            raise ApiError(
                status_code=409,
                code="CHAT_REQUEST_RUNNING",
                message="该请求仍在生成，请稍后恢复会话",
                retryable=True,
            )
        replay_status = started.turn.status
        replay_content = ai_msg.content
        replay_error = started.turn.error_code

        def replay():
            yield event({"msg_ids": ids})
            if replay_content:
                yield event({"text": replay_content})
            yield event({"request_state": {"status": replay_status}})
            if replay_status != "complete":
                yield event(
                    {
                        "error": {
                            "code": replay_error or "CHAT_REQUEST_INCOMPLETE",
                            "message": "此前请求未完成，请重新生成",
                            "retryable": True,
                        }
                    }
                )
            yield "data: [DONE]\n\n"

        return StreamingResponse(replay(), media_type="text/event-stream")

    context_args = dict(
        user_message_id=user_msg.id,
        model_id=model_id,
        node_key=req.node_key,
        node_label=node_label,
        node_sub=node_sub,
        user_input=model_user_input,
        mode=req.mode,
        ai_style=req.ai_style,
        kind=req.kind,
        regenerate=req.regenerate_message_id is not None,
        quote_source=quote_source,
    )
    try:
        prepared = assemble_chat_context(db, session=started.session, **context_args)
    except Exception as error:
        finish_chat_turn(
            db,
            user_id=user_id,
            request_id=req.request_id,
            generation_token=generation_token,
            content="",
            status="failed",
            error_code=(
                "CHAT_CONTEXT_TOO_LARGE"
                if isinstance(error, ContextWindowExceeded)
                else "CONTEXT_PREPARATION_FAILED"
            ),
        )
        if isinstance(error, ContextWindowExceeded):
            return JSONResponse(
                status_code=413,
                content={
                    "code": "CHAT_CONTEXT_TOO_LARGE",
                    "message": "当前问题或引用内容超过模型可用窗口，请缩小引用范围或拆分输入",
                    "retryable": False,
                    "msg_ids": ids,
                },
            )
        raise

    input_tokens = prepared.input_tokens
    log.info(
        "chat_context_prepared request=%s model=%s input_tokens=%d count_method=%s omitted_history=%s",
        req.request_id,
        model_id,
        input_tokens,
        count_method(model_id),
        prepared.omitted_history,
    )
    context_session_factory = sessionmaker(bind=db.get_bind())
    # No request-scoped read transaction is held while waiting for the provider.
    db.commit()

    def generate():
        full_text = []
        stream = None
        began = perf_counter()
        checkpoint = began
        first_chunk = True
        terminal = False
        active_context = prepared
        try:
            yield event({"msg_ids": ids})
            if not refresh_generation_lease(
                db, user_id=user_id, request_id=req.request_id, generation_token=generation_token
            ):
                raise ApiError(
                    status_code=409,
                    code="CHAT_REQUEST_CANCELLED",
                    message="本次生成已停止",
                    retryable=True,
                )
            if active_context.omitted_history:
                yield event({"type": "context_compacting"})
                schedule_chat_summary(db, session_id=session_pk, model_id=model_id)
                # Reuse the durable worker's lease and version checks. One bounded
                # attempt avoids silently dropping unprocessed older turns.
                run_one_summary_job(
                    context_session_factory, target_session_id=session_pk, force=True
                )
                db.expire_all()
                context_session = db.get(ChatSession, session_pk)
                if context_session is None:
                    raise ApiError(
                        status_code=409,
                        code="CHAT_REQUEST_CANCELLED",
                        message="本次生成已停止或会话已删除",
                        retryable=True,
                    )
                active_context = assemble_chat_context(db, session=context_session, **context_args)
                db.commit()
                if active_context.omitted_history:
                    raise ApiError(
                        status_code=503,
                        code="CHAT_CONTEXT_NOT_READY",
                        message="较早的对话尚未整理完成，请稍后重试；聊天记录已保留",
                        retryable=True,
                    )
                if not refresh_generation_lease(
                    db,
                    user_id=user_id,
                    request_id=req.request_id,
                    generation_token=generation_token,
                ):
                    raise ApiError(
                        status_code=409,
                        code="CHAT_REQUEST_CANCELLED",
                        message="本次生成已停止",
                        retryable=True,
                    )
                yield event({"type": "context_ready"})
            input_tokens = active_context.input_tokens
            stream = chat_stream(
                messages=active_context.history,
                node_label=node_label,
                node_sub=node_sub,
                user_input=model_user_input,
                mode=req.mode,
                ai_style=req.ai_style,
                kind=req.kind,
                memories=active_context.memories,
                model_id=model_id,
                prepared_messages=active_context.messages,
                on_usage=lambda usage: log.info(
                    "chat_token_usage request=%s estimated_input=%s input_delta=%s usage=%s",
                    req.request_id,
                    input_tokens,
                    (usage["prompt_tokens"] - input_tokens)
                    if isinstance(usage.get("prompt_tokens"), int)
                    else None,
                    usage,
                ),
            )
            for chunk in stream:
                full_text.append(chunk)
                now = perf_counter()
                if first_chunk or now - checkpoint >= 0.5:
                    if not refresh_generation_lease(
                        db,
                        user_id=user_id,
                        request_id=req.request_id,
                        generation_token=generation_token,
                        content="".join(full_text),
                    ):
                        raise ApiError(
                            status_code=409,
                            code="CHAT_REQUEST_CANCELLED",
                            message="本次生成已停止或会话内容已改变",
                            retryable=True,
                        )
                    checkpoint = now
                if first_chunk:
                    log.info(
                        "chat_first_token request=%s latency_ms=%d",
                        req.request_id,
                        round((now - began) * 1000),
                    )
                    first_chunk = False
                yield event({"text": chunk})
            content = "".join(full_text)
            if not content.strip():
                raise ApiError(
                    status_code=502,
                    code="AI_EMPTY_RESPONSE",
                    message="模型未返回可用回答，请重新生成",
                    retryable=True,
                )
            saved = finish_chat_turn(
                db,
                user_id=user_id,
                request_id=req.request_id,
                generation_token=generation_token,
                content=content,
                status="complete",
            )
            if not saved:
                raise ApiError(
                    status_code=409,
                    code="CHAT_REQUEST_CANCELLED",
                    message="本次生成已停止或会话内容已改变",
                    retryable=True,
                )
            terminal = True
            policy = get_context_policy(model_id)
            if (
                active_context.summary_needed
                or input_tokens
                + count_messages([{"role": "assistant", "content": content}], model_id)
                >= policy.summary_trigger_tokens
            ):
                try:
                    schedule_chat_summary(db, session_id=session_pk, model_id=model_id)
                except Exception:
                    db.rollback()
                    log.exception("chat_summary_schedule_failed session=%s", session_pk)
            yield event({"request_state": {"status": "complete"}})
            yield "data: [DONE]\n\n"
        except GeneratorExit:
            finish_chat_turn(
                db,
                user_id=user_id,
                request_id=req.request_id,
                generation_token=generation_token,
                content="".join(full_text),
                status="interrupted",
                error_code="CLIENT_DISCONNECTED",
            )
            checkpoint_interrupted_content(
                db,
                user_id=user_id,
                request_id=req.request_id,
                generation_token=generation_token,
                content="".join(full_text),
            )
            raise
        except Exception as error:
            known_error = isinstance(error, (ApiError, ChatStreamError))
            code = error.code if known_error else "AI_STREAM_ERROR"
            message = error.message if known_error else "模型服务暂时不可用，请重试"
            retryable = error.retryable if known_error else True
            if isinstance(error, ContextWindowExceeded):
                code = "CHAT_CONTEXT_TOO_LARGE"
                message = str(error)
                retryable = False
            incomplete = code in {"AI_OUTPUT_LIMIT", "AI_STREAM_INCOMPLETE"}
            log.exception("chat_stream_failed request=%s", req.request_id)
            finish_chat_turn(
                db,
                user_id=user_id,
                request_id=req.request_id,
                generation_token=generation_token,
                content="".join(full_text),
                status="interrupted" if incomplete else "failed",
                error_code=code,
            )
            checkpoint_interrupted_content(
                db,
                user_id=user_id,
                request_id=req.request_id,
                generation_token=generation_token,
                content="".join(full_text),
            )
            current_turn = get_chat_turn(db, user_id=user_id, request_id=req.request_id)
            status = (
                "interrupted"
                if current_turn is None or current_turn.status in {"interrupted", "deleted"}
                else "failed"
            )
            db.commit()
            yield event({"request_state": {"status": status}})
            yield event({"error": {"code": code, "message": message, "retryable": retryable}})
            yield "data: [DONE]\n\n"
        finally:
            close = getattr(stream, "close", None)
            if close:
                close()
            if not terminal:
                db.rollback()

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


class CancelChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    session_id: str = Field(min_length=1, max_length=100)
    request_id: str = Field(min_length=1, max_length=100)


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
    return (
        visible_messages(db.query(ChatMessage))
        .filter(
            ChatMessage.user_id == current_user.id,
            ChatMessage.node_key == node_key,
        )
        .order_by(ChatMessage.id)
        .limit(50)
        .all()
    )


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
            "metadata": message.metadata_json,
            "created_at": message.created_at,
        }
        for message in messages
    ]


class DeleteMessagesRequest(BaseModel):
    ids: List[int]


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


class DeleteSessionRequest(BaseModel):
    session_id: str = Field(min_length=1, max_length=100)

    @field_validator("session_id")
    @classmethod
    def strip_session_id(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("session_id must not be blank")
        return value


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


@router.get("/suggestions")
def get_suggestions(
    mode: str = "socratic",
    model: str | None = None,
    exclude: list[str] = Query(default=[]),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """根据当前聊天模式，让 AI 生成快捷回复建议；生成失败时返回兜底的静态建议列表。"""
    load_user_profiles(db, current_user.id)
    if mode == "socratic":
        # 取用户当前可学习的节点作为上下文，让建议更贴合学习进度
        recent_nodes = (
            db.query(Node)
            .join(Topic)
            .filter(
                Topic.user_id == current_user.id,
                Node.state == "available",
            )
            .limit(3)
            .all()
        )
        context = "、".join([n.label for n in recent_nodes]) if recent_nodes else "编程基础"
        prompt = build_socratic_suggestions_prompt(context)
    else:
        prompt = NORMAL_SUGGESTIONS_PROMPT

    excluded = list(dict.fromkeys(value.strip()[:80] for value in exclude if value.strip()))[:24]
    if excluded:
        prompt += f"\n以下建议已经展示过，请不要重复：{json.dumps(excluded, ensure_ascii=False)}"

    profile = resolve_llm_profile(selected_model(model, current_user.id))
    try:
        response = get_ai_client(profile.id).chat.completions.create(
            model=profile.model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=500,
            temperature=0.8,
        )
        payload = json.loads(extract_json_from_markdown(response.choices[0].message.content))
        suggestions = payload.get("suggestions") if isinstance(payload, dict) else None
        if not isinstance(suggestions, list) or not all(
            isinstance(value, str) for value in suggestions
        ):
            raise ValueError("invalid suggestions response")
        fresh = list(dict.fromkeys(value.strip() for value in suggestions if value.strip()))
        return {
            "suggestions": [value for value in fresh if value not in excluded][:12],
            "source": "ai",
        }
    except Exception:
        if mode == "socratic":
            return {
                "suggestions": [
                    "我想学 Python",
                    "教我机器学习",
                    "讲讲数据结构",
                    "学习 Web 开发",
                    "解释一下算法",
                    "复习编程基础",
                    "练习逻辑思维",
                    "了解神经网络",
                    "帮我制定计划",
                    "讲讲数据库",
                    "学习前端基础",
                    "做一道练习题",
                ],
                "source": "fallback",
            }
        else:
            return {
                "suggestions": [
                    "今天天气怎么样",
                    "推荐一部电影",
                    "给我讲个笑话",
                    "聊聊最近的新闻",
                    "推荐一本书",
                    "分享一个冷知识",
                    "有什么旅行建议",
                    "聊聊音乐",
                    "推荐一道菜",
                    "讲个有趣的故事",
                    "如何安排周末",
                    "聊聊科技趋势",
                ],
                "source": "fallback",
            }
