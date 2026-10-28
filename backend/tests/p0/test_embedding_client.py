"""Transport contracts, bounded inputs and version identity (no external requests)."""

import json
from dataclasses import replace

import anyio
import httpx
import pytest

from services.knowledge.embedding_client import (
    EmbeddingConfig,
    EmbeddingError,
    INPUT_BYTES,
    configured_embedding,
    embed_texts,
    split_input,
    unit_vector,
)
from core.config import settings


def config(**changes):
    return EmbeddingConfig(
        base_url="https://embedding.example.test/v1",
        model="embed-test",
        api_key="private-test-key",
        **changes,
    )


@pytest.fixture
def inherited_connection(monkeypatch):
    profiles = [
        dict(
            id="server-one",
            name="Server One",
            model="chat-only",
            api_key="server-secret",
            base_url="https://one.example.test/v1",
        ),
        dict(
            id="server-two",
            name="Server Two",
            model="other-chat",
            api_key="second-secret",
            base_url="https://two.example.test/v1",
        ),
    ]
    monkeypatch.setattr(settings, "llm_models", json.dumps(profiles))
    monkeypatch.setattr(settings, "llm_default_model_id", "server-one")
    for key, value in {
        "enabled": True,
        "llm_profile": "default",
        "base_url": "",
        "api_key": "",
        "model": "actual-embedding",
    }.items():
        monkeypatch.setattr(settings, "knowledge_embedding_" + key, value)


def test_explicit_server_connection_reuse_keeps_embedding_model_separate(
    inherited_connection, monkeypatch
):
    cfg = configured_embedding()
    assert cfg.base_url == "https://one.example.test/v1"
    assert cfg.api_key == "server-secret" and cfg.model == "actual-embedding"
    assert "server-secret" not in repr(cfg)
    for selector in ("server-two", "Server Two", "other-chat"):
        monkeypatch.setattr(settings, "knowledge_embedding_llm_profile", selector)
        assert configured_embedding().base_url == "https://two.example.test/v1"
        assert configured_embedding().fingerprint != cfg.fingerprint


@pytest.mark.parametrize(
    "field,value",
    [
        ("base_url", "https://unrelated.example.test/v1"),
        ("api_key", "override"),
        ("llm_profile", "missing"),
        ("model", ""),
    ],
)
def test_inherited_connection_rejects_ambiguous_overrides_or_missing_model(
    inherited_connection, monkeypatch, field, value
):
    monkeypatch.setattr(settings, "knowledge_embedding_" + field, value)
    with pytest.raises(EmbeddingError, match="EMBEDDING_CONFIG_INVALID"):
        configured_embedding()


def test_batch_request_orders_vectors_and_reports_usage_without_persisting_key():
    received = []

    def respond(request):
        received.append(json.loads(request.content))
        assert request.headers["authorization"] == "Bearer private-test-key"
        return httpx.Response(
            200,
            json={
                "data": [
                    {"index": 1, "embedding": [0, 2]},
                    {"index": 0, "embedding": [3, 0]},
                ],
                "usage": {"prompt_tokens": 7},
            },
        )

    cfg = config(dimensions=2)
    result = embed_texts(cfg, ["first", "second"], transport=httpx.MockTransport(respond))
    assert result.vectors == [[1, 0], [0, 1]] and result.input_tokens == 7
    assert received == [
        {
            "model": "embed-test",
            "input": ["first", "second"],
            "encoding_format": "float",
            "dimensions": 2,
        }
    ]
    assert "private-test-key" not in repr(cfg)
    assert cfg.fingerprint == replace(cfg, api_key="rotated-key").fingerprint
    for changed in (
        replace(cfg, dimensions=3),
        replace(cfg, model="another"),
        replace(cfg, document_prefix="passage: "),
        replace(cfg, query_prefix="query: "),
    ):
        assert cfg.fingerprint != changed.fingerprint


def test_unicode_segmentation_preserves_all_text_and_omits_unrequested_dimensions():
    original = "知识🙂参考资料" * 500
    parts = split_input(original, "passage: ")
    assert "".join(part.removeprefix("passage: ") for part in parts) == original
    assert max(len(part.encode()) for part in parts) <= INPUT_BYTES
    requests = []

    def respond(request):
        requests.append(json.loads(request.content))
        return httpx.Response(200, json={"data": [{"index": 0, "embedding": [1, 0]}]})

    assert (
        embed_texts(config(), ["query"], transport=httpx.MockTransport(respond)).input_tokens
        is None
    )
    assert "dimensions" not in requests[0]


@pytest.mark.parametrize(
    "rows",
    [
        [],
        [{"index": 1, "embedding": [1, 0]}],
        [{"index": True, "embedding": [1, 0]}],
        [{"index": 0, "embedding": [0, 0]}],
        [{"index": 0, "embedding": [1]}],
        [{"index": 0, "embedding": [True, 0]}],
        [{"index": 0, "embedding": "base64"}],
    ],
)
def test_invalid_provider_vectors_are_rejected(rows):
    with pytest.raises(EmbeddingError, match="EMBEDDING_RESPONSE_INVALID"):
        embed_texts(
            config(dimensions=2),
            ["question"],
            transport=httpx.MockTransport(lambda _: httpx.Response(200, json={"data": rows})),
        )


def test_timeout_covers_the_entire_request_and_provider_errors_do_not_leak_content():
    async def slow(_):
        await anyio.sleep(0.1)
        return httpx.Response(200)

    with pytest.raises(EmbeddingError, match="EMBEDDING_UNAVAILABLE"):
        embed_texts(config(timeout=0.01), ["text"], transport=httpx.MockTransport(slow))
    with pytest.raises(EmbeddingError) as caught:
        embed_texts(
            config(),
            ["text"],
            transport=httpx.MockTransport(
                lambda _: httpx.Response(401, text="private-test-key and private document")
            ),
        )
    assert str(caught.value) == "EMBEDDING_PROVIDER_ERROR"


def test_oversized_response_and_inputs_are_bounded():
    with pytest.raises(EmbeddingError, match="EMBEDDING_RESPONSE_LIMIT"):
        embed_texts(
            config(),
            ["text"],
            transport=httpx.MockTransport(lambda _: httpx.Response(200, content=b"x" * 4_000_001)),
        )
    for texts in ([""], ["x"] * 17, ["x" * 6001]):
        with pytest.raises(EmbeddingError, match="EMBEDDING_INPUT_LIMIT"):
            embed_texts(config(), texts)


def test_malformed_url_and_corrupt_cached_vector_use_safe_error_codes(monkeypatch):
    monkeypatch.setattr(settings, "knowledge_embedding_enabled", True)
    monkeypatch.setattr(settings, "knowledge_embedding_llm_profile", "")
    monkeypatch.setattr(settings, "knowledge_embedding_base_url", "https://[invalid")
    with pytest.raises(EmbeddingError, match="EMBEDDING_CONFIG_INVALID"):
        configured_embedding()
    with pytest.raises(EmbeddingError, match="EMBEDDING_RESPONSE_INVALID"):
        unit_vector([10**1000, 1])
