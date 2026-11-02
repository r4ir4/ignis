"""Dedicated notebook pages, workspace revision and recoverable page history."""
from alembic import op
import sqlalchemy as sa
revision = '0001_notebook'
down_revision = None

def upgrade():
    op.create_table('notebook_workspaces', sa.Column('id', sa.Integer(), primary_key=True), sa.Column('revision', sa.Integer(), nullable=False))
    op.execute('INSERT INTO notebook_workspaces (id, revision) VALUES (1, 0)')
    op.create_table('notebook_pages', sa.Column('id', sa.String(36), primary_key=True), sa.Column('position', sa.Integer(), nullable=False), sa.Column('payload', sa.JSON(), nullable=False))
    op.create_table('notebook_history', sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True), sa.Column('page_id', sa.String(36), sa.ForeignKey('notebook_pages.id'), nullable=False), sa.Column('revision', sa.Integer(), nullable=False), sa.Column('saved_at', sa.DateTime(timezone=True), nullable=False), sa.Column('payload', sa.JSON(), nullable=False))
    op.create_index('ix_notebook_history_page_id', 'notebook_history', ['page_id'])

def downgrade():
    op.drop_table('notebook_history')
    op.drop_table('notebook_pages')
    op.drop_table('notebook_workspaces')
