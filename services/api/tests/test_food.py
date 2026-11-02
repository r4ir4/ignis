import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4
from fastapi.testclient import TestClient
from app.main import app
from app import food

class FoodTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.patch = patch.object(food, 'PRIVATE', Path(self.directory.name)); self.patch.start()
        self.client = TestClient(app, base_url='http://127.0.0.1:8000')
        self.headers = {'origin': 'http://127.0.0.1:5173'}
    def tearDown(self): self.patch.stop(); self.directory.cleanup()
    def meal(self): return {'id': str(uuid4()), 'name': 'Lunch', 'food': 'Rice and beans', 'notes': '', 'date': '2026-10-13', 'time': '12:30', 'calories': None, 'protein': None, 'carbs': None, 'fat': None}
    def put(self, data): return self.client.put('/api/food', headers=self.headers, json=data)
    def test_plan_and_log_are_separate_and_survive_reload(self):
        plan = self.meal()
        log = {**self.meal(), 'planId': plan['id']}
        response = self.put({'revision': 0, 'plans': [plan], 'logs': [log], 'savedMeals': []})
        self.assertEqual(response.status_code, 200)
        saved = self.client.get('/api/food').json()
        self.assertEqual(saved['revision'], 1)
        self.assertEqual(saved['plans'], [plan]); self.assertEqual(saved['logs'], [log])
        self.assertEqual((food.PRIVATE / 'records.json').stat().st_mode & 0o777, 0o600)
    def test_removing_plan_preserves_linked_eating_history(self):
        plan = self.meal(); log = {**self.meal(), 'planId': plan['id']}
        self.put({'revision': 0, 'plans': [plan], 'logs': [log]})
        result = self.put({'revision': 1, 'plans': [], 'logs': [log]}).json()
        self.assertEqual(result['plans'], []); self.assertEqual(result['logs'], [log])
    def test_editing_template_preserves_existing_copies(self):
        plan = self.meal(); reusable = {'id': str(uuid4()), 'name': 'Lunch', 'food': plan['food'], 'notes': ''}
        self.put({'revision': 0, 'plans': [plan], 'savedMeals': [reusable]})
        result = self.put({'revision': 1, 'plans': [plan], 'savedMeals': [{**reusable, 'food': 'Soup'}]}).json()
        self.assertEqual(result['plans'][0]['food'], 'Rice and beans')
    def test_stale_tab_cannot_overwrite_newer_records(self):
        self.put({'revision': 0, 'plans': [self.meal()]})
        result = self.put({'revision': 0, 'plans': []})
        self.assertEqual(result.status_code, 409)
        self.assertEqual(len(self.client.get('/api/food').json()['plans']), 1)
    def test_corrupt_file_is_not_reset_or_overwritten(self):
        (food.PRIVATE / 'records.json').write_text('corrupt original')
        self.assertEqual(self.client.get('/api/food').status_code, 500)
        self.assertEqual(self.put({'revision': 0}).status_code, 500)
        self.assertEqual((food.PRIVATE / 'records.json').read_text(), 'corrupt original')
    def test_invalid_time_or_blank_food_does_not_save(self):
        for replacement in [{'time': '25:00'}, {'food': '   '}, {'date': 'invalid'}]:
            self.assertEqual(self.put({'revision': 0, 'plans': [{**self.meal(), **replacement}]}).status_code, 422)
        self.assertFalse((food.PRIVATE / 'records.json').exists())
    def test_duplicate_ids_rejected(self):
        meal = self.meal()
        self.assertEqual(self.put({'revision': 0, 'plans': [meal, meal]}).status_code, 422)
    def test_nutrition_values_persist_and_zero_is_not_missing(self):
        meal = {**self.meal(), 'calories': 450.5, 'protein': 20.25, 'carbs': 50.0, 'fat': 0}
        response = self.put({'revision': 0, 'logs': [{**meal, 'planId': None}]})
        self.assertEqual(response.status_code, 200)
        saved = self.client.get('/api/food').json()['logs'][0]
        self.assertEqual(saved['calories'], 450.5)
        self.assertEqual(saved['protein'], 20.25)
        self.assertEqual(saved['fat'], 0)

    def test_legacy_records_load_unknown_nutrition_without_overwriting(self):
        meal = self.meal()
        for key in ('calories', 'protein', 'carbs', 'fat'): del meal[key]
        original = json.dumps({'revision': 1, 'plans': [meal], 'logs': [], 'savedMeals': []})
        (food.PRIVATE / 'records.json').write_text(original)
        loaded = self.client.get('/api/food').json()['plans'][0]
        self.assertIsNone(loaded['calories'])
        self.assertEqual((food.PRIVATE / 'records.json').read_text(), original)

    def test_negative_or_nonfinite_nutrition_is_rejected(self):
        for values in ({'calories': -1}, {'protein': 'NaN'}, {'fat': 'Infinity'}, {'carbs': -0.1}):
            self.assertEqual(self.put({'revision': 0, 'plans': [{**self.meal(), **values}]}).status_code, 422)
        self.assertFalse((food.PRIVATE / 'records.json').exists())

    def test_other_origin_cannot_write_food(self):
        response = self.client.put('/api/food', headers={'origin': 'https://foreign.example'}, json={'revision': 0})
        self.assertEqual(response.status_code, 403)

if __name__ == '__main__': unittest.main()
