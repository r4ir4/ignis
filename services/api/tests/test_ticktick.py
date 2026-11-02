import asyncio
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient
from app.main import app
from app import ticktick


class TickTickTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.patch = patch.object(ticktick, 'PRIVATE', Path(self.directory.name))
        self.patch.start()
        ticktick.pending.clear()
        self.client = TestClient(app, base_url='http://127.0.0.1:8000')

    def tearDown(self):
        self.patch.stop()
        self.directory.cleanup()

    def test_status_never_returns_tokens(self):
        ticktick.save('tokens.json', {'access_token': 'private-token', 'expires_at': time.time() + 3600})
        response = self.client.get('/api/ticktick/status')
        self.assertTrue(response.json()['connected'])
        self.assertNotIn('private-token', response.text)
        self.assertEqual((ticktick.PRIVATE / 'tokens.json').stat().st_mode & 0o777, 0o600)

    def test_login_requests_provider_required_scope_with_pkce(self):
        ticktick.save('client.json', {'client_id': 'local-client'})
        response = self.client.get('/api/ticktick/connect', follow_redirects=False)
        self.assertEqual(response.status_code, 307)
        url = response.headers['location']
        self.assertIn('scope=tasks%3Aread+tasks%3Awrite', url)
        self.assertIn('code_challenge_method=S256', url)
        self.assertIn('HttpOnly', response.headers['set-cookie'])
        self.assertIn('ignis_ticktick_state', response.headers['set-cookie'])

    def test_callback_rejects_wrong_state_without_token_exchange(self):
        with patch.object(ticktick.httpx, 'AsyncClient') as http:
            result = self.client.get('/api/ticktick/callback?state=wrong&code=private')
        self.assertEqual(result.status_code, 400)
        http.assert_not_called()

    def test_token_exchange_explicitly_requests_authorized_scopes(self):
        state = 'valid-state'
        ticktick.pending[state] = {'verifier': 'proof', 'expires': time.time() + 600}
        ticktick.save('client.json', {'client_id': 'local-client'})
        result = type('Response', (), {'status_code': 200, 'json': lambda self: {'access_token': 'private-token', 'scope': 'tasks:read tasks:write', 'expires_in': 1000}})()
        with patch.object(ticktick.httpx.AsyncClient, 'post', new=AsyncMock(return_value=result)) as post:
            self.client.cookies.set('ignis_ticktick_state', state)
            response = self.client.get('/api/ticktick/callback?state=valid-state&code=private', follow_redirects=False)
        self.assertEqual(response.status_code, 307)
        self.assertEqual(post.call_args.kwargs['data']['scope'], 'tasks:read tasks:write')
        self.assertEqual(post.call_args.kwargs['data']['code_verifier'], 'proof')
        self.assertNotIn('private-token', response.text)

    def test_expired_session_preserves_previous_import(self):
        ticktick.save('tokens.json', {'access_token': 'secret', 'expires_at': 0})
        ticktick.save('import.json', {'old': 'keep'})
        result = self.client.post('/api/ticktick/import', headers={'origin': ticktick.ORIGIN})
        self.assertEqual(result.status_code, 401)
        self.assertEqual(ticktick.load('import.json'), {'old': 'keep'})

    def test_other_origin_cannot_import_ticktick(self):
        result = self.client.post('/api/ticktick/import', headers={'origin': 'https://foreign.example'})
        self.assertEqual(result.status_code, 403)

    def test_rpc_blocks_writes_before_contacting_ticktick(self):
        http = AsyncMock()
        with self.assertRaises(ticktick.HTTPException) as raised:
            asyncio.run(ticktick.rpc(http, {}, 'tools/call', {'name': 'complete_task', 'arguments': {}}))
        self.assertEqual(raised.exception.status_code, 403)
        http.post.assert_not_called()

    def test_import_reads_all_categories_and_keeps_focus_types_distinct(self):
        ticktick.save('tokens.json', {'access_token': 'secret', 'expires_at': time.time() + 3600})
        called = []
        async def rpc(http, headers, method, params=None):
            name, args = params['name'], params['arguments']
            called.append(name)
            self.assertIn(name, ticktick.READ_TOOLS)
            if name == 'list_projects':
                value = {'result': [{'id': 'project', 'name': 'Tasks'}, {'id': 'inbox', 'name': 'Inbox'}]}
            elif name == 'get_project_with_undone_tasks':
                value = {'tasks': [{'id': 'task', 'projectId': args['project_id'], 'title': 'Work', 'repeatFlag': 'RRULE:FREQ=DAILY', 'status': 0}]}
            elif name == 'list_completed_tasks_by_date':
                value = {'result': [{'id': 'done', 'title': 'Completed', 'status': 2}]}
            elif name == 'list_habits':
                value = {'result': [{'id': 'habit', 'name': 'Read', 'goal': 1}]}
            elif name == 'get_habit_checkins':
                self.assertEqual(args['habit_ids'], ['habit'])
                value = {'result': [{'habitId': 'habit', 'checkins': [{'id': 'checkin', 'stamp': args['to_stamp'], 'status': 2}]}]}
            else:
                self.assertIn(args['type'], [0, 1])
                value = {'result': [{'id': 'focus', 'type': args['type'], 'duration': 60000}]}
            return {'structuredContent': value}
        tools = [{'name': name} for name in ticktick.READ_TOOLS]
        with patch.object(ticktick, 'begin', new=AsyncMock(return_value=({}, tools))), patch.object(ticktick, 'rpc', side_effect=rpc):
            result = self.client.post('/api/ticktick/import', headers={'origin': ticktick.ORIGIN})
        self.assertEqual(result.status_code, 200)
        data = result.json()
        self.assertEqual(len(data['tasks']), 2)
        self.assertEqual(data['tasks'][0]['repeatFlag'], 'RRULE:FREQ=DAILY')
        self.assertEqual(len(data['focuses']), 2)
        self.assertEqual(len(data['habits']), 1)
        self.assertEqual(len(data['checkins']), 1)
        self.assertEqual(called.count('get_project_with_undone_tasks'), 2)
        self.assertEqual(ticktick.load('import.json'), data)

    def test_failed_import_keeps_last_snapshot(self):
        ticktick.save('tokens.json', {'access_token': 'secret', 'expires_at': time.time() + 3600})
        original = {'tasks': [{'id': 'old'}], 'importedAt': 0}
        ticktick.save('import.json', original)
        with patch.object(ticktick, 'begin', new=AsyncMock(side_effect=ticktick.HTTPException(502, 'Provider unavailable'))):
            response = self.client.post('/api/ticktick/import', headers={'origin': ticktick.ORIGIN})
        self.assertEqual(response.status_code, 502)
        self.assertEqual(ticktick.load('import.json'), original)

    def test_payload_rejects_provider_error_instead_of_returning_empty_data(self):
        with self.assertRaises(ticktick.HTTPException):
            ticktick.payload({'isError': True, 'content': []})
        with self.assertRaises(ticktick.HTTPException):
            ticktick.payload({'structuredContent': {'error': 'provider error'}})
        self.assertEqual(ticktick.payload({'structuredContent': {'result': []}}), [])

    def test_fresh_import_is_reused_across_tabs(self):
        ticktick.save('tokens.json', {'access_token': 'secret', 'expires_at': time.time() + 3600})
        original = {'tasks': [], 'importedAt': time.time()}
        ticktick.save('import.json', original)
        with patch.object(ticktick, 'begin', new=AsyncMock()) as begin:
            response = self.client.post('/api/ticktick/import', headers={'origin': ticktick.ORIGIN})
        self.assertEqual(response.json(), original)
        begin.assert_not_called()

    def test_write_tools_are_not_allowed(self):
        self.assertTrue(all(not name.startswith(('create_', 'update_', 'delete_', 'complete_', 'upsert_')) for name in ticktick.READ_TOOLS))


if __name__ == '__main__':
    unittest.main()
