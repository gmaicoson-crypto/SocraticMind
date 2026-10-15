from datetime import datetime

from pydantic import BaseModel


class AssessmentHistoryItem(BaseModel):
    id: int
    run_id: str
    assessed_at: datetime
    total_score: int | None
    max_score: int
    passed: bool


class AssessmentHistoryPage(BaseModel):
    items: list[AssessmentHistoryItem]
    page: int
    page_size: int
    total: int
    total_pages: int
