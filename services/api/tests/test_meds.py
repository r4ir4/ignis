import contextlib
from datetime import datetime, timedelta, timezone
import io
import json
import subprocess
import sys
import types
import unittest
from unittest.mock import patch
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError
from app.api.routes.meds import router
from app.schemas.meds import MedsIntake, MedsPhase
from app.services.raira_meds import REMOTE, exchange


class MedsTests(unittest.TestCase):
    def setUp(self):
        app = FastAPI()
        app.include_router(router)
        self.client = TestClient(app)
        self.payload = {'dose_mg': 30, 'taken_at': datetime.now(timezone.utc).isoformat(), 'clientEventId': str(uuid4())}

    def test_write_validation(self):
        MedsIntake.model_validate(self.payload)
        for changes in [{'dose_mg': 0}, {'dose_mg': True}, {'dose_mg': float('nan')}, {'taken_at': '2026-01-01T12:00:00'}, {'taken_at': (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()}, {'taken_at': (datetime.now(timezone.utc) - timedelta(days=8)).isoformat()}, {'source': 'other'}, {'medication_id': 20}]:
            with self.subTest(changes=changes), self.assertRaises(ValidationError):
                MedsIntake.model_validate({**self.payload, **changes})
        with self.assertRaises(ValidationError):
            MedsPhase.model_validate({'dose_id': 3, 'event_type': 'unknown', 'occurred_at': self.payload['taken_at'], 'clientEventId': self.payload['clientEventId']})

    def test_routes_forward_only_validated_actions(self):
        with patch('app.api.routes.meds.exchange', return_value={'id': 8}) as bridge:
            self.assertEqual(self.client.post('/api/meds/vyvanse/intake', json=self.payload).json(), {'id': 8})
            self.assertEqual(bridge.call_args.args, ('intake',))
            self.assertEqual(bridge.call_args.kwargs['payload']['clientEventId'], self.payload['clientEventId'])
            self.assertEqual(self.client.post('/api/meds/vyvanse/intake', json={**self.payload, 'dose_mg': -5}).status_code, 422)
            self.assertEqual(bridge.call_count, 1)
        self.assertEqual(self.client.post('/api/meds/ritalin/intake', json=self.payload).status_code, 404)
        with patch('app.api.routes.meds.exchange', return_value={'id': 9}) as bridge:
            event = {'dose_id': 7, 'event_type': 'onset', 'occurred_at': self.payload['taken_at'], 'clientEventId': self.payload['clientEventId']}
            self.assertEqual(self.client.post('/api/meds/vyvanse/phase', json=event).json(), {'id': 9})
            self.assertEqual(bridge.call_args.args, ('phase',))
        with patch('app.api.routes.meds.exchange', side_effect=HTTPException(409, 'use the sequence')):
            self.assertEqual(self.client.post('/api/meds/vyvanse/phase', json=event).status_code, 409)

    def test_ssh_payload_stays_on_stdin_and_transport_errors_are_private(self):
        with patch('app.services.raira_meds.subprocess.run', return_value=types.SimpleNamespace(stdout='{"result":{"id":3}}')) as run:
            self.assertEqual(exchange('intake', payload=self.payload), {'id': 3})
            self.assertNotIn(self.payload['clientEventId'], repr(run.call_args.args))
            self.assertEqual(json.loads(run.call_args.kwargs['input'])['payload'], self.payload)
            self.assertNotIn('shell', run.call_args.kwargs)
        with patch('app.services.raira_meds.subprocess.run', side_effect=subprocess.TimeoutExpired('private credentials', 30)):
            with self.assertRaises(HTTPException) as caught:
                exchange('read', days=30)
            self.assertEqual(caught.exception.status_code, 503)
            self.assertNotIn('credentials', caught.exception.detail)
        with patch('app.services.raira_meds.subprocess.run', return_value=types.SimpleNamespace(stdout='{"error":"no recent dose"}')):
            with self.assertRaises(HTTPException) as caught:
                exchange('phase', payload={})
            self.assertEqual(caught.exception.status_code, 409)

    def remote(self, action, previous=None):
        writes = []
        class Cursor:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def execute(self, sql, args): self.args = args
            def fetchone(self): return (previous, datetime.fromisoformat(self_time), 30) if previous else None
        class Connection(Cursor):
            def cursor(self): return Cursor()
        service = types.SimpleNamespace(
            medication_id_for_slug=lambda slug: 7 if slug == 'vyvanse' else None,
            get_medication=lambda medication_id: ({'id': 7}, None),
            db=Connection,
            create_dose=lambda medication_id, data: (writes.append(('intake', medication_id, data)) or {'id': 8}, None),
            create_response_event=lambda medication_id, data: (writes.append(('phase', medication_id, data)) or {'id': 9}, None),
        )
        self_time = self.payload['taken_at']
        output = io.StringIO()
        with patch.dict(sys.modules, {'services': types.SimpleNamespace(medications=service)}), patch('sys.stdin', io.StringIO(json.dumps({'action': action, 'payload': {**self.payload, 'source': 'untrusted'}}))), contextlib.redirect_stdout(output):
            exec(REMOTE, {})
        return json.loads(output.getvalue()), writes

    def test_remote_reuses_existing_id_without_repeating_write(self):
        result, writes = self.remote('intake', previous=4)
        self.assertEqual(result, {'result': {'id': 4}})
        self.assertEqual(writes, [])
        self.payload['dose_mg'] = 40
        result, writes = self.remote('intake', previous=4)
        self.assertIn('different values', result['error'])
        self.assertEqual(writes, [])

    def test_remote_calls_existing_business_rules_with_fixed_source(self):
        for action in ['intake', 'phase']:
            result, writes = self.remote(action)
            self.assertIn('result', result)
            self.assertEqual(writes[0][:2], (action, 7))
            self.assertEqual(writes[0][2]['source'], 'ignis')

    def test_all_time_read_has_no_lower_date_bound_and_keeps_old_records(self):
        from datetime import date
        calls = []
        old = '2020-01-02T10:00:00+00:00'
        service = types.SimpleNamespace(
            medication_id_for_slug=lambda slug: 7,
            get_medication=lambda medication_id: ({'id': 7, 'name': 'Venvanse', 'slug': 'vyvanse', 'dose_presets': [30]}, None),
            get_profile=lambda: {'timezone': 'America/Bahia'},
            owner_day=lambda profile, at=None: at.date() if at else date.today(),
            list_doses=lambda medication_id, since, until: (calls.append(('doses', since)) or [{'id': 1, 'taken_at': old, 'dose_mg': 30}]),
            list_response_events=lambda medication_id, since, until: (calls.append(('events', since)) or []),
        )
        output = io.StringIO()
        with patch.dict(sys.modules, {'services': types.SimpleNamespace(medications=service)}), patch('sys.stdin', io.StringIO('{"action":"read"}')), contextlib.redirect_stdout(output):
            exec(REMOTE, {})
        result = json.loads(output.getvalue())['result']
        self.assertEqual(calls, [('doses', None), ('events', None)])
        self.assertEqual(result['range'], 'all')
        self.assertEqual(result['doses'][0]['taken_at'], old)
        with patch('app.api.routes.meds.exchange', return_value=result) as bridge:
            response = self.client.get('/api/meds/vyvanse')
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()['range'], 'all')
            bridge.assert_called_once_with('read')

    def test_intake_edit_route_updates_an_existing_dose(self):
        with patch('app.api.routes.meds.exchange', return_value={'id': 8}) as bridge:
            body = {**self.payload, 'dose_id': 8}
            self.assertEqual(self.client.patch('/api/meds/vyvanse/intake', json=body).json(), {'id': 8})
            from app.schemas.meds import MedsIntakeEdit
            bridge.assert_called_once_with('edit-intake', payload=MedsIntakeEdit.model_validate(body).model_dump(mode='json'))
            self.assertEqual(self.client.patch('/api/meds/vyvanse/intake', json={**body, 'dose_id': True}).status_code, 422)

    def test_undo_route_validates_target_and_expected_time(self):
        body = {'kind': 'onset', 'dose_id': 8, 'expected_at': self.payload['taken_at']}
        with patch('app.api.routes.meds.exchange', return_value={'id': 8}) as bridge:
            self.assertEqual(self.client.post('/api/meds/vyvanse/undo', json=body).status_code, 200)
            self.assertEqual(bridge.call_args.args, ('undo',))
            for patch_body in [{'kind': 'all'}, {'dose_id': True}, {'expected_at': '2026-01-01T12:00:00'}, {'medication_id': 9}]:
                self.assertEqual(self.client.post('/api/meds/vyvanse/undo', json={**body, **patch_body}).status_code, 422)
            self.assertEqual(bridge.call_count, 1)

    def undo_remote(self, kind, *, own=True, changed=False, linked=False):
        at = datetime.fromisoformat(self.payload['taken_at'])
        queries, commits = [], []
        class Cursor:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def execute(self, sql, args): self.sql = sql; queries.append((sql, args))
            def fetchone(self):
                if 'SELECT EXISTS' in self.sql: return (linked,)
                if 'FROM medication_response_events' in self.sql: return (9, at)
                return (8, at, 30) if own else None
            def fetchall(self): return [(10, 11, at.date(), at.time(), 'ignis')]
        class Connection(Cursor):
            def cursor(self): return Cursor()
            def commit(self): commits.append(True)
        service = types.SimpleNamespace(medication_id_for_slug=lambda slug: 7, get_medication=lambda mid: ({'id': 7}, None), db=Connection)
        output = io.StringIO()
        body = {'kind': kind, 'dose_id': 8, 'expected_at': (at + timedelta(minutes=1) if changed else at).isoformat(), 'dose_mg': 30}
        with patch.dict(sys.modules, {'services': types.SimpleNamespace(medications=service)}), patch('sys.stdin', io.StringIO(json.dumps({'action': 'undo', 'payload': body}))), contextlib.redirect_stdout(output):
            exec(REMOTE, {})
        return json.loads(output.getvalue()), queries, commits

    def test_undo_is_scoped_and_rejects_changed_or_linked_records(self):
        for kind in ['intake', 'onset', 'strongest', 'wearing_off']:
            result, queries, commits = self.undo_remote(kind, changed=True)
            self.assertIn('changed', result['error'])
            self.assertFalse(commits)
            self.assertFalse(any(sql.startswith('DELETE') for sql, _ in queries))
            result, queries, commits = self.undo_remote(kind, own=False)
            self.assertEqual(result, {'result': {'id': 8}})
            self.assertFalse(commits)
            self.assertFalse(any(sql.startswith('DELETE') for sql, _ in queries))
        result, queries, commits = self.undo_remote('intake', linked=True)
        self.assertIn('linked stage marks', result['error'])
        self.assertFalse(commits)

    def test_undo_preserves_schedule_audit_and_only_removes_the_chosen_mark(self):
        result, queries, commits = self.undo_remote('intake')
        self.assertEqual(result, {'result': {'id': 8}})
        self.assertEqual(len(commits), 1)
        self.assertTrue(any('UPDATE habit_completions SET reversed_at' in sql for sql, _ in queries))
        self.assertTrue(any('INSERT INTO medication_schedule_occurrence_events' in sql for sql, _ in queries))
        self.assertTrue(any('DELETE FROM medication_schedule_occurrences' in sql for sql, _ in queries))
        self.assertTrue(any('DELETE FROM medication_doses' in sql and args == (8, 7) for sql, args in queries))
        for kind in ['onset', 'strongest', 'wearing_off']:
            result, queries, commits = self.undo_remote(kind)
            self.assertEqual(len(commits), 1)
            deletes = [(sql, args) for sql, args in queries if sql.startswith('DELETE')]
            self.assertEqual(deletes, [('DELETE FROM medication_response_events WHERE id=%s AND medication_id=%s', (9, 7))])

    def test_remote_intake_edit_checks_medication_and_existing_stage_times(self):
        at = datetime.fromisoformat(self.payload['taken_at'])
        for own, event_at, allowed in [(True, at + timedelta(hours=1), True), (False, at + timedelta(hours=1), False), (True, at - timedelta(minutes=1), False), (True, at + timedelta(hours=40), False)]:
            writes = []
            class Cursor:
                def __enter__(self): return self
                def __exit__(self, *args): pass
                def execute(self, sql, args): pass
                def fetchone(self): return (8,) if own else None
                def fetchall(self): return [(event_at,)]
            class Connection(Cursor):
                def cursor(self): return Cursor()
            service = types.SimpleNamespace(
                medication_id_for_slug=lambda slug: 7,
                get_medication=lambda medication_id: ({'id': 7}, None),
                db=Connection, MIN_PHASE_DELAY=timedelta(minutes=5),
                update_dose=lambda dose_id, body: (writes.append((dose_id, body)) or {'id': dose_id}, None),
            )
            output = io.StringIO()
            body = {**self.payload, 'dose_id': 8}
            with patch.dict(sys.modules, {'services': types.SimpleNamespace(medications=service)}), patch('sys.stdin', io.StringIO(json.dumps({'action': 'edit-intake', 'payload': body}))), contextlib.redirect_stdout(output):
                exec(REMOTE, {})
            result = json.loads(output.getvalue())
            self.assertEqual('result' in result, allowed)
            self.assertEqual(len(writes), int(allowed))
            if allowed:
                self.assertEqual(writes[0], (8, {'taken_at': body['taken_at'], 'dose_mg': body['dose_mg']}))

    def test_local_app_enforces_origin_and_host(self):
        from app.main import app
        client = TestClient(app, base_url='http://127.0.0.1:8000')
        with patch('app.api.routes.meds.exchange', return_value={'id': 8}) as bridge:
            self.assertEqual(client.post('/api/meds/vyvanse/intake', json=self.payload).status_code, 403)
            self.assertEqual(client.post('/api/meds/vyvanse/intake', json=self.payload, headers={'Origin': 'https://other.test'}).status_code, 403)
            bridge.assert_not_called()
            self.assertEqual(client.post('/api/meds/vyvanse/intake', json=self.payload, headers={'Origin': 'http://127.0.0.1:5173'}).status_code, 200)
