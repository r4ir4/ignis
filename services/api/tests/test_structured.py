import json
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient
from app import main


class StructuredTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.private = patch.object(main, 'PRIVATE', Path(self.directory.name))
        self.private.start()
        main.pending.clear()
        self.client = TestClient(main.app, base_url='http://127.0.0.1:8000')

    def tearDown(self):
        self.private.stop()
        self.directory.cleanup()

    def test_status_does_not_expose_credentials(self):
        main.save_file('tokens.json', {'access_token': 'secret', 'expires_at': time.time() + 3600})
        response = self.client.get('/api/structured/status')
        self.assertTrue(response.json()['connected'])
        self.assertNotIn('secret', response.text)
        self.assertEqual((main.PRIVATE / 'tokens.json').stat().st_mode & 0o777, 0o600)

    def test_foreign_origin_cannot_import(self):
        response = self.client.post('/api/structured/import', headers={'origin': 'https://foreign.example'})
        self.assertEqual(response.status_code, 403)

    def test_oauth_bad_state_never_exchanges_code(self):
        with patch.object(main.httpx, 'AsyncClient') as http:
            response = self.client.get('/api/structured/callback?code=private&state=wrong')
        self.assertEqual(response.status_code, 400)
        http.assert_not_called()

    def test_oauth_pkce_and_http_only_cookie(self):
        main.save_file('client.json', {'client_id': 'test-client'})
        response = self.client.get('/api/structured/connect', follow_redirects=False)
        self.assertEqual(response.status_code, 307)
        self.assertIn('code_challenge_method=S256', response.headers['location'])
        self.assertIn('scope=email', response.headers['location'])
        self.assertIn('HttpOnly', response.headers['set-cookie'])
        self.assertNotIn('verifier=', response.headers['location'])

    def test_import_never_calls_mutation_tools_and_preserves_provider_data(self):
        main.save_file('tokens.json', {'access_token': 'secret', 'expires_at': time.time() + 3600})
        tools = [{'name': name, 'inputSchema': {}} for name in ['get_today', 'get_inbox', 'list_tasks', 'create_task', 'complete_task', 'delete_task', 'create_recurring_task']]
        original = {'content': [{'type': 'text', 'text': json.dumps([{'id': None, 'title': 'Morning routine', 'recurring_id': 'series-id', 'day': '2026-10-13', 'is_recurring': True}])}]}
        async def rpc(http, headers, method, params=None, request_id=1):
            if method == 'initialize': return {}
            if method == 'tools/list': return {'tools': tools}
            self.assertIn(params['name'], main.READ_TOOLS)
            if params['name'] == 'get_inbox':
                return {'content': [{'type': 'text', 'text': 'No tasks in inbox.'}]}
            return original
        with patch.object(main, 'rpc', side_effect=rpc), patch.object(main.httpx.AsyncClient, 'post', new=AsyncMock(return_value=type('Response', (), {'status_code': 202})())):
            response = self.client.post('/api/structured/import', headers={'origin': main.ORIGIN})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['sources'][0]['result'], original)
        self.assertEqual(main.read_file('import.json')['sources'][0]['result'], original)

    def test_occurrence_identity_preserves_days_and_deduplicates_same_day(self):
        first = {'recurring_id': 'series', 'day': '2026-10-13', 'id': None, 'title': 'wake'}
        second = {**first, 'day': '2026-10-14'}
        tasks = main.merge_tasks([first, second, first])
        self.assertEqual(len(tasks), 2)
        self.assertEqual(tasks, [first, second])

    def test_unknown_provider_response_fails_instead_of_clearing_tasks(self):
        with self.assertRaises(main.HTTPException):
            main.provider_tasks({'content': [{'type': 'text', 'text': 'Provider unavailable'}]})
        self.assertEqual(main.provider_tasks({'content': [{'type': 'text', 'text': 'No tasks in inbox.'}]}), [])

    def test_capped_week_is_split_into_days(self):
        main.save_file('tokens.json', {'access_token': 'secret', 'expires_at': time.time() + 3600})
        split_days = []
        async def rpc(http, headers, method, params=None, request_id=1):
            if method == 'initialize': return {}
            if method == 'tools/list':
                return {'tools': [{'name': name} for name in ['get_today', 'get_inbox', 'list_tasks']]}
            name, args = params['name'], params['arguments']
            if name == 'list_tasks' and args['day_from'] != args['day_to']:
                rows = [{'id': str(i), 'title': 'capped'} for i in range(200)]
            elif name == 'list_tasks':
                split_days.append(args['day_from'])
                rows = [{'id': args['day_from'], 'day': args['day_from'], 'title': 'daily'}]
            else:
                rows = []
            return {'content': [{'type': 'text', 'text': json.dumps(rows)}]}
        with patch.object(main, 'rpc', side_effect=rpc), patch.object(main.httpx.AsyncClient, 'post', new=AsyncMock(return_value=type('Response', (), {'status_code': 202})())):
            response = self.client.post('/api/structured/import', headers={'origin': main.ORIGIN})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()['tasks']), 31)
        self.assertEqual(len(set(split_days)), 31)
        self.assertEqual(response.json()['warnings'], [])

    def test_simultaneous_tab_import_reuses_fresh_snapshot(self):
        main.save_file('tokens.json', {'access_token': 'secret', 'expires_at': time.time() + 3600})
        snapshot = {'tasks': [], 'routines': [], 'importedAt': time.time()}
        main.save_file('import.json', snapshot)
        with patch.object(main, 'rpc', new=AsyncMock()) as rpc:
            response = self.client.post('/api/structured/import', headers={'origin': main.ORIGIN})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), snapshot)
        rpc.assert_not_called()

    def test_unconnected_import_preserves_previous_snapshot(self):
        main.save_file('import.json', {'old': 'kept'})
        response = self.client.post('/api/structured/import', headers={'origin': main.ORIGIN})
        self.assertEqual(response.status_code, 401)
        self.assertEqual(main.read_file('import.json'), {'old': 'kept'})


if __name__ == '__main__':
    unittest.main()
