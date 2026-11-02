"""Persistent notification Inbox, including scheduled page reminders."""
from alembic import op
import sqlalchemy as sa
revision = '0002_notifications'
down_revision = '0001_notebook'

def upgrade():
    op.create_table('notebook_notifications',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('page_id', sa.String(36), sa.ForeignKey('notebook_pages.id')),
        sa.Column('kind', sa.String(20), nullable=False),
        sa.Column('title', sa.String(600), nullable=False),
        sa.Column('body', sa.String(2000), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('due_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('read_at', sa.DateTime(timezone=True)),
        sa.Column('archived_at', sa.DateTime(timezone=True)))
    op.create_index('ix_notebook_notifications_due_at', 'notebook_notifications', ['due_at'])

def downgrade():
    op.drop_table('notebook_notifications')
