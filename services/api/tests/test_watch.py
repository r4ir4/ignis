import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app import watch
from app.watch_main import app as production
class WatchTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / 'watch'
        self.patch = patch.object(watch, 'PRIVATE', self.path); self.patch.start()
        app = FastAPI(); app.include_router(watch.router); self.client = TestClient(app)
    def tearDown(self): self.patch.stop(); self.temp.cleanup()
    def video(self): return {'id': str(uuid4()), 'videoId': 'abcdefghijk', 'title': 'My video'}
    def test_save_reload_and_conflict(self):
        self.assertEqual(self.client.get('/api/watch').json(), {'revision': 0, 'videos': []})
        state = {'revision': 0, 'videos': [self.video()]}
        result = self.client.put('/api/watch', json=state); self.assertEqual(result.status_code, 200)
        self.assertEqual(self.client.get('/api/watch').json()['revision'], 1)
        self.assertEqual(self.client.put('/api/watch', json=state).status_code, 409)
        self.assertEqual((self.path / 'records.json').stat().st_mode & 0o777, 0o600)
    def test_invalid_duplicate_and_blank(self):
        for video in [dict(self.video(), title='  '), dict(self.video(), videoId='../bad')]:
            self.assertEqual(self.client.put('/api/watch', json={'revision': 0, 'videos': [video]}).status_code, 422)
        self.assertEqual(self.client.put('/api/watch', json={'revision': 0, 'videos': [self.video(), self.video()]}).status_code, 422)
    def test_short_platforms_and_ids(self):
        tiktok = {'id': str(uuid4()), 'videoId': '6718335390845095173', 'title': 'Dog', 'platform': 'tiktok', 'short': True, 'sourceUrl': 'https://www.tiktok.com/@scout2015/video/6718335390845095173'}
        reel = {'id': str(uuid4()), 'videoId': 'C8aBcDeFgHi', 'title': 'Reel', 'platform': 'instagram', 'short': True}
        same_id_other_platform = dict(self.video(), platform='instagram', videoId='abcdefghijk')
        result = self.client.put('/api/watch', json={'revision': 0, 'videos': [self.video(), tiktok, reel, same_id_other_platform]})
        self.assertEqual(result.status_code, 200)
        self.assertTrue(result.json()['videos'][1]['short'])
        for bad in [dict(tiktok, videoId='abc'), dict(tiktok, sourceUrl='http://www.tiktok.com/x'), dict(reel, videoId='bad id!'), dict(self.video(), videoId='toolongforyoutube1')]:
            self.assertEqual(self.client.put('/api/watch', json={'revision': 1, 'videos': [bad]}).status_code, 422)
    def test_social_metadata_only_fetches_tiktok(self):
        for url in ['https://example.com/@a/video/123456', 'https://www.tiktok.com.evil.test/@a/video/123456', 'http://www.tiktok.com/@a/video/123456', 'https://www.tiktok.com/@a/video/12']:
            self.assertEqual(self.client.get('/api/watch/metadata/social', params={'url': url}).status_code, 422)
    def test_channel_avatar_only_fetches_youtube_channels(self):
        import asyncio
        class Client:
            calls = []
            async def get(self, url, **kwargs):
                self.calls.append(url)
                class Response: status_code = 200; text = '<meta property="og:image" content="https://yt3.googleusercontent.com/abc=s900-c-k-c0x00ffffff-no-rj">'
                return Response()
        client = Client()
        self.assertEqual(asyncio.run(watch.channel_avatar(client, 'https://evil.test/@a')), '')
        self.assertEqual(asyncio.run(watch.channel_avatar(client, 'https://www.youtube.com/@a/../x')), '')
        self.assertEqual(client.calls, [])
        self.assertEqual(asyncio.run(watch.channel_avatar(client, 'https://www.youtube.com/@jawed')), 'https://yt3.googleusercontent.com/abc=s96-c-k-c0x00ffffff-no-rj')
    def test_corrupt_preserved(self):
        self.path.mkdir(); path = self.path / 'records.json'; path.write_text('broken')
        self.assertEqual(self.client.put('/api/watch', json={'revision': 0, 'videos': []}).status_code, 500)
        self.assertEqual(path.read_text(), 'broken')
    def test_production_boundary(self):
        client = TestClient(production, base_url='https://watch.ignis.farm')
        self.assertEqual(client.get('/api/watch').status_code, 401)
        self.assertEqual(client.put('/api/watch', headers={'Remote-Email': 'test@example.com'}, json={'revision': 0, 'videos': []}).status_code, 403)
        self.assertEqual(client.get('/api/watch', headers={'Remote-Email': 'test@example.com'}).status_code, 200)
        self.assertEqual(client.get('/api/structured/status', headers={'Remote-Email': 'test@example.com'}).status_code, 404)

class MetadataTests(unittest.TestCase):
    def setUp(self):
        app = FastAPI(); app.include_router(watch.router); self.client = TestClient(app)
        watch.metadata_cache.clear()
    def test_metadata_uses_fixed_provider_and_caches(self):
        from unittest.mock import AsyncMock
        import httpx
        mock = AsyncMock()
        mock.get.return_value = httpx.Response(200, json={'title': 'Video title', 'author_name': 'Channel', 'thumbnail_url': 'https://untrusted.invalid/image'})
        with patch.object(watch.httpx, 'AsyncClient') as factory:
            factory.return_value.__aenter__.return_value = mock
            response = self.client.get('/api/watch/metadata?video_id=abcdefghijk')
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()['title'], 'Video title')
            self.assertEqual(response.json()['channel'], 'Channel')
            self.assertEqual(response.json()['thumbnail'], 'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg')
            self.assertEqual(self.client.get('/api/watch/metadata?video_id=abcdefghijk').status_code, 200)
            self.assertEqual(mock.get.await_count, 1)
            self.assertEqual(mock.get.call_args.args[0], 'https://www.youtube.com/oembed')
    def test_arbitrary_urls_rejected_without_network(self):
        with patch.object(watch.httpx, 'AsyncClient') as factory:
            self.assertEqual(self.client.get('/api/watch/metadata?video_id=https://localhost').status_code, 422)
            factory.assert_not_called()
    def test_unavailable_and_network_failure_leave_manual_save_available(self):
        from unittest.mock import AsyncMock
        import httpx
        for result, expected in [(httpx.Response(404), 422), (httpx.Response(200, json={}), 502), (httpx.Response(200, text='not json'), 502)]:
            mock = AsyncMock(); mock.get.return_value = result
            with patch.object(watch.httpx, 'AsyncClient') as factory:
                factory.return_value.__aenter__.return_value = mock
                self.assertEqual(self.client.get('/api/watch/metadata?video_id=abcdefghijk').status_code, expected)
        mock = AsyncMock(); mock.get.side_effect = httpx.TimeoutException('timeout')
        with patch.object(watch.httpx, 'AsyncClient') as factory:
            factory.return_value.__aenter__.return_value = mock
            self.assertEqual(self.client.get('/api/watch/metadata?video_id=abcdefghijk').status_code, 502)

class PlaybackTests(WatchTests):
    def create(self):
        record = self.video()
        self.client.put('/api/watch', json={'revision': 0, 'videos': [record]})
        return record['id']
    def test_resume_progress_and_comments_survive_library_edits(self):
        record = self.create()
        state = self.client.patch(f'/api/watch/{record}/progress', json={'seconds': 123.4, 'duration': 900}).json()
        self.assertEqual(state['videos'][0]['progressSeconds'], 123.4)
        self.assertEqual(state['videos'][0]['status'], 'watching')
        comment = {'id': str(uuid4()), 'text': '  Remember this idea  '}
        state = self.client.post(f'/api/watch/{record}/comments', json=comment).json()
        self.assertEqual(state['videos'][0]['comments'][0]['text'], 'Remember this idea')
        self.assertTrue(state['videos'][0]['comments'][0]['createdAt'])
        state['videos'][0]['title'] = 'Updated title'
        state['videos'][0]['progressSeconds'] = 0
        state['videos'][0]['comments'] = []
        response = self.client.put('/api/watch', json=state)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['videos'][0]['progressSeconds'], 123.4)
        self.assertEqual(len(response.json()['videos'][0]['comments']), 1)
    def test_progress_can_seek_back_and_clamps_to_duration(self):
        record = self.create()
        self.client.patch(f'/api/watch/{record}/progress', json={'seconds': 300, 'duration': 900})
        response = self.client.patch(f'/api/watch/{record}/progress', json={'seconds': 100, 'duration': 900})
        self.assertEqual(response.json()['videos'][0]['progressSeconds'], 100)
        response = self.client.patch(f'/api/watch/{record}/progress', json={'seconds': 1000, 'duration': 900})
        self.assertEqual(response.json()['videos'][0]['progressSeconds'], 900)
        self.assertEqual(self.client.patch(f'/api/watch/{record}/progress', json={'seconds': -1, 'duration': 900}).status_code, 422)
    def test_comment_retries_are_idempotent_and_blank_rejected(self):
        record = self.create(); comment = {'id': str(uuid4()), 'text': 'My thought'}
        first = self.client.post(f'/api/watch/{record}/comments', json=comment)
        second = self.client.post(f'/api/watch/{record}/comments', json=comment)
        self.assertEqual(first.json()['revision'], second.json()['revision'])
        self.assertEqual(len(second.json()['videos'][0]['comments']), 1)
        self.assertEqual(self.client.post(f'/api/watch/{record}/comments', json={'id': str(uuid4()), 'text': '   '}).status_code, 422)
    def test_missing_video_does_not_recreate_it(self):
        record = str(uuid4())
        self.assertEqual(self.client.patch(f'/api/watch/{record}/progress', json={'seconds': 1, 'duration': 100}).status_code, 404)
        self.assertEqual(self.client.post(f'/api/watch/{record}/comments', json={'id': str(uuid4()), 'text': 'Hello'}).status_code, 404)

class PreferenceTests(WatchTests):
    def create(self):
        video = self.video()
        self.client.put('/api/watch', json={'revision': 0, 'videos': [video]})
        return video['id']
    def test_partial_preferences_preserve_progress_and_comments(self):
        record = self.create()
        self.client.patch(f'/api/watch/{record}/progress', json={'seconds': 60, 'duration': 900})
        self.client.post(f'/api/watch/{record}/comments', json={'id': str(uuid4()), 'text': 'Keep this'})
        self.client.patch(f'/api/watch/{record}/preferences', json={'favorite': True})
        state = self.client.patch(f'/api/watch/{record}/preferences', json={'rating': 4}).json()
        video = state['videos'][0]
        self.assertTrue(video['favorite']); self.assertEqual(video['rating'], 4)
        self.assertEqual(video['progressSeconds'], 60); self.assertEqual(len(video['comments']), 1)
        state['videos'][0]['favorite'] = False; state['videos'][0]['rating'] = 0
        state = self.client.put('/api/watch', json=state).json()
        self.assertTrue(state['videos'][0]['favorite']); self.assertEqual(state['videos'][0]['rating'], 4)
        state = self.client.patch(f'/api/watch/{record}/preferences', json={'rating': 0, 'favorite': False}).json()
        self.assertEqual(state['videos'][0]['rating'], 0); self.assertFalse(state['videos'][0]['favorite'])
    def test_watched_status_survives_progress_and_can_be_reversed(self):
        record = self.create()
        self.client.patch(f'/api/watch/{record}/preferences', json={'status': 'finished'})
        state = self.client.patch(f'/api/watch/{record}/progress', json={'seconds': 60, 'duration': 900}).json()
        self.assertEqual(state['videos'][0]['status'], 'finished')
        state = self.client.patch(f'/api/watch/{record}/preferences', json={'status': 'watching'}).json()
        self.assertEqual(state['videos'][0]['status'], 'watching')
    def test_rating_validation_and_missing_record(self):
        record = self.create()
        for rating in [-1, 6, 2.5, True, None]:
            self.assertEqual(self.client.patch(f'/api/watch/{record}/preferences', json={'rating': rating}).status_code, 422)
        self.assertEqual(self.client.patch(f'/api/watch/{uuid4()}/preferences', json={'rating': 3}).status_code, 404)

class CollectionTests(WatchTests):
    def test_legacy_record_is_read_without_rewriting_and_roundtrips_multiple_collections(self):
        import json
        video = dict(self.video(), collection='Study')
        self.path.mkdir(); path = self.path / 'records.json'
        original = json.dumps({'revision': 1, 'videos': [video]}); path.write_text(original)
        state = self.client.get('/api/watch').json()
        self.assertEqual(state['videos'][0]['collections'], ['Study'])
        self.assertEqual(path.read_text(), original)
        state['videos'][0]['collections'] = ['Study', ' Work ', 'Study']
        response = self.client.put('/api/watch', json=state)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['videos'][0]['collections'], ['Study', 'Work'])
        self.assertEqual(self.client.get('/api/watch').json()['videos'][0]['collections'], ['Study', 'Work'])
        state = response.json(); state['videos'][0]['collections'] = []
        saved = self.client.put('/api/watch', json=state).json()['videos'][0]
        self.assertEqual(saved['collections'], []); self.assertEqual(saved['collection'], '')
    def test_collection_limits(self):
        for names in [[' '], ['x' * 81], [str(i) for i in range(21)]]:
            video = dict(self.video(), collections=names)
            self.assertEqual(self.client.put('/api/watch', json={'revision': 0, 'videos': [video]}).status_code, 422)
