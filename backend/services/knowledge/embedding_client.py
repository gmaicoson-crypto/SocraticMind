"""Bounded OpenAI-compatible embedding transport and deterministic input versioning."""

import hashlib
import json
import math
import threading
from dataclasses import dataclass, field
from urllib.parse import urlsplit

import anyio
import httpx

from core.config import settings

INPUT_BYTES = 6000
BATCH_SIZE = 16
MAX_RESPONSE_BYTES = 4_000_000
_capacity = threading.BoundedSemaphore(4)


class EmbeddingError(Exception):
    def __init__(self, code):
        self.code = code
        super().__init__(code)


@dataclass(frozen=True)
class EmbeddingConfig:
    base_url: str
    model: str
    api_key: str = field(repr=False)
    dimensions: int | None = None
    timeout: float = 8
    document_prefix: str = ""
    query_prefix: str = ""
    min_similarity: float = 0.5

    @property
    def fingerprint(self):
        identity = [
            "chunk-mean-v1",
            self.base_url,
            self.model,
            self.dimensions,
            self.document_prefix,
            self.query_prefix,
            INPUT_BYTES,
        ]
        return hashlib.sha256(json.dumps(identity, ensure_ascii=False).encode()).hexdigest()


def configured_embedding():
    if not settings.knowledge_embedding_enabled:
        return None
    base_url = settings.knowledge_embedding_base_url
    api_key = settings.knowledge_embedding_api_key
    selector = settings.knowledge_embedding_llm_profile.strip()
    if selector:
        # Only server profiles are eligible: user chat selections must not change
        # the shared index's credentials or send its documents to another service.
        # Inheritance is atomic; never attach an inherited key to an override URL.
        if base_url.strip() or api_key:
            raise EmbeddingError("EMBEDDING_CONFIG_INVALID")
        try:
            profiles = settings.llm_profiles
            selected = settings.default_llm_profile_id if selector == "default" else selector
            matches = [p for p in profiles if selected in (p.id, p.name, p.model)]
        except ValueError:
            raise EmbeddingError("EMBEDDING_CONFIG_INVALID") from None
        if len(matches) != 1:
            raise EmbeddingError("EMBEDDING_CONFIG_INVALID")
        base_url, api_key = matches[0].base_url, matches[0].api_key
    url = base_url.strip().rstrip("/")
    try:
        parsed = urlsplit(url)
    except ValueError:
        raise EmbeddingError("EMBEDDING_CONFIG_INVALID") from None
    if (
        parsed.scheme not in {"https", "http"}
        or not parsed.hostname
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
        or not settings.knowledge_embedding_model.strip()
    ):
        raise EmbeddingError("EMBEDDING_CONFIG_INVALID")
    return EmbeddingConfig(
        base_url=url,
        model=settings.knowledge_embedding_model.strip(),
        api_key=api_key,
        dimensions=settings.knowledge_embedding_dimensions,
        timeout=settings.knowledge_embedding_timeout_seconds,
        document_prefix=settings.knowledge_embedding_document_prefix,
        query_prefix=settings.knowledge_embedding_query_prefix,
        min_similarity=settings.knowledge_embedding_min_similarity,
    )


def content_hash(text):
    return hashlib.sha256(text.encode()).hexdigest()


def split_input(text, prefix=""):
    raw = text.encode()
    capacity = INPUT_BYTES - len(prefix.encode())
    if not text.strip() or capacity < 256 or len(raw) > capacity * BATCH_SIZE:
        raise EmbeddingError("EMBEDDING_INPUT_LIMIT")
    parts = []
    while raw:
        part = raw[:capacity].decode("utf-8", errors="ignore")
        if not part:
            raise EmbeddingError("EMBEDDING_INPUT_LIMIT")
        raw = raw[len(part.encode()) :]
        if part.strip():
            parts.append(prefix + part)
    return parts


def unit_vector(value, dimensions=None):
    try:
        finite = isinstance(value, list) and all(
            type(v) in {int, float} and math.isfinite(v) for v in value
        )
    except OverflowError:
        finite = False
    if (
        not isinstance(value, list)
        or not 1 <= len(value) <= 4096
        or dimensions is not None
        and len(value) != dimensions
        or not finite
    ):
        raise EmbeddingError("EMBEDDING_RESPONSE_INVALID")
    length = math.hypot(*value)
    if not math.isfinite(length) or length == 0:
        raise EmbeddingError("EMBEDDING_RESPONSE_INVALID")
    return [v / length for v in value]


@dataclass(frozen=True)
class EmbeddingResult:
    vectors: list[list[float]]
    input_tokens: int | None


def embed_texts(config, texts, *, transport=None):
    """One request, no SDK retries; the task queue owns retry budgets."""
    if not 1 <= len(texts) <= BATCH_SIZE or any(
        not text.strip() or len(text.encode()) > INPUT_BYTES for text in texts
    ):
        raise EmbeddingError("EMBEDDING_INPUT_LIMIT")
    if not _capacity.acquire(blocking=False):
        raise EmbeddingError("EMBEDDING_BUSY")

    async def post():
        payload = {"model": config.model, "input": texts, "encoding_format": "float"}
        if config.dimensions is not None:
            payload["dimensions"] = config.dimensions
        headers = {"Authorization": f"Bearer {config.api_key}"} if config.api_key else {}
        with anyio.fail_after(config.timeout):
            async with httpx.AsyncClient(
                transport=transport, timeout=config.timeout, follow_redirects=False
            ) as client:
                async with client.stream(
                    "POST", config.base_url + "/embeddings", headers=headers, json=payload
                ) as response:
                    if response.status_code != 200:
                        raise EmbeddingError("EMBEDDING_PROVIDER_ERROR")
                    data = bytearray()
                    async for part in response.aiter_bytes():
                        data.extend(part)
                        if len(data) > MAX_RESPONSE_BYTES:
                            raise EmbeddingError("EMBEDDING_RESPONSE_LIMIT")
                    return json.loads(data)

    try:
        body = anyio.run(post)
        rows = body.get("data")
        if (
            not isinstance(rows, list)
            or len(rows) != len(texts)
            or any(not isinstance(row, dict) or type(row.get("index")) is not int for row in rows)
            or {row["index"] for row in rows} != set(range(len(texts)))
        ):
            raise EmbeddingError("EMBEDDING_RESPONSE_INVALID")
        vectors = [
            unit_vector(row.get("embedding"), config.dimensions)
            for row in sorted(rows, key=lambda row: row["index"])
        ]
        if len({len(vector) for vector in vectors}) != 1:
            raise EmbeddingError("EMBEDDING_RESPONSE_INVALID")
        tokens = (body.get("usage") or {}).get("prompt_tokens")
        return EmbeddingResult(vectors, tokens if type(tokens) is int and tokens >= 0 else None)
    except (httpx.HTTPError, TimeoutError) as error:
        raise EmbeddingError("EMBEDDING_UNAVAILABLE") from error
    except (ValueError, TypeError, AttributeError, OverflowError) as error:
        raise EmbeddingError("EMBEDDING_RESPONSE_INVALID") from error
    finally:
        _capacity.release()
