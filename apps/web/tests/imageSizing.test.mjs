import test from 'node:test'
import assert from 'node:assert/strict'
import { getSchema } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import { EditorState } from '@tiptap/pm/state'
import { history, undo, redo } from '@tiptap/pm/history'
import { imageWidth, resizeImage } from '../src/features/notebook/imageSizing.ts'
const schema = getSchema([StarterKit, Image])
const doc = schema.nodeFromJSON({ type: 'doc', content: [{ type: 'image', attrs: { src: 'https://example.com/photo.png', alt: 'Keep description', title: 'Keep title' } }, { type: 'paragraph' }] })
test('image sizing fits narrow columns and keeps a usable minimum', () => {
  assert.equal(imageWidth(900, 320), 320)
  assert.equal(imageWidth(20, 320), 64)
  assert.equal(imageWidth(64, 40), 40)
})
test('resizing preserves image metadata and survives JSON reload, undo and redo', () => {
  let state = EditorState.create({ doc, plugins: [history()] })
  state = state.apply(resizeImage(state, 0, 300, 1.5))
  const resized = state.doc.toJSON()
  assert.deepEqual({ ...resized.content[0].attrs }, { ...doc.firstChild.attrs, width: 300, height: 200 })
  assert.deepEqual(schema.nodeFromJSON(JSON.parse(JSON.stringify(resized))).toJSON(), resized)
  assert.ok(undo(state, tr => { state = state.apply(tr) }))
  assert.deepEqual(state.doc.toJSON(), doc.toJSON())
  assert.ok(redo(state, tr => { state = state.apply(tr) }))
  assert.deepEqual(state.doc.toJSON(), resized)
})
test('successive resize gestures have separate undo steps and reject invalid targets', () => {
  let state = EditorState.create({ doc, plugins: [history()] })
  state = state.apply(resizeImage(state, 0, 200, 2))
  state = state.apply(resizeImage(state, 0, 400, 2))
  undo(state, tr => { state = state.apply(tr) })
  assert.equal(state.doc.firstChild.attrs.width, 200)
  assert.equal(resizeImage(state, 1, 300, 2), null)
  assert.equal(resizeImage(state, 0, NaN, 2), null)
  assert.equal(resizeImage(state, 0, 300, 0), null)
})

import { layoutNodeExtensions } from '../src/features/notebook/layoutBlocks.ts'
import { addImageBeside, canAddImageBeside } from '../src/features/notebook/imageSizing.ts'
const rowSchema = getSchema([StarterKit, Image, ...layoutNodeExtensions])
test('adding an image beside preserves both images, reloads, and undoes in one step', () => {
  const original = rowSchema.nodeFromJSON(doc.toJSON())
  let state = EditorState.create({ doc: original, plugins: [history()] })
  state = state.apply(addImageBeside(state, 0, 'https://example.com/second.png', 'Second image'))
  const row = state.doc.firstChild, saved = state.doc.toJSON()
  assert.equal(row.type.name, 'columns')
  assert.deepEqual(row.firstChild.firstChild.toJSON(), original.firstChild.toJSON())
  assert.equal(row.child(1).firstChild.attrs.alt, 'Second image')
  assert.deepEqual(rowSchema.nodeFromJSON(JSON.parse(JSON.stringify(saved))).toJSON(), saved)
  assert.ok(undo(state, tr => { state = state.apply(tr) }))
  assert.deepEqual(state.doc.toJSON(), original.toJSON())
  assert.ok(redo(state, tr => { state = state.apply(tr) }))
  assert.deepEqual(state.doc.toJSON(), saved)
})
test('adding beside extends the existing row, preserves weights, and enforces its limit', () => {
  let state = EditorState.create({ doc: rowSchema.nodeFromJSON(doc.toJSON()) })
  state = state.apply(addImageBeside(state, 0, 'https://example.com/second.png', 'Second'))
  for (let count = 3; count <= 5; count++) {
    state = state.apply(addImageBeside(state, 2, `https://example.com/${count}.png`, `Image ${count}`))
    assert.equal(state.doc.firstChild.childCount, count)
    assert.ok(Math.abs(state.doc.firstChild.attrs.widths.reduce((sum, n) => sum + n, 0) - 100) < .001)
  }
  assert.equal(canAddImageBeside(state, 2), false)
  assert.equal(addImageBeside(state, 2, 'https://example.com/full.png', 'Full'), null)
  assert.equal(canAddImageBeside(state, -1), false)
})
