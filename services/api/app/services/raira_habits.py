"""Local Raira habit bridge. No copied database or source migrations."""
import json
import shlex
import subprocess
from fastapi import HTTPException

REMOTE = r'''
import datetime as dt
import json
import sys
from services import habits as h
from services.profile import get_profile, owner_day

request = json.load(sys.stdin)
profile = get_profile()
today = owner_day(profile)
FIELDS = ('id', 'name', 'section', 'moment', 'status', 'cadence', 'target_count', 'start_date', 'period_key', 'completed_count', 'period_done', 'due', 'rest_day', 'current_streak', 'history', 'totals')
def public(habit):
    return {**{key: habit[key] for key in FIELDS}, 'medication_linked': bool(habit.get('medication_slug') or habit.get('schedule_id'))}
def snapshot():
    return {'timezone': profile['timezone'], 'owner_day': today.isoformat(), 'fetched_at': dt.datetime.now(dt.timezone.utc).isoformat(), 'habits': [public(habit) for habit in h.list_habits(status='all', history='app')]}
if request['action'] == 'read':
    print(json.dumps({'result': snapshot()}))
elif request['action'] == 'create':
    import zlib
    payload = request['payload']
    error = None
    # A retry reuses the same matching name/configuration rather than creating
    # another habit after an uncertain save. No source schema change is needed.
    key = zlib.crc32(payload['name'].casefold().encode('utf-8')) % 2147483647
    with h.db() as conn, conn.cursor() as cur:
        cur.execute('SELECT pg_advisory_lock(%s, %s)', (18473, key))
        try:
            matches = [habit for habit in h.list_habits(status='all', history='app') if habit['name'].strip().casefold() == payload['name'].casefold()]
            if matches:
                if len(matches) != 1 or any(matches[0][field] != payload[field] for field in ('section', 'cadence', 'target_count')) or matches[0]['status'] != 'active' or matches[0].get('medication_slug') or matches[0].get('schedule_id'):
                    error = 'A habit with this name already exists. Choose another name.'
            else:
                _, error = h.create_habit({field: payload[field] for field in ('name', 'section', 'cadence', 'target_count')})
        finally:
            cur.execute('SELECT pg_advisory_unlock(%s, %s)', (18473, key))
    print(json.dumps({'error': error} if error else {'result': snapshot()}))
elif request['action'] in ('edit', 'archive'):
    payload = request['payload']
    error = None
    fields = ('name', 'section', 'cadence', 'target_count')
    with h.db() as conn, conn.cursor() as cur:
        cur.execute('SELECT pg_advisory_lock(%s, %s)', (18472, payload['habit_id']))
        try:
            habit, error = h.get_habit(payload['habit_id'], history='app')
            if error == 'not_found' and request['action'] == 'archive':
                error = None  # An already archived habit makes a retry a no-op.
            elif not error:
                current = {field: habit[field] for field in fields}
                desired = {field: payload[field] for field in fields} if request['action'] == 'edit' else None
                if desired == current:
                    pass
                elif current != payload['expected']:
                    error = 'This habit changed. Refresh before editing or archiving it.'
                elif request['action'] == 'archive':
                    _, error = h.archive_habit(payload['habit_id'])
                elif (habit.get('medication_slug') or habit.get('schedule_id')) and any(current[field] != desired[field] for field in ('cadence', 'target_count')):
                    error = 'Medication-linked repeat and target settings are managed through Meds.'
                else:
                    if current['cadence'] != desired['cadence']:
                        cur.execute('SELECT EXISTS(SELECT 1 FROM habit_completions WHERE habit_id=%s)', (payload['habit_id'],))
                        if cur.fetchone()[0]:
                            error = 'Repeat cannot change after check-ins have been recorded. Your history is kept.'
                    if not error:
                        import zlib
                        key = zlib.crc32(desired['name'].casefold().encode('utf-8')) % 2147483647
                        cur.execute('SELECT pg_advisory_lock(%s, %s)', (18473, key))
                        try:
                            if any(item['id'] != payload['habit_id'] and item['name'].strip().casefold() == desired['name'].casefold() for item in h.list_habits(status='all', history='app')):
                                error = 'A habit with this name already exists. Choose another name.'
                            else:
                                _, error = h.update_habit(payload['habit_id'], desired)
                        finally:
                            cur.execute('SELECT pg_advisory_unlock(%s, %s)', (18473, key))
        finally:
            cur.execute('SELECT pg_advisory_unlock(%s, %s)', (18472, payload['habit_id']))
    print(json.dumps({'error': error} if error else {'result': snapshot()}))
elif request['action'] == 'mark':
    payload = request['payload']
    error = None
    # Serialize requests from Ignis. Read counts again inside the lock so retries
    # converge to a desired count instead of adding another completion.
    with h.db() as conn, conn.cursor() as cur:
        cur.execute('SELECT pg_advisory_lock(%s, %s)', (18472, payload['habit_id']))
        try:
            habit, error = h.get_habit(payload['habit_id'], history='app')
            if not error:
                if payload['date'] != today.isoformat():
                    error = 'The day changed in Raira. Refresh before checking in.'
                elif habit['status'] != 'active':
                    error = 'This habit is paused or archived in Raira.'
                elif habit.get('medication_slug') or habit.get('schedule_id'):
                    error = 'Medication-linked habits are tracked through Meds or Raira.'
                elif not habit['due'] or habit['rest_day'] or today.isoformat() < habit['start_date']:
                    error = 'This habit is not due today.'
                elif habit['period_key'] != payload['period_key']:
                    error = 'The habit period changed. Refresh before checking in.'
                elif payload['desired_count'] > habit['target_count']:
                    error = 'The requested count exceeds this habit target.'
                elif habit['completed_count'] == payload['desired_count']:
                    pass
                elif habit['completed_count'] != payload['expected_count']:
                    error = 'This habit changed in Raira. Refresh before checking in.'
                else:
                    operation = h.check_in_manual if payload['desired_count'] > payload['expected_count'] else h.undo_today
                    _, error = operation(payload['habit_id'], payload['date'])
        finally:
            cur.execute('SELECT pg_advisory_unlock(%s, %s)', (18472, payload['habit_id']))
    print(json.dumps({'error': error} if error else {'result': snapshot()}))
else:
    raise ValueError('Unsupported action')
'''


def exchange(action: str, **values):
    command = 'docker exec -i raira-api-1 python -c ' + shlex.quote(REMOTE)
    try:
        process = subprocess.run(
            ['ssh', '-T', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8',
             '-o', 'StrictHostKeyChecking=yes', 'cabecao', command],
            input=json.dumps({'action': action, **values}), text=True,
            capture_output=True, timeout=30, check=True,
        )
        response = json.loads(process.stdout)
    except (OSError, subprocess.SubprocessError, ValueError):
        raise HTTPException(503, 'Could not reach Raira. Refresh to reconnect before retrying.') from None
    if response.get('error'):
        raise HTTPException(409, str(response['error'])[:400])
    return response['result']
