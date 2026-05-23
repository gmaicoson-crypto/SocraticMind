from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from core.config import settings
from core.database import Base, engine
from routers import auth, topics, nodes, chat, progress
import models  # 确保模型被注册

# 创建尚未存在的表（已存在的表不会被覆盖）
Base.metadata.create_all(bind=engine)

# 头像上传目录
UPLOAD_DIR = Path(__file__).parent / "uploads" / "avatars"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(
    title="SocraticMind API",
    description="AI 引导的知识图谱学习系统",
    version="1.0.0",
)

# CORS：允许的源通过 CORS_ORIGINS 环境变量配置（逗号分隔），生产环境需改为实际域名
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
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