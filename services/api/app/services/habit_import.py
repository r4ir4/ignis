"""One-time copy from a read-only export. Never overwrites after cutover."""
import hashlib
import json
from datetime import datetime, timezone, date, time
from zoneinfo import ZoneInfo
from sqlalchemy import select, func
from fastapi import HTTPException
from app.models.habits import Habit, HabitCompletion, HabitSettings

def digest(payload):
    return hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(',', ':')).encode()).hexdigest()

def import_habits(session, export):
    # Import is an operator script, not an HTTP endpoint. Serialize even the first run.
    from sqlalchemy import text
    session.execute(text('SELECT pg_advisory_xact_lock(18474, 1)'))
    previous = session.get(HabitSettings, 1)
    if previous:
        return {**previous.payload['import'], 'already_imported': True}
    if session.scalar(select(func.count()).select_from(Habit)) or session.scalar(select(func.count()).select_from(HabitCompletion)):
        raise ValueError('Native habit storage is not empty; refusing to overwrite it.')
    config = export['profile']; ZoneInfo(config['timezone']); time.fromisoformat(config['day_start'])
    ids = {row['id'] for row in export['habits']}
    if len(ids) != len(export['habits']): raise ValueError('Duplicate habit IDs')
    event_ids = {row['id'] for row in export['completions']}
    if len(event_ids) != len(export['completions']): raise ValueError('Duplicate completion IDs')
    for row in export['habits']:
        if row['status'] not in ('active', 'paused', 'archived') or row['cadence'] not in ('daily', 'weekly', 'monthly') or not 1 <= row['target_count'] <= 50: raise ValueError('Invalid habit configuration')
        date.fromisoformat(row['start_date'])
        session.add(Habit(id=row['id'], payload=dict(row)))
    session.flush()
    for row in export['completions']:
        if row['habit_id'] not in ids: raise ValueError('Orphan completion')
        date.fromisoformat(row['period_key']); datetime.fromisoformat(row['completed_at'])
        session.add(HabitCompletion(id='raira:' + str(row['id']), habit_id=row['habit_id'], payload=dict(row)))
    session.flush()
    # Verify every preserved payload, not just row counts.
    restored = {'profile': config, 'habits': [row.payload for row in session.scalars(select(Habit).order_by(Habit.id))], 'completions': sorted([row.payload for row in session.scalars(select(HabitCompletion))], key=lambda row: row['id'])}
    expected = {'profile': config, 'habits': sorted(export['habits'], key=lambda row: row['id']), 'completions': sorted(export['completions'], key=lambda row: row['id'])}
    if digest(restored) != digest(expected): raise ValueError('Import verification mismatch; transaction rolled back.')
    manifest = {'habits': len(ids), 'completions': len(event_ids), 'live_completions': sum(not row.get('reversed_at') for row in export['completions']), 'archived_habits': sum(row['status'] == 'archived' or bool(row.get('archived_at')) for row in export['habits']), 'sha256': digest(expected), 'imported_at': datetime.now(timezone.utc).isoformat()}
    session.add(HabitSettings(id=1, payload={**config, 'import': manifest}))
    session.flush()
    return manifest
