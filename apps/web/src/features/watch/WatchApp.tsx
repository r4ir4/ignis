import { useEffect, useRef, useState } from 'react'
import './flame.css'
import { flameLogoSvg } from './flameLogo'
import { ResumePlayer } from './ResumePlayer'
import { playbackTime } from './ResumePlayer'
import { SocialPlayer } from './SocialPlayer'
import { ShortsViewer } from './ShortsViewer'
import { VideoActions } from './VideoActions'
import { VideoNotes } from './VideoNotes'
import { filterVideos, paginateVideos, parseMedia, platformLabel, videoCollections, videoId } from './watchModel'
import type { Media } from './watchModel'
import type { Video, WatchState } from './watchModel'

const serif = "font-semibold tracking-tight"
const buttonBase = 'inline-flex min-h-11 items-center justify-center rounded-full border-2 px-5 py-2 text-xs font-bold uppercase tracking-widest transition-all focus-visible:outline-2 focus-visible:outline-offset-4 disabled:opacity-50'
const button = `${buttonBase} border-[#15000b] bg-white text-[#15000b] shadow-[0_3px_0_#15000b] hover:-translate-y-0.5 hover:bg-[#c1ff1a] hover:shadow-[0_5px_0_#15000b] active:translate-y-0.5 active:shadow-none`
const primary = `${buttonBase} border-[#15000b] bg-[#ff5e32] text-[#15000b] shadow-[0_3px_0_#15000b] hover:-translate-y-0.5 hover:bg-[#f04e23] hover:shadow-[0_5px_0_#15000b] active:translate-y-0.5 active:shadow-none`
const editorInput = 'mt-2 block min-h-12 w-full min-w-0 rounded-[14px] border-2 border-[#15000b] bg-white px-4 py-3 text-base font-normal normal-case tracking-normal text-[#15000b] placeholder:text-[#7a6a72] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7f3aed]'
const fieldLabel = 'block text-[11px] font-bold uppercase tracking-[.16em]'
const guideItem = 'flex w-full items-center gap-4 rounded-[12px] px-3 py-2.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#7f3aed]'
const ytChip = 'inline-flex h-8 shrink-0 items-center whitespace-nowrap rounded-[10px] px-3 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7f3aed]'
const chip = 'inline-flex min-h-9 items-center rounded-full border-2 border-[#15000b] px-3.5 text-xs font-bold uppercase tracking-widest transition-colors focus-visible:outline-2 focus-visible:outline-offset-2'
const menuItem = 'flex w-full items-center rounded-[12px] px-3 py-2 text-left hover:bg-[#c1ff1a] focus-visible:outline-2 focus-visible:outline-offset-[-2px]'
const palette = ['#c1ff1a', '#f4e11b', '#b9c7f8', '#ffb3da', '#c28cf5', '#ffcfa8']
const collectionColor = (name: string) => palette[[...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % palette.length]
const progressOf = (video: Video) => video.durationSeconds && video.progressSeconds ? Math.min(1, video.progressSeconds / video.durationSeconds) : 0
const labels = { queued: 'Up next', watching: 'Watching', finished: 'Finished' }
type Metadata = { channelAvatar?: string; videoId?: string; title: string; channel: string; thumbnail: string }
function MediaThumb({ video, className = '' }: { video: { platform?: string; thumbnail?: string }; className?: string }) {
  const tone = video.platform === 'tiktok' ? 'from-[#15000b] via-[#1a0088] to-[#ff00ae]' : 'from-[#7f3aed] via-[#ff00ae] to-[#ff5e32]'
  return <div className={`relative aspect-[9/16] w-full overflow-hidden bg-gradient-to-br ${tone} ${className}`}>
    {video.thumbnail && <img src={video.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" onError={event => { event.currentTarget.style.display = 'none' }} className="absolute inset-0 h-full w-full object-cover" />}
    <span className="absolute inset-x-0 bottom-3 text-center text-[11px] font-bold uppercase tracking-[.16em] text-white/90">{video.platform === 'tiktok' ? 'TikTok' : 'Instagram'}</span>
  </div>
}
function Thumbnail({ id, className = '', vertical = false }: { id: string; className?: string; vertical?: boolean }) {
  return <img key={id} src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" loading="lazy" onError={event => { event.currentTarget.onerror = null; event.currentTarget.style.visibility = 'hidden' }} className={`${vertical ? 'aspect-[9/16]' : 'aspect-video'} w-full bg-[#b9c7f8] object-cover ${className}`} />
}
const watchBase = location.hostname === 'watch.ignis.farm' ? '' : '/watch'
const slug = (name: string) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'collection'
const viewSegments: Record<string, string> = { shorts: 'shorts', queued: 'up-next', watching: 'watching', finished: 'finished', favorites: 'favorites' }
type Route = { kind: 'video'; id: string } | { kind: 'library'; view: string; collection: string }
function parseRoute(pathname: string): Route {
  const path = (pathname.startsWith(watchBase) ? pathname.slice(watchBase.length) : pathname).replace(/\/+$/, '')
  const video = /^\/video\/([^/]+)$/.exec(path)
  if (video) return { kind: 'video', id: decodeURIComponent(video[1]) }
  const collection = /^\/collection\/([^/]+)$/.exec(path)
  if (collection) return { kind: 'library', view: 'collection', collection: decodeURIComponent(collection[1]) }
  const view = Object.entries(viewSegments).find(([, segment]) => path === '/' + segment)?.[0]
  return { kind: 'library', view: view ?? 'home', collection: '' }
}
const viewPath = (key: string) => key === 'home' ? watchBase || '/' : key.startsWith('collection:') ? `${watchBase}/collection/${slug(key.slice(11))}` : `${watchBase}/${viewSegments[key]}`
export default function WatchApp() {
  const [route, setRoute] = useState<Route>(() => parseRoute(location.pathname))
  useEffect(() => {
    const sync = () => { setRoute(parseRoute(location.pathname)); setPage(1) }
    addEventListener('popstate', sync)
    return () => removeEventListener('popstate', sync)
  }, [])
  function navigate(path: string) {
    if (path !== location.pathname) history.pushState(null, '', path)
    setRoute(parseRoute(path)); setPage(1); setQuick(''); setQuery('')
    window.scrollTo({ top: 0 })
  }
  function go(event: React.MouseEvent, path: string) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault(); navigate(path)
  }
  const [data, setData] = useState<WatchState | null>(null)
  const acceptSnapshot = (next: WatchState) => setData(previous => !previous || next.revision >= previous.revision ? next : previous)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const local = location.hostname !== 'watch.ignis.farm'
  const libraryPath = local ? '/watch' : '/'
  const playing = route.kind === 'video' ? route.id : null
  const videoPath = (video: Video) => `${local ? '/watch' : ''}/video/${encodeURIComponent(video.id)}`
  const opened = useRef<string | null>(null)
  const [collectionDraft, setCollectionDraft] = useState('')
  const [editor, setEditor] = useState<Video | null>(null)
  const [url, setUrl] = useState('')
  const [metadata, setMetadata] = useState<Metadata | null>(null)
  const [lookup, setLookup] = useState('')
  const [lookupBusy, setLookupBusy] = useState(false)
  const lastAutoTitle = useRef('')
  const dialog = useRef<HTMLDialogElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  const media = parseMedia(url)
  const parsedId = media?.platform === 'youtube' ? media.id : null
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) document.querySelectorAll<SVGSVGElement>('svg.flame-logo').forEach(svg => svg.pauseAnimations?.())
  }, [!!playing])
  const [quick, setQuick] = useState('')
  const [menuPanel, setMenuPanel] = useState<{ id: string; query: string } | null>(null)
  const needsAvatars = !!data?.videos.some(video => (video.platform ?? 'youtube') === 'youtube' && !video.avatarTried)
  useEffect(() => {
    if (!needsAvatars) return
    const controller = new AbortController()
    void (async () => {
      try {
        for (let round = 0; round < 8; round++) {
          const response = await fetch('/api/watch/avatars', { method: 'POST', signal: controller.signal })
          if (!response.ok) return
          const { updated, remaining } = await response.json()
          const latest = await fetch('/api/watch', { signal: controller.signal })
          if (latest.ok) acceptSnapshot(await latest.json())
          if (!updated || !remaining) return
        }
      } catch { /* avatars are cosmetic; retry on the next visit */ }
    })()
    return () => controller.abort()
  }, [needsAvatars])
  const [guideOpen, setGuideOpen] = useState(() => typeof window === 'undefined' || window.matchMedia('(min-width: 1024px)').matches)
  const [quickError, setQuickError] = useState('')
  const [looking, setLooking] = useState(false)
  const [sort, setSort] = useState<'added' | 'title' | 'rating'>('added')

  useEffect(() => {
    document.title = 'Watch · Ignis Farm'
    const fonts = document.createElement('link')
    fonts.rel = 'stylesheet'; fonts.href = 'https://fonts.googleapis.com/css2?family=Anton&family=Fraunces:ital,opsz,wght@0,9..144,600;0,9..144,900;1,9..144,900&family=Poppins:wght@400;500;600;700&display=swap'
    document.head.append(fonts)
    const controller = new AbortController()
    fetch('/api/watch', { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('Could not load your library. Sign in again if your session expired.')
      setData(await response.json())
    }).catch(reason => { if (!controller.signal.aborted) setError(reason.message) })
    return () => { controller.abort(); fonts.remove() }
  }, [])
  useEffect(() => {
    if (editor) { previousFocus.current = document.activeElement as HTMLElement; dialog.current?.showModal() }
    else { dialog.current?.close(); previousFocus.current?.focus() }
  }, [!!editor])
  useEffect(() => {
    setMetadata(null); setLookup(''); setLookupBusy(false)
    if (!editor || !media || media.platform === 'instagram') return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setLookupBusy(true)
      try {
        const response = await fetch(media.platform === 'youtube' ? `/api/watch/metadata?video_id=${media.id}` : `/api/watch/metadata/social?url=${encodeURIComponent(media.url)}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]) })
        const result = await response.json()
        if (controller.signal.aborted) return
        if (!response.ok) throw new Error(typeof result.detail === 'string' ? result.detail : 'Could not load video details. Enter a title below.')
        setMetadata(result)
        const previousAuto = lastAutoTitle.current
        setEditor(previous => previous ? { ...previous, channel: result.channel, title: result.title && (!previous.title.trim() || previous.title === previousAuto) ? result.title : previous.title } : null)
        lastAutoTitle.current = result.title
      } catch (reason) {
        if (!controller.signal.aborted) setLookup(reason instanceof Error && reason.name !== 'TimeoutError' ? reason.message : 'Lookup timed out. You can enter the title yourself.')
      } finally { if (!controller.signal.aborted) setLookupBusy(false) }
    }, 350)
    return () => { clearTimeout(timer); controller.abort() }
  }, [media?.platform, media?.id, !!editor])

  async function save(videos: Video[]) {
    if (!data || busy) return false
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/watch', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: data.revision, videos }) })
      if (response.status === 409) {
        const latest = await fetch('/api/watch'); if (latest.ok) setData(await latest.json())
        throw new Error('Library changed in another tab. Your draft is still open; review and retry.')
      }
      if (!response.ok) throw new Error('Could not save. Your previous library is preserved. Check your connection or sign-in and retry.')
      acceptSnapshot(await response.json()); return true
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Save failed.'); return false }
    finally { setBusy(false) }
  }
  function edit(video?: Video) {
    setError(''); lastAutoTitle.current = ''; setCollectionDraft('')
    setUrl(video ? (video.platform && video.platform !== 'youtube' ? video.sourceUrl ?? '' : video.short ? `https://www.youtube.com/shorts/${video.videoId}` : `https://www.youtube.com/watch?v=${video.videoId}`) : '')
    setEditor(video ? { ...video } : { id: crypto.randomUUID(), videoId: '', title: '', channel: '', collection: '', tags: [], notes: '', status: 'queued' })
  }
  function addCollection() {
    const name = collectionDraft.trim()
    if (!name || !editor) return
    if (name.length > 80 || (videoCollections(editor).length >= 20 && !videoCollections(editor).includes(name))) { setError('Use up to 20 collections, each under 80 characters.'); return }
    setEditor(previous => previous ? { ...previous, collections: [...new Set([...videoCollections(previous), name])] } : previous)
    setCollectionDraft('')
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const found = parseMedia(url), id = found?.id
    if (!found || !id || !editor || !data) { setError('Enter a valid YouTube, TikTok or Instagram link.'); return }
    if (data.videos.some(video => video.videoId === id && (video.platform ?? 'youtube') === found.platform && video.id !== editor.id)) { setError('This video is already in your library.'); return }
    const cleaned = { ...editor, videoId: id, platform: found.platform, short: found.short, sourceUrl: found.platform === 'youtube' ? '' : found.url, thumbnail: metadata?.thumbnail && found.platform !== 'youtube' ? metadata.thumbnail : found.platform === editor.platform && id === editor.videoId ? editor.thumbnail ?? '' : '', channel: metadata ? metadata.channel : editor.videoId === id ? editor.channel ?? '' : '', channelAvatar: metadata ? metadata.channelAvatar ?? '' : editor.videoId === id ? editor.channelAvatar ?? '' : '', avatarTried: !!metadata || (editor.videoId === id && !!editor.avatarTried), collections: [...new Set([...videoCollections(editor), collectionDraft.trim()].filter(Boolean))], collection: videoCollections(editor)[0] ?? collectionDraft.trim(), tags: [...new Set(editor.tags.map(tag => tag.trim()).filter(Boolean))] }
    if (cleaned.collections.length > 20 || cleaned.collections.some(name => name.length > 80)) { setError('Use up to 20 collections, each under 80 characters.'); return }
    if (cleaned.tags.length > 20 || cleaned.tags.some(tag => tag.length > 80)) { setError('Use up to 20 tags, each under 80 characters.'); return }
    if (await save(data.videos.some(video => video.id === editor.id) ? data.videos.map(video => video.id === editor.id ? cleaned : video) : [...data.videos, cleaned])) setEditor(null)
  }
  const collections = [...new Set(data?.videos.flatMap(videoCollections))].sort()
  const isExisting = !!editor && !!data?.videos.some(video => video.id === editor.id)
  const collectionCount = (name: string) => data?.videos.filter(video => videoCollections(video).includes(name)).length ?? 0
  const collectionMatches = collections.filter(name => editor && !videoCollections(editor).includes(name) && name.toLowerCase().includes(collectionDraft.trim().toLowerCase())).sort((a, b) => collectionCount(b) - collectionCount(a) || a.localeCompare(b))
  const status = route.kind === 'library' && ['queued', 'watching', 'finished'].includes(route.view) ? route.view : ''
  const onlyFavorites = route.kind === 'library' && route.view === 'favorites'
  const collection = route.kind === 'library' && route.view === 'collection' ? collections.find(name => slug(name) === route.collection) ?? '' : ''
  const isShortsView = route.kind === 'library' && route.view === 'shorts'
  const routeKey = route.kind === 'video' ? (data?.videos.find(video => video.id === route.id)?.short ? 'shorts-viewer' : `video:${route.id}`) : `${route.view}:${route.collection}`
  const activeView = collection ? 'collection:' + collection : onlyFavorites ? 'favorites' : status || (isShortsView ? 'shorts' : 'home')
  const viewTitle = collection || (onlyFavorites ? 'Favorites' : status ? labels[status as keyof typeof labels] : isShortsView ? 'Shorts' : 'Home')
  useEffect(() => { if (!playing) document.title = `${viewTitle} · Watch · Ignis Farm` }, [playing, viewTitle])
  const count = (value: string) => data?.videos.filter(video => !video.short && (!value || video.status === value)).length ?? 0
  const guideViews = [
    { key: 'home', label: 'Home', icon: 'm3 11 9-8 9 8M5 10v10h5v-6h4v6h5V10', count: count('') },
    { key: 'shorts', label: 'Shorts', icon: 'M8 3h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM10.5 9v6l4.5-3Z', count: data?.videos.filter(video => video.short).length ?? 0 },
    { key: 'queued', label: 'Up next', icon: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z', count: count('queued') },
    { key: 'watching', label: 'Watching', icon: 'M8 5v14l11-7Z', count: count('watching') },
    { key: 'finished', label: 'Finished', icon: 'm5 12 5 5 9-10', count: count('finished') },
    { key: 'favorites', label: 'Favorites', icon: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z', count: data?.videos.filter(video => !video.short && video.favorite).length ?? 0 },
  ]
  function chooseView(key: string) {
    navigate(viewPath(key))
    if (!window.matchMedia('(min-width: 1024px)').matches) setGuideOpen(false)
  }
  const filtering = !!(query.trim() || collection || status || onlyFavorites)
  const visible = (() => {
    const pool = (data?.videos ?? []).filter(video => isShortsView ? video.short : collection ? true : !video.short)
    const found = filterVideos(pool, query, collection, status).filter(video => !onlyFavorites || video.favorite)
    return sort === 'title' ? [...found].sort((a, b) => a.title.localeCompare(b.title)) : sort === 'rating' ? [...found].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)) : [...found].reverse()
  })()
  const continuing = (data?.videos ?? []).filter(video => !video.short && video.status === 'watching' && progressOf(video) > 0).sort((a, b) => b.progressSeconds! - a.progressSeconds!).slice(0, 4)
  const current = data?.videos.find(video => video.id === playing)
  const shortsList = (data?.videos ?? []).filter(video => video.short).reverse()
  const shortIndex = current?.short ? shortsList.findIndex(video => video.id === current.id) : -1
  const neighbours = shortIndex >= 0 ? { previous: shortsList[shortIndex - 1], next: shortsList[shortIndex + 1] } : null
  const pagination = paginateVideos(visible, page)
  useEffect(() => { if (data && page !== pagination.page) setPage(pagination.page) }, [data, page, pagination.page])
  async function setPreference(video: Video, value: Partial<Pick<Video, 'favorite' | 'status'>>) {
    setError('')
    try {
      const response = await fetch(`/api/watch/${video.id}/preferences`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value), signal: AbortSignal.timeout(15000) })
      if (!response.ok) throw new Error()
      acceptSnapshot(await response.json())
    } catch { setError('Could not save this change. Please try again.') }
  }
  async function toggleCollection(video: Video, name: string) {
    if (!data) return
    const current = videoCollections(video), next = current.includes(name) ? current.filter(item => item !== name) : [...current, name]
    await save(data.videos.map(item => item.id === video.id ? { ...item, collections: next, collection: next[0] ?? '' } : item))
  }
  async function quickAdd(event: React.FormEvent) {
    event.preventDefault()
    const found = parseMedia(quick.trim())
    if (!data || busy) return
    if (!found) { if (/^https?:\/\//i.test(quick.trim())) setQuickError('Paste a YouTube, TikTok (full video link) or Instagram reel link.'); return }
    if (data.videos.some(video => video.videoId === found.id && (video.platform ?? 'youtube') === found.platform)) { setQuickError('This video is already in your library.'); return }
    let title = '', channel = '', thumbnail = '', channelAvatar = ''
    if (found.platform !== 'instagram') {
      setLooking(true)
      try {
        const response = await fetch(found.platform === 'youtube' ? `/api/watch/metadata?video_id=${found.id}` : `/api/watch/metadata/social?url=${encodeURIComponent(found.url)}`, { signal: AbortSignal.timeout(12_000) })
        if (response.ok) { const result = await response.json(); title = result.title; channel = result.channel; channelAvatar = result.channelAvatar ?? ''; if (found.platform !== 'youtube') thumbnail = result.thumbnail ?? '' }
      } catch { /* fall through to the details dialog */ }
      finally { setLooking(false) }
    }
    if (!title) { setUrl(quick.trim()); setEditor({ id: crypto.randomUUID(), videoId: '', title: '', channel, collection: '', tags: [], notes: '', status: 'queued' }); setQuick(''); return }
    const collections = collection ? [collection] : []
    if (await save([...data.videos, { id: crypto.randomUUID(), videoId: found.id, platform: found.platform, short: found.short, sourceUrl: found.platform === 'youtube' ? '' : found.url, thumbnail, channelAvatar, avatarTried: true, title, channel, collection: collections[0] ?? '', collections, tags: [], notes: '', status: 'queued' }])) {
      setQuick(''); setQuery(''); setQuickError('')
      if (found.short) navigate(viewPath('shorts')); else if (route.kind === 'library' && !['home', 'collection', 'queued'].includes(route.view)) navigate(viewPath('home'))
    }
  }
  function changePage(next: number) {
    setPage(next)
    document.getElementById('watch-search')?.scrollIntoView({ block: 'start' })
  }
  useEffect(() => {
    if (current) document.title = `${current.title} · Ignis Watch`
    if (!current || current.status !== 'queued' || opened.current === current.id) return
    opened.current = current.id
    void save(data!.videos.map(video => video.id === current.id ? { ...video, status: 'watching' } : video))
  }, [current?.id, current?.status])
  const renderCard = (video: Video) => <li key={video.id} className="group/card relative min-w-0">
    <div className="group relative overflow-hidden rounded-[12px] bg-[#b9c7f8]">
      <a href={videoPath(video)} onClick={event => go(event, videoPath(video))} aria-label={`Watch ${video.title}`} className="block focus-visible:outline-2 focus-visible:outline-offset-4">{video.platform && video.platform !== 'youtube' ? <MediaThumb video={video} className="transition-transform duration-200 group-hover:scale-[1.03]" /> : <Thumbnail id={video.videoId} vertical={video.short} className="transition-transform duration-200 group-hover:scale-[1.03]" />}</a>
      {!video.short && !!video.durationSeconds && <span className="pointer-events-none absolute bottom-2 right-2 rounded-md bg-black/80 px-1.5 py-0.5 text-xs font-medium tabular-nums text-white">{playbackTime(video.durationSeconds)}</span>}
      {progressOf(video) > 0 && video.status !== 'finished' && <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1 bg-white/30"><div className="h-full bg-[#ff0033]" style={{ width: `${progressOf(video) * 100}%` }} /></div>}
    </div>
    <div className="mt-3 flex items-start gap-3">
      {video.channelAvatar ? <img src={video.channelAvatar} alt="" loading="lazy" referrerPolicy="no-referrer" onError={event => { event.currentTarget.style.display = 'none' }} className="mt-0.5 h-9 w-9 shrink-0 rounded-full border border-[#15000b]/20 bg-[#b9c7f8] object-cover" /> : <span aria-hidden="true" className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#15000b]/30 text-sm font-bold uppercase" style={{ background: collectionColor(video.channel || video.title) }}>{(video.channel || video.title).trim().charAt(0) || '·'}</span>}
      <div className="min-w-0 flex-1">
        <h3 className="line-clamp-2 [overflow-wrap:anywhere] text-sm font-semibold leading-5"><a href={videoPath(video)} onClick={event => go(event, videoPath(video))} className="focus-visible:outline-2 focus-visible:outline-offset-2">{video.title}</a></h3>
        <p className="mt-0.5 truncate text-xs leading-5 text-[#55464d]">{video.channel || (video.short ? platformLabel[video.platform ?? 'youtube'] : 'Unknown channel')}</p>
        <p className="truncate text-xs leading-5 text-[#55464d]">{[video.status === 'watching' ? (progressOf(video) > 0 ? `Watching · ${Math.round(progressOf(video) * 100)}%` : 'Watching') : video.status === 'finished' ? 'Watched' : '', ...(video.short && video.channel ? [platformLabel[video.platform ?? 'youtube']] : []), ...videoCollections(video), video.favorite ? '♥' : '', video.rating ? `★${video.rating}` : ''].filter(Boolean).join(' · ') || 'Up next'}</p>
      </div>
      <details className="relative shrink-0 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:transition-opacity group-hover/card:opacity-100 group-focus-within/card:opacity-100 open:opacity-100" onToggle={event => { if (!event.currentTarget.open) { setMenuPanel(null); return } setMenuPanel(null); const el = event.currentTarget; const close = (e: Event) => { if (!el.contains(e.target as Node)) { el.open = false; document.removeEventListener('pointerdown', close) } }; document.addEventListener('pointerdown', close) }}>
        <summary aria-label={`Actions for ${video.title}`} className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-full text-lg leading-none hover:bg-[#15000b]/10 focus-visible:outline-2 focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden">⋮</summary>
        <div className="absolute right-0 z-10 mt-1 w-60 rounded-[14px] border-2 border-[#15000b] bg-white p-1.5 text-sm shadow-[0_4px_0_#15000b]">
          {menuPanel?.id === video.id ? <>
            <button type="button" className={`${menuItem} font-semibold`} onClick={() => setMenuPanel(null)}>← Collections</button>
            <input autoFocus type="search" aria-label="Find a collection" placeholder="Find…" value={menuPanel.query} onChange={event => setMenuPanel({ id: video.id, query: event.target.value })} className="mx-1 mb-1 mt-0.5 h-9 w-[calc(100%-.5rem)] rounded-[10px] border-2 border-[#15000b]/30 bg-white px-3 text-sm focus-visible:border-[#15000b] focus-visible:outline-none" />
            <div className="max-h-56 overflow-y-auto">{collections.filter(name => name.toLowerCase().includes(menuPanel.query.trim().toLowerCase())).sort((a, b) => Number(videoCollections(video).includes(b)) - Number(videoCollections(video).includes(a)) || collectionCount(b) - collectionCount(a)).map(name => { const has = videoCollections(video).includes(name); return <button key={name} type="button" role="menuitemcheckbox" aria-checked={has} className={menuItem} onClick={() => void toggleCollection(video, name)}><span aria-hidden="true" className="mr-2 inline-block w-4 shrink-0">{has ? '✓' : ''}</span><span className="truncate">{name}</span></button> })}
              {!collections.some(name => name.toLowerCase().includes(menuPanel.query.trim().toLowerCase())) && <p className="px-3 py-2 text-xs text-[#55464d]">No collection matches.</p>}</div>
          </> : <>
            {video.status !== 'watching' && <button type="button" className={menuItem} onClick={() => void setPreference(video, { status: 'watching' })}>Mark watching</button>}
            {video.status !== 'queued' && <button type="button" className={menuItem} onClick={() => void setPreference(video, { status: 'queued' })}>Move to Up next</button>}
            {video.status !== 'finished' && <button type="button" className={menuItem} onClick={() => void setPreference(video, { status: 'finished' })}>Mark finished</button>}
            <button type="button" className={menuItem} onClick={() => void setPreference(video, { favorite: !video.favorite })}>{video.favorite ? 'Remove favorite' : '♥ Favorite'}</button>
            {collections.length > 0 && <button type="button" aria-haspopup="menu" className={`${menuItem} justify-between`} onClick={() => setMenuPanel({ id: video.id, query: '' })}><span>Collections{videoCollections(video).length > 0 && <span className="ml-1.5 text-xs text-[#55464d]">{videoCollections(video).length}</span>}</span><span aria-hidden="true">›</span></button>}
            <div className="my-1 border-t border-[#15000b]/20 pt-1"><button type="button" className={menuItem} onClick={() => edit(video)}>Edit details…</button></div>
          </>}
        </div>
      </details>
    </div>
  </li>
  const related = current ? [...(data?.videos ?? [])].filter(video => video.id !== current.id && !video.short === !current.short).sort((a, b) => {
    const shared = (video: Video) => videoCollections(video).filter(name => videoCollections(current).includes(name)).length
    return shared(b) - shared(a) || Number(b.status === 'queued') - Number(a.status === 'queued')
  }).slice(0, 14) : []
  const shortsPage = current?.short ? <ShortsViewer shorts={shortsList} currentId={current.id} onOpen={video => navigate(videoPath(video))} onClose={() => navigate(viewPath('shorts'))} onSaved={acceptSnapshot} renderThumb={video => video.platform && video.platform !== 'youtube' ? <MediaThumb video={video} className="h-full" /> : <Thumbnail id={video.videoId} vertical className="h-full" />} /> : null
  const watchPage = shortsPage ?? <div className="mx-auto max-w-[1700px]">
    {error && !editor && <p role="alert" className="mb-5 rounded-[14px] border-2 border-[#15000b] bg-[#ffb3da] p-3 text-sm font-medium">{error}</p>}
    {!data && !error && <p role="status" className="py-10 text-[#55464d]">Loading video…</p>}
    {data && !current && <div className="py-10"><h1 className="text-2xl font-bold">Video not found.</h1><p className="mt-3 text-[#55464d]">This video may have been removed from your library.</p><a className={`${button} mt-5`} href={libraryPath} onClick={event => go(event, viewPath('home'))}>← Back to library</a></div>}
    {current && <div className={`grid items-start gap-x-6 gap-y-8 ${current.short ? 'lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)]' : 'xl:grid-cols-[minmax(0,1fr)_400px]'}`}>
      <article className="min-w-0">
        <div className={current.short ? 'mx-auto w-full max-w-[400px]' : 'w-full'}>
          {current.short && current.platform && current.platform !== 'youtube' ? <SocialPlayer key={current.id} video={current} /> : <ResumePlayer key={current.id} video={current} vertical={current.short} onSaved={acceptSnapshot} />}
        </div>
        {current.short && neighbours && <nav aria-label="More shorts" className="mx-auto mt-4 flex max-w-[400px] items-center justify-between gap-3"><a className={button} aria-disabled={!neighbours.previous} href={neighbours.previous ? videoPath(neighbours.previous) : undefined} onClick={event => neighbours.previous ? go(event, videoPath(neighbours.previous)) : event.preventDefault()}>↑ Previous</a><a className={button} aria-disabled={!neighbours.next} href={neighbours.next ? videoPath(neighbours.next) : undefined} onClick={event => neighbours.next ? go(event, videoPath(neighbours.next)) : event.preventDefault()}>Next ↓</a></nav>}
        <h1 className="mt-4 text-xl font-bold leading-snug [overflow-wrap:anywhere]">{current.title}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="flex min-w-0 items-center gap-3">
            {current.channelAvatar ? <img src={current.channelAvatar} alt="" referrerPolicy="no-referrer" className="h-10 w-10 shrink-0 rounded-full border border-[#15000b]/20 bg-[#b9c7f8] object-cover" /> : <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#15000b]/30 text-base font-bold uppercase" style={{ background: collectionColor(current.channel || current.title) }}>{(current.channel || current.title).trim().charAt(0) || '·'}</span>}
            <div className="min-w-0"><p className="truncate font-semibold leading-tight">{current.channel || 'Unknown channel'}</p><p className="text-xs text-[#55464d]">{platformLabel[current.platform ?? 'youtube']}{current.short ? ' · Short' : ''}</p></div>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2"><VideoActions video={current} onSaved={acceptSnapshot} /><button type="button" disabled={busy} aria-label="Edit video" title="Edit video" onClick={() => edit(current)} className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-[#15000b]/[.07] px-4 text-sm font-semibold hover:bg-[#c1ff1a] focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="m14 5 5 5M4 20l4-1 12-12a2.1 2.1 0 0 0-3-3L5 16l-1 4Z" /></svg>Edit</button></div>
        </div>
        <section aria-label="About this video" className="mt-4 rounded-[16px] bg-[#15000b]/[.07] p-4 text-sm">
          <p className="font-semibold">{current.status === 'finished' ? 'Watched' : current.status === 'watching' ? `Watching${progressOf(current) > 0 ? ` · ${Math.round(progressOf(current) * 100)}% done` : ''}` : 'Up next'}{!!current.durationSeconds && <span className="font-normal text-[#55464d]"> · {playbackTime(current.durationSeconds)}</span>}</p>
          {(videoCollections(current).length > 0 || current.tags.length > 0) ? <div className="mt-3 flex flex-wrap items-center gap-2">
            {videoCollections(current).map(name => <a key={name} href={viewPath('collection:' + name)} onClick={event => go(event, viewPath('collection:' + name))} className="inline-flex min-h-8 items-center gap-2 rounded-full border-2 border-[#15000b] bg-white px-3 text-[13px] font-semibold hover:bg-[#c1ff1a] focus-visible:outline-2 focus-visible:outline-offset-2"><span aria-hidden="true" className="h-2 w-2 rounded-full border border-[#15000b]" style={{ background: collectionColor(name) }} />{name}</a>)}
            {current.tags.map(tag => <span key={tag} className="text-[13px] font-medium text-[#1a0088]">#{tag}</span>)}
          </div> : <p className="mt-2 text-[#55464d]">No collections or tags yet. Use Edit to organise this video.</p>}
        </section>
        <div className="mt-6"><VideoNotes key={current.id} video={current} onSaved={acceptSnapshot} /></div>
      </article>
      <aside aria-label="Up next" className="min-w-0">
        <h2 className="mb-3 text-base font-bold">{current.short ? 'More shorts' : 'Up next'}</h2>
        <ul className="m-0 flex list-none flex-col gap-3 p-0">{related.map(video => <li key={video.id}><a href={videoPath(video)} onClick={event => go(event, videoPath(video))} className="group flex gap-3 focus-visible:outline-2 focus-visible:outline-offset-2">
          <div className={`relative shrink-0 overflow-hidden rounded-[10px] bg-[#b9c7f8] ${video.short ? 'w-20' : 'w-40'}`}>{video.platform && video.platform !== 'youtube' ? <MediaThumb video={video} /> : <Thumbnail id={video.videoId} vertical={video.short} className="transition-transform duration-200 group-hover:scale-[1.04]" />}{!video.short && !!video.durationSeconds && <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 text-[11px] font-medium tabular-nums text-white">{playbackTime(video.durationSeconds)}</span>}{progressOf(video) > 0 && video.status !== 'finished' && <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1 bg-white/30"><div className="h-full bg-[#ff0033]" style={{ width: `${progressOf(video) * 100}%` }} /></div>}</div>
          <div className="min-w-0 flex-1"><p className="line-clamp-2 text-sm font-semibold leading-5 [overflow-wrap:anywhere] group-hover:underline">{video.title}</p><p className="mt-0.5 truncate text-xs text-[#55464d]">{video.channel || platformLabel[video.platform ?? 'youtube']}</p><p className="truncate text-xs text-[#55464d]">{[video.status === 'watching' ? 'Watching' : video.status === 'finished' ? 'Watched' : '', ...videoCollections(video)].filter(Boolean).join(' · ')}</p></div>
        </a></li>)}</ul>
        {related.length === 0 && <p className="text-sm text-[#55464d]">Nothing else saved yet.</p>}
      </aside>
    </div>}
  </div>
  return <main className={`min-h-svh font-[Poppins,system-ui,sans-serif] bg-[#efe7d4] text-[#15000b] selection:bg-[#c1ff1a]`}>
    {(
    <div className="min-h-svh">
      <header className="sticky top-0 z-20 bg-[#efe7d4]/95 backdrop-blur">
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6">
          <div className="flex items-center gap-2"><button type="button" aria-label="Toggle menu" aria-expanded={guideOpen} aria-controls="watch-guide" onClick={() => setGuideOpen(value => !value)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-[#15000b]/10 focus-visible:outline-2 focus-visible:outline-offset-2"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-6 w-6"><path d="M4 6h16M4 12h16M4 18h16" /></svg></button>
          <a href={libraryPath} aria-label="Watch home" onClick={event => { setSort('added'); go(event, viewPath('home')) }} className="logo flex items-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-4"><span className="mark" aria-hidden="true" dangerouslySetInnerHTML={{ __html: flameLogoSvg }} /><span className="font-['Fraunces',Georgia,serif] text-[30px] font-black italic lowercase leading-none tracking-tight text-[#12287f]">ignis</span><span className="rounded-full border-2 border-[#15000b] bg-[#c1ff1a] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[.14em]">watch</span></a></div>
          {!playing && <h1 className="sr-only">Watch library</h1>}
          <form role="search" onSubmit={quickAdd} className="order-last col-span-3 mx-auto flex w-full max-w-2xl min-w-0 sm:order-none sm:col-span-1">
            <label htmlFor="watch-quick" className="sr-only">Search your library, or paste a YouTube, TikTok or Instagram link to save it</label>
            <input id="watch-quick" type="text" value={quick} onChange={event => { const value = event.target.value; setQuick(value); setQuickError(''); setQuery(parseMedia(value.trim()) ? '' : value); setPage(1) }} placeholder="Search, or paste a YouTube, TikTok or Instagram link" inputMode="search" autoComplete="off" disabled={!data || busy || looking} className="block h-11 min-w-0 flex-1 rounded-l-full border-2 border-r-0 border-[#15000b] bg-white pl-5 pr-3 text-sm placeholder:text-[#7a6a72] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#7f3aed]" />
            <button disabled={!data || busy || looking || !quick.trim()} aria-label={parseMedia(quick.trim()) ? 'Save video' : 'Search'} className="inline-flex h-11 min-w-16 shrink-0 items-center justify-center rounded-r-full border-2 border-[#15000b] bg-[#e4dcc4] px-4 text-xs font-bold uppercase tracking-widest hover:bg-[#c1ff1a] disabled:opacity-60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#7f3aed]">{looking ? '…' : busy ? '…' : parseMedia(quick.trim()) ? 'Save' : <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><circle cx="10.5" cy="10.5" r="6.5" /><path strokeLinecap="round" d="m16 16 4.5 4.5" /></svg>}</button>
          </form>
          <button type="button" disabled={!data || busy} onClick={() => edit()} className={`${button} h-11 min-w-11 shrink-0 justify-self-end px-4`} title="Add with details" aria-label="Add video with details">+<span className="ml-1 hidden sm:inline">Add</span></button>
        </div>
      </header>
      <div className="flex">
      {guideOpen && <button type="button" aria-label="Close menu" onClick={() => setGuideOpen(false)} className="fixed inset-0 z-30 bg-[#15000b]/40 lg:hidden" />}
      <nav id="watch-guide" aria-label="Library" hidden={!guideOpen} className="fixed inset-y-0 left-0 z-40 w-64 shrink-0 overflow-y-auto border-r border-[#15000b]/15 bg-[#efe7d4] p-3 lg:sticky lg:inset-y-auto lg:top-[64px] lg:z-10 lg:h-[calc(100svh-64px)] lg:w-60 lg:bg-transparent">
        <ul className="m-0 list-none space-y-0.5 p-0">{guideViews.map(view => <li key={view.key}><a href={viewPath(view.key)} aria-current={activeView === view.key ? 'page' : undefined} onClick={event => { go(event, viewPath(view.key)); if (!matchMedia('(min-width: 1024px)').matches) setGuideOpen(false) }} className={`${guideItem} ${activeView === view.key ? 'bg-[#15000b] font-bold text-[#efe7d4]' : 'hover:bg-[#15000b]/10'}`}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0"><path d={view.icon} /></svg><span className="flex-1 truncate text-left">{view.label}</span><span className="text-xs tabular-nums opacity-60">{view.count}</span></a></li>)}</ul>
        {collections.length > 0 && <><div className="mx-3 my-3 border-t border-[#15000b]/20" /><h2 className="px-3 pb-1 text-base font-bold">Collections</h2>
        <ul className="m-0 list-none space-y-0.5 p-0">{collections.map(name => <li key={name}><a href={viewPath('collection:' + name)} aria-current={collection === name ? 'page' : undefined} onClick={event => { go(event, viewPath('collection:' + name)); if (!matchMedia('(min-width: 1024px)').matches) setGuideOpen(false) }} className={`${guideItem} ${collection === name ? 'bg-[#15000b] font-bold text-[#efe7d4]' : 'hover:bg-[#15000b]/10'}`}><span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full border border-[#15000b]" style={{ background: collectionColor(name) }} /><span className="flex-1 truncate text-left">{name}</span><span className="text-xs tabular-nums opacity-60">{collectionCount(name)}</span></a></li>)}</ul></>}
      </nav>
      <div key={routeKey} className="watch-view min-w-0 flex-1 px-4 pb-16 pt-4 sm:px-6">
      {playing ? watchPage : <>
        {(quickError || (error && !editor)) && <p role="alert" className="mb-5 rounded-[14px] border-2 border-[#15000b] bg-[#ffb3da] p-3 text-sm font-medium">{quickError || error}</p>}
        {!data && !error && <p role="status" className="py-12 text-[#55464d]">Loading your library…</p>}
        {data && !filtering && !isShortsView && continuing.length > 0 && <section aria-label="Continue watching" className="mb-8">
          <h2 className="mb-3 text-lg font-bold">Continue watching</h2>
          <ul className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">{continuing.map(renderCard)}</ul>
        </section>}
        {data && <div className="mb-4 flex items-center justify-between gap-3"><h2 className="m-0 text-lg font-bold">{viewTitle}<span className="ml-2 text-sm font-medium tabular-nums text-[#55464d]">{visible.length}</span></h2>
          <div className="relative"><label htmlFor="watch-sort" className="sr-only">Sort videos</label><select id="watch-sort" value={sort} onChange={event => setSort(event.target.value as typeof sort)} className="h-9 cursor-pointer appearance-none rounded-[10px] bg-[#15000b]/[.07] py-0 pl-3.5 pr-9 text-[13px] font-medium hover:bg-[#15000b]/[.12] focus-visible:outline-2 focus-visible:outline-[#7f3aed]"><option value="added">Newest</option><option value="title">Title</option><option value="rating">Rating</option></select><svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2"><path d="m4 6 4 4 4-4" /></svg></div></div>}
        <section className="min-h-72 min-w-0" aria-label="Saved videos">
          {data && !visible.length && <div className="rounded-[26px] border-2 border-dashed border-[#15000b] p-10 text-center">{data.videos.length > 0 ? <p role="status" className="text-sm text-[#55464d]">No matching videos.</p> : <><p className={`${serif} text-3xl`}>Nothing saved yet</p><p className="mt-2 text-sm text-[#55464d]">Paste a YouTube link in the bar above to start your queue.</p></>}</div>}
          <ul className={`grid items-start gap-x-4 gap-y-10 ${isShortsView ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4'}`}>{pagination.videos.map(renderCard)}</ul>
          {pagination.pageCount > 1 && <nav aria-label="Video pagination" className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-[#15000b]/20 pt-5">
            <button type="button" disabled={pagination.page === 1} onClick={() => changePage(pagination.page - 1)} className={button}>← Previous</button>
            <p role="status" aria-live="polite" className="text-sm tabular-nums text-[#55464d]">Page {pagination.page} of {pagination.pageCount}</p>
            <button type="button" disabled={pagination.page === pagination.pageCount} onClick={() => changePage(pagination.page + 1)} className={button}>Next →</button>
          </nav>}
        </section>
      </>}
      </div>
      </div>
    </div>
    )}
    <dialog ref={dialog} aria-labelledby="video-editor-title" onClick={event => { if (event.target === event.currentTarget && !busy) setEditor(null) }} onCancel={event => { if (busy) event.preventDefault(); else setEditor(null) }} className="fixed inset-0 m-auto max-h-[90svh] w-[calc(100%-2rem)] max-w-xl overflow-hidden rounded-[26px] border-2 border-[#15000b] bg-[#efe7d4] p-0 text-[#15000b] shadow-2xl backdrop:bg-[#1a0088]/50">
      {editor && <form onSubmit={submit} className="flex max-h-[90svh] flex-col">
        <header className="flex shrink-0 items-start justify-between gap-4 px-6 pb-4 pt-6 sm:px-8">
          <div>
            <h2 id="video-editor-title" className="font-['Anton',Impact,sans-serif] text-4xl font-normal uppercase leading-none tracking-wide">{isExisting ? 'Edit video' : 'Add video'}</h2>
            <p className="mt-2 text-sm text-[#55464d]">{isExisting ? 'Update how this video is organised.' : 'Paste a link, then sort it into your library.'}</p>
          </div>
          <button type="button" disabled={busy} aria-label="Close video editor" title="Close" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-[#15000b] bg-white hover:bg-[#c1ff1a] focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50" onClick={() => setEditor(null)}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path strokeLinecap="round" d="m6 6 12 12M6 18 18 6" /></svg></button>
        </header>
        <div className="min-h-0 overflow-y-auto px-6 pb-6 pt-2 sm:px-8">
          {error && <p role="alert" className="mb-5 rounded-[14px] border-2 border-[#15000b] bg-[#ffb3da] p-3 text-sm font-medium">{error}</p>}
          <fieldset disabled={busy} className="min-w-0 space-y-6">
            <div>
              <label className={fieldLabel}>Video link<input autoFocus required type="url" className={editorInput} value={url} placeholder="YouTube, TikTok or Instagram link" onChange={event => setUrl(event.target.value)} /></label>
              {media ? <div className="mt-3 flex gap-3 rounded-[16px] border-2 border-[#15000b] bg-white p-2.5"><div className={`shrink-0 overflow-hidden rounded-[10px] bg-[#b9c7f8] ${media.short ? 'w-20' : 'w-36'}`}>{media.platform === 'youtube' ? <Thumbnail id={media.id} vertical={media.short} /> : <MediaThumb video={{ platform: media.platform, thumbnail: metadata?.thumbnail }} />}</div><div className="min-w-0 py-0.5"><p className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[.14em] text-[#55464d]"><span className="rounded-full border border-[#15000b] px-2 py-0.5 text-[#15000b]">{platformLabel[media.platform]}</span>{media.short ? 'Short' : 'Video'}</p><p className="line-clamp-2 text-sm font-semibold leading-snug [overflow-wrap:anywhere]">{metadata?.title || editor.title || (lookupBusy ? 'Finding your video…' : media.platform === 'youtube' ? 'Video preview' : 'Add a title below')}</p>{(metadata?.channel || editor.channel) && <p className="mt-1 truncate text-xs text-[#55464d]">{metadata?.channel || editor.channel}</p>}{lookup && !lookupBusy && <p role="status" aria-live="polite" className="mt-1 text-xs text-[#55464d]">{lookup}</p>}</div></div>
                : <p className="mt-3 rounded-[16px] border-2 border-dashed border-[#15000b]/40 px-4 py-5 text-center text-sm text-[#55464d]">A preview appears here once you paste a link.<br /><span className="text-xs">YouTube videos and Shorts, TikTok videos, Instagram reels.</span></p>}
              {lookupBusy && <p role="status" aria-live="polite" className="sr-only">Finding your video…</p>}
            </div>
            <label className={fieldLabel}>Title<input required maxLength={200} className={editorInput} placeholder="Video title" value={editor.title} onChange={event => setEditor({ ...editor, title: event.target.value })} /></label>
            <fieldset className="min-w-0"><legend className={fieldLabel}>Status</legend>
              <div role="radiogroup" aria-label="Status" className="mt-2 flex flex-wrap gap-2">{Object.entries(labels).map(([value, label]) => <button key={value} type="button" role="radio" aria-checked={editor.status === value} onClick={() => setEditor({ ...editor, status: value as Video['status'] })} className={`${chip} ${editor.status === value ? 'bg-[#15000b] text-[#efe7d4]' : 'bg-white hover:bg-[#c1ff1a]'}`}>{label}</button>)}</div>
            </fieldset>
            <fieldset className="min-w-0"><legend className={fieldLabel}>Collections</legend>
              {videoCollections(editor).length > 0 && <ul aria-label="Selected collections" className="mt-2 flex flex-wrap gap-2 p-0">{videoCollections(editor).map(name => <li key={name} className="list-none"><button type="button" aria-label={`Remove ${name}`} onClick={() => setEditor({ ...editor, collections: videoCollections(editor).filter(item => item !== name) })} className="inline-flex min-h-9 items-center gap-2 rounded-full border-2 border-[#15000b] bg-[#15000b] pl-3 pr-2.5 text-sm font-semibold text-[#efe7d4] hover:bg-[#c2200a] focus-visible:outline-2 focus-visible:outline-offset-2"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: collectionColor(name) }} />{name}<span aria-hidden="true" className="text-base leading-none opacity-70">×</span></button></li>)}</ul>}
              <div className="relative mt-2">
                <input aria-label="Find or create a collection" aria-controls="watch-collection-options" maxLength={80} autoComplete="off" placeholder={collections.length ? 'Find or create a collection…' : 'Name your first collection…'} className={`${editorInput} !mt-0`} value={collectionDraft} onChange={event => setCollectionDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); if (collectionDraft.trim() && collectionMatches[0]) { setEditor({ ...editor, collections: [...videoCollections(editor), collectionMatches[0]] }); setCollectionDraft('') } else addCollection() } }} />
              </div>
              <ul id="watch-collection-options" aria-label={collectionDraft.trim() ? 'Matching collections' : 'Popular collections'} className="mt-2 flex flex-wrap items-center gap-2 p-0">
                {collectionMatches.slice(0, collectionDraft.trim() ? 6 : 5).map(name => <li key={name} className="list-none"><button type="button" onClick={() => { setEditor({ ...editor, collections: [...videoCollections(editor), name] }); setCollectionDraft('') }} className="inline-flex min-h-8 items-center gap-2 rounded-full border-2 border-[#15000b]/40 bg-white px-3 text-[13px] font-medium hover:border-[#15000b] hover:bg-[#c1ff1a] focus-visible:outline-2 focus-visible:outline-offset-2"><span aria-hidden="true" className="h-2 w-2 rounded-full border border-[#15000b]" style={{ background: collectionColor(name) }} />{name}</button></li>)}
                {collectionDraft.trim() && !collections.some(name => name.toLowerCase() === collectionDraft.trim().toLowerCase()) && !videoCollections(editor).some(name => name.toLowerCase() === collectionDraft.trim().toLowerCase()) && <li className="list-none"><button type="button" onClick={addCollection} className="inline-flex min-h-8 items-center rounded-full border-2 border-dashed border-[#15000b] px-3 text-[13px] font-semibold hover:bg-[#c1ff1a] focus-visible:outline-2 focus-visible:outline-offset-2">+ Create “{collectionDraft.trim()}”</button></li>}
                {!collectionDraft.trim() && collectionMatches.length > 5 && <li className="list-none text-xs text-[#55464d]">Type to search {collectionMatches.length - 5} more</li>}
              </ul>
            </fieldset>
            <div>
              <label className={fieldLabel}>Tags<input maxLength={1000} className={editorInput} placeholder="learning, health, inspiration" aria-describedby="watch-tags-hint" value={editor.tags.join(',')} onChange={event => setEditor({ ...editor, tags: event.target.value.split(',') })} /></label>
              <p id="watch-tags-hint" className="mt-2 text-xs text-[#55464d]">Separate tags with commas.</p>
            </div>
          </fieldset>
        </div>
        <footer className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t-2 border-[#15000b] bg-white/60 px-6 py-4 sm:px-8">
          {isExisting && <button type="button" disabled={busy} className="mr-auto min-h-11 rounded-full px-3 py-2 text-sm font-semibold text-[#c2200a] hover:bg-[#ffb3da]/60 focus-visible:outline-2 disabled:opacity-50" onClick={async () => { if (window.confirm('Remove this video and its notes from your library?') && await save(data!.videos.filter(video => video.id !== editor.id))) { if (playing === editor.id) navigate(viewPath('home')); setEditor(null) } }}>Remove video</button>}
          <button type="button" disabled={busy} className="min-h-11 rounded-full px-4 py-2 text-sm font-semibold text-[#55464d] hover:bg-[#15000b]/10 focus-visible:outline-2 disabled:opacity-50" onClick={() => setEditor(null)}>Cancel</button>
          <button disabled={busy || lookupBusy} className={`${primary} min-h-11 px-6`}>{busy ? 'Saving…' : isExisting ? 'Save changes' : 'Add video'}</button>
        </footer>
      </form>}
    </dialog>
  </main>
}
