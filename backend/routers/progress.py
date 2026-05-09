from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload
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


def _compute_streak(learned_dates: set[str]) -> int:
    """从今天往回数，最长无间断学习天数；今天没记录则从昨天起数。"""
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
    return streak


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
    # 仅取近 60 天用于 streak 判定（连续学习上限远小于此），并用 count() 取总天数
    cutoff = (date.today() - timedelta(days=60)).isoformat()
    recent_records = db.query(LearningRecord.date).filter(
        LearningRecord.user_id == current_user.id,
        LearningRecord.date >= cutoff,
    ).all()
    learned_dates = {r.date for r in recent_records}

    total_days = db.query(LearningRecord).filter(
        LearningRecord.user_id == current_user.id,
    ).count()

    streak = _compute_streak(learned_dates)

    recent = [
        {"date": (date.today() - timedelta(days=i)).isoformat(),
         "learned": (date.today() - timedelta(days=i)).isoformat() in learned_dates}
        for i in range(13, -1, -1)
    ]

    return {
        "streak": streak,
        "total_days": total_days,
        "recent": recent,
    }


@router.get("/stats")
def get_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    today = date.today()
    one_year_ago = today - timedelta(days=364)

    # 用户对话总数
    chat_count = db.query(ChatMessage).filter(
        ChatMessage.user_id == current_user.id,
        ChatMessage.role == "user",
        ChatMessage.mode == "socratic"
    ).count()

    # 热力图：一次按日期 GROUP BY 取所有计数；之前是 365 次独立 COUNT
    date_expr = func.substr(func.cast(ChatMessage.created_at, String(10)), 1, 10)
    heatmap_rows = db.query(
        date_expr.label("d"),
        func.count().label("c"),
    ).filter(
        ChatMessage.user_id == current_user.id,
        ChatMessage.role == "user",
        ChatMessage.mode == "socratic",
        ChatMessage.created_at >= one_year_ago,
    ).group_by("d").all()
    by_date = {row.d: row.c for row in heatmap_rows}
    heatmap = [
        {"date": (today - timedelta(days=i)).isoformat(),
         "count": by_date.get((today - timedelta(days=i)).isoformat(), 0)}
        for i in range(364, -1, -1)
    ]

    # 学习记录：streak 用近 60 天即可，total_days 用 count()
    streak_cutoff = (today - timedelta(days=60)).isoformat()
    recent_records = db.query(LearningRecord.date).filter(
        LearningRecord.user_id == current_user.id,
        LearningRecord.date >= streak_cutoff,
    ).all()
    learned_dates = {r.date for r in recent_records}
    streak = _compute_streak(learned_dates)
    total_days_learned = db.query(LearningRecord).filter(
        LearningRecord.user_id == current_user.id,
    ).count()

    # 本周统计（周一到今天）
    weekday = today.weekday()
    week_start = today - timedelta(days=weekday)
    week_start_str = week_start.isoformat()

    week_chats = db.query(ChatMessage).filter(
        ChatMessage.user_id == current_user.id,
        ChatMessage.role == "user",
        ChatMessage.mode == "socratic",
        date_expr >= week_start_str,
    ).count()

    week_mastered = db.query(Node).join(Topic).filter(
        Topic.user_id == current_user.id,
        Node.state == "mastered",
        Node.mastered_at.isnot(None),
        func.substr(func.cast(Node.mastered_at, String(10)), 1, 10) >= week_start_str,
    ).count()

    # 最活跃时段：按 hour GROUP BY，避免全表加载到 Python 再循环统计
    hour_expr = func.cast(func.date_format(ChatMessage.created_at, "%H"), String(2))
    hour_rows = db.query(
        hour_expr.label("h"),
        func.count().label("c"),
    ).filter(
        ChatMessage.user_id == current_user.id,
        ChatMessage.role == "user",
        ChatMessage.mode == "socratic",
    ).group_by("h").all()
    if hour_rows:
        peak_hour = int(max(hour_rows, key=lambda r: r.c).h)
        peak_label = f"{peak_hour:02d}:00 - {(peak_hour + 2) % 24:02d}:00"
    else:
        peak_label = "暂无数据"

    # 平均每天对话数：以"曾学习过的天数"为分母，未学习的日期不参与平均
    avg_daily = round(chat_count / (total_days_learned or 1), 1)
    week_days_learned = sum(1 for d in learned_dates if d >= week_start_str)

    # 时间线：joinedload 避免循环里再查 topic（旧实现是 N+1）
    recent_mastered = db.query(Node).options(joinedload(Node.topic)).join(Topic).filter(
        Topic.user_id == current_user.id,
        Node.state == "mastered",
        Node.mastered_at.isnot(None),
    ).order_by(Node.mastered_at.desc()).limit(5).all()
    timeline = [
        {
            "type": "mastered",
            "title": f"掌握「{n.label}」节点",
            "sub": n.topic.title if n.topic else "",
            "time": n.mastered_at.strftime("%m/%d %H:%M") if n.mastered_at else "",
        }
        for n in recent_mastered
    ]

    # 成就徽章
    mastered_count = db.query(Node).join(Topic).filter(
        Topic.user_id == current_user.id,
        Node.state == "mastered",
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
        "total_days": total_days_learned,
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