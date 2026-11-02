import unittest
from unittest.mock import AsyncMock, patch
import httpx
from fastapi.testclient import TestClient
from app.notebook_main import create_app

ORIGIN = 'https://staging.ignis.farm'
OWNER = 'rairarocks@gmail.com'

class NotebookAuthenticationTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app(ORIGIN, OWNER, 'http://ignis-auth-1:3000/api/auth/traefik', 'staging')
        self.client = TestClient(self.app, base_url=ORIGIN)

    def identity(self, status=200, email=OWNER):
        response = httpx.Response(status, headers={'Remote-Email': email})
        client = AsyncMock()
        client.get.return_value = response
        client.__aenter__.return_value = client
        return client

    def test_missing_session_and_spoofed_identity_never_reach_database(self):
        with patch('app.notebook_main.engine') as db:
            for route in ['/api/notebook', '/api/notebook/pages/11111111-1111-4111-8111-111111111111/history', '/api/notebook/session', '/api/notebook/cover-images/' + '0' * 64 + '.webp', '/api/notebook/inbox', '/api/notebook/reminders?pageId=11111111-1111-4111-8111-111111111111', '/openapi.json']:
                result = self.client.get(route, headers={'Remote-Email': OWNER, 'X-Forwarded-Host': 'ignis.farm'})
                self.assertEqual(result.status_code, 401)
                self.assertEqual(result.headers['cache-control'], 'no-store')
            db.assert_not_called()

    def test_cover_upload_requires_session_and_same_origin(self):
        self.assertEqual(self.client.post('/api/notebook/cover-images', content=b'fake', headers={'Origin': ORIGIN}).status_code, 401)
        self.assertEqual(self.client.post('/api/notebook/cover-images', content=b'fake', headers={'Cookie': 'session=opaque', 'Origin': 'https://other.example'}).status_code, 403)

    def test_owner_is_verified_by_auth_service_not_client_headers(self):
        auth = self.identity()
        with patch('app.notebook_main.httpx.AsyncClient', return_value=auth):
            result = self.client.get('/api/notebook/session', headers={'Cookie': 'session=opaque', 'Remote-Email': 'someone@else.test', 'X-Forwarded-Host': 'evil.test'})
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()['environment'], 'staging')
        forwarded = auth.get.call_args.kwargs['headers']
        self.assertEqual(forwarded['X-Forwarded-Host'], 'staging.ignis.farm')
        self.assertNotIn('Remote-Email', forwarded)
        self.assertEqual(forwarded['Cookie'], 'session=opaque')

    def test_other_account_empty_identity_expired_login_and_auth_outage_fail_closed(self):
        for status, email, expected in [(200, 'other@example.test', 403), (200, '', 403), (302, OWNER, 401), (401, OWNER, 401), (403, OWNER, 403), (500, OWNER, 503)]:
            with self.subTest(status=status, email=email), patch('app.notebook_main.httpx.AsyncClient', return_value=self.identity(status, email)):
                self.assertEqual(self.client.get('/api/notebook/session', headers={'Cookie': 'session=opaque', 'Remote-Email': OWNER}).status_code, expected)
        auth = self.identity()
        auth.get.side_effect = httpx.ConnectError('unavailable')
        with patch('app.notebook_main.httpx.AsyncClient', return_value=auth):
            self.assertEqual(self.client.get('/api/notebook/session', headers={'Cookie': 'session=opaque'}).status_code, 503)

    def test_cross_origin_writes_and_wrong_host_are_rejected_before_authentication(self):
        with patch('app.notebook_main.httpx.AsyncClient') as auth:
            for headers in [{'Origin': 'https://evil.test'}, {}, {'Origin': ORIGIN, 'Host': 'evil.test'}]:
                self.assertEqual(self.client.put('/api/notebook', headers={'Cookie': 'session=opaque', **headers}, json={'revision': 0, 'pages': []}).status_code, 403)
            for path, method in [('/api/notebook/reminders', 'post'), ('/api/notebook/inbox/read', 'post'), ('/api/notebook/inbox/11111111-1111-4111-8111-111111111111', 'patch')]:
                self.assertEqual(getattr(self.client, method)(path, headers={'Cookie': 'session=opaque', 'Origin': 'https://evil.test'}, json={}).status_code, 403)
            auth.assert_not_called()

    def test_health_requires_notification_migration(self):
        from unittest.mock import MagicMock
        connection = MagicMock()
        connection.execute.side_effect = [MagicMock(), RuntimeError('missing notification table')]
        database = MagicMock()
        database.connect.return_value.__enter__.return_value = connection
        with patch('app.notebook_main.engine', return_value=database):
            self.assertEqual(self.client.get('/healthz').status_code, 503)
        self.assertIn('notebook_notifications', str(connection.execute.call_args.args[0]))

    def test_hosted_app_excludes_local_integrations(self):
        with patch('app.notebook_main.httpx.AsyncClient', return_value=self.identity()):
            for route in ['/api/structured/status', '/api/notes', '/api/watch', '/api/food']:
                self.assertEqual(self.client.get(route, headers={'Cookie': 'session=opaque'}).status_code, 404)

    def test_hosted_contract_declares_session_auth_on_every_exposed_operation(self):
        schema = self.app.openapi()
        self.assertEqual(schema['components']['securitySchemes']['IgnisSession']['name'], 'Cookie')
        for operations in schema['paths'].values():
            for operation in operations.values():
                self.assertEqual(operation['security'], [{'IgnisSession': []}])
