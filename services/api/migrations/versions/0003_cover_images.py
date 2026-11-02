"""Keep immutable cover images with the notebook database and its backups."""
from alembic import op
import sqlalchemy as sa
revision = '0003_cover_images'
down_revision = '0002_notifications'

def upgrade():
    op.create_table('notebook_cover_images',
        sa.Column('id', sa.String(64), primary_key=True),
        sa.Column('data', sa.LargeBinary(), nullable=False))

def downgrade():
    op.drop_table('notebook_cover_images')
