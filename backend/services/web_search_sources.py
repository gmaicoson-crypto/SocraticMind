"""Validate and normalize search links and publication dates."""

import ipaddress
import re
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit


_SECRET_PATTERN = re.compile(
    r"(?i)(?:\b(?:sk|tvly|ghp|github_pat)[-_][a-z0-9_-]{12,}"
    r"|\b(?:api[_ -]?key|password|passwd|secret|access[_ -]?token|authorization|密码|密钥)"
    r"\s*[:=：]\s*[^\s,;，；]+|\bBearer\s+\S+"
    r"|\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+"
    r"|-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----)"
)


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def canonical_source_url(value: object) -> str | None:
    """Validate display links and deduplicate tracking/fragment variants, never fetch them."""
    if not isinstance(value, str) or len(value) > 2048 or re.search(r"[\x00-\x20\\]", value):
        return None
    try:
        parts = urlsplit(value)
        if parts.scheme.lower() not in {"http", "https"} or not parts.hostname:
            return None
        if parts.username or parts.password:
            return None
        host = parts.hostname.rstrip(".").lower().encode("idna").decode()
        if (
            len(host) > 253
            or host in {"localhost", "localhost.localdomain"}
            or host.endswith((".localhost", ".local"))
        ):
            return None
        try:
            if not ipaddress.ip_address(host).is_global:
                return None
        except ValueError:
            if not all(
                re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", label)
                for label in host.split(".")
            ):
                return None
            # Reject alternate browser IPv4 spellings and non-public single-label names.
            if "." not in host or all(
                re.fullmatch(r"(?:0x[0-9a-f]+|[0-9]+)", label) for label in host.split(".")
            ):
                return None
        port = parts.port
        authority = f"[{host}]" if ":" in host else host
        if port and (parts.scheme.lower(), port) not in {("http", 80), ("https", 443)}:
            authority += f":{port}"
        query = urlencode(
            sorted(
                (key, value)
                for key, value in parse_qsl(parts.query, keep_blank_values=True)
                if not key.lower().startswith("utm_") and key.lower() not in {"fbclid", "gclid"}
            )
        )
        if _SECRET_PATTERN.search(value):
            return None
        normalized = urlunsplit((parts.scheme.lower(), authority, parts.path or "/", query, ""))
        return normalized if len(normalized) <= 2048 else None
    except (ValueError, UnicodeError):
        return None


def _published_at(value: object) -> str | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            parsed = parsedate_to_datetime(value)
        # Unknown timezone is retained as supplied; do not invent publication precision.
        return (
            parsed.isoformat()
            if parsed.tzinfo is None
            else parsed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
        )
    except (ValueError, TypeError, OverflowError):
        return None
