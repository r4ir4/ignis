export type Comment = { id: string; text: string; createdAt: string }
export type Platform = 'youtube' | 'tiktok' | 'instagram'
export type Video = { channelAvatar?: string; avatarTried?: boolean; platform?: Platform; short?: boolean; sourceUrl?: string; thumbnail?: string; rating?: number; favorite?: boolean; progressSeconds?: number; durationSeconds?: number; comments?: Comment[]; id: string; videoId: string; title: string; channel?: string; collection: string; collections?: string[]; tags: string[]; notes: string; status: 'queued' | 'watching' | 'finished' }
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
  return videos.filter(video => (!collection || videoCollections(video).includes(collection)) && (!status || video.status === status) && `${video.title} ${video.channel ?? ""} ${video.notes} ${video.tags.join(' ')}`.toLowerCase().includes(needle))
}

export function paginateVideos(videos: Video[], requestedPage: number) {
  const pageSize = 24
  const pageCount = Math.max(1, Math.ceil(videos.length / pageSize))
  const page = Math.max(1, Math.min(pageCount, Number.isFinite(requestedPage) ? Math.trunc(requestedPage) : 1))
  return { page, pageCount, videos: videos.slice((page - 1) * pageSize, page * pageSize) }
}

export type Media = { platform: Platform; id: string; short: boolean; url: string }
// Recognises a YouTube video or Short, a full TikTok video link or an Instagram reel; anything else is rejected.
export function parseMedia(input: string): Media | null {
  let url: URL
  try { url = new URL(input.trim()) } catch { return null }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  const host = url.hostname.replace(/^www\.|^m\./, '')
  const youtube = videoId(url.toString())
  if (youtube) return { platform: 'youtube', id: youtube, short: /^\/shorts\//.test(url.pathname), url: url.toString() }
  if (host === 'tiktok.com') {
    const id = /^\/@[^/]+\/video\/(\d{6,25})\/?$/.exec(url.pathname)?.[1]
    return id ? { platform: 'tiktok', id, short: true, url: `https://www.tiktok.com${url.pathname.replace(/\/$/, '')}` } : null
  }
  if (host === 'instagram.com') {
    const match = /^\/(?:[^/]+\/)?(reels?|p)\/([A-Za-z0-9_-]{5,20})\/?$/.exec(url.pathname)
    return match ? { platform: 'instagram', id: match[2], short: true, url: `https://www.instagram.com/${match[1] === 'p' ? 'p' : 'reel'}/${match[2]}/` } : null
  }
  return null
}
export const platformLabel = { youtube: 'YouTube', tiktok: 'TikTok', instagram: 'Instagram' } as const
