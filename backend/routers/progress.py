from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import String, func
from datetime import date, timedelta
from core.database import get_db
from core.deps import get_current_user
from models.user import User
from models.node import Node
from models.topic import Topic
from models.progress import LearningRecord, ChatMessage

router = APIRouter(prefix="/api/progress", tags=["进度"])


def today_str() -> str:
    return date.today().isoformat()


@router.post("/record")
def record_today(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    today = today_str()
    exists = db.query(LearningRecord).filter(
        LearningRecord.user_id == current_user.id,
        LearningRecord.date == today,
    ).first()
    if not exists:
        db.add(LearningRecord(user_id=current_user.id, date=today))
        db.commit()
    return {"date": today, "recorded": True}


@router.get("/streak")
def get_streak(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    records = db.query(LearningRecord).filter(
        LearningRecord.user_id == current_user.id,
    ).all()
    learned_dates = {r.date for r in records}

    streak = 0
    check = date.today()
    while check.isoformat() in learned_dates:
        streak += 1
        check -= timedelta(days=1)

    if streak == 0:
        check = date.today() - timedelta(days=1)
        while check.isoformat() in learned_dates:
            streak += 1
            check -= timedelta(days=1)

    recent = []
    for i in range(13, -1, -1):
        d = (date.today() - timedelta(days=i)).isoformat()
        recent.append({"date": d, "learned": d in learned_dates})

    return {
        "streak": streak,
        "total_days": len(learned_dates),
        "recent": recent,
    }


@router.get("/stats")
def get_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # 对话轮次
    chat_count = db.query(ChatMessage).filter(
        ChatMessage.user_id == current_user.id,
        ChatMessage.role == "user",
        ChatMessage.mode == "socratic"
    ).count()

    # 热力图：近一年
    heatmap = []
    for i in range(364, -1, -1):
        d = (date.today() - timedelta(days=i)).isoformat()
        count = db.query(ChatMessage).filter(
            ChatMessage.user_id == current_user.id,
            ChatMessage.role == "user",
            ChatMessage.mode == "socratic",
            func.substr(func.cast(ChatMessage.created_at, String), 1, 10) == d
        ).count()
        heatmap.append({"date": d, "count": count})

    # 连续天数
    records = db.query(LearningRecord).filter(
        LearningRecord.user_id == current_user.id
    ).all()
    learned_dates = {r.date for r in records}
    streak = 0
    check = date.today()
    while check.isoformat() in learned_dates:
        streak += 1
        check -= timedelta(days=1)
    if streak == 0:
        check = date.today() - timedelta(days=1)
        while check.isoformat() in learned_dates:
            streak += 1
            check -= timedelta(days=1)

    # 本周统计（周一到今天）
    today = date.today()
    weekday = today.weekday()  # 0=周一
    week_start = today - timedelta(days=weekday)

    week_chats = db.query(ChatMessage).filter(
        ChatMessage.user_id == current_user.id,
        ChatMessage.role == "user",
        ChatMessage.mode == "socratic",
        func.substr(func.cast(ChatMessage.created_at, String), 1, 10) >= week_start.isoformat()
    ).count()

    week_mastered = db.query(Node).join(Topic).filter(
        Topic.user_id == current_user.id,
        Node.state == "mastered",
        Node.mastered_at.isnot(None),
        func.substr(func.cast(Node.mastered_at, String), 1, 10) >= week_start.isoformat()
    ).count()

    # 最活跃时段
    all_msgs = db.query(ChatMessage).filter(
        ChatMessage.user_id == current_user.id,
        ChatMessage.role == "user",
        ChatMessage.mode == "socratic"
    ).all()
    hour_counts: dict = {}
    for msg in all_msgs:
        if msg.created_at:
            h = msg.created_at.hour
            hour_counts[h] = hour_counts.get(h, 0) + 1
    if hour_counts:
        peak_hour = max(hour_counts, key=lambda k: hour_counts[k])
        peak_label = f"{peak_hour:02d}:00 - {(peak_hour + 2) % 24:02d}:00"
    else:
        peak_label = "暂无数据"

    # 平均每天对话数
    total_days_learned = len(learned_dates) or 1
    avg_daily = round(chat_count / total_days_learned, 1)

    week_days_learned = len([
        d for d in learned_dates
        if d >= week_start.isoformat()
    ])

    # 时间线
    recent_mastered = db.query(Node).join(Topic).filter(
        Topic.user_id == current_user.id,
        Node.state == "mastered",
        Node.mastered_at.isnot(None)
    ).order_by(Node.mastered_at.desc()).limit(5).all()

    timeline = []
    for n in recent_mastered:
        topic = db.query(Topic).filter(Topic.id == n.topic_id).first()
        timeline.append({
            "type": "mastered",
            "title": f"掌握「{n.label}」节点",
            "sub": topic.title if topic else "",
            "time": n.mastered_at.strftime("%m/%d %H:%M") if n.mastered_at else "",
        })

    # 成就徽章
    mastered_count = db.query(Node).join(Topic).filter(
        Topic.user_id == current_user.id,
        Node.state == "mastered"
    ).count()

    badges = [
        {"icon": "🚀", "name": "第一步",     "unlocked": chat_count >= 1},
        {"icon": "🔥", "name": "连续7天",    "unlocked": streak >= 7},
        {"icon": "⭐", "name": "掌握10节点", "unlocked": mastered_count >= 10},
        {"icon": "💬", "name": "对话达人",   "unlocked": chat_count >= 50},
        {"icon": "🏆", "name": "掌握50节点", "unlocked": mastered_count >= 50},
        {"icon": "🌙", "name": "连续30天",   "unlocked": streak >= 30},
        {"icon": "💎", "name": "全图通关",   "unlocked": False},
        {"icon": "👑", "name": "学习大师",   "unlocked": mastered_count >= 100},
    ]

    return {
        "chat_count": chat_count,
        "mastered_count": mastered_count,
        "streak": streak,
        "heatmap": heatmap,
        "timeline": timeline,
        "badges": badges,
        "weekly": {
            "chat_count": week_chats,
            "mastered_count": week_mastered,
            "peak_hour": peak_label,
            "avg_daily": avg_daily,
            "days_learned": week_days_learned,
        },
    }