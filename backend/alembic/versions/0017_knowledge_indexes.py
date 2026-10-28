"""Versioned semantic vectors and recoverable indexing jobs."""

from alembic import op
import sqlalchemy as sa

revision = "0017_knowledge_indexes"
down_revision = "0016_review_tasks"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "knowledge_embeddings",
        sa.Column(
            "attachment_id",
            sa.String(36),
            sa.ForeignKey("attachments.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("revision", sa.Integer(), primary_key=True),
        sa.Column("config_hash", sa.String(64), primary_key=True),
        sa.Column("chunk_id", sa.String(64), primary_key=True),
        sa.Column("content_hash", sa.String(64), nullable=False),
        sa.Column("dimensions", sa.Integer(), nullable=False),
        sa.Column("vector", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_table(
        "knowledge_index_jobs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column(
            "attachment_id",
            sa.String(36),
            sa.ForeignKey("attachments.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("config_hash", sa.String(64), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("lease_token", sa.String(36)),
        sa.Column("lease_until", sa.DateTime(timezone=True)),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("next_retry_at", sa.DateTime(timezone=True)),
        sa.Column("completed_chunks", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_chunks", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("api_calls", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("known_input_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("unknown_usage_calls", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error_code", sa.String(80)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index(
        "uq_knowledge_index_version",
        "knowledge_index_jobs",
        ["attachment_id", "revision", "config_hash"],
        unique=True,
    )
    op.create_index(
        "ix_knowledge_index_work",
        "knowledge_index_jobs",
        ["config_hash", "status", "next_retry_at"],
    )


def downgrade():
    op.drop_table("knowledge_index_jobs")
    op.drop_table("knowledge_embeddings")
