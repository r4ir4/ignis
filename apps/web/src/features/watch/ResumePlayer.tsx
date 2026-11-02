import { useEffect, useRef, useState } from 'react'
import type { Video, WatchState } from './watchModel'
type Player = { getCurrentTime(): number; getDuration(): number; getPlayerState(): number; seekTo(seconds: number, allowSeekAhead: boolean): void; destroy(): void }
type API = { Player: new (element: HTMLIFrameElement, options: { events: { onReady(event: { target: Player }): void; onStateChange(event: { data: number }): void } }) => Player }
declare global { interface Window { YT?: API; onYouTubeIframeAPIReady?: () => void } }
let apiPromise: Promise<API> | undefined
function loadAPI() {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (!apiPromise) apiPromise = new Promise<API>((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady
    const timer = setTimeout(() => { apiPromise = undefined; reject(new Error('Player connection timed out.')) }, 15000)
    window.onYouTubeIframeAPIReady = () => { previous?.(); clearTimeout(timer); if (window.YT) resolve(window.YT) }
    const script = document.createElement('script'); script.src = 'https://www.youtube.com/iframe_api'; script.async = true
    script.onerror = () => { clearTimeout(timer); apiPromise = undefined; reject(new Error('Player connection unavailable.')) }
    document.head.append(script)
  })
  return apiPromise
}
export function playbackTime(seconds: number) {
  const value = Math.max(0, Math.floor(seconds))
  return value >= 3600 ? `${Math.floor(value / 3600)}:${String(Math.floor(value / 60) % 60).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}` : `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`
}
export function ResumePlayer({ video, onSaved }: { video: Video; onSaved: (data: WatchState) => void }) {
  const host = useRef<HTMLDivElement>(null)
  const callback = useRef(onSaved); callback.current = onSaved
  const playerRef = useRef<Player | null>(null)
  const initial = useRef(video.progressSeconds ?? 0)
  const [message, setMessage] = useState(initial.current > 0 ? `Continue from ${playbackTime(initial.current)}` : '')
  useEffect(() => {
    let disposed = false, ready = false, started = false, lastSent = -1, saving = false
    let pending: { seconds: number; duration: number } | null = null
    const frame = document.createElement('iframe')
    frame.title = video.title
    frame.className = 'aspect-video min-h-[200px] w-full bg-black'
    frame.src = `https://www.youtube-nocookie.com/embed/${video.videoId}?enablejsapi=1&origin=${encodeURIComponent(location.origin)}&playsinline=1&rel=0&start=${Math.floor(initial.current)}`
    frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share'
    frame.allowFullscreen = true; frame.referrerPolicy = 'strict-origin-when-cross-origin'
    host.current?.append(frame)
    async function send(value: { seconds: number; duration: number }) {
      if (saving) { pending = value; return }
      saving = true
      try {
        const response = await fetch(`/api/watch/${video.id}/progress`, { method: 'PATCH', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value), signal: AbortSignal.timeout(12000) })
        if (!response.ok) throw new Error('Progress could not be saved. Check your connection or sign in again.')
        const data = await response.json()
        if (!disposed) { callback.current(data); setMessage(`Progress saved at ${playbackTime(value.seconds)}`) }
      } catch { if (!disposed) { lastSent = -1; setMessage('Progress could not be saved. We’ll retry while this page is open.') } }
      finally { saving = false; if (pending) { const latest = pending; pending = null; void send(latest) } }
    }
    function capture() {
      const player = playerRef.current
      if (!ready || !started || !player) return
      const seconds = player.getCurrentTime(), duration = player.getDuration()
      if (!Number.isFinite(seconds) || !Number.isFinite(duration) || seconds < 0 || duration < 0 || Math.abs(seconds - lastSent) < 1) return
      lastSent = seconds; void send({ seconds, duration })
    }
    void loadAPI().then(api => {
      if (disposed) return
      playerRef.current = new api.Player(frame, { events: {
        onReady: () => { ready = true },
        onStateChange: event => { if (event.data === 1) started = true; if (event.data === 2 || event.data === 0) capture() },
      } })
    }).catch(() => { if (!disposed) setMessage('Progress tracking is unavailable. Playback can still work; check content blockers and reload to enable saving.') })
    const timer = setInterval(capture, 10000)
    const hidden = () => { if (document.visibilityState === 'hidden') capture() }
    document.addEventListener('visibilitychange', hidden); window.addEventListener('pagehide', capture)
    return () => { capture(); disposed = true; clearInterval(timer); document.removeEventListener('visibilitychange', hidden); window.removeEventListener('pagehide', capture); playerRef.current?.destroy(); playerRef.current = null; frame.remove() }
  }, [video.id, video.videoId])
  return <div><div ref={host} />{message && <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-[#756655]"><p role="status">{message}</p><button type="button" onClick={() => playerRef.current?.seekTo(0, true)} className="min-h-11 py-2 underline underline-offset-4 focus-visible:outline-2">Start from beginning</button></div>}</div>
}
