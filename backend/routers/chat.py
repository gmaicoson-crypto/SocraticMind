from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
import json
from core.config import settings
from core.database import get_db
from core.deps import get_current_user
from core.ai_client import get_ai_client
from models.user import User
from models.topic import Topic
from models.node import Node
from models.progress import ChatMessage
from ai.agent import chat_stream
from ai.util import extract_json_from_markdown
from ai.prompts import build_socratic_suggestions_prompt, NORMAL_SUGGESTIONS_PROMPT

router = APIRouter(prefix="/api/chat", tags=["对话"])


class MessageItem(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    node_key: str
    topic_id: int
    user_input: str
    history: List[MessageItem] = []
    mode: str = "socratic"
    ai_style: str = "标准"
    kind: str = "qa"  # qa（默认 Q&A）/ topic_overview（主题概览）/ node_overview（节点概览）


class HistoryResponse(BaseModel):
    id: int
    role: str
    content: str
    node_key: str = ""
    mode: str = ""
    topic_id: Optional[int] = None
    created_at: str = ""

    class Config:
        from_attributes = True


@router.post("/stream")
def chat_stream_endpoint(
    req: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # topic_overview 模式下 node_key 承载的是主题名，不需要查节点表
    if req.kind == "topic_overview":
        node_label = req.node_key
        node_sub = ""
    elif req.mode == "normal":
        node_label = "通用助手"
        node_sub = "General Assistant"
    else:
        # 通过 join Topic 校验节点归属，防止越权访问其他用户的节点
        node = db.query(Node).join(Topic).filter(
            Node.node_key == req.node_key,
            Topic.id == req.topic_id,
            Topic.user_id == current_user.id,
        ).first()
        if not node:
            raise HTTPException(status_code=404, detail="节点不存在")
        node_label = node.label
        node_sub = node.sub

    # 先将用户消息写入数据库，获取 ID 后再开始流式响应
    user_msg = ChatMessage(
        user_id=current_user.id,
        node_key=req.node_key,
        role="user",
        content=req.user_input,
        mode=req.mode,
    )
    db.add(user_msg)
    db.flush()
    user_msg_id = user_msg.id
    db.commit()

    # 将前端传来的历史消息格式化为 AI 接口所需的格式
    history = [
        {"role": "assistant" if m.role == "ai" else "user", "content": m.content}
        for m in req.history
    ]

    def generate():
        full_text = []

        for chunk in chat_stream(
            messages=history,
            node_label=node_label,
            node_sub=node_sub,
            user_input=req.user_input,
            mode=req.mode,
            ai_style=req.ai_style,
            kind=req.kind,
        ):
            full_text.append(chunk)
            yield f"data: {json.dumps({'text': chunk}, ensure_ascii=False)}\n\n"

        full_reply = "".join(full_text)

        # 检测 AI 回复中的 [MASTERED] 信号，去掉标记后再入库
        signal = None
        if "[MASTERED]" in full_reply:
            signal = "MASTERED"
            full_reply = full_reply.replace("[MASTERED]", "").strip()

        ai_msg = ChatMessage(
            user_id=current_user.id,
            node_key=req.node_key,
            role="ai",
            content=full_reply,
            mode=req.mode,
        )
        db.add(ai_msg)
        db.flush()
        ai_msg_id = ai_msg.id
        db.commit()

        if signal:
            yield f"data: {json.dumps({'signal': signal}, ensure_ascii=False)}\n\n"

        # 将数据库消息 ID 发给前端，便于前端将 UI 消息与数据库记录关联（删除时同步）
        yield f"data: {json.dumps({'msg_ids': {'user': user_msg_id, 'ai': ai_msg_id}}, ensure_ascii=False)}\n\n"

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
    return db.query(ChatMessage).filter(
        ChatMessage.user_id == current_user.id,
        ChatMessage.node_key == node_key,
    ).order_by(ChatMessage.id).limit(50).all()


@router.get("/messages", response_model=List[HistoryResponse])
def get_all_messages(
    limit: int = 200,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """分页获取用户的全部消息，按 ID 倒序（最新消息优先），同时关联查出 topic_id。"""
    rows = db.query(ChatMessage, Node.topic_id).outerjoin(
        Node, ChatMessage.node_key == Node.node_key
    ).filter(
        ChatMessage.user_id == current_user.id,
    ).order_by(ChatMessage.id.desc()).offset(offset).limit(limit).all()
    return [
        {
            "id": m.id,
            "role": m.role,
            "content": m.content,
            "node_key": m.node_key,
            "mode": m.mode,
            "topic_id": topic_id,
            "created_at": m.created_at.strftime("%Y-%m-%d %H:%M:%S") if m.created_at else "",
        }
        for m, topic_id in rows
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
    deleted = db.query(ChatMessage).filter(
        ChatMessage.id.in_(req.ids),
        ChatMessage.user_id == current_user.id,
    ).delete(synchronize_session=False)
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
        recent_nodes = db.query(Node).join(Topic).filter(
            Topic.user_id == current_user.id,
            Node.state == "available",
        ).limit(3).all()
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
            return {"suggestions": ["我想学 Python", "教我机器学习", "讲讲数据结构", "学习 Web 开发"]}
        else:
            return {"suggestions": ["今天天气怎么样", "推荐一部电影", "给我讲个笑话", "聊聊最近的新闻"]}
