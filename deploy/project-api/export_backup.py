"""Run on the VPS. Stream a consistent SQLite snapshot and trip photos. Never credentials."""
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import sys
import tarfile
import tempfile
from datetime import datetime, timezone
from urllib.parse import quote

DATA_DIR = Path('/opt/ignis/api/data')
PHOTO_NAME = re.compile(r'[A-Za-z0-9][A-Za-z0-9._-]{0,79}')


def _uri(path: Path, mode: str) -> str:
    return 'file:' + quote(path.resolve().as_posix(), safe='/') + '?mode=' + mode


def snapshot(source: Path, destination: Path):
    """Online backup. A raw copy of a WAL database can miss the latest writes."""
    if not source.is_file() or source.is_symlink():
        raise ValueError('Project database is missing')
    fd = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    os.close(fd)
    src = sqlite3.connect(_uri(source, 'ro'), uri=True)
    dst = sqlite3.connect(destination)
    try:
        src.backup(dst)
        check = dst.execute('PRAGMA integrity_check').fetchone()
        if check is None or check[0] != 'ok':
            raise ValueError('SQLite integrity check failed')
    finally:
        dst.close()
        src.close()
    with destination.open('rb') as stream:
        if stream.read(16) != b'SQLite format 3\x00':
            raise ValueError('Invalid SQLite snapshot')


def photos(directory: Path):
    if not directory.exists():
        return []
    if directory.is_symlink() or not directory.is_dir():
        raise ValueError('Trip photo folder is not a directory')
    found = []
    for path in sorted(directory.iterdir()):
        if path.name.endswith('.part'):
            continue
        if path.is_symlink() or not path.is_file():
            raise ValueError('Unexpected trip photo')
        if not PHOTO_NAME.fullmatch(path.name):
            raise ValueError('Unexpected trip photo name')
        found.append(path)
    return found


def _record(path: Path):
    with path.open('rb') as stream:
        digest = hashlib.file_digest(stream, 'sha256').hexdigest()
    return {'size': path.stat().st_size, 'sha256': digest}


def _add(archive, arcname: str, path: Path):
    info = tarfile.TarInfo(arcname)
    info.size = path.stat().st_size
    info.mode = 0o600
    info.mtime = 0
    with path.open('rb') as stream:
        archive.addfile(info, stream)


def export(destination, data_dir: Path = DATA_DIR):
    data_dir = Path(data_dir)
    with tempfile.TemporaryDirectory(prefix='project-api-backup-') as directory:
        root = Path(directory)
        database = root / 'ignis.db'
        snapshot(data_dir / 'ignis.db', database)
        members = [('ignis.db', database)]
        for path in photos(data_dir / 'trip-photos'):
            members.append(('trip-photos/' + path.name, path))
        manifest = {
            'format': 1,
            'kind': 'project-api',
            'createdAt': datetime.now(timezone.utc).isoformat(),
            'files': {name: _record(path) for name, path in members},
        }
        metadata = root / 'manifest.json'
        metadata.write_text(json.dumps(manifest, indent=2) + '\n')
        os.chmod(metadata, 0o600)
        with tarfile.open(fileobj=destination, mode='w|') as archive:
            _add(archive, 'manifest.json', metadata)
            for name, path in members:
                _add(archive, name, path)


if __name__ == '__main__':
    try:
        export(sys.stdout.buffer)
    except Exception:
        print('Project API export failed; no completed backup was produced. Check the database on the VPS.', file=sys.stderr)
        raise SystemExit(1)
