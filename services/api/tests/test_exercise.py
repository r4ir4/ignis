import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4
from fastapi.testclient import TestClient
from app.main import app
from app import exercise

class ExerciseTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.patch = patch.object(exercise, 'PRIVATE', Path(self.directory.name)); self.patch.start()
        self.client = TestClient(app, base_url='http://127.0.0.1:8000')
        self.headers = {'origin': 'http://127.0.0.1:5173'}
    def tearDown(self): self.patch.stop(); self.directory.cleanup()
    def workout(self):
        return {'id': str(uuid4()), 'name': 'Upper body', 'activity': 'Strength session', 'notes': '', 'durationMinutes': 40, 'distanceKm': None, 'exercises': [{'id': str(uuid4()), 'name': 'Row', 'sets': 3, 'reps': 10, 'weightKg': 20}], 'date': '2026-10-13', 'time': '16:00'}
    def put(self, state): return self.client.put('/api/exercise', headers=self.headers, json=state)
    def test_plan_is_not_a_completed_session_and_records_survive_reload(self):
        plan = self.workout()
        response = self.put({'revision': 0, 'plans': [plan]})
        self.assertEqual(response.status_code, 200)
        stored = self.client.get('/api/exercise').json()
        self.assertEqual(stored['plans'], [plan]); self.assertEqual(stored['logs'], [])
        self.assertEqual((exercise.PRIVATE / 'records.json').stat().st_mode & 0o777, 0o600)
    def test_removing_plan_keeps_linked_actual_workout(self):
        plan = self.workout(); log = {**self.workout(), 'planId': plan['id'], 'durationMinutes': 35}
        self.put({'revision': 0, 'plans': [plan], 'logs': [log]})
        result = self.put({'revision': 1, 'plans': [], 'logs': [log]}).json()
        self.assertEqual(result['logs'], [log])
    def test_template_edit_cannot_change_copied_exercise_results(self):
        plan = self.workout(); saved = {k: v for k, v in plan.items() if k not in ('date', 'time')}
        saved['id'] = str(uuid4())
        log = {**plan, 'id': str(uuid4()), 'planId': plan['id']}
        self.put({'revision': 0, 'plans': [plan], 'logs': [log], 'savedWorkouts': [saved]})
        changed = {**saved, 'exercises': [{**saved['exercises'][0], 'weightKg': 25}]}
        result = self.put({'revision': 1, 'plans': [plan], 'logs': [log], 'savedWorkouts': [changed]}).json()
        self.assertEqual(result['logs'][0]['exercises'][0]['weightKg'], 20)
        self.assertEqual(result['savedWorkouts'][0]['exercises'][0]['weightKg'], 25)
    def test_stale_revision_preserves_newer_sessions(self):
        self.put({'revision': 0, 'plans': [self.workout()]})
        self.assertEqual(self.put({'revision': 0}).status_code, 409)
        self.assertEqual(len(self.client.get('/api/exercise').json()['plans']), 1)
    def test_invalid_duration_or_set_numbers_do_not_save(self):
        for changes in ({'durationMinutes': -1}, {'distanceKm': 'NaN'}, {'exercises': [{'id': str(uuid4()), 'name': 'Row', 'sets': 1.5}]}, {'exercises': [{'id': str(uuid4()), 'name': 'Row', 'weightKg': -1}]}):
            self.assertEqual(self.put({'revision': 0, 'plans': [{**self.workout(), **changes}]}).status_code, 422)
        self.assertFalse((exercise.PRIVATE / 'records.json').exists())
    def test_duplicate_exercise_row_ids_are_rejected(self):
        plan = self.workout(); plan['exercises'] *= 2
        self.assertEqual(self.put({'revision': 0, 'plans': [plan]}).status_code, 422)
    def test_corrupt_records_cannot_be_overwritten(self):
        (exercise.PRIVATE / 'records.json').write_text('original corrupt data')
        self.assertEqual(self.put({'revision': 0}).status_code, 500)
        self.assertEqual((exercise.PRIVATE / 'records.json').read_text(), 'original corrupt data')
    def test_foreign_origin_cannot_write_exercise_records(self):
        result = self.client.put('/api/exercise', headers={'origin': 'https://foreign.example'}, json={'revision': 0})
        self.assertEqual(result.status_code, 403)

if __name__ == '__main__': unittest.main()
