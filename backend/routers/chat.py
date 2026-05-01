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
    ai_style: str = "标准"

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

    db.add(ChatMessage(
        user_id=current_user.id,
        node_key=req.node_key,
        role="user",
        content=req.user_input,
        mode=req.mode,
    ))
    db.commit()

    history = [
        {
            "role": "assistant" if m.role == "ai" else "user",
            "content": m.content
        }
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
        ):
            full_text.append(chunk)
            yield f"data: {json.dumps({'text': chunk}, ensure_ascii=False)}\n\n"

        full_reply = "".join(full_text)

        # 检测掌握信号
        signal = None
        if "[MASTERED]" in full_reply:
            signal = "MASTERED"
            full_reply = full_reply.replace("[MASTERED]", "").strip()

        # 保存 AI 回复（去掉信号标记）
        db.add(ChatMessage(
            user_id=current_user.id,
            node_key=req.node_key,
            role="ai",
            content=full_reply,
            mode=req.mode,
        ))
        db.commit()

        # 发送信号给前端
        if signal:
            yield f"data: {json.dumps({'signal': signal}, ensure_ascii=False)}\n\n"

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

@router.get("/suggestions")
def get_suggestions(
    mode: str = "socratic",
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """根据模式返回 AI 推荐的快捷建议"""
    from openai import OpenAI
    from core.config import settings
    import json

    client = OpenAI(
        api_key=settings.deepseek_api_key,
        base_url=settings.deepseek_base_url,
    )

    if mode == "socratic":
        # 获取用户最近学习的节点
        from models.node import Node
        from models.topic import Topic
        recent_nodes = db.query(Node).join(Topic).filter(
            Topic.user_id == current_user.id,
            Node.state == "available"
        ).limit(3).all()
        context = "、".join([n.label for n in recent_nodes]) if recent_nodes else "编程基础"
        prompt = f"""用户正在学习：{context}。
生成4个简短的学习对话建议，帮助用户继续学习。
严格返回JSON：{{"suggestions": ["建议1", "建议2", "建议3", "建议4"]}}
每条建议不超过12个字，像用户说话的口吻。只返回JSON。"""
    else:
        prompt = """生成4个日常对话的快捷建议，涵盖不同话题。
严格返回JSON：{"suggestions": ["建议1", "建议2", "建议3", "建议4"]}
每条建议不超过12个字，像用户说话的口吻。只返回JSON。"""

    try:
        response = client.chat.completions.create(
            model=settings.deepseek_model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=200,
            temperature=0.8,
        )
        content = response.choices[0].message.content.strip()
        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
        return json.loads(content.strip())
    except Exception:
        if mode == "socratic":
            return {"suggestions": ["我想学 Python", "教我机器学习", "讲讲数据结构", "学习 Web 开发"]}
        else:
            return {"suggestions": ["今天天气怎么样", "推荐一部电影", "给我讲个笑话", "聊聊最近的新闻"]}