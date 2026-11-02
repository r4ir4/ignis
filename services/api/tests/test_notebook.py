import os
import tempfile
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4
from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from app.db import notebook as db
from app.api.routes import notebook as routes

ROOT = Path(__file__).resolve().parents[1]

class NotebookTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.name = 'ignis_notebook_test_' + uuid4().hex[:12]
        cls.admin = create_engine(db.engine().url.set(database='postgres'), isolation_level='AUTOCOMMIT')
        with cls.admin.connect() as connection:
            connection.execute(text(f'CREATE DATABASE {cls.name}'))
        url = db.engine().url.set(database=cls.name)
        with patch.dict(os.environ, {'IGNIS_DATABASE_URL': url.render_as_string(hide_password=False)}):
            db.engine.cache_clear()
            command.upgrade(Config(str(ROOT / 'alembic.ini')), 'head')
            cls.engine = db.engine()
        db.engine.cache_clear()
        cls.patch_engine = patch.object(routes, 'engine', lambda: cls.engine)
        cls.patch_engine.start()
        cls.patch_backup = patch.object(routes, 'backup_daily', lambda: None)
        cls.patch_backup.start()
        app = FastAPI()
        app.include_router(routes.router)
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls):
        cls.patch_backup.stop(); cls.patch_engine.stop(); cls.engine.dispose()
        with cls.admin.connect() as connection:
            connection.execute(text(f'DROP DATABASE {cls.name}'))
        cls.admin.dispose()

    def setUp(self):
        with self.engine.begin() as connection:
            connection.execute(text('DELETE FROM notebook_notifications'))
            connection.execute(text('DELETE FROM notebook_history'))
            connection.execute(text('DELETE FROM notebook_pages'))
            connection.execute(text('UPDATE notebook_workspaces SET revision=0'))
        self.page = {'id': str(uuid4()), 'title': 'A page', 'parentId': None, 'content': {'type': 'doc', 'content': [{'type': 'paragraph', 'content': [{'type': 'text', 'text': 'Preserve me', 'marks': [{'type': 'bold'}]}]}]}, 'favorite': False, 'deletedAt': None}

    def save(self, pages=None, revision=0):
        return self.client.put('/api/notebook', json={'revision': revision, 'pages': pages if pages is not None else [self.page]})

    def test_mood_journal_roundtrip_repaint_clear_and_lock(self):
        self.page['moods'] = [{'date': '2026-10-18', 'mood': 'happy'}]
        self.assertEqual(self.save().status_code, 200)
        self.page['moods'][0]['mood'] = 'sad'
        self.assertEqual(self.save(revision=1).status_code, 200)
        self.assertEqual(self.client.get('/api/notebook').json()['pages'][0]['moods'], self.page['moods'])
        self.page['moods'].append({'date': '2026-10-18', 'mood': 'angry'})
        self.assertEqual(self.save(revision=2).status_code, 422)
        self.page['moods'] = []
        self.page['locked'] = True
        self.assertEqual(self.save(revision=2).status_code, 200)
        self.page['moods'] = [{'date': '2026-10-18', 'mood': 'excited'}]
        self.assertEqual(self.save(revision=3).status_code, 422)
        self.assertEqual(self.client.get('/api/notebook').json()['pages'][0]['moods'], [])

    def test_reading_journal_persists_edits_and_lock(self):
        book = {'id': str(uuid4()), 'title': 'Coraline', 'alreadyReadPages': 100, 'author': '', 'rating': 4, 'source': 'borrowed', 'color': '#cf729d'}
        entry = {'id': str(uuid4()), 'bookId': book['id'], 'date': '2026-10-18', 'pages': 40}
        self.page['reading'] = {'books': [book], 'entries': [entry]}
        saved = self.save()
        self.assertEqual(saved.status_code, 200, saved.text)
        self.assertEqual(self.client.get('/api/notebook').json()['pages'][0]['reading'], self.page['reading'])
        entry['pages'] = 60
        self.assertEqual(self.save(revision=1).status_code, 200)
        self.page['locked'] = True
        self.assertEqual(self.save(revision=2).status_code, 200)
        entry['pages'] = 80
        self.assertEqual(self.save(revision=3).status_code, 422)
        self.assertEqual(self.client.get('/api/notebook').json()['pages'][0]['reading']['entries'][0]['pages'], 60)

    def test_habit_history_roundtrip_noop_archive_and_lock(self):
        habit = {'id': str(uuid4()), 'title': 'Read', 'createdOn': '2026-10-01', 'completions': ['2026-10-17'], 'archived': False}
        self.page.update(kind='habits', habits=[habit], content={'type': 'doc', 'content': [{'type': 'viewBlock', 'attrs': {'view': 'dashboard', 'source': 'list', 'title': '', 'query': '', 'filter': 'all', 'sort': 'title', 'group': 'status'}}]})
        saved = self.save()
        self.assertEqual(saved.status_code, 200, saved.text)
        self.assertEqual(saved.json()['pages'][0]['habits'], [habit])
        self.assertEqual(self.save(revision=1).json()['revision'], 1)
        habit['completions'].append('2026-10-18')
        saved = self.save(revision=1)
        self.assertEqual(saved.status_code, 200, saved.text)
        self.assertEqual(saved.json()['revision'], 2)
        habit['archived'] = True
        self.page['locked'] = True
        self.assertEqual(self.save(revision=2).status_code, 200)
        habit['completions'] = []
        self.assertEqual(self.save(revision=3).status_code, 422)
        loaded = self.client.get('/api/notebook').json()['pages'][0]
        self.assertTrue(loaded['habits'][0]['archived'])
        self.assertEqual(loaded['habits'][0]['completions'], ['2026-10-17', '2026-10-18'])

    def test_invalid_habit_histories_are_rejected(self):
        habit = {'id': str(uuid4()), 'title': 'Read', 'createdOn': '2026-10-01', 'completions': [], 'archived': False}
        for patch in [{'title': ' '}, {'completions': ['2026-02-30']}, {'completions': ['2026-09-30']}, {'completions': ['2026-10-17', '2026-10-17']}, {'archived': 1}]:
            self.page['habits'] = [{**habit, **patch}]
            self.assertEqual(self.save().status_code, 422)
        self.page['habits'] = [habit, habit]
        self.assertEqual(self.save().status_code, 422)

    def test_system_field_and_button_schema_roundtrip(self):
        from app.schemas.notebook import PersonalList
        from pydantic import ValidationError
        item = {'id': str(uuid4()), 'title': 'Task', 'status': 'To do', 'date': None, 'value': None, 'cover': None, 'description': '', 'metadata': {'createdAt': '2026-10-18T12:00:00Z', 'editedAt': '2026-10-18T12:00:00Z', 'number': 1}}
        value = {'id': str(uuid4()), 'name': 'Tasks', 'idCounter': 1, 'items': [item], 'properties': [{'id': str(uuid4()), 'name': 'Run', 'type': 'button', 'options': [], 'config': {'buttonLabel': 'Update', 'steps': [{'action': 'edit', 'targetProperty': 'value', 'value': 25}, {'action': 'complete'}]}}]}
        parsed = PersonalList.model_validate(value)
        self.assertEqual(parsed.items[0].metadata.number, 1)
        self.assertEqual(parsed.properties[0].config.steps[0].value, 25)
        with self.assertRaises(ValidationError):
            PersonalList.model_validate({**value, 'items': [item, {**item, 'id': str(uuid4())}]})
        with self.assertRaises(ValidationError):
            PersonalList.model_validate({**value, 'idCounter': 0})
        value['properties'][0]['config']['steps'][0]['targetProperty'] = 'not-a-property'
        with self.assertRaises(ValidationError):
            PersonalList.model_validate(value)

    def test_task_history_metadata_ignores_page_only_edits(self):
        item_id = str(uuid4())
        self.page['lists'] = [{'id': str(uuid4()), 'name': 'Tasks', 'items': [{'id': item_id, 'title': 'Old task', 'status': 'To do', 'date': None, 'value': None, 'cover': None, 'description': ''}]}]
        first = self.save().json()
        path = f"/api/notebook/pages/{self.page['id']}/task-metadata"
        original = self.client.get(path).json()[item_id]
        self.assertIsNotNone(original['createdAt'])
        self.page['title'] = 'Renamed page'
        self.save(revision=first['revision'])
        self.assertEqual(self.client.get(path).json()[item_id], original)
        self.page['lists'][0]['items'][0]['title'] = 'Changed task'
        saved = self.save(revision=2)
        self.assertEqual(saved.status_code, 200, saved.text)
        edited = self.client.get(path).json()[item_id]
        self.assertEqual(edited['createdAt'], original['createdAt'])
        self.assertNotEqual(edited['editedAt'], original['editedAt'])

    def test_migration_save_read_and_noop_revision(self):
        saved = self.save().json()
        self.assertEqual(saved['revision'], 1)
        loaded = self.client.get('/api/notebook').json()
        self.assertEqual(loaded['pages'], saved['pages'])
        self.assertEqual(loaded['revision'], saved['revision'])
        self.assertEqual(self.save(revision=1).json()['revision'], 1)
        self.assertEqual(saved['pages'][0]['content'], self.page['content'])

    def test_meeting_category_preserves_legacy_pages_and_versions(self):
        self.save()
        # Simulate a page saved before the optional category field existed.
        with self.engine.begin() as connection:
            connection.execute(text("UPDATE notebook_pages SET payload=(payload::jsonb - 'kind')::json"))
        self.assertEqual(self.save(revision=1).json()['revision'], 1)
        self.page['kind'] = 'meeting'
        saved = self.save(revision=1).json()
        self.assertEqual(saved['pages'][0]['kind'], 'meeting')
        self.assertEqual(self.client.get('/api/notebook').json()['pages'][0]['kind'], 'meeting')
        history = self.client.get(f"/api/notebook/pages/{self.page['id']}/history").json()
        self.assertEqual(history[0]['page']['kind'], 'meeting')
        self.page['kind'] = 'invalid'
        self.assertEqual(self.save(revision=2).status_code, 422)

    def test_cover_and_width_roundtrip_history_and_legacy_noop(self):
        self.save()
        with self.engine.begin() as connection:
            connection.execute(text("UPDATE notebook_pages SET payload=(payload::jsonb - 'cover' - 'fullWidth')::json"))
        self.assertEqual(self.save(revision=1).json()['revision'], 1)
        self.page['cover'] = {'url': '/field-notes/meadow.webp', 'position': 30}
        self.page['fullWidth'] = True
        saved = self.save(revision=1).json()
        self.assertEqual(saved['pages'][0]['cover']['position'], 30)
        self.assertTrue(self.client.get('/api/notebook').json()['pages'][0]['fullWidth'])
        self.assertEqual(self.save(revision=2).json()['revision'], 2)
        self.page['cover'] = None
        self.save(revision=2)
        history = self.client.get(f"/api/notebook/pages/{self.page['id']}/history").json()
        self.assertIsNone(history[0]['page']['cover'])
        self.assertEqual(history[1]['page']['cover']['position'], 30)
        for url in ['javascript:alert(1)', 'http://example.com/image.jpg', 'https://user:secret@example.com/image.jpg']:
            self.page['cover'] = {'url': url, 'position': 50}
            self.assertEqual(self.save(revision=3).status_code, 422)

    def test_property_type_change_saves_values_atomically_and_retains_history(self):
        prop_id = str(uuid4())
        task_id = str(uuid4())
        self.page['lists'] = [{'id': str(uuid4()), 'name': 'Tasks', 'properties': [{'id': prop_id, 'name': 'Estimate', 'type': 'text'}], 'items': [{'id': task_id, 'title': 'Keep me', 'status': 'To do', 'properties': {prop_id: '12.5'}}]}]
        self.assertEqual(self.save().status_code, 200)
        self.page['lists'][0]['properties'][0]['type'] = 'number'
        self.assertEqual(self.save(revision=1).status_code, 422)
        self.page['lists'][0]['items'][0]['properties'][prop_id] = 12.5
        converted = self.save(revision=1)
        self.assertEqual(converted.status_code, 200)
        self.assertEqual(converted.json()['pages'][0]['lists'][0]['items'][0]['id'], task_id)
        self.assertEqual(converted.json()['pages'][0]['lists'][0]['items'][0]['properties'][prop_id], 12.5)
        self.assertEqual(self.save(revision=2).json()['revision'], 2)
        versions = self.client.get(f"/api/notebook/pages/{self.page['id']}/history").json()
        self.assertTrue(any(v['page']['lists'][0]['items'][0]['properties'][prop_id] == '12.5' for v in versions))
        self.page['locked'] = True
        self.assertEqual(self.save(revision=2).status_code, 200)
        self.page['lists'][0]['properties'][0]['type'] = 'text'
        self.page['lists'][0]['items'][0]['properties'][prop_id] = '12.5'
        self.assertEqual(self.save(revision=3).status_code, 422)

    def test_advanced_property_config_round_trip_is_a_noop_and_locked_pages_stay_protected(self):
        prop_id = str(uuid4())
        self.page['lists'] = [{'id': str(uuid4()), 'name': 'Tasks', 'properties': [{'id': prop_id, 'name': 'Double', 'type': 'formula', 'config': {'expression': 'prop("Value") * 2'}}], 'items': [{'id': str(uuid4()), 'title': 'Keep me', 'status': 'To do', 'value': 7, 'metadata': {'createdAt': None, 'createdBy': None, 'editedAt': '2026-10-17T12:00:00Z', 'editedBy': 'You'}}]}]
        first = self.save().json()
        self.assertEqual(first['pages'][0]['lists'][0]['properties'][0]['config'], {'expression': 'prop("Value") * 2'})
        self.assertEqual(self.save(revision=first['revision']).json()['revision'], first['revision'])
        self.page['locked'] = True
        locked = self.save(revision=first['revision']).json()
        self.assertEqual(self.save(revision=locked['revision']).json()['revision'], locked['revision'])
        self.page['lists'][0]['properties'][0]['config']['expression'] = '8'
        self.assertEqual(self.save(revision=locked['revision']).status_code, 422)

    def test_attachment_image_preview_is_bounded_raster_and_original_remains_download(self):
        from io import BytesIO
        from PIL import Image
        data = BytesIO()
        Image.new('RGB', (1800, 900), 'red').save(data, 'PNG')
        url = self.client.post('/api/notebook/attachments?filename=photo.png', content=data.getvalue()).json()['url']
        preview = self.client.get(url + '/preview')
        self.assertEqual(preview.status_code, 200, preview.text[:100] if preview.status_code != 200 else '')
        self.assertEqual(preview.headers['content-type'], 'image/webp')
        self.assertEqual(preview.headers['x-content-type-options'], 'nosniff')
        with Image.open(BytesIO(preview.content)) as picture:
            self.assertEqual(picture.size, (1280, 640))
        original = self.client.get(url)
        self.assertEqual(original.content, data.getvalue())
        self.assertIn('attachment;', original.headers['content-disposition'])
        for filename, body in [('unsafe.svg', b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), ('fake.png', b'<html>Not an image</html>')]:
            file_url = self.client.post('/api/notebook/attachments?filename=' + filename, content=body).json()['url']
            self.assertEqual(self.client.get(file_url + '/preview').status_code, 415)
            self.assertIn('attachment;', self.client.get(file_url).headers['content-disposition'])
        self.assertEqual(self.client.get('/api/notebook/attachments/' + '0' * 64 + '/missing.png/preview').status_code, 404)

    def test_task_attachment_round_trip_and_safe_download(self):
        data = b'<html><script>alert(1)</script></html>'
        uploaded = self.client.post('/api/notebook/attachments?filename=notes.html', content=data)
        self.assertEqual(uploaded.status_code, 200)
        url = uploaded.json()['url']
        loaded = self.client.get(url)
        self.assertEqual(loaded.content, data)
        self.assertIn('attachment;', loaded.headers['content-disposition'])
        self.assertEqual(loaded.headers['content-type'], 'application/octet-stream')
        self.assertEqual(loaded.headers['x-content-type-options'], 'nosniff')
        self.assertEqual(self.client.post('/api/notebook/attachments?filename=notes.html', content=data).json()['url'], url)
        self.assertEqual(self.client.post('/api/notebook/attachments?filename=../bad', content=b'test').status_code, 422)
        self.assertEqual(self.client.post('/api/notebook/attachments?filename=big.txt', content=b'a' * (8 * 1024 * 1024 + 1)).status_code, 413)
        self.assertEqual(self.client.get('/api/notebook/attachments/' + '0' * 64 + '/missing.txt').status_code, 404)
        prop_id = str(uuid4())
        self.page['lists'] = [{'id': str(uuid4()), 'name': 'Tasks', 'properties': [{'id': prop_id, 'name': 'Files', 'type': 'files'}], 'items': [{'id': str(uuid4()), 'title': 'Attached', 'status': 'To do', 'properties': {prop_id: [url]}}]}]
        self.assertEqual(self.save().status_code, 200)
        self.assertEqual(self.client.get('/api/notebook').json()['pages'][0]['lists'][0]['items'][0]['properties'][prop_id], [url])

    def test_cover_upload_persists_deduplicates_and_rejects_invalid_files(self):
        from io import BytesIO
        from PIL import Image
        from app.services import cover_images
        image = BytesIO()
        Image.new('RGB', (80, 40), 'green').save(image, 'PNG')
        data = image.getvalue()
        uploaded = self.client.post('/api/notebook/cover-images', content=data, headers={'Content-Type': 'image/png'})
        self.assertEqual(uploaded.status_code, 200)
        url = uploaded.json()['url']
        self.assertEqual(self.client.post('/api/notebook/cover-images', content=data).json()['url'], url)
        loaded = self.client.get(url)
        self.assertEqual(loaded.status_code, 200)
        self.assertEqual(loaded.headers['content-type'], 'image/webp')
        self.assertEqual(loaded.headers['x-content-type-options'], 'nosniff')
        with Image.open(BytesIO(loaded.content)) as normalized:
            self.assertEqual(normalized.size, (80, 40))
        self.page['cover'] = {'url': url, 'position': 30}
        self.assertEqual(self.save().status_code, 200)
        self.assertEqual(self.client.get('/api/notebook').json()['pages'][0]['cover']['url'], url)
        self.page['cover'] = None
        self.save(revision=1)
        history = self.client.get(f"/api/notebook/pages/{self.page['id']}/history").json()
        self.assertEqual(history[1]['page']['cover']['url'], url)
        self.assertEqual(self.client.get(url).status_code, 200)
        for invalid in [b'', b'<svg xmlns="http://www.w3.org/2000/svg"/>', data[:30], b'<html>fake image</html>']:
            self.assertEqual(self.client.post('/api/notebook/cover-images', content=invalid, headers={'Content-Type': 'image/png'}).status_code, 415)
        with patch.object(cover_images, 'MAX_BYTES', 10):
            self.assertEqual(self.client.post('/api/notebook/cover-images', content=data).status_code, 413)
        with patch.object(cover_images, 'MAX_PIXELS', 100):
            self.assertEqual(self.client.post('/api/notebook/cover-images', content=data).status_code, 413)
        self.assertEqual(self.client.get('/api/notebook/cover-images/missing.webp').status_code, 404)
        self.assertEqual(self.client.get('/api/notebook/cover-images/' + '0' * 64 + '.webp').status_code, 404)

    def test_wide_default_and_existing_page_migration_preserve_content_and_history(self):
        self.assertTrue(self.save().json()['pages'][0]['fullWidth'])
        self.page['fullWidth'] = False
        self.save(revision=1)
        config = Config(str(ROOT / 'alembic.ini'))
        with patch.dict(os.environ, {'IGNIS_DATABASE_URL': self.engine.url.render_as_string(hide_password=False)}):
            db.engine.cache_clear()
            command.downgrade(config, '0003_cover_images')
            command.upgrade(config, 'head')
            db.engine().dispose()
        db.engine.cache_clear()
        loaded = self.client.get('/api/notebook').json()
        self.assertEqual(loaded['revision'], 3)
        self.assertTrue(loaded['pages'][0]['fullWidth'])
        self.assertEqual(loaded['pages'][0]['content'], self.page['content'])
        versions = self.client.get(f"/api/notebook/pages/{self.page['id']}/history").json()
        self.assertTrue(versions[0]['page']['fullWidth'])
        self.assertFalse(versions[1]['page']['fullWidth'])
        # A deliberate narrow preference after migration stays available.
        self.assertFalse(self.save(revision=3).json()['pages'][0]['fullWidth'])

    def test_appearance_settings_roundtrip_and_remain_in_history(self):
        self.save()
        with self.engine.begin() as connection:
            connection.execute(text("UPDATE notebook_pages SET payload=(payload::jsonb - 'font' - 'smallText')::json"))
        self.assertEqual(self.save(revision=1).json()['revision'], 1)
        self.page.update(font='serif', smallText=True)
        self.assertEqual(self.save(revision=1).status_code, 200)
        loaded = self.client.get('/api/notebook').json()['pages'][0]
        self.assertEqual(loaded['font'], 'serif')
        self.assertTrue(loaded['smallText'])
        self.assertEqual(loaded['content'], self.page['content'])
        history = self.client.get(f"/api/notebook/pages/{self.page['id']}/history").json()
        self.assertEqual(history[0]['page']['font'], 'serif')
        self.page['font'] = 'invalid'
        self.assertEqual(self.save(revision=2).status_code, 422)

    def test_lock_persists_and_blocks_edits_until_explicitly_unlocked(self):
        self.save()
        self.page['locked'] = True
        self.assertEqual(self.save(revision=1).status_code, 200)
        loaded = self.client.get('/api/notebook').json()['pages'][0]
        self.assertTrue(loaded['locked'])
        self.assertEqual(self.save(revision=2).json()['revision'], 2)
        for patch_value in [
            {'title': 'Accidental edit'},
            {'content': {'type': 'doc', 'content': [{'type': 'paragraph'}]}},
            {'icon': 'emoji:🌱'}, {'cover': {'url': '/field-notes/meadow.webp', 'position': 50}},
            {'font': 'serif'}, {'smallText': True}, {'fullWidth': False},
        ]:
            rejected = self.save(pages=[{**self.page, **patch_value}], revision=2)
            self.assertEqual(rejected.status_code, 422)
            self.assertIn('Unlock', rejected.json()['detail'])
        self.assertEqual(self.client.get('/api/notebook').json()['pages'][0]['content'], self.page['content'])
        self.page['locked'] = False
        self.assertEqual(self.save(revision=2).status_code, 200)
        self.page['title'] = 'Intentional edit'
        self.assertEqual(self.save(revision=3).status_code, 200)
        versions = self.client.get(f"/api/notebook/pages/{self.page['id']}/history").json()
        self.assertTrue(versions[2]['page']['locked'])

    def test_block_colors_roundtrip_history_and_validation(self):
        attrs = {'textColor': 'blue', 'backgroundColor': 'yellow'}
        self.page['content']['content'][0]['attrs'] = attrs.copy()
        self.assertEqual(self.save().status_code, 200)
        loaded = self.client.get('/api/notebook').json()['pages'][0]
        self.assertEqual(loaded['content']['content'][0]['attrs'], attrs)
        self.assertEqual(loaded['content']['content'][0]['content'], self.page['content']['content'][0]['content'])
        self.page['content']['content'][0]['attrs']['textColor'] = None
        self.assertEqual(self.save(revision=1).status_code, 200)
        history = self.client.get(f"/api/notebook/pages/{self.page['id']}/history").json()
        self.assertEqual(history[0]['page']['content']['content'][0]['attrs']['backgroundColor'], 'yellow')
        self.assertEqual(history[1]['page']['content']['content'][0]['attrs']['textColor'], 'blue')
        for invalid in ['url(javascript:bad)', 'not-a-color', ['blue']]:
            self.page['content']['content'][0]['attrs']['textColor'] = invalid
            self.assertEqual(self.save(revision=2).status_code, 422)

    def test_page_icons_save_clear_and_remain_in_history(self):
        self.page['icon'] = 'emoji:🌱'
        self.assertEqual(self.save().status_code, 200)
        self.assertEqual(self.client.get('/api/notebook').json()['pages'][0]['icon'], 'emoji:🌱')
        self.page['icon'] = 'icon:leaf'
        self.assertEqual(self.save(revision=1).status_code, 200)
        self.page['icon'] = None
        self.assertEqual(self.save(revision=2).status_code, 200)
        history = self.client.get(f"/api/notebook/pages/{self.page['id']}/history").json()
        self.assertEqual([v['page']['icon'] for v in history], [None, 'icon:leaf', 'emoji:🌱'])
        self.assertEqual(history[-1]['page']['content'], self.page['content'])
        self.page['icon'] = 'icon:missing'
        self.assertEqual(self.save(revision=3).status_code, 422)
        self.assertEqual(self.client.get('/api/notebook').json()['revision'], 3)

    def notify(self, due=None, request_id=None):
        from datetime import datetime, timezone
        return self.client.post('/api/notebook/reminders', json={'pageId': self.page['id'], 'requestId': request_id or str(uuid4()), 'dueAt': due or datetime.now(timezone.utc).isoformat()})

    def test_inbox_read_archive_reload_and_no_page_revision_changes(self):
        self.save()
        item = self.notify().json()
        loaded = self.client.get('/api/notebook/inbox').json()
        self.assertEqual(loaded['unreadCount'], 1)
        self.assertEqual(loaded['items'][0]['pageId'], self.page['id'])
        url = '/api/notebook/inbox/' + item['id']
        self.assertEqual(self.client.patch(url, json={'read': True}).status_code, 200)
        self.assertEqual(self.client.get('/api/notebook/inbox?status=unread').json()['items'], [])
        self.assertEqual(len(self.client.get('/api/notebook/inbox').json()['items']), 1)
        self.client.patch(url, json={'archived': True})
        self.assertEqual(self.client.get('/api/notebook/inbox').json()['items'], [])
        archived = self.client.get('/api/notebook/inbox?status=archived').json()['items'][0]
        self.assertIsNotNone(archived['readAt'])
        self.client.patch(url, json={'archived': False, 'read': False})
        self.assertEqual(self.client.get('/api/notebook/inbox').json()['unreadCount'], 1)
        self.assertEqual(self.client.get('/api/notebook').json()['revision'], 1)
        self.assertEqual(self.client.patch(url, json={}).status_code, 422)

    def test_scheduled_reminders_retry_and_cancel_without_early_delivery(self):
        from datetime import datetime, timedelta, timezone
        self.save()
        due = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
        key = str(uuid4())
        first = self.notify(due, key)
        self.assertEqual(first.status_code, 200)
        self.assertEqual(self.notify(due, key).json(), first.json())
        self.assertEqual(self.client.get('/api/notebook/inbox').json()['unreadCount'], 0)
        self.assertEqual(len(self.client.get('/api/notebook/reminders', params={'pageId': self.page['id']}).json()), 1)
        self.client.patch('/api/notebook/inbox/' + key, json={'archived': True})
        self.assertEqual(self.client.get('/api/notebook/reminders', params={'pageId': self.page['id']}).json(), [])
        self.assertEqual(self.notify(datetime.now(timezone.utc).isoformat(), key).status_code, 409)
        self.page['deletedAt'] = '2026-10-17T14:00:00Z'
        self.save(revision=1)
        self.assertEqual(self.notify().status_code, 404)
        self.assertEqual(self.notify(due, key).status_code, 200)

    def test_inbox_pagination_and_bulk_read_preserve_notifications_not_in_request(self):
        self.save()
        for _ in range(4):
            self.assertEqual(self.notify().status_code, 200)
        first = self.client.get('/api/notebook/inbox?limit=2').json()
        second = self.client.get('/api/notebook/inbox', params={'limit': 2, 'cursor': first['nextCursor']}).json()
        ids = [n['id'] for n in first['items'] + second['items']]
        self.assertEqual(len(set(ids)), 4)
        self.assertIsNone(second['nextCursor'])
        self.client.post('/api/notebook/inbox/read', json={'ids': ids[:2]})
        self.assertEqual(self.client.get('/api/notebook/inbox').json()['unreadCount'], 2)
        self.assertEqual(self.client.get('/api/notebook/inbox?kind=workspace').json()['items'], [])

    def test_inbox_validation_rejects_bad_time_and_unknown_records(self):
        self.save()
        self.assertEqual(self.notify('2026-10-17T12:00:00').status_code, 422)
        self.assertEqual(self.notify('2100-01-01T00:00:00Z').status_code, 422)
        self.assertEqual(self.client.patch('/api/notebook/inbox/' + str(uuid4()), json={'read': True}).status_code, 404)
        self.assertEqual(self.client.get('/api/notebook/inbox?status=invalid').status_code, 422)

    def test_backup_alerts_are_durable_and_deduplicated(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(routes, 'DATA', Path(folder)):
            marker = Path(folder) / 'backups/backup-error.txt'
            marker.parent.mkdir()
            marker.write_text('backup failed')
            first = self.client.get('/api/notebook/inbox').json()
            again = self.client.get('/api/notebook/inbox').json()
            self.assertEqual(len(first['items']), 1)
            self.assertEqual(first, again)
            marker.unlink()
            self.assertEqual(self.client.get('/api/notebook/inbox').json()['items'], first['items'])

    def test_stale_save_never_overwrites_or_adds_history(self):
        self.save()
        self.page['title'] = 'Stale'
        self.assertEqual(self.save().status_code, 409)
        self.assertEqual(self.client.get('/api/notebook').json()['pages'][0]['title'], 'A page')
        history = self.client.get(f"/api/notebook/pages/{self.page['id']}/history").json()
        self.assertEqual(len(history), 1)

    def test_cycles_missing_parents_and_unsupported_nodes_are_rejected(self):
        self.page['parentId'] = self.page['id']
        self.assertEqual(self.save().status_code, 422)
        self.page['parentId'] = str(uuid4())
        self.assertEqual(self.save().status_code, 422)
        self.page['parentId'] = None
        self.page['content'] = {'type': 'doc', 'content': [{'type': 'script'}]}
        self.assertEqual(self.save().status_code, 422)
        self.assertEqual(self.client.get('/api/notebook').json()['revision'], 0)

    def test_omitted_pages_cannot_be_hard_deleted(self):
        self.save()
        self.assertEqual(self.save([], revision=1).status_code, 422)
        self.assertEqual(len(self.client.get('/api/notebook').json()['pages']), 1)

    def test_trash_restore_and_version_recovery_preserve_content(self):
        self.save()
        self.page['deletedAt'] = '2026-10-17T14:00:00Z'
        self.assertEqual(self.save(revision=1).json()['revision'], 2)
        self.page['deletedAt'] = None
        self.page['title'] = 'Restored'
        self.save(revision=2)
        history = self.client.get(f"/api/notebook/pages/{self.page['id']}/history").json()
        self.assertEqual([v['revision'] for v in history], [3, 2, 1])
        self.assertEqual(history[-1]['page']['content'], self.page['content'])
        self.assertIsNone(self.client.get('/api/notebook').json()['pages'][0]['deletedAt'])

    def test_two_concurrent_writers_cannot_both_save_same_revision(self):
        self.save()
        barrier = threading.Barrier(2)
        def writer(title):
            page = {**self.page, 'title': title}
            barrier.wait()
            return self.save([page], revision=1).status_code
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(writer, ['Left tab', 'Right tab']))
        self.assertEqual(sorted(results), [200, 409])
        self.assertEqual(self.client.get('/api/notebook').json()['revision'], 2)

    def test_backup_failures_are_reported_without_losing_saved_pages(self):
        self.save()
        with tempfile.TemporaryDirectory() as directory, patch.object(routes, 'DATA', Path(directory)):
            backups = Path(directory) / 'backups'
            backups.mkdir()
            (backups / 'backup-error.txt').write_text('failed')
            response = self.client.get('/api/notebook').json()
            self.assertIn('backup', response['backupWarning'])
            self.assertEqual(response['pages'][0]['content'], self.page['content'])

    def test_full_database_dump_restores_into_independent_database(self):
        import subprocess
        self.save()
        from io import BytesIO
        from PIL import Image
        image = BytesIO(); Image.new('RGB', (16, 16), 'blue').save(image, 'PNG')
        asset_url = self.client.post('/api/notebook/cover-images', content=image.getvalue()).json()['url']
        asset_bytes = self.client.get(asset_url).content
        notification = self.notify().json()
        self.client.patch('/api/notebook/inbox/' + notification['id'], json={'read': True, 'archived': True})
        restored_name = 'ignis_notebook_restore_' + uuid4().hex[:12]
        url = self.engine.url
        binary = Path('/opt/homebrew/opt/postgresql@18/bin')
        connection = ['-h', url.query['host'], '-p', url.query['port']]
        with self.admin.connect() as connection_db:
            connection_db.execute(text(f'CREATE DATABASE {restored_name}'))
        restored = create_engine(url.set(database=restored_name))
        try:
            with tempfile.TemporaryDirectory() as directory:
                dump = str(Path(directory) / 'backup.dump')
                subprocess.run([str(binary / 'pg_dump'), *connection, '-d', self.name, '-Fc', '-f', dump], check=True)
                subprocess.run([str(binary / 'pg_restore'), *connection, '-d', restored_name, dump], check=True)
                with restored.connect() as restored_connection:
                    title = restored_connection.execute(text("SELECT payload->>'title' FROM notebook_pages")).scalar()
                    self.assertEqual(title, 'A page')
                    self.assertEqual(restored_connection.execute(text('SELECT data FROM notebook_cover_images WHERE id=:id'), {'id': asset_url.rsplit('/', 1)[1][:-5]}).scalar(), asset_bytes)
                    self.assertEqual(restored_connection.execute(text('SELECT count(*) FROM notebook_history')).scalar(), 1)
                    self.assertEqual(restored_connection.execute(text('SELECT count(*) FROM notebook_notifications WHERE read_at IS NOT NULL AND archived_at IS NOT NULL')).scalar(), 1)
        finally:
            restored.dispose()
            with self.admin.connect() as connection_db:
                connection_db.execute(text(f'DROP DATABASE {restored_name}'))

    def test_personal_lists_save_history_noop_and_lock(self):
        item = {'id': str(uuid4()), 'title': 'My own item', 'status': 'To do', 'date': '2026-10-17', 'value': 25, 'description': 'Keep me', 'cover': None}
        collection = {'id': str(uuid4()), 'name': 'My items', 'items': [item]}
        self.save()
        self.assertEqual(self.save(revision=1).json()['revision'], 1)
        self.page['lists'] = [collection]
        saved = self.save(revision=1)
        self.assertEqual(saved.status_code, 200)
        self.assertEqual(saved.json()['pages'][0]['lists'][0]['items'][0]['value'], 25)
        self.assertEqual(self.save(revision=2).json()['revision'], 2)
        self.page['locked'] = True
        self.save(revision=2)
        self.page['lists'][0]['items'][0]['title'] = 'Blocked'
        rejected = self.save(revision=3)
        self.assertEqual(rejected.status_code, 422)
        self.assertEqual(self.client.get('/api/notebook').json()['pages'][0]['lists'][0]['items'][0]['title'], 'My own item')
        versions = self.client.get(f"/api/notebook/pages/{self.page['id']}/history").json()
        self.assertTrue(any(version['page'].get('lists') for version in versions))

    def test_rich_task_notes_save_reopen_history_and_lock(self):
        body = {'type': 'doc', 'content': [{'type': 'bulletList', 'content': [{'type': 'listItem', 'content': [{'type': 'paragraph', 'content': [{'type': 'text', 'text': 'Keep formatting', 'marks': [{'type': 'bold'}]}]}]}]}]}
        item = {'id': str(uuid4()), 'title': 'Rich notes', 'status': 'To do', 'description': 'Keep formatting', 'descriptionContent': body}
        self.page['lists'] = [{'id': str(uuid4()), 'name': 'Tasks', 'items': [item]}]
        saved = self.save()
        self.assertEqual(saved.status_code, 200, saved.text)
        self.assertEqual(self.client.get('/api/notebook').json()['pages'][0]['lists'][0]['items'][0]['descriptionContent'], body)
        self.assertEqual(self.save(revision=1).json()['revision'], 1)
        self.page['locked'] = True
        self.assertEqual(self.save(revision=1).status_code, 200)
        item['descriptionContent'] = {'type': 'doc', 'content': [{'type': 'paragraph'}]}
        self.assertEqual(self.save(revision=2).status_code, 422)
        versions = self.client.get(f"/api/notebook/pages/{self.page['id']}/history").json()
        self.assertTrue(any(v['page'].get('lists', [{}])[0].get('items', [{}])[0].get('descriptionContent') == body for v in versions))

    def test_rich_task_notes_reject_invalid_documents(self):
        for body in [{'type': 'paragraph'}, {'type': 'doc', 'content': [{'type': 'script'}]}, {'type': 'doc', 'content': [{'type': 'text', 'text': 'x' * 1_000_001}]}]:
            self.page['lists'] = [{'id': str(uuid4()), 'name': 'Tasks', 'items': [{'id': str(uuid4()), 'title': 'Task', 'status': 'To do', 'descriptionContent': body}]}]
            self.assertEqual(self.save().status_code, 422)

    def test_task_property_display_saves_history_noop_and_lock(self):
        prop = str(uuid4())
        self.page['lists'] = [{'id': str(uuid4()), 'name': 'Tasks', 'properties': [{'id': prop, 'name': 'Priority', 'type': 'text'}], 'propertyDisplay': {'value': {'name': 'Estimate', 'visibility': 'empty'}, prop: {'visibility': 'hidden'}}, 'items': [{'id': str(uuid4()), 'title': 'Keep', 'status': 'To do', 'value': 0, 'properties': {prop: 'High'}}]}]
        saved = self.save()
        self.assertEqual(saved.status_code, 200, saved.text)
        self.assertEqual(self.save(revision=1).json()['revision'], 1)
        current = self.client.get('/api/notebook').json()['pages'][0]['lists'][0]
        self.assertEqual(current['propertyDisplay']['value']['name'], 'Estimate')
        self.assertEqual(current['items'][0]['value'], 0)
        self.assertEqual(current['items'][0]['properties'][prop], 'High')
        self.page['locked'] = True
        self.assertEqual(self.save(revision=1).status_code, 200)
        self.page['lists'][0]['propertyDisplay'][prop]['visibility'] = 'always'
        self.assertEqual(self.save(revision=2).status_code, 422)

    def test_task_property_display_rejects_unknown_fields_and_duplicate_names(self):
        prop = str(uuid4())
        for settings in [{'unknown': {'visibility': 'hidden'}}, {'value': {'name': 'Priority'}}, {prop: {'name': 'Override'}}, {'value': {'visibility': 'sometimes'}}]:
            self.page['lists'] = [{'id': str(uuid4()), 'name': 'Tasks', 'properties': [{'id': prop, 'name': 'Priority', 'type': 'text'}], 'propertyDisplay': settings}]
            self.assertEqual(self.save().status_code, 422)

    def test_number_property_display_saves_without_changing_numeric_values(self):
        prop = str(uuid4())
        settings = {'showAs': 'ring', 'color': 'green', 'divideBy': 100, 'showNumber': False}
        self.page['lists'] = [{'id': str(uuid4()), 'name': 'Tasks', 'properties': [{'id': prop, 'name': 'Progress', 'type': 'number'}], 'propertyDisplay': {'value': {'number': settings}, prop: {'number': settings}}, 'items': [{'id': str(uuid4()), 'title': 'Task', 'status': 'To do', 'value': 42, 'properties': {prop: -25.5}}]}]
        saved = self.save()
        self.assertEqual(saved.status_code, 200, saved.text)
        current = self.client.get('/api/notebook').json()['pages'][0]['lists'][0]
        self.assertEqual(current['propertyDisplay']['value']['number'], settings)
        self.assertEqual(current['items'][0]['value'], 42)
        self.assertEqual(current['items'][0]['properties'][prop], -25.5)
        self.assertEqual(self.save(revision=1).json()['revision'], 1)
        self.page['locked'] = True
        self.assertEqual(self.save(revision=1).status_code, 200)
        self.page['lists'][0]['propertyDisplay']['value']['number'] = {**settings, 'showAs': 'bar'}
        self.assertEqual(self.save(revision=2).status_code, 422)

    def test_number_property_display_rejects_invalid_configuration(self):
        valid = {'showAs': 'bar', 'color': 'green', 'divideBy': 100, 'showNumber': True}
        for change in [{'divideBy': 0}, {'divideBy': -1}, {'divideBy': True}, {'divideBy': 1e13}, {'showAs': 'pie'}, {'color': '#fff'}, {'showNumber': 'false'}]:
            self.page['lists'] = [{'id': str(uuid4()), 'name': 'Tasks', 'propertyDisplay': {'value': {'number': {**valid, **change}}}}]
            self.assertEqual(self.save().status_code, 422)

    def test_status_groups_colors_and_defaults_persist_and_lock(self):
        prop = str(uuid4())
        config = {'statusGroups': {'Backlog': 'todo', 'Review': 'in-progress', 'Shipped': 'complete'}, 'defaultStatus': 'Backlog', 'optionColors': {'Review': 'default', 'Shipped': 'purple'}}
        self.page['lists'] = [{'id': str(uuid4()), 'name': 'Tasks', 'properties': [{'id': prop, 'name': 'Workflow', 'type': 'status', 'options': ['Backlog', 'Review', 'Shipped'], 'config': config}], 'items': [{'id': str(uuid4()), 'title': 'Task', 'status': 'To do', 'properties': {prop: 'Review'}}]}]
        result = self.save()
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(self.client.get('/api/notebook').json()['pages'][0]['lists'][0]['properties'][0]['config'], config)
        self.assertEqual(self.save(revision=1).json()['revision'], 1)
        self.page['locked'] = True
        self.assertEqual(self.save(revision=1).status_code, 200)
        config['statusGroups']['Review'] = 'complete'
        self.assertEqual(self.save(revision=2).status_code, 422)

    def test_status_groups_reject_unknown_options_groups_and_defaults(self):
        for config in [{'statusGroups': {'Missing': 'todo'}}, {'statusGroups': {'Done': 'invalid'}}, {'defaultStatus': 'Missing'}]:
            self.page['lists'] = [{'id': str(uuid4()), 'name': 'Tasks', 'properties': [{'id': str(uuid4()), 'name': 'Workflow', 'type': 'status', 'options': ['Done'], 'config': config}]}]
            self.assertEqual(self.save().status_code, 422)

    def test_board_column_groups_persist_without_changing_stable_status_ids(self):
        column = 'column:' + str(uuid4())
        board = {'order': ['To do', column], 'columns': {'To do': {'name': 'Backlog', 'color': 'gray'}, column: {'name': 'Shipped', 'color': 'purple', 'group': 'complete'}}}
        self.page['lists'] = [{'id': str(uuid4()), 'name': 'Tasks', 'board': board, 'items': [{'id': str(uuid4()), 'title': 'Task', 'status': column}]}]
        result = self.save()
        self.assertEqual(result.status_code, 200, result.text)
        current = self.client.get('/api/notebook').json()['pages'][0]['lists'][0]
        self.assertEqual(current['board'], board)
        self.assertEqual(current['items'][0]['status'], column)
        self.assertEqual(self.save(revision=1).json()['revision'], 1)
        board['columns'][column]['group'] = 'invalid'
        self.assertEqual(self.save(revision=1).status_code, 422)

    def test_select_option_colors_sort_persist_noop_and_lock(self):
        prop = str(uuid4())
        config = {'optionColors': {'High': 'red', 'Low': 'green'}, 'optionSort': 'descending'}
        self.page['lists'] = [{'id': str(uuid4()), 'name': 'Tasks', 'properties': [{'id': prop, 'name': 'Priority', 'type': 'select', 'options': ['High', 'Low'], 'config': config}], 'items': [{'id': str(uuid4()), 'title': 'Task', 'status': 'To do', 'properties': {prop: 'High'}}]}]
        result = self.save()
        self.assertEqual(result.status_code, 200, result.text)
        current = self.client.get('/api/notebook').json()['pages'][0]['lists'][0]
        self.assertEqual(current['properties'][0]['config'], config)
        self.assertEqual(current['items'][0]['properties'][prop], 'High')
        self.assertEqual(self.save(revision=1).json()['revision'], 1)
        self.page['locked'] = True
        self.assertEqual(self.save(revision=1).status_code, 200)
        self.page['lists'][0]['properties'][0]['config']['optionSort'] = 'manual'
        self.assertEqual(self.save(revision=2).status_code, 422)

    def test_select_option_colors_reject_unknown_options_colors_and_sort(self):
        for config in [{'optionColors': {'Missing': 'red'}}, {'optionColors': {'High': '#fff'}}, {'optionSort': 'random'}, {'optionColors': []}]:
            self.page['lists'] = [{'id': str(uuid4()), 'name': 'Tasks', 'properties': [{'id': str(uuid4()), 'name': 'Priority', 'type': 'select', 'options': ['High'], 'config': config}]}]
            self.assertEqual(self.save().status_code, 422)

    def test_task_properties_save_history_and_noop(self):
        prop_id = str(uuid4())
        self.page['lists'] = [{'id': str(uuid4()), 'name': 'Tasks', 'properties': [{'id': prop_id, 'name': 'Priority', 'type': 'select', 'options': ['High', 'Low']}], 'items': [{'id': str(uuid4()), 'title': 'Keep me', 'status': 'To do', 'properties': {prop_id: 'High'}}]}]
        saved = self.save()
        self.assertEqual(saved.status_code, 200)
        self.assertEqual(self.save(revision=1).json()['revision'], 1)
        self.page['lists'][0]['properties'][0]['name'] = 'Importance'
        renamed = self.save(revision=1)
        self.assertEqual(renamed.json()['pages'][0]['lists'][0]['items'][0]['properties'][prop_id], 'High')
        self.page['lists'][0]['properties'] = []
        self.page['lists'][0]['items'][0]['properties'] = {}
        self.assertEqual(self.save(revision=2).status_code, 200)
        versions = self.client.get(f"/api/notebook/pages/{self.page['id']}/history").json()
        self.assertTrue(any(v['page'].get('lists', [{}])[0].get('properties') for v in versions))

    def test_custom_board_column_moves_and_history_are_atomic(self):
        status = f'column:{uuid4()}'
        item = {'id': str(uuid4()), 'title': 'Keep my task', 'status': status, 'description': 'Keep details', 'value': 12}
        board = {'order': ['To do', status], 'columns': {'To do': {'name': 'Backlog', 'color': 'gray'}, status: {'name': 'Review', 'color': 'purple'}}}
        self.page['lists'] = [{'id': str(uuid4()), 'name': 'Board', 'items': [item], 'board': board}]
        saved = self.save()
        self.assertEqual(saved.status_code, 200)
        self.assertEqual(self.save(revision=1).json()['revision'], 1)
        self.page['lists'][0]['items'][0]['status'] = 'To do'
        board['order'].remove(status)
        del board['columns'][status]
        moved = self.save(revision=1)
        self.assertEqual(moved.status_code, 200)
        collection = moved.json()['pages'][0]['lists'][0]
        self.assertEqual(collection['board']['order'], ['To do'])
        self.assertEqual(collection['items'][0]['status'], 'To do')
        self.assertEqual(collection['items'][0]['description'], 'Keep details')
        self.assertEqual(collection['items'][0]['value'], 12)
        versions = self.client.get(f"/api/notebook/pages/{self.page['id']}/history").json()
        self.assertTrue(any(status in version['page']['lists'][0]['board']['order'] for version in versions))

class NotebookBackupTests(unittest.TestCase):
    def test_backup_directory_failure_does_not_raise_after_committed_save(self):
        from app.services import notebook_backup as backup
        with tempfile.TemporaryDirectory() as directory:
            blocked = Path(directory) / 'not-a-directory'
            blocked.write_text('blocked')
            with patch.object(backup, 'DATA', blocked):
                backup.backup_daily()
            self.assertEqual(blocked.read_text(), 'blocked')

    def test_failed_dump_keeps_warning_and_removes_private_partial_file(self):
        import subprocess
        from app.services import notebook_backup as backup
        with tempfile.TemporaryDirectory() as directory, patch.object(backup, 'DATA', Path(directory)):
            def fail_dump(args, **kwargs):
                partial = Path(args[-1])
                self.assertEqual(partial.stat().st_mode & 0o777, 0o600)
                partial.write_bytes(b'incomplete')
                raise subprocess.CalledProcessError(1, args)
            with patch.object(backup.subprocess, 'run', side_effect=fail_dump):
                backup.backup_daily()
            backups = Path(directory) / 'backups'
            self.assertTrue((backups / 'backup-error.txt').exists())
            self.assertEqual(list(backups.glob('*.pending')), [])
            self.assertEqual(list(backups.glob('*.dump')), [])
            with patch.object(backup.subprocess, 'run') as run:
                backup.backup_daily()
                self.assertEqual(run.call_count, 1)
            self.assertFalse((backups / 'backup-error.txt').exists())
            self.assertEqual(len(list(backups.glob('*.dump'))), 1)

