import test from 'node:test'
import assert from 'node:assert/strict'
import { videoId, filterVideos, paginateVideos } from '../src/features/watch/watchModel.ts'
test('parses YouTube watch, short, share, live and embed links', () => {
 for (const url of ['https://youtu.be/abcdefghijk?t=2', 'https://www.youtube.com/watch?v=abcdefghijk', 'https://youtube.com/shorts/abcdefghijk', 'https://youtube.com/live/abcdefghijk', 'https://www.youtube-nocookie.com/embed/abcdefghijk']) assert.equal(videoId(url), 'abcdefghijk')
})
test('rejects deceptive hosts, unsupported protocols, playlists and malformed IDs', () => {
 for (const url of ['https://youtube.com.evil.org/watch?v=abcdefghijk', 'javascript:alert(1)', 'https://youtube.com/playlist?list=123', 'https://youtu.be/abc', 'ftp://youtube.com/watch?v=abcdefghijk']) assert.equal(videoId(url), null)
})
test('search combines notes and tags with collection and queue filters', () => {
 const videos = [{ title: 'Learning', notes: 'Python', tags: ['work'], collection: 'Study', status: 'queued' }, { title: 'Cooking', notes: '', tags: [], collection: 'Food', status: 'finished' }]
 assert.equal(filterVideos(videos, 'PYTHON', 'Study', 'queued').length, 1)
 assert.equal(filterVideos(videos, 'work', '', 'finished').length, 0)
})

test('pages contain twenty-four videos without gaps or duplicates', () => {
 const videos = Array.from({length: 49}, (_, index) => ({id: String(index)}))
 const pages = [1,2,3].map(page => paginateVideos(videos, page))
 assert.deepEqual(pages.map(page => page.videos.length), [24,24,1])
 assert.deepEqual(pages.flatMap(page => page.videos), videos)
 assert.equal(pages[0].videos[0].id, '0')
 assert.equal(pages[1].videos[0].id, '24')
})
test('pagination handles empty results, exact page boundaries and deletion of the last page', () => {
 assert.deepEqual(paginateVideos([], 3), {page:1, pageCount:1, videos:[]})
 const videos = Array.from({length:48}, (_, index) => ({id:String(index)}))
 assert.equal(paginateVideos(videos, 1).pageCount, 2)
 assert.equal(paginateVideos(videos, 3).page, 2)
 assert.equal(paginateVideos(videos.slice(0,10), 2).page, 1)
 assert.equal(paginateVideos(videos, -1).page, 1)
})

test('a video appears once under each assigned collection and legacy memberships remain usable', () => {
 const video = {id:'a', title:'Video', notes:'', tags:[], status:'queued', collection:'Study', collections:['Study','Work']}
 assert.equal(filterVideos([video], '', 'Study', '').length, 1)
 assert.equal(filterVideos([video], '', 'Work', '').length, 1)
 assert.equal(filterVideos([video], '', '', '').length, 1)
 assert.equal(filterVideos([video], '', 'Food', '').length, 0)
 assert.equal(filterVideos([{...video, collections:undefined}], '', 'Study', '').length, 1)
 assert.equal(filterVideos([{...video, collections:[]}], '', 'Study', '').length, 0)
})
test('parseMedia recognises YouTube videos and Shorts, TikTok videos and Instagram reels', async () => {
  const { parseMedia } = await import('../src/features/watch/watchModel.ts')
  assert.deepEqual(parseMedia('https://www.youtube.com/shorts/aqz-KE-bpKQ'), { platform: 'youtube', id: 'aqz-KE-bpKQ', short: true, url: 'https://www.youtube.com/shorts/aqz-KE-bpKQ' })
  assert.equal(parseMedia('https://youtu.be/dQw4w9WgXcQ').short, false)
  assert.deepEqual(parseMedia('https://www.tiktok.com/@scout2015/video/6718335390845095173?lang=en'), { platform: 'tiktok', id: '6718335390845095173', short: true, url: 'https://www.tiktok.com/@scout2015/video/6718335390845095173' })
  assert.equal(parseMedia('https://www.instagram.com/reel/C8aBcDeFgHi/?igsh=x').id, 'C8aBcDeFgHi')
  assert.equal(parseMedia('https://www.instagram.com/p/C8aBcDeFgHi/').url, 'https://www.instagram.com/p/C8aBcDeFgHi/')
  for (const bad of ['https://vm.tiktok.com/ZMabc/', 'https://example.com/x', 'javascript:alert(1)', 'not a url']) assert.equal(parseMedia(bad), null)
})
