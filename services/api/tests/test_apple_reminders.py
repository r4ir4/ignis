import asyncio
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient
from app.main import app
from app import apple_reminders as apple


class AppleRemindersTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.patch = patch.object(apple, 'PRIVATE', Path(self.directory.name))
        self.patch.start()
        self.client = TestClient(app, base_url='http://127.0.0.1:8000')

    def tearDown(self):
        self.patch.stop()
        self.directory.cleanup()

    def latest(self, data):
        (apple.PRIVATE / 'latest.json').write_text(__import__('json').dumps(data))

    def test_identity_completion_and_date_only_deadline_are_preserved(self):
        active = {'id': 'list:one', 'listId': 'list', 'completed': False, 'dueDay': '2026-10-13', 'recurring': True}
        done = {'id': 'list:two', 'listId': 'list', 'completed': True, 'completedAt': '2026-10-12T12:00:00Z'}
        data = apple.validated({'connected': True, 'lists': [], 'reminders': [active, done, active]})
        self.assertEqual(data['reminders'], [active, done])

    def test_denied_import_retains_previous_snapshot(self):
        old = {'reminders': [{'id': 'old'}], 'importedAt': 0}
        apple.save(old)
        self.latest({'connected': False})
        result = self.client.post('/api/apple-reminders/import', headers={'origin': 'http://127.0.0.1:5173'})
        self.assertEqual(result.status_code, 403)
        self.assertEqual(apple.read('import.json'), old)

    def test_failed_export_retains_previous_snapshot(self):
        old = {'reminders': [{'id': 'old'}], 'importedAt': 0}
        apple.save(old)
        self.latest({'connected': True})
        with patch.object(apple, 'export', new=AsyncMock(side_effect=apple.HTTPException(502, 'Helper failed'))):
            result = self.client.post('/api/apple-reminders/import', headers={'origin': 'http://127.0.0.1:5173'})
        self.assertEqual(result.status_code, 502)
        self.assertEqual(apple.read('import.json'), old)

    def test_cached_export_is_reused(self):
        snapshot = {'lists': [], 'reminders': [], 'connected': True, 'importedAt': time.time()}
        apple.save(snapshot); self.latest(snapshot)
        with patch.object(apple, 'export', new=AsyncMock()) as export:
            result = self.client.post('/api/apple-reminders/import', headers={'origin': 'http://127.0.0.1:5173'})
        self.assertEqual(result.json(), snapshot)
        export.assert_not_called()
        self.assertEqual((apple.PRIVATE / 'import.json').stat().st_mode & 0o777, 0o600)

    def test_foreign_origin_cannot_launch_native_helper(self):
        with patch.object(apple, 'export', new=AsyncMock()) as export:
            result = self.client.post('/api/apple-reminders/connect', headers={'origin': 'https://foreign.example'})
        self.assertEqual(result.status_code, 403)
        export.assert_not_called()

    def test_invalid_completion_status_cannot_replace_good_data(self):
        with self.assertRaises(apple.HTTPException):
            apple.validated({'connected': True, 'lists': [], 'reminders': [{'id': 'test', 'listId': 'list', 'completed': 'false'}]})


if __name__ == '__main__':
    unittest.main()
