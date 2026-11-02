import io
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app import notes


class NotesTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path_patch = patch.object(notes, 'PRIVATE', Path(self.temp.name))
        self.path_patch.start()
        app = FastAPI()
        app.include_router(notes.router)
        self.client = TestClient(app)
        self.note_id = str(uuid4())

    def tearDown(self):
        self.path_patch.stop()
        self.temp.cleanup()

    def save(self, **changes):
        return self.client.put(f'/api/notes/{self.note_id}', json={
            'title': 'A thought', 'markdown': 'Hello', 'revision': 0, **changes,
        })

    def test_save_reload_and_stale_write_preserves_original(self):
        self.assertEqual(self.save().json()['revision'], 1)
        self.assertEqual(self.save(markdown='Stale tab').status_code, 409)
        self.assertEqual(self.client.get('/api/notes').json()[0]['markdown'], 'Hello')
        self.assertEqual(self.save(revision=1, markdown='Updated').json()['revision'], 2)

    def test_image_export_is_portable_and_only_includes_referenced_assets(self):
        # A real 1x1 PNG, not a user file.
        import base64
        png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=')
        image = self.client.post('/api/notes/images', content=png).json()
        unused = self.client.post('/api/notes/images', content=png).json()
        self.assertEqual(self.client.get(image).content, png)
        self.assertEqual(self.save(markdown=f'![A tiny dot]({image})').status_code, 200)
        exported = self.client.get(f'/api/notes/{self.note_id}/export')
        self.assertEqual(exported.status_code, 200)
        with zipfile.ZipFile(io.BytesIO(exported.content)) as archive:
            self.assertEqual(len(archive.namelist()), 2)
            self.assertNotIn(unused.rsplit('/', 1)[-1], str(archive.namelist()))
            markdown = archive.read(f'{self.note_id}.md').decode()
            self.assertNotIn('/api/notes', markdown)
            self.assertIn('images/', markdown)
            self.assertEqual(archive.read('images/' + image.rsplit('/', 1)[-1]), png)

    def test_unsafe_images_and_large_files_are_rejected(self):
        self.assertEqual(self.client.post('/api/notes/images', content=b'<svg onload="alert(1)"/>').status_code, 415)
        self.assertEqual(self.client.post('/api/notes/images', content=b'x' * (notes.MAX_IMAGE + 1)).status_code, 413)
        self.assertEqual(self.client.get('/api/notes/images/auth.env').status_code, 404)

    def test_invalid_and_corrupt_drafts_are_preserved(self):
        self.assertEqual(self.save(title='  ').status_code, 422)
        self.assertEqual(self.save(revision=-1).status_code, 422)
        path = Path(self.temp.name) / f'{self.note_id}.json'
        path.write_text('not valid json')
        self.assertEqual(self.save().status_code, 500)
        self.assertEqual(path.read_text(), 'not valid json')

    def test_missing_image_blocks_export(self):
        self.save(markdown=f'![](/api/notes/images/{uuid4()}.png)')
        self.assertEqual(self.client.get(f'/api/notes/{self.note_id}/export').status_code, 409)


    def test_book_choices_persist_validate_and_export(self):
        response = self.save(illustration='cats', pageLayout='poetry')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.client.get('/api/notes').json()[0]['illustration'], 'cats')
        self.assertEqual(self.client.get('/api/notes').json()[0]['pageLayout'], 'poetry')
        self.assertEqual(self.save(revision=1, illustration='../unsafe').status_code, 422)
        self.assertEqual(self.save(illustration='castle').status_code, 409)
        with zipfile.ZipFile(io.BytesIO(self.client.get(f'/api/notes/{self.note_id}/export').content)) as archive:
            self.assertIn('illustration: cats\npageLayout: poetry', archive.read(f'{self.note_id}.md').decode())

    def test_old_notes_default_to_auto_without_rewriting_them(self):
        import json
        saved = self.save().json()
        saved.pop('illustration')
        saved.pop('pageLayout')
        path = notes.PRIVATE / f'{self.note_id}.json'
        original = json.dumps(saved)
        path.write_text(original)
        loaded = self.client.get('/api/notes').json()[0]
        self.assertEqual(loaded['illustration'], 'auto')
        self.assertEqual(loaded['pageLayout'], 'auto')
        self.assertEqual(path.read_text(), original)

if __name__ == '__main__':
    unittest.main()
