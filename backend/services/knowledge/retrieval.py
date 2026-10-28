"""Shared bounded retrieval with authoritative source identities and explicit coverage."""

import json
from collections import defaultdict, deque
from time import perf_counter

from core.context_budget import count_text, get_context_policy
from core.errors import ApiError
from schemas.knowledge import MaterialRef, RetrievalRequest, RetrievalResult
from services.attachments.retrieval import (
    Chunk,
    MAX_SELECTED_CHUNKS,
)
from services.source_snapshots import file_source, normalize_sources
from .materials import load_documents, topic_refs
from .chunks import read_chunks
from .hybrid import select_hybrid


def _overview(chunks: list[Chunk], model_id: str, budget: int) -> list[Chunk]:
    """Cover documents/sections before adding more detail from any one section."""
    groups = defaultdict(deque)
    for chunk in chunks:
        groups[(chunk.attachment_id, tuple(chunk.title_path or []))].append(chunk)
    pending = deque(groups.values())
    selected, used = [], 0
    while pending and len(selected) < MAX_SELECTED_CHUNKS:
        group = pending.popleft()
        chunk = group.popleft()
        cost = count_text(chunk.text, model_id) + 180
        if used + cost <= budget:
            selected.append(chunk)
            used += cost
        if group:
            pending.append(group)
    return selected


def retrieve(
    db,
    *,
    user_id: int,
    materials: list[MaterialRef],
    request: RetrievalRequest,
    model_id: str,
    topic_id: int | None = None,
) -> RetrievalResult:
    started = perf_counter()
    if topic_id is not None:
        allowed = {
            (ref.attachment_id, ref.revision)
            for ref in topic_refs(db, user_id=user_id, topic_id=topic_id)
        }
        if any((ref.attachment_id, ref.revision) not in allowed for ref in materials):
            raise ApiError(
                status_code=409, code="MATERIAL_ACCESS_REVOKED", message="主题资料已解除关联"
            )
    documents = load_documents(db, user_id=user_id, materials=materials)
    chunks = read_chunks(db, documents)
    budget = min(request.token_budget, get_context_policy(model_id).hard_input_limit // 2)
    warnings, metrics, index_status = [], {}, "not_used"
    if request.purpose == "plan":
        selected, method = _overview(chunks, model_id, budget), "structural"
    else:
        selected, method, index_status, warnings, metrics = select_hybrid(
            db,
            user_id=user_id,
            documents=documents,
            chunks=chunks,
            query=request.query,
            model_id=model_id,
            budget=budget,
        )
        # Query embedding is external work. Revalidate permission and revision afterwards.
        documents = load_documents(db, user_id=user_id, materials=materials)
        if topic_id is not None:
            allowed = {
                (ref.attachment_id, ref.revision)
                for ref in topic_refs(db, user_id=user_id, topic_id=topic_id)
            }
            if any((ref.attachment_id, ref.revision) not in allowed for ref in materials):
                raise ApiError(
                    status_code=409, code="MATERIAL_ACCESS_REVOKED", message="主题资料已解除关联"
                )
    mapping = {doc.id: doc for doc in documents}
    sources = normalize_sources(
        [
            file_source(mapping[chunk.attachment_id], chunk, index)
            for index, chunk in enumerate(selected)
        ]
    )
    if topic_id is not None:
        for source in sources:
            source["topic_id"] = topic_id
    # Enforce the budget on the actual evidence payload, including source metadata.
    while sources and count_text(json.dumps(sources, ensure_ascii=False), model_id) > budget:
        sources.pop()
        selected.pop()
    coverage = [
        {
            "attachment_id": doc.id,
            "revision": doc.revision,
            "recognized": doc.accepted_coverage or doc.coverage,
            "selected_chunks": sum(c.attachment_id == doc.id for c in selected),
            "total_chunks": sum(c.attachment_id == doc.id for c in chunks),
        }
        for doc in documents
    ]
    if len(selected) < len(chunks):
        warnings.append("仅提供部分资料片段，不能声称完整阅读或覆盖全部章节")
    if not sources:
        warnings.append("未找到足够相关的资料，不能据此编造答案或自动扩大检索范围")
    return RetrievalResult(
        status="ready" if sources else "no_evidence",
        sources=sources,
        coverage=coverage,
        method=method,
        index_status=index_status,
        metrics=metrics,
        latency_ms=round((perf_counter() - started) * 1000),
        candidate_count=len(chunks),
        warnings=warnings,
    )


def revalidate_sources(
    db, *, user_id: int, sources: list[dict], topic_id: int | None = None, lock: bool = False
):
    """Reload text instead of trusting checkpoint excerpts; revoke stale identities."""
    normalized = normalize_sources(sources)
    if len(normalized) != len(sources) or any(
        source["kind"] != "document" for source in normalized
    ):
        raise ApiError(status_code=409, code="MATERIAL_EVIDENCE_INVALID", message="资料引用无效")
    refs = [
        MaterialRef(attachment_id=key[0], revision=key[1])
        for key in dict.fromkeys(
            (source["attachment_id"], source["revision"]) for source in normalized
        )
    ]
    if topic_id is not None:
        allowed = {
            (ref.attachment_id, ref.revision)
            for ref in topic_refs(db, user_id=user_id, topic_id=topic_id, lock=lock)
        }
        if any((ref.attachment_id, ref.revision) not in allowed for ref in refs):
            raise ApiError(
                status_code=409, code="MATERIAL_ACCESS_REVOKED", message="主题资料已解除关联"
            )
    documents = load_documents(db, user_id=user_id, materials=refs, lock=lock)
    mapping = {doc.id: doc for doc in documents}
    chunks = {
        (chunk.attachment_id, chunk.revision, chunk.chunk_id): chunk
        for chunk in read_chunks(db, documents)
    }
    refreshed = []
    for index, source in enumerate(normalized):
        chunk = chunks.get((source["attachment_id"], source["revision"], source["chunk_id"]))
        if chunk is None or chunk.locator != source["locator"]:
            raise ApiError(
                status_code=409, code="MATERIAL_EVIDENCE_INVALID", message="资料位置已失效"
            )
        current = file_source(mapping[chunk.attachment_id], chunk, index)
        current["id"] = source["id"]
        if topic_id is not None:
            current["topic_id"] = topic_id
        refreshed.append(current)
    return refreshed
