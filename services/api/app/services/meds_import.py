"""One-time, verified copy of Venvanse records; never replaces native edits."""
from datetime import datetime, timezone, time
from zoneinfo import ZoneInfo
from sqlalchemy import select, text
from app.models.meds import MedsSettings, MedsDose, MedsPhase, MedsArchive, MedsAudit
from app.services.habit_import import digest

RELATED=('reports','schedules','occurrences','occurrence_events')
def import_meds(session, export):
    session.execute(text('SELECT pg_advisory_xact_lock(18475, 1)'))
    prior=session.get(MedsSettings,1)
    if prior: return {**prior.payload['import'],'already_imported':True}
    if any(session.scalar(select(model.id).limit(1)) is not None for model in (MedsDose,MedsPhase,MedsArchive,MedsAudit)): raise ValueError('Native Meds storage is not empty; refusing to overwrite it.')
    profile=export['profile'];ZoneInfo(profile['timezone']);time.fromisoformat(profile['day_start'])
    medication=export['medication']
    if medication['slug']!='vyvanse': raise ValueError('Only Venvanse may be imported.')
    doses={row['id'] for row in export['doses']};events={row['id'] for row in export['events']}
    if len(doses)!=len(export['doses']) or len(events)!=len(export['events']): raise ValueError('Duplicate medication records.')
    for row in export['doses']:
        if row['medication_id']!=medication['id'] or float(row['dose_mg'])<=0: raise ValueError('Invalid Venvanse dose.')
        datetime.fromisoformat(row['taken_at']);session.add(MedsDose(id=row['id'],payload=dict(row)))
    session.flush()
    for row in export['events']:
        if row['dose_id'] not in doses or row['medication_id']!=medication['id'] or row['event_type'] not in ('onset','strongest','wearing_off'): raise ValueError('Invalid linked phase record.')
        datetime.fromisoformat(row['occurred_at']);session.add(MedsPhase(id=row['id'],dose_id=row['dose_id'],payload=dict(row)))
    for group in RELATED:
        for row in export[group]: session.add(MedsArchive(id=f'{group}:{row["id"]}',payload=dict(row)))
    session.flush()
    restored={'profile':profile,'medication':medication,'doses':[row.payload for row in session.scalars(select(MedsDose))],'events':[row.payload for row in session.scalars(select(MedsPhase))],**{group:[row.payload for row in session.scalars(select(MedsArchive)) if row.id.startswith(group+':')] for group in RELATED}}
    def canonical(data):return {key:sorted(value,key=lambda row:row['id']) if isinstance(value,list) else value for key,value in data.items()}
    checksum=digest(canonical(export))
    if digest(canonical(restored))!=checksum: raise ValueError('Meds import verification mismatch; transaction rolled back.')
    manifest={**{key:len(export[key]) for key in ('doses','events',*RELATED)},'sha256':checksum,'imported_at':datetime.now(timezone.utc).isoformat()}
    session.add(MedsSettings(id=1,payload={**profile,'medication':medication,'import':manifest}));session.flush()
    return manifest
