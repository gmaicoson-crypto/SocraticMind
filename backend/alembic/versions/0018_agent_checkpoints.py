"""Persist LangGraph checkpoints and pending task writes.

Revision ID: 0018_agent_checkpoints
Revises: 0017_knowledge_indexes
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.mysql import MEDIUMBLOB

revision = "0018_agent_checkpoints"
down_revision = "0017_knowledge_indexes"
branch_labels = None
depends_on = None


def common_columns():
    return [
        sa.Column(
            "run_id",
            sa.String(36),
            sa.ForeignKey("agent_runs.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("namespace", sa.String(96), primary_key=True),
        sa.Column("checkpoint_id", sa.String(64), primary_key=True),
    ]


def payload_columns():
    return [
        sa.Column("value_type", sa.String(16), nullable=False),
        sa.Column("payload", sa.LargeBinary().with_variant(MEDIUMBLOB(), "mysql"), nullable=False),
    ]


def upgrade():
    op.create_table(
        "agent_checkpoints",
        *common_columns(),
        *payload_columns(),
        sa.Column("parent_id", sa.String(64)),
        sa.Column("metadata_json", sa.JSON(), nullable=False),
    )
    op.create_table(
        "agent_checkpoint_writes",
        *common_columns(),
        sa.Column("task_id", sa.String(64), primary_key=True),
        sa.Column("write_index", sa.Integer(), primary_key=True),
        sa.Column("channel", sa.String(128), nullable=False),
        *payload_columns(),
    )


def downgrade():
    op.drop_table("agent_checkpoint_writes")
    op.drop_table("agent_checkpoints")
