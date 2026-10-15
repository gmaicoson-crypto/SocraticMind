from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import event

from models import AgentRun, AssessmentAttempt, User
from tests.p0.test_assessment_service import create_assessable_node


def add_attempt(db, user, node, *, sequence=0, status="completed", legacy=False):
    score = 9 if legacy else 60 + sequence
    result = {
        "node_id": node.id,
        "node_label": node.label,
        "total_score": score,
        "passed": legacy or score >= 75,
        "scores": [{"question_id": "q1", "score": 3 if legacy else score, "rationale": "反馈"}],
        "evidence": f"第 {sequence} 次评估",
        "weaknesses": [],
        "professional_review_required": False,
        "threshold": {"minimum_score": 9 if legacy else 75},
        "next_actions": [],
    }
    if not legacy:
        result["max_score"] = 100
    run = AgentRun(
        user_id=user.id,
        topic_id=node.topic_id,
        run_type="assessment",
        status="completed" if status == "completed" else "assessing",
        result_json=result if status == "completed" else None,
        state_json={
            "questions": [
                {"question_id": "q1", "prompt": "历史原题", "reference_answer": "原参考答案"}
            ],
            "answers": [{"question_id": "q1", "answer": f"第 {sequence} 次回答"}],
        },
    )
    db.add(run)
    db.flush()
    attempt = AssessmentAttempt(
        user_id=user.id,
        node_id=node.id,
        run_id=run.id,
        status=status,
        total_score=score if status == "completed" else None,
        completed_at=datetime(2026, 10, 15, tzinfo=timezone.utc) + timedelta(minutes=sequence)
        if status == "completed"
        else None,
    )
    db.add(attempt)
    db.commit()
    return attempt


def test_history_pages_through_all_node_results_without_loading_full_answers(
    client, db_session, auth_user
):
    node, _ = create_assessable_node(db_session, auth_user)
    attempts = [
        add_attempt(db_session, auth_user, node, sequence=i, legacy=i == 0) for i in range(23)
    ]
    for status in ("active", "failed", "cancelled"):
        add_attempt(db_session, auth_user, node, status=status)
    other_node, _ = create_assessable_node(db_session, auth_user)
    add_attempt(db_session, auth_user, other_node)

    selects = []

    def count_selects(_conn, _cursor, statement, _parameters, _context, _executemany):
        if statement.lstrip().upper().startswith("SELECT"):
            selects.append(statement)

    event.listen(db_session.bind, "before_cursor_execute", count_selects)
    try:
        response = client.get(f"/api/nodes/{node.id}/assessments")
    finally:
        event.remove(db_session.bind, "before_cursor_execute", count_selects)
    assert response.status_code == 200
    first = response.json()
    assert len(first["items"]) == 20
    assert first["page"] == 1
    assert first["page_size"] == 20
    assert first["total"] == 23
    assert first["total_pages"] == 2
    assert len(selects) == 3
    assert all("questions_json" not in query and "state_json" not in query for query in selects)
    assert "历史原题" not in response.text
    assert first["items"][0]["passed"] is True
    assert first["items"][0]["max_score"] == 100
    assert first["items"][0]["assessed_at"].endswith("Z")

    second = client.get(f"/api/nodes/{node.id}/assessments", params={"page": 2}).json()
    assert second["page"] == 2
    assert second["total"] == 23
    assert second["total_pages"] == 2
    assert [item["id"] for item in first["items"] + second["items"]] == [
        item.id for item in reversed(attempts)
    ]
    legacy = second["items"][-1]
    assert legacy["max_score"] == 12
    assert legacy["total_score"] == 9
    assert legacy["passed"] is True
    assert client.get(f"/api/nodes/{node.id}/assessments", params={"page": 1}).json() == first
    assert client.get(f"/api/nodes/{node.id}/assessments", params={"page": 999}).json() == second

    smaller_page = client.get(
        f"/api/nodes/{node.id}/assessments", params={"page": 3, "page_size": 5}
    ).json()
    assert smaller_page["page"] == 3
    assert smaller_page["page_size"] == 5
    assert smaller_page["total_pages"] == 5
    assert [item["id"] for item in smaller_page["items"]] == [
        item.id for item in list(reversed(attempts))[10:15]
    ]

    state_before = node.state
    detail = client.get(f"/api/agent/runs/{legacy['run_id']}").json()["result"]
    assert detail["scores"][0]["question"] == "历史原题"
    assert detail["scores"][0]["answer"] == "第 0 次回答"
    assert detail["scores"][0]["reference_answer"] == "原参考答案"
    assert node.state == state_before


def test_history_is_scoped_to_owned_node_and_current_user(client, db_session, auth_user):
    node, _ = create_assessable_node(db_session, auth_user)
    owner = User(username="history-owner", email="history@example.com", hashed_password="hash")
    db_session.add(owner)
    db_session.commit()
    foreign_node, _ = create_assessable_node(db_session, owner)
    foreign_attempt = add_attempt(db_session, owner, foreign_node)
    add_attempt(db_session, owner, node)
    for node_id in (foreign_node.id, 999999):
        response = client.get(f"/api/nodes/{node_id}/assessments")
        assert response.status_code == 404
        assert response.json()["code"] == "NODE_NOT_FOUND"
    assert client.get(f"/api/nodes/{node.id}/assessments").json() == {
        "items": [],
        "page": 1,
        "page_size": 20,
        "total": 0,
        "total_pages": 0,
    }
    assert client.get(f"/api/agent/runs/{foreign_attempt.run_id}").status_code == 404


def test_history_keeps_completed_scores_when_later_mastery_update_failed(
    client, db_session, auth_user
):
    node, _ = create_assessable_node(db_session, auth_user)
    attempt = add_attempt(db_session, auth_user, node)
    run = db_session.get(AgentRun, attempt.run_id)
    run.status = "failed"
    run.error_code = "NODE_LOCKED"
    db_session.commit()

    response = client.get(f"/api/nodes/{node.id}/assessments")
    assert response.status_code == 200
    assert [item["id"] for item in response.json()["items"]] == [attempt.id]
    detail = client.get(f"/api/agent/runs/{run.id}").json()
    assert detail["result"]["scores"][0]["question"] == "历史原题"
    assert node.state == "available"


def test_history_refreshes_totals_after_new_results_and_handles_full_pages(
    client, db_session, auth_user
):
    node, _ = create_assessable_node(db_session, auth_user)
    for index in range(20):
        add_attempt(db_session, auth_user, node, sequence=index)
    first = client.get(f"/api/nodes/{node.id}/assessments").json()
    assert first["total"] == 20
    assert first["total_pages"] == 1
    add_attempt(db_session, auth_user, node, sequence=20)
    second = client.get(f"/api/nodes/{node.id}/assessments", params={"page": 2}).json()
    assert second["total"] == 21
    assert second["total_pages"] == 2
    assert second["page"] == 2
    assert len(second["items"]) == 1


@pytest.mark.parametrize("params", [{"page_size": 0}, {"page_size": 51}, {"page": 0}, {"page": -1}])
def test_history_validates_page_bounds(client, db_session, auth_user, params):
    node, _ = create_assessable_node(db_session, auth_user)
    assert client.get(f"/api/nodes/{node.id}/assessments", params=params).status_code == 422
