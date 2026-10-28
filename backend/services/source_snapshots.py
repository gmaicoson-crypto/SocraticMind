"""Shared source-snapshot validation without context or attachment-service dependencies."""

from datetime import datetime, timezone
import re
from urllib.parse import urlsplit
from services.web_search_sources import canonical_source_url

MAX_SOURCES = 64

MAX_WEB_SOURCES = 5

SOURCE_ID = re.compile(r"s[1-9][0-9]{0,15}\Z")


def _timestamp(value: object) -> bool:
    if not isinstance(value, str) or len(value) > 64:
        return False
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).tzinfo is not None
    except ValueError:
        return False


def normalize_sources(sources: object, *, require_excerpt: bool = False) -> list[dict]:
    """Validate the unified server source snapshot including file locators."""
    if not isinstance(sources, list):
        return []
    selected, seen = [], set()
    web_count = 0
    for source in sources[:MAX_SOURCES]:
        if not isinstance(source, dict):
            continue
        source_id, kind = source.get("id"), source.get("kind", "web")
        if (
            not isinstance(source_id, str)
            or not SOURCE_ID.fullmatch(source_id)
            or source_id in seen
            or not _timestamp(source.get("retrieved_at"))
        ):
            continue
        excerpt, title = source.get("excerpt", ""), source.get("title")
        if (
            not isinstance(excerpt, str)
            or (require_excerpt and not excerpt.strip())
            or not isinstance(title, str)
            or not title.strip()
        ):
            continue
        common = {
            "id": source_id,
            "kind": kind,
            "title": title[:300],
            "excerpt": excerpt[:8000],
            "retrieved_at": source["retrieved_at"],
        }
        if kind == "web":
            url = canonical_source_url(source.get("url"))
            if url is None or web_count >= MAX_WEB_SOURCES:
                continue
            common.update(
                url=url,
                domain=urlsplit(url).hostname,
                excerpt=excerpt[:2400],
                published_at=source["published_at"][:64]
                if isinstance(source.get("published_at"), str)
                else None,
            )
            web_count += 1
        elif kind in {"document", "image"}:
            attachment_id, revision = source.get("attachment_id"), source.get("revision")
            chunk_id, locator = source.get("chunk_id"), source.get("locator")
            if (
                not isinstance(attachment_id, str)
                or len(attachment_id) > 36
                or type(revision) is not int
                or revision < 1
                or not isinstance(locator, dict)
                or (kind == "document" and (not isinstance(chunk_id, str) or len(chunk_id) > 100))
                or (kind == "image" and chunk_id is not None)
            ):
                continue
            if any(
                not isinstance(key, str)
                or len(key) > 64
                or not isinstance(value, (str, int, list, type(None)))
                for key, value in locator.items()
            ):
                continue
            common.update(
                block_type=source.get("block_type", "image" if kind == "image" else "paragraph"),
                title_path=source.get("title_path", []),
                attachment_id=attachment_id,
                revision=revision,
                chunk_id=chunk_id,
                locator=locator,
            )
            if "topic_id" in source:
                if type(source["topic_id"]) is not int or source["topic_id"] < 1:
                    continue
                common["topic_id"] = source["topic_id"]
            if source.get("deleted"):
                common.update(deleted=True, excerpt="")
            if source.get("summary") is True and isinstance(source.get("covered_chunk_ids"), list):
                ids = source["covered_chunk_ids"]
                if len(ids) > 5000 or any(
                    not isinstance(item, str) or len(item) > 100 for item in ids
                ):
                    continue
                common.update(
                    summary=True, covered_chunk_ids=ids, coverage=source.get("coverage", [])
                )
        else:
            continue
        seen.add(source_id)
        selected.append(common)
    return selected


def file_source(attachment, chunk, index, *, excerpt=None, covered=None):
    source = {
        "kind": attachment.kind,
        "id": f"s{index + 6}",
        "title": attachment.name,
        "attachment_id": attachment.id,
        "revision": attachment.revision,
        "chunk_id": chunk.chunk_id if chunk else None,
        "locator": chunk.locator if chunk else {},
        "block_type": chunk.block_type if chunk else "image",
        "title_path": chunk.title_path if chunk else [],
        "excerpt": excerpt
        if excerpt is not None
        else (chunk.text if chunk else "本轮已提供的图片"),
        "retrieved_at": datetime.now(timezone.utc).isoformat(),
    }
    if covered:
        source["covered_chunk_ids"] = [c.chunk_id for c in covered]
        source["summary"] = True
        source["coverage"] = [c.locator for c in covered]
    return source
