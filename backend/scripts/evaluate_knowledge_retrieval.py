"""Evaluate the actual retriever on a labelled public corpus in an isolated database.

Run from backend: .venv/bin/python -m scripts.evaluate_knowledge_retrieval --lexical-only
Omit --lexical-only only after configuring a real embedding provider. No user data is read.
"""

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean
from time import perf_counter
from uuid import uuid4

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from core.ai_client import resolve_model_id
from core.config import settings
from core.database import Base
from models import Attachment, AttachmentChunk, KnowledgeIndexJob, User
from schemas.knowledge import MaterialRef, RetrievalRequest
from services.knowledge.embedding_client import configured_embedding
from services.knowledge.index_store import enqueue_indexes
from services.knowledge.indexing import run_one_index_batch
from services.knowledge.retrieval import retrieve

DATASET = Path(__file__).resolve().parents[1] / "tests/fixtures/knowledge_retrieval_eval.json"


def score_cases(cases, k):
    answerable = [case for case in cases if case["expected"]]
    empty = [case for case in cases if not case["expected"]]
    recall = [
        len(set(case["retrieved"][:k]) & set(case["expected"])) / len(set(case["expected"]))
        for case in answerable
    ]
    returned = sum(len(case["retrieved"][:k]) for case in cases)
    supported = sum(len(set(case["retrieved"][:k]) & set(case["expected"])) for case in cases)
    times = sorted(case["latency_ms"] for case in cases)
    return {
        "recall_at_k": mean(recall) if recall else None,
        "labelled_evidence_precision_at_k": supported / returned if returned else None,
        "no_answer_abstention_rate": sum(not case["retrieved"] for case in empty) / len(empty)
        if empty
        else None,
        "latency_p50_ms": times[(len(times) - 1) // 2] if times else None,
        "latency_p95_ms": times[min(len(times) - 1, int(len(times) * 0.95))] if times else None,
        "query_known_input_tokens": sum(case["query_input_tokens"] or 0 for case in cases),
        "unknown_query_usage_calls": sum(
            case.get("query_attempted", case.get("method") == "hybrid")
            and case["query_input_tokens"] is None
            for case in cases
        ),
    }


def populate(db, dataset):
    user = User(username="retrieval-eval", email="eval@example.test", hashed_password="unused")
    db.add(user)
    db.flush()
    documents = []
    for entry in dataset["documents"]:
        identifier = str(uuid4())
        doc = Attachment(
            id=identifier,
            user_id=user.id,
            client_upload_id=identifier,
            draft_session_id="evaluation",
            mode="normal",
            name=entry["title"],
            mime_type="text/plain",
            kind="document",
            size=0,
            sha256="0" * 64,
            storage_key="evaluation-only",
            status="ready",
            revision=1,
        )
        db.add(doc)
        db.flush()
        for index, chunk in enumerate(entry["chunks"]):
            db.add(
                AttachmentChunk(
                    attachment_id=identifier,
                    revision=1,
                    chunk_id=chunk["id"],
                    position=index,
                    text=chunk["text"],
                    locator={"page": index + 1},
                    block_type="paragraph",
                    title_path=[entry["title"]],
                    asset_refs=[],
                )
            )
        documents.append(doc)
    db.commit()
    return user, documents


def run_evaluation(dataset, *, lexical_only, k=5):
    original = settings.knowledge_embedding_enabled
    config = None if lexical_only else configured_embedding()
    if not lexical_only and config is None:
        raise ValueError("真实语义评测需要配置并启用 embedding；仅跑基线请使用 --lexical-only")
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    report = {
        "dataset_version": dataset["version"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "k": k,
        "semantic_evaluated": not lexical_only,
        "quality_note": "标注片段命中率不是生成答案的事实正确率；语义质量只能依据真实供应商结果判断。",
        "modes": {},
        "index": None,
    }
    try:
        with factory() as db:
            user, documents = populate(db, dataset)
            refs = [MaterialRef(attachment_id=doc.id, revision=doc.revision) for doc in documents]
            model_id = resolve_model_id(None)
            for mode in ["lexical"] if lexical_only else ["lexical", "hybrid"]:
                settings.knowledge_embedding_enabled = mode == "hybrid"
                if mode == "hybrid":
                    enqueue_indexes(db, user_id=user.id, documents=documents, config=config)
                    db.commit()
                    began = perf_counter()
                    # Each corpus is bounded; on the first failed batch, report the failure.
                    for _ in range(100):
                        if not run_one_index_batch(factory, config=config):
                            break
                    db.expire_all()
                    jobs = db.query(KnowledgeIndexJob).all()
                    report["index"] = {
                        "status": "ready"
                        if all(job.status == "ready" for job in jobs)
                        else "incomplete",
                        "latency_ms": round((perf_counter() - began) * 1000),
                        "api_calls": sum(job.api_calls for job in jobs),
                        "known_input_tokens": sum(job.known_input_tokens for job in jobs),
                        "unknown_usage_calls": sum(job.unknown_usage_calls for job in jobs),
                        "errors": [job.error_code for job in jobs if job.error_code],
                    }
                    if report["index"]["status"] != "ready":
                        report["semantic_evaluated"] = False
                        break
                cases = []
                for case in dataset["queries"]:
                    result = retrieve(
                        db,
                        user_id=user.id,
                        materials=refs,
                        model_id=model_id,
                        request=RetrievalRequest(query=case["query"], token_budget=8000),
                    )
                    cases.append(
                        {
                            "id": case["id"],
                            "expected": case["expected"],
                            "retrieved": [source["chunk_id"] for source in result.sources],
                            "method": result.method,
                            "index_status": result.index_status,
                            "latency_ms": result.latency_ms,
                            "query_input_tokens": result.metrics.get("query_input_tokens"),
                            "query_attempted": result.metrics.get("query_attempted", False),
                            "warnings": result.warnings,
                        }
                    )
                report["modes"][mode] = {**score_cases(cases, k), "cases": cases}
                if mode == "hybrid" and any(
                    case["method"] not in {"hybrid", "location"} for case in cases
                ):
                    report["semantic_evaluated"] = False
        return report
    finally:
        settings.knowledge_embedding_enabled = original
        engine.dispose()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--lexical-only", action="store_true")
    parser.add_argument("--dataset", type=Path, default=DATASET)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--k", type=int, choices=range(1, 13), default=5)
    args = parser.parse_args()
    report = run_evaluation(
        json.loads(args.dataset.read_text()), lexical_only=args.lexical_only, k=args.k
    )
    content = json.dumps(report, ensure_ascii=False, indent=2)
    if args.output:
        args.output.write_text(content + "\n")
    else:
        print(content)


if __name__ == "__main__":
    main()
