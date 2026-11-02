import test from 'node:test'
import assert from 'node:assert/strict'
import { pageTrail } from '../src/features/notebook/breadcrumbModel.ts'
const page = (id, parentId = null) => ({ id, parentId, title: id })
test('Breadcrumbs include the complete root-to-current hierarchy', () => {
 const pages = [page('root'), page('middle', 'root'), page('parent', 'middle'), page('current', 'parent')]
 assert.deepEqual(pageTrail(pages, pages[3]).map(p => p.id), ['root', 'middle', 'parent', 'current'])
})
test('Breadcrumbs stop safely at missing, deleted or cyclic ancestors', () => {
 const current = page('current', 'missing')
 assert.deepEqual(pageTrail([current], current), [current])
 const deleted = { ...page('missing'), deletedAt: '2026-10-18' }
 assert.deepEqual(pageTrail([current, deleted], current), [current])
 const a = page('a', 'b'), b = page('b', 'a')
 assert.deepEqual(pageTrail([a, b], a).map(p => p.id), ['b', 'a'])
})
