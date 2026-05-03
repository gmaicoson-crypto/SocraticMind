from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from core.database import Base, engine
from routers import auth, topics, nodes, chat, progress
import models  # 确保模型被注册

# 创建尚未存在的表（已存在的表不会被覆盖）
Base.metadata.create_all(bind=engine)

# 启动期轻量迁移：补列 + 补索引。
# 不引入 Alembic 是为了保持单命令启动；所有 DDL 都是 IF NOT EXISTS 语义，可重复执行。
with engine.connect() as conn:
    # 1) users 表补 avatar_url 列
    cols = {row[1] for row in conn.execute(text("PRAGMA table_info(users)"))}
    if "avatar_url" not in cols:
        conn.execute(text("ALTER TABLE users ADD COLUMN avatar_url VARCHAR"))

    # 2) 为已有库补建索引：create_all 只对新表生效，老表的索引必须显式补
    index_ddls = [
        "CREATE INDEX IF NOT EXISTS ix_nodes_topic_id ON nodes (topic_id)",
        "CREATE INDEX IF NOT EXISTS ix_nodes_state ON nodes (state)",
        "CREATE INDEX IF NOT EXISTS ix_nodes_topic_state ON nodes (topic_id, state)",
        "CREATE INDEX IF NOT EXISTS ix_chat_messages_user_id ON chat_messages (user_id)",
        "CREATE INDEX IF NOT EXISTS ix_chat_user_created ON chat_messages (user_id, created_at)",
        "CREATE INDEX IF NOT EXISTS ix_chat_role ON chat_messages (role)",
        "CREATE INDEX IF NOT EXISTS ix_chat_mode ON chat_messages (mode)",
        "CREATE INDEX IF NOT EXISTS ix_learning_records_user_id ON learning_records (user_id)",
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_lr_user_date ON learning_records (user_id, date)",
        "CREATE INDEX IF NOT EXISTS ix_email_codes_email_purpose ON email_codes (email, purpose)",
    ]
    for ddl in index_ddls:
        try:
            conn.execute(text(ddl))
        except Exception as e:
            # 唯一索引可能因历史脏数据失败：仅日志，不阻塞启动
            print(f"[migrate] 跳过 {ddl}: {e}")
    conn.commit()

# 头像上传目录
UPLOAD_DIR = Path(__file__).parent / "uploads" / "avatars"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(
    title="SocraticMind API",
    description="AI 引导的知识图谱学习系统",
    version="1.0.0",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# 静态文件（头像）
app.mount("/static/avatars", StaticFiles(directory=str(UPLOAD_DIR)), name="avatars")

# 注册路由
app.include_router(auth.router)
app.include_router(topics.router)
app.include_router(nodes.router)
app.include_router(chat.router)
app.include_router(progress.router)

@app.get("/")
def root():
    return {"message": "SocraticMind API is running 🚀"}

@app.get("/health")
def health():
    return {"status": "ok"}