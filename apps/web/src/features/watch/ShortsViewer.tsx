import { useEffect, useRef, useState } from 'react'
import { ResumePlayer } from './ResumePlayer'
import { SocialPlayer } from './SocialPlayer'
import type { Video, WatchState } from './watchModel'

const key = 'watch.shorts.autoplay'
const readAutoplay = () => { try { return localStorage.getItem(key) !== 'off' } catch { return true } }
const arrow = 'flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-[#15000b] bg-[#c1ff1a] text-2xl leading-none text-[#15000b] shadow-[0_3px_0_#15000b] transition-all hover:bg-white active:shadow-none disabled:pointer-events-none disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white'

// Shorts play one at a time in a horizontal slider: neighbours peek in on either side, arrows, keys and swipes move between them.
export function ShortsViewer({ shorts, currentId, onOpen, onClose, onSaved, renderThumb }: { shorts: Video[]; currentId: string; onOpen: (video: Video) => void; onClose: () => void; onSaved: (state: WatchState) => void; renderThumb: (video: Video) => React.ReactNode }) {
  const [autoplay, setAutoplay] = useState(readAutoplay)
  const index = shorts.findIndex(video => video.id === currentId)
  const current = shorts[index]
  const previous = shorts[index - 1], next = shorts[index + 1]
  const go = (video?: Video) => { if (video) onOpen(video) }
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, dialog, [contenteditable]') || event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { event.preventDefault(); go(next) }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { event.preventDefault(); go(previous) }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [previous?.id, next?.id])
  const touch = useRef<{ x: number; y: number } | null>(null)
  function toggle() { setAutoplay(value => { const nextValue = !value; try { localStorage.setItem(key, nextValue ? 'on' : 'off') } catch { /* preference stays for this visit */ } return nextValue }) }
  if (!current) return <p role="status" className="py-10 text-center text-[#55464d]">This short is no longer in your library.</p>
  // Browsers only allow sound when the visitor has already interacted with the page; otherwise start muted.
  const muted = !(navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive
  const height = 'min(70svh,720px)'
  const width = `calc(${height} * 9 / 16)`
  const slides = shorts.map((video, position) => ({ video, offset: position - index })).filter(slide => Math.abs(slide.offset) <= 2)
  return <section aria-roledescription="carousel" aria-label="Shorts" className="relative isolate mx-auto flex min-h-[calc(100svh-6.5rem)] max-w-[1500px] flex-col items-center justify-between gap-5 overflow-hidden rounded-[26px] bg-[#1a0088] px-4 py-5 text-[#efe7d4] sm:px-8">
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_55%_at_50%_45%,#7f3aed66,transparent_70%),radial-gradient(35%_40%_at_90%_100%,#ff00ae44,transparent_70%),radial-gradient(30%_35%_at_5%_90%,#ff5e3244,transparent_70%)]" />
    <p aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-[-.18em] -z-10 select-none text-center font-['Anton',Impact,sans-serif] text-[clamp(110px,20vw,280px)] uppercase leading-none tracking-[.01em] text-[#efe7d4]/[.07]">Shorts</p>
    <div className="flex w-full items-center justify-between gap-3">
      <button type="button" onClick={onClose} className="inline-flex h-10 items-center gap-2 rounded-full border-2 border-[#efe7d4]/40 px-4 text-xs font-bold uppercase tracking-widest hover:bg-[#efe7d4]/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c1ff1a]">← All shorts</button>
      <button type="button" role="switch" aria-checked={autoplay} onClick={toggle} className="inline-flex h-10 items-center gap-2.5 rounded-full border-2 border-[#efe7d4]/40 px-4 text-xs font-bold uppercase tracking-widest hover:bg-[#efe7d4]/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c1ff1a]">Autoplay<span aria-hidden="true" className={`relative h-5 w-9 rounded-full border-2 border-[#efe7d4] transition-colors ${autoplay ? 'bg-[#c1ff1a]' : 'bg-transparent'}`}><span className={`absolute top-0.5 h-3 w-3 rounded-full transition-all ${autoplay ? 'left-[18px] bg-[#1a0088]' : 'left-0.5 bg-[#efe7d4]'}`} /></span></button>
    </div>
    <div className="relative w-full overflow-hidden" style={{ height }} onTouchStart={event => { touch.current = { x: event.touches[0].clientX, y: event.touches[0].clientY } }} onTouchEnd={event => { const start = touch.current; touch.current = null; if (!start) return; const dx = event.changedTouches[0].clientX - start.x, dy = event.changedTouches[0].clientY - start.y; if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? next : previous) }}>
      {slides.map(({ video, offset }) => {
        const active = offset === 0, distance = Math.abs(offset)
        return <div key={video.id} role={active ? 'group' : undefined} aria-roledescription={active ? 'slide' : undefined} aria-label={active ? `${index + 1} of ${shorts.length}: ${video.title}` : undefined} aria-hidden={active ? undefined : true}
          className={`absolute left-1/2 top-0 h-full overflow-hidden rounded-[22px] border-2 bg-[#15000b] transition-[transform,opacity,border-color] duration-300 ease-out motion-reduce:transition-none ${active ? 'border-[#15000b] shadow-[0_24px_60px_-12px_#000a]' : 'border-[#efe7d4]/20'} ${distance === 2 ? 'max-2xl:hidden' : distance === 1 ? 'max-md:hidden' : ''}`}
          style={{ width, zIndex: 10 - distance, opacity: active ? 1 : distance === 1 ? .45 : .25, transform: `translateX(calc(-50% + ${offset} * (${width} + 1.5rem))) scale(${active ? 1 : distance === 1 ? .84 : .68})` }}>
          <div className="absolute inset-0">{renderThumb(video)}</div>
          {active ? <div className="absolute inset-0">{video.platform && video.platform !== 'youtube' ? <SocialPlayer video={video} autoplay={autoplay} muted={muted} fill /> : <ResumePlayer video={video} vertical fill autoplay={autoplay} muted={muted} onSaved={onSaved} />}</div>
            : <button type="button" tabIndex={-1} aria-label={`Open ${video.title}`} onClick={() => go(video)} className="absolute inset-0 cursor-pointer hover:bg-white/10" />}
        </div>
      })}
    </div>
    <button type="button" aria-label="Previous short" disabled={!previous} onClick={() => go(previous)} className={`${arrow} absolute left-3 top-1/2 z-10 hidden -translate-y-1/2 sm:flex lg:left-5`}>‹</button>
    <button type="button" aria-label="Next short" disabled={!next} onClick={() => go(next)} className={`${arrow} absolute right-3 top-1/2 z-10 hidden -translate-y-1/2 sm:flex lg:right-5`}>›</button>
    <div className="flex flex-col items-center gap-3">
      <div role="group" aria-label={`Short ${index + 1} of ${shorts.length}`} className="flex max-w-full items-center justify-center gap-1.5 overflow-hidden">{shorts.slice(Math.max(0, Math.min(index - 5, shorts.length - 11)), Math.max(0, Math.min(index - 5, shorts.length - 11)) + 11).map(video => <button key={video.id} type="button" aria-label={video.title} aria-current={video.id === current.id ? 'true' : undefined} onClick={() => go(video)} className={`h-2 rounded-full transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c1ff1a] ${video.id === current.id ? 'w-7 bg-[#c1ff1a]' : 'w-2 bg-[#efe7d4]/40 hover:bg-[#efe7d4]/80'}`} />)}</div>
      <p aria-live="polite" className="text-[11px] font-bold uppercase tracking-[.18em] tabular-nums text-[#b9c7f8]">{index + 1} / {shorts.length}<span className="hidden sm:inline"> · use ← → keys</span></p>
      <div className="flex items-center gap-4 sm:hidden"><button type="button" aria-label="Previous short" disabled={!previous} onClick={() => go(previous)} className={arrow}>‹</button><button type="button" aria-label="Next short" disabled={!next} onClick={() => go(next)} className={arrow}>›</button></div>
    </div>
  </section>
}
