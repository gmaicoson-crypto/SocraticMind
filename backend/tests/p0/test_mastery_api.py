import json

from sqlalchemy import event

from models import User
from routers.agent import get_agent_generator
from tests.p0.test_assessment_service import AssessmentGenerator, create_assessable_node


def test_assessment_api_and_answer_protocol(app, client, db_session, auth_user):
    node, _item = create_assessable_node(db_session, auth_user)
    app.dependency_overrides[get_agent_generator] = lambda: AssessmentGenerator()

    started = client.post(
        "/api/agent/assessments",
        json={"node_id": node.id, "request_id": "api-assessment"},
    )
    assert started.status_code == 201
    run = started.json()
    assert run["step"]["current"] == 1
    assert "Reference answer" not in json.dumps(run)
    for index in range(3):
        response = client.post(
            f"/api/agent/runs/{run['run_id']}/answers",
            json={
                "step_id": run["step"]["step_id"],
                "version": run["version"],
                "answer": f"answer {index}",
            },
        )
        assert response.status_code == 200
        run = response.json()
        if index < 2:
            assert "Reference answer" not in json.dumps(run)
    assert run["result"]["passed"] is True
    assert run["result"]["node_id"] == node.id
    assert run["result"]["max_score"] == 100
    assert run["result"]["threshold"] == {"minimum_score": 75}
    assert run["result"]["scores"][0]["question"] == "Question 1"
    assert run["result"]["scores"][0]["answer"] == "answer 0"
    assert run["result"]["scores"][0]["reference_answer"] == "Reference answer 1"
    assert run["result"]["scores"][0]["rubric"][0]["max_score"] == 100
    assert run["result"]["scores"][0]["criterion_scores"][0]["score"] == 85

    selects = []

    def count_selects(_conn, _cursor, statement, _parameters, _context, _executemany):
        if statement.lstrip().upper().startswith("SELECT"):
            selects.append(statement)

    event.listen(db_session.bind, "before_cursor_execute", count_selects)
    try:
        nodes = client.get(f"/api/nodes/topic/{node.topic_id}")
    finally:
        event.remove(db_session.bind, "before_cursor_execute", count_selects)
    assert nodes.status_code == 200
    assert len(selects) <= 3
    node_payload = next(item for item in nodes.json() if item["id"] == node.id)
    assert node_payload["mastery_source"] == "assessment"
    assert node_payload["assessment_result"]["passed"] is True
    assert node_payload["assessment_result"]["scores"] == run["result"]["scores"]


def test_legacy_results_recover_saved_question_and_answer_text(client, db_session, auth_user):
    from copy import deepcopy
    from models import AssessmentAttempt
    from routers.agent import serialize_run
    from services.assessments import start_assessment
    from tests.p0.test_assessment_service import complete_answers

    node, _ = create_assessable_node(db_session, auth_user)
    generator = AssessmentGenerator()
    run = start_assessment(
        db_session,
        user_id=auth_user.id,
        node_id=node.id,
        request_id="legacy-result",
        generator=generator,
    )
    run = complete_answers(db_session, auth_user.id, run, generator)
    legacy = {**run.result_json, "total_score": 9}
    legacy.pop("max_score")
    legacy.pop("remediation_route")
    legacy["scores"] = [
        {"question_id": f"aq{i}", "score": 3, "rationale": "Archived feedback"} for i in range(1, 4)
    ]
    run.result_json = legacy
    questions = deepcopy(run.state_json["questions"])
    for question in questions:
        question.pop("reference_answer", None)
        question["rubric"] = [
            {"criterion": "Observable evidence", "observable_standards": ["Specific and correct"]}
        ]
    run.state_json = {**run.state_json, "questions": questions}
    db_session.query(AssessmentAttempt).filter_by(run_id=run.id).one().questions_json = questions
    db_session.commit()

    payload = serialize_run(run).result
    assert payload["scores"][0]["question"] == "Question 1"
    assert payload["scores"][0]["answer"] == "answer 0"
    assert payload["scores"][0]["reference_answer"] == ""
    assert payload["scores"][0]["rubric"] == [
        {"criterion": "Observable evidence", "observable_standards": ["Specific and correct"]}
    ]
    nodes = client.get(f"/api/nodes/topic/{node.topic_id}").json()
    assert nodes[0]["assessment_result"]["scores"] == payload["scores"]
    assert run.result_json == legacy  # Reading does not rewrite archived scoring evidence.


def test_self_report_and_revert_are_idempotent(app, client, db_session, auth_user):
    node, _item = create_assessable_node(db_session, auth_user)

    first = client.post(f"/api/nodes/{node.id}/mastery", json={"request_id": "self-master"})
    second = client.post(f"/api/nodes/{node.id}/mastery", json={"request_id": "self-master"})
    assert first.status_code == second.status_code == 200
    assert first.json()["event_id"] == second.json()["event_id"]

    reverted = client.post(
        f"/api/nodes/{node.id}/mastery/revert", json={"request_id": "undo-master"}
    )
    repeated = client.post(
        f"/api/nodes/{node.id}/mastery/revert", json={"request_id": "undo-master"}
    )
    assert reverted.status_code == repeated.status_code == 200
    assert reverted.json()["state"] == "available"


def test_mastery_api_hides_other_users_node(client, db_session):
    owner = User(username="master-owner", email="master-owner@example.com", hashed_password="hash")
    db_session.add(owner)
    db_session.commit()
    node, _item = create_assessable_node(db_session, owner)

    response = client.post(f"/api/nodes/{node.id}/mastery", json={"request_id": "cross-master"})
    assert response.status_code == 404
    assert response.json()["code"] == "NODE_NOT_FOUND"
