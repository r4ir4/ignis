export type Comment = { id: string; text: string; createdAt: string }
export type Video = { rating?: number; favorite?: boolean; progressSeconds?: number; durationSeconds?: number; comments?: Comment[]; id: string; videoId: string; title: string; channel?: string; collection: string; collections?: string[]; tags: string[]; notes: string; status: 'queued' | 'watching' | 'finished' }
export type WatchState = { revision: number; videos: Video[] }
export function videoId(input: string): string | null {
  try {
    const url = new URL(input)
    if (!['https:', 'http:'].includes(url.protocol)) return null
    let id: string | null = null
    if (url.hostname === 'youtu.be') id = url.pathname.slice(1)
    if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'www.youtube-nocookie.com'].includes(url.hostname)) {
      id = url.pathname === '/watch' ? url.searchParams.get('v') : /^\/(shorts|embed|live)\/([^/]+)\/?$/.exec(url.pathname)?.[2] ?? null
    }
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null
  } catch { return null }
}
export function videoCollections(video: Pick<Video, 'collection' | 'collections'>) {
  return video.collections ?? (video.collection.trim() ? [video.collection.trim()] : [])
}
export function filterVideos(videos: Video[], query: string, collection: string, status: string) {
  const needle = query.trim().toLowerCase()
  return videos.filter(video => (!collection || videoCollections(video).includes(collection)) && (!status || video.status === status) && `${video.title} ${video.notes} ${video.tags.join(' ')}`.toLowerCase().includes(needle))
}

export function paginateVideos(videos: Video[], requestedPage: number) {
  const pageSize = 10
  const pageCount = Math.max(1, Math.ceil(videos.length / pageSize))
  const page = Math.max(1, Math.min(pageCount, Number.isFinite(requestedPage) ? Math.trunc(requestedPage) : 1))
  return { page, pageCount, videos: videos.slice((page - 1) * pageSize, page * pageSize) }
}
