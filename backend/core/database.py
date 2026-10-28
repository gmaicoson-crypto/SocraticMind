from sqlalchemy import create_engine, event
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from .config import settings


# pool_pre_ping=True：每次从连接池取连接前先发一个轻量探活，避免使用已断开的连接
def create_runtime_engine(url, **options):
    runtime_engine = create_engine(url, **options)
    if runtime_engine.dialect.name == "sqlite":

        @event.listens_for(runtime_engine, "connect")
        def enable_foreign_keys(connection, _record):
            cursor = connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    return runtime_engine


engine = create_runtime_engine(settings.database_url, pool_pre_ping=True)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """FastAPI 依赖注入用的数据库会话生成器，请求结束后自动关闭连接。"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
