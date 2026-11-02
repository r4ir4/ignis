"""Ignis-owned Venvanse records. Preserves the existing recording validation rules."""
from datetime import datetime, timedelta, timezone
from uuid import uuid4
from sqlalchemy import select, func
from fastapi import HTTPException
from app.models.meds import MedsSettings, MedsDose, MedsPhase, MedsArchive, MedsAudit
from app.services.habits import owner_day
from app.services.meds_habits import sync_taken_habits, reverse_taken_habit_marks

PHASES = ('onset', 'strongest', 'wearing_off')
def at(value): return datetime.fromisoformat(value.replace('Z', '+00:00')).astimezone(timezone.utc)
def conflict(message): raise HTTPException(409, message)
def active(row): return row is not None and not row.payload.get('_removed_at')
def settings(session, lock=False):
    row = session.scalar(select(MedsSettings).where(MedsSettings.id == 1).with_for_update()) if lock else session.get(MedsSettings, 1)
    if not row: raise HTTPException(503, 'Venvanse records have not been imported into Ignis yet.')
    return row.payload

def snapshot(session):
    config = settings(session); now = datetime.now(timezone.utc)
    doses = [row for row in session.scalars(select(MedsDose)) if active(row)]
    ids = {row.id for row in doses}
    return {'medication': {**{key: config['medication'][key] for key in ('id','slug','dose_presets')}, 'name': 'Venvanse'}, 'timezone':config['timezone'], 'owner_day':owner_day(config, now).isoformat(), 'range':'all', 'fetched_at':now.isoformat(), 'doses':[{'id':row.id, 'taken_at':row.payload['taken_at'], 'dose_mg':float(row.payload['dose_mg']), 'owner_day':owner_day(config, at(row.payload['taken_at'])).isoformat()} for row in sorted(doses,key=lambda row:(at(row.payload['taken_at']),row.id))], 'events':[{'id':row.id,'dose_id':row.dose_id, 'event_type':row.payload['event_type'], 'occurred_at':row.payload['occurred_at']} for row in session.scalars(select(MedsPhase).order_by(MedsPhase.id)) if active(row) and row.dose_id in ids]}

def change(session, action, body):
    config=settings(session, lock=True); now=datetime.now(timezone.utc).isoformat()
    body=dict(body)
    for key in ('taken_at','occurred_at','expected_at'):
        if key in body: body[key]=at(body[key]).isoformat()
    operation_id=body.get('clientEventId')
    prior=session.get(MedsAudit,operation_id) if operation_id else None
    if prior:
        audit=prior.payload
        if audit['action'] != action or audit['request'] != body: conflict('This entry was already saved with different values. Refresh before making another entry.')
        record=session.get(MedsPhase if action=='phase' else MedsDose,audit['result_id'])
        if not active(record): conflict('This entry was removed. Refresh before recording a new mark.')
        if action=='phase':
            same=record.dose_id==body['dose_id'] and record.payload['event_type']==body['event_type'] and at(record.payload['occurred_at'])==at(body['occurred_at'])
        else: same=at(record.payload['taken_at'])==at(body['taken_at']) and float(record.payload['dose_mg'])==body['dose_mg']
        if not same: conflict('This entry changed after it was saved. Refresh before editing it.')
        return {'id':record.id}
    # A pending browser retry may refer to a request created before cutover.
    if operation_id and action in ('intake', 'phase'):
        model = MedsDose if action == 'intake' else MedsPhase
        imported = next((row for row in session.scalars(select(model)) if row.payload.get('client_event_id') == operation_id), None)
        if imported:
            if not active(imported): conflict('This entry was removed. Refresh before recording a new mark.')
            same = (at(imported.payload['taken_at']) == at(body['taken_at']) and float(imported.payload['dose_mg']) == body['dose_mg']) if action == 'intake' else (imported.dose_id == body['dose_id'] and imported.payload['event_type'] == body['event_type'] and at(imported.payload['occurred_at']) == at(body['occurred_at']))
            if not same: conflict('This entry was already saved with different values. Refresh before editing it.')
            return {'id': imported.id}
    before=None; record=None; cleared_stages=[]
    if action=='intake':
        moment=at(body['taken_at']); day=owner_day(config,moment)
        existing=[row for row in session.scalars(select(MedsDose)) if active(row) and owner_day(config,at(row.payload['taken_at']))==day]
        if existing:
            latest=max(existing,key=lambda row:at(row.payload['taken_at']))
            done={row.payload['event_type'] for row in session.scalars(select(MedsPhase).where(MedsPhase.dose_id==latest.id)) if active(row)}
            if any(phase not in done for phase in PHASES): conflict('Today’s dose has unfinished stages. Record Started, Peak and Wearing off before logging another dose.')
        record=MedsDose(id=(session.scalar(select(func.max(MedsDose.id))) or 0)+1, payload={'medication_id':config['medication']['id'],'taken_at':body['taken_at'],'dose_mg':body['dose_mg'],'created_at':now,'source':'ignis','client_event_id':operation_id,'_sync_linked_habit':True})
        session.add(record)
    else:
        dose=session.get(MedsDose,body['dose_id'])
        if not active(dose):
            if action=='undo': return {'id':body['dose_id']}
            conflict('This Venvanse dose was not found in Ignis.')
        phases=[row for row in session.scalars(select(MedsPhase).where(MedsPhase.dose_id==dose.id)) if active(row)]
        if action=='edit-intake':
            moment=at(body['taken_at'])
            if any(not moment+timedelta(minutes=5)<=at(row.payload['occurred_at'])<=moment+timedelta(hours=36) for row in phases): conflict('The intake time must stay before the recorded stages and within 36 hours of them.')
            record=dose; before=dict(record.payload); record.payload={**record.payload,'taken_at':body['taken_at'],'dose_mg':body['dose_mg'],'updated_at':now}
        elif action=='phase':
            moment=at(body['occurred_at']); taken=at(dose.payload['taken_at'])
            if moment<taken+timedelta(minutes=5): conflict('A stage cannot be recorded within the first 5 minutes after the dose.')
            if moment>taken+timedelta(hours=36): conflict('Record stages within 36 hours after the dose.')
            candidate={row.payload['event_type']:at(row.payload['occurred_at']) for row in phases}
            candidate[body['event_type']]=moment
            ordered=[candidate[key] for key in PHASES if key in candidate]
            if ordered!=sorted(ordered): conflict('Keep the sequence Taken → Started → Peak → Wearing off.')
            record=next((row for row in phases if row.payload['event_type']==body['event_type']),None)
            if record: before=dict(record.payload)
            else:
                record=MedsPhase(id=(session.scalar(select(func.max(MedsPhase.id))) or 0)+1,dose_id=dose.id,payload={});session.add(record)
            record.payload={**record.payload,'medication_id':config['medication']['id'],'dose_id':dose.id,'event_type':body['event_type'],'occurred_at':body['occurred_at'],'source':'ignis','client_event_id':operation_id,'created_at':record.payload.get('created_at',now),'updated_at':now}
        elif action=='undo':
            if body['kind']=='intake':
                record=dose
                if at(dose.payload['taken_at'])!=at(body['expected_at']) or body.get('dose_mg') is None or float(dose.payload['dose_mg'])!=body['dose_mg']: conflict('This dose changed. Refresh before removing it.')
                reports=[row for row in session.scalars(select(MedsArchive)) if row.id.startswith('reports:') and row.payload.get('dose_id')==dose.id]
                if reports: conflict('This dose has a saved response report. Taken is retained to preserve that report’s history.')
                for stage in phases:
                    previous = dict(stage.payload)
                    stage.payload = {**previous, '_removed_at': now}
                    cleared_stages.append({'id': stage.id, 'before': previous, 'after': dict(stage.payload)})
            else:
                record=next((row for row in phases if row.payload['event_type']==body['kind']),None)
                if not record: return {'id':dose.id}
                if at(record.payload['occurred_at'])!=at(body['expected_at']): conflict('This mark changed. Refresh before removing it.')
            if body['kind'] == 'intake':
                reverse_taken_habit_marks(session, dose, config, now)
            before=dict(record.payload);record.payload={**record.payload,'_removed_at':now}
        else: raise ValueError('Unsupported medication action')
    session.flush()
    if action in ('intake', 'edit-intake') or action == 'undo' and body['kind'] == 'intake':
        sync_taken_habits(session, config['medication'], config, now)
    session.add(MedsAudit(id=operation_id or str(uuid4()),payload={'action':action,'request':body,'result_id':record.id,'at':now,'before':before,'after':dict(record.payload),'cleared_stages':cleared_stages}))
    session.flush()
    return {'id':body['dose_id'] if action=='undo' else record.id}
