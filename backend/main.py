from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from core.database import Base, engine
from routers import auth, topics, nodes, chat, progress
import models  # 确保模型被注册

# 创建数据库表
Base.metadata.create_all(bind=engine)

# 简易迁移：为已存在的 users 表补 avatar_url 列
with engine.connect() as conn:
    cols = {row[1] for row in conn.execute(text("PRAGMA table_info(users)"))}
    if "avatar_url" not in cols:
        conn.execute(text("ALTER TABLE users ADD COLUMN avatar_url VARCHAR"))
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