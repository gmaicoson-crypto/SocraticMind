"""Authenticated topic materials and reusable evidence retrieval."""

from fastapi import APIRouter, Depends, Path, Query
from sqlalchemy.orm import Session

from core.ai_client import resolve_model_id
from core.database import get_db
from core.deps import get_current_user
from core.user_llm import load_user_profiles
from models import User
from schemas.knowledge import IndexRequest, IndexStatus, KnowledgeDocumentSummary, MaterialRef
from core.errors import ApiError
from services.knowledge.embedding_client import EmbeddingError
from services.knowledge.index_store import enqueue_indexes, public_index_status
from schemas.knowledge import (
    MaterialSelection,
    RetrievalRequest,
    RetrievalResult,
    TopicMaterialSummary,
)
from services.knowledge import materials
from services.knowledge.retrieval import retrieve

router = APIRouter(prefix="/api/knowledge", tags=["学习资料"])


@router.get("/documents", response_model=list[KnowledgeDocumentSummary])
def list_documents(
    after: str | None = Query(None, max_length=36),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return materials.list_documents(db, user_id=user.id, after=after, limit=limit)


@router.post("/documents/{attachment_id}/index", response_model=IndexStatus)
def request_index(
    request: IndexRequest,
    attachment_id: str = Path(min_length=1, max_length=36),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    documents = materials.load_documents(
        db,
        user_id=user.id,
        materials=[MaterialRef(attachment_id=attachment_id, revision=request.revision)],
    )
    try:
        enqueue_indexes(db, user_id=user.id, documents=documents, retry=True)
    except EmbeddingError as error:
        raise ApiError(
            status_code=503, code=error.code, message="语义索引服务尚未正确配置"
        ) from error
    db.commit()
    return public_index_status(db, user_id=user.id, document=documents[0])


@router.get("/topics/{topic_id}/materials", response_model=list[TopicMaterialSummary])
def read_materials(
    topic_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return materials.list_topic_materials(db, user_id=user.id, topic_id=topic_id)


@router.put("/topics/{topic_id}/materials", response_model=list[TopicMaterialSummary])
def set_materials(
    topic_id: int,
    request: MaterialSelection,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return materials.replace_topic_materials(
        db, user_id=user.id, topic_id=topic_id, materials=request.materials
    )


@router.post("/topics/{topic_id}/retrieve", response_model=RetrievalResult)
def retrieve_topic(
    topic_id: int,
    request: RetrievalRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    refs = materials.topic_refs(db, user_id=user.id, topic_id=topic_id)
    load_user_profiles(db, user.id)
    return retrieve(
        db,
        user_id=user.id,
        materials=refs,
        request=request,
        topic_id=topic_id,
        model_id=resolve_model_id(None, user_id=user.id),
    )
