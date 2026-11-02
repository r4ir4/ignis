import unittest
from uuid import uuid4
from pydantic import ValidationError
from app.schemas.notebook import NotebookPage

P = {'type': 'paragraph'}
def panel(title='Tab'):
    return {'type': 'tabPanel', 'attrs': {'id': str(uuid4()), 'title': title}, 'content': [P]}
class LayoutBlocksTests(unittest.TestCase):
    def page(self, nodes):
        return NotebookPage(id=uuid4(), title='Layouts', content={'type': 'doc', 'content': nodes})
    def test_round_trip(self):
        nodes = [{'type': 'columns', 'content': [{'type': 'column', 'content': [P]} for _ in range(5)]}, {'type': 'tabs', 'content': [panel('Overview'), panel('Details')]}, {'type': 'tableOfContents'}]
        self.assertEqual(self.page(nodes).content['content'], nodes)
    def test_invalid_shapes(self):
        repeated = panel()
        for node in [
            {'type': 'columns', 'content': [{'type': 'column', 'content': [P]}]},
            {'type': 'columns', 'content': [P, P]},
            {'type': 'column', 'content': []},
            {'type': 'tabs', 'content': []},
            {'type': 'tabs', 'content': [repeated, repeated]},
            {'type': 'tabs', 'content': [{'type': 'tabPanel', 'attrs': []}]},
            {'type': 'tabPanel', 'attrs': {'id': 'bad', 'title': 'Bad'}, 'content': [P]},
            {'type': 'tableOfContents', 'content': [P]},
        ]:
            with self.subTest(node=node), self.assertRaises(ValidationError):
                self.page([node])

    def test_column_widths(self):
        columns = [{'type': 'column', 'content': [P]} for _ in range(2)]
        for widths in [None, [30, 70], [50.5, 49.5]]:
            node = {'type': 'columns', 'attrs': {'widths': widths}, 'content': columns}
            self.assertEqual(self.page([node]).content['content'][0], node)
        for widths in [[10], [0, 100], [True, 50], ['50', 50], [float('nan'), 50], [float('inf'), 50], [101, 50]]:
            with self.subTest(widths=widths), self.assertRaises(ValidationError):
                self.page([{'type': 'columns', 'attrs': {'widths': widths}, 'content': columns}])

    def test_view_blocks(self):
        attrs = {'view': 'table', 'source': 'pages', 'title': 'Pages', 'query': '', 'filter': 'all', 'sort': 'title', 'group': 'status'}
        self.page([{'type': 'viewBlock', 'attrs': {**attrs, 'view': 'board', 'source': 'list', 'sort': 'manual'}}])
        for kind in ['table', 'board', 'gallery', 'feed', 'calendar', 'line', 'horizontal-bar', 'vertical-bar', 'number', 'dashboard']:
            node = {'type': 'viewBlock', 'attrs': {**attrs, 'view': kind}}
            self.assertEqual(self.page([node]).content['content'][0], node)
        for patch in [{'view': 'bad'}, {'source': []}, {'query': 'x' * 201}, {'title': None}, {'filter': 'bad'}, {'group': 'bad'}]:
            with self.subTest(patch=patch), self.assertRaises(ValidationError):
                self.page([{'type': 'viewBlock', 'attrs': {**attrs, **patch}}])
        with self.assertRaises(ValidationError):
            self.page([{'type': 'viewBlock', 'attrs': attrs, 'content': [P]}])

    def test_board_visibility_preferences(self):
        attrs = {'view': 'board', 'source': 'list', 'title': '', 'query': '', 'filter': 'all', 'sort': 'manual', 'group': 'status', 'hiddenColumns': ['To do', 'Done'], 'hideAggregation': True}
        node = {'type': 'viewBlock', 'attrs': attrs}
        self.assertEqual(self.page([node]).content['content'][0], node)
        for patch in [{'hiddenColumns': 'To do'}, {'hiddenColumns': ['To do', 'To do']}, {'hiddenColumns': ['unknown']}, {'hideAggregation': 'false'}, {'hideAggregation': 1}]:
            with self.subTest(patch=patch), self.assertRaises(ValidationError):
                self.page([{'type': 'viewBlock', 'attrs': {**attrs, **patch}}])

    def test_empty_selection_property_can_gain_options(self):
        property_id = str(uuid4())
        prop = {'id': property_id, 'name': 'Priority', 'type': 'select', 'options': []}
        collection = {'id': str(uuid4()), 'name': 'Tasks', 'items': [], 'properties': [prop]}
        NotebookPage(id=uuid4(), title='Empty options', lists=[collection], content={'type': 'doc', 'content': [P]})
        prop['options'] = ['High']
        collection['items'] = [{'id': str(uuid4()), 'title': 'Task', 'status': 'To do', 'properties': {property_id: 'High'}}]
        NotebookPage(id=uuid4(), title='Created option', lists=[collection], content={'type': 'doc', 'content': [P]})

    def test_typed_task_properties(self):
        types = [('text', 'Notes', 'Hello', []), ('number', 'Cost', -20, []), ('checkbox', 'Ready', True, []), ('date', 'Due', '2028-02-29', []), ('url', 'Link', 'https://example.com', []), ('select', 'Priority', 'High', ['Low', 'High']), ('multi-select', 'Tags', ['Work'], ['Work', 'Home'])]
        definitions = [{'id': str(uuid4()), 'type': kind, 'name': name, 'options': options} for kind, name, value, options in types]
        values = {definition['id']: entry[2] for definition, entry in zip(definitions, types)}
        item = {'id': str(uuid4()), 'title': 'Typed', 'status': 'To do', 'properties': values}
        collection = {'id': str(uuid4()), 'name': 'Tasks', 'items': [item], 'properties': definitions}
        NotebookPage(id=uuid4(), title='Properties', lists=[collection], content={'type': 'doc', 'content': [P]})
        for index, bad in [(1, True), (2, 'yes'), (3, '2026-02-30'), (4, 'javascript:alert(1)'), (5, 'Other'), (6, ['Other'])]:
            with self.subTest(index=index), self.assertRaises(ValidationError):
                NotebookPage(id=uuid4(), title='Invalid', lists=[{**collection, 'items': [{**item, 'properties': {**values, definitions[index]['id']: bad}}]}], content={'type': 'doc', 'content': [P]})
        with self.assertRaises(ValidationError):
            NotebookPage(id=uuid4(), title='Orphan', lists=[{**collection, 'properties': []}], content={'type': 'doc', 'content': [P]})

    def test_personal_list_validation(self):
        item = {'id': str(uuid4()), 'title': 'Item', 'status': 'To do', 'date': None, 'value': None, 'description': '', 'cover': None}
        collection = {'id': str(uuid4()), 'name': 'Items', 'items': [item]}
        NotebookPage(id=uuid4(), title='Lists', lists=[collection], content={'type': 'doc', 'content': [P]})
        for patch in [{'value': True}, {'value': float('nan')}, {'value': -1}, {'date': '2026-02-30'}, {'cover': 'javascript:alert(1)'}, {'status': 'bad'}]:
            with self.subTest(patch=patch), self.assertRaises(ValidationError):
                NotebookPage(id=uuid4(), title='Lists', lists=[{**collection, 'items': [{**item, **patch}]}], content={'type': 'doc', 'content': [P]})
        with self.assertRaises(ValidationError):
            NotebookPage(id=uuid4(), title='Lists', lists=[{**collection, 'items': [item, item]}], content={'type': 'doc', 'content': [P]})


    def test_image_grids_and_fixed_pages(self):
        from uuid import uuid4
        from app.schemas.notebook import NotebookPage
        for count in [2, 3, 4]:
            images = [{'url': 'https://example.com/image.jpg', 'alt': 'A garden'}] + [None] * (count - 1)
            self.page([{'type': 'imageGrid', 'attrs': {'count': count, 'images': images}}])
        for attrs in [{'count': 5, 'images': [None] * 5}, {'count': 2, 'images': []}, {'count': 2, 'images': [{'url': 'javascript:alert(1)', 'alt': ''}, None]}]:
            with self.assertRaises(ValidationError):
                self.page([{'type': 'imageGrid', 'attrs': attrs}])
        for kind in ['board', 'calendar', 'dashboard', 'meds']:
            attrs = {'view': 'dashboard' if kind == 'meds' else kind, 'source': 'list', 'title': '', 'query': '', 'filter': 'all', 'sort': 'manual', 'group': 'status'}
            page = NotebookPage(id=uuid4(), title=kind, kind=kind, content={'type': 'doc', 'content': [{'type': 'viewBlock', 'attrs': attrs}]})
            self.assertEqual(page.kind, kind)
            with self.assertRaises(ValidationError):
                NotebookPage(id=uuid4(), title=kind, kind=kind, content={'type': 'doc', 'content': [P]})

    def test_expanded_page_and_callout_symbols(self):
        from uuid import uuid4
        from app.schemas.notebook import NotebookPage, PAGE_ICON_IDS
        for icon in PAGE_ICON_IDS:
            value = f'icon:{icon}'
            page = NotebookPage(id=uuid4(), title='Symbols', icon=value, content={'type': 'doc', 'content': [{'type': 'callout', 'attrs': {'icon': value}, 'content': [P]}]})
            self.assertEqual(page.icon, value)
        with self.assertRaises(ValidationError):
            NotebookPage(id=uuid4(), title='Invalid', icon='icon:unknown', content={'type': 'doc', 'content': [P]})

    def test_board_column_configuration(self):
        attrs = {'view': 'board', 'source': 'list', 'title': '', 'query': '', 'filter': 'all', 'sort': 'manual', 'group': 'status', 'columns': {'To do': {'name': 'Backlog', 'color': 'purple'}, 'Done': {'name': 'Finished', 'color': 'pink'}}}
        page = self.page([{'type': 'viewBlock', 'attrs': attrs}])
        self.assertEqual(page.content['content'][0]['attrs']['columns'], attrs['columns'])
        for columns in [[], {'Other': {'name': 'Other', 'color': 'blue'}}, {'To do': {'name': ' ', 'color': 'blue'}}, {'Done': {'name': 'x', 'color': []}}, {'Done': {'name': 'x', 'color': 'neon'}}, {'Done': {'name': 'x' * 61, 'color': 'gray'}}]:
            with self.subTest(columns=columns), self.assertRaises(ValidationError):
                self.page([{'type': 'viewBlock', 'attrs': {**attrs, 'columns': columns}}])

    def test_dynamic_board_columns_require_valid_assignments(self):
        from uuid import uuid4
        from app.schemas.notebook import PersonalList
        status = f'column:{uuid4()}'
        item = {'id': str(uuid4()), 'title': 'Review task', 'status': status, 'date': None, 'value': None}
        board = {'order': ['To do', status], 'columns': {'To do': {'name': 'Backlog', 'color': 'gray'}, status: {'name': 'Review', 'color': 'purple'}}}
        data = {'id': str(uuid4()), 'name': 'Board', 'items': [item], 'board': board}
        self.assertEqual(PersonalList(**data).items[0].status, status)
        for invalid in [None, {'order': [], 'columns': {}}, {'order': ['To do'], 'columns': {'To do': {'name': 'Backlog', 'color': 'gray'}}}, {'order': [status, status], 'columns': {status: {'name': 'Review', 'color': 'purple'}}}]:
            with self.subTest(invalid=invalid), self.assertRaises(ValidationError):
                PersonalList(**{**data, 'board': invalid})

    def test_board_card_property_visibility(self):
        attrs = {'view': 'board', 'source': 'list', 'title': '', 'query': '', 'filter': 'all', 'sort': 'manual', 'group': 'status', 'cardProperties': ['status', str(uuid4())]}
        self.assertEqual(self.page([{'type': 'viewBlock', 'attrs': attrs}]).content['content'][0]['attrs'], attrs)
        for invalid in [['status', 'status'], ['unknown'], 'date', [None], [str(uuid4()) for _ in range(37)]]:
            with self.subTest(invalid=invalid), self.assertRaises(ValidationError):
                self.page([{'type': 'viewBlock', 'attrs': {**attrs, 'cardProperties': invalid}}])

    def test_board_card_layout_settings(self):
        attrs = {'view': 'board', 'source': 'list', 'title': '', 'query': '', 'filter': 'all', 'sort': 'manual', 'group': 'status', 'cardSize': 'large', 'cardPreview': str(uuid4()), 'cardImageFit': True}
        self.assertEqual(self.page([{'type': 'viewBlock', 'attrs': attrs}]).content['content'][0]['attrs'], attrs)
        for invalid in [{'cardSize': 'huge'}, {'cardSize': ['medium']}, {'cardPreview': 'bad'}, {'cardPreview': []}, {'cardImageFit': 1}]:
            with self.subTest(invalid=invalid), self.assertRaises(ValidationError):
                self.page([{'type': 'viewBlock', 'attrs': {**attrs, **invalid}}])

    def test_colored_page_and_callout_icons(self):
        from app.schemas.notebook import PAGE_ICON_IDS
        for icon in (PAGE_ICON_IDS[0], PAGE_ICON_IDS[-1]):
            for color in ['default', 'gray', 'brown', 'yellow', 'orange', 'green', 'blue', 'purple', 'pink', 'red']:
                value = f'icon:{icon}:{color}'
                page = NotebookPage(id=uuid4(), title='Color', icon=value, content={'type': 'doc', 'content': [{'type': 'callout', 'attrs': {'icon': value}, 'content': [P]}]})
                self.assertEqual(page.icon, value)
        for value in ['icon:brain:invalid', 'icon:brain:blue:extra', 'icon:missing:blue']:
            with self.assertRaises(ValidationError):
                NotebookPage(id=uuid4(), title='Invalid', icon=value, content={'type': 'doc', 'content': [P]})
