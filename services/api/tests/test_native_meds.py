import os
from pathlib import Path
import unittest
from uuid import uuid4
from datetime import datetime,timedelta,timezone
from unittest.mock import patch
from concurrent.futures import ThreadPoolExecutor
from alembic import command
from alembic.config import Config
from fastapi import FastAPI,HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine,select,delete,text
from sqlalchemy.orm import Session
from app.db import notebook as db
from app.models.meds import MedsSettings,MedsDose,MedsPhase,MedsArchive,MedsAudit
from app.models.habits import Habit, HabitCompletion, HabitSettings
from app.services import meds
from app.services.meds_import import import_meds
from app.api.routes import meds as routes

ROOT=Path(__file__).resolve().parents[1]
def stamp(offset=0):return (datetime.now(timezone.utc)-timedelta(hours=4)+timedelta(minutes=offset)).isoformat()
def fixture():
    return {'profile':{'timezone':'America/Bahia','day_start':'04:00:00'},'medication':{'id':7,'slug':'vyvanse','name':'Vyvanse','dose_presets':[30,50]},'doses':[{'id':9,'medication_id':7,'taken_at':stamp(),'dose_mg':'30.00','source':'shortcut','notes':'Historical note','client_event_id':'11111111-1111-4111-8111-111111111111'}],'events':[], 'reports':[], 'schedules':[], 'occurrences':[], 'occurrence_events':[]}

class NativeMedsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.name='ignis_native_meds_test_'+uuid4().hex[:10];cls.admin=create_engine(db.engine().url.set(database='postgres'),isolation_level='AUTOCOMMIT')
        with cls.admin.connect() as c:c.execute(text(f'CREATE DATABASE {cls.name}'))
        url=db.engine().url.set(database=cls.name)
        with patch.dict(os.environ,{'IGNIS_DATABASE_URL':url.render_as_string(hide_password=False)}):
            db.engine.cache_clear();command.upgrade(Config(str(ROOT/'alembic.ini')),'head');cls.engine=db.engine()
        db.engine.cache_clear()
    @classmethod
    def tearDownClass(cls):
        cls.engine.dispose()
        with cls.admin.connect() as c:c.execute(text(f'DROP DATABASE {cls.name}'))
        cls.admin.dispose()
    def setUp(self):
        self.source=fixture();self.taken=self.source['doses'][0]['taken_at']
        with Session(self.engine) as s,s.begin():
            for model in (HabitCompletion,Habit,HabitSettings,MedsAudit,MedsArchive,MedsPhase,MedsDose,MedsSettings):s.execute(delete(model))
            self.manifest=import_meds(s,self.source)
    def change(self,action,body):
        with Session(self.engine) as s,s.begin():return meds.change(s,action,body)
    def phase(self,kind='onset',minutes=60):return {'clientEventId':str(uuid4()),'dose_id':9,'event_type':kind,'occurred_at':(meds.at(self.taken)+timedelta(minutes=minutes)).isoformat()}
    def test_display_name_is_venvanse_without_changing_medication_identity(self):
        with Session(self.engine) as s:
            medication = meds.snapshot(s)['medication']
            self.assertEqual(medication['name'], 'Venvanse')
            self.assertEqual(medication['slug'], 'vyvanse')
            self.assertEqual(meds.settings(s)['medication']['name'], self.source['medication']['name'])

    def test_import_exact_and_rerun_preserves_new_records(self):
        self.change('phase',self.phase())
        with Session(self.engine) as s,s.begin():
            self.assertEqual(s.get(MedsDose,9).payload,self.source['doses'][0]);self.assertTrue(import_meds(s,self.source)['already_imported']);self.assertEqual(len(meds.snapshot(s)['events']),1)
    def test_phase_rules_and_retry(self):
        body=self.phase();saved=self.change('phase',body);self.assertEqual(self.change('phase',body),saved)
        for invalid in (self.phase('strongest',3),self.phase('strongest',45),self.phase('wearing_off',36*60+1)):
            with self.assertRaises(HTTPException):self.change('phase',invalid)
        self.change('phase',self.phase('strongest',90));self.change('phase',self.phase('wearing_off',120))
        with self.assertRaises(HTTPException):self.change('edit-intake',{'clientEventId':str(uuid4()),'dose_id':9,'taken_at':stamp(61),'dose_mg':30})
    def test_concurrent_duplicate_phase_only_one_record(self):
        body=self.phase()
        with ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(lambda _:self.change('phase',body),range(2)))
        self.assertEqual(results[0],results[1])
        with Session(self.engine) as s:self.assertEqual(len(list(s.scalars(select(MedsPhase)))),1)
    def test_undo_retains_audit_and_prevents_resurrection(self):
        body=self.phase();saved=self.change('phase',body)
        undo={'kind':'onset','dose_id':9,'expected_at':body['occurred_at']}
        with self.assertRaises(HTTPException):self.change('undo',{**undo,'expected_at':stamp(62)})
        self.change('undo',undo);self.change('undo',undo)
        with self.assertRaises(HTTPException):self.change('phase',body)
        with Session(self.engine) as s:
            self.assertTrue(s.get(MedsPhase,saved['id']).payload['_removed_at']);self.assertEqual(meds.snapshot(s)['events'],[]);self.assertEqual(len(list(s.scalars(select(MedsAudit)))),2)
    def test_imported_pending_retry_and_intake_guard(self):
        body={'clientEventId':self.source['doses'][0]['client_event_id'],'taken_at':self.taken,'dose_mg':30}
        self.assertEqual(self.change('intake',body),{'id':9})
        with self.assertRaises(HTTPException):self.change('intake',{**body,'clientEventId':str(uuid4())})
    def test_intake_edit_undo_and_source_untouched(self):
        before=dict(self.source['doses'][0]);body={'clientEventId':str(uuid4()),'dose_id':9,'taken_at':stamp(-5),'dose_mg':50}
        self.change('edit-intake',body);self.assertEqual(self.change('edit-intake',body),{'id':9})
        self.change('undo',{'kind':'intake','dose_id':9,'expected_at':body['taken_at'],'dose_mg':50})
        with Session(self.engine) as s:self.assertEqual(meds.snapshot(s)['doses'],[]);self.assertIsNotNone(s.get(MedsDose,9))
        self.assertEqual(self.source['doses'][0],before)
    def test_reports_preserved_and_protect_removal(self):
        with Session(self.engine) as s,s.begin():s.add(MedsArchive(id='reports:1',payload={'id':1,'dose_id':9,'note':'Retained'}))
        with self.assertRaises(HTTPException):self.change('undo',{'kind':'intake','dose_id':9,'expected_at':self.taken,'dose_mg':30})
    def test_routes_validate_and_never_call_source(self):
        app=FastAPI();app.include_router(routes.router)
        with patch.object(routes,'engine',return_value=self.engine),patch.object(routes,'backup_daily'),patch('app.services.raira_meds.exchange',side_effect=AssertionError('Source must not be called')):
            c=TestClient(app);self.assertEqual(c.get('/api/meds/vyvanse').status_code,200)
            self.assertEqual(c.post('/api/meds/vyvanse/phase',json=self.phase()).status_code,200)
            self.assertEqual(c.post('/api/meds/vyvanse/phase',json={**self.phase(),'dose_id':True}).status_code,422)

    def linked_habits(self, manual=False):
        with Session(self.engine) as s,s.begin():
            # Existing imported doses are historical and must not acquire new marks.
            dose=s.get(MedsDose,9);dose.payload={**dose.payload,'taken_at':(meds.at(self.taken)-timedelta(days=2)).isoformat()}
            s.add(HabitSettings(id=1,payload=self.source['profile']))
            day=meds.owner_day(self.source['profile'],meds.at(self.taken)).isoformat()
            for id,slot in ((5,1),(8,2)):
                s.add(Habit(id=id,payload={'name':'Vyvanse '+str(slot),'section':'Medications','status':'active','cadence':'daily','target_count':1,'start_date':'2020-01-01','medication_slug':'vyvanse','medication_dose_slot':slot}))
            s.flush()
            if manual:s.add(HabitCompletion(id='manual',habit_id=5,payload={'period_key':day,'completed_at':self.taken,'source':'ignis','reversed_at':None}))
    def new_intake(self):return {'clientEventId':str(uuid4()),'taken_at':self.taken,'dose_mg':30}
    def live_marks(self):
        with Session(self.engine) as s:return [(event.habit_id,event.payload) for event in s.scalars(select(HabitCompletion)) if not event.payload.get('reversed_at')]
    def test_taken_checks_matching_habit_and_retries_do_not_duplicate(self):
        self.linked_habits();body=self.new_intake()
        with ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(lambda _:self.change('intake',body),range(2)))
        self.assertEqual(results[0],results[1]);marks=self.live_marks();self.assertEqual(len(marks),1)
        self.assertEqual(marks[0][0],5);self.assertEqual(marks[0][1]['native_dose_id'],results[0]['id'])
        self.assertEqual(marks[0][1]['source'],'ignis_meds')
        self.change('undo',{'kind':'intake','dose_id':results[0]['id'],'expected_at':body['taken_at'],'dose_mg':30})
        self.assertEqual(self.live_marks(),[])
        with Session(self.engine) as s:self.assertTrue(s.scalar(select(HabitCompletion)).payload['reversed_at'])
    def test_taken_undo_reverses_manually_linked_vyvanse_checkin(self):
        self.linked_habits(manual=True);body=self.new_intake();saved=self.change('intake',body)
        self.assertEqual(len(self.live_marks()),1);self.assertEqual(self.live_marks()[0][1]['source'],'ignis')
        self.change('undo',{'kind':'intake','dose_id':saved['id'],'expected_at':body['taken_at'],'dose_mg':30})
        self.assertEqual(self.live_marks(),[])
    def test_edit_taken_moves_automatic_mark_to_correct_period(self):
        self.linked_habits();body=self.new_intake();saved=self.change('intake',body)
        edited=(meds.at(body['taken_at'])-timedelta(days=1)).isoformat()
        self.change('edit-intake',{'clientEventId':str(uuid4()),'dose_id':saved['id'],'taken_at':edited,'dose_mg':30})
        marks=self.live_marks();self.assertEqual(len(marks),1)
        self.assertEqual(marks[0][1]['period_key'],meds.owner_day(self.source['profile'],meds.at(edited)).isoformat())
        with Session(self.engine) as s:self.assertEqual(len(list(s.scalars(select(HabitCompletion)))),2)
    def test_second_dose_checks_second_slot(self):
        self.linked_habits();first=self.change('intake',self.new_intake())
        for kind,minutes in (('onset',10),('strongest',20),('wearing_off',30)):
            self.change('phase',{**self.phase(kind,minutes),'dose_id':first['id']})
        second=self.change('intake',{'clientEventId':str(uuid4()),'taken_at':(meds.at(self.taken)+timedelta(minutes=60)).isoformat(),'dose_mg':30})
        marks=self.live_marks();self.assertEqual({id for id,_ in marks},{5,8})
        self.assertEqual(next(data for id,data in marks if id==8)['native_dose_id'],second['id'])
        # Removing the first dose reassigns the remaining automatic mark to slot one.
        for kind,minutes in (('onset',10),('strongest',20),('wearing_off',30)):
            self.change('undo',{'kind':kind,'dose_id':first['id'],'expected_at':(meds.at(self.taken)+timedelta(minutes=minutes)).isoformat()})
        self.change('undo',{'kind':'intake','dose_id':first['id'],'expected_at':self.taken,'dose_mg':30})
        marks=self.live_marks();self.assertEqual(len(marks),1);self.assertEqual(marks[0][0],5)
        self.assertEqual(marks[0][1]['native_dose_id'],second['id'])
    def test_habit_sync_failure_rolls_back_dose_and_audit(self):
        self.linked_habits()
        sync = meds.sync_taken_habits
        def fail_after_sync(*args):
            sync(*args)
            raise RuntimeError('test rollback')
        with patch.object(meds,'sync_taken_habits',side_effect=fail_after_sync):
            with self.assertRaises(RuntimeError):self.change('intake',self.new_intake())
        with Session(self.engine) as s:
            self.assertEqual(len(list(s.scalars(select(MedsDose)))),1);self.assertEqual(list(s.scalars(select(MedsAudit))),[])
        self.assertEqual(self.live_marks(),[])

    def habit_mark(self, id=5, expected=0, desired=1):
        from app.services import habits
        day = habits.owner_day(self.source['profile']).isoformat()
        with Session(self.engine) as s,s.begin():
            return habits.change(s,'mark',{'habit_id':id,'date':day,'period_key':day,'expected_count':expected,'desired_count':desired})
    def test_habit_check_records_taken_using_last_amount_and_retry_is_idempotent(self):
        self.linked_habits()
        with Session(self.engine) as s,s.begin():
            dose=s.get(MedsDose,9);dose.payload={**dose.payload,'dose_mg':'50.00'}
        self.habit_mark();self.habit_mark()
        with Session(self.engine) as s:
            doses=meds.snapshot(s)['doses'];self.assertEqual(len(doses),2)
            self.assertEqual(doses[-1]['dose_mg'],50)
        marks=self.live_marks();self.assertEqual(len(marks),1)
        self.assertEqual(marks[0][1]['native_dose_id'],doses[-1]['id'])
        self.habit_mark(expected=1,desired=0)
        with Session(self.engine) as s:self.assertEqual(len(meds.snapshot(s)['doses']),1)
        self.assertEqual(self.live_marks(),[])
    def test_habit_check_reuses_existing_taken_instead_of_creating_dose(self):
        self.linked_habits()
        with Session(self.engine) as s,s.begin():
            dose=s.get(MedsDose,9);dose.payload={**dose.payload,'taken_at':datetime.now(timezone.utc).isoformat()}
        self.habit_mark()
        with Session(self.engine) as s:self.assertEqual(len(meds.snapshot(s)['doses']),1)
        self.assertEqual(self.live_marks()[0][1]['native_dose_id'],9)
    def test_second_habit_requires_first_dose_and_completed_stages(self):
        self.linked_habits()
        with self.assertRaises(HTTPException):self.habit_mark(id=8)
        first=self.change('intake',self.new_intake())
        with self.assertRaises(HTTPException):self.habit_mark(id=8)
        for kind,minutes in (('onset',10),('strongest',20),('wearing_off',30)):
            self.change('phase',{**self.phase(kind,minutes),'dose_id':first['id']})
        self.habit_mark(id=8);self.habit_mark(id=8)
        with Session(self.engine) as s:self.assertEqual(len(meds.snapshot(s)['doses']),3)
        self.assertEqual({id for id,_ in self.live_marks()},{5,8})
    def test_habit_shortcut_without_previous_amount_does_not_check_in(self):
        self.linked_habits()
        with Session(self.engine) as s,s.begin():
            dose=s.get(MedsDose,9);dose.payload={**dose.payload,'_removed_at':datetime.now(timezone.utc).isoformat()}
        with self.assertRaises(HTTPException):self.habit_mark()
        self.assertEqual(self.live_marks(),[])
    def test_habit_undo_clears_taken_and_all_stages_with_audit(self):
        self.linked_habits();first=self.change('intake',self.new_intake())
        bodies=[]
        for kind,minutes in (('onset',10),('strongest',20),('wearing_off',30)):
            body={**self.phase(kind,minutes),'dose_id':first['id']};bodies.append(body);self.change('phase',body)
        self.habit_mark(expected=1,desired=0);self.habit_mark(expected=1,desired=0)
        self.assertEqual(self.live_marks(),[])
        with Session(self.engine) as session:
            self.assertEqual(len(meds.snapshot(session)['doses']),1)
            self.assertEqual(meds.snapshot(session)['events'],[])
            stages=list(session.scalars(select(MedsPhase).where(MedsPhase.dose_id==first['id'])))
            self.assertEqual(len(stages),3);self.assertTrue(all(row.payload.get('_removed_at') for row in stages))
            audit=next(row.payload for row in session.scalars(select(MedsAudit)) if row.payload['action']=='undo')
            self.assertEqual(len(audit['cleared_stages']),3)
        for body in bodies:
            with self.assertRaises(HTTPException):self.change('phase',body)
    def test_concurrent_habit_shortcuts_create_single_taken(self):
        self.linked_habits()
        with ThreadPoolExecutor(max_workers=2) as pool:list(pool.map(lambda _:self.habit_mark(),range(2)))
        with Session(self.engine) as s:self.assertEqual(len(meds.snapshot(s)['doses']),2)
        self.assertEqual(len(self.live_marks()),1)

    def test_simultaneous_taken_and_habit_check_do_not_duplicate_or_deadlock(self):
        self.linked_habits()
        def run(origin):
            try:
                self.habit_mark() if origin == 'habit' else self.change('intake',self.new_intake())
                return 200
            except HTTPException as error:
                return error.status_code
        with ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(run,('habit','meds')))
        self.assertTrue(all(status in (200,409) for status in results))
        with Session(self.engine) as s:self.assertEqual(len(meds.snapshot(s)['doses']),2)
        self.assertEqual(len(self.live_marks()),1)

    def legacy_link(self, explicit=True):
        self.linked_habits()
        from app.services import habits
        day=habits.owner_day(self.source['profile']).isoformat()
        with Session(self.engine) as session,session.begin():
            dose=session.get(MedsDose,9);dose.payload={**dose.payload,'taken_at':datetime.now(timezone.utc).isoformat()}
            self.legacy_taken=dose.payload['taken_at']
            session.add(HabitCompletion(id='raira:legacy',habit_id=5,payload={'period_key':day,'completed_at':self.legacy_taken,'source':'shortcut','medication_dose_id':9 if explicit else None,'reversed_at':None}))
            session.add(HabitCompletion(id='unrelated',habit_id=8,payload={'period_key':day,'completed_at':self.legacy_taken,'source':'ignis','reversed_at':None}))
    def test_undo_taken_unchecks_imported_link_and_keeps_other_habits(self):
        self.legacy_link()
        body={'kind':'intake','dose_id':9,'expected_at':self.legacy_taken,'dose_mg':30}
        self.change('undo',body);self.change('undo',body)
        self.assertEqual([id for id,_ in self.live_marks()],[8])
        with Session(self.engine) as session:
            self.assertTrue(session.get(HabitCompletion,'raira:legacy').payload['reversed_at'])
            self.assertFalse(meds.active(session.get(MedsDose,9)))
    def test_uncheck_imported_habit_undoes_taken_and_retry_is_safe(self):
        self.legacy_link();self.habit_mark(expected=1,desired=0);self.habit_mark(expected=1,desired=0)
        self.assertEqual([id for id,_ in self.live_marks()],[8])
        with Session(self.engine) as session:self.assertEqual(meds.snapshot(session)['doses'],[])
    def test_uncheck_manual_same_slot_habit_also_undoes_taken(self):
        self.legacy_link(explicit=False);self.habit_mark(expected=1,desired=0)
        with Session(self.engine) as session:self.assertEqual(meds.snapshot(session)['doses'],[])
        self.assertEqual([id for id,_ in self.live_marks()],[8])
    def test_imported_report_blocks_both_undo_paths_atomically(self):
        self.legacy_link()
        with Session(self.engine) as session,session.begin():session.add(MedsArchive(id='reports:1',payload={'id':1,'dose_id':9,'note':'retained'}))
        with self.assertRaises(HTTPException):self.habit_mark(expected=1,desired=0)
        with self.assertRaises(HTTPException):self.change('undo',{'kind':'intake','dose_id':9,'expected_at':self.legacy_taken,'dose_mg':30})
        self.assertEqual({id for id,_ in self.live_marks()},{5,8})
        with Session(self.engine) as session:self.assertTrue(meds.active(session.get(MedsDose,9)))

    def test_direct_taken_undo_clears_imported_stages_and_linked_habit(self):
        self.legacy_link()
        with Session(self.engine) as session,session.begin():
            for id,kind in enumerate(('onset','strongest','wearing_off'),1):
                session.add(MedsPhase(id=id,dose_id=9,payload={'medication_id':7,'dose_id':9,'event_type':kind,'occurred_at':self.legacy_taken,'source':'shortcut'}))
        body={'kind':'intake','dose_id':9,'expected_at':self.legacy_taken,'dose_mg':30}
        self.change('undo',body);self.change('undo',body)
        self.assertEqual([id for id,_ in self.live_marks()],[8])
        with Session(self.engine) as session:
            self.assertEqual(meds.snapshot(session)['events'],[])
            self.assertEqual(meds.snapshot(session)['doses'],[])
            self.assertEqual(len(list(session.scalars(select(MedsPhase)))),3)
            self.assertEqual(len(list(session.scalars(select(MedsAudit)))),1)
    def test_report_guard_preserves_stages_when_undo_is_refused(self):
        self.legacy_link()
        with Session(self.engine) as session,session.begin():
            session.add(MedsArchive(id='reports:1',payload={'id':1,'dose_id':9}))
            session.add(MedsPhase(id=1,dose_id=9,payload={'medication_id':7,'dose_id':9,'event_type':'onset','occurred_at':self.legacy_taken}))
        with self.assertRaises(HTTPException):self.habit_mark(expected=1,desired=0)
        with Session(self.engine) as session:
            self.assertFalse(session.get(MedsPhase,1).payload.get('_removed_at'))
            self.assertEqual(len(meds.snapshot(session)['events']),1)
        self.assertEqual({id for id,_ in self.live_marks()},{5,8})
    def test_cascaded_undo_rolls_back_stages_if_habit_sync_fails(self):
        self.linked_habits();dose=self.change('intake',self.new_intake())
        stage=self.change('phase',{**self.phase(),'dose_id':dose['id']})
        with patch.object(meds,'reverse_taken_habit_marks',side_effect=RuntimeError('test rollback')):
            with self.assertRaises(RuntimeError):self.change('undo',{'kind':'intake','dose_id':dose['id'],'expected_at':self.taken,'dose_mg':30})
        with Session(self.engine) as session:
            self.assertTrue(meds.active(session.get(MedsDose,dose['id'])))
            self.assertFalse(session.get(MedsPhase,stage['id']).payload.get('_removed_at'))
        self.assertEqual(len(self.live_marks()),1)
