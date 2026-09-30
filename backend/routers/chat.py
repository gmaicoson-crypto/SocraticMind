from datetime import datetime
import hashlib
import json
import logging
import uuid
from typing import Any, List, Literal, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from ai.agent import chat_stream
from ai.prompts import build_socratic_suggestions_prompt, NORMAL_SUGGESTIONS_PROMPT
from ai.util import extract_json_from_markdown
from core.database import get_db
from core.avatar_uploads import UPLOAD_DIR, read_avatar_upload
from core import rate_limit
from core.deps import get_current_user
from core.ai_client import get_ai_client, resolve_llm_profile, resolve_model_id
from core.user_llm import load_user_profiles
from models.progress import ChatMessage
from models.node import Node
from models.topic import Topic
from models.user import User
from services.chat_context import (
    finish_ai_message,
    load_recent_chat_history,
    start_chat_messages,
)
from services.memories import select_relevant_memories
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


class MessageItem(BaseModel):
    role: str = Field(min_length=1, max_length=20)
    content: str = Field(max_length=5000)


class ChatRequest(BaseModel):
    node_key: str = Field(min_length=1, max_length=200)
    topic_id: int = Field(ge=0)
    session_id: str = Field(min_length=1, max_length=100)
    user_input: str = Field(max_length=5000)
    history: List[MessageItem] = Field(default_factory=list, max_length=20)
    mode: Literal["socratic", "normal"] = "socratic"
    ai_style: str = Field(default="标准", min_length=1, max_length=20)
    kind: Literal["qa", "topic_overview", "node_overview"] = "qa"
    model: str | None = Field(default=None, min_length=1, max_length=100)

    @field_validator("node_key", "session_id", "ai_style")
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

    # 请求携带的 history 仅为旧客户端兼容字段，事实上下文始终从数据库读取。
    history = load_recent_chat_history(
        db,
        user_id=current_user.id,
        session_id=req.session_id,
    )
    relevant_memories = []
    if req.mode == "socratic" and req.kind == "qa":
        relevant_memories = select_relevant_memories(
            db,
            user_id=current_user.id,
            topic_id=req.topic_id,
        )
    user_msg, ai_msg = start_chat_messages(
        db,
        user_id=current_user.id,
        topic_id=req.topic_id or None,
        session_id=req.session_id,
        node_key=node_label if req.kind == "topic_overview" else req.node_key,
        user_input=req.user_input,
        mode=req.mode,
    )

    def generate():
        full_text = []
        try:
            for chunk in chat_stream(
                messages=history,
                node_label=node_label,
                node_sub=node_sub,
                user_input=req.user_input,
                mode=req.mode,
                ai_style=req.ai_style,
                kind=req.kind,
                memories=[
                    {"kind": memory.kind, "content": memory.content} for memory in relevant_memories
                ],
                model_id=model_id,
            ):
                full_text.append(chunk)
                yield f"data: {json.dumps({'text': chunk}, ensure_ascii=False)}\n\n"
        except GeneratorExit:
            finish_ai_message(
                db,
                user_id=current_user.id,
                message_id=ai_msg.id,
                content="".join(full_text),
                status="interrupted",
            )
            raise
        except Exception:
            log.exception("chat stream failed for message %s", ai_msg.id)
            finish_ai_message(
                db,
                user_id=current_user.id,
                message_id=ai_msg.id,
                content="".join(full_text),
                status="failed",
                error_code="AI_STREAM_ERROR",
            )
            yield f"data: {json.dumps({'msg_ids': {'user': user_msg.id, 'ai': ai_msg.id}}, ensure_ascii=False)}\n\n"
            yield f"data: {json.dumps({'error': {'code': 'AI_STREAM_ERROR', 'retryable': True}}, ensure_ascii=False)}\n\n"
            yield "data: [DONE]\n\n"
            return

        finish_ai_message(
            db,
            user_id=current_user.id,
            message_id=ai_msg.id,
            content="".join(full_text),
            status="complete",
        )
        # 保留消息 ID 事件，兼容现有前端删除与会话管理逻辑。
        yield f"data: {json.dumps({'msg_ids': {'user': user_msg.id, 'ai': ai_msg.id}}, ensure_ascii=False)}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # 禁止 Nginx 缓冲，确保流式数据实时推送
            "Connection": "keep-alive",
        },
    )


@router.get("/history/{node_key}", response_model=List[HistoryResponse])
def get_history(
    node_key: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """获取指定节点的对话历史，按消息 ID 升序排列，最多返回 50 条。"""
    return (
        db.query(ChatMessage)
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
        db.query(ChatMessage)
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
