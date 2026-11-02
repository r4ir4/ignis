"""Local SSH adapter to Raira's existing medication service. No copied database.

The remote program is fixed; request values travel as JSON on stdin, never shell
arguments. Only Venvanse reads and the two explicitly supported writes are exposed.
"""
import json
import shlex
import subprocess

from fastapi import HTTPException

REMOTE = r'''
import datetime as dt
import json
import sys
from services import medications as m

request = json.load(sys.stdin)
medication_id = m.medication_id_for_slug('vyvanse')
if medication_id is None:
    print(json.dumps({'error': 'Venvanse is not configured in Raira.'}))
    sys.exit(0)
medication, error = m.get_medication(medication_id)
if error:
    print(json.dumps({'error': error}))
    sys.exit(0)
action = request['action']
if action == 'read':
    profile = m.get_profile()
    now = dt.datetime.now(dt.timezone.utc)
    today = m.owner_day(profile)
    doses = m.list_doses(medication_id, None, now)
    events = m.list_response_events(medication_id, None, now)
    result = {
        'medication': {key: medication[key] for key in ('id', 'name', 'slug', 'dose_presets')},
        'timezone': profile['timezone'], 'owner_day': today.isoformat(),
        'range': 'all', 'fetched_at': now.isoformat(),
        'doses': [{**{key: dose[key] for key in ('id', 'taken_at', 'dose_mg')}, 'owner_day': m.owner_day(profile, at=dt.datetime.fromisoformat(dose['taken_at'])).isoformat()} for dose in doses],
        'events': [{key: event[key] for key in ('id', 'dose_id', 'event_type', 'occurred_at')} for event in events],
    }
    print(json.dumps({'result': result}))
elif action == 'undo':
    payload = request['payload']
    at = dt.datetime.fromisoformat(payload['expected_at'].replace('Z', '+00:00'))
    error = None
    with m.db() as conn, conn.cursor() as cur:
        cur.execute('SELECT id, taken_at, dose_mg FROM medication_doses WHERE id=%s AND medication_id=%s FOR UPDATE', (payload['dose_id'], medication_id))
        dose = cur.fetchone()
        if dose and payload['kind'] == 'intake':
            if dose[1] != at or payload.get('dose_mg') is None or float(dose[2]) != payload['dose_mg']:
                error = 'This dose has changed. Refresh before removing it.'
            else:
                cur.execute('SELECT EXISTS(SELECT 1 FROM medication_response_events WHERE dose_id=%s) OR EXISTS(SELECT 1 FROM dose_state_reports WHERE dose_id=%s)', (dose[0], dose[0]))
                if cur.fetchone()[0]:
                    error = 'Remove the linked stage marks first. Doses with a saved response report must be managed in Raira.'
                else:
                    cur.execute('SELECT id, schedule_id, owner_day, scheduled_time, source FROM medication_schedule_occurrences WHERE dose_id=%s FOR UPDATE', (dose[0],))
                    slots = cur.fetchall()
                    # Mirror Raira's occurrence-removal audit and habit reversal,
                    # in the same transaction as removing the mistaken intake.
                    cur.execute('UPDATE habit_completions SET reversed_at=now() WHERE medication_dose_id=%s AND reversed_at IS NULL', (dose[0],))
                    for slot in slots:
                        cur.execute("INSERT INTO medication_schedule_occurrence_events (occurrence_id, schedule_id, owner_day, scheduled_time, event_type, source) VALUES (%s,%s,%s,%s,'removed',%s)", slot)
                    cur.execute('DELETE FROM medication_schedule_occurrences WHERE dose_id=%s', (dose[0],))
                    cur.execute('DELETE FROM medication_doses WHERE id=%s AND medication_id=%s', (dose[0], medication_id))
                    conn.commit()
        elif dose:
            cur.execute('SELECT id, occurred_at FROM medication_response_events WHERE dose_id=%s AND medication_id=%s AND event_type=%s FOR UPDATE', (dose[0], medication_id, payload['kind']))
            event = cur.fetchone()
            if event and event[1] != at:
                error = 'This mark has changed. Refresh before removing it.'
            elif event:
                cur.execute('DELETE FROM medication_response_events WHERE id=%s AND medication_id=%s', (event[0], medication_id))
                conn.commit()
    print(json.dumps({'error': error} if error else {'result': {'id': payload['dose_id']}}))
elif action == 'edit-intake':
    payload = request['payload']
    # The upstream edit route accepts any dose id. Restrict our adapter to
    # Venvanse and keep every existing phase after intake and within 36 hours.
    with m.db() as conn, conn.cursor() as cur:
        cur.execute('SELECT id FROM medication_doses WHERE id=%s AND medication_id=%s',
                    (payload['dose_id'], medication_id))
        own = cur.fetchone()
        cur.execute('SELECT occurred_at FROM medication_response_events WHERE dose_id=%s', (payload['dose_id'],))
        events = cur.fetchall() if own else []
    at = dt.datetime.fromisoformat(payload['taken_at'].replace('Z', '+00:00'))
    if not own:
        print(json.dumps({'error': 'This Venvanse dose was not found.'}))
    elif any(event[0] < at + m.MIN_PHASE_DELAY or event[0] > at + dt.timedelta(hours=36) for event in events):
        print(json.dumps({'error': 'The intake time must stay before the recorded stages and within 36 hours of them.'}))
    else:
        result, error = m.update_dose(payload['dose_id'], {key: payload[key] for key in ('taken_at', 'dose_mg')})
        print(json.dumps({'error': error} if error else {'result': {'id': result['id']}}))
else:
    payload = {**request['payload'], 'source': 'ignis'}
    # Resolve retried requests before the upstream second-dose guard. A network
    # timeout must never turn a repeated submit into a second intake.
    table = 'medication_doses' if action == 'intake' else 'medication_response_events'
    fields = 'id, taken_at, dose_mg' if action == 'intake' else 'id, occurred_at, dose_id, event_type'
    with m.db() as conn, conn.cursor() as cur:
        cur.execute('SELECT ' + fields + ' FROM ' + table + ' WHERE medication_id=%s AND client_event_id=%s',
                    (medication_id, payload['clientEventId']))
        previous = cur.fetchone()
    if previous:
        at = dt.datetime.fromisoformat(payload['taken_at' if action == 'intake' else 'occurred_at'].replace('Z', '+00:00'))
        same = previous[1] == at and (float(previous[2]) == payload['dose_mg'] if action == 'intake' else previous[2] == payload['dose_id'] and previous[3] == payload['event_type'])
        print(json.dumps({'result': {'id': previous[0]}} if same else {'error': 'This entry was already saved with different values. Close and refresh before making another entry.'}))
    else:
        if action == 'intake':
            result, error = m.create_dose(medication_id, payload)
        elif action == 'phase':
            result, error = m.create_response_event(medication_id, payload)
        else:
            raise ValueError('Unsupported action')
        print(json.dumps({'error': error} if error else {'result': {'id': result['id']}}))
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
        # Never forward SSH stderr, server configuration or private diagnostics.
        raise HTTPException(503, 'Could not reach Raira. Refresh to reconnect; if a save timed out, retry the same entry.') from None
    if response.get('error'):
        raise HTTPException(409, str(response['error'])[:400])
    return response['result']
