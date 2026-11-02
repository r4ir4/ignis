"""Keep the one-time release merge non-destructive, including nested ID conflicts."""
import importlib.util
from pathlib import Path
import unittest
from uuid import uuid4

spec = importlib.util.spec_from_file_location('notebook_release_import', Path(__file__).resolve().parents[3] / 'deploy/notebook/import_existing.py')
migration = importlib.util.module_from_spec(spec)
spec.loader.exec_module(migration)

class NotebookImportTests(unittest.TestCase):
    def pages(self):
        root = {'id': str(uuid4()), 'parentId': None, 'title': 'Original', 'content': {'type': 'doc', 'content': [{'type': 'paragraph', 'content': [{'type': 'text', 'text': 'Keep bold', 'marks': [{'type': 'bold'}]}]}]}}
        child = {**root, 'id': str(uuid4()), 'parentId': root['id'], 'title': 'Nested'}
        return [root, child]

    def test_identical_browser_pages_do_not_duplicate_or_change_database_pages(self):
        pages = self.pages()
        merged, maps = migration.merge_sources({'revision': 4, 'pages': pages}, [{'pages': pages}])
        self.assertEqual(merged, [migration.canonical(p) for p in pages])
        self.assertEqual(maps[0], {p['id']: p['id'] for p in pages})

    def test_conflicting_parent_remaps_the_whole_browser_subtree_and_keeps_originals(self):
        pages = self.pages()
        incoming = [{**pages[0], 'title': 'Different browser draft'}, pages[1]]
        merged, maps = migration.merge_sources({'revision': 4, 'pages': pages}, [{'pages': incoming}])
        self.assertEqual(merged[:2], [migration.canonical(p) for p in pages])
        self.assertEqual(len(merged), 4)
        self.assertNotEqual(maps[0][pages[0]['id']], pages[0]['id'])
        self.assertNotEqual(maps[0][pages[1]['id']], pages[1]['id'])
        self.assertEqual(merged[3]['parentId'], merged[2]['id'])
        self.assertEqual(merged[3]['content'], pages[1]['content'])
