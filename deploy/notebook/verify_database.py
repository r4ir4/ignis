"""Run on the host. Read-only checks plus restore to a new disposable staging DB."""
import json
import subprocess
import uuid
from pathlib import Path
from datetime import datetime, timezone


def run(args, **kwargs):
    return subprocess.run(args, check=True, capture_output=True, **kwargs)

def sql(container, query, database='ignis_notebook'):
    return run(['docker', 'exec', container, 'psql', '-U', 'postgres', '-d', database, '-tA', '-c', query], text=True).stdout.strip()

for environment in ['staging', 'production']:
    db = f'ignis-notebook-{environment}-db-1'
    api = f'ignis-notebook-{environment}-api'
    identity = run(['docker', 'exec', api, 'python', '-c', "from app.db.notebook import engine; from sqlalchemy import text;\nwith engine().connect() as c: print(c.execute(text(\"SELECT current_user, rolsuper, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname=current_user\")).one())"], text=True).stdout.strip()
    ports = json.loads(run(['docker', 'inspect', db, '--format', '{{json .HostConfig.PortBindings}}'], text=True).stdout)
    assert not ports, 'Database must not publish a host port'
    api_ports = json.loads(run(['docker', 'inspect', api, '--format', '{{json .HostConfig.PortBindings}}'], text=True).stdout)
    assert not api_ports, 'API must not publish a host port'
    assert 'False, False, False' in identity, 'App role must have no administrative privileges'
    print(environment + ': private database, restricted app role, schema ' + sql(db, 'SELECT version_num FROM alembic_version'))

stage_db = 'ignis-notebook-staging-db-1'
name = 'notebook_restore_test_' + uuid.uuid4().hex[:12]
assert int(sql(stage_db, 'SELECT count(*) FROM notebook_pages')) > 0, 'Populate staging test pages before validating recovery'
sql(stage_db, 'CREATE DATABASE ' + name, 'postgres')
try:
    # Exercise the same non-admin application credentials used by automatic backups.
    dump_code = "from app.db.notebook import engine; import os, subprocess; u=engine().url; e=os.environ.copy(); e['PGPASSWORD']=u.password; subprocess.run(['pg_dump','-h',u.host,'-U',u.username,'-d',u.database,'-Fc'],env=e,check=True)"
    dump = run(['docker', 'exec', 'ignis-notebook-staging-api', 'python', '-c', dump_code]).stdout
    directory = Path('/opt/ignis/notebook/staging/verified-backups')
    directory.mkdir(mode=0o700, exist_ok=True)
    target = directory / ('validated-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '.dump')
    import os
    fd = os.open(target, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(dump)
    run(['docker', 'exec', '-i', stage_db, 'pg_restore', '-U', 'postgres', '-d', name, '--exit-on-error'], input=dump)
    queries = ["SELECT coalesce(json_agg(t ORDER BY id)::text,'[]') FROM notebook_pages t", "SELECT coalesce(json_agg(t ORDER BY id)::text,'[]') FROM notebook_history t", 'SELECT revision FROM notebook_workspaces WHERE id=1']
    for query in queries:
        assert sql(stage_db, query) == sql(stage_db, query, name), 'Restored data must match source'
    print('staging: full dump restored into independent database; pages, formatting, history and revision match')
finally:
    # This generated test-only database is never an application destination.
    sql(stage_db, 'DROP DATABASE ' + name, 'postgres')
