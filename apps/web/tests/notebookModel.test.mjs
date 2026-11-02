import test from 'node:test'
import assert from 'node:assert/strict'
import { descendants, duplicate, reparent, restore, samePages, trash } from '../src/features/notebook/notebookModel.ts'
const content = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Keep the formatting', marks: [{ type: 'bold' }] }] }] }
const pages = [{ id: 'root', parentId: null, title: 'Root', content }, { id: 'child', parentId: 'root', title: 'Child', content }, { id: 'grandchild', parentId: 'child', title: 'Grandchild', content }, { id: 'other', parentId: null, title: 'Other', content }]

test('moving pages rejects cycles but allows moving a subtree to another root', () => {
  assert.equal(reparent(pages, 'root', 'grandchild'), pages)
  const moved = reparent(pages, 'child', 'other')
  assert.equal(moved[1].parentId, 'other')
  assert.equal(moved[2].parentId, 'child')
  assert.deepEqual([...descendants(moved, 'other')].sort(), ['child', 'grandchild', 'other'])
})
test('trash retains descendants and rich text; restoring a child restores its ancestors', () => {
  const removed = trash(pages, 'root', 'today')
  assert.ok(removed.slice(0, 3).every(p => p.deletedAt === 'today'))
  assert.deepEqual(removed[1].content, content)
  const recovered = restore(removed, 'child')
  assert.ok(recovered.slice(0, 3).every(p => p.deletedAt === null))
  assert.equal(removed[0].deletedAt, 'today')
})
test('duplication remaps nested IDs without changing original pages or formatting', () => {
  const copied = duplicate(pages, 'root')
  assert.deepEqual(copied.pages.slice(0, 4), pages)
  const additions = copied.pages.slice(4)
  assert.equal(additions.length, 3)
  assert.equal(additions[1].parentId, additions[0].id)
  assert.equal(additions[2].parentId, additions[1].id)
  assert.deepEqual(additions[2].content, content)
  assert.equal(new Set(copied.pages.map(p => p.id)).size, 7)
})

test('save acknowledgements normalize optional defaults while retaining ordering and content changes', () => {
  assert.ok(samePages(pages, pages.map(p => ({ ...p, favorite: false, deletedAt: null }))))
  assert.equal(samePages(pages, [...pages].reverse()), false)
  assert.equal(samePages(pages, pages.map(p => ({ ...p, favorite: true }))), false)
})

test('page icons survive duplication and trash and participate in save acknowledgements', () => {
  const decorated = pages.map(p => ({ ...p, icon: 'emoji:🌱' }))
  assert.equal(duplicate(decorated, 'root').pages.at(-1).icon, 'emoji:🌱')
  assert.equal(restore(trash(decorated, 'root'), 'root')[0].icon, 'emoji:🌱')
  assert.equal(samePages(pages, decorated), false)
  assert.ok(samePages(pages, pages.map(p => ({ ...p, icon: null }))))
  assert.equal(samePages(decorated, decorated.map(p => ({ ...p, icon: 'icon:leaf' }))), false)
})


test('meeting notes keep their category through duplication and recovery', () => {
  const meeting = [{ ...pages[0], kind: 'meeting' }]
  assert.equal(duplicate(meeting, 'root').pages[1].kind, 'meeting')
  assert.equal(restore(trash(meeting, 'root'), 'root')[0].kind, 'meeting')
  assert.ok(samePages(pages, pages.map(p => ({ ...p, kind: null }))))
  assert.equal(samePages([pages[0]], meeting), false)
})

test('cover and width survive copies, recovery and save acknowledgements', async () => {
  const { validPages } = await import('../src/features/notebook/notebookModel.ts')
  const decorated = [{ ...pages[0], cover: { url: '/field-notes/meadow.webp', position: 35 }, fullWidth: true }]
  assert.ok(validPages(decorated))
  assert.deepEqual(duplicate(decorated, 'root').pages[1].cover, decorated[0].cover)
  assert.equal(restore(trash(decorated, 'root'), 'root')[0].fullWidth, true)
  assert.ok(samePages(decorated, [{ ...decorated[0], cover: { ...decorated[0].cover, author: null, authorUrl: null, sourceUrl: null } }]))
  assert.ok(samePages(pages, pages.map(p => ({ ...p, cover: null, fullWidth: true }))))
  assert.equal(samePages(decorated, [{ ...decorated[0], cover: { ...decorated[0].cover, position: 70 } }]), false)
  for (const url of ['javascript:alert(1)', 'data:image/svg+xml,test', 'https://name:secret@example.com/image.jpg']) assert.equal(validPages([{ ...decorated[0], cover: { url, position: 50 } }]), false)
  assert.equal(validPages([{ ...decorated[0], cover: { url: '/field-notes/meadow.webp', position: 101 } }]), false)
})

test('cover dragging follows the image in pixels and clamps to its crop boundaries', async () => {
  const { coverPositionAfterDrag } = await import('../src/features/notebook/coverModel.ts')
  assert.equal(coverPositionAfterDrag(50, 40, 200), 30)
  assert.equal(coverPositionAfterDrag(50, -40, 200), 70)
  assert.equal(coverPositionAfterDrag(50, 500, 200), 0)
  assert.equal(coverPositionAfterDrag(50, -500, 200), 100)
  assert.equal(coverPositionAfterDrag(50, 40, 0), 50)
})

test('uploaded cover URLs survive saving while malformed asset paths are rejected', async () => {
  const { validPages } = await import('../src/features/notebook/notebookModel.ts')
  const url = `/api/notebook/cover-images/${'a'.repeat(64)}.webp`
  const uploaded = [{ ...pages[0], cover: { url, position: 50 } }]
  assert.ok(validPages(uploaded))
  assert.equal(duplicate(uploaded, 'root').pages[1].cover.url, url)
  for (const invalid of ['/api/notebook/cover-images/../../private.webp', '/api/notebook/cover-images/name.svg', url + '?token=bad']) assert.equal(validPages([{ ...pages[0], cover: { url: invalid, position: 50 } }]), false)
})

test('page font and text size survive copies, recovery and save normalization', async () => {
  const { validPages } = await import('../src/features/notebook/notebookModel.ts')
  const styled = [{ ...pages[0], font: 'serif', smallText: true }]
  assert.ok(validPages(styled))
  assert.equal(duplicate(styled, 'root').pages[1].font, 'serif')
  assert.equal(restore(trash(styled, 'root'), 'root')[0].smallText, true)
  assert.ok(samePages(pages, pages.map(page => ({ ...page, font: 'default', smallText: false }))))
  assert.equal(samePages(styled, [{ ...styled[0], font: 'mono' }]), false)
  assert.equal(validPages([{ ...styled[0], font: 'invalid' }]), false)
})

test('page Markdown export retains headings, formatting, lists, code and images', async () => {
  const { pageMarkdown } = await import('../src/features/notebook/pageExport.ts')
  const page = { ...pages[0], title: 'My page', content: { type: 'doc', content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Section' }] },
    content.content[0],
    { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: true }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Done' }] }] }] },
    { type: 'codeBlock', content: [{ type: 'text', text: '```code```' }] },
    { type: 'image', attrs: { src: 'https://example.com/image.png', alt: 'Image' } },
  ] } }
  const markdown = pageMarkdown(page)
  assert.ok(markdown.startsWith('# My page\n\n## Section'))
  assert.ok(markdown.includes('**Keep the formatting**'))
  assert.ok(markdown.includes('- [x] Done'))
  assert.ok(markdown.includes('````\n```code```\n````'))
  assert.ok(markdown.includes('![Image](https://example.com/image.png)'))
})

test('page lock survives copies, trash and recovery and participates in save acknowledgements', async () => {
  const { validPages } = await import('../src/features/notebook/notebookModel.ts')
  const locked = [{ ...pages[0], locked: true }]
  assert.ok(validPages(locked))
  assert.equal(duplicate(locked, 'root').pages[1].locked, true)
  assert.equal(restore(trash(locked, 'root'), 'root')[0].locked, true)
  assert.ok(samePages(pages, pages.map(page => ({ ...page, locked: false }))))
  assert.equal(samePages(locked, [{ ...locked[0], locked: false }]), false)
  assert.equal(validPages([{ ...pages[0], locked: 'yes' }]), false)
})

test('block color attributes survive recovery validation and reject unsupported values', async () => {
  const { validPages } = await import('../src/features/notebook/notebookModel.ts')
  const colorPages = structuredClone(pages)
  colorPages[0].content.content[0].attrs = { textColor: 'blue', backgroundColor: 'yellow' }
  assert.ok(validPages(colorPages))
  assert.equal(duplicate(colorPages, 'root').pages.find(page => page.title === 'Root (copy)').content.content[0].attrs.textColor, 'blue')
  colorPages[0].content.content[0].attrs.textColor = 'not-a-color'
  assert.equal(validPages(colorPages), false)
})

test('duplicating nested pages remaps internal page links without changing external targets', () => {
  const parentId = crypto.randomUUID(), childId = crypto.randomUUID(), externalId = crypto.randomUUID()
  const source = [{ id: parentId, parentId: null, title: 'Parent', content: { type: 'doc', content: [{ type: 'pageLink', attrs: { pageId: childId, title: 'Child' } }, { type: 'pageLink', attrs: { pageId: externalId, title: 'External' } }] } }, { id: childId, parentId, title: 'Child', content: { type: 'doc', content: [{ type: 'paragraph' }] } }]
  const result = duplicate(source, parentId)
  const copiedParent = result.pages.find(p => p.id === result.id)
  const copiedChild = result.pages.find(p => p.parentId === result.id)
  assert.equal(copiedParent.content.content[0].attrs.pageId, copiedChild.id)
  assert.equal(copiedParent.content.content[1].attrs.pageId, externalId)
  assert.equal(source[0].content.content[0].attrs.pageId, childId)
})
