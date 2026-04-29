from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List
import json
from core.database import get_db
from core.deps import get_current_user
from models.user import User
from models.topic import Topic
from models.node import Node
from models.progress import ChatMessage
from ai.agent import chat_stream

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

class HistoryResponse(BaseModel):
    id: int
    role: str
    content: str

    class Config:
        from_attributes = True

@router.post("/stream")
def chat_stream_endpoint(
    req: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # 根据模式确定 node_label 和 node_sub
    if req.mode == "normal":
        node_label = "通用助手"
        node_sub = "General Assistant"
    else:
        node = db.query(Node).join(Topic).filter(
            Node.node_key == req.node_key,
            Topic.id == req.topic_id,
            Topic.user_id == current_user.id,
        ).first()
        if not node:
            raise HTTPException(status_code=404, detail="节点不存在")
        node_label = node.label
        node_sub = node.sub

    # 保存用户消息
    db.add(ChatMessage(
        user_id=current_user.id,
        node_key=req.node_key,
        role="user",
        content=req.user_input,
    ))
    db.commit()

    history = [
        {
            "role": "assistant" if m.role == "ai" else "user",
            "content": m.content
        }
        for m in req.history
    ]
    full_reply = []

    def generate():
        buffer = []
        buffer_size = 0
        
        for chunk in chat_stream(
            messages=history,
            node_label=node_label,
            node_sub=node_sub,
            user_input=req.user_input,
            mode=req.mode,
        ):
            full_reply.append(chunk)
            data = f"data: {json.dumps({'text': chunk}, ensure_ascii=False)}\n\n"
            yield data

        # 保存 AI 回复
        ai_msg = ChatMessage(
            user_id=current_user.id,
            node_key=req.node_key,
            role="ai",
            content="".join(full_reply),
        )
        db.add(ai_msg)
        db.commit()
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache", 
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
        
    )

@router.get("/history/{node_key}", response_model=List[HistoryResponse])
def get_history(
    node_key: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return db.query(ChatMessage).filter(
        ChatMessage.user_id == current_user.id,
        ChatMessage.node_key == node_key,
    ).order_by(ChatMessage.id).limit(50).all()