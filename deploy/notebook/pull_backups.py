"""Pull fresh VPS notebook backups into a private off-host folder. Standard library only."""
import argparse
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile


def unpack(bundle: Path, destination: Path):
    expected = {'manifest.json', 'staging.dump', 'production.dump'}
    seen = set()
    with tarfile.open(bundle, mode='r:') as archive:
        for member in archive:
            if member.name not in expected or member.name in seen or not member.isfile():
                raise ValueError('Unexpected backup member')
            seen.add(member.name)
            source = archive.extractfile(member)
            if source is None:
                raise ValueError('Missing archive data')
            path = destination / member.name
            with path.open('xb') as output:
                shutil.copyfileobj(source, output)
            os.chmod(path, 0o600)
    if seen != expected:
        raise ValueError('Incomplete backup bundle')
    manifest = json.loads((destination / 'manifest.json').read_text())
    if manifest.get('format') != 1 or set(manifest.get('files', {})) != expected - {'manifest.json'}:
        raise ValueError('Invalid backup manifest')
    datetime.fromisoformat(manifest['createdAt'])
    for name, record in manifest['files'].items():
        path = destination / name
        with path.open('rb') as stream:
            if stream.read(5) != b'PGDMP':
                raise ValueError('Invalid PostgreSQL archive')
            stream.seek(0)
            digest = hashlib.file_digest(stream, 'sha256').hexdigest()
        if record['size'] != path.stat().st_size or record['sha256'] != digest:
            raise ValueError('Backup checksum mismatch')
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
                    subprocess.run(['/usr/bin/ssh', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=15', '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=3', 'cabecao', 'python3 /opt/ignis/notebook/scripts/export_backup.py'], stdout=output, stderr=subprocess.PIPE, check=True, timeout=660)
                completed = pending / 'snapshot'
                completed.mkdir(mode=0o700)
                manifest = unpack(bundle, completed)
                # Atomic publication: partial copies never replace the last verified backup.
                name = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S.%fZ')
                completed.replace(root / name)
                write_status(root, {'lastAttemptAt': attempt, 'lastSuccessAt': datetime.now(timezone.utc).isoformat(), 'snapshot': name, 'sourceCreatedAt': manifest['createdAt'], 'ok': True})
                print('Notebook off-host backup completed and both archive checksums verified.', flush=True)
        except Exception:
            write_status(root, {**previous, 'lastAttemptAt': attempt, 'ok': False, 'error': 'Backup pull failed. Previous snapshots are preserved. Check VPS/API health, SSH access and available disk space.'})
            print('Notebook off-host backup failed; previous snapshots were preserved.', flush=True)
            raise SystemExit(1)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--destination', required=True, type=Path)
    args = parser.parse_args()
    pull(args.destination)
