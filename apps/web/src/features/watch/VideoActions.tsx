import { Rating, RoundedStar } from '@smastrom/react-rating'
import '@smastrom/react-rating/style.css'
import { useRef, useState } from 'react'
import type { Video, WatchState } from './watchModel'
const iconButton = 'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-3 disabled:opacity-50'
export function VideoActions({ video, onSaved }: { video: Video; onSaved: (state: WatchState) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const locked = useRef(false)
  async function change(value: Partial<Pick<Video, 'rating' | 'favorite' | 'status'>>) {
    if (locked.current) return
    locked.current = true; setBusy(true); setError('')
    try {
      const response = await fetch(`/api/watch/${video.id}/preferences`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value), signal: AbortSignal.timeout(15000) })
      if (!response.ok) throw new Error('Could not save this change. Please try again.')
      onSaved(await response.json())
    } catch { setError('Could not save this change. Please try again.') }
    finally { locked.current = false; setBusy(false) }
  }
  const watched = video.status === 'finished'
  return <div className="flex flex-wrap items-center gap-3">
    <div className="flex max-w-full items-center">
      <Rating className="watch-rating" style={{ width: 'var(--watch-rating-width)', maxWidth: 'var(--watch-rating-width)', flex: '0 0 var(--watch-rating-width)' }} value={video.rating ?? 0} onChange={(rating: number) => void change({ rating })} isDisabled={busy} isRequired={false} invisibleLabel="Your video rating" resetLabel="Clear rating" invisibleItemLabels={['1 star', '2 stars', '3 stars', '4 stars', '5 stars']} spaceInside="none" spaceBetween="none" transition="none" itemStyles={{ itemShapes: RoundedStar, itemStrokeWidth: 0, activeFillColor: '#15000b', inactiveFillColor: '#15000b' }} />
    </div>
    <button type="button" disabled={busy} aria-label={video.favorite ? 'Remove from favorites' : 'Favorite video'} aria-pressed={!!video.favorite} title={video.favorite ? 'Remove from favorites' : 'Favorite video'} onClick={() => void change({ favorite: !video.favorite })} className={`${iconButton} ${video.favorite ? 'text-[#15000b] hover:bg-[#c1ff1a]' : 'text-[#7a6a72] hover:bg-[#c1ff1a] hover:text-[#15000b]'}`}><svg aria-hidden="true" viewBox="0 0 24 24" fill={video.favorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" className="h-5 w-5"><path strokeLinejoin="round" d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" /></svg></button>
    <button type="button" disabled={busy} aria-label={watched ? 'Mark as not watched' : 'Mark watched'} aria-pressed={watched} title={watched ? 'Mark as not watched' : 'Mark watched'} onClick={() => void change({ status: watched ? 'watching' : 'finished' })} className={`${iconButton} ${watched ? 'text-[#15000b] hover:bg-[#c1ff1a]' : 'text-[#7a6a72] hover:bg-[#c1ff1a] hover:text-[#15000b]'}`}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={watched ? 2.5 : 1.5} className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="m5 12 4 4L19 6" /></svg></button>
    {error && <p role="alert" className="basis-full text-sm text-red-700">{error}</p>}
  </div>
}
