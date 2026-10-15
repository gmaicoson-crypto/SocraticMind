import json
from fastapi import HTTPException
from sqlalchemy.orm import Session
from core.user_llm import load_user_profiles
from typing import Callable
from ai.prompts import build_normal_suggestions_prompt, build_socratic_suggestions_prompt
from ai.util import extract_json_from_markdown
from core.ai_client import resolve_llm_profile
from models.progress import ChatMessage
from models.node import Node
from models.topic import Topic
from models.user import User


def _suggestion_history(
    db: Session,
    *,
    user_id: int,
    session_id: str | None,
    mode: str,
    topic_id: int | None = None,
) -> list[dict[str, str]]:
    """复用会话索引，限制推荐上下文的消息数量和单条长度。"""
    if not session_id:
        return []
    query = db.query(ChatMessage).filter(
        ChatMessage.user_id == user_id,
        ChatMessage.session_id == session_id,
        ChatMessage.mode == mode,
        ChatMessage.message_type == "chat",
    )
    if mode == "socratic":
        query = query.filter(ChatMessage.topic_id == topic_id)
    recent_messages = query.order_by(ChatMessage.id.desc()).limit(6).all()
    return [
        {"角色": message.role, "内容": message.content[-800:]}
        for message in reversed(recent_messages)
        if message.content.strip()
        and (message.metadata_json or {}).get("status", "complete") == "complete"
    ]


def get_suggestions(
    db: Session,
    current_user: User,
    *,
    mode: str,
    model: str | None,
    model_resolver: Callable[[str | None, int], str],
    exclude: list[str],
    topic_id: int | None,
    session_id: str | None,
    node_key: str | None,
    ai_client,
):
    """新对话推荐开场主题，已有内容的对话根据当前会话生成后续建议。"""
    load_user_profiles(db, current_user.id)
    subject = ""
    normal_history = []
    if mode == "socratic":
        if topic_id is None:
            topics = (
                db.query(Topic.title)
                .filter(Topic.user_id == current_user.id)
                .order_by(Topic.id.desc())
                .limit(12)
                .all()
            )
            context = {"已有学习主题": [title for (title,) in topics]}
        else:
            topic = (
                db.query(Topic)
                .filter(Topic.id == topic_id, Topic.user_id == current_user.id)
                .first()
            )
            if not topic:
                raise HTTPException(status_code=404, detail="主题不存在")
            subject = topic.title
            context = {"当前主题": topic.title}
            if node_key:
                node = (
                    db.query(Node)
                    .filter(Node.topic_id == topic_id, Node.node_key == node_key)
                    .first()
                )
                if not node:
                    raise HTTPException(status_code=404, detail="当前主题中不存在该节点")
                subject = node.label
                context["当前节点"] = {"名称": node.label, "说明": node.sub}
            if session_id:
                context["最近对话"] = _suggestion_history(
                    db,
                    user_id=current_user.id,
                    session_id=session_id,
                    mode=mode,
                    topic_id=topic_id,
                )
        prompt = build_socratic_suggestions_prompt(
            json.dumps(context, ensure_ascii=False), has_topic=topic_id is not None
        )
    else:
        normal_history = _suggestion_history(
            db, user_id=current_user.id, session_id=session_id, mode=mode
        )
        prompt = build_normal_suggestions_prompt(
            json.dumps({"最近对话": normal_history}, ensure_ascii=False) if normal_history else None
        )

    excluded = list(dict.fromkeys(value.strip()[:80] for value in exclude if value.strip()))[:24]
    if excluded:
        prompt += f"\n以下建议已经展示过，请不要重复：{json.dumps(excluded, ensure_ascii=False)}"

    profile = resolve_llm_profile(model_resolver(model, current_user.id))
    try:
        response = ai_client(profile.id).chat.completions.create(
            model=profile.model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=800,
            temperature=0.8,
        )
        payload = json.loads(extract_json_from_markdown(response.choices[0].message.content))
        suggestions = payload.get("suggestions") if isinstance(payload, dict) else None
        if not isinstance(suggestions, list) or not all(
            isinstance(value, str) for value in suggestions
        ):
            raise ValueError("invalid suggestions response")
        fresh = list(dict.fromkeys(value.strip() for value in suggestions if value.strip()))
        if not fresh:
            raise ValueError("empty suggestions response")
        return {
            "suggestions": [value for value in fresh if value not in excluded][:12],
            "source": "ai",
        }
    except Exception:
        if mode == "socratic":
            if topic_id is not None:
                return {
                    "suggestions": [
                        value
                        for value in [
                            f"{subject}的核心原理是什么？",
                            f"{subject}有什么实际用途？",
                            f"{subject}能举个例子吗？",
                            f"{subject}有哪些常见误区？",
                            f"{subject}与相关概念有何区别？",
                            f"{subject}如何一步步实现？",
                            "刚才的例子为什么成立？",
                            "这个结论需要哪些前提？",
                            "换个场景还适用吗？",
                            "这一步可以再解释一下吗？",
                            "有没有反例能帮助理解？",
                            "如何检验我是否理解了？",
                        ]
                        if value not in excluded
                    ],
                    "source": "fallback",
                }
            return {
                "suggestions": [
                    "我想学 Python",
                    "教我机器学习",
                    "讲讲数据结构",
                    "学习 Web 开发",
                    "学习算法基础",
                    "学习编程基础",
                    "学习逻辑思维",
                    "了解神经网络",
                    "学习数据库",
                    "学习前端基础",
                    "学习操作系统",
                    "学习计算机网络",
                ],
                "source": "fallback",
            }
        else:
            if normal_history:
                return {
                    "suggestions": [
                        value
                        for value in [
                            "能展开说说刚才的内容吗？",
                            "能结合我的情况举个例子吗？",
                            "我接下来可以先做什么？",
                            "有没有更简单的选择？",
                            "刚才提到的方法怎么操作？",
                            "这有哪些需要注意的地方？",
                            "还有哪些相关细节值得了解？",
                            "如果换个情况该怎么办？",
                            "这几种选择有什么区别？",
                            "能帮我梳理一下刚才的重点吗？",
                            "这个建议为什么适合我？",
                            "有没有其他可行的思路？",
                        ]
                        if value not in excluded
                    ],
                    "source": "fallback",
                }
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
