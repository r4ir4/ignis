import test from 'node:test'
import assert from 'node:assert/strict'
import { getSchema } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { layoutNodeExtensions, moveColumnOutsideRow, moveColumnToRow, reorderColumns, setColumnWidths, resizeColumns, editTabs, outlineHeadings } from '../src/features/notebook/layoutBlocks.ts'
import { layoutBlockDefinitions, columnWidths, dragColumnBoundary, validColumnWidths } from '../src/features/notebook/blockCatalog.ts'
import { writingExtensions } from '../src/features/notebook/writingBlocks.ts'
import { BlockColors, setBlockColor } from '../src/features/notebook/blockColors.ts'
import { blockStyles, canTurnInto, changeBlock } from '../src/features/notebook/blockActions.ts'
import { EditorState, NodeSelection, TextSelection } from '@tiptap/pm/state'
import { history, undo, redo } from '@tiptap/pm/history'
import { moveBlock } from '../src/features/notebook/moveBlock.ts'

const schema = getSchema([StarterKit, Image, TaskList, TaskItem.configure({ nested: true }), BlockColors, ...writingExtensions, ...layoutNodeExtensions])
const doc = schema.nodeFromJSON({ type: 'doc', content: [
  { type: 'paragraph', content: [{ type: 'text', text: 'First', marks: [{ type: 'bold' }] }] },
  { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Nested item' }] }] }] },
  { type: 'image', attrs: { src: 'https://example.com/image.png', alt: 'An image' } },
  { type: 'paragraph', content: [{ type: 'text', text: 'Last' }] },
] })
const start = index => Array.from({ length: index }, (_, i) => doc.child(i).nodeSize).reduce((a, b) => a + b, 0)

test('moving a list moves its entire structure and retains the cursor in its text', () => {
  const state = EditorState.create({ doc, selection: TextSelection.create(doc, start(1) + 4) })
  const tr = moveBlock(state, -1)
  assert.ok(tr)
  assert.deepEqual(tr.doc.child(0).toJSON(), doc.child(1).toJSON())
  assert.deepEqual(tr.doc.child(1).toJSON(), doc.child(0).toJSON())
  assert.equal(tr.selection.from, 4)
  assert.equal(tr.selection.$from.parent.textContent, 'Nested item')
})

test('image moves preserve its attributes, its node selection and all other blocks', () => {
  const state = EditorState.create({ doc, selection: NodeSelection.create(doc, start(2)) })
  const tr = moveBlock(state, 1)
  assert.ok(tr)
  assert.deepEqual(tr.doc.child(3).toJSON(), doc.child(2).toJSON())
  assert.ok(tr.selection instanceof NodeSelection)
  assert.equal(tr.selection.node.attrs.alt, 'An image')
  assert.deepEqual(tr.doc.child(1).toJSON(), doc.child(1).toJSON())
})

test('block movement is one undoable transaction and redo restores its exact JSON', () => {
  let state = EditorState.create({ doc, selection: TextSelection.create(doc, 2, 5), plugins: [history()] })
  state = state.apply(moveBlock(state, 1))
  const moved = state.doc.toJSON()
  assert.equal(state.selection.to - state.selection.from, 3)
  assert.ok(undo(state, tr => { state = state.apply(tr) }))
  assert.deepEqual(state.doc.toJSON(), doc.toJSON())
  assert.ok(redo(state, tr => { state = state.apply(tr) }))
  assert.deepEqual(state.doc.toJSON(), moved)
})

test('boundary moves and text selections spanning multiple blocks are ignored', () => {
  assert.equal(moveBlock(EditorState.create({ doc, selection: TextSelection.create(doc, 1) }), -1), null)
  assert.equal(moveBlock(EditorState.create({ doc, selection: TextSelection.create(doc, start(3) + 1) }), 1), null)
  assert.equal(moveBlock(EditorState.create({ doc, selection: TextSelection.create(doc, 1, start(1) + 4) }), 1), null)
})

test('undoing a move keeps text typed immediately before the move', () => {
  let state = EditorState.create({ doc, selection: TextSelection.create(doc, 2), plugins: [history()] })
  state = state.apply(state.tr.insertText('New '))
  const typed = state.doc.toJSON()
  state = state.apply(moveBlock(state, 1))
  assert.ok(undo(state, tr => { state = state.apply(tr) }))
  assert.deepEqual(state.doc.toJSON(), typed)
})


test('duplicating a list or image preserves the whole block and is one undo step', () => {
  for (const index of [1, 2]) {
    let state = EditorState.create({ doc, plugins: [history()] })
    const tr = changeBlock(state, start(index), 'duplicate')
    assert.ok(tr)
    state = state.apply(tr)
    assert.deepEqual(state.doc.child(index + 1).toJSON(), doc.child(index).toJSON())
    assert.ok(undo(state, tr => { state = state.apply(tr) }))
    assert.deepEqual(state.doc.toJSON(), doc.toJSON())
    assert.ok(redo(state, tr => { state = state.apply(tr) }))
    assert.equal(state.doc.childCount, doc.childCount + 1)
  }
})

test('deleting blocks is undoable and deleting the final block leaves an editable paragraph', () => {
  let state = EditorState.create({ doc, plugins: [history()] })
  state = state.apply(changeBlock(state, start(2), 'delete'))
  assert.deepEqual(state.doc.child(1).toJSON(), doc.child(1).toJSON())
  assert.equal(state.doc.childCount, doc.childCount - 1)
  undo(state, tr => { state = state.apply(tr) })
  assert.deepEqual(state.doc.toJSON(), doc.toJSON())
  const single = schema.nodes.doc.create(null, doc.firstChild)
  const removed = changeBlock(EditorState.create({ doc: single }), 0, 'delete')
  removed.doc.check()
  assert.equal(removed.doc.firstChild.type.name, 'paragraph')
  assert.equal(removed.doc.textContent, '')
  assert.equal(changeBlock(state, 1, 'delete'), null)
})

test('Turn into retains text and marks in supported styles and every conversion can be undone', () => {
  const source = schema.nodes.doc.create(null, doc.firstChild)
  for (const style of blockStyles.filter(s => s.id !== 'text')) {
    let state = EditorState.create({ doc: source, plugins: [history()] })
    const tr = changeBlock(state, 0, style.id)
    assert.ok(tr, style.id)
    tr.doc.check()
    assert.equal(tr.doc.textContent, source.textContent)
    if (style.id !== 'code') {
      let bold = false
      tr.doc.descendants(node => { if (node.isText && node.marks.some(mark => mark.type.name === 'bold')) bold = true })
      assert.ok(bold, style.id)
    }
    state = state.apply(tr)
    undo(state, tr => { state = state.apply(tr) })
    assert.deepEqual(state.doc.toJSON(), source.toJSON())
  }
  assert.equal(canTurnInto(doc.child(2)), false)
  assert.equal(changeBlock(EditorState.create({ doc }), start(2), 'text'), null)
})

test('list conversion retains nesting and converting a list to text retains all entries', () => {
  const nested = schema.nodeFromJSON({ type: 'doc', content: [{ type: 'bulletList', content: [{ type: 'listItem', content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Parent' }] },
    { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Child' }] }] }] },
  ] }] }] })
  const converted = changeBlock(EditorState.create({ doc: nested }), 0, 'checklist')
  converted.doc.check()
  assert.equal(converted.doc.firstChild.type.name, 'taskList')
  assert.equal(converted.doc.firstChild.firstChild.child(1).type.name, 'taskList')
  const flattened = changeBlock(EditorState.create({ doc: converted.doc }), 0, 'text')
  flattened.doc.check()
  assert.equal(flattened.doc.childCount, 2)
  assert.equal(flattened.doc.child(0).textContent, 'Parent')
  assert.equal(flattened.doc.child(1).textContent, 'Child')
})


test('block text and background colors are independent, resettable and individually undoable', () => {
  let state = EditorState.create({ doc, plugins: [history()] })
  state = state.apply(setBlockColor(state, 0, 'textColor', 'blue'))
  assert.equal(state.doc.firstChild.attrs.textColor, 'blue')
  state = state.apply(setBlockColor(state, 0, 'backgroundColor', 'yellow'))
  assert.equal(state.doc.firstChild.attrs.textColor, 'blue')
  assert.equal(state.doc.firstChild.attrs.backgroundColor, 'yellow')
  assert.deepEqual(state.doc.firstChild.content.toJSON(), doc.firstChild.content.toJSON())
  undo(state, tr => { state = state.apply(tr) })
  assert.equal(state.doc.firstChild.attrs.textColor, 'blue')
  assert.equal(state.doc.firstChild.attrs.backgroundColor, null)
  undo(state, tr => { state = state.apply(tr) })
  assert.deepEqual(state.doc.toJSON(), doc.toJSON())
  state = state.apply(setBlockColor(state, 0, 'backgroundColor', 'green'))
  state = state.apply(setBlockColor(state, 0, 'textColor', 'red'))
  state = state.apply(setBlockColor(state, 0, 'textColor', null))
  assert.equal(state.doc.firstChild.attrs.backgroundColor, 'green')
  assert.equal(state.doc.firstChild.attrs.textColor, null)
  assert.equal(setBlockColor(state, 0, 'textColor', 'invalid'), null)
  assert.equal(setBlockColor(state, start(2), 'textColor', 'blue'), null)
})

test('block colors survive conversions and duplication without changing nested content', () => {
  let state = EditorState.create({ doc })
  state = state.apply(setBlockColor(state, start(1), 'textColor', 'purple'))
  state = state.apply(setBlockColor(state, start(1), 'backgroundColor', 'gray'))
  const converted = changeBlock(state, start(1), 'checklist')
  converted.doc.check()
  assert.equal(converted.doc.child(1).attrs.textColor, 'purple')
  assert.equal(converted.doc.child(1).attrs.backgroundColor, 'gray')
  assert.equal(converted.doc.child(1).textContent, doc.child(1).textContent)
  const copy = changeBlock(EditorState.create({ doc: converted.doc }), start(1), 'duplicate')
  assert.deepEqual(copy.doc.child(2).toJSON(), converted.doc.child(1).toJSON())
  const flattened = changeBlock(EditorState.create({ doc: converted.doc }), start(1), 'text')
  assert.equal(flattened.doc.child(1).attrs.textColor, 'purple')
  assert.equal(flattened.doc.child(1).attrs.backgroundColor, 'gray')
})

const writingSchema = getSchema([StarterKit, Image, TaskList, TaskItem, BlockColors, ...writingExtensions, ...layoutNodeExtensions])
const writingContent = { type: 'doc', content: [
  { type: 'details', attrs: { open: true }, content: [{ type: 'detailsSummary', content: [{ type: 'text', text: 'Open me' }] }, { type: 'detailsContent', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Nested writing', marks: [{ type: 'bold' }] }] }] }] },
  { type: 'callout', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Remember this' }] }] },
  { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cell one' }] }] }, { type: 'tableCell', content: [{ type: 'paragraph' }] }] }] },
  { type: 'pageLink', attrs: { pageId: '11111111-1111-4111-8111-111111111111', title: 'Linked page' } },
] }
test('writing blocks retain nested content, table cells, page targets and toggle state through JSON', () => {
  const doc = writingSchema.nodeFromJSON(writingContent)
  doc.check()
  const restored = writingSchema.nodeFromJSON(JSON.parse(JSON.stringify(doc.toJSON())))
  restored.check()
  assert.deepEqual(restored.toJSON(), doc.toJSON())
  assert.equal(restored.firstChild.attrs.open, true)
  assert.equal(restored.child(2).firstChild.firstChild.textContent, 'Cell one')
})
test('new writing blocks duplicate and move as whole blocks, with independent undo', () => {
  for (let index = 0; index < writingContent.content.length; index++) {
    const doc = writingSchema.nodeFromJSON(writingContent)
    let pos = 0
    for (let i = 0; i < index; i++) pos += doc.child(i).nodeSize
    let state = EditorState.create({ doc, selection: NodeSelection.create(doc, pos), plugins: [history()] })
    state = state.apply(changeBlock(state, pos, 'duplicate'))
    assert.deepEqual(state.doc.child(index + 1).toJSON(), doc.child(index).toJSON())
    assert.ok(undo(state, tr => { state = state.apply(tr) }))
    assert.deepEqual(state.doc.toJSON(), doc.toJSON())
    if (index > 0) {
      state = state.apply(moveBlock(state, -1))
      assert.deepEqual(state.doc.child(index - 1).toJSON(), doc.child(index).toJSON())
    }
  }
})
test('Markdown exports include callouts, tables, toggles and page links', async () => {
  const { pageMarkdown } = await import('../src/features/notebook/pageExport.ts')
  const result = pageMarkdown({ title: 'Writing', content: writingContent })
  assert.match(result, /<summary>Open me<\/summary>/)
  assert.match(result, /\*\*Nested writing\*\*/)
  assert.match(result, /> Remember this/)
  assert.match(result, /\| Cell one \|/)
  assert.match(result, /\[Linked page\]\(#page=11111111-1111-4111-8111-111111111111\)/)
})

test('page image upload validates files and only accepts stored image URLs', async t => {
  const { uploadNotebookImage } = await import('../src/features/notebook/imageUpload.ts')
  const signal = new AbortController().signal
  let calls = 0
  const url = '/api/notebook/cover-images/' + 'a'.repeat(64) + '.webp'
  t.mock.method(globalThis, 'fetch', async (endpoint, options) => {
    calls++
    assert.equal(endpoint, '/api/notebook/cover-images')
    assert.equal(options.headers['Content-Type'], 'image/png')
    assert.ok(options.body instanceof File)
    return new Response(JSON.stringify({ url }))
  })
  await assert.rejects(uploadNotebookImage(new File(['x'], 'bad.svg', { type: 'image/svg+xml' }), signal), /JPEG/)
  await assert.rejects(uploadNotebookImage(new File([new Uint8Array(8 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' }), signal), /8 MB/)
  assert.equal(calls, 0)
  assert.equal(await uploadNotebookImage(new File(['png'], 'photo.png', { type: 'image/png' }), signal), url)
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ url: 'https://unexpected.test/image' })))
  await assert.rejects(uploadNotebookImage(new File(['png'], 'photo.png', { type: 'image/png' }), signal), /invalid image URL/)
})
test('page image upload surfaces server errors and propagates cancellation', async t => {
  const { uploadNotebookImage } = await import('../src/features/notebook/imageUpload.ts')
  const file = new File(['png'], 'photo.png', { type: 'image/png' })
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ detail: 'Sign in again.' }), { status: 401 }))
  await assert.rejects(uploadNotebookImage(file, new AbortController().signal), /Sign in again/)
  const controller = new AbortController()
  t.mock.method(globalThis, 'fetch', async (_url, options) => { options.signal.throwIfAborted(); throw new Error('Should be aborted') })
  controller.abort()
  await assert.rejects(uploadNotebookImage(file, controller.signal), { name: 'AbortError' })
})

test('callout icons keep their choice through JSON, duplication and undo', () => {
  const doc = writingSchema.nodeFromJSON({ type: 'doc', content: [{ type: 'callout', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Important' }] }] }] })
  assert.equal(doc.firstChild.attrs.icon, 'emoji:💡')
  let state = EditorState.create({ doc, plugins: [history()] })
  state = state.apply(state.tr.setNodeMarkup(0, undefined, { ...doc.firstChild.attrs, icon: 'emoji:🔥' }))
  assert.equal(state.doc.firstChild.attrs.icon, 'emoji:🔥')
  state = state.apply(changeBlock(state, 0, 'duplicate'))
  assert.equal(state.doc.child(1).attrs.icon, 'emoji:🔥')
  assert.ok(undo(state, tr => { state = state.apply(tr) }))
  assert.equal(state.doc.childCount, 1)
  assert.equal(state.doc.firstChild.attrs.icon, 'emoji:🔥')
  assert.ok(undo(state, tr => { state = state.apply(tr) }))
  assert.equal(state.doc.firstChild.attrs.icon, 'emoji:💡')
})

test('Turn into toggle keeps the first list item as title and preserves nested and remaining items', () => {
  const source = schema.nodeFromJSON({ type: 'doc', content: [{ type: 'bulletList', attrs: { backgroundColor: 'blue' }, content: [
    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Title', marks: [{ type: 'bold' }] }] }, { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Nested' }] }] }] }] },
    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Second' }] }] },
  ] }] })
  let state = EditorState.create({ doc: source, plugins: [history()] })
  state = state.apply(changeBlock(state, 0, 'toggle'))
  state.doc.check()
  const toggle = state.doc.firstChild
  assert.equal(toggle.type.name, 'details')
  assert.equal(toggle.attrs.open, true)
  assert.equal(toggle.attrs.backgroundColor, 'blue')
  assert.equal(toggle.firstChild.textContent, 'Title')
  assert.equal(toggle.firstChild.firstChild.marks[0].type.name, 'bold')
  assert.equal(toggle.child(1).child(0).textContent, 'Nested')
  assert.equal(toggle.child(1).child(1).textContent, 'Second')
  assert.ok(undo(state, tr => { state = state.apply(tr) }))
  assert.deepEqual(state.doc.toJSON(), source.toJSON())
})
test('callout and toggle conversions preserve rich content when converting back to text', () => {
  for (const style of ['callout', 'toggle']) {
    const source = schema.nodeFromJSON({ type: 'doc', content: [{ type: 'paragraph', attrs: { textColor: 'green' }, content: [{ type: 'text', text: 'Keep this', marks: [{ type: 'italic' }] }] }] })
    let state = EditorState.create({ doc: source })
    state = state.apply(changeBlock(state, 0, style))
    state.doc.check()
    if (style === 'callout') assert.equal(state.doc.firstChild.attrs.icon, 'emoji:💡')
    state = state.apply(changeBlock(state, 0, 'text'))
    state.doc.check()
    assert.equal(state.doc.firstChild.textContent, 'Keep this')
    assert.equal(state.doc.firstChild.firstChild.marks[0].type.name, 'italic')
    assert.equal(state.doc.firstChild.attrs.textColor, 'green')
  }
})

test('toggle heading levels retain title marks, rich body and open state through conversion and undo', () => {
  for (const level of [1, 2, 3]) {
    const original = writingSchema.nodeFromJSON({ type: 'doc', content: [{ type: 'details', attrs: { open: false }, content: [
      { type: 'detailsSummary', content: [{ type: 'text', text: 'Section', marks: [{ type: 'bold' }] }] },
      { type: 'detailsContent', content: [{ type: 'image', attrs: { src: 'https://example.com/image.png', alt: 'Keep image' } }, { type: 'paragraph', content: [{ type: 'text', text: 'Keep body' }] }] },
    ] }] })
    let state = EditorState.create({ doc: original, plugins: [history()] })
    state = state.apply(changeBlock(state, 0, `toggleHeading${level}`))
    state.doc.check()
    assert.equal(state.doc.firstChild.firstChild.attrs.headingLevel, level)
    assert.equal(state.doc.firstChild.attrs.open, false)
    assert.deepEqual(state.doc.firstChild.firstChild.content.toJSON(), original.firstChild.firstChild.content.toJSON())
    assert.deepEqual(state.doc.firstChild.child(1).toJSON(), original.firstChild.child(1).toJSON())
    assert.equal(canTurnInto(state.doc.firstChild, 'text'), false)
    assert.equal(changeBlock(state, 0, 'text'), null)
    const restored = writingSchema.nodeFromJSON(JSON.parse(JSON.stringify(state.doc.toJSON())))
    assert.equal(restored.firstChild.firstChild.attrs.headingLevel, level)
    assert.ok(undo(state, tr => { state = state.apply(tr) }))
    assert.deepEqual(state.doc.toJSON(), original.toJSON())
  }
})
test('toggle headings convert from headings and export with their heading level', async () => {
  const { pageMarkdown } = await import('../src/features/notebook/pageExport.ts')
  const original = writingSchema.nodeFromJSON({ type: 'doc', content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Section' }] }] })
  let state = EditorState.create({ doc: original })
  state = state.apply(changeBlock(state, 0, 'toggleHeading2'))
  state.doc.check()
  assert.equal(state.doc.firstChild.firstChild.textContent, 'Section')
  assert.equal(state.doc.firstChild.firstChild.attrs.headingLevel, 2)
  assert.match(pageMarkdown({ title: 'Test', content: state.doc.toJSON() }), /<summary><h2>Section<\/h2><\/summary>/)
  state = state.apply(changeBlock(state, 0, 'heading2'))
  state.doc.check()
  assert.equal(state.doc.firstChild.type.name, 'heading')
  assert.equal(state.doc.firstChild.textContent, 'Section')
})

const { moveBlockTo, moveBlocksTo, blockSelectionKey, selectBlockGroup, createBlockSelectionPlugin } = await import('../src/features/notebook/blockDrop.ts')
const dropDoc = () => writingSchema.nodeFromJSON({ type: 'doc', content: [
  { type: 'paragraph', content: [{ type: 'text', text: 'Move me', marks: [{ type: 'bold' }] }], attrs: { textColor: 'blue' } },
  { type: 'details', attrs: { open: false }, content: [{ type: 'detailsSummary', attrs: { headingLevel: 2 }, content: [{ type: 'text', text: 'Toggle' }] }, { type: 'detailsContent', content: [{ type: 'paragraph' }] }] },
  { type: 'callout', attrs: { icon: 'emoji:🔥' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Inside' }] }] },
  { type: 'paragraph', content: [{ type: 'text', text: 'Last' }] },
] })
function findBlock(doc, type, text) { let found; doc.descendants((node, pos) => { if (found == null && node.type.name === type && (text == null || node.textContent === text)) found = pos }); assert.notEqual(found, undefined); return found }
test('dragging into a collapsed toggle replaces its empty placeholder, opens it, and retains heading style and rich text', () => {
  const original = dropDoc(), container = findBlock(original, 'details'), body = findBlock(original, 'detailsContent')
  let state = EditorState.create({ doc: original, plugins: [history()] })
  state = state.apply(moveBlockTo(state, 0, { pos: body + 1, container }))
  state.doc.check()
  assert.equal(state.doc.childCount, 3)
  const toggle = state.doc.firstChild
  assert.equal(toggle.attrs.open, true)
  assert.equal(toggle.firstChild.attrs.headingLevel, 2)
  assert.equal(toggle.child(1).childCount, 1)
  assert.deepEqual(toggle.child(1).firstChild.toJSON(), original.firstChild.toJSON())
  assert.ok(undo(state, tr => { state = state.apply(tr) }))
  assert.deepEqual(state.doc.toJSON(), original.toJSON())
  assert.ok(redo(state, tr => { state = state.apply(tr) }))
  assert.equal(state.doc.firstChild.child(1).firstChild.textContent, 'Move me')
})
test('dragging the only child out of a toggle or callout leaves an editable container and moves rather than copies', () => {
  for (const type of ['detailsContent', 'callout']) {
    let state = EditorState.create({ doc: dropDoc(), plugins: [history()] })
    const parentPos = findBlock(state.doc, type)
    if (type === 'detailsContent') state = state.apply(moveBlockTo(state, 0, { pos: parentPos + 1, container: findBlock(state.doc, 'details') }))
    const source = findBlock(state.doc, 'paragraph', type === 'detailsContent' ? 'Move me' : 'Inside')
    const before = state.doc
    const originalNode = before.nodeAt(source).toJSON()
    state = state.apply(moveBlockTo(state, source, { pos: before.content.size }))
    state.doc.check()
    assert.deepEqual(state.doc.lastChild.toJSON(), originalNode)
    const container = state.doc.nodeAt(findBlock(state.doc, type))
    assert.equal(container.childCount, 1)
    assert.equal(container.firstChild.type.name, 'paragraph')
    assert.equal(container.firstChild.textContent, '')
    assert.ok(undo(state, tr => { state = state.apply(tr) }))
    assert.deepEqual(state.doc.toJSON(), before.toJSON())
  }
})
test('moving across containers preserves callout icons and supports nested duplicate, delete and colors', () => {
  let state = EditorState.create({ doc: dropDoc() })
  const source = findBlock(state.doc, 'paragraph', 'Inside'), toggle = findBlock(state.doc, 'details'), target = findBlock(state.doc, 'detailsContent') + 1
  state = state.apply(moveBlockTo(state, source, { pos: target, container: toggle }))
  state.doc.check()
  assert.equal(state.doc.nodeAt(findBlock(state.doc, 'callout')).attrs.icon, 'emoji:🔥')
  const nested = findBlock(state.doc, 'paragraph', 'Inside')
  state = state.apply(setBlockColor(state, nested, 'backgroundColor', 'green'))
  state = state.apply(changeBlock(state, nested, 'duplicate'))
  const body = state.doc.nodeAt(findBlock(state.doc, 'detailsContent'))
  assert.equal(body.childCount, 2)
  assert.equal(body.child(1).attrs.backgroundColor, 'green')
  state = state.apply(changeBlock(state, nested, 'delete'))
  assert.equal(state.doc.nodeAt(findBlock(state.doc, 'detailsContent')).childCount, 1)
})
test('self drops, drops into descendants, and summary targets do not mutate the document', () => {
  const doc = dropDoc(), state = EditorState.create({ doc })
  const toggle = findBlock(doc, 'details'), body = findBlock(doc, 'detailsContent')
  assert.equal(moveBlockTo(state, toggle, { pos: body + 1, container: toggle }), null)
  assert.equal(moveBlockTo(state, 0, { pos: 1 }), null)
  assert.equal(moveBlockTo(state, 0, { pos: toggle + 2 }), null)
  assert.equal(moveBlockTo(state, findBlock(doc, 'detailsSummary'), { pos: doc.content.size }), null)
  assert.equal(moveBlockTo(state, 0, { pos: 0 }), null)
})

test('whole callouts and images can nest without losing their attributes or descendants', () => {
  const original = dropDoc()
  let state = EditorState.create({ doc: original })
  const callout = findBlock(original, 'callout'), body = findBlock(original, 'detailsContent'), toggle = findBlock(original, 'details')
  const expected = original.nodeAt(callout).toJSON()
  state = state.apply(moveBlockTo(state, callout, { pos: body + 1, container: toggle }))
  state.doc.check()
  assert.deepEqual(state.doc.nodeAt(findBlock(state.doc, 'callout')).toJSON(), expected)
  const image = writingSchema.nodes.image.create({ src: 'https://example.com/photo.png', alt: 'Keep this photo' })
  state = state.apply(state.tr.insert(0, image))
  state = state.apply(moveBlockTo(state, 0, { pos: findBlock(state.doc, 'callout') + 1, container: findBlock(state.doc, 'callout') }))
  state.doc.check()
  assert.deepEqual(state.doc.nodeAt(findBlock(state.doc, 'callout')).firstChild.toJSON(), image.toJSON())
})
test('nested keyboard movement reorders siblings without moving the outer container', () => {
  const original = writingSchema.nodeFromJSON({ type: 'doc', content: [{ type: 'callout', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A' }] }, { type: 'paragraph', content: [{ type: 'text', text: 'B' }] }] }, { type: 'paragraph', content: [{ type: 'text', text: 'Outside' }] }] })
  const pos = findBlock(original, 'paragraph', 'B')
  let state = EditorState.create({ doc: original, selection: TextSelection.create(original, pos + 1) })
  state = state.apply(moveBlock(state, -1))
  assert.equal(state.doc.firstChild.type.name, 'callout')
  assert.equal(state.doc.firstChild.firstChild.textContent, 'B')
  assert.equal(state.doc.lastChild.textContent, 'Outside')
  assert.equal(state.selection.$from.parent.textContent, 'B')
})

test('registered layout blocks have valid schemas, stable tab IDs and independent instances', () => {
  for (const definition of layoutBlockDefinitions) {
    const node = writingSchema.nodeFromJSON(definition.create())
    node.check()
    assert.deepEqual(writingSchema.nodeFromJSON(JSON.parse(JSON.stringify(node.toJSON()))).toJSON(), node.toJSON())
    if (definition.id === 'tabs') assert.notEqual(definition.create().content[0].attrs.id, definition.create().content[0].attrs.id)
  }
})
test('reducing columns moves rich content into the last remaining column and can be undone', () => {
  const json = layoutBlockDefinitions.find(block => block.id === 'columns-5').create()
  json.content[4].content = [{ type: 'paragraph', content: [{ type: 'text', text: 'Keep last column', marks: [{ type: 'bold' }] }] }]
  const original = writingSchema.nodeFromJSON({ type: 'doc', content: [json] })
  let state = EditorState.create({ doc: original, plugins: [history()] })
  state = state.apply(resizeColumns(state, 0, 2))
  state.doc.check()
  assert.equal(state.doc.firstChild.childCount, 2)
  assert.equal(state.doc.firstChild.child(1).textContent, 'Keep last column')
  assert.equal(state.doc.firstChild.child(1).firstChild.firstChild.marks[0].type.name, 'bold')
  assert.ok(undo(state, tr => { state = state.apply(tr) }))
  assert.deepEqual(state.doc.toJSON(), original.toJSON())
  assert.equal(resizeColumns(state, 0, 6), null)
})
test('tab add, rename, reorder and removal retain contents and are undoable', () => {
  const json = layoutBlockDefinitions.find(block => block.id === 'tabs').create()
  json.content[1].content = [{ type: 'paragraph', content: [{ type: 'text', text: 'Keep second tab' }] }]
  let state = EditorState.create({ doc: writingSchema.nodeFromJSON({ type: 'doc', content: [json] }), plugins: [history()] })
  const id = state.doc.firstChild.child(1).attrs.id
  state = state.apply(editTabs(state, 0, 'rename', id, 'Details'))
  state = state.apply(editTabs(state, 0, 'left', id))
  assert.equal(state.doc.firstChild.firstChild.attrs.title, 'Details')
  state = state.apply(editTabs(state, 0, 'add'))
  assert.equal(state.doc.firstChild.childCount, 3)
  const before = state.doc.toJSON()
  state = state.apply(editTabs(state, 0, 'remove', id))
  state.doc.check()
  assert.equal(state.doc.firstChild.childCount, 2)
  assert.ok(state.doc.textContent.includes('Keep second tab'))
  assert.ok(undo(state, tr => { state = state.apply(tr) }))
  assert.deepEqual(state.doc.toJSON(), before)
})
test('outline finds ordinary and toggle headings inside columns and inactive tabs and updates after edits', () => {
  const json = layoutBlockDefinitions.find(block => block.id === 'tabs').create()
  json.content[1].content = [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Hidden heading' }] }]
  const doc = writingSchema.nodeFromJSON({ type: 'doc', content: [json, { type: 'details', content: [{ type: 'detailsSummary', attrs: { headingLevel: 1 }, content: [{ type: 'text', text: 'Toggle heading' }] }, { type: 'detailsContent', content: [{ type: 'paragraph' }] }] }] })
  assert.deepEqual(outlineHeadings(doc).map(({ title, level }) => ({ title, level })), [{ title: 'Hidden heading', level: 2 }, { title: 'Toggle heading', level: 1 }])
  const heading = outlineHeadings(doc)[0]
  const state = EditorState.create({ doc })
  const changed = state.apply(state.tr.insertText('Updated ', heading.pos + 1))
  assert.equal(outlineHeadings(changed.doc)[0].title, 'Updated Hidden heading')
})
test('blocks move across columns and tab panels and layout export includes all hidden content', async () => {
  const columns = layoutBlockDefinitions.find(block => block.id === 'columns-2').create(), tabs = layoutBlockDefinitions.find(block => block.id === 'tabs').create()
  const original = writingSchema.nodeFromJSON({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Move across layouts' }] }, columns, tabs, { type: 'tableOfContents' }, { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Overview' }] }] })
  let state = EditorState.create({ doc: original, plugins: [history()] })
  state = state.apply(moveBlockTo(state, 0, { pos: findBlock(state.doc, 'column') + 1 }))
  const source = findBlock(state.doc, 'paragraph', 'Move across layouts')
  state = state.apply(moveBlockTo(state, source, { pos: findBlock(state.doc, 'tabPanel') + 1 }))
  state.doc.check()
  const { pageMarkdown } = await import('../src/features/notebook/pageExport.ts')
  const exported = pageMarkdown({ title: 'Layouts', content: state.doc.toJSON() })
  assert.match(exported, /Move across layouts/)
  assert.match(exported, /Tab 1/)
  assert.match(exported, /Tab 2/)
  assert.match(exported, /- Overview/)
  assert.ok(undo(state, tr => { state = state.apply(tr) }))
  assert.equal(state.doc.nodeAt(findBlock(state.doc, 'column')).textContent, 'Move across layouts')
})

test('adding a tab places typing inside its content instead of selecting the whole layout', () => {
  const json = layoutBlockDefinitions.find(block => block.id === 'tabs').create()
  let state = EditorState.create({ doc: writingSchema.nodeFromJSON({ type: 'doc', content: [json] }) })
  state = state.apply(editTabs(state, 0, 'add'))
  assert.ok(state.selection instanceof TextSelection)
  assert.equal(state.selection.$from.parent.type.name, 'paragraph')
  assert.equal(state.selection.$from.node(2).type.name, 'tabPanel')
  state = state.apply(state.tr.insertText('Typing stays here'))
  assert.equal(state.doc.firstChild.type.name, 'tabs')
  assert.equal(state.doc.firstChild.childCount, 3)
  assert.equal(state.doc.firstChild.child(2).textContent, 'Typing stays here')
})
test('tab navigation is transient, maps across document changes, and does not create page revisions', async () => {
  const { createLayoutNavigationPlugin, layoutNavigationKey, activeTab } = await import('../src/features/notebook/layoutBlocks.ts')
  const json = layoutBlockDefinitions.find(block => block.id === 'tabs').create()
  let state = EditorState.create({ doc: writingSchema.nodeFromJSON({ type: 'doc', content: [json] }), plugins: [createLayoutNavigationPlugin()] })
  const second = state.doc.firstChild.child(1).attrs.id
  const switchTab = state.tr.setMeta(layoutNavigationKey, [{ pos: 0, id: second }])
  assert.equal(switchTab.docChanged, false)
  state = state.apply(switchTab)
  assert.equal(activeTab(state, 0, state.doc.firstChild), second)
  const paragraph = state.schema.nodes.paragraph.create(null, state.schema.text('Before'))
  state = state.apply(state.tr.insert(0, paragraph))
  assert.equal(activeTab(state, paragraph.nodeSize, state.doc.child(1)), second)
})

test('column drag changes only adjacent widths, clamps, persists and is one undo step', () => {
  const original = schema.nodeFromJSON({ type: 'doc', content: [layoutBlockDefinitions[2].create()] })
  let state = EditorState.create({ schema, doc: original, plugins: [history()] })
  const start = columnWidths(null, 4)
  const next = dragColumnBoundary(start, 1, 12, 5)
  assert.deepEqual(next, [25, 37, 13, 25])
  assert.deepEqual(dragColumnBoundary(start, 1, 1000, 5), [25, 45, 5, 25])
  assert.deepEqual(dragColumnBoundary(start, 1, -1000, 5), [25, 5, 45, 25])
  state = state.apply(setColumnWidths(state, 0, next))
  assert.deepEqual(schema.nodeFromJSON(state.doc.toJSON()).firstChild.attrs.widths, next)
  assert.deepEqual(state.doc.firstChild.content.toJSON(), original.firstChild.content.toJSON())
  assert.equal(undo(state, tr => { state = state.apply(tr) }), true)
  assert.deepEqual(state.doc.toJSON(), original.toJSON())
  assert.equal(setColumnWidths(state, 0, [20, 80]), null)
  for (const invalid of [[0, 100], [NaN, 50], [Infinity, 50], ['50', 50]]) assert.equal(validColumnWidths(invalid, 2), false)
})

test('side drops create left and right columns, preserve rich blocks and undo as a single move', () => {
  for (const side of ['left', 'right']) {
    const original = dropDoc(), source = findBlock(original, 'callout'), target = findBlock(original, 'paragraph', 'Last')
    let state = EditorState.create({ doc: original, plugins: [history()] })
    state = state.apply(moveBlockTo(state, source, { pos: target, side }))
    const row = state.doc.lastChild
    assert.equal(row.type.name, 'columns')
    assert.equal(row.childCount, 2)
    assert.deepEqual(row.child(side === 'left' ? 0 : 1).firstChild.toJSON(), original.nodeAt(source).toJSON())
    assert.equal(row.child(side === 'left' ? 1 : 0).textContent, 'Last')
    assert.equal(state.doc.childCount, original.childCount - 1)
    state.doc.check()
    assert.equal(undo(state, tr => { state = state.apply(tr) }), true)
    assert.deepEqual(state.doc.toJSON(), original.toJSON())
    assert.equal(redo(state, tr => { state = state.apply(tr) }), true)
    assert.equal(state.doc.lastChild.childCount, 2)
  }
})

test('side drops extend existing rows up to five columns and retain emptied source containers', () => {
  const original = writingSchema.nodeFromJSON({ type: 'doc', content: [
    { type: 'callout', attrs: { icon: 'emoji:🔥' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Nested source' }] }] },
    { ...layoutBlockDefinitions[2].create(), attrs: { widths: [10, 20, 30, 40] } },
  ] })
  let state = EditorState.create({ doc: original, plugins: [history()] })
  const source = findBlock(state.doc, 'paragraph', 'Nested source'), target = findBlock(state.doc, 'column') + 1
  state = state.apply(moveBlockTo(state, source, { pos: target, side: 'right' }))
  assert.equal(state.doc.firstChild.firstChild.type.name, 'paragraph')
  assert.equal(state.doc.firstChild.textContent, '')
  assert.equal(state.doc.lastChild.childCount, 5)
  assert.equal(state.doc.lastChild.child(1).textContent, 'Nested source')
  assert.deepEqual(state.doc.lastChild.attrs.widths, [8, 20, 16, 24, 32])
  assert.equal(moveBlockTo(state, 0, { pos: findBlock(state.doc, 'column') + 1, side: 'left' }), null)
  state.doc.check()
  assert.equal(undo(state, tr => { state = state.apply(tr) }), true)
  assert.deepEqual(state.doc.toJSON(), original.toJSON())
})

test('side drops reject self, ancestor, descendant and invalid target boundaries', () => {
  const original = dropDoc(), state = EditorState.create({ doc: original })
  const callout = findBlock(original, 'callout'), inside = findBlock(original, 'paragraph', 'Inside')
  for (const [source, target] of [[0, 0], [callout, inside], [inside, callout], [0, 1]]) {
    assert.equal(moveBlockTo(state, source, { pos: target, side: 'right' }), null)
  }
})

const columnRow = (blocks, widths = null) => ({ type: 'columns', attrs: { widths }, content: blocks.map(content => ({ type: 'column', content })) })
const plain = text => ({ type: 'paragraph', content: [{ type: 'text', text }] })
test('moving out removes an empty source column, keeps relative widths and undoes the entire operation', () => {
  const original = writingSchema.nodeFromJSON({ type: 'doc', content: [columnRow([[plain('Move')], [plain('Stay A')], [plain('Stay B')]], [20, 30, 50]), plain('End')] })
  let state = EditorState.create({ doc: original, plugins: [history()] })
  state = state.apply(moveBlockTo(state, findBlock(state.doc, 'paragraph', 'Move'), { pos: state.doc.content.size }))
  state.doc.check()
  assert.equal(state.doc.firstChild.childCount, 2)
  assert.deepEqual(state.doc.firstChild.attrs.widths, [37.5, 62.5])
  assert.equal(state.doc.lastChild.textContent, 'Move')
  assert.equal(state.selection.node.textContent, 'Move')
  assert.equal(undo(state, tr => { state = state.apply(tr) }), true)
  assert.deepEqual(state.doc.toJSON(), original.toJSON())
  assert.equal(redo(state, tr => { state = state.apply(tr) }), true)
  assert.equal(state.doc.firstChild.childCount, 2)
})
test('the final column unwraps with rich blocks intact, including moves into the surviving column', () => {
  for (const targetInside of [false, true]) {
    const original = writingSchema.nodeFromJSON({ type: 'doc', content: [columnRow([[plain('Move')], [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Stay', marks: [{ type: 'bold' }] }] }, plain('Second')]]), plain('End')] })
    let state = EditorState.create({ doc: original, plugins: [history()] })
    const target = targetInside ? findBlock(state.doc, 'paragraph', 'Second') : original.content.size
    state = state.apply(moveBlockTo(state, findBlock(state.doc, 'paragraph', 'Move'), { pos: target }))
    state.doc.check()
    assert.equal(state.doc.firstChild.type.name, 'heading')
    assert.deepEqual(state.doc.firstChild.toJSON(), original.firstChild.child(1).firstChild.toJSON())
    assert.equal(state.selection.node.textContent, 'Move')
    assert.deepEqual(Array.from({ length: state.doc.childCount }, (_, i) => state.doc.child(i).textContent), targetInside ? ['Stay', 'Move', 'Second', 'End'] : ['Stay', 'Second', 'End', 'Move'])
    assert.ok(undo(state, tr => { state = state.apply(tr) }))
    assert.deepEqual(state.doc.toJSON(), original.toJSON())
  }
})
test('partial columns and unrelated empty layouts stay intact, while side drops clean the source row', () => {
  const original = writingSchema.nodeFromJSON({ type: 'doc', content: [columnRow([[plain('Move'), plain('Keep')], [plain('Other')]]), layoutBlockDefinitions[0].create(), plain('End')] })
  let state = EditorState.create({ doc: original })
  state = state.apply(moveBlockTo(state, findBlock(state.doc, 'paragraph', 'Move'), { pos: state.doc.content.size }))
  assert.equal(state.doc.firstChild.childCount, 2)
  assert.equal(state.doc.firstChild.firstChild.textContent, 'Keep')
  assert.deepEqual(state.doc.child(1).toJSON(), original.child(1).toJSON())
  state = state.apply(moveBlockTo(state, findBlock(state.doc, 'paragraph', 'Keep'), { pos: findBlock(state.doc, 'paragraph', 'End'), side: 'left' }))
  state.doc.check()
  assert.equal(state.doc.firstChild.textContent, 'Other')
  assert.equal(state.doc.firstChild.type.name, 'paragraph')
  assert.deepEqual(state.doc.child(1).toJSON(), original.child(1).toJSON())
  assert.equal(state.selection.node.textContent, 'Keep')
})
test('empty nested source columns unwrap without flattening their parent callout', () => {
  const original = writingSchema.nodeFromJSON({ type: 'doc', content: [{ type: 'callout', attrs: { icon: 'emoji:🔥' }, content: [columnRow([[plain('Move')], [plain('Stay')]])] }, plain('End')] })
  let state = EditorState.create({ doc: original, plugins: [history()] })
  state = state.apply(moveBlockTo(state, findBlock(state.doc, 'paragraph', 'Move'), { pos: original.content.size }))
  state.doc.check()
  assert.equal(state.doc.firstChild.type.name, 'callout')
  assert.equal(state.doc.firstChild.attrs.icon, 'emoji:🔥')
  assert.equal(state.doc.firstChild.firstChild.type.name, 'paragraph')
  assert.equal(state.doc.firstChild.textContent, 'Stay')
  assert.equal(state.doc.lastChild.textContent, 'Move')
  assert.ok(undo(state, tr => { state = state.apply(tr) }))
  assert.deepEqual(state.doc.toJSON(), original.toJSON())
})

test('whole columns reorder with every rich block and width, preserving the exact layout on undo', () => {
  const original = writingSchema.nodeFromJSON({ type: 'doc', content: [columnRow([
    [plain('First'), { type: 'callout', attrs: { icon: 'emoji:🔥' }, content: [plain('Nested')] }, { type: 'image', attrs: { src: 'https://example.com/inside.jpg' } }],
    [plain('Second')], [plain('Third')],
  ], [20, 30, 50])] })
  for (const [from, to, expected, widths] of [[0, 2, ['Second', 'Third', 'FirstNested'], [30, 50, 20]], [2, 0, ['Third', 'FirstNested', 'Second'], [50, 20, 30]], [0, 1, ['Second', 'FirstNested', 'Third'], [30, 20, 50]]]) {
    let state = EditorState.create({ doc: original, plugins: [history()] })
    state = state.apply(reorderColumns(state, 0, from, to))
    state.doc.check()
    const row = state.doc.firstChild
    assert.deepEqual(Array.from({ length: row.childCount }, (_, i) => row.child(i).textContent), expected)
    assert.deepEqual(row.attrs.widths, widths)
    assert.deepEqual(row.child(to).toJSON(), original.firstChild.child(from).toJSON())
    assert.equal(state.selection.$from.node(2), row.child(to))
    assert.ok(undo(state, tr => { state = state.apply(tr) }))
    assert.deepEqual(state.doc.toJSON(), original.toJSON())
    assert.ok(redo(state, tr => { state = state.apply(tr) }))
    assert.deepEqual(state.doc.firstChild.child(to).toJSON(), original.firstChild.child(from).toJSON())
  }
})
test('column reorder works in nested layouts and rejects invalid or unchanged destinations', () => {
  const original = writingSchema.nodeFromJSON({ type: 'doc', content: [{ type: 'callout', content: [columnRow([[plain('A')], [plain('B')]])] }] })
  const state = EditorState.create({ doc: original }), pos = findBlock(original, 'columns')
  const next = state.apply(reorderColumns(state, pos, 0, 1))
  next.doc.check()
  assert.equal(next.doc.firstChild.firstChild.firstChild.textContent, 'B')
  assert.equal(next.doc.firstChild.firstChild.attrs.widths, null)
  for (const [from, to] of [[0, 0], [-1, 1], [0, 2], [0.5, 1]]) assert.equal(reorderColumns(state, pos, from, to), null)
  assert.equal(reorderColumns(state, 0, 0, 1), null)
})

test('columns move between rows in both directions, preserving every block, relative width and undo', () => {
  for (const reverse of [false, true]) {
    const source = columnRow([[plain('Moved'), { type: 'callout', attrs: { icon: 'emoji:🔥' }, content: [plain('Nested')] }], [plain('Remain')]], [35, 65])
    const destination = columnRow([[plain('A')], [plain('B')], [plain('C')]], [20, 30, 50])
    const original = writingSchema.nodeFromJSON({ type: 'doc', content: reverse ? [destination, source] : [source, destination] })
    let state = EditorState.create({ doc: original, plugins: [history()] })
    const sourcePos = reverse ? original.firstChild.nodeSize : 0, targetPos = reverse ? 0 : original.firstChild.nodeSize
    const moved = original.nodeAt(sourcePos).firstChild.toJSON()
    state = state.apply(moveColumnToRow(state, sourcePos, 0, targetPos, 1))
    state.doc.check()
    const row = state.doc.nodeAt(findBlock(state.doc, 'columns'))
    assert.deepEqual(row.child(1).toJSON(), moved)
    assert.deepEqual(row.attrs.widths, [13, 35, 19.5, 32.5])
    assert.equal(state.doc.childCount, 2)
    assert.equal(state.doc.child(reverse ? 1 : 0).textContent, 'Remain')
    assert.equal(state.selection.$from.parent.textContent, 'Moved')
    assert.ok(undo(state, tr => { state = state.apply(tr) }))
    assert.deepEqual(state.doc.toJSON(), original.toJSON())
    assert.ok(redo(state, tr => { state = state.apply(tr) }))
    assert.deepEqual(state.doc.nodeAt(findBlock(state.doc, 'columns')).child(1).toJSON(), moved)
  }
})
test('moving into a nested sibling row safely unwraps the source and preserves the destination selection', () => {
  const original = writingSchema.nodeFromJSON({ type: 'doc', content: [columnRow([[plain('Moved')], [columnRow([[plain('A')], [plain('B')]])]], [40, 60])] })
  let state = EditorState.create({ doc: original })
  const nested = findBlock(original, 'column', 'AB') + 1
  state = state.apply(moveColumnToRow(state, 0, 0, nested, 2))
  state.doc.check()
  assert.equal(state.doc.firstChild.type.name, 'columns')
  assert.equal(state.doc.firstChild.childCount, 3)
  assert.deepEqual(state.doc.firstChild.attrs.widths, [30, 30, 40])
  assert.equal(state.selection.$from.parent.textContent, 'Moved')
})
test('cross-row moves reject descendants and full destinations without mutation', () => {
  const original = writingSchema.nodeFromJSON({ type: 'doc', content: [columnRow([[columnRow([[plain('Nested A')], [plain('Nested B')]])], [plain('Other')]]), layoutBlockDefinitions[3].create()] })
  const state = EditorState.create({ doc: original }), nested = findBlock(original, 'column', 'Nested ANested B') + 1
  assert.equal(moveColumnToRow(state, 0, 0, nested, 0), null)
  assert.equal(moveColumnToRow(state, 0, 0, original.firstChild.nodeSize, 0), null)
  assert.equal(moveColumnToRow(state, 0, -1, nested, 0), null)
  assert.equal(moveColumnToRow(state, -1, 0, nested, 0), null)
  assert.deepEqual(state.doc.toJSON(), original.toJSON())
})

test('cross-row moves shrink larger source rows and can move nested columns into their ancestor row', () => {
  const original = writingSchema.nodeFromJSON({ type: 'doc', content: [columnRow([[plain('A')], [plain('B')], [plain('C')]], [20, 30, 50]), columnRow([[plain('X')], [plain('Y')]])] })
  let state = EditorState.create({ doc: original })
  state = state.apply(moveColumnToRow(state, 0, 1, original.firstChild.nodeSize, 2))
  state.doc.check()
  assert.deepEqual(state.doc.firstChild.attrs.widths, [20 / 70 * 100, 50 / 70 * 100])
  assert.equal(state.doc.firstChild.childCount, 2)
  assert.deepEqual(state.doc.lastChild.attrs.widths, [35, 35, 30])
  const nested = writingSchema.nodeFromJSON({ type: 'doc', content: [columnRow([[columnRow([[plain('Inner A')], [plain('Inner B')]])], [plain('Outer')]])] })
  state = EditorState.create({ doc: nested })
  state = state.apply(moveColumnToRow(state, 2, 0, 0, 2))
  state.doc.check()
  assert.equal(state.doc.firstChild.childCount, 3)
  assert.equal(state.doc.firstChild.firstChild.textContent, 'Inner B')
  assert.equal(state.doc.firstChild.child(2).textContent, 'Inner A')
  assert.equal(state.selection.$from.parent.textContent, 'Inner A')
})

test('moving whole columns above or below their row keeps all rich blocks and exact undo', () => {
  const moved = [plain('Moved first'), { type: 'callout', attrs: { icon: 'emoji:🔥' }, content: [plain('Nested')] }, plain('Moved last')]
  for (const count of [2, 3]) for (const edge of ['above', 'below']) {
    const columns = [moved, [plain('Stay A')], ...(count === 3 ? [[plain('Stay B')]] : [])]
    const original = writingSchema.nodeFromJSON({ type: 'doc', content: [columnRow(columns, count === 3 ? [20, 30, 50] : [35, 65])] })
    let state = EditorState.create({ doc: original, plugins: [history()] })
    state = state.apply(moveColumnOutsideRow(state, 0, 0, 0, edge))
    state.doc.check()
    const movedStart = edge === 'above' ? 0 : 1
    for (let i = 0; i < moved.length; i++) assert.deepEqual(state.doc.child(movedStart + i).toJSON(), original.firstChild.firstChild.child(i).toJSON())
    const remaining = state.doc.child(edge === 'above' ? moved.length : 0)
    assert.equal(remaining.type.name, count === 3 ? 'columns' : 'paragraph')
    if (count === 3) assert.deepEqual(remaining.attrs.widths, [37.5, 62.5])
    assert.equal(state.selection.$from.parent.textContent, 'Moved first')
    assert.ok(undo(state, tr => { state = state.apply(tr) }))
    assert.deepEqual(state.doc.toJSON(), original.toJSON())
    assert.ok(redo(state, tr => { state = state.apply(tr) }))
    state.doc.check()
  }
})
test('columns move above and below other rows in either document order without changing the destination', () => {
  for (const reverse of [true, false]) for (const edge of ['above', 'below']) {
    const source = columnRow([[plain('Move A'), plain('Move B')], [plain('Remain')]])
    const target = columnRow([[plain('Target A')], [plain('Target B')]], [25, 75])
    const original = writingSchema.nodeFromJSON({ type: 'doc', content: reverse ? [target, source] : [source, target] })
    const sourcePos = reverse ? original.firstChild.nodeSize : 0, targetPos = reverse ? 0 : original.firstChild.nodeSize
    const state = EditorState.create({ doc: original })
    const next = state.apply(moveColumnOutsideRow(state, sourcePos, 0, targetPos, edge))
    next.doc.check()
    assert.deepEqual(next.doc.nodeAt(findBlock(next.doc, 'columns')).toJSON(), original.nodeAt(targetPos).toJSON())
    const order = Array.from({ length: next.doc.childCount }, (_, i) => next.doc.child(i).textContent)
    const targetIndex = order.indexOf('Target ATarget B')
    assert.deepEqual(order.slice(edge === 'above' ? targetIndex - 2 : targetIndex + 1, edge === 'above' ? targetIndex : targetIndex + 3), ['Move A', 'Move B'])
    assert.equal(order.filter(text => text === 'Remain').length, 1)
  }
})
test('a column can become full-width blocks within a nested container, but never inside itself', () => {
  const original = writingSchema.nodeFromJSON({ type: 'doc', content: [{ type: 'callout', attrs: { icon: 'emoji:🔥' }, content: [columnRow([[plain('Move')], [plain('Stay')]])] }] })
  const state = EditorState.create({ doc: original }), pos = findBlock(original, 'columns')
  const next = state.apply(moveColumnOutsideRow(state, pos, 0, pos, 'above'))
  next.doc.check()
  assert.equal(next.doc.firstChild.type.name, 'callout')
  assert.equal(next.doc.firstChild.attrs.icon, 'emoji:🔥')
  assert.deepEqual(Array.from({ length: next.doc.firstChild.childCount }, (_, i) => next.doc.firstChild.child(i).textContent), ['Move', 'Stay'])
  const nested = writingSchema.nodeFromJSON({ type: 'doc', content: [columnRow([[columnRow([[plain('A')], [plain('B')]])], [plain('Other')]])] })
  assert.equal(moveColumnOutsideRow(EditorState.create({ doc: nested }), 0, 0, 2, 'below'), null)
})

test('multiple rich blocks move together in document order and undo as one transaction', () => {
  const original = dropDoc(), source = findBlock(original, 'callout'), sources = [0, source]
  let state = EditorState.create({ doc: original, plugins: [history(), createBlockSelectionPlugin()] })
  state = state.apply(moveBlocksTo(state, sources, { pos: original.content.size }))
  state.doc.check()
  assert.deepEqual(state.doc.child(state.doc.childCount - 2).toJSON(), original.firstChild.toJSON())
  assert.deepEqual(state.doc.lastChild.toJSON(), original.nodeAt(source).toJSON())
  assert.equal(blockSelectionKey.getState(state).positions.length, 2)
  assert.ok(undo(state, tr => { state = state.apply(tr) }))
  assert.deepEqual(state.doc.toJSON(), original.toJSON())
  assert.ok(redo(state, tr => { state = state.apply(tr) }))
  state.doc.check()
})
test('side dropping multiple blocks creates one column containing the group, never separate columns', () => {
  const original = dropDoc(), source = findBlock(original, 'callout'), target = findBlock(original, 'paragraph', 'Last')
  const state = EditorState.create({ doc: original })
  const next = state.apply(moveBlocksTo(state, [source, 0], { pos: target, side: 'right' }))
  next.doc.check()
  const row = next.doc.lastChild
  assert.equal(row.type.name, 'columns')
  assert.equal(row.childCount, 2)
  assert.equal(row.child(1).childCount, 2)
  assert.deepEqual(row.child(1).child(0).toJSON(), original.firstChild.toJSON())
  assert.deepEqual(row.child(1).child(1).toJSON(), original.nodeAt(source).toJSON())
})
test('group moves into toggles preserve order and remove emptied source columns', () => {
  const original = writingSchema.nodeFromJSON({ type: 'doc', content: [columnRow([[plain('A'), plain('B')], [plain('Keep')]]), { type: 'details', attrs: { open: false }, content: [{ type: 'detailsSummary', content: [{ type: 'text', text: 'Toggle' }] }, { type: 'detailsContent', content: [{ type: 'paragraph' }] }] }] })
  let state = EditorState.create({ doc: original, plugins: [history(), createBlockSelectionPlugin()] })
  const sources = [findBlock(original, 'paragraph', 'A'), findBlock(original, 'paragraph', 'B')]
  state = state.apply(moveBlocksTo(state, sources, { pos: findBlock(original, 'detailsContent') + 1, container: findBlock(original, 'details') }))
  state.doc.check()
  assert.equal(state.doc.firstChild.type.name, 'paragraph')
  assert.equal(state.doc.firstChild.textContent, 'Keep')
  assert.equal(state.doc.lastChild.attrs.open, true)
  assert.equal(state.doc.lastChild.child(1).childCount, 2)
  assert.deepEqual(state.doc.lastChild.child(1).content.toJSON(), sources.map(pos => original.nodeAt(pos).toJSON()))
  for (const pos of blockSelectionKey.getState(state).positions) assert.ok(['A', 'B'].includes(state.doc.nodeAt(pos).textContent))
  assert.ok(undo(state, tr => { state = state.apply(tr) }))
  assert.deepEqual(state.doc.toJSON(), original.toJSON())
})
test('multi-block selection supports text ranges, modifier ranges, toggling and mapped positions without changing content', () => {
  const original = dropDoc()
  let state = EditorState.create({ doc: original, plugins: [createBlockSelectionPlugin()] })
  const callout = findBlock(original, 'callout')
  state = state.apply(state.tr.setSelection(TextSelection.create(original, 1, findBlock(original, 'paragraph', 'Inside') + 3)))
  assert.deepEqual(blockSelectionKey.getState(state).positions, [0, findBlock(original, 'details'), callout])
  state = state.apply(selectBlockGroup(state, callout, false))
  assert.equal(blockSelectionKey.getState(state).positions.length, 2)
  state = state.apply(selectBlockGroup(state, callout, true))
  assert.equal(blockSelectionKey.getState(state).positions.length, 3)
  assert.deepEqual(state.doc.toJSON(), original.toJSON())
  const inserted = writingSchema.nodes.paragraph.create(null, writingSchema.text('Before'))
  state = state.apply(state.tr.insert(0, inserted))
  assert.equal(blockSelectionKey.getState(state).positions[0], inserted.nodeSize)
})
test('group self drops and drops into descendants leave the document unchanged', () => {
  const original = dropDoc(), state = EditorState.create({ doc: original })
  const callout = findBlock(original, 'callout'), inside = findBlock(original, 'paragraph', 'Inside')
  assert.equal(moveBlocksTo(state, [0, callout], { pos: inside }), null)
  assert.equal(moveBlocksTo(state, [0, callout], { pos: callout, side: 'left' }), null)
  assert.equal(moveBlocksTo(state, [0, findBlock(original, 'details')], { pos: callout }), null)
  assert.deepEqual(state.doc.toJSON(), original.toJSON())
})

test('group moves into the surviving column retain selection after its row unwraps', () => {
  const original = writingSchema.nodeFromJSON({ type: 'doc', content: [columnRow([[plain('A'), plain('B')], [plain('Keep')]])] })
  let state = EditorState.create({ doc: original, plugins: [history(), createBlockSelectionPlugin()] })
  const keep = findBlock(original, 'paragraph', 'Keep')
  state = state.apply(moveBlocksTo(state, [findBlock(original, 'paragraph', 'A'), findBlock(original, 'paragraph', 'B')], { pos: keep + original.nodeAt(keep).nodeSize }))
  state.doc.check()
  assert.deepEqual(Array.from({ length: state.doc.childCount }, (_, i) => state.doc.child(i).textContent), ['Keep', 'A', 'B'])
  assert.deepEqual(blockSelectionKey.getState(state).positions.map(pos => state.doc.nodeAt(pos).textContent), ['A', 'B'])
  assert.ok(undo(state, tr => { state = state.apply(tr) }))
  assert.deepEqual(state.doc.toJSON(), original.toJSON())
})

const { defaultViewConfig, validViewConfig, visibleRecords, groupRecords, importedRecords, recordDay, calendarDays, recordsOnDay } = await import('../src/features/notebook/viewModel.ts')
test('view blocks retain source, layout and filters through moves, duplication, JSON and undo', async () => {
  const view = { type: 'viewBlock', attrs: { ...defaultViewConfig('board'), title: 'My tasks', source: 'tasks', query: 'Plan', filter: 'open', sort: 'date', group: 'day' } }
  const original = writingSchema.nodeFromJSON({ type: 'doc', content: [view, plain('Other')] })
  let state = EditorState.create({ doc: original, plugins: [history()] })
  state = state.apply(moveBlockTo(state, 0, { pos: original.content.size }))
  assert.deepEqual(state.doc.lastChild.toJSON(), original.firstChild.toJSON())
  assert.deepEqual(writingSchema.nodeFromJSON(state.doc.toJSON()).toJSON(), state.doc.toJSON())
  assert.ok(undo(state, tr => { state = state.apply(tr) }))
  assert.deepEqual(state.doc.toJSON(), original.toJSON())
  const { pageMarkdown } = await import('../src/features/notebook/pageExport.ts')
  assert.match(pageMarkdown({ title: 'Views', content: original.toJSON() }), /board view of tasks/)
  for (const patch of [{ source: 'bad' }, { view: 'bad' }, { query: 'a'.repeat(201) }, { title: null }, { group: [] }]) assert.equal(validViewConfig({ ...defaultViewConfig('table'), ...patch }), false)
})
test('view source adapters retain identities, completion and date-only boundaries and ignore malformed duplicates', () => {
  const records = importedRecords('tasks', { tasks: [{ id: 'a', title: 'Plan', status: 2, dueDate: '2026-10-18T01:00:00Z' }, { id: 'a', title: 'Duplicate' }, { id: 'b', title: 'Open', status: 0 }, { id: 'c', title: 'Removed', status: -1 }, null] })
  assert.equal(records.length, 2)
  assert.equal(records[0].done, true)
  assert.equal(records[0].date, '2026-10-17')
  assert.equal(recordDay('2026-02-30'), null)
  const meetings = importedRecords('meetings', { events: [{ id: 'm', title: 'Trip', allDay: true, startDay: '2026-10-17', endDay: '2026-10-19' }] })
  assert.equal(recordsOnDay(meetings, '2026-10-18').length, 1)
  assert.equal(recordsOnDay(meetings, '2026-10-19').length, 0)
})
test('view filters and aggregates share the same records without mutating their source', () => {
  const records = importedRecords('tasks', { tasks: [{ id: 'a', title: 'Plan B', status: 0, dueDate: '2026-10-19' }, { id: 'b', title: 'Plan A', status: 2, dueDate: '2026-10-18' }, { id: 'c', title: 'Other', status: 0 }] })
  const before = JSON.stringify(records)
  assert.deepEqual(visibleRecords(records, { ...defaultViewConfig('table'), query: 'plan', filter: 'open' }).map(record => record.id), ['a'])
  assert.deepEqual(visibleRecords(records, { ...defaultViewConfig('table'), sort: 'date' }).map(record => record.id), ['b', 'a', 'c'])
  assert.deepEqual(groupRecords(records, 'status').map(group => [group.label, group.count]), [['To do', 2], ['Done', 1]])
  assert.equal(JSON.stringify(records), before)
  const days = calendarDays(new Date(2026, 10, 1))
  assert.equal(days.length, 42)
  assert.equal(days[0], '2026-10-26')
  assert.equal(new Set(days).size, 42)
})

const { validLists, blankItem } = await import('../src/features/notebook/personalLists.ts')
const { listRecords, metricValue } = await import('../src/features/notebook/viewModel.ts')
test('personal list values are validated and missing values remain unknown in charts', () => {
  const list = { id: crypto.randomUUID(), name: 'My items', items: [{ ...blankItem(), title: 'First', value: 25, date: '2026-10-17' }, { ...blankItem(), title: 'Second', value: null }] }
  assert.equal(validLists([list]), true)
  assert.equal(metricValue(listRecords(list), 'sum'), 25)
  assert.equal(metricValue(listRecords({ ...list, items: [list.items[1]] }), 'sum'), null)
  assert.equal(metricValue(listRecords(list), 'count'), 2)
  for (const patch of [{ value: NaN }, { value: -1 }, { date: '2026-02-30' }, { cover: 'javascript:alert(1)' }, { status: 'bad' }]) assert.equal(validLists([{ ...list, items: [{ ...list.items[0], ...patch }] }]), false)
  assert.equal(validLists([{ ...list, items: [list.items[0], list.items[0]] }]), false)
})
test('page duplication copies owned lists independently, remaps their views and retains external list references', async () => {
  const { duplicate, samePages, validPages } = await import('../src/features/notebook/notebookModel.ts')
  const list = { id: crypto.randomUUID(), name: 'Items', items: [{ ...blankItem(), title: 'Preserve me', value: 42 }] }, externalId = crypto.randomUUID()
  const page = { id: crypto.randomUUID(), title: 'Lists', parentId: null, lists: [list], content: { type: 'doc', content: [{ type: 'viewBlock', attrs: { ...defaultViewConfig('table'), collectionId: list.id } }, { type: 'viewBlock', attrs: { ...defaultViewConfig('board'), collectionId: externalId } }] } }
  const copied = duplicate([page], page.id).pages[1]
  assert.notEqual(copied.lists[0].id, list.id)
  assert.equal(copied.content.content[0].attrs.collectionId, copied.lists[0].id)
  assert.equal(copied.content.content[1].attrs.collectionId, externalId)
  assert.deepEqual(copied.lists[0].items, list.items)
  assert.notEqual(copied.lists[0].items, list.items)
  assert.equal(validPages([page, copied]), true)
  assert.equal(samePages([page], [{ ...page, lists: [] }]), false)
  const { pageMarkdown } = await import('../src/features/notebook/pageExport.ts')
  const markdown = pageMarkdown(page)
  assert.match(markdown, /Preserve me/)
  assert.match(markdown, /42/)
  assert.equal((markdown.match(/Preserve me/g) || []).length, 1)
  assert.match(pageMarkdown({ ...page, content: { type: 'doc', content: [{ type: 'paragraph' }] } }), /Preserve me/)
})

test('recovering copies remaps list ownership and linked views without colliding with saved lists', async () => {
  const { recoveredCopies, validPages } = await import('../src/features/notebook/notebookModel.ts')
  const list = { id: crypto.randomUUID(), name: 'Recovered items', items: [{ ...blankItem(), title: 'Keep this item' }] }
  const page = { id: crypto.randomUUID(), parentId: null, title: 'Source', lists: [list], content: { type: 'doc', content: [{ type: 'viewBlock', attrs: { ...defaultViewConfig('table'), collectionId: list.id } }] } }
  const other = { id: crypto.randomUUID(), parentId: null, title: 'Linked view', content: { type: 'doc', content: [{ type: 'viewBlock', attrs: { ...defaultViewConfig('board'), collectionId: list.id } }] } }
  const copies = recoveredCopies([page, other])
  assert.equal(validPages([page, other, ...copies]), true)
  assert.equal(copies[1].content.content[0].attrs.collectionId, copies[0].lists[0].id)
  assert.notEqual(copies[0].lists[0].id, list.id)
  assert.equal(copies[0].lists[0].items[0].title, 'Keep this item')
})


test('board status moves preserve all item data, use the latest list, and reject stale or invalid moves', async () => {
  const { moveItemStatus } = await import('../src/features/notebook/personalLists.ts')
  const list = { id: 'list', name: 'Projects', items: [{ id: 'a', title: 'Updated title', status: 'To do', date: '2026-10-17', value: 12, description: 'Keep this', cover: null }, { id: 'b', title: 'Other', status: 'Done' }] }
  const moved = moveItemStatus(list, 'a', 'In progress')
  assert.deepEqual(moved.items[0], { ...list.items[0], status: 'In progress', metadata: moved.items[0].metadata })
  assert.equal(moved.items[0].metadata.createdAt, null)
  assert.equal(moved.items[0].metadata.editedBy, 'You')
  assert.equal(moved.items[1], list.items[1])
  assert.equal(list.items[0].status, 'To do')
  assert.equal(moveItemStatus(moved, 'a', 'In progress'), moved)
  assert.equal(moveItemStatus(list, 'deleted-id', 'Done'), list)
  assert.equal(moveItemStatus(list, 'a', 'Invalid'), list)
  assert.equal(moveItemStatus(moved, 'a', 'Done').items[0].status, 'Done')
})


test('board ordering uses stable neighbors and preserves hidden records and current edits', async () => {
  const { moveBoardItem } = await import('../src/features/notebook/personalLists.ts')
  const { visibleRecords, defaultViewConfig, listRecords } = await import('../src/features/notebook/viewModel.ts')
  const item = (id, status = 'To do') => ({ id, title: id, status, date: null, value: 9, description: 'Latest edit', cover: null })
  const list = { id: 'list', name: 'Work', items: [item('a'), item('hidden'), item('b'), item('c'), item('done', 'Done')] }
  assert.deepEqual(moveBoardItem(list, 'a', 'To do').items.map(item => item.id), ['hidden', 'b', 'c', 'a', 'done'])
  const up = moveBoardItem(list, 'c', 'To do', 'a')
  assert.deepEqual(up.items.map(item => item.id), ['c', 'a', 'hidden', 'b', 'done'])
  const down = moveBoardItem(up, 'c', 'To do', 'b', true)
  assert.deepEqual(down.items.map(item => item.id), ['a', 'hidden', 'b', 'c', 'done'])
  assert.equal(down.items.find(item => item.id === 'c'), list.items[3])
  const cross = moveBoardItem(list, 'a', 'Done', 'done', true)
  assert.deepEqual(cross.items.map(item => item.id), ['hidden', 'b', 'c', 'done', 'a'])
  assert.deepEqual(cross.items[4], { ...list.items[0], status: 'Done', metadata: cross.items[4].metadata })
  assert.ok(Number.isFinite(Date.parse(cross.items[4].metadata.editedAt)))
  assert.equal(moveBoardItem(list, 'c', 'To do', 'c'), list)
  assert.equal(moveBoardItem(list, 'c', 'To do', 'deleted'), list)
  assert.equal(moveBoardItem(list, 'c', 'To do', 'done'), list)
  assert.equal(moveBoardItem(list, 'deleted', 'To do', 'a'), list)
  assert.equal(moveBoardItem(list, 'c', 'To do', 'b', true), list)
  const sortedMove = moveBoardItem(list, 'a', 'To do', 'b', true, ['c', 'b', 'a'])
  assert.deepEqual(sortedMove.items.map(item => item.id), ['c', 'hidden', 'b', 'a', 'done'])
  const config = { ...defaultViewConfig('board'), query: '', filter: 'open' }
  assert.equal(config.sort, 'manual')
  assert.deepEqual(visibleRecords(listRecords(up), config).map(item => item.id), ['c', 'a', 'hidden', 'b'])
  assert.deepEqual(visibleRecords(listRecords(up), { ...config, sort: 'title' }).map(item => item.id), ['a', 'b', 'c', 'hidden'])
})

test('only charts remain insertable as data blocks; image presets retain URLs and export', async () => {
  const { validPages } = await import('../src/features/notebook/notebookModel.ts')
  const { pageMarkdown } = await import('../src/features/notebook/pageExport.ts')
  const views = layoutBlockDefinitions.filter(block => block.nodeType === 'viewBlock')
  assert.deepEqual(views.map(block => block.id), ['view-line', 'view-horizontal-bar', 'view-vertical-bar', 'view-number'])
  for (const count of [2, 3, 4]) {
    const definition = layoutBlockDefinitions.find(block => block.id === `image-grid-${count}`)
    const grid = definition.create()
    grid.attrs.images[0] = { url: 'https://example.com/garden.jpg', alt: 'Garden' }
    const content = { type: 'doc', content: [grid] }
    assert.deepEqual(JSON.parse(JSON.stringify(schema.nodeFromJSON(content).toJSON())), content)
    const page = { id: crypto.randomUUID(), parentId: null, title: 'Images', content }
    assert.ok(validPages([page]))
    assert.match(pageMarkdown(page), /Garden.*https:\/\/example.com\/garden.jpg/)
    assert.equal(validPages([{ ...page, content: { type: 'doc', content: [{ ...grid, attrs: { ...grid.attrs, images: [{ url: 'javascript:alert(1)', alt: '' }] } }] } }]), false)
  }
})

test('fixed destinations reuse one saved page and recovery copies remain ordinary pages', async () => {
  const { openFixedPage } = await import('../src/features/notebook/fixedPages.ts')
  const { validPages, recoveredCopies } = await import('../src/features/notebook/notebookModel.ts')
  let pages = []
  for (const kind of ['board', 'meds', 'habits']) {
    const result = openFixedPage(pages, kind)
    assert.equal(result.pages.length, pages.length + 1)
    assert.equal(result.pages.at(-1).content.content[0].attrs.view, ['meds', 'habits'].includes(kind) ? 'dashboard' : kind)
    assert.equal(openFixedPage(result.pages, kind).pages, result.pages)
    assert.ok(validPages(result.pages))
    pages = result.pages
  }
  const recovered = recoveredCopies(pages)
  assert.ok(recovered.every(page => page.kind == null))
  assert.ok(validPages([...pages, ...recovered]))
})

test('grid data entry merges changed cells while retaining other edits and new rows', async () => {
  const { mergeDataEdits, blankItem } = await import('../src/features/notebook/personalLists.ts')
  const a = { ...blankItem(), title: 'January', value: 10 }, b = { ...blankItem(), title: 'February' }, c = { ...blankItem(), title: 'New row elsewhere' }
  const base = { id: crypto.randomUUID(), name: 'Progress', items: [a, b] }
  const current = { ...base, items: [{ ...a, description: 'Newer description', status: 'Done' }, b, c] }
  const draft = [{ ...a, value: 25 }]
  const result = mergeDataEdits(current, base, draft)
  assert.deepEqual(result.items.map(item => item.title), ['January', 'New row elsewhere'])
  assert.equal(result.items[0].value, 25)
  assert.equal(result.items[0].status, 'Done')
  assert.equal(result.items[0].description, 'Newer description')
})

test('the expanded symbol catalog survives page and callout recovery validation', async () => {
  const { pageIcons, validStoredPageSymbol } = await import('../src/features/notebook/pageSymbols.ts')
  const { validPages } = await import('../src/features/notebook/notebookModel.ts')
  assert.equal(new Set(pageIcons.map(icon => icon.id)).size, pageIcons.length)
  for (const icon of pageIcons) {
    const value = `icon:${icon.id}`
    assert.ok(validStoredPageSymbol(value))
    assert.ok(validPages([{ id: crypto.randomUUID(), parentId: null, title: 'Icons', icon: value, content: { type: 'doc', content: [{ type: 'callout', attrs: { icon: value }, content: [{ type: 'paragraph' }] }] } }]))
  }
  assert.equal(validStoredPageSymbol('icon:unknown'), false)
  assert.equal(validStoredPageSymbol('emoji:\u0000'), false)
})

test('all themed emoji presets remain valid single emoji choices', async () => {
  const { pageEmojis, isPageEmoji } = await import('../src/features/notebook/pageSymbols.ts')
  assert.equal(new Set(pageEmojis.map(([value]) => value)).size, pageEmojis.length)
  for (const [value, label] of pageEmojis) assert.ok(isPageEmoji(value), label)
})

test('board column labels and colors persist without changing stable task statuses', async () => {
  const { defaultViewConfig, validViewConfig } = await import('../src/features/notebook/viewModel.ts')
  const { boardColumn, validBoardColumns } = await import('../src/features/notebook/boardColumns.ts')
  const { validPages, duplicate } = await import('../src/features/notebook/notebookModel.ts')
  const columns = { 'To do': { name: 'Backlog', color: 'purple' }, Done: { name: 'Finished', color: 'pink' } }
  const attrs = { ...defaultViewConfig('board'), columns }
  assert.ok(validViewConfig(attrs))
  assert.deepEqual(boardColumn('To do', columns), { name: 'Backlog', color: 'purple' })
  assert.deepEqual(boardColumn('In progress', columns), { name: 'In progress', color: 'blue' })
  const content = { type: 'doc', content: [{ type: 'viewBlock', attrs }] }
  assert.deepEqual(schema.nodeFromJSON(JSON.parse(JSON.stringify(content))).child(0).attrs.columns, columns)
  const page = { id: crypto.randomUUID(), kind: 'board', title: 'Board', parentId: null, content, lists: [{ id: crypto.randomUUID(), name: 'Tasks', items: [{ id: crypto.randomUUID(), title: 'Keep me', status: 'Done', date: null, value: null, description: '', cover: null }] }] }
  assert.ok(validPages([page]))
  const copy = duplicate([page], page.id).pages.at(-1)
  assert.deepEqual(copy.content.content[0].attrs.columns, columns)
  assert.equal(copy.lists[0].items[0].status, 'Done')
  for (const bad of [[], { Other: { name: 'Other', color: 'blue' } }, { 'To do': { name: ' ', color: 'blue' } }, { Done: { name: 'x', color: 'neon' } }, { Done: { name: 'x'.repeat(61), color: 'gray' } }, { Done: { name: '\n', color: 'gray' } }]) assert.equal(validBoardColumns(bad), false)
})

test('custom board columns add, accept tasks and delete atomically without losing filtered items', async () => {
  const { listBoard, addBoardColumn, deleteBoardColumn, validBoardDefinition } = await import('../src/features/notebook/boardColumns.ts')
  const { validLists, blankItem, moveBoardItem } = await import('../src/features/notebook/personalLists.ts')
  const id = `column:${crypto.randomUUID()}`
  const first = { ...blankItem(), title: 'Visible', description: 'Keep description', value: 12 }, hidden = { ...blankItem(), title: 'Hidden by filter', date: '2026-10-17' }
  const original = { id: crypto.randomUUID(), name: 'Board', items: [first, hidden] }
  const board = listBoard(original, { 'To do': { name: 'Backlog', color: 'purple' } })
  const added = addBoardColumn(original, board, id, { name: 'Review', color: 'pink' })
  assert.ok(validBoardDefinition(added.board))
  assert.equal(added.board.columns['To do'].name, 'Backlog')
  const moved = moveBoardItem(moveBoardItem(added, first.id, id), hidden.id, id)
  assert.ok(validLists([moved]))
  assert.equal(deleteBoardColumn(moved, board, id), moved)
  assert.equal(deleteBoardColumn(moved, board, id, id), moved)
  const removed = deleteBoardColumn(moved, board, id, 'In progress')
  assert.ok(validLists([removed]))
  assert.equal(removed.items.length, 2)
  assert.ok(removed.items.every(item => item.status === 'In progress'))
  assert.equal(removed.items[0].description, 'Keep description')
  assert.equal(removed.items[1].date, '2026-10-17')
  assert.equal(removed.board.order.includes(id), false)
  assert.equal(removed.board.columns[id], undefined)
  assert.equal(moved.board.order.includes(id), true)
  const only = { ...removed, board: { order: ['In progress'], columns: { 'In progress': removed.board.columns['In progress'] } } }
  assert.equal(deleteBoardColumn(only, only.board, 'In progress'), only)
  assert.equal(validLists([{ ...original, items: [{ ...first, status: id }] }]), false)
  assert.equal(validLists([{ ...moved, board: removed.board }]), false)
  assert.equal(validBoardDefinition({ order: ['To do', 'To do'], columns: { 'To do': { name: 'A', color: 'gray' } } }), false)
})

test('board visibility preferences survive document round trips without changing tasks', async () => {
  const { defaultViewConfig, validViewConfig } = await import('../src/features/notebook/viewModel.ts')
  const { validPages, duplicate } = await import('../src/features/notebook/notebookModel.ts')
  const attrs = { ...defaultViewConfig('board'), hiddenColumns: ['To do', 'Done'], hideAggregation: true }
  const content = { type: 'doc', content: [{ type: 'viewBlock', attrs }] }
  const roundTrip = schema.nodeFromJSON(JSON.parse(JSON.stringify(content))).toJSON()
  assert.deepEqual(roundTrip.content[0].attrs.hiddenColumns, attrs.hiddenColumns)
  assert.equal(roundTrip.content[0].attrs.hideAggregation, true)
  const page = { id: crypto.randomUUID(), kind: 'board', title: 'Board', parentId: null, content, lists: [{ id: crypto.randomUUID(), name: 'Tasks', items: [{ id: crypto.randomUUID(), title: 'Keep hidden task', status: 'To do', date: null, value: null, description: '', cover: null }] }] }
  assert.ok(validPages([page]))
  const copy = duplicate([page], page.id).pages.at(-1)
  assert.deepEqual(copy.content.content[0].attrs.hiddenColumns, attrs.hiddenColumns)
  assert.equal(copy.lists[0].items[0].title, 'Keep hidden task')
  for (const patch of [{ hiddenColumns: 'To do' }, { hiddenColumns: ['To do', 'To do'] }, { hiddenColumns: ['unknown'] }, { hideAggregation: 'false' }, { hideAggregation: 1 }]) assert.equal(validViewConfig({ ...attrs, ...patch }), false)
})

test('reordering board columns preserves cards, colors and hidden column positions', async () => {
  const { listBoard, moveBoardColumn } = await import('../src/features/notebook/boardColumns.ts')
  const { validLists } = await import('../src/features/notebook/personalLists.ts')
  const custom = `column:${crypto.randomUUID()}`
  const items = [{ id: crypto.randomUUID(), title: 'Keep this card', status: 'To do', date: '2026-10-17', value: 5, description: 'Keep details', cover: null }]
  const list = { id: crypto.randomUUID(), name: 'Tasks', items }
  const initial = listBoard(list)
  const board = { order: ['To do', custom, 'In progress', 'Done'], columns: { ...initial.columns, [custom]: { name: 'Hidden review', color: 'purple' } } }
  const original = { ...list, board }
  const moved = moveBoardColumn(original, initial, 'Done', 'To do')
  assert.deepEqual(moved.board.order, ['Done', 'To do', custom, 'In progress'])
  assert.strictEqual(moved.items, items)
  assert.strictEqual(moved.board.columns, board.columns)
  assert.deepEqual(original.board.order, ['To do', custom, 'In progress', 'Done'])
  assert.ok(validLists([moved]))
  const restored = moveBoardColumn(moved, initial, 'Done', 'In progress', true)
  assert.deepEqual(restored, original)
  assert.strictEqual(moveBoardColumn(original, initial, 'To do', 'To do'), original)
  assert.strictEqual(moveBoardColumn(original, initial, 'In progress', 'Done'), original)
  assert.strictEqual(moveBoardColumn(original, initial, `column:${crypto.randomUUID()}`, 'Done'), original)
})

test('task autosave patches merge into the latest item without reviving deleted tasks', async () => {
  const { patchPersonalItem, blankItem } = await import('../src/features/notebook/personalLists.ts')
  const original = { ...blankItem(), title: 'Original', description: 'Newer description', status: 'In progress', value: 42 }
  const list = { id: crypto.randomUUID(), name: 'Tasks', items: [original] }
  const changed = patchPersonalItem(list, original.id, { title: 'Typed title' })
  assert.equal(changed.items[0].title, 'Typed title')
  assert.equal(changed.items[0].description, 'Newer description')
  assert.equal(changed.items[0].status, 'In progress')
  assert.equal(changed.items[0].value, 42)
  assert.strictEqual(patchPersonalItem(list, crypto.randomUUID(), { title: 'Never recreate' }), list)
  assert.strictEqual(patchPersonalItem(list, original.id, { cover: 'http://incomplete' }), list)
  assert.strictEqual(patchPersonalItem(list, original.id, { value: -1 }), list)
  assert.strictEqual(patchPersonalItem(list, original.id, { title: 'Original' }), list)
  assert.equal(patchPersonalItem(list, original.id, { status: 'Done' }).items[0].status, 'Done')
  assert.equal(original.title, 'Original')
})

test('typed task properties survive rename, patch merging, duplication and atomic removal', async () => {
  const { upsertTaskProperty, removeTaskProperty, validPropertyDate } = await import('../src/features/notebook/taskProperties.ts')
  const { blankItem, validLists, patchPersonalItem } = await import('../src/features/notebook/personalLists.ts')
  const { duplicate } = await import('../src/features/notebook/notebookModel.ts')
  const select = { id: crypto.randomUUID(), name: 'Priority', type: 'select', options: ['Low', 'High'] }
  const number = { id: crypto.randomUUID(), name: 'Budget', type: 'number', options: [] }
  const first = { ...blankItem(), title: 'One' }, second = { ...blankItem(), title: 'Two' }
  let list = { id: crypto.randomUUID(), name: 'Tasks', items: [first, second] }
  list = upsertTaskProperty(upsertTaskProperty(list, select), number)
  list = patchPersonalItem(list, first.id, { properties: { [select.id]: 'High' } })
  list = patchPersonalItem(list, first.id, { properties: { [number.id]: -20 } })
  assert.deepEqual(list.items[0].properties, { [select.id]: 'High', [number.id]: -20 })
  list = upsertTaskProperty(list, { ...select, name: 'Importance' })
  assert.equal(list.items[0].properties[select.id], 'High')
  assert.strictEqual(upsertTaskProperty(list, { ...select, options: ['Low'] }), list)
  assert.ok(validLists([list]))
  const page = { id: crypto.randomUUID(), title: 'Properties', parentId: null, content: { type: 'doc', content: [{ type: 'paragraph' }] }, lists: [list] }
  const { pageMarkdown } = await import('../src/features/notebook/pageExport.ts')
  assert.match(pageMarkdown(page), /Importance/)
  assert.match(pageMarkdown(page), /High/)
  const copy = duplicate([page], page.id).pages.at(-1)
  assert.deepEqual(copy.lists[0].properties, list.properties)
  assert.deepEqual(copy.lists[0].items[0].properties, list.items[0].properties)
  const removed = removeTaskProperty(list, select.id)
  assert.equal(removed.properties.length, 1)
  assert.deepEqual(removed.items[0].properties, { [number.id]: -20 })
  assert.ok(validLists([removed]))
  assert.equal(validPropertyDate('2026-02-30'), false)
  assert.equal(validPropertyDate('2028-02-29'), true)
  assert.equal(validLists([{ ...list, items: [{ ...first, properties: { [select.id]: 'Other' } }] }]), false)
  assert.equal(validLists([{ ...list, items: [{ ...first, properties: { [number.id]: true } }] }]), false)
})

test('direct property creation generates unique names and accepts empty selection options', async () => {
  const { newTaskProperty, validPropertyDefinitions, upsertTaskProperty } = await import('../src/features/notebook/taskProperties.ts')
  const text = newTaskProperty([], 'text')
  assert.equal(text.name, 'Text')
  assert.equal(newTaskProperty([text], 'text').name, 'Text 2')
  assert.equal(typeof newTaskProperty([text], 'number', 'Text'), 'string')
  assert.equal(newTaskProperty([], 'date').name, 'Date 2')
  const select = newTaskProperty([], 'select', 'Priority')
  assert.deepEqual(select.options, [])
  assert.ok(validPropertyDefinitions([select]))
  const list = { id: crypto.randomUUID(), name: 'Tasks', items: [], properties: [select] }
  assert.deepEqual(upsertTaskProperty(list, { ...select, options: ['High'] }).properties[0].options, ['High'])
})

test('board card property visibility persists in view JSON with strict keys', () => {
  const property = crypto.randomUUID()
  const attrs = { ...defaultViewConfig('board'), cardProperties: ['status', 'value', property] }
  assert.ok(validViewConfig(attrs))
  const doc = writingSchema.nodeFromJSON({ type: 'doc', content: [{ type: 'viewBlock', attrs }] })
  assert.deepEqual(writingSchema.nodeFromJSON(doc.toJSON()).firstChild.attrs.cardProperties, attrs.cardProperties)
  assert.ok(validViewConfig({ ...attrs, cardProperties: [] }))
  for (const invalid of [['status', 'status'], ['unknown'], 'date', [null], Array.from({ length: 37 }, () => crypto.randomUUID())]) assert.equal(validViewConfig({ ...attrs, cardProperties: invalid }), false)
})

test('card layouts persist and validate sizes, sources and fit mode', async () => {
  const { cardPreview } = await import('../src/features/notebook/boardCardLayout.ts')
  const property = crypto.randomUUID()
  const attrs = { ...defaultViewConfig('board'), cardSize: 'large', cardPreview: property, cardImageFit: true }
  assert.ok(validViewConfig(attrs))
  const doc = writingSchema.nodeFromJSON({ type: 'doc', content: [{ type: 'viewBlock', attrs }] })
  assert.deepEqual(writingSchema.nodeFromJSON(doc.toJSON()).firstChild.attrs, doc.firstChild.attrs)
  for (const patch of [{ cardSize: 'huge' }, { cardSize: ['medium'] }, { cardPreview: 'bad' }, { cardImageFit: 1 }]) assert.equal(validViewConfig({ ...attrs, ...patch }), false)
  const item = { description: 'Legacy note', properties: { [property]: ['https://example.com/doc.pdf', 'https://example.com/photo.png'] } }
  assert.deepEqual(cardPreview(item, property), { kind: 'image', src: 'https://example.com/photo.png' })
  assert.equal(cardPreview(item, 'none', 'https://example.com/cover.png'), null)
  assert.deepEqual(cardPreview(item, 'cover', 'https://example.com/cover.png'), { kind: 'image', src: 'https://example.com/cover.png' })
  assert.deepEqual(cardPreview(item, 'content'), { kind: 'text', text: 'Legacy note' })
  item.descriptionContent = { type: 'doc', content: [{ type: 'image', attrs: { src: 'https://example.com/body.png' } }] }
  assert.deepEqual(cardPreview(item, 'content'), { kind: 'image', src: 'https://example.com/body.png' })
  assert.equal(cardPreview(item, crypto.randomUUID()), null)
})

test('icon colors and imported filled artwork survive page and callout validation', async () => {
  const { pageIcons, iconColors, coloredIcon, validPageSymbol, validStoredPageSymbol } = await import('../src/features/notebook/pageSymbols.ts')
  const { validPages } = await import('../src/features/notebook/notebookModel.ts')
  assert.ok(pageIcons.filter(icon => icon.filled).length >= 463)
  for (const icon of pageIcons) for (const color of iconColors) {
    const value = coloredIcon(icon.id, color.id)
    assert.ok(value.length <= 60)
    assert.ok(validPageSymbol(value)); assert.ok(validStoredPageSymbol(value))
  }
  const value = coloredIcon(pageIcons.find(icon => icon.filled).id, 'purple')
  assert.ok(validPages([{ id: crypto.randomUUID(), title: 'Color icon', icon: value, content: { type: 'doc', content: [{ type: 'callout', attrs: { icon: value }, content: [{ type: 'paragraph' }] }] } }]))
  for (const value of ['icon:brain:invalid', 'icon:brain:blue:extra', 'icon:missing:blue']) assert.equal(validStoredPageSymbol(value), false)
})


test('Meds copies dashboard lists and settings independently without a cover', async () => {
  const { fixedPages, openFixedPage, isFixedPage } = await import('../src/features/notebook/fixedPages.ts')
  const { validPages } = await import('../src/features/notebook/notebookModel.ts')
  const { defaultViewConfig } = await import('../src/features/notebook/viewModel.ts')
  const { blankItem } = await import('../src/features/notebook/personalLists.ts')
  const list = { id: crypto.randomUUID(), name: 'Dashboard items', items: [{ ...blankItem(), title: 'Original' }] }
  const dashboard = { id: crypto.randomUUID(), kind: 'dashboard', parentId: null, title: 'Dashboard', cover: { url: 'https://example.com/cover.jpg', position: 50 }, lists: [list], content: { type: 'doc', content: [{ type: 'viewBlock', attrs: { ...defaultViewConfig('dashboard'), collectionId: list.id, metric: 'sum' } }] } }
  const result = openFixedPage([dashboard], 'meds')
  const meds = result.pages.find(page => page.id === result.id)
  assert.equal(result.pages[0], dashboard)
  assert.equal(meds.title, 'Meds')
  assert.equal(meds.kind, 'meds')
  assert.equal(meds.cover, null)
  assert.notEqual(meds.lists[0].id, list.id)
  assert.equal(meds.content.content[0].attrs.collectionId, meds.lists[0].id)
  assert.equal(meds.content.content[0].attrs.metric, 'sum')
  meds.lists[0].items[0].title = 'Changed copy'
  assert.equal(list.items[0].title, 'Original')
  assert.ok(validPages(result.pages))
  assert.equal(openFixedPage(result.pages, 'meds').pages, result.pages)
  assert.equal(fixedPages.some(page => page.kind === 'calendar'), false)
  assert.equal(isFixedPage({ kind: 'calendar' }), true)
})


test('Dashboard and Calendar destinations stay retired while Tasks and Meds remain available', async () => {
  const { fixedPages, isFixedPage, isRetiredFixedPage } = await import('../src/features/notebook/fixedPages.ts')
  assert.deepEqual(fixedPages.map(page => page.kind), ['board', 'meds', 'habits'])
  for (const kind of ['calendar', 'dashboard']) {
    assert.equal(isRetiredFixedPage({ kind }), true)
    assert.equal(isFixedPage({ kind }), true)
  }
  for (const kind of ['board', 'meds', 'meeting', null]) assert.equal(isRetiredFixedPage({ kind }), false)
})
