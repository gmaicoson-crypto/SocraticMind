"""Search provider contract and bounded Tavily HTTP responses."""

import json
import math
import threading
from dataclasses import dataclass, field
from functools import lru_cache
from time import monotonic
from typing import Protocol
from urllib.parse import urlsplit
import httpx
from core.config import settings
from .web_search_sources import _utc_now, canonical_source_url, _published_at


class SearchProviderError(Exception):
    """Never carries provider response bodies, credentials or queries."""


@dataclass(frozen=True)
class SearchResult:
    sources: list[dict] = field(default_factory=list)
    credits: float | None = None


class SearchProvider(Protocol):
    def search(
        self, query: str, freshness: str, deadline: float, cancelled: threading.Event
    ) -> SearchResult: ...


@lru_cache(maxsize=1)
def _http_client() -> httpx.Client:
    return httpx.Client(
        limits=httpx.Limits(
            max_connections=settings.web_search_max_workers,
            max_keepalive_connections=settings.web_search_max_workers,
        ),
        follow_redirects=False,
    )


class TavilySearchProvider:
    def __init__(self, *, client: httpx.Client | None = None):
        self.client = client or _http_client()

    def search(
        self, query: str, freshness: str, deadline: float, cancelled: threading.Event
    ) -> SearchResult:
        remaining = deadline - monotonic()
        if remaining <= 0 or cancelled.is_set():
            raise SearchProviderError("搜索已过期")
        payload = {
            "query": query,
            "topic": "general",
            "search_depth": "basic",
            "max_results": 5,
            "include_answer": False,
            "include_raw_content": False,
            "include_images": False,
            "auto_parameters": False,
            "include_usage": True,
            "include_published_date": True,
        }
        if freshness != "any":
            payload["time_range"] = freshness
        try:
            with self.client.stream(
                "POST",
                settings.web_search_api_base.rstrip("/") + "/search",
                headers={"Authorization": "Bearer " + settings.tavily_api_key},
                json=payload,
                timeout=httpx.Timeout(remaining),
            ) as response:
                response.raise_for_status()
                body = bytearray()
                for chunk in response.iter_bytes():
                    if cancelled.is_set() or monotonic() >= deadline:
                        raise SearchProviderError("搜索已过期")
                    if len(body) + len(chunk) > settings.web_search_max_response_bytes:
                        raise SearchProviderError("搜索响应超出预算")
                    body.extend(chunk)
                data = json.loads(body)
        except (httpx.HTTPError, ValueError) as error:
            raise SearchProviderError("搜索服务暂时不可用") from error
        if not isinstance(data, dict) or not isinstance(data.get("results"), list):
            raise SearchProviderError("搜索结果结构无效")
        retrieved = _utc_now()
        sources = []
        for item in data["results"][:20]:
            if not isinstance(item, dict):
                continue
            url = canonical_source_url(item.get("url"))
            excerpt = item.get("content")
            if not url or not isinstance(excerpt, str) or not excerpt.strip():
                continue
            title = item.get("title")
            score = item.get("score")
            score = score if isinstance(score, (int, float)) and math.isfinite(score) else 0
            sources.append(
                {
                    "_score": score,
                    "title": title.strip()[:300]
                    if isinstance(title, str) and title.strip()
                    else urlsplit(url).hostname,
                    "url": url,
                    "domain": urlsplit(url).hostname,
                    "excerpt": excerpt.strip()[:2400],
                    "published_at": _published_at(item.get("published_date")),
                    "retrieved_at": retrieved,
                }
            )
        usage = data.get("usage")
        credits = usage.get("credits") if isinstance(usage, dict) else None
        if (
            not isinstance(credits, (int, float))
            or isinstance(credits, bool)
            or not math.isfinite(credits)
            or credits < 0
        ):
            credits = None
        return SearchResult(sources=sources, credits=credits)
