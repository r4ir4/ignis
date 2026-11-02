"""Use the wider layout for existing pages; new pages default to it in the API."""
from alembic import op
revision = '0004_default_full_width'
down_revision = '0003_cover_images'

def upgrade():
    # Use the same workspace lock/revision boundary as normal page saves.
    op.execute('SELECT revision FROM notebook_workspaces WHERE id=1 FOR UPDATE')
    op.execute("""
        WITH changed AS (
            UPDATE notebook_pages
            SET payload = jsonb_set(payload::jsonb, '{fullWidth}', 'true'::jsonb)::json
            WHERE (payload->>'fullWidth') IS DISTINCT FROM 'true'
            RETURNING id, payload
        ), bumped AS (
            UPDATE notebook_workspaces SET revision=revision+1
            WHERE id=1 AND EXISTS (SELECT 1 FROM changed)
            RETURNING revision
        )
        INSERT INTO notebook_history (page_id, revision, saved_at, payload)
        SELECT changed.id, bumped.revision, CURRENT_TIMESTAMP, changed.payload
        FROM changed CROSS JOIN bumped
    """)

def downgrade():
    # Presentation preferences and their history are user data; retain them.
    pass
