"""Copy Vyvanse only, from a read-only source transaction into native Ignis storage."""
import json
import os
from pathlib import Path
import shlex
import subprocess
import sys
from datetime import datetime,timezone
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from sqlalchemy.orm import Session
from app.db.notebook import DATA,engine
from app.models.meds import MedsSettings
from app.services.meds_import import import_meds

REMOTE=r'''
import json
import psycopg2.extras
from services import medications as m
with m.db() as conn,conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
    cur.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
    cur.execute('SELECT timezone,day_start FROM owner_profile WHERE id=1')
    result={'profile':dict(cur.fetchone())}
    cur.execute("SELECT * FROM medications WHERE slug='vyvanse' ORDER BY archived_at NULLS FIRST,id LIMIT 1")
    medication=dict(cur.fetchone());result['medication']=medication;mid=medication['id']
    queries={
      'doses':('SELECT * FROM medication_doses WHERE medication_id=%s ORDER BY id',(mid,)),
      'events':('SELECT * FROM medication_response_events WHERE medication_id=%s ORDER BY id',(mid,)),
      'reports':('SELECT r.* FROM dose_state_reports r JOIN medication_doses d ON d.id=r.dose_id WHERE d.medication_id=%s ORDER BY r.id',(mid,)),
      'schedules':('SELECT * FROM medication_schedules WHERE medication_id=%s ORDER BY id',(mid,)),
      'occurrences':('SELECT o.* FROM medication_schedule_occurrences o WHERE o.schedule_id IN (SELECT id FROM medication_schedules WHERE medication_id=%s) OR o.dose_id IN (SELECT id FROM medication_doses WHERE medication_id=%s) ORDER BY o.id',(mid,mid)),
      'occurrence_events':('SELECT e.* FROM medication_schedule_occurrence_events e WHERE e.schedule_id IN (SELECT id FROM medication_schedules WHERE medication_id=%s) ORDER BY e.id',(mid,)),
    }
    for name,(sql,params) in queries.items():
        cur.execute(sql,params);result[name]=[dict(row) for row in cur.fetchall()]
    print(json.dumps(result,default=lambda value:value.isoformat() if hasattr(value,'isoformat') else str(value)))
'''

def backup(label):
    target=DATA/'backups'/f'{label}-{datetime.now(timezone.utc):%Y%m%dT%H%M%SZ}.dump';target.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
    url=engine().url;env=os.environ.copy()
    if url.password:env['PGPASSWORD']=url.password
    subprocess.run(['/opt/homebrew/opt/postgresql@18/bin/pg_dump','-h',url.query.get('host',url.host or 'localhost'),'-p',str(url.query.get('port',url.port or 5432)),'-U',url.username or '', '-d',url.database,'-Fc','-f',str(target)],env=env,capture_output=True,check=True)
    os.chmod(target,0o600)

def main():
    with Session(engine()) as session:
        previous=session.get(MedsSettings,1)
        if previous: print(json.dumps({**previous.payload['import'],'already_imported':True}));return
    backup('before-native-meds')
    result=subprocess.run(['ssh','-T','-oBatchMode=yes','-oConnectTimeout=8','-oStrictHostKeyChecking=yes','cabecao','docker exec -i raira-api-1 python -c '+shlex.quote(REMOTE)],capture_output=True,text=True,timeout=60,check=True)
    export=json.loads(result.stdout)
    target=DATA/'backups'/f'raira-vyvanse-export-{datetime.now(timezone.utc):%Y%m%dT%H%M%SZ}.json'
    fd=os.open(target,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'w') as handle:json.dump(export,handle)
    with Session(engine()) as session,session.begin():manifest=import_meds(session,export)
    backup('after-native-meds')
    print(json.dumps(manifest))

if __name__=='__main__':main()
