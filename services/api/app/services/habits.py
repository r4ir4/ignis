"""Native habit tracking. No network calls and no writes to provider databases."""
from collections import Counter, defaultdict
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo
from uuid import uuid4
from sqlalchemy import select
from fastapi import HTTPException
from app.models.habits import Habit, HabitCompletion, HabitSettings
from app.models.meds import MedsSettings

CONFIG = ('name', 'section', 'cadence', 'target_count')

def period_key(cadence, day):
    return day - timedelta(days=day.weekday()) if cadence == 'weekly' else day.replace(day=1) if cadence == 'monthly' else day

def previous(cadence, day):
    return (day.replace(day=1) - timedelta(days=1)).replace(day=1) if cadence == 'monthly' else day - timedelta(days=7 if cadence == 'weekly' else 1)

def owner_day(settings, now=None):
    local = (now or datetime.now(timezone.utc)).astimezone(ZoneInfo(settings['timezone']))
    return local.date() - timedelta(days=int(local.time() < time.fromisoformat(settings.get('day_start', '00:00:00'))))

def rest_day(habit, day):
    cycle = habit.get('cycle') if habit['cadence'] == 'daily' else None
    return bool(cycle and (day - date.fromisoformat(cycle['started'])).days % cycle['days'] >= cycle['active'])

def settings(session, lock=False):
    row = session.scalar(select(HabitSettings).where(HabitSettings.id == 1).with_for_update()) if lock else session.get(HabitSettings, 1)
    if not row:
        raise HTTPException(503, 'Habits have not been imported into Ignis yet.')
    return row.payload

def enriched(row, counts, today):
    habit = row.payload
    first = period_key(habit['cadence'], date.fromisoformat(habit['start_date']))
    current = period_key(habit['cadence'], today)
    key = current
    history = []; completed = periods = 0
    while key >= first:
        count = counts.get(key.isoformat(), 0); rest = rest_day(habit, key)
        if not rest:
            periods += 1; completed += int(count >= habit['target_count'])
        history.append({'date': key.isoformat(), 'count': count, 'checked': count >= habit['target_count'], 'rest': rest})
        key = previous(habit['cadence'], key)
    key = current if counts.get(current.isoformat(), 0) >= habit['target_count'] else previous(habit['cadence'], current)
    streak = 0
    while key >= first:
        if rest_day(habit, key):
            key = previous(habit['cadence'], key); continue
        if counts.get(key.isoformat(), 0) < habit['target_count']: break
        streak += 1; key = previous(habit['cadence'], key)
    count = counts.get(current.isoformat(), 0)
    return {'id': row.id, **{key: habit.get(key) for key in ('name', 'section', 'moment', 'status', 'cadence', 'target_count', 'start_date')}, 'medication_linked': bool(habit.get('medication_slug') or habit.get('schedule_id')), 'period_key': current.isoformat(), 'completed_count': count, 'period_done': count >= habit['target_count'], 'due': not rest_day(habit, today), 'rest_day': rest_day(habit, today), 'current_streak': streak, 'history': list(reversed(history)), 'totals': {'periods': periods, 'completed': completed, 'percent': round(completed / periods * 100) if periods else 0}}

def snapshot(session, now=None):
    config = settings(session); today = owner_day(config, now)
    counts = defaultdict(Counter)
    for event in session.scalars(select(HabitCompletion)):
        if not event.payload.get('reversed_at'):
            counts[event.habit_id][event.payload['period_key']] += 1
    return {'timezone': config['timezone'], 'owner_day': today.isoformat(), 'fetched_at': datetime.now(timezone.utc).isoformat(), 'habits': [enriched(row, counts[row.id], today) for row in sorted(session.scalars(select(Habit)), key=lambda row: (row.payload['name'], row.id)) if row.payload['status'] != 'archived' and not row.payload.get('archived_at')]}

def change(session, action, body):
    # Shared writes always acquire medication settings before habit settings.
    session.scalar(select(MedsSettings).where(MedsSettings.id == 1).with_for_update())
    config = settings(session, lock=True)
    now = datetime.now(timezone.utc); stamp = now.isoformat(); today = owner_day(config, now)
    if action == 'create':
        desired = {key: body[key] for key in CONFIG}
        rows = list(session.scalars(select(Habit)))
        for row in rows:
            if row.payload['status'] != 'archived' and row.payload['name'].strip().casefold() == desired['name'].casefold():
                if all(row.payload.get(key) == desired[key] for key in CONFIG): return snapshot(session, now)
                raise HTTPException(409, 'A habit with this name already exists.')
        row = Habit(id=max((row.id for row in rows), default=0) + 1, payload={**desired, 'status': 'active', 'moment': None, 'start_date': today.isoformat(), 'created_at': stamp, 'updated_at': stamp, 'archived_at': None})
        session.add(row)
    else:
        row = session.get(Habit, body['habit_id'])
        if not row: raise HTTPException(404, 'Habit not found in Ignis.')
        habit = dict(row.payload)
        if action in ('edit', 'archive'):
            desired = {key: body[key] for key in CONFIG} if action == 'edit' else None
            if action == 'archive' and habit['status'] == 'archived': return snapshot(session, now)
            if desired and all(habit.get(key) == desired[key] for key in CONFIG): return snapshot(session, now)
            if any(habit.get(key) != body['expected'][key] for key in CONFIG): raise HTTPException(409, 'This habit changed. Refresh before editing or archiving it.')
            if habit['status'] == 'archived': raise HTTPException(409, 'This habit is archived.')
            if desired:
                if habit['cadence'] != desired['cadence'] and session.scalar(select(HabitCompletion.id).where(HabitCompletion.habit_id == row.id).limit(1)):
                    raise HTTPException(409, 'Repeat cannot change after check-ins have been recorded.')
                if any(other.id != row.id and other.payload['status'] != 'archived' and other.payload['name'].strip().casefold() == desired['name'].casefold() for other in session.scalars(select(Habit))): raise HTTPException(409, 'A habit with this name already exists.')
                habit.update(desired)
            else: habit.update(status='archived', archived_at=stamp)
            habit['updated_at'] = stamp; row.payload = habit
        elif action == 'mark':
            day = date.fromisoformat(str(body['date']))
            key = period_key(habit['cadence'], day).isoformat()
            if day > today or str(body['period_key']) != key or habit['cadence'] != 'daily' and day != today:
                raise HTTPException(409, 'This habit date is not available for check-in.')
            if habit.get('medication_slug') and day != today or habit.get('schedule_id') and day != today:
                raise HTTPException(409, 'Edit past medication records in Meds to keep exact dose times.')
            if habit['status'] != 'active' or habit.get('archived_at') or day.isoformat() < habit['start_date'] or rest_day(habit, day): raise HTTPException(409, 'This habit is not due on that date.')
            events = [event for event in session.scalars(select(HabitCompletion).where(HabitCompletion.habit_id == row.id)) if event.payload['period_key'] == key and not event.payload.get('reversed_at')]
            if body['desired_count'] > habit['target_count']: raise HTTPException(409, 'The requested count exceeds the target.')
            if len(events) == body['desired_count']: return snapshot(session, now)
            if len(events) != body['expected_count']: raise HTTPException(409, 'This habit changed. Refresh before checking in.')
            if body['desired_count'] > len(events):
                if habit.get('medication_slug') == 'vyvanse':
                    from app.services.meds_habits import record_taken_from_habit
                    record_taken_from_habit(session, row, config, today, now)
                    return snapshot(session, now)
                session.add(HabitCompletion(id=str(uuid4()), habit_id=row.id, payload={'period_key': key, 'completed_at': stamp, 'source': 'ignis', 'reversed_at': None, 'recorded_for_date': day.isoformat()}))
            else:
                last = max(events, key=lambda event: (event.payload['completed_at'], event.id))
                if habit.get('medication_slug') == 'vyvanse':
                    from app.services.meds_habits import undo_taken_from_habit
                    undo_taken_from_habit(session, row, last, config, stamp)
                    return snapshot(session, now)
                last.payload = {**last.payload, 'reversed_at': stamp}
    session.flush()
    return snapshot(session, now)
