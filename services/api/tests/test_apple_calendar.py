import asyncio
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient
from app.main import app
from app import apple_calendar as apple


class AppleCalendarTests(unittest.TestCase):
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

    def test_calendar_occurrences_and_all_day_dates_are_preserved(self):
        first = {'id': 'calendar:series:2026-10-13', 'calendarId': 'calendar', 'allDay': True, 'startDay': '2026-10-13', 'endDay': '2026-10-14'}
        second = {**first, 'id': 'calendar:series:2026-10-14', 'startDay': '2026-10-14', 'endDay': '2026-10-15'}
        data = apple.validated({'connected': True, 'calendars': [], 'events': [first, second, first]})
        self.assertEqual(data['events'], [first, second])

    def test_denied_import_retains_previous_snapshot(self):
        old = {'events': [{'id': 'old'}], 'importedAt': 0}
        apple.save(old)
        self.latest({'connected': False})
        result = self.client.post('/api/apple-calendar/import', headers={'origin': 'http://127.0.0.1:5173'})
        self.assertEqual(result.status_code, 403)
        self.assertEqual(apple.read('import.json'), old)

    def test_failed_export_retains_previous_snapshot(self):
        old = {'events': [{'id': 'old'}], 'importedAt': 0}
        apple.save(old)
        self.latest({'connected': True})
        with patch.object(apple, 'export', new=AsyncMock(side_effect=apple.HTTPException(502, 'Helper failed'))):
            result = self.client.post('/api/apple-calendar/import', headers={'origin': 'http://127.0.0.1:5173'})
        self.assertEqual(result.status_code, 502)
        self.assertEqual(apple.read('import.json'), old)

    def test_cached_export_is_reused(self):
        snapshot = {'calendars': [], 'events': [], 'connected': True, 'importedAt': time.time()}
        apple.save(snapshot); self.latest(snapshot)
        with patch.object(apple, 'export', new=AsyncMock()) as export:
            result = self.client.post('/api/apple-calendar/import', headers={'origin': 'http://127.0.0.1:5173'})
        self.assertEqual(result.json(), snapshot)
        export.assert_not_called()
        self.assertEqual((apple.PRIVATE / 'import.json').stat().st_mode & 0o777, 0o600)

    def test_foreign_origin_cannot_launch_native_helper(self):
        with patch.object(apple, 'export', new=AsyncMock()) as export:
            result = self.client.post('/api/apple-calendar/connect', headers={'origin': 'https://foreign.example'})
        self.assertEqual(result.status_code, 403)
        export.assert_not_called()

    def test_malformed_event_cannot_replace_good_data(self):
        with self.assertRaises(apple.HTTPException):
            apple.validated({'connected': True, 'calendars': [], 'events': [{'title': 'Missing identity'}]})


if __name__ == '__main__':
    unittest.main()
