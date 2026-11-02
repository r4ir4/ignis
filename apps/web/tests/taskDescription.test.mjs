import test from 'node:test'
import assert from 'node:assert/strict'
import { taskDescriptionDocument, taskDescriptionText } from '../src/features/notebook/taskDescription.ts'
import { validItem, patchPersonalItem } from '../src/features/notebook/personalLists.ts'
import { samePages } from '../src/features/notebook/notebookModel.ts'
const item = { id: '5fb9ff07-a8a5-473e-b7be-cf0dae8b5014', title: 'Task', status: 'To do', date: null, value: null, cover: null, description: '* Teste\n\nKeep <literal> text' }
const body = { type: 'doc', content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Notes', marks: [{ type: 'bold' }] }] }, { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Check me' }] }] }] }] }
test('legacy task descriptions retain literal characters and blank lines without mutating old records', () => {
  const document = taskDescriptionDocument(item)
  assert.equal(taskDescriptionText(document), item.description)
  assert.equal(document.content[0].content[0].text, '* Teste')
  assert.equal(document.content[1].type, 'paragraph')
  assert.equal(item.descriptionContent, undefined)
})
test('rich task notes round trip while summaries stay bounded and changes remain visible to persistence', () => {
  const rich = { ...item, description: taskDescriptionText(body), descriptionContent: body }
  assert.ok(validItem(rich))
  assert.deepEqual(taskDescriptionDocument(JSON.parse(JSON.stringify(rich))), body)
  const list = { id: crypto.randomUUID(), name: 'Tasks', items: [item] }
  const changed = patchPersonalItem(list, item.id, { description: rich.description, descriptionContent: body })
  assert.deepEqual(changed.items[0].descriptionContent, body)
  const pages = [{ id: 'page', title: 'Tasks', parentId: null, content: { type: 'doc', content: [] }, lists: [list] }]
  assert.equal(samePages(pages, [{ ...pages[0], lists: [changed] }]), false)
  assert.equal(samePages(pages, [{ ...pages[0], lists: [{ ...list, items: [{ ...item, descriptionContent: null }] }] }]), true)
  assert.equal(taskDescriptionText({ type: 'doc', content: [{ type: 'text', text: 'x'.repeat(6000) }] }).length, 5000)
})
test('task notes reject malformed and excessively nested documents', () => {
  assert.equal(validItem({ ...item, descriptionContent: { type: 'paragraph' } }), false)
  let node = { type: 'paragraph' }
  for (let i = 0; i < 42; i++) node = { type: 'blockquote', content: [node] }
  assert.equal(validItem({ ...item, descriptionContent: { type: 'doc', content: [node] } }), false)
})
