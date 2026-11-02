import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyReading, readingMonth, validReading } from '../src/features/notebook/readingModel.ts'
import { samePages, validPages } from '../src/features/notebook/notebookModel.ts'
import { openFixedPage } from '../src/features/notebook/fixedPages.ts'
const data = () => ({ books: [{ id: crypto.randomUUID(), title: 'Coraline', author: 'Neil Gaiman', rating: 4, source: 'borrowed', color: '#cf729d' }], entries: [] })
test('Reading totals separate months and retain multiple books and sessions per day', () => {
 const value = data(), book = value.books[0]
 value.entries = [{ id: crypto.randomUUID(), bookId: book.id, date: '2026-10-18', pages: 40 }, { id: crypto.randomUUID(), bookId: book.id, date: '2026-10-18', pages: 20 }, { id: crypto.randomUUID(), bookId: book.id, date: '2026-09-18', pages: 100 }]
 assert.ok(validReading(value)); const summary = readingMonth(value, '2026-10')
 assert.equal(summary.total, 60); assert.equal(summary.days.length, 31); assert.equal(summary.days[17].entries.length, 2)
 assert.equal(readingMonth(value, '2024-02').days.length, 29)
 for (const patch of [{ pages: 0 }, { pages: 1.5 }, { date: '2026-02-30' }, { bookId: 'missing' }]) assert.equal(validReading({ ...value, entries: [{ ...value.entries[0], ...patch }] }), false)
 assert.equal(validReading({ ...value, books: [book, book] }), false)
})
test('Reading participates in notebook validation and save acknowledgement comparisons', () => {
 const original = openFixedPage([], 'habits').pages, page = original[0], reading = data()
 const updated = [{ ...page, reading }]
 assert.ok(validPages(updated)); assert.equal(samePages(original, updated), false)
 assert.equal(samePages(updated, structuredClone(updated)), true)
 assert.equal(samePages(original, [{ ...page, reading: emptyReading() }]), true)
 assert.equal(validPages([{ ...page, reading: { books: [], entries: [{ id: 'bad' }] } }]), false)
})
test('Removing a book removes only its sessions across months and keeps other books intact', async () => {
 const { removeReadingBook } = await import('../src/features/notebook/readingModel.ts')
 const value = data(), first = value.books[0], second = { ...first, id: crypto.randomUUID(), title: 'Another book' }
 value.books.push(second)
 value.entries = [{ id: crypto.randomUUID(), bookId: first.id, date: '2026-09-01', pages: 10 }, { id: crypto.randomUUID(), bookId: first.id, date: '2026-10-01', pages: 20 }, { id: crypto.randomUUID(), bookId: second.id, date: '2026-10-01', pages: 30 }]
 const result = removeReadingBook(value, first.id)
 assert.ok(validReading(result)); assert.deepEqual(result.books, [second]); assert.deepEqual(result.entries, [value.entries[2]])
 assert.equal(readingMonth(result, '2026-10').total, 30); assert.equal(value.books.length, 2); assert.equal(value.entries.length, 3)
 assert.deepEqual(removeReadingBook(result, first.id), result)
})
test('Already-read pages add to book progress without creating dated chart totals', async () => {
 const { bookPagesRead } = await import('../src/features/notebook/readingModel.ts')
 const value = data(), book = { ...value.books[0], alreadyReadPages: 100 }
 value.books = [book]; value.entries = [{ id: crypto.randomUUID(), bookId: book.id, date: '2026-10-18', pages: 25 }]
 assert.ok(validReading(value)); assert.equal(bookPagesRead(value, book), 125)
 assert.equal(readingMonth(value, '2026-10').total, 25)
 assert.equal(bookPagesRead(value, { ...book, alreadyReadPages: undefined }), 25)
 for (const alreadyReadPages of [-1, 1.5, 1000001]) assert.equal(validReading({ ...value, books: [{ ...book, alreadyReadPages }] }), false)
 const pages = openFixedPage([], 'habits').pages
 assert.equal(samePages([{ ...pages[0], reading: { books: [{ ...book, alreadyReadPages: undefined }], entries: [] } }], [{ ...pages[0], reading: { books: [{ ...book, alreadyReadPages: 0 }], entries: [] } }]), true)
})
