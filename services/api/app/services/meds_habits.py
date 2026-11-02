"""Transactional dose-linked habit marks, including imported links and paired undo."""
from datetime import datetime
from uuid import uuid4
from collections import defaultdict
from sqlalchemy import select
from app.models.habits import Habit, HabitCompletion, HabitSettings
from app.models.meds import MedsDose
from app.services.habits import owner_day, period_key, rest_day


def sync_taken_habits(session, medication, medication_settings, stamp):
    # All medication and habit mutations acquire MedsSettings before HabitSettings.
    settings = session.scalar(select(HabitSettings).where(HabitSettings.id == 1).with_for_update())
    if settings is None:
        return
    config = settings.payload
    habits = list(session.scalars(select(Habit).order_by(Habit.id)))
    events = list(session.scalars(select(HabitCompletion)))
    doses = list(session.scalars(select(MedsDose).order_by(MedsDose.id)))
    by_day = defaultdict(list)
    for dose in doses:
        if not dose.payload.get('_removed_at'):
            taken = datetime.fromisoformat(dose.payload['taken_at'].replace('Z', '+00:00'))
            by_day[owner_day(medication_settings, taken)].append(dose)
    slots = {}
    for group in by_day.values():
        for slot, dose in enumerate(sorted(group, key=lambda dose: (datetime.fromisoformat(dose.payload['taken_at'].replace('Z', '+00:00')), dose.id)), 1):
            slots[dose.id] = slot
    desired = {}
    managed = {dose.id for dose in doses if dose.payload.get('_sync_linked_habit')}
    for dose in doses:
        if dose.id not in managed or dose.id not in slots:
            continue
        taken = datetime.fromisoformat(dose.payload['taken_at'].replace('Z', '+00:00'))
        day = owner_day(config, taken)
        for habit in habits:
            data = habit.payload
            if data.get('medication_slug') != medication['slug'] or int(data.get('medication_dose_slot') or 1) != slots[dose.id]:
                continue
            if data['status'] != 'active' or data.get('archived_at') or data['start_date'] > day.isoformat() or rest_day(data, day):
                continue
            desired[(dose.id, habit.id)] = (period_key(data['cadence'], day).isoformat(), dose.payload['taken_at'])
    # Reverse obsolete automatic marks before evaluating targets in the new periods.
    for event in events:
        data = event.payload
        if data.get('source') != 'ignis_meds' or data.get('native_dose_id') not in managed or data.get('reversed_at'):
            continue
        target = desired.get((data['native_dose_id'], event.habit_id))
        if not target or data['period_key'] != target[0] or data['completed_at'] != target[1]:
            event.payload = {**data, 'reversed_at': stamp, 'reversal_source': 'ignis_meds'}
    for (dose_id, habit_id), (key, taken) in desired.items():
        if any(event.habit_id == habit_id and event.payload.get('native_dose_id') == dose_id and event.payload.get('source') == 'ignis_meds' and not event.payload.get('reversed_at') for event in events):
            continue
        habit = next(habit for habit in habits if habit.id == habit_id)
        count = sum(event.habit_id == habit_id and event.payload['period_key'] == key and not event.payload.get('reversed_at') for event in events)
        if count >= habit.payload['target_count']:
            continue
        event = HabitCompletion(id=str(uuid4()), habit_id=habit_id, payload={'period_key': key, 'completed_at': taken, 'created_at': stamp, 'source': 'ignis_meds', 'native_dose_id': dose_id, 'reversed_at': None})
        session.add(event); events.append(event)
    session.flush()


def record_taken_from_habit(session, habit, habit_settings, today, now):
    """Called only after expected-count validation, with both settings locks held."""
    from app.services import meds
    from fastapi import HTTPException
    data = habit.payload
    if data['cadence'] != 'daily' or data['target_count'] != 1:
        raise HTTPException(409, 'To record Taken from this habit, use a daily habit with one check-in per day.')
    config = meds.settings(session, lock=True)
    slot = int(data.get('medication_dose_slot') or 1)
    doses = [dose for dose in session.scalars(select(MedsDose)) if meds.active(dose)]
    medication_day = owner_day(config, now)
    current = sorted([dose for dose in doses if owner_day(config, meds.at(dose.payload['taken_at'])) == medication_day], key=lambda dose: (meds.at(dose.payload['taken_at']), dose.id))
    if slot < 1:
        raise HTTPException(409, 'This habit has an invalid dose slot. Record Taken in Meds.')
    if len(current) >= slot:
        # Taken already exists: attach the requested habit mark, never add a dose.
        dose = current[slot - 1]
        if owner_day(habit_settings, meds.at(dose.payload['taken_at'])) != today:
            raise HTTPException(409, 'The medication and habit day boundaries differ. Review the dose in Meds.')
        dose.payload = {**dose.payload, '_sync_linked_habit': True}
        session.flush()
        sync_taken_habits(session, config['medication'], config, now.isoformat())
        return
    if len(current) != slot - 1:
        raise HTTPException(409, 'Record the first dose before checking in the second-dose habit.')
    if not doses:
        raise HTTPException(409, 'Record Taken in Meds once with a dose amount before using the habit shortcut.')
    last = max(doses, key=lambda dose: (meds.at(dose.payload['taken_at']), dose.id))
    meds.change(session, 'intake', {'clientEventId': str(uuid4()), 'taken_at': now.isoformat(), 'dose_mg': float(last.payload['dose_mg'])})


def reverse_taken_habit_marks(session, dose, medication_settings, stamp):
    """Undo matching native, imported, or manually linked marks before removing Taken."""
    from app.services import meds
    config_row = session.scalar(select(HabitSettings).where(HabitSettings.id == 1).with_for_update())
    if config_row is None:
        return
    config = config_row.payload
    taken = meds.at(dose.payload['taken_at'])
    day = owner_day(config, taken)
    med_day = owner_day(medication_settings, taken)
    doses = sorted([row for row in session.scalars(select(MedsDose)) if meds.active(row) and owner_day(medication_settings, meds.at(row.payload['taken_at'])) == med_day], key=lambda row: (meds.at(row.payload['taken_at']), row.id))
    slot = next((index for index, row in enumerate(doses, 1) if row.id == dose.id), None)
    habits = {row.id: row for row in session.scalars(select(Habit)) if row.payload.get('medication_slug') == 'vyvanse'}
    for event in session.scalars(select(HabitCompletion)):
        data = event.payload
        habit = habits.get(event.habit_id)
        if habit is None or data.get('reversed_at'):
            continue
        linked_id = data.get('native_dose_id') or data.get('medication_dose_id')
        matches = linked_id == dose.id if linked_id is not None else (int(habit.payload.get('medication_dose_slot') or 1) == slot and data['period_key'] == period_key(habit.payload['cadence'], day).isoformat())
        if matches:
            event.payload = {**data, 'reversed_at': stamp, 'reversal_source': 'ignis_meds', 'native_dose_id': dose.id}
    session.flush()


def undo_taken_from_habit(session, habit, event, habit_settings, stamp):
    """Resolve imported dose IDs or an existing same-slot dose, without guessing a new dose."""
    from app.services import meds
    config = meds.settings(session, lock=True)
    dose_id = event.payload.get('native_dose_id') or event.payload.get('medication_dose_id')
    dose = session.get(MedsDose, dose_id) if dose_id else None
    if dose_id is None:
        day = event.payload['period_key']
        candidates = sorted([row for row in session.scalars(select(MedsDose)) if meds.active(row) and period_key(habit.payload['cadence'], owner_day(habit_settings, meds.at(row.payload['taken_at']))).isoformat() == day], key=lambda row: (meds.at(row.payload['taken_at']), row.id))
        slot = int(habit.payload.get('medication_dose_slot') or 1)
        dose = candidates[slot - 1] if slot > 0 and len(candidates) >= slot else None
    if meds.active(dose) and dose.payload.get('medication_id') == config['medication']['id']:
        meds.change(session, 'undo', {'kind': 'intake', 'dose_id': dose.id, 'expected_at': dose.payload['taken_at'], 'dose_mg': float(dose.payload['dose_mg'])})
    # If Taken was already absent, still finish the explicitly requested habit undo.
    if not event.payload.get('reversed_at'):
        event.payload = {**event.payload, 'reversed_at': stamp}
    session.flush()
