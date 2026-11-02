"""Native Vyvanse doses, phase records, source archive and mutation audit."""
from alembic import op
import sqlalchemy as sa
revision = '0007_native_meds'
down_revision = '0006_native_habits'

def upgrade():
    op.create_table('ignis_meds_settings', sa.Column('id', sa.Integer(), primary_key=True), sa.Column('payload', sa.JSON(), nullable=False))
    op.create_table('ignis_meds_doses', sa.Column('id', sa.Integer(), primary_key=True, autoincrement=False), sa.Column('payload', sa.JSON(), nullable=False))
    op.create_table('ignis_meds_phases', sa.Column('id', sa.Integer(), primary_key=True, autoincrement=False), sa.Column('dose_id', sa.Integer(), sa.ForeignKey('ignis_meds_doses.id'), nullable=False), sa.Column('payload', sa.JSON(), nullable=False))
    op.create_index('ix_ignis_meds_phases_dose_id', 'ignis_meds_phases', ['dose_id'])
    op.create_table('ignis_meds_import_archive', sa.Column('id', sa.String(100), primary_key=True), sa.Column('payload', sa.JSON(), nullable=False))
    op.create_table('ignis_meds_audit', sa.Column('id', sa.String(64), primary_key=True), sa.Column('payload', sa.JSON(), nullable=False))

def downgrade():
    for name in ('ignis_meds_audit', 'ignis_meds_import_archive', 'ignis_meds_phases', 'ignis_meds_doses', 'ignis_meds_settings'): op.drop_table(name)
