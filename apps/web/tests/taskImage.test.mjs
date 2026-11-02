import test from 'node:test'
import assert from 'node:assert/strict'
import { taskImageSource, loadTaskImage } from '../src/features/notebook/taskImage.ts'
import { blankItem, patchPersonalItem, validLists } from '../src/features/notebook/personalLists.ts'
import { listRecords } from '../src/features/notebook/viewModel.ts'
const stored = '/api/notebook/cover-images/' + 'a'.repeat(64) + '.webp'

test('task image links normalize stored assets and reject unsafe or incomplete URLs', () => {
  assert.equal(taskImageSource(' https://example.com/photo.jpg '), 'https://example.com/photo.jpg')
  assert.equal(taskImageSource(stored), stored)
  assert.equal(taskImageSource('http://127.0.0.1:5173' + stored, 'http://127.0.0.1:5173'), stored)
  for (const value of ['', 'photo.jpg', 'http://example.com/photo.jpg', 'https://user:password@example.com/photo.jpg', 'javascript:alert(1)', 'data:image/png;base64,AAA', '/api/notebook/cover-images/not-a-hash.webp']) assert.throws(() => taskImageSource(value))
})
test('a task image saves independently of other fields and reaches board records', () => {
  const item = { ...blankItem(), title: 'Keep me', description: 'Do not overwrite', properties: {} }
  const list = { id: crypto.randomUUID(), name: 'Images', items: [item] }
  const changed = patchPersonalItem(list, item.id, { cover: stored })
  assert.equal(validLists([changed]), true)
  assert.equal(listRecords(changed)[0].cover, stored)
  assert.equal(changed.items[0].description, 'Do not overwrite')
  assert.equal(item.cover, null)
  assert.equal(patchPersonalItem(changed, item.id, { cover: null }).items[0].cover, null)
})
test('image link verification reports non-images and aborts without finishing a pending load', async t => {
  const original = globalThis.Image
  const pictures = []
  globalThis.Image = class {
    constructor() { pictures.push(this) }
    set src(value) { this.source = value; if (value === 'good') queueMicrotask(() => this.onload?.()); if (value === 'bad') queueMicrotask(() => this.onerror?.()) }
    get src() { return this.source }
  }
  t.after(() => { globalThis.Image = original })
  await loadTaskImage('good', new AbortController().signal)
  assert.equal(pictures[0].referrerPolicy, 'no-referrer')
  await assert.rejects(loadTaskImage('bad', new AbortController().signal), /could not load an image/)
  const controller = new AbortController(), pending = loadTaskImage('pending', controller.signal)
  controller.abort()
  await assert.rejects(pending, { name: 'AbortError' })
  assert.equal(pictures.at(-1).src, '')
  assert.equal(pictures.at(-1).onload, null)
})


test('file properties validate links, batch capacity and safe preview paths', async () => {
  const { attachmentSource, attachmentName, attachmentPreview, attachmentBatchError } = await import('../src/features/notebook/taskFiles.ts')
  const stored = '/api/notebook/attachments/' + 'a'.repeat(64) + '/hello%20world.png'
  assert.equal(attachmentName(stored), 'hello world.png')
  assert.equal(attachmentName('https://example.com/report.pdf?token=x#page=2'), 'report.pdf')
  assert.equal(attachmentPreview(stored), stored + '/preview')
  assert.equal(attachmentPreview('https://example.com/photo.jpg?size=2'), 'https://example.com/photo.jpg?size=2')
  assert.equal(attachmentPreview('https://example.com/unsafe.svg'), null)
  assert.equal(attachmentSource('  https://example.com/report.pdf  '), 'https://example.com/report.pdf')
  assert.equal(attachmentSource('http://localhost:5173' + stored, 'http://localhost:5173'), stored)
  for (const url of ['javascript:alert(1)', 'https://user:pass@example.com/file.pdf', '/other/file.png', 'file:///tmp/file.txt']) assert.throws(() => attachmentSource(url))
  assert.equal(attachmentBatchError([{ name: 'ok.txt', size: 12 }], 29), null)
  assert.match(attachmentBatchError([{ name: 'extra.txt', size: 12 }], 30), /30 files/)
  assert.match(attachmentBatchError([{ name: 'large.txt', size: 8 * 1024 * 1024 + 1 }], 0), /large.txt/)
})
