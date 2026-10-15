"""Persist per-question review scheduling and idempotent answer history."""

from alembic import op
import sqlalchemy as sa

revision = "0014_assessment_reviews"
down_revision = "0013_chat_session_titles"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "review_tasks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column(
            "node_id", sa.Integer(), sa.ForeignKey("nodes.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column(
            "assessment_id",
            sa.Integer(),
            sa.ForeignKey("assessment_attempts.id", ondelete="SET NULL"),
        ),
        sa.Column("question_id", sa.String(100), nullable=False),
        sa.Column("question_json", sa.JSON(), nullable=False),
        sa.Column("previous_answer", sa.Text(), nullable=False),
        sa.Column("feedback", sa.Text(), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column("timezone", sa.String(100), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("processing_token", sa.String(36)),
        sa.Column("processing_until", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("assessment_id", "question_id", name="uq_review_assessment_question"),
    )
    op.create_index("ix_review_user_status_due", "review_tasks", ["user_id", "status", "due_date"])
    op.create_table(
        "review_attempts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "review_id",
            sa.Integer(),
            sa.ForeignKey("review_tasks.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("request_id", sa.String(100), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("answer", sa.Text(), nullable=False),
        sa.Column("result_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("review_id", "request_id", name="uq_review_attempt_request"),
    )


def downgrade():
    op.drop_table("review_attempts")
    op.drop_table("review_tasks")
