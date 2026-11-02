import copy
import os
from pathlib import Path
import unittest
from uuid import uuid4
from datetime import date, datetime, timezone
from unittest.mock import patch
from concurrent.futures import ThreadPoolExecutor
from alembic import command
from alembic.config import Config
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text, select, delete
from sqlalchemy.orm import Session
from app.db import notebook as db
from app.models.habits import Habit, HabitCompletion, HabitSettings
from app.services import habits
from app.services.habit_import import import_habits
from app.api.routes import habits as routes

ROOT = Path(__file__).resolve().parents[1]
def fixture():
    base = {'name': 'A Read', 'section': 'Mind', 'status': 'active', 'cadence': 'daily', 'target_count': 1, 'moment': None, 'start_date': '2026-10-01', 'created_at': '2026-10-01T10:00:00+00:00', 'updated_at': '2026-10-01T10:00:00+00:00', 'archived_at': None, 'cycle': None}
    event = {'id': 1, 'habit_id': 1, 'period_key': '2026-10-18', 'completed_at': '2026-10-18T10:00:00+00:00', 'source': 'manual', 'reversed_at': None}
    return {'profile': {'timezone': 'America/Sao_Paulo', 'day_start': '04:00:00'}, 'habits': [{'id': 1, **base}, {'id': 2, **base, 'name': 'B Medication', 'medication_slug': 'example'}, {'id': 3, **base, 'name': 'Old habit', 'status': 'archived', 'archived_at': '2026-10-10T10:00:00+00:00'}], 'completions': [event, {**event, 'id': 2, 'period_key': '2026-10-17', 'reversed_at': '2026-10-17T11:00:00+00:00'}, {**event, 'id': 3, 'habit_id': 3, 'period_key': '2026-10-09'}]}

class NativeHabitsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.name = 'ignis_native_habits_test_' + uuid4().hex[:10]
        cls.admin = create_engine(db.engine().url.set(database='postgres'), isolation_level='AUTOCOMMIT')
        with cls.admin.connect() as conn: conn.execute(text(f'CREATE DATABASE {cls.name}'))
        url = db.engine().url.set(database=cls.name)
        with patch.dict(os.environ, {'IGNIS_DATABASE_URL': url.render_as_string(hide_password=False)}):
            db.engine.cache_clear(); command.upgrade(Config(str(ROOT / 'alembic.ini')), 'head'); cls.engine = db.engine()
        db.engine.cache_clear()
    @classmethod
    def tearDownClass(cls):
        cls.engine.dispose()
        with cls.admin.connect() as conn: conn.execute(text(f'DROP DATABASE {cls.name}'))
        cls.admin.dispose()
    def setUp(self):
        with Session(self.engine) as s, s.begin():
            for model in [HabitCompletion, Habit, HabitSettings]: s.execute(delete(model))
            self.manifest = import_habits(s, fixture())
        self.day = patch.object(habits, 'owner_day', return_value=date(2026,10,18)); self.day.start(); self.addCleanup(self.day.stop)
    def change(self, action, body):
        with Session(self.engine) as s, s.begin(): return habits.change(s, action, body)
    def mark(self, id, expected, desired):
        return {'habit_id': id, 'date': '2026-10-18', 'period_key': '2026-10-18', 'expected_count': expected, 'desired_count': desired}
    def test_complete_import_and_idempotent_cutover(self):
        self.assertEqual(self.manifest['habits'], 3); self.assertEqual(self.manifest['completions'], 3); self.assertEqual(self.manifest['live_completions'], 2)
        with Session(self.engine) as s:
            current = habits.snapshot(s); self.assertEqual(len(current['habits']), 2); self.assertEqual(current['habits'][0]['completed_count'], 1)
            self.assertEqual(s.get(HabitCompletion, 'raira:2').payload, fixture()['completions'][1])
        self.change('mark', self.mark(2,0,1))
        with Session(self.engine) as s, s.begin():
            again = import_habits(s, fixture()); self.assertTrue(again['already_imported']); self.assertEqual(habits.snapshot(s)['habits'][1]['completed_count'], 1)
    def test_mark_retry_undo_and_linked_habits_are_native(self):
        body=self.mark(2,0,1)
        self.assertEqual(self.change('mark',body)['habits'][1]['completed_count'],1)
        self.change('mark',body)
        self.change('mark',self.mark(2,1,0))
        with Session(self.engine) as s:
            events = list(s.scalars(select(HabitCompletion).where(HabitCompletion.habit_id==2)))
            self.assertEqual(len(events),1); self.assertEqual(events[0].payload['source'],'ignis'); self.assertTrue(events[0].payload['reversed_at'])
        with self.assertRaises(HTTPException): self.change('mark',self.mark(1,0,0))
    def test_concurrent_duplicate_checkins_only_create_one_event(self):
        with ThreadPoolExecutor(max_workers=2) as pool: list(pool.map(lambda _: self.change('mark', self.mark(2,0,1)), range(2)))
        with Session(self.engine) as s: self.assertEqual(len(list(s.scalars(select(HabitCompletion).where(HabitCompletion.habit_id==2)))),1)
    def test_edit_archive_preserve_history_and_reject_stale(self):
        config={key:fixture()['habits'][0][key] for key in habits.CONFIG}
        self.change('edit', {'habit_id':1,'expected':config,**config,'name':'Read books'})
        with self.assertRaises(HTTPException): self.change('archive',{'habit_id':1,'expected':config})
        self.change('archive',{'habit_id':1,'expected':{**config,'name':'Read books'}})
        with Session(self.engine) as s:
            self.assertEqual(s.get(Habit,1).payload['status'],'archived'); self.assertIsNotNone(s.get(HabitCompletion,'raira:1'))
    def test_period_boundaries_rest_days_and_owner_day(self):
        self.day.stop()
        self.assertEqual(habits.owner_day(fixture()['profile'],datetime(2026,10,18,5,tzinfo=timezone.utc)),date(2026,10,17))
        self.assertEqual(habits.period_key('weekly',date(2026,10,18)),date(2026,10,12))
        self.assertEqual(habits.previous('monthly',date(2026,1,1)),date(2025,12,1))
        self.assertTrue(habits.rest_day({'cadence':'daily','cycle':{'days':28,'active':21,'started':'2026-10-01'}},date(2026,10,22)))
    def test_historical_day_checkin_undo_and_date_guards(self):
        body = {**self.mark(1, 0, 1), 'date': '2026-10-16', 'period_key': '2026-10-16'}
        result = self.change('mark', body)
        habit = result['habits'][0]
        self.assertEqual(habit['completed_count'], 1)
        self.assertEqual(next(p['count'] for p in habit['history'] if p['date'] == '2026-10-16'), 1)
        self.change('mark', body)  # duplicate request must not add another mark
        self.change('mark', {**body, 'expected_count': 1, 'desired_count': 0})
        with Session(self.engine) as s:
            events = [e for e in s.scalars(select(HabitCompletion)) if e.payload['period_key'] == '2026-10-16']
            self.assertEqual(len(events), 1)
            self.assertIsNotNone(events[0].payload['reversed_at'])
            self.assertIsNone(s.get(HabitCompletion, 'raira:1').payload['reversed_at'])
        for day in ['2026-09-30', '2026-10-19']:
            with self.assertRaises(HTTPException):
                self.change('mark', {**body, 'date': day, 'period_key': day})
        with Session(self.engine) as s, s.begin():
            row = s.get(Habit, 2); row.payload = {**row.payload, 'medication_slug': 'vyvanse'}
        with self.assertRaises(HTTPException):
            self.change('mark', {**body, 'habit_id': 2})

    def test_native_routes_and_old_bridge_not_registered(self):
        app=FastAPI();app.include_router(routes.router)
        with patch.object(routes,'engine',return_value=self.engine),patch.object(routes,'backup_daily'):
            client=TestClient(app); self.assertEqual(client.get('/api/habits').status_code,200)
            self.assertEqual(client.post('/api/habits/mark',json=self.mark(2,0,1)).status_code,200)
            self.assertEqual(client.post('/api/habits/mark',json={**self.mark(2,1,0),'habit_id':True}).status_code,422)
        from app.main import app as local
        self.assertNotIn('/api/raira/habits/mark',local.openapi()['paths'])
