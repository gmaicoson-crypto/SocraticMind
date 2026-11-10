from datetime import date, datetime, time, timedelta

from models.progress import LearningRecord
from routers import progress


def test_check_in_returns_the_next_server_day_without_recording_twice(
    client, db_session, monkeypatch
):
    class FixedDate(date):
        @classmethod
        def today(cls):
            return cls(2026, 11, 10)

    monkeypatch.setattr(progress, "date", FixedDate)
    today = FixedDate.today()
    next_day = datetime.combine(today + timedelta(days=1), time.min)

    first = client.post("/api/progress/record")
    second = client.post("/api/progress/record")

    assert first.status_code == second.status_code == 200
    expected = {
        "date": today.isoformat(),
        "recorded": True,
        "next_record_at_ms": int(next_day.timestamp() * 1000),
    }
    assert first.json() == second.json() == expected
    assert db_session.query(LearningRecord).count() == 1
    streak = client.get("/api/progress/streak").json()
    assert streak["recent"][-1] == {"date": today.isoformat(), "learned": True}
    assert streak["streak"] == 1
