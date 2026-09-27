from datetime import datetime
import json
import logging
from typing import Any, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from ai.agent import chat_stream
from ai.prompts import build_socratic_suggestions_prompt, NORMAL_SUGGESTIONS_PROMPT
from ai.util import extract_json_from_markdown
from core.config import settings
from core.database import get_db
from core.deps import get_current_user
from core.ai_client import get_ai_client
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

router = APIRouter(prefix="/api/chat", tags=["对话"])
log = logging.getLogger(__name__)


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
    deleted = (
        db.query(ChatMessage)
        .filter(
            ChatMessage.id.in_(req.ids),
            ChatMessage.user_id == current_user.id,
        )
        .delete(synchronize_session=False)
    )
    db.commit()
    return {"deleted": deleted}


class DeleteSessionRequest(BaseModel):
    session_id: str


@router.delete("/session")
def delete_session_endpoint(
    req: DeleteSessionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """按稳定的 session_id 删除当前用户的完整会话。"""
    deleted = (
        db.query(ChatMessage)
        .filter(
            ChatMessage.user_id == current_user.id,
            ChatMessage.session_id == req.session_id,
        )
        .delete(synchronize_session=False)
    )
    db.commit()
    return {"deleted": deleted}


@router.get("/suggestions")
def get_suggestions(
    mode: str = "socratic",
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """根据当前聊天模式，让 AI 生成快捷回复建议；生成失败时返回兜底的静态建议列表。"""
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

    try:
        response = get_ai_client().chat.completions.create(
            model=settings.deepseek_model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=200,
            temperature=0.8,
        )
        return json.loads(extract_json_from_markdown(response.choices[0].message.content))
    except Exception:
        if mode == "socratic":
            return {
                "suggestions": ["我想学 Python", "教我机器学习", "讲讲数据结构", "学习 Web 开发"]
            }
        else:
            return {
                "suggestions": ["今天天气怎么样", "推荐一部电影", "给我讲个笑话", "聊聊最近的新闻"]
            }
