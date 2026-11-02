export type ReadingBook = { alreadyReadPages?: number; id: string; title: string; author: string; rating: number; source: 'owned' | 'bought' | 'borrowed'; color: string }
export type ReadingEntry = { id: string; bookId: string; date: string; pages: number }
export type ReadingData = { books: ReadingBook[]; entries: ReadingEntry[] }
export const readingColors = ['#cf729d', '#dd9560', '#d4b45f', '#89aaa9', '#ab8ac3', '#8ca87b']
export const emptyReading = (): ReadingData => ({ books: [], entries: [] })
export function validReading(value: unknown): value is ReadingData {
  const data = value as ReadingData
  if (!data || !Array.isArray(data.books) || !Array.isArray(data.entries) || data.books.length > 500 || data.entries.length > 20000) return false
  const ids = new Set<string>(), entries = new Set<string>()
  for (const book of data.books) {
    if (!book || (book.alreadyReadPages != null && (!Number.isInteger(book.alreadyReadPages) || book.alreadyReadPages < 0 || book.alreadyReadPages > 1000000)) || typeof book.id !== 'string' || !book.id || ids.has(book.id) || typeof book.title !== 'string' || !book.title.trim() || book.title.length > 200 || typeof book.author !== 'string' || book.author.length > 200 || !Number.isInteger(book.rating) || book.rating < 0 || book.rating > 5 || !['owned', 'bought', 'borrowed'].includes(book.source) || !/^#[a-f\d]{6}$/i.test(book.color)) return false
    ids.add(book.id)
  }
  for (const entry of data.entries) {
    if (!entry || typeof entry.id !== 'string' || !entry.id || entries.has(entry.id) || !ids.has(entry.bookId) || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date) || !Number.isFinite(Date.parse(entry.date)) || new Date(entry.date).toISOString().slice(0, 10) !== entry.date || !Number.isInteger(entry.pages) || entry.pages < 1 || entry.pages > 10000) return false
    entries.add(entry.id)
  }
  return true
}
export function readingMonth(data: ReadingData, month: string) {
  const entries = data.entries.filter(entry => entry.date.startsWith(month + '-'))
  const days = new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate()
  return { entries, total: entries.reduce((sum, entry) => sum + entry.pages, 0), days: Array.from({ length: days }, (_, index) => { const date = `${month}-${String(index + 1).padStart(2, '0')}`; return { date, entries: entries.filter(entry => entry.date === date) } }) }
}

export function removeReadingBook(data: ReadingData, bookId: string): ReadingData {
  return { books: data.books.filter(book => book.id !== bookId), entries: data.entries.filter(entry => entry.bookId !== bookId) }
}

export function bookPagesRead(data: ReadingData, book: ReadingBook): number {
  return (book.alreadyReadPages || 0) + data.entries.filter(entry => entry.bookId === book.id).reduce((sum, entry) => sum + entry.pages, 0)
}
