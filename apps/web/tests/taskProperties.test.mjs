import { reconcileTaskSystems } from '../src/features/notebook/taskSystemFields.ts'
import { buttonPatch } from '../src/features/notebook/taskButtons.ts'
import * as selectHelpers from '../src/features/notebook/taskProperties.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateFormula } from '../src/features/notebook/propertyFormula.ts'
import { propertyTypes, storedPropertyTypes, planTaskPropertyChange, newTaskProperty, validPropertyDefinitions, validPropertyValue, computedProperty, upsertTaskProperty } from '../src/features/notebook/taskProperties.ts'
import { blankItem, patchPersonalItem, validLists } from '../src/features/notebook/personalLists.ts'
import { duplicate, samePages } from '../src/features/notebook/notebookModel.ts'
const prop = (type, name = type, config) => ({ id: crypto.randomUUID(), name, type, options: type === 'status' ? ['Not started', 'In progress', 'Done'] : type === 'person' ? ['You'] : [], ...(config ? { config } : {}) })

test('16 active types are selectable while retired types remain readable for recovery', () => {
  const definitions = propertyTypes.map(type => newTaskProperty([], type))
  assert.equal(definitions.length, 16)
  for (const type of ['person', 'phone', 'created-by', 'edited-by', 'place', 'relation']) { assert.equal(propertyTypes.includes(type), false); assert.equal(typeof newTaskProperty([], type), 'string') }
  assert.ok(validPropertyDefinitions(storedPropertyTypes.map(type => prop(type))))
  assert.ok(validPropertyDefinitions(definitions))
  assert.equal(validPropertyDefinitions([{ ...prop('text'), config: { script: 'bad' } }]), false)
  const examples = { email: ['hello@example.com', 'not email'], phone: ['+55 (71) 1234-5678', 'not a phone'], status: ['Done', 'Unknown'], person: [['You'], ['Unknown']], files: [['https://example.com/doc.pdf', '/api/notebook/attachments/' + 'a'.repeat(64) + '/file.pdf'], ['javascript:alert(1)']], relation: [[crypto.randomUUID()], ['not-a-task']], place: ['Lisbon', 123] }
  for (const [type, [valid, invalid]] of Object.entries(examples)) { const definition = prop(type); assert.equal(validPropertyValue(valid, definition), true, type); assert.equal(validPropertyValue(invalid, definition), false, type) }
  for (const type of ['formula', 'rollup', 'created-time', 'created-by', 'edited-time', 'edited-by', 'id', 'button']) assert.equal(validPropertyValue('fake', prop(type)), false)
})
test('safe formulas calculate and reject code, excessive nesting, missing properties and zero division', () => {
  const read = name => { if (name === 'Value') return 4; throw new Error('Missing') }
  assert.equal(evaluateFormula('round(prop("Value") * 2.5) + 1', read), 11)
  assert.equal(evaluateFormula('if(prop("Value") > 2, concat("Count: ", prop("Value")), "Small")', read), 'Count: 4')
  assert.equal(evaluateFormula('2 + 3 * 4', read), 14)
  assert.equal(evaluateFormula('10 - 3 - 2', read), 5)
  assert.equal(evaluateFormula('empty("") && !false', read), true)
  for (const value of ['globalThis.alert(1)', 'constructor("alert(1)")', '1 / 0', 'prop("Missing")', '2 ** 3', '('.repeat(100) + '1' + ')'.repeat(100)]) assert.throws(() => evaluateFormula(value, read), value)
})
test('relations and rollups follow current linked tasks and detect calculation cycles', () => {
  const relation = prop('relation'), formula = prop('formula', 'Doubled', { expression: 'prop("Value") * 2' })
  const a = { ...blankItem(), title: 'A', value: 5 }, b = { ...blankItem(), title: 'B', value: 8 }
  const rollup = prop('rollup', 'Total', { relationId: relation.id, targetProperty: formula.id, aggregation: 'sum' })
  const item = { ...blankItem(), properties: { [relation.id]: [a.id, b.id] } }
  let list = { id: crypto.randomUUID(), name: 'Tasks', properties: [relation, formula, rollup], items: [a, b, item] }
  assert.equal(validLists([list]), true)
  assert.equal(computedProperty(rollup, item, list), 26)
  list = patchPersonalItem(list, b.id, { value: 10 })
  assert.equal(computedProperty(rollup, item, list), 30)
  assert.equal(computedProperty(rollup, item, { ...list, items: [a, item] }), 10)
  const cycle = { ...formula, config: { expression: 'prop("Doubled") + 1' } }
  assert.throws(() => computedProperty(cycle, item, { ...list, properties: [cycle] }), /Circular/)
  assert.equal(upsertTaskProperty(list, { ...formula, config: { expression: 'prop("Value") * 3' } }).properties[1].config.expression, 'prop("Value") * 3')
})
test('automatic fields retain real metadata and IDs; old creation dates stay unknown', () => {
  const item = blankItem(), list = { id: crypto.randomUUID(), name: 'Tasks', items: [item] }
  assert.equal(computedProperty(prop('created-time'), item, list), item.metadata.createdAt)
  assert.equal(computedProperty(prop('created-by'), item, list), 'You')
  assert.equal(computedProperty(prop('id', 'ID', { prefix: 'TASK' }), { ...item, metadata: { ...item.metadata, number: 1 } }, list), 'TASK-1')
  const legacy = { ...item, metadata: null }, edited = patchPersonalItem({ ...list, items: [legacy] }, item.id, { title: 'Edited' }).items[0]
  assert.equal(edited.metadata.createdAt, null)
  assert.equal(edited.metadata.editedBy, 'You')
  assert.ok(Date.parse(edited.metadata.editedAt))
})
test('copying pages remaps related lists and acknowledgements normalize optional config fields', () => {
  const list = { id: crypto.randomUUID(), name: 'Tasks', items: [blankItem()], properties: [] }
  list.properties.push(prop('relation', 'Linked', { targetListId: list.id }))
  const page = { id: crypto.randomUUID(), parentId: null, title: 'Source', content: { type: 'doc', content: [] }, lists: [list] }
  const copy = duplicate([page], page.id).pages[1].lists[0]
  assert.equal(copy.properties[0].config.targetListId, copy.id)
  assert.notEqual(copy.id, list.id)
  assert.equal(page.lists[0].properties[0].config.targetListId, list.id)
  const formula = prop('formula', 'Formula', { expression: '1 + 2', prefix: 'X' })
  page.lists[0].properties.push(formula)
  const response = structuredClone(page)
  response.lists[0].properties[1].config = { prefix: 'X', expression: '1 + 2' }
  assert.ok(samePages([page], [response]))
})
test('Markdown exports show current calculated and related values without altering stored task properties', async () => {
  const { pageMarkdown } = await import('../src/features/notebook/pageExport.ts')
  const formula = prop('formula', 'Double', { expression: 'prop("Value") * 2' })
  const item = { ...blankItem(), title: 'Export task', value: 7 }
  const list = { id: crypto.randomUUID(), name: 'Export list', items: [item], properties: [formula] }
  const page = { id: crypto.randomUUID(), parentId: null, title: 'Export', content: { type: 'doc', content: [] }, lists: [list] }
  assert.match(pageMarkdown(page), /\| 14 \|/)
  assert.equal(item.properties, undefined)
})

function conversionFixture(type, values, options = [], config) {
  const definition = { ...prop(type, 'Field', config), options }
  return { definition, list: { id: crypto.randomUUID(), name: 'Tasks', properties: [definition], items: values.map((value, index) => ({ ...blankItem(), title: `Task ${index + 1}`, properties: { [definition.id]: value } })) } }
}
function target(definition, type, config) { return { ...definition, type, options: [], config: config || null } }

test('numeric conversions preserve zero, negatives, booleans and valid numeric text; unsafe values need an exact approval', () => {
  const { list, definition } = conversionFixture('text', ['0', '-12.5', '1e3', '', 'abc', '2026-10-17', '1,234'])
  const next = target(definition, 'number'), plan = planTaskPropertyChange(list, next)
  assert.deepEqual(plan.entries.map(row => row.after), [0, -12.5, 1000, null, null, null, null])
  assert.equal(plan.cleared, 3)
  assert.equal(upsertTaskProperty(list, next), list)
  assert.equal(upsertTaskProperty(list, next, [list], 'stale'), list)
  const changed = upsertTaskProperty(list, next, [list], plan.signature)
  assert.equal(changed.properties[0].id, definition.id)
  assert.equal(changed.properties[0].type, 'number')
  assert.equal(validLists([changed]), true)
  assert.deepEqual(list.items.map(item => item.properties[definition.id]), ['0', '-12.5', '1e3', '', 'abc', '2026-10-17', '1,234'])
  const concurrent = { ...list, items: [...list.items, { ...blankItem(), title: 'Hidden task', properties: { [definition.id]: 'Another incompatible value' } }] }
  assert.equal(upsertTaskProperty(concurrent, next, [concurrent], plan.signature), concurrent)
})
test('selection conversions retain choices, infer new options, and never silently discard multiple choices', () => {
  const { list, definition } = conversionFixture('select', ['High', 'Low', null], ['High', 'Low', 'Unused'])
  const multi = upsertTaskProperty(list, target(definition, 'multi-select'))
  assert.deepEqual(multi.items.map(i => i.properties[definition.id]), [['High'], ['Low'], null])
  assert.deepEqual(multi.properties[0].options, ['High', 'Low', 'Unused'])
  const back = upsertTaskProperty(multi, { ...multi.properties[0], type: 'select' })
  assert.deepEqual(back.items.map(i => i.properties[definition.id]), ['High', 'Low', null])
  const many = conversionFixture('multi-select', [['High', 'Low'], ['High']], ['High', 'Low'])
  const plan = planTaskPropertyChange(many.list, target(many.definition, 'status'))
  assert.equal(plan.cleared, 1)
  assert.deepEqual(plan.entries.map(row => row.after), [null, 'High'])
  const text = upsertTaskProperty(many.list, target(many.definition, 'text'))
  assert.equal(text.items[0].properties[many.definition.id], 'High\nLow')
  const oversized = conversionFixture('text', Array.from({ length: 31 }, (_, i) => `Choice ${i}`))
  const overflow = planTaskPropertyChange(oversized.list, target(oversized.definition, 'select'))
  assert.equal(overflow.definition.options.length, 30)
  assert.equal(overflow.cleared, 1)
})
test('date, checkbox and file conversion stays available; legacy relations remain recoverable', () => {
  const fixture = conversionFixture('text', ['2026-02-28', '2026-02-30', '10/11/2026'])
  assert.deepEqual(planTaskPropertyChange(fixture.list, target(fixture.definition, 'date')).entries.map(row => row.after), ['2026-02-28', null, null])
  const check = conversionFixture('text', ['yes', 'FALSE', '0', 'unknown', ''])
  assert.deepEqual(planTaskPropertyChange(check.list, target(check.definition, 'checkbox')).entries.map(row => row.after), [true, false, false, null, null])
  const file = conversionFixture('url', ['https://example.com/file.pdf'])
  const files = upsertTaskProperty(file.list, target(file.definition, 'files'))
  assert.deepEqual(files.items[0].properties[file.definition.id], ['https://example.com/file.pdf'])
  assert.equal(upsertTaskProperty(files, target(file.definition, 'url')).items[0].properties[file.definition.id], 'https://example.com/file.pdf')
  const related = { id: crypto.randomUUID(), name: 'Other tasks', items: [{ ...blankItem(), title: 'Related title' }] }
  const links = conversionFixture('text', [related.items[0].id, crypto.randomUUID()])
  const next = target(links.definition, 'relation', { targetListId: related.id })
  assert.equal(planTaskPropertyChange(links.list, next, [links.list, related]), null)
  assert.equal(upsertTaskProperty(links.list, next, [links.list, related]), links.list)
  const legacy = conversionFixture('relation', [[related.items[0].id]], [], { targetListId: related.id })
  assert.equal(validLists([legacy.list]), true)
  assert.equal(upsertTaskProperty(legacy.list, target(legacy.definition, 'text'), [legacy.list, related]).items[0].properties[legacy.definition.id], 'Related title')
})
test('computed values convert to snapshots; converting manual data into automatic types requires review', () => {
  const { list, definition } = conversionFixture('formula', [null, null], [], { expression: 'prop("Value") * 2' })
  list.items[0].value = 4
  list.items[1].value = 7
  const numbers = upsertTaskProperty(list, target(definition, 'number'))
  assert.deepEqual(numbers.items.map(i => i.properties[definition.id]), [8, 14])
  assert.equal(numbers.properties[0].config, null)
  const next = target(definition, 'formula', { expression: '42' })
  const plan = planTaskPropertyChange(numbers, next)
  assert.equal(plan.cleared, 2)
  assert.equal(upsertTaskProperty(numbers, next), numbers)
  const automatic = upsertTaskProperty(numbers, next, [numbers], plan.signature)
  assert.equal(computedProperty(automatic.properties[0], automatic.items[0], automatic), 42)
  assert.equal(automatic.items[0].properties[definition.id], null)
})
test('conversion preserves unrelated fields and properties across every stored value, including retired types', () => {
  const other = prop('text', 'Keep me')
  const { list, definition } = conversionFixture('person', [['You']], ['You'])
  list.properties.push(other)
  list.items[0].properties[other.id] = 'Untouched'
  const result = upsertTaskProperty(list, target(definition, 'text'))
  assert.equal(result.items[0].properties[definition.id], 'You')
  assert.equal(result.items[0].properties[other.id], 'Untouched')
  assert.equal(result.items[0].metadata, list.items[0].metadata)
  assert.equal(result.items[0].id, list.items[0].id)
  assert.equal(result.properties[1], other)
  assert.equal(validLists([result]), true)
  assert.equal(upsertTaskProperty(result, target(definition, 'person')), result)
})

test('duplicating a property creates an independent definition and copies values on every task', async () => {
  const { applyPropertyMenuAction } = await import('../src/features/notebook/taskProperties.ts')
  const { list, definition } = conversionFixture('multi-select', [['High'], ['High', 'Low'], null], ['High', 'Low'])
  const action = { kind: 'duplicate', id: definition.id, newId: crypto.randomUUID() }
  const preview = applyPropertyMenuAction(list, action)
  const duplicated = applyPropertyMenuAction(list, action)
  assert.deepEqual(preview, duplicated)
  assert.equal(applyPropertyMenuAction(list, { ...action, newId: definition.id }), list)
  const copy = duplicated.properties[1]
  assert.notEqual(copy.id, definition.id)
  assert.equal(copy.name, 'Field (copy)')
  assert.deepEqual(duplicated.items.map(item => item.properties[copy.id]), [['High'], ['High', 'Low'], null])
  assert.notEqual(duplicated.items[0].properties[copy.id], list.items[0].properties[definition.id])
  assert.equal(validLists([duplicated]), true)
  assert.equal(list.properties.length, 1)
  const again = applyPropertyMenuAction(duplicated, { kind: 'duplicate', id: definition.id })
  assert.equal(again.properties[2].name, 'Field (copy 2)')
  assert.equal(applyPropertyMenuAction(list, { kind: 'duplicate', id: crypto.randomUUID() }), list)
})
test('option menu rename/delete applies atomically to used choices while keeping unrelated values', async () => {
  const { applyPropertyMenuAction } = await import('../src/features/notebook/taskProperties.ts')
  const { list, definition } = conversionFixture('multi-select', [['High'], ['High', 'Low'], ['Low']], ['High', 'Low'])
  const renamed = applyPropertyMenuAction(list, { kind: 'rename-option', id: definition.id, option: 'High', name: 'Urgent' })
  assert.deepEqual(renamed.properties[0].options, ['Urgent', 'Low'])
  assert.deepEqual(renamed.items.map(item => item.properties[definition.id]), [['Urgent'], ['Urgent', 'Low'], ['Low']])
  assert.deepEqual(list.items.map(item => item.properties[definition.id]), [['High'], ['High', 'Low'], ['Low']])
  const deleted = applyPropertyMenuAction(renamed, { kind: 'delete-option', id: definition.id, option: 'Urgent' })
  assert.deepEqual(deleted.items.map(item => item.properties[definition.id]), [[], ['Low'], ['Low']])
  assert.deepEqual(deleted.properties[0].options, ['Low'])
  assert.equal(validLists([deleted]), true)
  assert.equal(applyPropertyMenuAction(list, { kind: 'rename-option', id: definition.id, option: 'High', name: 'Low' }), list)
  const scalar = conversionFixture('select', ['High', 'Low', null], ['High', 'Low'])
  assert.deepEqual(applyPropertyMenuAction(scalar.list, { kind: 'delete-option', id: scalar.definition.id, option: 'High' }).items.map(item => item.properties[scalar.definition.id]), [null, 'Low', null])
})

test('select colors survive rename, duplicate and delete while every selected value follows the option', () => {
  const id = crypto.randomUUID(), copyId = crypto.randomUUID()
  const definition = { id, name: 'Priority colors', type: 'multi-select', options: ['High', 'Low'], config: { optionColors: { High: 'red', Low: 'green' }, optionSort: 'ascending' } }
  const list = { id: crypto.randomUUID(), name: 'Tasks', properties: [definition], items: ['High', ['High', 'Low']].map((value, i) => ({ id: crypto.randomUUID(), title: `Task ${i}`, status: 'To do', date: null, value: null, description: '', cover: null, properties: { [id]: Array.isArray(value) ? value : [value] } })) }
  const { applyPropertyMenuAction, validPropertyDefinitions, orderedPropertyOptions, reorderPropertyOption } = selectHelpers
  assert.equal(validPropertyDefinitions([definition]), true)
  assert.equal(validPropertyDefinitions([{ ...definition, config: { optionColors: { Missing: 'red' } } }]), false)
  assert.equal(validPropertyDefinitions([{ ...definition, config: { optionColors: { High: '#fff' } } }]), false)
  const renamed = applyPropertyMenuAction(list, { kind: 'rename-option', id, option: 'High', name: 'Urgent' })
  assert.deepEqual(renamed.items.map(i => i.properties[id]), [['Urgent'], ['Urgent', 'Low']])
  assert.deepEqual(renamed.properties[0].config.optionColors, { Low: 'green', Urgent: 'red' })
  const copied = applyPropertyMenuAction(renamed, { kind: 'duplicate', id, newId: copyId })
  copied.properties[1].config.optionColors.Urgent = 'blue'
  assert.equal(renamed.properties[0].config.optionColors.Urgent, 'red')
  const deleted = applyPropertyMenuAction(renamed, { kind: 'delete-option', id, option: 'Urgent' })
  assert.deepEqual(deleted.items.map(i => i.properties[id]), [[], ['Low']])
  assert.deepEqual(deleted.properties[0].config.optionColors, { Low: 'green' })
  assert.deepEqual(orderedPropertyOptions({ ...definition, config: { optionSort: 'descending' } }), ['Low', 'High'])
  const reordered = reorderPropertyOption(definition, 'Low', 'High')
  assert.deepEqual(reordered.options, ['Low', 'High'])
  assert.equal(reordered.config.optionSort, 'manual')
  assert.deepEqual(reordered.config.optionColors, definition.config.optionColors)
  const renamedAndColored = applyPropertyMenuAction(list, { kind: 'rename-option', id, option: 'High', name: 'Urgent', color: 'purple' })
  assert.equal(renamedAndColored.properties[0].config.optionColors.Urgent, 'purple')
  const resetColor = applyPropertyMenuAction(list, { kind: 'rename-option', id, option: 'High', name: 'Urgent', color: null })
  assert.deepEqual(resetColor.properties[0].config.optionColors, { Low: 'green' })
  assert.deepEqual(resetColor.items[1].properties[id], ['Urgent', 'Low'])
  const single = { ...list, properties: [{ ...definition, type: 'select' }], items: list.items.map(item => ({ ...item, properties: { [id]: 'High' } })) }
  const plan = selectHelpers.planTaskPropertyChange(single, { ...definition, options: [], config: null })
  assert.deepEqual(plan.definition.config.optionColors, definition.config.optionColors)
  assert.deepEqual(plan.items.map(item => item.properties[id]), [['High'], ['High']])
})

test('Status groups, colors and defaults survive option renames and apply to new tasks', async () => {
  const { blankItem } = await import('../src/features/notebook/personalLists.ts')
  const { newTaskProperty, upsertTaskProperty, propertyStatusGroup, applyPropertyMenuAction } = selectHelpers
  const property = newTaskProperty([], 'status', 'Workflow')
  const list = { id: crypto.randomUUID(), name: 'Tasks', items: [blankItem(), blankItem()] }
  const added = upsertTaskProperty(list, property)
  assert.deepEqual(added.items.map(i => i.properties[property.id]), ['Not started', 'Not started'])
  assert.equal(propertyStatusGroup(property, 'Done'), 'complete')
  let renamed = applyPropertyMenuAction(added, { kind: 'rename-option', id: property.id, option: 'Not started', name: 'Backlog', color: 'purple' })
  assert.deepEqual(renamed.items.map(i => i.properties[property.id]), ['Backlog', 'Backlog'])
  assert.equal(renamed.properties[0].config.statusGroups.Backlog, 'todo')
  assert.equal(renamed.properties[0].config.defaultStatus, 'Backlog')
  assert.equal(blankItem(renamed).properties[property.id], 'Backlog')
  const changed = { ...renamed.properties[0], config: { ...renamed.properties[0].config, statusGroups: { ...renamed.properties[0].config.statusGroups, Backlog: 'complete' }, optionColors: { Backlog: 'default' } } }
  renamed = upsertTaskProperty(renamed, changed)
  assert.equal(propertyStatusGroup(renamed.properties[0], 'Backlog'), 'complete')
  assert.deepEqual(renamed.items.map(i => i.properties[property.id]), ['Backlog', 'Backlog'])
  const removed = applyPropertyMenuAction(renamed, { kind: 'delete-option', id: property.id, option: 'Backlog' })
  assert.equal(removed.properties[0].config.statusGroups.Backlog, undefined)
  assert.equal(removed.properties[0].config.defaultStatus, 'In progress')
})
test('Status configuration rejects orphan groups, invalid groups, defaults and non-status properties', () => {
  const property = selectHelpers.newTaskProperty([], 'status', 'Workflow')
  for (const config of [{ statusGroups: { Missing: 'todo' } }, { statusGroups: { Done: 'bad' } }, { defaultStatus: 'Missing' }]) assert.equal(selectHelpers.validPropertyDefinitions([{ ...property, config }]), false)
  assert.equal(selectHelpers.validPropertyDefinitions([{ ...property, type: 'select' }]), false)
  assert.equal(selectHelpers.validPropertyDefinitions([{ ...property, options: {} }]), false)
})
test('board completion follows groups rather than labels or colors, preserving legacy columns', async () => {
  const { listRecords } = await import('../src/features/notebook/viewModel.ts')
  const { validBoardDefinition, boardStatusGroup } = await import('../src/features/notebook/boardColumns.ts')
  const { blankItem } = await import('../src/features/notebook/personalLists.ts')
  const id = `column:${crypto.randomUUID()}`
  const board = { order: ['To do', 'Done', id], columns: { 'To do': { name: 'Backlog', color: 'green' }, Done: { name: 'Finished', color: 'gray' }, [id]: { name: 'Shipped', color: 'purple', group: 'complete' } } }
  assert.equal(validBoardDefinition(board), true)
  assert.equal(boardStatusGroup('Done', board.columns), 'complete')
  const list = { id: crypto.randomUUID(), name: 'Tasks', board, items: board.order.map(status => ({ ...blankItem(), status })) }
  assert.deepEqual(listRecords(list).map(i => i.done), [false, true, true])
  assert.equal(validBoardDefinition({ ...board, columns: { ...board.columns, [id]: { ...board.columns[id], group: 'bad' } } }), false)
})

test('system numbers survive deletion and reordering and edits preserve creation time', () => {
  const id = prop('id'), first = blankItem(), second = blankItem()
  let [list] = reconcileTaskSystems([], [{ id: crypto.randomUUID(), name: 'Tasks', properties: [id], items: [first, second] }], '2026-10-18T12:00:00Z')
  assert.deepEqual(list.items.map(item => item.metadata.number), [1, 2])
  let [changed] = reconcileTaskSystems([list], [{ ...list, items: [{ ...list.items[1], title: 'Changed' }] }], '2026-10-18T13:00:00Z')
  assert.equal(changed.items[0].metadata.number, 2)
  assert.equal(changed.items[0].metadata.createdAt, second.metadata.createdAt)
  assert.equal(changed.items[0].metadata.editedAt, '2026-10-18T13:00:00Z')
  const [added] = reconcileTaskSystems([changed], [{ ...changed, items: [...changed.items, blankItem()] }])
  assert.equal(added.items[1].metadata.number, 3)
  assert.ok(validLists([added]))
  assert.equal(validLists([{ ...added, items: {} }]), false)
  const [reordered] = reconcileTaskSystems([added], [{ ...added, items: [...added.items].reverse() }])
  assert.equal(reordered.items[1].metadata.editedAt, changed.items[0].metadata.editedAt)
})
test('button steps are atomic, respect renamed complete groups and reject missing targets', () => {
  const checkbox = prop('checkbox')
  const list = { id: crypto.randomUUID(), name: 'Tasks', properties: [checkbox], items: [], board: { order: ['Ready', 'Finished'], columns: { Ready: { name: 'Ready', color: 'gray', group: 'todo' }, Finished: { name: 'Finished', color: 'green', group: 'complete' } } } }
  assert.deepEqual(buttonPatch({ steps: [{ action: 'complete' }, { action: 'check', targetId: checkbox.id }, { action: 'today' }] }, list, new Date(2026, 9, 18)), { status: 'Finished', properties: { [checkbox.id]: true }, date: '2026-10-18' })
  assert.throws(() => buttonPatch({ steps: [{ action: 'complete' }, { action: 'check', targetId: crypto.randomUUID() }] }, list))
})

test('button edit actions validate targets and values before generating a patch', () => {
  const text = prop('text'), number = prop('number')
  const list = { id: crypto.randomUUID(), name: 'Tasks', items: [], properties: [text, number] }
  const config = { buttonLabel: 'Update', steps: [{ action: 'edit', targetProperty: text.id, value: 'Updated' }, { action: 'edit', targetProperty: number.id, value: -2 }, { action: 'edit', targetProperty: 'value', value: 25 }] }
  assert.ok(validPropertyDefinitions([prop('button', 'Run', config)]))
  assert.deepEqual(buttonPatch(config, list), { value: 25, properties: { [text.id]: 'Updated', [number.id]: -2 } })
  assert.throws(() => buttonPatch({ steps: [{ action: 'edit', targetProperty: number.id, value: 'bad' }] }, list))
  assert.throws(() => buttonPatch({ steps: [{ action: 'edit', targetProperty: 'date', value: '2026-02-30' }] }, list))
  assert.throws(() => buttonPatch({ steps: [{ action: 'edit', targetProperty: 'value', value: -1 }] }, list))
})

test('button configuration acknowledgements ignore optional nulls and nested key order', () => {
  const button = prop('button', 'Run', { steps: [{ action: 'edit', targetProperty: 'date', value: null }] })
  const page = { id: crypto.randomUUID(), title: 'Tasks', content: { type: 'doc', content: [] }, lists: [{ id: crypto.randomUUID(), name: 'Tasks', items: [], properties: [button] }] }
  const server = structuredClone(page)
  server.lists[0].properties[0].config.steps = [{ targetProperty: 'date', action: 'edit' }]
  assert.ok(samePages([page], [server]))
})
