import contextlib
import io
import json
import subprocess
import sys
import types
import unittest
from unittest.mock import patch
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError
from app.api.routes.raira_habits import router
from app.schemas.raira_habits import RairaHabitMark
from app.services.raira_habits import exchange, REMOTE

class RairaHabitsTests(unittest.TestCase):
    def body(self, **changes):
        return {'habit_id': 3, 'date': '2026-10-18', 'period_key': '2026-10-18', 'expected_count': 0, 'desired_count': 1, **changes}

    def test_mark_validation_and_route_scope(self):
        app = FastAPI(); app.include_router(router); client = TestClient(app)
        with patch('app.api.routes.raira_habits.exchange') as bridge:
            for changes in [{'habit_id': True}, {'habit_id': 0}, {'desired_count': 3}, {'expected_count': True}, {'expected_count': -1}, {'date': '2026-02-30'}, {'source': 'shortcut'}]:
                self.assertEqual(client.post('/api/raira/habits/mark', json=self.body(**changes)).status_code, 422)
            bridge.assert_not_called()
        for method, path in [('delete', '/api/raira/habits/3'), ('post', '/api/raira/habits'), ('patch', '/api/raira/habits/3')]:
            self.assertIn(getattr(client, method)(path).status_code, [404, 405])
        with patch('app.api.routes.raira_habits.exchange', side_effect=HTTPException(409, 'Refresh first')) as bridge:
            self.assertEqual(client.post('/api/raira/habits/mark', json=self.body()).status_code, 409)
            self.assertEqual(bridge.call_args.args, ('mark',))
            self.assertEqual(bridge.call_args.kwargs['payload'], self.body())

    def test_transport_is_private_and_values_stay_on_stdin(self):
        with patch('app.services.raira_habits.subprocess.run', return_value=types.SimpleNamespace(stdout='{"result":{"habits":[]}}')) as run:
            self.assertEqual(exchange('mark', payload=self.body()), {'habits': []})
            self.assertEqual(json.loads(run.call_args.kwargs['input'])['payload'], self.body())
            self.assertNotIn('2026-10-18', repr(run.call_args.args))
            self.assertNotIn('shell', run.call_args.kwargs)
        for effect in [subprocess.TimeoutExpired('private secret', 30), ValueError('private secret')]:
            with patch('app.services.raira_habits.subprocess.run', side_effect=effect), self.assertRaises(HTTPException) as caught:
                exchange('read')
            self.assertEqual(caught.exception.status_code, 503)
            self.assertNotIn('secret', caught.exception.detail)

    def remote(self, action='mark', current=0, changes=None, body=None, source_error=None, has_history=False, missing=False):
        habit = {'id':3, 'name':'Read', 'section':'Mind', 'moment':None, 'status':'active', 'cadence':'daily', 'target_count':3, 'start_date':'2026-10-01', 'period_key':'2026-10-18', 'completed_count':current, 'period_done':False, 'due':True, 'rest_day':False, 'current_streak':2, 'history':[], 'totals':{'periods':18,'completed':2,'percent':11}, 'shortcut_credentials':[{'secret':'never expose'}], **(changes or {})}
        writes=[]; locks=[]; habits=[habit]
        class Cursor:
            def __enter__(self): return self
            def __exit__(self,*args): pass
            def execute(self, sql, params): locks.append(sql)
            def fetchone(self): return (has_history,)
        class Connection(Cursor):
            def cursor(self): return Cursor()
        def check(habit_id, date):
            writes.append(('check', habit_id, date)); habit['completed_count'] += 1
            return habit, source_error
        def undo(habit_id, date):
            writes.append(('undo', habit_id, date)); habit['completed_count'] -= 1
            return habit, source_error
        def create(data):
            writes.append(('create', data))
            added = {**habit, **data, 'id': 4, 'completed_count': 0}
            habits.append(added)
            return added, source_error
        def edit(habit_id, data):
            writes.append(('edit',habit_id,data)); habit.update(data); return habit,source_error
        def archive(habit_id):
            writes.append(('archive',habit_id)); habits.clear(); return {'ok':True},source_error
        service=types.SimpleNamespace(update_habit=edit, archive_habit=archive, create_habit=create, db=Connection, get_habit=lambda *args, **kwargs:(None,'not_found') if missing else (habit,None), list_habits=lambda **kwargs:habits, check_in_manual=check, undo_today=undo)
        import datetime
        profile=types.SimpleNamespace(get_profile=lambda:{'timezone':'America/Bahia'}, owner_day=lambda _:datetime.date(2026,10,18))
        parent=types.ModuleType('services'); parent.habits=service
        output=io.StringIO()
        with patch.dict(sys.modules, {'services':parent,'services.habits':service,'services.profile':profile}), patch('sys.stdin', io.StringIO(json.dumps({'action':action,'payload':body or self.body()}))), contextlib.redirect_stdout(output):
            exec(REMOTE, {})
        return json.loads(output.getvalue()), writes, locks

    def test_read_filters_credentials_and_preserves_counts_and_history(self):
        result,writes,_=self.remote('read', current=2, changes={'history':[{'date':'2026-10-17','count':3,'checked':True,'rest':False}]})
        habit=result['result']['habits'][0]
        self.assertNotIn('shortcut_credentials',habit)
        self.assertEqual(habit['completed_count'],2)
        self.assertEqual(habit['history'][0]['count'],3)
        self.assertEqual(writes,[])

    def test_check_undo_and_convergent_retry(self):
        result,writes,locks=self.remote()
        self.assertEqual(writes,[('check',3,'2026-10-18')])
        self.assertEqual(result['result']['habits'][0]['completed_count'],1)
        self.assertIn('pg_advisory_lock',locks[0]); self.assertIn('pg_advisory_unlock',locks[-1])
        result,writes,_=self.remote(current=1)
        self.assertIn('result',result); self.assertEqual(writes,[])
        result,writes,_=self.remote(current=1,body=self.body(expected_count=1,desired_count=0))
        self.assertEqual(writes,[('undo',3,'2026-10-18')])
        self.assertEqual(result['result']['habits'][0]['completed_count'],0)
        result,writes,_=self.remote(current=0,body=self.body(expected_count=1,desired_count=0))
        self.assertIn('result',result); self.assertEqual(writes,[])

    def test_stale_counts_dates_periods_and_linked_medication_never_write(self):
        cases=[{'current':2}, {'changes':{'medication_slug':'vyvanse'}}, {'changes':{'schedule_id':9}}, {'changes':{'status':'paused'}}, {'changes':{'due':False}}, {'changes':{'rest_day':True}}, {'changes':{'start_date':'2026-10-19'}}, {'body':self.body(date='2026-10-17')}, {'body':self.body(period_key='2026-10-01')}, {'body':self.body(expected_count=3,desired_count=4)}]
        for case in cases:
            with self.subTest(case=case):
                result,writes,locks=self.remote(**case)
                self.assertIn('error',result); self.assertEqual(writes,[])
                self.assertIn('pg_advisory_unlock',locks[-1])

    def test_create_validation_and_only_supported_fields_are_forwarded(self):
        app = FastAPI(); app.include_router(router); client = TestClient(app)
        with patch('app.api.routes.raira_habits.exchange') as bridge:
            for body in [{'name': ' '}, {'name': 'Read', 'target_count': True}, {'name': 'Read', 'target_count': 51}, {'name': 'Read', 'cadence': 'hourly'}, {'name': 'Read', 'medication_slug': 'vyvanse'}, {'name': 'Read', 'schedule_id': 9}]:
                self.assertEqual(client.post('/api/raira/habits/create', json=body).status_code, 422)
            bridge.assert_not_called()
        with patch('app.api.routes.raira_habits.exchange', side_effect=HTTPException(409, 'A habit already exists')) as bridge:
            self.assertEqual(client.post('/api/raira/habits/create', json={'name': ' Read '}).status_code, 409)
            self.assertEqual(bridge.call_args.args, ('create',))
            self.assertEqual(bridge.call_args.kwargs['payload'], {'name':'Read', 'section':'Other', 'cadence':'daily', 'target_count':1})

    def test_remote_create_reuses_matching_habit_on_retry_and_rejects_conflicts(self):
        payload = {'name':'Walk', 'section':'Body', 'cadence':'weekly', 'target_count':3}
        result,writes,locks=self.remote('create',body=payload)
        self.assertEqual(writes, [('create',payload)])
        self.assertEqual(result['result']['habits'][-1]['name'], 'Walk')
        self.assertIn('pg_advisory_unlock',locks[-1])
        match = {'name':'Read','section':'Mind','cadence':'daily','target_count':3}
        result,writes,_=self.remote('create',body=match)
        self.assertIn('result',result); self.assertEqual(writes,[])
        for patch in [{'target_count':2}, {'section':'Body'}, {'cadence':'weekly'}]:
            result,writes,_=self.remote('create',body={**match, **patch})
            self.assertIn('error',result); self.assertEqual(writes,[])
        for changes in [{'status':'paused'}, {'medication_slug':'vyvanse'}, {'schedule_id':7}]:
            result,writes,_=self.remote('create',body=match,changes=changes)
            self.assertIn('error',result); self.assertEqual(writes,[])

    def test_edit_and_archive_routes_validate_and_limit_fields(self):
        app=FastAPI(); app.include_router(router); client=TestClient(app)
        config={'name':'Read','section':'Mind','cadence':'daily','target_count':3}
        for action,body in [('edit', {'habit_id':3,'expected':config,**config}), ('archive',{'habit_id':3,'expected':config})]:
            with patch('app.api.routes.raira_habits.exchange', side_effect=HTTPException(409,'Changed')) as bridge:
                self.assertEqual(client.post('/api/raira/habits/'+action,json=body).status_code,409)
                self.assertEqual(bridge.call_args.args,(action,))
                self.assertEqual(bridge.call_args.kwargs['payload'],body)
            for patch_body in [{'habit_id':True},{'expected':{}},{'medication_slug':'vyvanse'},{'schedule_id':2},{'start_date':'2026-01-01'}]:
                with patch('app.api.routes.raira_habits.exchange') as bridge:
                    self.assertEqual(client.post('/api/raira/habits/'+action,json={**body,**patch_body}).status_code,422)
                    bridge.assert_not_called()

    def test_edit_and_archive_preserve_history_and_reject_stale_settings(self):
        old={'name':'Read','section':'Mind','cadence':'daily','target_count':3}
        desired={**old,'name':'Read a book','target_count':2}
        history=[{'date':'2026-10-17','count':3,'checked':True,'rest':False}]
        body={'habit_id':3,'expected':old,**desired}
        result,writes,_=self.remote('edit',body=body,current=2,changes={'history':history})
        self.assertEqual(writes,[('edit',3,desired)])
        self.assertEqual(result['result']['habits'][0]['history'],history)
        self.assertEqual(result['result']['habits'][0]['completed_count'],2)
        result,writes,_=self.remote('edit',body=body,changes=desired)
        self.assertIn('result',result);self.assertEqual(writes,[])
        result,writes,_=self.remote('edit',body=body,changes={'name':'Changed elsewhere'})
        self.assertIn('error',result);self.assertEqual(writes,[])
        result,writes,_=self.remote('edit',body={**body,'cadence':'weekly'},has_history=True)
        self.assertIn('error',result);self.assertEqual(writes,[])
        result,writes,_=self.remote('edit',body=body,changes={'medication_slug':'vyvanse'})
        self.assertIn('error',result);self.assertEqual(writes,[])
        result,writes,_=self.remote('archive',body={'habit_id':3,'expected':old})
        self.assertEqual(writes,[('archive',3)]);self.assertEqual(result['result']['habits'],[])
        result,writes,_=self.remote('archive',body={'habit_id':3,'expected':old},missing=True)
        self.assertIn('result',result);self.assertEqual(writes,[])
        result,writes,_=self.remote('archive',body={'habit_id':3,'expected':old},changes={'name':'Changed elsewhere'})
        self.assertIn('error',result);self.assertEqual(writes,[])
