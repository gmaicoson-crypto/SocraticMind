"""Model attempts, including failures and explicitly unknown usage.

Revision ID: 0020_agent_step_attempts
Revises: 0019_agent_jobs
"""

from alembic import op
import sqlalchemy as sa

revision = "0020_agent_step_attempts"
down_revision = "0019_agent_jobs"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "agent_step_attempts",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("run_id", sa.String(36), sa.ForeignKey("agent_runs.id", ondelete="CASCADE")),
        sa.Column("review_id", sa.Integer(), sa.ForeignKey("review_tasks.id", ondelete="CASCADE")),
        sa.Column("input_version", sa.Integer(), nullable=False),
        sa.Column("step", sa.String(80), nullable=False),
        sa.Column("model", sa.String(100)),
        sa.Column("lease_token", sa.String(36)),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("reported_tokens", sa.Integer(), nullable=False),
        sa.Column("usage_known", sa.Boolean(), nullable=False),
        sa.Column("latency_ms", sa.Integer(), nullable=False),
        sa.Column("error_code", sa.String(80)),
        sa.Column("calls_json", sa.JSON(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_agent_step_run", "agent_step_attempts", ["run_id", "id"])
    op.create_index(
        "ix_agent_step_review", "agent_step_attempts", ["review_id", "input_version", "id"]
    )


def downgrade():
    op.drop_table("agent_step_attempts")
