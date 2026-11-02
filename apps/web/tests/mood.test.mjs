import test from 'node:test'
import assert from 'node:assert/strict'
import { paintMood, validMoodEntries } from '../src/features/notebook/moodModel.ts'
import { samePages, validPages } from '../src/features/notebook/notebookModel.ts'
import { openFixedPage } from '../src/features/notebook/fixedPages.ts'
test('Painting replaces a single day, clearing preserves other months, and future dates are blocked', () => {
 const original = [{ date: '2026-09-30', mood: 'sad' }]
 const marked = paintMood(original, '2026-10-18', 'happy', '2026-10-18')
 assert.ok(validMoodEntries(marked)); assert.equal(marked.length, 2)
 const changed = paintMood(marked, '2026-10-18', 'excited', '2026-10-18')
 assert.equal(changed.length, 2); assert.equal(changed[1].mood, 'excited')
 assert.deepEqual(paintMood(changed, '2026-10-18', null, '2026-10-18'), original)
 assert.equal(paintMood(changed, '2026-10-19', 'happy', '2026-10-18'), changed)
 assert.equal(paintMood(changed, '2026-02-30', 'happy', '2026-10-18'), changed)
 assert.equal(validMoodEntries([...marked, marked[0]]), false)
 assert.equal(validMoodEntries([{ date: '2026-10-18', mood: 'unknown' }]), false)
})
test('Mood entries participate in notebook validation and save acknowledgements', () => {
 const pages = openFixedPage([], 'habits').pages
 const changed = [{ ...pages[0], moods: [{ date: '2026-10-18', mood: 'okay' }] }]
 assert.ok(validPages(changed)); assert.equal(samePages(pages, changed), false)
 assert.equal(samePages(changed, structuredClone(changed)), true)
 assert.equal(samePages(pages, [{ ...pages[0], moods: [] }]), true)
 assert.equal(validPages([{ ...pages[0], moods: [{ date: 'bad', mood: 'sad' }] }]), false)
})
