import { Dropdown } from '../../components/Dropdown'
import { useEffect, useRef, useState } from 'react'
import { ResumePlayer } from './ResumePlayer'
import { VideoActions } from './VideoActions'
import { VideoNotes } from './VideoNotes'
import { filterVideos, paginateVideos, videoCollections, videoId } from './watchModel'
import type { Video, WatchState } from './watchModel'

const serif = "font-['Iowan_Old_Style',Georgia,serif]"
const buttonBase = 'inline-flex min-h-11 items-center justify-center rounded-sm border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 disabled:opacity-50'
const button = `${buttonBase} border-[#c9bfb0] text-[#2a2119] hover:bg-[#e4dac9]`
const primary = `${buttonBase} border-[#3b291b] bg-[#3b291b] text-white hover:bg-[#291b10] hover:text-white`
const editorInput = 'mt-2 block min-h-12 w-full min-w-0 rounded-md border border-[#c1b5a3] bg-[#faf7f0] px-3 py-3 text-base font-normal text-[#2a2119] placeholder:text-[#948572] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9c8b73]'
const labels = { queued: 'Up next', watching: 'Watching', finished: 'Finished' }
type Metadata = { videoId: string; title: string; channel: string; thumbnail: string }
function Thumbnail({ id, className = '' }: { id: string; className?: string }) {
  return <img key={id} src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" loading="lazy" onError={event => { event.currentTarget.onerror = null; event.currentTarget.style.visibility = 'hidden' }} className={`aspect-video w-full bg-[#d8cdbb] object-cover ${className}`} />
}
export default function WatchApp() {
  const [data, setData] = useState<WatchState | null>(null)
  const acceptSnapshot = (next: WatchState) => setData(previous => !previous || next.revision >= previous.revision ? next : previous)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [collection, setCollection] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const local = location.hostname !== 'watch.ignis.farm'
  const libraryPath = local ? '/watch' : '/'
  const playing = /^\/(?:watch\/)?video\/([^/]+)\/?$/.exec(location.pathname)?.[1] ?? null
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
  const parsedId = videoId(url)

  useEffect(() => {
    document.title = 'Watch · Ignis Farm'
    const controller = new AbortController()
    fetch('/api/watch', { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('Could not load your library. Sign in again if your session expired.')
      setData(await response.json())
    }).catch(reason => { if (!controller.signal.aborted) setError(reason.message) })
    return () => controller.abort()
  }, [])
  useEffect(() => {
    if (editor) { previousFocus.current = document.activeElement as HTMLElement; dialog.current?.showModal() }
    else { dialog.current?.close(); previousFocus.current?.focus() }
  }, [!!editor])
  useEffect(() => {
    setMetadata(null); setLookup(''); setLookupBusy(false)
    if (!editor || !parsedId) return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setLookupBusy(true)
      try {
        const response = await fetch(`/api/watch/metadata?video_id=${parsedId}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]) })
        const result = await response.json()
        if (controller.signal.aborted) return
        if (!response.ok) throw new Error(typeof result.detail === 'string' ? result.detail : 'Could not load video details. Enter a title below.')
        setMetadata(result)
        const previousAuto = lastAutoTitle.current
        setEditor(previous => previous ? { ...previous, channel: result.channel, title: !previous.title.trim() || previous.title === previousAuto ? result.title : previous.title } : null)
        lastAutoTitle.current = result.title
      } catch (reason) {
        if (!controller.signal.aborted) setLookup(reason instanceof Error && reason.name !== 'TimeoutError' ? reason.message : 'Lookup timed out. You can enter the title yourself.')
      } finally { if (!controller.signal.aborted) setLookupBusy(false) }
    }, 350)
    return () => { clearTimeout(timer); controller.abort() }
  }, [parsedId, !!editor])

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
    setUrl(video ? `https://www.youtube.com/watch?v=${video.videoId}` : '')
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
    const id = videoId(url)
    if (!id || !editor || !data) { setError('Enter a valid YouTube video link.'); return }
    if (data.videos.some(video => video.videoId === id && video.id !== editor.id)) { setError('This video is already in your library.'); return }
    const cleaned = { ...editor, videoId: id, channel: metadata?.videoId === id ? metadata.channel : editor.videoId === id ? editor.channel ?? '' : '', collections: [...new Set([...videoCollections(editor), collectionDraft.trim()].filter(Boolean))], collection: videoCollections(editor)[0] ?? collectionDraft.trim(), tags: [...new Set(editor.tags.map(tag => tag.trim()).filter(Boolean))] }
    if (cleaned.collections.length > 20 || cleaned.collections.some(name => name.length > 80)) { setError('Use up to 20 collections, each under 80 characters.'); return }
    if (cleaned.tags.length > 20 || cleaned.tags.some(tag => tag.length > 80)) { setError('Use up to 20 tags, each under 80 characters.'); return }
    if (await save(data.videos.some(video => video.id === editor.id) ? data.videos.map(video => video.id === editor.id ? cleaned : video) : [...data.videos, cleaned])) setEditor(null)
  }
  const collections = [...new Set(data?.videos.flatMap(videoCollections))].sort()
  const visible = filterVideos(data?.videos ?? [], query, collection, status)
  const current = data?.videos.find(video => video.id === playing)
  const pagination = paginateVideos(visible, page)
  useEffect(() => { if (data && page !== pagination.page) setPage(pagination.page) }, [data, page, pagination.page])
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
  return <main className="min-h-svh bg-[#e5dfd5] p-3 text-[#2a2119] selection:bg-[#efcc7f] sm:p-6 lg:p-10">
    {playing ? <div className="watch-paper mx-auto min-h-[calc(100svh-5rem)] max-w-[1440px] rounded-lg border border-[#c9bfb0] p-5 shadow-[0_12px_45px_#2a21191a] sm:p-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-[#c9bfb0] pb-5"><a className={button} href={libraryPath}>← Back to library</a><div className="ml-auto flex flex-wrap items-center gap-2">{current && <><VideoActions video={current} onSaved={acceptSnapshot} /><button type="button" disabled={busy} aria-label="Edit video" title="Edit video" onClick={() => edit(current)} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#887968] hover:bg-[#e4dac9] hover:text-[#4b4034] focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="m14 5 5 5M4 20l4-1 12-12a2.1 2.1 0 0 0-3-3L5 16l-1 4Z" /></svg></button></>}</div></header>
      {error && !editor && <p role="alert" className="mb-5 border border-red-200 bg-red-50 p-4 text-red-800">{error}</p>}
      {!data && !error && <p role="status" className="py-10 text-[#756655]">Loading video…</p>}
      {data && !current && <div className="py-10"><h1 className={`${serif} text-3xl`}>Video not found.</h1><p className="mt-3 text-[#756655]">This video may have been removed from your library.</p></div>}
      {current && <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_320px]">
        <article className="min-w-0 lg:sticky lg:top-6">
          <h1 className={`${serif} mb-6 text-3xl leading-tight sm:text-4xl`}>{current.title}</h1>
          <ResumePlayer key={current.id} video={current} onSaved={acceptSnapshot} />
        </article>
        <aside aria-label="Video notes" className="min-w-0 lg:sticky lg:top-6 lg:max-h-[calc(100svh-3rem)] lg:overflow-x-hidden lg:overflow-y-auto lg:border-l lg:border-[#c9bfb0] lg:pl-6">
          <VideoNotes key={current.id} video={current} onSaved={acceptSnapshot} />
        </aside>
      </div>}
    </div> : (
    <div className="mx-auto grid max-w-[1440px] overflow-hidden rounded-lg border border-[#c9bfb0] bg-[#eee7db] shadow-[0_12px_45px_#2a21191a] lg:min-h-[calc(100svh-5rem)] lg:grid-cols-[216px_minmax(0,1fr)]">
      <aside className="bg-[#241608] text-[#eee7db]">
        <a href={local ? '/' : 'https://ignis.farm/'} className="flex min-h-14 items-center gap-3 bg-[#c68b22] px-5 text-[#241608] focus-visible:outline-2 focus-visible:outline-offset-[-4px]"><span aria-hidden="true" className="text-lg">↳</span><span className="font-mono text-sm font-semibold">Ignis Farm / Watch</span></a>
        <div className="px-4 py-5 lg:py-7"><h2 className="border-b border-[#5e4b34] pb-3 font-mono text-xs text-[#d6c5a9]">Collections</h2>
          <nav aria-label="Video collections" className="mt-3 flex flex-wrap gap-1 lg:flex-col">
            {[["", 'All videos'], ...collections.map(name => [name, name])].map(([value,name]) => <button key={value} onClick={() => { setCollection(value); setPage(1) }} aria-pressed={collection === value} className={`flex min-h-11 items-center justify-between gap-3 rounded-sm px-3 py-2 text-left text-sm focus-visible:outline-2 focus-visible:outline-offset-2 ${collection === value ? 'bg-[#eedcb5] font-medium text-[#241608]' : 'text-[#e0d0b6] hover:bg-[#3d2b17]'}`}><span className="min-w-0 flex-1 [overflow-wrap:anywhere]"><span aria-hidden="true" className="mr-2 font-mono opacity-60">{collection === value ? '−' : '+'}</span>{name}</span><span className="min-w-[2ch] shrink-0 whitespace-nowrap text-right font-mono text-xs tabular-nums opacity-70">{data?.videos.filter(video => !value || videoCollections(video).includes(value)).length ?? '—'}</span></button>)}
          </nav>
        </div>
      </aside>
      <div className="watch-paper min-w-0 px-5 pb-8 pt-5 sm:px-8 lg:px-12 lg:pt-7 xl:px-16">
        <header className="flex flex-wrap items-center gap-3 border-b border-[#c9bfb0] pb-5">
          <h1 className="sr-only">Watch library</h1>
          <form role="search" onSubmit={event => event.preventDefault()} className="min-w-0 flex-1 basis-full sm:basis-0">
            <label htmlFor="watch-search" className="sr-only">Search your library</label>
            <div className="relative">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#756655]"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
              <input id="watch-search" value={query} onChange={event => { setQuery(event.target.value); setPage(1) }} placeholder="Search videos, tags or notes…" type="search" className="block min-h-12 w-full rounded-sm border border-[#c9bfb0] bg-[#f8f4ec] py-3 pl-12 pr-4 text-base text-[#2a2119] placeholder:text-[#756655] focus-visible:outline-2 focus-visible:outline-offset-2" />
            </div>
          </form>
          <button disabled={!data || busy} onClick={() => edit()} className={`${primary} min-h-12 shrink-0 gap-2`}><svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5"><path strokeLinecap="round" d="M10 4v12M4 10h12" /></svg>Add video</button>
        </header>
        <section className="min-h-96 min-w-0" aria-label="Saved videos">
          {error && !editor && <p role="alert" className="mb-5 border border-red-200 bg-red-50 p-4 text-red-800">{error}</p>}
          <div className="mb-7 mt-5 flex flex-wrap gap-x-6 border-b border-[#c9bfb0]" aria-label="Watch status">{[['','All'], ...Object.entries(labels)].map(([value,label]) => <button key={value} className={`min-h-12 border-b-2 py-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 ${status === value ? 'border-[#3b291b] font-medium text-[#2a2119]' : 'border-transparent text-[#756655] hover:text-[#2a2119]'}`} aria-pressed={status === value} onClick={() => { setStatus(value); setPage(1) }}>{label}</button>)}</div>
          {!data && !error && <p role="status" className="py-12 text-[#756655]">Loading your library…</p>}
          {data && !visible.length && <div className="py-10 sm:py-16">{data.videos.length > 0 ? <p role="status" className="text-sm text-[#756655]">No matching videos.</p> : <button className={primary} onClick={() => edit()}>Save your first video</button>}</div>}
          <ul className="grid grid-cols-1 gap-x-5 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">{pagination.videos.map(video => <li key={video.id} className="min-w-0">
            <div className="relative bg-[#d8cdbb]">
              <a href={videoPath(video)} aria-label={`Watch ${video.title}`} className="block focus-visible:outline-2 focus-visible:outline-offset-4"><Thumbnail id={video.videoId} /></a>
            </div>
            <h3 className={`${serif} mt-2.5 [overflow-wrap:anywhere] text-lg leading-snug`}><a href={videoPath(video)} className="hover:underline focus-visible:outline-2 focus-visible:outline-offset-2">{video.title}</a></h3>
          </li>)}</ul>
          {pagination.pageCount > 1 && <nav aria-label="Video pagination" className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-[#c9bfb0] pt-5">
            <button type="button" disabled={pagination.page === 1} onClick={() => changePage(pagination.page - 1)} className={button}>← Previous</button>
            <p role="status" aria-live="polite" className="text-sm tabular-nums text-[#756655]">Page {pagination.page} of {pagination.pageCount}</p>
            <button type="button" disabled={pagination.page === pagination.pageCount} onClick={() => changePage(pagination.page + 1)} className={button}>Next →</button>
          </nav>}
        </section>
      <footer className="mt-16 flex border-t border-[#c9bfb0] pt-5 font-mono text-xs text-[#756655]">Ignis Farm / Watch</footer>
      </div>
    </div>)}
    <dialog ref={dialog} aria-labelledby="video-editor-title" onCancel={event => { if (busy) event.preventDefault(); else setEditor(null) }} className="fixed inset-0 m-auto max-h-[90svh] w-[calc(100%-2rem)] max-w-2xl overflow-hidden rounded-lg border border-[#c9bfb0] bg-[#eee7db] p-0 text-[#2a2119] shadow-2xl backdrop:bg-[#241608]/50">
      {editor && <form onSubmit={submit} className="flex max-h-[90svh] flex-col">
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-[#c9bfb0] px-6 py-5 sm:px-8">
          <h2 id="video-editor-title" className={`${serif} text-3xl leading-tight`}>{data?.videos.some(video => video.id === editor.id) ? 'Edit video' : 'Add video'}</h2>
          <button type="button" disabled={busy} aria-label="Close video editor" title="Close" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#756655] hover:bg-[#e0d6c5] focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50" onClick={() => setEditor(null)}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5"><path strokeLinecap="round" d="m6 6 12 12M6 18 18 6" /></svg></button>
        </header>
        <div className="min-h-0 overflow-y-auto px-6 py-6 sm:px-8">
          {error && <p role="alert" className="mb-5 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
          <fieldset disabled={busy} className="min-w-0 space-y-5">
            <label className="block text-sm font-medium">YouTube link<input autoFocus required type="url" className={editorInput} value={url} placeholder="Paste a YouTube link" onChange={event => setUrl(event.target.value)} /></label>
            {(lookupBusy || lookup) && <p role="status" aria-live="polite" className="text-sm text-[#756655]">{lookupBusy ? 'Finding your video…' : lookup}</p>}
            {parsedId && <div className="grid grid-cols-[100px_minmax(0,1fr)] items-center gap-4 rounded-md bg-[#e5dccd] p-3"><div className="overflow-hidden rounded-sm bg-[#d8cdbb]"><Thumbnail id={parsedId} /></div><div className="min-w-0"><p className="text-sm font-medium [overflow-wrap:anywhere]">{metadata?.title || editor.title || 'Video preview'}</p>{metadata?.channel && <p className="mt-1 text-xs text-[#756655]">{metadata.channel}</p>}</div></div>}
            <label className="block text-sm font-medium">Title<input required maxLength={200} className={editorInput} placeholder="Video title" value={editor.title} onChange={event => setEditor({ ...editor, title: event.target.value })} /></label>
            <div className="border-t border-[#c9bfb0] pt-5">
              <fieldset className="min-w-0"><legend className="text-sm font-medium">Collections</legend>
                <div className="mt-2 flex min-h-12 min-w-0 items-stretch overflow-hidden rounded-md border border-[#c1b5a3] bg-[#faf7f0] focus-within:border-[#756655] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[#9c8b73]">
                  <input aria-label="Choose or create a collection" maxLength={80} list="watch-collections" placeholder="Choose or create a collection" className="block h-12 w-0 min-w-0 flex-1 bg-transparent px-3 text-base outline-none" value={collectionDraft} onChange={event => setCollectionDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addCollection() } }} />
                  <button type="button" disabled={!collectionDraft.trim() || (videoCollections(editor).length >= 20 && !videoCollections(editor).includes(collectionDraft.trim()))} className="inline-flex h-12 shrink-0 items-center justify-center gap-1.5 border-l border-[#c1b5a3] bg-[#e7dece] px-4 text-sm font-medium text-[#3b291b] hover:bg-[#ded1bc] focus-visible:outline-2 focus-visible:outline-offset-[-3px] disabled:cursor-default disabled:text-[#948572] disabled:hover:bg-[#e7dece]" onClick={addCollection}><svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4"><path strokeLinecap="round" d="M10 4v12M4 10h12" /></svg>Add</button>
                </div>
                <datalist id="watch-collections">{collections.filter(name => !videoCollections(editor).includes(name)).map(name => <option key={name} value={name} />)}</datalist>
                {videoCollections(editor).length > 0 && <ul aria-label="Selected collections" className="mt-3 flex flex-wrap gap-2">{videoCollections(editor).map(name => <li key={name} className="flex min-w-0 max-w-full items-center rounded-md bg-[#dfd2bd] pl-3 text-sm"><span className="[overflow-wrap:anywhere]">{name}</span><button type="button" aria-label={`Remove ${name} collection`} onClick={() => setEditor({ ...editor, collections: videoCollections(editor).filter(item => item !== name) })} className="ml-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-r-md text-[#756655] hover:bg-[#d2c2a8] focus-visible:outline-2"><svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4"><path d="m6 6 8 8M6 14l8-8" /></svg></button></li>)}</ul>}
              </fieldset>
              <label className="mt-5 block text-sm font-medium">Tags<input maxLength={1000} className={editorInput} placeholder="learning, health, inspiration" aria-describedby="watch-tags-hint" value={editor.tags.join(',')} onChange={event => setEditor({ ...editor, tags: event.target.value.split(',') })} /></label>
              <p id="watch-tags-hint" className="mt-2 text-xs text-[#756655]">Separate tags with commas.</p>
              <label className="mt-5 block text-sm font-medium">Status
                <span className="relative mt-2 block"><Dropdown className="block h-12 w-full appearance-none rounded-md border border-[#c1b5a3] bg-[#faf7f0] pl-3 pr-11 text-base font-normal text-[#2a2119] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9c8b73]" value={editor.status} onValueChange={selectedValue => setEditor({ ...editor, status: selectedValue as Video['status'] })}>{Object.entries(labels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</Dropdown></span>
              </label>
            </div>
          </fieldset>
        </div>
        <footer className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-[#c9bfb0] bg-[#e7dece] px-6 py-4 sm:px-8">
          {data?.videos.some(video => video.id === editor.id) && <button type="button" disabled={busy} className="mr-auto min-h-11 rounded-sm px-2 py-2 text-sm text-red-800 hover:bg-red-100 focus-visible:outline-2 disabled:opacity-50" onClick={async () => { if (window.confirm('Remove this video and its notes from your library?') && await save(data.videos.filter(video => video.id !== editor.id))) { if (playing === editor.id) location.assign(libraryPath); setEditor(null) } }}>Remove video</button>}
          <button type="button" disabled={busy} className="min-h-11 rounded-sm px-4 py-2 text-sm text-[#756655] hover:bg-[#ded1bc] focus-visible:outline-2 disabled:opacity-50" onClick={() => setEditor(null)}>Cancel</button>
          <button disabled={busy || lookupBusy} className={`${primary} min-h-12 rounded-md px-6`}>{busy ? 'Saving…' : data?.videos.some(video => video.id === editor.id) ? 'Save changes' : 'Add video'}</button>
        </footer>
      </form>}
    </dialog>
  </main>
}
