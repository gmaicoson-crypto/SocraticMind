"""Keep source identities on generated learning nodes."""

from alembic import op
import sqlalchemy as sa

revision = "0015_grounded_nodes"
down_revision = "0014_topic_materials"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("nodes", sa.Column("material_sources", sa.JSON(), nullable=True))


def downgrade():
    op.drop_column("nodes", "material_sources")
