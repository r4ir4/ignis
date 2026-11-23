"""Pull a fresh project-API backup into a private off-host folder. Standard library only."""
import argparse
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import subprocess
import tarfile
import tempfile
from urllib.parse import quote

PHOTO_NAME = re.compile(r'trip-photos/[A-Za-z0-9][A-Za-z0-9._-]{0,79}')


def _allowed(name: str) -> bool:
    return name == 'ignis.db' or PHOTO_NAME.fullmatch(name) is not None


def _uri(path: Path) -> str:
    return 'file:' + quote(path.resolve().as_posix(), safe='/') + '?mode=ro'


def unpack(bundle: Path, destination: Path):
    with tarfile.open(bundle, mode='r:') as archive:
        members = archive.getmembers()
        names = []
        for member in members:
            relative = Path(member.name)
            allowed = member.name == 'manifest.json' or _allowed(member.name)
            if member.name in names or not allowed or relative.is_absolute() or '..' in relative.parts:
                raise ValueError('Unexpected backup member')
            if not member.isfile() or member.issym() or member.islnk():
                raise ValueError('Unexpected backup member')
            names.append(member.name)
        if 'manifest.json' not in names or 'ignis.db' not in names:
            raise ValueError('Incomplete backup bundle')
        for member in members:
            source = archive.extractfile(member)
            if source is None:
                raise ValueError('Missing archive data')
            path = destination / member.name
            path.parent.mkdir(mode=0o700, exist_ok=True)
            with path.open('xb') as output:
                shutil.copyfileobj(source, output)
            os.chmod(path, 0o600)
    manifest = json.loads((destination / 'manifest.json').read_text())
    if manifest.get('format') != 1 or manifest.get('kind') != 'project-api':
        raise ValueError('Invalid backup manifest')
    datetime.fromisoformat(manifest['createdAt'])
    files = manifest.get('files', {})
    if set(files) != set(names) - {'manifest.json'}:
        raise ValueError('Incomplete backup bundle')
    for name, record in files.items():
        path = destination / name
        with path.open('rb') as stream:
            digest = hashlib.file_digest(stream, 'sha256').hexdigest()
        if record['size'] != path.stat().st_size or record['sha256'] != digest:
            raise ValueError('Backup checksum mismatch')
    database = destination / 'ignis.db'
    with database.open('rb') as stream:
        if stream.read(16) != b'SQLite format 3\x00':
            raise ValueError('Invalid SQLite snapshot')
    connection = sqlite3.connect(_uri(database), uri=True)
    try:
        check = connection.execute('PRAGMA integrity_check').fetchone()
    finally:
        connection.close()
    if check is None or check[0] != 'ok':
        raise ValueError('SQLite integrity check failed')
    return manifest


def write_status(root, value):
    temporary = root / 'status.next'
    temporary.write_text(json.dumps(value, indent=2) + '\n')
    os.chmod(temporary, 0o600)
    temporary.replace(root / 'status.json')


def pull(root: Path):
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(root, 0o700)
    with (root / 'pull.lock').open('a') as lock:
        os.chmod(root / 'pull.lock', 0o600)
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return
        attempt = datetime.now(timezone.utc).isoformat()
        previous = {}
        try:
            previous = json.loads((root / 'status.json').read_text())
        except (OSError, ValueError):
            pass
        try:
            with tempfile.TemporaryDirectory(prefix='.pending-', dir=root) as directory:
                pending = Path(directory)
                bundle = pending / 'bundle.tar'
                with bundle.open('xb') as output:
                    os.chmod(bundle, 0o600)
                    subprocess.run(['/usr/bin/ssh', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=15', '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=3', 'cabecao', 'python3 /opt/ignis/api/scripts/export_backup.py'], stdout=output, stderr=subprocess.PIPE, check=True, timeout=660)
                completed = pending / 'snapshot'
                completed.mkdir(mode=0o700)
                manifest = unpack(bundle, completed)
                name = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S.%fZ')
                published = root / name
                completed.replace(published)
                os.chmod(published, 0o700)
                write_status(root, {
                    'lastAttemptAt': attempt,
                    'lastSuccessAt': datetime.now(timezone.utc).isoformat(),
                    'snapshot': name,
                    'sourceCreatedAt': manifest['createdAt'],
                    'databaseBytes': manifest['files']['ignis.db']['size'],
                    'tripPhotos': sum(1 for item in manifest['files'] if item.startswith('trip-photos/')),
                    'ok': True,
                })
                print('Project API off-host backup completed and checksums verified.', flush=True)
        except Exception:
            write_status(root, {**previous, 'lastAttemptAt': attempt, 'ok': False, 'error': 'Backup pull failed. Previous snapshots are preserved. Check the VPS database, SSH access and available disk space.'})
            print('Project API off-host backup failed; previous snapshots were preserved.', flush=True)
            raise SystemExit(1)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--destination', required=True, type=Path)
    args = parser.parse_args()
    pull(args.destination)
