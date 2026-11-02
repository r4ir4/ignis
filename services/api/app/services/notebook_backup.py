"""Daily PostgreSQL recovery dumps, kept outside source and never pruned here."""
import logging
import os
import shutil
import subprocess
import tempfile
import threading
from datetime import datetime, timezone
from pathlib import Path
from app.db.notebook import DATA, engine

lock = threading.Lock()
logger = logging.getLogger(__name__)

def backup_daily():
    with lock:
        directory = DATA / 'backups'
        temp = None
        try:
            directory.mkdir(parents=True, exist_ok=True, mode=0o700)
            target = directory / f"notebook-{datetime.now(timezone.utc):%Y-%m-%d}.dump"
            if target.exists():
                return
            binary = shutil.which('pg_dump') or '/opt/homebrew/opt/postgresql@18/bin/pg_dump'
            url = engine().url
            env = os.environ.copy()
            if url.password:
                env['PGPASSWORD'] = url.password
            # Exclusive private file: multiple API workers cannot share a partial dump.
            with tempfile.NamedTemporaryFile(dir=directory, prefix='notebook-', suffix='.pending', delete=False) as output:
                temp = Path(output.name)
            args = [binary, '-h', url.query.get('host', url.host or 'localhost'), '-p', str(url.query.get('port', url.port or 5432)), '-U', url.username or '', '-d', url.database, '-Fc', '-f', str(temp)]
            subprocess.run(args, env=env, check=True, capture_output=True, timeout=60)
            temp.replace(target)
            (directory / 'backup-error.txt').unlink(missing_ok=True)
        except (OSError, subprocess.SubprocessError):
            # Backup failures must never turn an already committed save into an HTTP failure.
            logger.warning('Notebook database backup failed; saved pages remain in the database.')
            try:
                error = directory / 'backup-error.txt'
                error.write_text('Automatic database backup failed. Run scripts/notebook_backup.py and check PostgreSQL tools. Saved pages remain in the database.')
                os.chmod(error, 0o600)
            except OSError:
                logger.warning('Notebook backup warning could not be written to disk.')
        finally:
            if temp is not None:
                try:
                    temp.unlink(missing_ok=True)
                except OSError:
                    logger.warning('Notebook partial backup could not be removed.')
