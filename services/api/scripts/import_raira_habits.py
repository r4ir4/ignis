"""Read-only Raira export, private recovery file, verified native import. Run once."""
import json
import os
from pathlib import Path
import shlex
import subprocess
import sys
from datetime import datetime, timezone
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sqlalchemy.orm import Session
from app.db.notebook import DATA, engine
from app.models.habits import HabitSettings
from app.services.habit_import import import_habits

REMOTE = r'''
import json
from services import habits as h
import psycopg2.extras
with h.db() as conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
    cur.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
    cur.execute('SELECT timezone, day_start FROM owner_profile WHERE id=1')
    profile = dict(cur.fetchone())
    cur.execute('SELECT ' + h._habit_columns() + ' FROM habits ORDER BY id')
    habits = [dict(row) for row in cur.fetchall()]
    for habit in habits:
        habit['cycle'] = None
        if habit.get('schedule_id'):
            cur.execute('SELECT cycle_days AS days, cycle_active_days AS active, cycle_started_on AS started FROM medication_schedules WHERE id=%s AND cycle_days IS NOT NULL', (habit['schedule_id'],))
            cycle = cur.fetchone()
            if cycle: habit['cycle'] = dict(cycle)
    cur.execute('SELECT id, habit_id, period_key, completed_at, source, reversed_at, medication_dose_id, schedule_occurrence_id FROM habit_completions ORDER BY id')
    completions = [dict(row) for row in cur.fetchall()]
    print(json.dumps({'profile': profile, 'habits': habits, 'completions': completions}, default=lambda value: value.isoformat()))
'''

def main():
    with Session(engine()) as session:
        prior = session.get(HabitSettings, 1)
        if prior:
            print(json.dumps({**prior.payload['import'], 'already_imported': True})); return
    # Private recovery dump before changing the destination database.
    directory = DATA / 'backups'; directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    binary = '/opt/homebrew/opt/postgresql@18/bin/pg_dump'; url = engine().url
    env = os.environ.copy()
    if url.password: env['PGPASSWORD'] = url.password
    backup = directory / f'before-native-habits-{stamp}.dump'
    subprocess.run([binary, '-h', url.query.get('host', url.host or 'localhost'), '-p', str(url.query.get('port', url.port or 5432)), '-U', url.username or '', '-d', url.database, '-Fc', '-f', str(backup)], env=env, check=True, capture_output=True)
    os.chmod(backup, 0o600)
    result = subprocess.run(['ssh', '-T', '-oBatchMode=yes', '-oConnectTimeout=8', '-oStrictHostKeyChecking=yes', 'cabecao', 'docker exec -i raira-api-1 python -c ' + shlex.quote(REMOTE)], capture_output=True, text=True, timeout=60, check=True)
    export = json.loads(result.stdout)
    target = directory / f'raira-habits-export-{stamp}.json'
    fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as handle: json.dump(export, handle)
    with Session(engine()) as session, session.begin(): manifest = import_habits(session, export)
    print(json.dumps(manifest))

if __name__ == '__main__': main()
