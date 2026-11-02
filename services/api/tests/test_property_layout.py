import unittest
from uuid import uuid4
from pydantic import ValidationError
from app.schemas.notebook import PersonalList


class TaskPropertyLayoutTests(unittest.TestCase):
    def test_layout_round_trip_preserves_task_values(self):
        prop = str(uuid4())
        data = {'id': str(uuid4()), 'name': 'Tasks', 'properties': [{'id': prop, 'name': 'Priority', 'type': 'text'}], 'items': [{'id': str(uuid4()), 'title': 'Task', 'status': 'To do', 'value': 42, 'cover': 'https://example.com/image.png', 'properties': {prop: 'High'}}], 'propertyDisplay': {'status': {'order': 2}, 'date': {'order': 3}, 'value': {'visibility': 'hidden', 'order': 4}, 'image': {'visibility': 'hidden', 'order': 0}, prop: {'order': 1}}}
        saved = PersonalList.model_validate(data)
        restored = PersonalList.model_validate_json(saved.model_dump_json())
        self.assertEqual(restored.propertyDisplay['image'].order, 0)
        self.assertEqual(restored.propertyDisplay[prop].order, 1)
        self.assertEqual(restored.items[0].value, 42)
        self.assertEqual(restored.items[0].cover, data['items'][0]['cover'])
        self.assertEqual(restored.items[0].properties[prop], 'High')

    def test_invalid_orders_and_unknown_properties_rejected(self):
        for settings in [{'unknown': {'order': 0}}, *[{'image': {'order': order}} for order in [-1, 34, .5, True, '1']], {'image': {'before': 'value'}}]:
            with self.subTest(settings=settings), self.assertRaises(ValidationError):
                PersonalList.model_validate({'id': str(uuid4()), 'name': 'Tasks', 'propertyDisplay': settings})
