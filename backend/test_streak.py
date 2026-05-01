from core.database import SessionLocal
from models.progress import LearningRecord
from datetime import date, timedelta

db = SessionLocal()
db.query(LearningRecord).filter(LearningRecord.user_id == 3).delete()
db.commit()

# 模拟：学了5天 → 中断1天 → 再学3天（当前连续=3）
# learned_days = [11, 8, 7, 6, 5, 4, 3, 2, 1, 0]  # 距今天的天数，跳过第3天（中断）

# for days_ago in learned_days:
#     d = (date.today() - timedelta(days=days_ago)).isoformat()
#     db.add(LearningRecord(user_id=3, date=d))

# db.commit()
# db.close()
# print("已插入中断测试数据，预期连续天数=3")