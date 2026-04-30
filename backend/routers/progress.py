from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date, timedelta
from core.database import get_db
from core.deps import get_current_user
from models.user import User
from models.progress import LearningRecord

router = APIRouter(prefix="/api/progress", tags=["进度"])


def today_str() -> str:
    return date.today().isoformat()


@router.post("/record")
def record_today(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """记录今日学习，幂等（同一天多次调用只记录一次）"""
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
    """获取连续学习天数 + 最近14天记录"""
    records = db.query(LearningRecord).filter(
        LearningRecord.user_id == current_user.id,
    ).all()

    learned_dates = {r.date for r in records}

    # 计算连续天数（从今天往前数）
    streak = 0
    check = date.today()
    while check.isoformat() in learned_dates:
        streak += 1
        check -= timedelta(days=1)

    # 如果今天还没记录，从昨天开始算
    if streak == 0:
        check = date.today() - timedelta(days=1)
        while check.isoformat() in learned_dates:
            streak += 1
            check -= timedelta(days=1)

    # 最近14天的学习情况
    recent = []
    for i in range(13, -1, -1):
        d = (date.today() - timedelta(days=i)).isoformat()
        recent.append({
            "date": d,
            "learned": d in learned_dates
        })

    return {
        "streak": streak,
        "total_days": len(learned_dates),
        "recent": recent,
    }