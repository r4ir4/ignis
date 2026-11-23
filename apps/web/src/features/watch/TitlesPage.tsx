import { useEffect, useMemo, useRef, useState } from 'react'
import type { Title, TitleKind, TitleStatus, SearchResult, SeasonInfo, EpisodeInfo } from './titlesModel'
import { filterTitles, progressText, sortTitles, statusLabel, titleYear } from './titlesModel'

const buttonBase = 'inline-flex min-h-11 items-center justify-center rounded-full border-2 px-5 py-2 text-xs font-bold uppercase tracking-widest transition-all focus-visible:outline-none disabled:opacity-50'
const button = `${buttonBase} border-[#15000b] bg-white text-[#15000b] shadow-[0_3px_0_#15000b] hover:-translate-y-0.5 hover:bg-[#c1ff1a] hover:shadow-[0_5px_0_#15000b] focus-visible:-translate-y-0.5 focus-visible:bg-[#c1ff1a] focus-visible:shadow-[0_5px_0_#15000b]`
const primary = `${buttonBase} border-[#15000b] bg-[#ff5e32] text-[#15000b] shadow-[0_3px_0_#15000b] hover:-translate-y-0.5 hover:bg-[#f04e23] hover:shadow-[0_5px_0_#15000b] focus-visible:-translate-y-0.5 focus-visible:bg-[#f04e23] focus-visible:shadow-[0_5px_0_#15000b]`
const chip = 'watch-chip inline-flex min-h-9 items-center rounded-full border-2 border-[#15000b] px-3.5 text-xs font-bold uppercase tracking-widest transition-colors focus-visible:outline-2 focus-visible:outline-offset-2'
const field = 'block min-h-12 w-full min-w-0 rounded-[14px] border-2 border-[#15000b] bg-white px-4 py-3 text-base placeholder:text-[#7a6a72] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7f3aed]'
const dialogClass = 'fixed inset-0 m-auto max-h-[92svh] w-[calc(100%-2rem)] max-w-[720px] overflow-hidden rounded-[26px] border-2 border-[#15000b] bg-[#efe7d4] p-0 text-[#15000b] shadow-[0_8px_0_#15000b] backdrop:bg-[#1a0088]/50'
const statusColor: Record<TitleStatus, string> = { watchlist: '#b9c7f8', watching: '#c1ff1a', finished: '#b79bf7' }
const base = '/api/watch/titles'

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, headers: init?.body ? { 'Content-Type': 'application/json' } : undefined, signal: AbortSignal.timeout(20_000) })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(typeof body.detail === 'string' ? body.detail : 'Something went wrong. Try again.')
  return body as T
}

function Poster({ title, className = '' }: { title: Pick<Title, 'posterUrl' | 'title'>; className?: string }) {
  return title.posterUrl
    ? <img src={title.posterUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className={`aspect-[2/3] w-full object-cover ${className}`} />
    : <div aria-hidden="true" className={`flex aspect-[2/3] w-full items-center justify-center bg-[#b9c7f8] p-3 text-center text-sm font-semibold ${className}`}>{title.title}</div>
}

function Dialog({ labelledBy, onClose, children }: { labelledBy: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    ref.current?.showModal()
    ref.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    return () => { ref.current?.close(); previous?.focus?.() }
  }, [])
  return <dialog ref={ref} data-watch-dialog aria-labelledby={labelledBy} onClick={event => { if (event.target === event.currentTarget) onClose() }} onCancel={event => { event.preventDefault(); onClose() }} className={dialogClass}>
    <div className="flex max-h-[92svh] flex-col">{children}</div>
  </dialog>
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return <button type="button" onClick={onClose} aria-label="Close" className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#15000b] bg-white text-lg leading-none hover:bg-[#c1ff1a] focus-visible:bg-[#c1ff1a] focus-visible:outline-none">×</button>
}

function AddDialog({ kind, saved, onSaved, onClose }: { kind: TitleKind; saved: Title[]; onSaved: (title: Title) => void; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<SearchResult[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(0)
  const [searching, setSearching] = useState(false)
  useEffect(() => {
    const term = q.trim()
    setError('')
    if (!term) { setResults(null); setSearching(false); return }
    setSearching(true)
    const timer = setTimeout(() => {
      call<{ results: SearchResult[] }>(`${base}/search?type=${kind}&q=${encodeURIComponent(term)}`)
        .then(data => setResults(data.results)).catch(problem => setError(problem.message)).finally(() => setSearching(false))
    }, 350)
    return () => clearTimeout(timer)
  }, [q, kind])
  const isSaved = (item: SearchResult) => saved.find(title => title.tmdbId === item.tmdbId && title.mediaType === kind)
  async function add(item: SearchResult, status: TitleStatus) {
    setBusy(item.tmdbId); setError('')
    try { onSaved(await call<Title>(base, { method: 'POST', body: JSON.stringify({ mediaType: kind, tmdbId: item.tmdbId, status }) })) }
    catch (problem) { setError((problem as Error).message) } finally { setBusy(0) }
  }
  return <Dialog labelledBy="titles-add-title" onClose={onClose}>
    <header className="relative shrink-0 px-6 pb-0 pt-7 sm:px-10">
      <h2 id="titles-add-title" className="pr-12 text-2xl font-semibold tracking-tight">Add {kind === 'movie' ? 'a movie' : 'a TV show'}</h2>
      <CloseButton onClose={onClose} />
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-7 pt-5 sm:px-10">
      <label htmlFor="titles-search" className="sr-only">Search {kind === 'movie' ? 'movies' : 'TV shows'}</label>
      <input id="titles-search" data-autofocus value={q} onChange={event => setQ(event.target.value)} placeholder={kind === 'movie' ? 'Search for a movie' : 'Search for a TV show'} autoComplete="off" className={field} />
      {error && <p role="alert" className="mt-4 rounded-[14px] border-2 border-[#15000b] bg-[#ffb3da] p-3 text-sm font-medium">{error}</p>}
      {searching && <p role="status" className="mt-4 text-sm text-[#55464d]">Searching…</p>}
      {results && !searching && results.length === 0 && <p className="mt-4 text-sm text-[#55464d]">Nothing found for “{q.trim()}”.</p>}
      {results && results.length > 0 && <ul className="m-0 mt-4 list-none space-y-3 p-0">{results.map(item => {
        const existing = isSaved(item)
        return <li key={item.tmdbId} className="flex gap-4 rounded-[16px] border-2 border-[#15000b] bg-white p-3">
          <div className="w-16 shrink-0 overflow-hidden rounded-[10px] border-2 border-[#15000b]"><Poster title={item} /></div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold leading-5">{item.title} <span className="font-normal text-[#55464d]">{titleYear(item.releaseDate)}</span></h3>
            {item.overview && <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#55464d]">{item.overview}</p>}
            <div className="mt-2 flex flex-wrap gap-2">
              {existing ? <span className="inline-flex min-h-9 items-center rounded-full border-2 border-[#15000b] bg-[#c1ff1a] px-3.5 text-xs font-bold uppercase tracking-widest">Saved · {statusLabel[existing.status]}</span> : <>
                <button type="button" disabled={busy === item.tmdbId} onClick={() => add(item, 'watchlist')} className={`${primary} min-h-9 px-3.5`}>Watchlist</button>
                <button type="button" disabled={busy === item.tmdbId} onClick={() => add(item, 'finished')} className={`${button} min-h-9 px-3.5`}>{kind === 'movie' ? 'Watched' : 'Finished'}</button>
              </>}
            </div>
          </div>
        </li>
      })}</ul>}
    </div>
  </Dialog>
}

function Seasons({ title, onChange }: { title: Title; onChange: (title: Title) => void }) {
  const [seasons, setSeasons] = useState<SeasonInfo[] | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  const [episodes, setEpisodes] = useState<Record<number, EpisodeInfo[]>>({})
  const [error, setError] = useState('')
  useEffect(() => { call<{ seasons: SeasonInfo[] }>(`${base}/${title.id}/seasons`).then(data => setSeasons(data.seasons)).catch(problem => setError(problem.message)) }, [title.id])
  const watched = (season: number, episode: number) => title.episodes.some(item => item.season === season && item.episode === episode)
  const countIn = (season: number) => title.episodes.filter(item => item.season === season).length
  async function toggleOpen(number: number) {
    setOpen(open === number ? null : number)
    if (open !== number && !episodes[number]) {
      try { const data = await call<{ episodes: EpisodeInfo[] }>(`${base}/${title.id}/seasons/${number}`); setEpisodes(current => ({ ...current, [number]: data.episodes })) }
      catch (problem) { setError((problem as Error).message) }
    }
  }
  async function tick(season: number, episode: EpisodeInfo, value: boolean) {
    setError('')
    try { onChange(await call<Title>(`${base}/${title.id}/episodes`, { method: 'PATCH', body: JSON.stringify({ season, episode: episode.number, watched: value, runtime: episode.runtime }) })) }
    catch (problem) { setError((problem as Error).message) }
  }
  async function tickSeason(season: SeasonInfo) {
    setError('')
    try { onChange(await call<Title>(`${base}/${title.id}/seasons/${season.number}`, { method: 'PATCH', body: JSON.stringify({ watched: countIn(season.number) < season.episodeCount }) })) }
    catch (problem) { setError((problem as Error).message) }
  }
  if (error && !seasons) return <p role="alert" className="mt-4 text-sm text-[#c2200a]">{error}</p>
  if (!seasons) return <p role="status" className="mt-4 text-sm text-[#55464d]">Loading seasons…</p>
  return <section aria-label="Seasons" className="mt-6">
    <h3 className="text-lg font-bold">Seasons</h3>
    {error && <p role="alert" className="mt-2 text-sm text-[#c2200a]">{error}</p>}
    <ul className="m-0 mt-3 list-none space-y-2 p-0">{seasons.map(season => {
      const done = countIn(season.number)
      return <li key={season.number} className="rounded-[14px] border-2 border-[#15000b] bg-white">
        <div className="flex items-center gap-2 p-2 pl-4">
          <button type="button" aria-expanded={open === season.number} onClick={() => toggleOpen(season.number)} className="flex min-h-9 flex-1 items-center gap-3 text-left text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2">
            <span aria-hidden="true" className={`transition-transform ${open === season.number ? 'rotate-90' : ''}`}>›</span>
            <span className="flex-1">{season.name || `Season ${season.number}`}</span>
            <span className="text-xs font-normal tabular-nums text-[#55464d]">{done}/{season.episodeCount}</span>
          </button>
          <button type="button" onClick={() => tickSeason(season)} className={`${chip} ${done >= season.episodeCount ? 'bg-[#b79bf7]' : 'bg-white hover:bg-[#c1ff1a]'}`}>{done >= season.episodeCount ? 'Unmark' : 'Mark all'}</button>
        </div>
        {open === season.number && <ul className="m-0 list-none border-t-2 border-[#15000b]/15 p-2">
          {!episodes[season.number] && <li className="p-2 text-sm text-[#55464d]">Loading episodes…</li>}
          {episodes[season.number]?.map(episode => <li key={episode.number}>
            <label className="flex min-h-10 cursor-pointer items-start gap-3 rounded-[10px] px-2 py-2 text-sm hover:bg-[#b79bf7]/30">
              <input type="checkbox" checked={watched(season.number, episode.number)} onChange={event => tick(season.number, episode, event.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#1a0088]" />
              <span className="min-w-0 flex-1"><span className="tabular-nums text-[#55464d]">{episode.number}.</span> {episode.name || 'Episode'}{episode.airDate && <span className="ml-2 text-xs text-[#55464d]">{episode.airDate}</span>}</span>
            </label>
          </li>)}
        </ul>}
      </li>
    })}</ul>
  </section>
}

function Detail({ title, onChange, onRemove, onClose }: { title: Title; onChange: (title: Title) => void; onRemove: () => void; onClose: () => void }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function patch(change: Partial<Pick<Title, 'status' | 'rating' | 'favorite'>>) {
    setBusy(true); setError('')
    try { onChange(await call<Title>(`${base}/${title.id}`, { method: 'PATCH', body: JSON.stringify(change) })) }
    catch (problem) { setError((problem as Error).message) } finally { setBusy(false) }
  }
  async function remove() {
    if (!window.confirm(`Remove “${title.title}” and its progress from your list?`)) return
    setBusy(true); setError('')
    try { await call(`${base}/${title.id}`, { method: 'DELETE' }); onRemove() }
    catch (problem) { setError((problem as Error).message); setBusy(false) }
  }
  const finishedLabel = title.mediaType === 'movie' ? 'Watched' : 'Finished'
  return <Dialog labelledBy="titles-detail-title" onClose={onClose}>
    <div className="relative min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-7 sm:px-10">
      <CloseButton onClose={onClose} />
      <div className="flex gap-5">
        <div className="w-28 shrink-0 self-start overflow-hidden rounded-[14px] border-2 border-[#15000b] sm:w-40"><Poster title={title} /></div>
        <div className="min-w-0 flex-1 pr-8">
          <h2 id="titles-detail-title" className="text-2xl font-semibold leading-tight tracking-tight [overflow-wrap:anywhere]">{title.title}</h2>
          <p className="mt-1 text-sm text-[#55464d]">{[titleYear(title.releaseDate), title.runtimeMinutes ? `${title.runtimeMinutes} min` : '', title.genres.slice(0, 3).join(', '), title.voteAverage ? `TMDB ${title.voteAverage}` : ''].filter(Boolean).join(' · ')}</p>
          {title.providers.length > 0 && <p className="mt-2 text-xs"><span className="font-bold uppercase tracking-widest">Streaming</span> · {title.providers.slice(0, 5).join(', ')}</p>}
          {title.overview && <p className="mt-3 line-clamp-6 text-sm leading-6">{title.overview}</p>}
        </div>
      </div>
      <div role="group" aria-label="Status" className="mt-6 flex flex-wrap gap-2">{(['watchlist', 'watching', 'finished'] as TitleStatus[]).map(status => <button key={status} type="button" disabled={busy} aria-pressed={title.status === status} onClick={() => patch({ status })} className={chip} style={title.status === status ? { background: statusColor[status] } : { background: 'white' }}>{status === 'finished' ? finishedLabel : statusLabel[status]}</button>)}
        <button type="button" disabled={busy} aria-pressed={title.favorite} onClick={() => patch({ favorite: !title.favorite })} className={`${chip} ml-auto`} style={{ background: title.favorite ? '#ff00ae' : 'white', color: title.favorite ? 'white' : undefined }}>{title.favorite ? '♥ Favorite' : '♡ Favorite'}</button>
      </div>
      <div className="mt-5">
        <p className="text-[11px] font-bold uppercase tracking-[.16em]">Your rating {title.rating > 0 && <span className="font-normal normal-case tracking-normal">· {title.rating}/10</span>}</p>
        <div role="group" aria-label="Your rating out of 10" className="mt-2 flex flex-wrap gap-1.5">{Array.from({ length: 10 }, (_, index) => index + 1).map(value => <button key={value} type="button" disabled={busy} aria-pressed={title.rating === value} aria-label={`${value} out of 10`} onClick={() => patch({ rating: title.rating === value ? 0 : value })} className={`flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#15000b] text-sm font-bold tabular-nums transition-colors ${title.rating === value ? 'bg-[#1a0088] text-[#efe7d4]' : 'bg-white hover:bg-[#c1ff1a]'}`}>{value}</button>)}</div>
      </div>
      {error && <p role="alert" className="mt-4 rounded-[14px] border-2 border-[#15000b] bg-[#ffb3da] p-3 text-sm font-medium">{error}</p>}
      {title.mediaType === 'tv' && <Seasons title={title} onChange={onChange} />}
    </div>
    <footer className="flex shrink-0 items-center justify-between gap-3 border-t-2 border-[#15000b] bg-white/60 px-6 py-4 sm:px-10">
      <button type="button" disabled={busy} onClick={remove} className="min-h-11 rounded-full px-3 py-2 text-sm font-semibold text-[#c2200a] hover:bg-[#ffb3da]/60 focus-visible:outline-2 disabled:opacity-50">Remove</button>
      <button type="button" onClick={onClose} className={primary}>Done</button>
    </footer>
  </Dialog>
}

const tabs: { key: TitleStatus | 'all' | 'favorites'; label: string }[] = [{ key: 'all', label: 'All' }, { key: 'watchlist', label: 'Watchlist' }, { key: 'watching', label: 'Watching' }, { key: 'finished', label: 'Finished' }, { key: 'favorites', label: 'Favorites' }]

export function TitlesPage({ kind, addRequest }: { kind: TitleKind; addRequest: number }) {
  const [titles, setTitles] = useState<Title[] | null>(null)
  const [configured, setConfigured] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<(typeof tabs)[number]['key']>('all')
  const [sort, setSort] = useState<'added' | 'title' | 'rating' | 'year'>('added')
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const [openId, setOpenId] = useState('')
  const [fresh, setFresh] = useState('')
  const handled = useRef(addRequest)
  const noun = kind === 'movie' ? 'Movies' : 'TV shows'
  const nounLower = kind === 'movie' ? 'movies' : 'TV shows'
  useEffect(() => {
    setTitles(null); setError(''); setTab('all'); setQuery(''); setOpenId('')
    const controller = new AbortController()
    fetch(base, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('Could not load your list.')
      const data = await response.json(); setTitles(data.titles); setConfigured(data.configured)
    }).catch(problem => { if (!controller.signal.aborted) setError(problem.message) })
    return () => controller.abort()
  }, [kind])
  useEffect(() => {
    if (addRequest === handled.current) return
    handled.current = addRequest
    if (!configured) setError('TMDB is not configured on this server, so titles cannot be added.')
    else if (titles) setAdding(true)
  }, [addRequest, configured, titles])
  const mine = useMemo(() => (titles ?? []).filter(title => title.mediaType === kind), [titles, kind])
  const shown = useMemo(() => sortTitles(filterTitles(mine, tab, query), sort), [mine, tab, query, sort])
  const open = mine.find(title => title.id === openId)
  const replace = (next: Title) => setTitles(current => (current ?? []).map(title => title.id === next.id ? next : title))
  const summary = kind === 'movie'
    ? `${mine.length} saved · ${mine.filter(title => title.status === 'finished').length} watched`
    : `${mine.length} saved · ${mine.filter(title => title.status === 'watching').length} in progress · ${mine.reduce((sum, title) => sum + title.episodes.length, 0).toLocaleString()} episodes watched`
  const count = (key: (typeof tabs)[number]['key']) => key === 'all' ? mine.length : key === 'favorites' ? mine.filter(title => title.favorite).length : mine.filter(title => title.status === key).length
  return <section aria-label={noun}>
    {titles && <p className="mb-4 text-sm text-[#55464d]">{summary}</p>}
    <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-3 border-b-2 border-[#15000b]/15 pb-5">
      <div role="tablist" aria-label="Filter" className="watch-noscrollbar -mx-4 flex max-w-[calc(100%+2rem)] gap-2 overflow-x-auto px-4 sm:mx-0 sm:max-w-full sm:px-0">{tabs.map(item => <button key={item.key} role="tab" aria-selected={tab === item.key} type="button" onClick={() => setTab(item.key)} className={`${chip} shrink-0 ${tab === item.key ? 'bg-[#1a0088] text-[#efe7d4]' : 'bg-white hover:bg-[#b79bf7]/40'}`}>{item.label} <span className="ml-1.5 tabular-nums opacity-60">{count(item.key)}</span></button>)}</div>
      <div className="flex w-full min-w-0 flex-1 items-center justify-end gap-2 sm:w-auto">
        <div className="relative min-w-0 flex-1 sm:max-w-64">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#55464d]"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <label htmlFor="titles-filter" className="sr-only">Search your {nounLower}</label>
          <input id="titles-filter" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search" className="min-h-11 w-full min-w-0 rounded-full border-2 border-[#15000b] bg-white pl-10 pr-4 text-sm placeholder:text-[#7a6a72] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7f3aed]" />
        </div>
        <div className="relative shrink-0">
          <label htmlFor="titles-sort" className="sr-only">Sort by</label>
          <select id="titles-sort" value={sort} onChange={event => setSort(event.target.value as typeof sort)} className="min-h-11 cursor-pointer appearance-none rounded-full border-2 border-[#15000b] bg-white py-0 pl-4 pr-10 text-xs font-bold uppercase tracking-widest hover:bg-[#c1ff1a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7f3aed]">
            <option value="added">Recent</option><option value="title">A–Z</option><option value="rating">My rating</option><option value="year">Newest release</option>
          </select>
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2"><path d="m6 9 6 6 6-6" /></svg>
        </div>
      </div>
    </div>
    {error && <p role="alert" className="mb-5 rounded-[14px] border-2 border-[#15000b] bg-[#ffb3da] p-3 text-sm font-medium">{error}</p>}
    {!titles && !error && <ul role="status" aria-label="Loading" className="m-0 grid list-none grid-cols-2 gap-4 p-0 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">{Array.from({ length: 12 }, (_, index) => <li key={index} style={{ '--i': index } as React.CSSProperties} className="watch-skeleton aspect-[2/3] rounded-[16px] border-2 border-[#15000b]/20" />)}</ul>}
    {titles && shown.length === 0 && <div className="rounded-[18px] border-2 border-dashed border-[#15000b]/40 p-8 text-center">
      <p className="text-lg font-semibold">{mine.length === 0 ? `No ${nounLower} yet.` : 'Nothing matches that.'}</p>
      {mine.length === 0 && configured && <button type="button" onClick={() => setAdding(true)} className={`${primary} mt-4`}>Add your first</button>}
    </div>}
    {titles && shown.length > 0 && <ul className="m-0 grid list-none grid-cols-2 gap-x-4 gap-y-7 p-0 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">{shown.map((title, index) => {
      const progress = progressText(title)
      return <li key={title.id} style={{ '--i': Math.min(index, 20) } as React.CSSProperties} className={`watch-card min-w-0 ${fresh === title.id ? 'watch-new' : ''}`}>
        <button type="button" onClick={() => setOpenId(title.id)} className="group block w-full text-left focus-visible:outline-none">
          <span className="watch-thumb relative block overflow-hidden rounded-[16px] border-2 border-[#15000b] bg-[#b9c7f8]">
            <Poster title={title} className="transition-transform duration-200 group-hover:scale-[1.03]" />
            <span className="pointer-events-none absolute left-2 top-2 rounded-full border-2 border-[#15000b] px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest" style={{ background: statusColor[title.status] }}>{title.status === 'finished' && title.mediaType === 'movie' ? 'Watched' : statusLabel[title.status]}</span>
            {title.favorite && <span aria-label="Favorite" className="pointer-events-none absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#15000b] bg-[#ff00ae] text-xs text-white">♥</span>}
            {title.rating > 0 && <span className="pointer-events-none absolute bottom-2 right-2 rounded-md bg-[#15000b] px-1.5 py-0.5 text-xs font-bold tabular-nums text-[#efe7d4]">{title.rating}/10</span>}
            {progress && title.status !== 'finished' && <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1.5 bg-[#15000b]/70"><span className="watch-prog block h-full" style={{ width: `${progress.fraction * 100}%` }} /></span>}
          </span>
          <span className="mt-2.5 block line-clamp-2 text-sm font-semibold leading-5 group-focus-visible:underline">{title.title}</span>
          <span className="mt-0.5 block truncate text-xs text-[#55464d]">{[titleYear(title.releaseDate), progress?.label].filter(Boolean).join(' · ')}</span>
        </button>
      </li>
    })}</ul>}
    {adding && titles && <AddDialog kind={kind} saved={titles} onClose={() => setAdding(false)} onSaved={title => { setTitles(current => [title, ...(current ?? [])]); setFresh(title.id); setSort('added'); setTab('all'); setQuery('') }} />}
    {open && <Detail key={open.id} title={open} onChange={replace} onClose={() => setOpenId('')} onRemove={() => { setTitles(current => (current ?? []).filter(title => title.id !== open.id)); setOpenId('') }} />}
  </section>
}
