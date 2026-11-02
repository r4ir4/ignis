"""Run ON THE SERVER. Creates isolated credentials without printing their contents."""
import argparse
import os
import secrets
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--owner', required=True)
owner = parser.parse_args().owner.strip().casefold()
if '@' not in owner or any(c.isspace() for c in owner):
    raise SystemExit('A single owner email is required.')
base = Path('/opt/ignis/notebook')
for environment, host in [('staging', 'staging.ignis.farm'), ('production', 'ignis.farm')]:
    root = base / environment
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    app_password = secrets.token_hex(32)
    runtime = root / 'runtime.env'
    postgres = root / 'postgres.env'
    if runtime.exists() != postgres.exists():
        raise SystemExit('Incomplete credential pair: restore the existing pair before continuing.')
    if not runtime.exists():
        files = {
            runtime: f'IGNIS_DATABASE_URL=postgresql+psycopg://notebook_app:{app_password}@db:5432/ignis_notebook\nIGNIS_NOTEBOOK_DATA=/data\nIGNIS_PUBLIC_ORIGIN=https://{host}\nIGNIS_NOTEBOOK_OWNER_EMAIL={owner}\nIGNIS_ENVIRONMENT={environment}\n',
            postgres: f'POSTGRES_USER=postgres\nPOSTGRES_DB=ignis_notebook\nPOSTGRES_PASSWORD={secrets.token_hex(32)}\nNOTEBOOK_APP_PASSWORD={app_password}\nPOSTGRES_INITDB_ARGS=--auth-host=scram-sha-256\n',
        }
        for path, content in files.items():
            fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            with os.fdopen(fd, 'w') as stream:
                stream.write(content)
    else:
        # Explicit owner configuration may change; database passwords are preserved.
        lines = runtime.read_text().splitlines()
        lines = [line for line in lines if not line.startswith('IGNIS_NOTEBOOK_OWNER_EMAIL=')]
        lines.append('IGNIS_NOTEBOOK_OWNER_EMAIL=' + owner)
        temporary = runtime.with_suffix('.next')
        fd = os.open(temporary, os.O_CREAT | os.O_TRUNC | os.O_WRONLY, 0o600)
        with os.fdopen(fd, 'w') as stream:
            stream.write('\n'.join(lines) + '\n')
        temporary.replace(runtime)
    print(f'{environment}: server-only credential pair and owner ready')
