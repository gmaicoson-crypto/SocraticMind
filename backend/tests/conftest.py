import os
from types import SimpleNamespace

import pytest


# Configure an isolated database before importing application modules, because the
# database engine is created when core.database is imported.
os.environ["DATABASE_URL"] = "sqlite://"
os.environ.setdefault("DEEPSEEK_API_KEY", "test-key")
os.environ.setdefault("SECRET_KEY", "test-secret")

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from core.database import Base, get_db
from core.deps import get_current_user
from models import User
from routers import chat, nodes, topics


@pytest.fixture()
def db_session():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
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
        Base.metadata.drop_all(bind=engine)
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
    test_app.include_router(topics.router)
    test_app.include_router(nodes.router)
    test_app.include_router(chat.router)

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
            SimpleNamespace(
                choices=[SimpleNamespace(delta=SimpleNamespace(content=chunk))]
            )
            for chunk in chunks
        ]
        completions = SimpleNamespace(create=lambda **_: iter(stream))
        return SimpleNamespace(chat=SimpleNamespace(completions=completions))

    return build
