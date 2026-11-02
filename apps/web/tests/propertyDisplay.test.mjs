import test from 'node:test'
import assert from 'node:assert/strict'
import { updatePropertyDisplay, propertyShown, duplicateValueProperty, validPropertyDisplay } from '../src/features/notebook/propertyDisplay.ts'
import { validLists } from '../src/features/notebook/personalLists.ts'
import { applyPropertyMenuAction, removeTaskProperty, upsertTaskProperty } from '../src/features/notebook/taskProperties.ts'
import { samePages } from '../src/features/notebook/notebookModel.ts'
const prop = { id: crypto.randomUUID(), name: 'Priority', type: 'text', options: [] }
const list = { id: crypto.randomUUID(), name: 'Tasks', properties: [prop], items: [0, null, 12].map(value => ({ id: crypto.randomUUID(), title: 'Task', status: 'To do', date: null, description: 'Keep', cover: null, value, properties: { [prop.id]: 'High' } })) }
test('property visibility retains all values and can be restored through layout settings', () => {
  let next = updatePropertyDisplay(list, prop.id, { visibility: 'empty' })
  assert.equal(propertyShown(next, prop.id, null), false)
  assert.equal(propertyShown(next, prop.id, []), false)
  assert.equal(propertyShown(next, prop.id, 0), true)
  assert.equal(propertyShown(next, prop.id, false), true)
  assert.equal(propertyShown(next, prop.id, 'High'), true)
  next = updatePropertyDisplay(next, prop.id, { visibility: 'hidden' })
  assert.equal(propertyShown(next, prop.id, 'High'), false)
  assert.deepEqual(next.items, list.items)
  assert.equal(validLists([next]), true)
  assert.equal(propertyShown(updatePropertyDisplay(next, prop.id, { visibility: 'always' }), prop.id, null), true)
  assert.equal(removeTaskProperty(next, prop.id).propertyDisplay[prop.id], undefined)
})
test('Value names validate collisions; duplicate copies every task including zero and null without changing the built-in field', () => {
  const named = updatePropertyDisplay(list, 'value', { name: 'Estimate' })
  assert.equal(validLists([named]), true)
  assert.equal(updatePropertyDisplay(named, 'value', { name: 'Priority' }), named)
  assert.equal(updatePropertyDisplay(named, 'value', { name: 'Date' }), named)
  assert.equal(upsertTaskProperty(named, { ...prop, name: 'Estimate' }), named)
  const id = crypto.randomUUID(), copied = duplicateValueProperty(named, id)
  assert.equal(copied.properties.at(-1).name, 'Estimate (copy)')
  assert.deepEqual(copied.items.map(item => item.properties[id]), [0, null, 12])
  assert.deepEqual(copied.items.map(item => item.value), list.items.map(item => item.value))
  assert.equal(validLists([copied]), true)
  assert.equal(duplicateValueProperty(copied, crypto.randomUUID()).properties.at(-1).name, 'Estimate (copy 2)')
})
test('display settings survive JSON snapshots, normalize API defaults and reject invalid references', () => {
  const next = updatePropertyDisplay(list, prop.id, { visibility: 'hidden' })
  const page = lists => [{ id: 'page', title: 'Tasks', parentId: null, content: { type: 'doc', content: [] }, lists }]
  assert.equal(samePages(page([list]), page([next])), false)
  assert.equal(samePages(page([next]), page([JSON.parse(JSON.stringify(next))])), true)
  assert.equal(samePages(page([next]), page([{ ...next, propertyDisplay: { [prop.id]: { name: null, visibility: 'hidden' } } }])), true)
  assert.equal(validPropertyDisplay({ unknown: { visibility: 'hidden' } }, [prop]), false)
  assert.equal(validPropertyDisplay({ [prop.id]: { name: 'Override' } }, [prop]), false)
  assert.equal(validPropertyDisplay({ value: { visibility: 'wrong' } }, [prop]), false)
})

const { numberDisplay, numberProgress, validNumberDisplay, parsePropertyNumber, numberText } = await import('../src/features/notebook/numberDisplay.ts')
test('number displays calculate bar/ring progress while preserving the original number', () => {
  const settings = { showAs: 'bar', color: 'green', divideBy: 100, showNumber: true }
  assert.equal(numberProgress(42, settings), .42)
  assert.equal(numberProgress(0, settings), 0)
  assert.equal(numberProgress(-42, settings), 0)
  assert.equal(numberProgress(150, settings), 1)
  assert.equal(numberProgress(.25, { ...settings, divideBy: 1 }), .25)
  assert.equal(numberDisplay().showAs, 'number')
  assert.equal(numberText(0), '0')
  assert.equal(numberText(1e-12), '1e-12')
  const next = updatePropertyDisplay(list, 'value', { number: settings })
  assert.equal(validLists([next]), true)
  assert.deepEqual(next.items, list.items)
  assert.equal(next.propertyDisplay.value.number.divideBy, 100)
})
test('invalid divisors and display settings are rejected without replacing saved settings', () => {
  const valid = { showAs: 'ring', color: 'blue', divideBy: 50, showNumber: false }
  assert.equal(validNumberDisplay(valid), true)
  for (const patch of [{ divideBy: 0 }, { divideBy: -1 }, { divideBy: Infinity }, { divideBy: NaN }, { divideBy: true }, { divideBy: 1e13 }, { showAs: 'pie' }, { color: '#fff' }, { showNumber: 'false' }]) {
    assert.equal(validNumberDisplay({ ...valid, ...patch }), false)
    assert.equal(updatePropertyDisplay(list, 'value', { number: { ...valid, ...patch } }), list)
  }
  assert.equal(parsePropertyNumber(''), null)
  assert.equal(parsePropertyNumber('0'), 0)
  assert.equal(parsePropertyNumber('-42.5'), -42.5)
  assert.equal(parsePropertyNumber('-42.5', 0), undefined)
  assert.equal(parsePropertyNumber('1e3'), 1000)
  for (const value of ['-', 'Infinity', 'NaN', '0x10', '1e13', 'abc']) assert.equal(parsePropertyNumber(value), undefined)
})
test('number presentation survives copies and normalized snapshots independently of raw values', () => {
  const number = { showAs: 'ring', color: 'purple', divideBy: 80, showNumber: false }
  const next = updatePropertyDisplay(updatePropertyDisplay(list, 'value', { number }), prop.id, { number })
  const valueId = crypto.randomUUID(), valueCopy = duplicateValueProperty(next, valueId)
  assert.deepEqual(valueCopy.propertyDisplay[valueId].number, number)
  assert.notEqual(valueCopy.propertyDisplay[valueId].number, number)
  const copyId = crypto.randomUUID(), copy = applyPropertyMenuAction(next, { kind: 'duplicate', id: prop.id, newId: copyId })
  assert.deepEqual(copy.propertyDisplay[copyId].number, number)
  assert.notEqual(copy.propertyDisplay[copyId].number, number)
  const page = lists => [{ id: 'page', title: 'Tasks', parentId: null, content: { type: 'doc', content: [] }, lists }]
  assert.equal(samePages(page([list]), page([next])), false)
  assert.equal(samePages(page([next]), page([JSON.parse(JSON.stringify(next))])), true)
})

const { taskPropertyEntries } = await import('../src/features/notebook/propertyDisplay.ts')
test('Value and Image can be removed from task layout and restored without losing values', () => {
  const original = { ...list, items: list.items.map(item => ({ ...item, cover: 'https://example.com/image.png' })) }
  let next = updatePropertyDisplay(updatePropertyDisplay(original, 'value', { visibility: 'hidden' }), 'image', { visibility: 'hidden' })
  assert.equal(propertyShown(next, 'value', 12), false)
  assert.equal(propertyShown(next, 'image', next.items[0].cover), false)
  assert.deepEqual(next.items, original.items)
  assert.ok(validLists([next]))
  next = updatePropertyDisplay(next, 'image', { visibility: 'always' })
  assert.equal(propertyShown(next, 'image', next.items[0].cover), true)
})
test('built-in and custom property order is shared, serializable, and independent of values', () => {
  let next = updatePropertyDisplay(list, prop.id, { before: 'status' })
  assert.deepEqual(taskPropertyEntries(next).map(p => p.id), [prop.id, 'status', 'date', 'value', 'image'])
  next = updatePropertyDisplay(next, 'image', { before: 'status' })
  next = updatePropertyDisplay(next, 'date', { before: null })
  assert.deepEqual(taskPropertyEntries(next).map(p => p.id), [prop.id, 'image', 'status', 'value', 'date'])
  assert.ok(validLists([next]))
  assert.deepEqual(taskPropertyEntries(JSON.parse(JSON.stringify(next))), taskPropertyEntries(next))
  assert.deepEqual(next.items, list.items)
  assert.equal(updatePropertyDisplay(next, 'unknown', { before: 'value' }), next)
  assert.equal(updatePropertyDisplay(next, 'value', { before: 'unknown' }), next)
  const page = lists => [{ id: 'page', title: 'Tasks', parentId: null, content: { type: 'doc', content: [] }, lists }]
  assert.equal(samePages(page([list]), page([next])), false)
  assert.equal(samePages(page([next]), page([{ ...next, propertyDisplay: Object.fromEntries(Object.entries(next.propertyDisplay).map(([id, settings]) => [id, { ...settings, name: null, number: null, visibility: 'always' }])) }])), true)
  const removed = removeTaskProperty(next, prop.id)
  assert.ok(validLists([removed]))
  assert.ok(!taskPropertyEntries(removed).some(p => p.id === prop.id))
  for (const order of [-1, 34, .5, true, '1']) assert.equal(validPropertyDisplay({ image: { order } }, [prop]), false)
})
