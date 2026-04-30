from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from core.database import Base, engine
from routers import auth, topics, nodes, chat, progress
import models  # 确保模型被注册

# 创建数据库表
Base.metadata.create_all(bind=engine)

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