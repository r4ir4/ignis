"""Start an isolated, socket-only PostgreSQL cluster and apply notebook migrations."""
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
DATA = Path.home() / 'Library/Application Support/Ignis/notebook'
BIN = Path(subprocess.check_output(['brew', '--prefix', 'postgresql@18'], text=True).strip()) / 'bin'
DATA.mkdir(parents=True, exist_ok=True, mode=0o700)
os.chmod(DATA, 0o700)
SOCKET = DATA / 'socket'
SOCKET.mkdir(exist_ok=True, mode=0o700)
os.chmod(SOCKET, 0o700)
CLUSTER = DATA / 'postgres'

def run(*args, **kwargs):
    return subprocess.run([str(args[0]), *map(str, args[1:])], check=True, **kwargs)

if not (CLUSTER / 'PG_VERSION').exists():
    run(BIN / 'initdb', '-D', CLUSTER, '--encoding=UTF8', '--locale=C', '--auth-local=trust', '--auth-host=reject')
if subprocess.run([str(BIN / 'pg_ctl'), '-D', str(CLUSTER), 'status'], stdout=subprocess.DEVNULL).returncode:
    run(BIN / 'pg_ctl', '-D', CLUSTER, '-l', DATA / 'postgres.log', '-o', f"-k '{SOCKET}' -p 55437 -h ''", 'start')
exists = subprocess.check_output([str(BIN / 'psql'), '-h', str(SOCKET), '-p', '55437', '-d', 'postgres', '-tAc', "SELECT 1 FROM pg_database WHERE datname='ignis_notebook'"], text=True).strip()
if not exists:
    run(BIN / 'createdb', '-h', SOCKET, '-p', '55437', 'ignis_notebook')
# Create an initial restorable database backup before importing any browser content.
backups = DATA / 'backups'
backups.mkdir(exist_ok=True, mode=0o700)
backup = backups / 'before-first-import.dump'
if not backup.exists():
    run(BIN / 'pg_dump', '-h', SOCKET, '-p', '55437', '-Fc', '-f', backup, 'ignis_notebook')
    os.chmod(backup, 0o600)
run(ROOT / '.venv/bin/alembic', '-c', ROOT / 'alembic.ini', 'upgrade', 'head', cwd=ROOT)
print('Ignis notebook database ready (private Unix socket, no TCP listener).')
