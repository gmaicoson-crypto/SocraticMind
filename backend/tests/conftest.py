import os
from types import SimpleNamespace

import pytest


# Configure an isolated database before importing application modules, because the
# database engine is created when core.database is imported.
os.environ["DATABASE_URL"] = "sqlite://"
os.environ.setdefault("LLM_API_KEY", "test-key")
os.environ.setdefault("LLM_BASE_URL", "https://llm.example.test/v1")
os.environ.setdefault("LLM_MODEL", "test-model")
os.environ.setdefault("SECRET_KEY", "test-secret")

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from core.database import Base, get_db, create_runtime_engine
from core.deps import get_current_user
from models import User
from routers import (
    agent,
    chat,
    chat_titles,
    llm,
    memories,
    nodes,
    plans,
    progress,
    topics,
    attachments,
    knowledge,
)


@pytest.fixture()
def db_session(tmp_path):
    engine = create_runtime_engine(
        f"sqlite:///{tmp_path / 'database.sqlite'}",
        connect_args={"check_same_thread": False},
    )
    testing_session = sessionmaker(
        autocommit=False,
        autoflush=False,
        expire_on_commit=False,
        bind=engine,
    )
    Base.metadata.create_all(bind=engine)
    session = testing_session()
    try:
        yield session
    finally:
        session.close()
        # The isolated tmp_path database is discarded by pytest. Dropping mutually
        # referencing tables is not equivalent to the production deletion paths.
        engine.dispose()


@pytest.fixture()
def auth_user(db_session):
    user = User(
        username="p0-tester",
        email="p0@example.com",
        hashed_password="not-used-in-tests",
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture()
def app(db_session, auth_user):
    test_app = FastAPI()
    test_app.add_middleware(attachments.AttachmentUploadLimitMiddleware)
    test_app.include_router(topics.router)
    test_app.include_router(nodes.router)
    test_app.include_router(chat.router)
    test_app.include_router(chat_titles.router)
    test_app.include_router(progress.router)
    test_app.include_router(agent.router)
    test_app.include_router(plans.router)
    test_app.include_router(memories.router)
    test_app.include_router(llm.router)
    test_app.include_router(attachments.router)
    test_app.include_router(knowledge.router)
    from core.errors import install_api_error_handler

    install_api_error_handler(test_app)

    def override_db():
        yield db_session

    test_app.dependency_overrides[get_db] = override_db
    test_app.dependency_overrides[get_current_user] = lambda: auth_user
    return test_app


@pytest.fixture()
def client(app):
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def mock_ai_client():
    def build(*chunks: str):
        stream = [
            SimpleNamespace(choices=[SimpleNamespace(delta=SimpleNamespace(content=chunk))])
            for chunk in chunks
        ]
        completions = SimpleNamespace(create=lambda **_: iter(stream))
        return SimpleNamespace(chat=SimpleNamespace(completions=completions))

    return build
