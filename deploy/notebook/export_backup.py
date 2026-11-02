"""Run on the VPS. Stream fresh notebook dumps and checksums; never credentials."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
from datetime import datetime, timezone


def export(destination):
    with tempfile.TemporaryDirectory(prefix='backup-export-', dir='/opt/ignis/notebook') as directory:
        root = Path(directory)
        manifest = {'format': 1, 'createdAt': datetime.now(timezone.utc).isoformat(), 'files': {}}
        for environment in ('staging', 'production'):
            path = root / (environment + '.dump')
            code = "from app.db.notebook import engine; import os,subprocess; u=engine().url; e=os.environ.copy(); e['PGPASSWORD']=u.password; subprocess.run(['pg_dump','-h',u.host,'-U',u.username,'-d',u.database,'-Fc'],env=e,check=True)"
            fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, 'wb') as output:
                subprocess.run(['/usr/bin/docker', 'exec', 'ignis-notebook-' + environment + '-api', 'python', '-c', code], stdout=output, stderr=subprocess.PIPE, check=True, timeout=300)
            with path.open('rb') as stream:
                if stream.read(5) != b'PGDMP':
                    raise ValueError('Invalid database archive')
                stream.seek(0)
                digest = hashlib.file_digest(stream, 'sha256').hexdigest()
            manifest['files'][path.name] = {'size': path.stat().st_size, 'sha256': digest}
        metadata = root / 'manifest.json'
        metadata.write_text(json.dumps(manifest, indent=2) + '\n')
        os.chmod(metadata, 0o600)
        with tarfile.open(fileobj=destination, mode='w|') as archive:
            for name in ['manifest.json', 'staging.dump', 'production.dump']:
                archive.add(root / name, arcname=name)


if __name__ == '__main__':
    try:
        export(sys.stdout.buffer)
    except Exception:
        print('Notebook export failed; no completed backup was produced. Check API/database health on the VPS.', file=sys.stderr)
        raise SystemExit(1)
