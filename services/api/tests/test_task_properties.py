import unittest
from uuid import uuid4
from pydantic import ValidationError
from app.schemas.notebook import TaskProperty, PersonalList, PersonalItem, valid_property_value

class PropertyTypesTest(unittest.TestCase):
    def prop(self, kind, **kwargs):
        return TaskProperty(id=uuid4(), name=kind, type=kind, **kwargs)

    def test_all_native_types_validate_and_computed_values_cannot_be_forged(self):
        kinds = ['text', 'number', 'select', 'multi-select', 'status', 'date', 'person', 'files', 'checkbox', 'url', 'email', 'phone', 'formula', 'relation', 'rollup', 'created-time', 'created-by', 'edited-time', 'edited-by', 'button', 'place', 'id']
        properties = [self.prop(kind) for kind in kinds]
        value = PersonalList(id=uuid4(), name='Tasks', properties=properties, items=[])
        self.assertEqual(len(value.properties), 22)
        for kind in ['formula', 'rollup', 'created-time', 'created-by', 'edited-time', 'edited-by', 'button', 'id']:
            self.assertFalse(valid_property_value('fake', self.prop(kind)))
        for kind, good, bad in [('email', 'x@example.com', 'no email'), ('phone', '+55 (71) 123-456', 'abc'), ('place', 'Lisbon', 5), ('relation', [str(uuid4())], ['bad']), ('files', ['https://example.com/document.pdf'], ['javascript:alert(1)'])]:
            self.assertTrue(valid_property_value(good, self.prop(kind)), kind)
            self.assertFalse(valid_property_value(bad, self.prop(kind)), kind)
        self.assertTrue(valid_property_value(['You'], self.prop('person', options=['You'])))
        self.assertTrue(valid_property_value('Done', self.prop('status', options=['Done'])))

    def test_configs_and_metadata_are_bounded_and_serialized_without_null_config_keys(self):
        prop = self.prop('formula', config={'expression': 'prop("Value") * 2'})
        self.assertEqual(prop.model_dump(mode='json')['config'], {'expression': 'prop("Value") * 2'})
        for config in [{'expression': 'x' * 1001}, {'targetListId': 'bad'}, {'aggregation': 'execute'}, {'prefix': '<script>'}, {'script': 'bad'}]:
            with self.assertRaises(ValidationError): self.prop('formula', config=config)
        base = dict(id=uuid4(), title='Task', status='To do')
        item = PersonalItem(**base, metadata={'createdAt': None, 'createdBy': None, 'editedAt': '2026-10-17T12:00:00Z', 'editedBy': 'You'})
        self.assertIsNone(item.metadata.createdAt)
        with self.assertRaises(ValidationError): PersonalItem(**base, metadata={'createdAt': 'not-a-date'})
