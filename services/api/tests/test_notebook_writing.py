import unittest
from uuid import uuid4
from pydantic import ValidationError
from app.schemas.notebook import NotebookPage

class WritingBlocksTests(unittest.TestCase):
    def page(self, nodes):
        return NotebookPage(id=uuid4(), title='Writing', content={'type': 'doc', 'content': nodes})

    def test_writing_blocks_round_trip(self):
        nodes = [
            {'type': 'details', 'attrs': {'open': True}, 'content': [{'type': 'detailsSummary', 'attrs': {'headingLevel': 2}, 'content': [{'type': 'text', 'text': 'Toggle'}]}, {'type': 'detailsContent', 'content': [{'type': 'paragraph'}]}]},
            {'type': 'callout', 'attrs': {'icon': 'emoji:🔥'}, 'content': [{'type': 'paragraph'}]},
            {'type': 'table', 'content': [{'type': 'tableRow', 'content': [{'type': 'tableCell', 'attrs': {'colspan': 1, 'rowspan': 1}, 'content': [{'type': 'paragraph'}]}]}]},
            {'type': 'pageLink', 'attrs': {'pageId': str(uuid4()), 'title': 'Another page'}},
        ]
        self.assertEqual(self.page(nodes).content['content'], nodes)

    def test_invalid_targets_and_spans_rejected(self):
        for node in [
            {'type': 'detailsSummary', 'attrs': {'headingLevel': 4}},
            {'type': 'detailsSummary', 'attrs': {'headingLevel': True}},
            {'type': 'callout', 'attrs': {'icon': 'javascript:bad'}},
            {'type': 'pageLink', 'attrs': {'pageId': 'javascript:alert(1)', 'title': 'Bad'}},
            {'type': 'tableCell', 'attrs': {'colspan': -1}},
            {'type': 'details', 'attrs': {'open': 'false'}},
        ]:
            with self.subTest(node=node), self.assertRaises(ValidationError):
                self.page([node])
