import unittest
from uuid import uuid4
from pydantic import ValidationError
from app.schemas.notebook import ReadingData, NotebookPage

class ReadingTests(unittest.TestCase):
    def test_notebook_roundtrip_and_relationship_guards(self):
        book = {'id': str(uuid4()), 'title': 'Coraline', 'author': '', 'rating': 4, 'source': 'borrowed', 'color': '#cf729d'}
        entry = {'id': str(uuid4()), 'bookId': book['id'], 'date': '2026-10-18', 'pages': 40}
        reading = {'books': [book], 'entries': [entry]}
        page = NotebookPage(id=uuid4(), title='Habits', kind='habits', content={'type': 'doc', 'content': [{'type': 'viewBlock', 'attrs': {'view': 'dashboard', 'source': 'list', 'title': '', 'query': '', 'filter': 'all', 'sort': 'title', 'group': 'status'}}]}, reading=reading)
        self.assertEqual(NotebookPage.model_validate_json(page.model_dump_json()).reading.entries[0].pages, 40)
        for patch in [{'pages': 0}, {'pages': 1.5}, {'date': '2026-02-30'}, {'bookId': str(uuid4())}]:
            with self.assertRaises(ValidationError): ReadingData.model_validate({**reading, 'entries': [{**entry, **patch}]})
        with self.assertRaises(ValidationError): ReadingData.model_validate({**reading, 'books': [book, book]})
