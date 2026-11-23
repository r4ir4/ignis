import test from 'node:test'
import assert from 'node:assert/strict'
import { filterTitles, progressText, sortTitles } from '../src/features/watch/titlesModel.ts'

const t = (over) => ({ id: over.title, mediaType: 'tv', title: 'x', status: 'watchlist', favorite: false, rating: 0, releaseDate: '2000-01-01', addedAt: '2020-01-01', episodes: [], episodeTotal: null, ...over })

test('progress is episodes watched over the known total and never above it', () => {
  assert.deepEqual(progressText(t({ episodeTotal: 4, episodes: [1, 2, 3, 4, 5].map(e => ({ season: 1, episode: e })) })), { fraction: 1, label: '4/4 eps' })
  assert.equal(progressText(t({ episodeTotal: null })), null)
  assert.equal(progressText(t({ mediaType: 'movie', episodeTotal: 3 })), null)
})
test('filter by tab and text', () => {
  const list = [t({ title: 'Alpha', status: 'finished' }), t({ title: 'Beta', favorite: true }), t({ title: 'Alpine' })]
  assert.deepEqual(filterTitles(list, 'finished', '').map(x => x.title), ['Alpha'])
  assert.deepEqual(filterTitles(list, 'favorites', '').map(x => x.title), ['Beta'])
  assert.deepEqual(filterTitles(list, 'all', ' alp ').map(x => x.title), ['Alpha', 'Alpine'])
})
test('sort by rating puts best first, then title', () => {
  const list = [t({ title: 'B', rating: 5 }), t({ title: 'A', rating: 5 }), t({ title: 'C', rating: 9 })]
  assert.deepEqual(sortTitles(list, 'rating').map(x => x.title), ['C', 'A', 'B'])
})
