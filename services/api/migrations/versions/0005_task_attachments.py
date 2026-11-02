"""Immutable task attachments remain in the notebook database and its backups."""
from alembic import op
import sqlalchemy as sa
revision = '0005_task_attachments'
down_revision = '0004_default_full_width'

def upgrade():
    op.create_table('notebook_attachments', sa.Column('id', sa.String(64), primary_key=True), sa.Column('data', sa.LargeBinary(), nullable=False))

def downgrade():
    op.drop_table('notebook_attachments')
