from collections.abc import Sequence
from typing import Any

from ai.graph_generator import assign_positions


class GraphValidationError(ValueError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def _parents(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [item.strip() for item in value.split(",") if item.strip()]
    if isinstance(value, Sequence):
        return [str(item).strip() for item in value if str(item).strip()]
    raise GraphValidationError("GRAPH_PARENT_FORMAT", "parent_keys must be a list or string")


def normalize_graph_nodes(nodes: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for raw in nodes:
        node = dict(raw)
        node["key"] = str(node.get("key", "")).strip()
        node["parent_keys"] = _parents(node.get("parent_keys"))
        normalized.append(node)
    return normalized


def stable_topological_sort(nodes: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized = normalize_graph_nodes(nodes)
    keys = [node["key"] for node in normalized]
    if any(not key for key in keys):
        raise GraphValidationError("GRAPH_KEY_REQUIRED", "every node needs a key")
    if len(set(keys)) != len(keys):
        raise GraphValidationError("GRAPH_DUPLICATE_KEY", "node keys must be unique")

    key_set = set(keys)
    for node in normalized:
        for parent in node["parent_keys"]:
            if parent == node["key"]:
                raise GraphValidationError(
                    "GRAPH_SELF_REFERENCE", f"node {node['key']} cannot depend on itself"
                )
            if parent not in key_set:
                raise GraphValidationError(
                    "GRAPH_PARENT_MISSING", f"parent {parent} does not exist"
                )

    roots = [node for node in normalized if not node["parent_keys"]]
    if len(roots) != 1:
        raise GraphValidationError("GRAPH_ROOT_COUNT", "graph must contain exactly one root")

    by_key = {node["key"]: node for node in normalized}
    children: dict[str, list[str]] = {key: [] for key in keys}
    indegree = {node["key"]: len(node["parent_keys"]) for node in normalized}
    for node in normalized:
        for parent in node["parent_keys"]:
            children[parent].append(node["key"])

    current_level = [roots[0]["key"]]
    ordered_keys: list[str] = []
    while current_level:
        ordered_keys.extend(current_level)
        next_ready: set[str] = set()
        for key in current_level:
            for child in children[key]:
                indegree[child] -= 1
                if indegree[child] == 0:
                    next_ready.add(child)
        current_level = [key for key in keys if key in next_ready]

    if len(ordered_keys) != len(normalized):
        raise GraphValidationError("GRAPH_CYCLE", "graph dependencies must not contain a cycle")
    return [by_key[key] for key in ordered_keys]


def validate_graph(nodes: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
    if not 6 <= len(nodes) <= 10:
        raise GraphValidationError("GRAPH_NODE_COUNT", "graph must contain 6 to 10 nodes")

    normalized = normalize_graph_nodes(nodes)
    for node in normalized:
        label = str(node.get("label", "")).strip()
        if not label:
            raise GraphValidationError("GRAPH_LABEL_REQUIRED", "every node needs a label")
        node["label"] = label
        duration = node.get("estimated_minutes")
        if isinstance(duration, bool) or not isinstance(duration, int) or not 10 <= duration <= 120:
            raise GraphValidationError(
                "GRAPH_DURATION", "estimated_minutes must be between 10 and 120"
            )

    return stable_topological_sort(normalized)


def prepare_graph(nodes: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
    """Validate first, then reuse the existing graph layout implementation."""
    return assign_positions(validate_graph(nodes))
