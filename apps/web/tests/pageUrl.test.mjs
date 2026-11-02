import test from 'node:test'
import assert from 'node:assert/strict'
import { slugify, pagePath, tokenFromLocation, matchesToken } from '../src/features/notebook/pageUrl.ts'

const id = '6a5f5e66-7c6d-4bb1-9616-832e152bbc37'
test('paths read like Notion: readable slug plus a short id', () => {
  assert.equal(pagePath({ id, title: 'A place for your thoughts' }), '/a-place-for-your-thoughts-6a5f5e66')
  assert.equal(pagePath({ id, title: 'Reunião — Planejamento 2026!' }), '/reuniao-planejamento-2026-6a5f5e66')
  assert.equal(pagePath({ id, title: '' }), '/6a5f5e66')
  assert.equal(pagePath({ id, title: '💡' }), '/6a5f5e66')
  assert.ok(slugify('x'.repeat(200)).length <= 60)
})
test('the id decides the page, never the slug', () => {
  const loc = pathname => ({ pathname, hash: '' })
  assert.equal(tokenFromLocation(loc('/a-place-for-your-thoughts-6a5f5e66')), '6a5f5e66')
  assert.equal(tokenFromLocation(loc('/totally-renamed-6a5f5e66')), '6a5f5e66')
  assert.equal(tokenFromLocation(loc('/6a5f5e66')), '6a5f5e66')
  assert.equal(tokenFromLocation(loc('/some-title-6A5F5E667C6D4BB19616832E152BBC37')), '6a5f5e667c6d4bb19616832e152bbc37')
  assert.equal(tokenFromLocation(loc('/')), '')
  assert.equal(tokenFromLocation(loc('/not-a-page')), '')
  assert.equal(tokenFromLocation(loc('/%E0%A4%A')), '', 'malformed escapes are ignored, not thrown')
})
test('old #page= links keep working', () => {
  assert.equal(tokenFromLocation({ pathname: '/', hash: `#page=${id}` }), id)
})
test('tokens match pages by short, compact or full id', () => {
  const page = { id }
  for (const token of ['6a5f5e66', id, id.replace(/-/g, '')]) assert.equal(matchesToken(page, token), true, token)
  for (const token of ['', '6a5f5e6', 'deadbeef', '6a5f5e66-0000']) assert.equal(matchesToken(page, token), false, token)
})
