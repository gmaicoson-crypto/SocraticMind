"""Build plan previews from reusable graph results without model calls."""

from copy import deepcopy
from typing import Any

from services.planning import build_schedule, today_in_timezone
from .structured_ai import high_risk_notice


def build_plan_preview(
    state: dict[str, Any], graph: list[dict], emoji: str, *, existing: bool = False
) -> dict[str, Any]:
    params = state["params"]
    graph = deepcopy(graph)
    start_date, effective_timezone = today_in_timezone(params.get("timezone"))
    target_date = params.get("target_date")
    if target_date:
        from datetime import date

        target_date = date.fromisoformat(target_date)
    plan = build_schedule(
        graph,
        daily_minutes=params["daily_minutes"],
        start_date=start_date,
        target_date=target_date,
        timezone=effective_timezone,
        skip_node_keys={node["key"] for node in graph if node.get("state") == "mastered"}
        if existing
        else set(),
    )
    return {
        **(
            {
                "sources": state["evidence"]["sources"],
                "coverage": state["evidence"]["coverage"],
                "evidence_warnings": state["evidence"]["warnings"],
            }
            if state.get("evidence")
            else {}
        ),
        **({"existing_topic_id": params["existing_topic_id"]} if existing else {}),
        "topic": params["topic"],
        "emoji": emoji,
        "goal": params["goal"],
        "domain": params["domain"],
        "outcome_type": params["outcome_type"],
        "diagnostic": state.get("diagnostic_result"),
        "nodes": graph,
        "plan_items": [
            {
                "node_key": item.node_key,
                "scheduled_date": item.scheduled_date.isoformat(),
                "day_order": item.day_order,
                "estimated_minutes": item.estimated_minutes,
                "status": item.status,
            }
            for item in plan.items
        ],
        "total_minutes": plan.total_minutes,
        "daily_minutes": params["daily_minutes"],
        "start_date": start_date.isoformat(),
        "estimated_end_date": plan.estimated_end_date.isoformat(),
        "target_date": params.get("target_date"),
        "will_miss_target": plan.will_miss_target,
        "delay_days": plan.delay_days,
        "effective_timezone": plan.effective_timezone,
        "risk_notice": high_risk_notice(params["domain"], params["topic"]),
    }
