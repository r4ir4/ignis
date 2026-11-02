"""Ignis-owned habits, full check-in audit and one-time import manifest."""
from alembic import op
import sqlalchemy as sa
revision = '0006_native_habits'
down_revision = '0005_task_attachments'

def upgrade():
    op.create_table('ignis_habit_settings', sa.Column('id', sa.Integer(), primary_key=True), sa.Column('payload', sa.JSON(), nullable=False))
    op.create_table('ignis_habits', sa.Column('id', sa.Integer(), primary_key=True, autoincrement=False), sa.Column('payload', sa.JSON(), nullable=False))
    op.create_table('ignis_habit_completions', sa.Column('id', sa.String(64), primary_key=True), sa.Column('habit_id', sa.Integer(), sa.ForeignKey('ignis_habits.id'), nullable=False), sa.Column('payload', sa.JSON(), nullable=False))
    op.create_index('ix_ignis_habit_completions_habit_id', 'ignis_habit_completions', ['habit_id'])

def downgrade():
    op.drop_table('ignis_habit_completions')
    op.drop_table('ignis_habits')
    op.drop_table('ignis_habit_settings')
