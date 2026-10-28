"""Durable Agent commands and idempotent creation.

Revision ID: 0019_agent_jobs
Revises: 0018_agent_checkpoints
"""

from alembic import op
import sqlalchemy as sa

revision = "0019_agent_jobs"
down_revision = "0018_agent_checkpoints"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("agent_runs") as batch:
        batch.add_column(sa.Column("create_request_id", sa.String(100), nullable=True))
        batch.add_column(sa.Column("create_request_hash", sa.String(64), nullable=True))
        batch.create_unique_constraint("uq_agent_create_request", ["user_id", "create_request_id"])
    op.create_table(
        "agent_jobs",
        sa.Column(
            "run_id",
            sa.String(36),
            sa.ForeignKey("agent_runs.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("event_json", sa.JSON(), nullable=True),
        sa.Column("requested_version", sa.Integer(), nullable=False),
        sa.Column("lease_token", sa.String(36), nullable=True),
        sa.Column("lease_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("available_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error_code", sa.String(80), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index(
        "ix_agent_jobs_available", "agent_jobs", ["status", "available_at", "lease_until"]
    )
    op.create_index("ix_agent_jobs_user_status", "agent_jobs", ["user_id", "status"])


def downgrade():
    op.drop_table("agent_jobs")
    with op.batch_alter_table("agent_runs") as batch:
        batch.drop_constraint("uq_agent_create_request", type_="unique")
        batch.drop_column("create_request_hash")
        batch.drop_column("create_request_id")
