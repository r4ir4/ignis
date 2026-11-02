"""Restore the latest Mac copy into disposable local databases, never live stores.
Run with PYTHONPATH=services/api and the API virtualenv Python.
"""
import json
from pathlib import Path
import subprocess
from uuid import uuid4
from sqlalchemy import create_engine, text
from app.db.notebook import engine
from app.schemas.notebook import Snapshot

root = Path.home() / 'Library/Application Support/Ignis/notebook/offhost/snapshots'
status = json.loads((root / 'status.json').read_text())
if not status.get('ok'):
    raise SystemExit('The most recent backup attempt did not succeed.')
snapshot = root / status['snapshot']
url = engine().url
admin = create_engine(url.set(database='postgres'), isolation_level='AUTOCOMMIT')
try:
    for environment in ('staging', 'production'):
        name = 'notebook_offhost_restore_' + uuid4().hex[:12]
        with admin.connect() as connection:
            connection.execute(text('CREATE DATABASE ' + name))
        restored = create_engine(url.set(database=name))
        try:
            subprocess.run(['/opt/homebrew/opt/postgresql@18/bin/pg_restore', '-h', url.query['host'], '-p', str(url.query['port']), '-d', name, '--no-owner', '--no-privileges', '--exit-on-error', str(snapshot / (environment + '.dump'))], check=True, capture_output=True, timeout=300)
            with restored.connect() as connection:
                revision = connection.execute(text('SELECT revision FROM notebook_workspaces WHERE id=1')).scalar_one()
                pages = list(connection.execute(text('SELECT payload FROM notebook_pages ORDER BY position')).scalars())
                Snapshot.model_validate({'revision': revision, 'pages': pages})
                migration = connection.execute(text('SELECT version_num FROM alembic_version')).scalar_one()
                history = connection.execute(text('SELECT count(*) FROM notebook_history')).scalar_one()
                invalid = connection.execute(text('SELECT count(*) FROM notebook_history WHERE revision > :revision'), {'revision': revision}).scalar_one()
                assert not invalid
                print(f'{environment}: restored {len(pages)} pages, {history} history records, revision {revision}, schema {migration}; validated page tree and documents')
        finally:
            restored.dispose()
            with admin.connect() as connection:
                connection.execute(text('DROP DATABASE ' + name))
finally:
    admin.dispose()
