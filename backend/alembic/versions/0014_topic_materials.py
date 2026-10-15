"""Bind existing private document revisions to learning topics."""

from alembic import op
import sqlalchemy as sa

revision = "0014_topic_materials"
down_revision = "0014_assessment_reviews"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "topic_materials",
        sa.Column(
            "topic_id",
            sa.Integer(),
            sa.ForeignKey("topics.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "attachment_id",
            sa.String(36),
            sa.ForeignKey("attachments.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("revision", sa.Integer(), nullable=False),
    )
    op.create_index("ix_topic_materials_attachment_id", "topic_materials", ["attachment_id"])


def downgrade():
    op.drop_table("topic_materials")
