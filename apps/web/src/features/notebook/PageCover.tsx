import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react'
import { coverGallery, coverPositionAfterDrag, safeCoverUrl, type PageCover as Cover } from './coverModel'
export function PageCover({ value, onChange, readOnly = false }: { readOnly?: boolean; value?: Cover | null; onChange: (cover: Cover | null) => void }) {
  const id = useId()
  const picker = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const image = useRef<HTMLImageElement>(null)
  const drag = useRef<{ pointerId: number; y: number; position: number; overflow: number } | null>(null)
  const [tab, setTab] = useState<'gallery' | 'link' | 'upload'>('gallery')
  const uploadRequest = useRef<AbortController | null>(null)
  const [uploading, setUploading] = useState(false)
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [reposition, setReposition] = useState(false)
  const [position, setPosition] = useState(value?.position ?? 50)
  const [imageFailed, setImageFailed] = useState(false)
  useEffect(() => { setImageFailed(false) }, [value?.url])
  useEffect(() => () => uploadRequest.current?.abort(), [])
  useEffect(() => { if (reposition) image.current?.focus({ preventScroll: true }) }, [reposition])
  function cancelPosition() { drag.current = null; setReposition(false); trigger.current?.focus({ preventScroll: true }) }
  function choose(cover: Cover | null) { onChange(cover); picker.current?.hidePopover(); trigger.current?.focus(); setReposition(false) }
  function changeTab(next: typeof tab) { uploadRequest.current?.abort(); setUploading(false); setTab(next); setError('') }
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return
    setError('')
    if (file.size > 8 * 1024 * 1024) { setError('Choose an image smaller than 8 MB.'); input.value = ''; return }
    uploadRequest.current?.abort()
    const controller = new AbortController()
    uploadRequest.current = controller
    setUploading(true)
    try {
      const response = await fetch('/api/notebook/cover-images', { method: 'POST', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream' }, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(60000)]) })
      const data = await response.json()
      if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'The upload failed. Please try again.')
      if (typeof data.url !== 'string' || !/^\/api\/notebook\/cover-images\/[a-f0-9]{64}\.webp$/.test(data.url)) throw new Error('The server returned an invalid image URL.')
      if (!controller.signal.aborted) choose({ url: data.url, position: 50 })
    } catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'The upload failed. Please try again.') }
    finally { if (!controller.signal.aborted) setUploading(false); input.value = '' }
  }
  if (readOnly) return <div className={`notebook-cover is-locked ${value ? 'has-cover' : 'no-cover'}`}>{value && <><img className="notebook-cover-image" src={value.url} alt="Page cover" draggable={false} style={{ objectPosition: `center ${value.position}%` }} />{value.author && value.authorUrl && value.sourceUrl && <span className="notebook-cover-credit">Photo by <a href={value.authorUrl} target="_blank" rel="noreferrer">{value.author}</a> on <a href={value.sourceUrl} target="_blank" rel="noreferrer">Unsplash</a></span>}</>}</div>
  return <div className={`notebook-cover ${value ? 'has-cover' : 'no-cover'} ${reposition ? 'is-repositioning' : ''}`} onKeyDown={event => { if (reposition && event.key === 'Escape') { event.preventDefault(); cancelPosition() } }}>
    {value && <>
      <img ref={image} className="notebook-cover-image" src={value.url} alt="Page cover" draggable={false} style={{ objectPosition: `center ${reposition ? position : value.position}%` }} onError={() => setImageFailed(true)}
        role={reposition ? 'slider' : undefined} tabIndex={reposition ? 0 : undefined} aria-label={reposition ? 'Cover position' : undefined} aria-valuemin={reposition ? 0 : undefined} aria-valuemax={reposition ? 100 : undefined} aria-valuenow={reposition ? Math.round(position) : undefined} aria-orientation={reposition ? 'vertical' : undefined} aria-describedby={reposition ? `${id}-drag-hint` : undefined}
        onPointerDown={event => {
          if (!reposition || imageFailed || event.button !== 0 || drag.current) return
          const element = event.currentTarget
          if (!element.naturalWidth || !element.naturalHeight) return
          event.preventDefault()
          const { width, height } = element.getBoundingClientRect()
          const overflow = Math.max(height, width * element.naturalHeight / element.naturalWidth) - height
          drag.current = { pointerId: event.pointerId, y: event.clientY, position, overflow }
          element.setPointerCapture(event.pointerId)
        }}
        onPointerMove={event => { const active = drag.current; if (active?.pointerId === event.pointerId) setPosition(coverPositionAfterDrag(active.position, event.clientY - active.y, active.overflow)) }}
        onPointerUp={event => { if (drag.current?.pointerId === event.pointerId) { drag.current = null; event.currentTarget.releasePointerCapture(event.pointerId) } }}
        onPointerCancel={event => { if (drag.current?.pointerId === event.pointerId) { setPosition(drag.current.position); drag.current = null } }}
        onLostPointerCapture={() => { drag.current = null }}
        onKeyDown={event => {
          if (!reposition) return
          if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) { event.preventDefault(); setPosition(current => event.key === 'Home' ? 0 : event.key === 'End' ? 100 : Math.max(0, Math.min(100, current + (event.key === 'ArrowUp' ? -1 : 1) * (event.shiftKey ? 10 : 1)))) }
          if (event.key === 'Enter') { event.preventDefault(); choose({ ...value, position }) }
        }} />
      {imageFailed && <p className="notebook-cover-image-error">Cover image unavailable. Choose another image.</p>}
    </>}
    <div className="notebook-cover-actions">
      {value && reposition ? <><button type="button" onClick={() => choose({ ...value, position })}>Save position</button><button type="button" onClick={cancelPosition}>Cancel</button></> : <>
      <button ref={trigger} type="button" popoverTarget={id}>{value ? 'Change cover' : 'Add cover'}</button>
      {value && <button type="button" onClick={() => { setPosition(value.position); setReposition(v => !v) }}>Reposition</button>}
      {value && <button type="button" onClick={() => choose(null)}>Remove cover</button>}
      </>}
    </div>
    {value && reposition && <div id={`${id}-drag-hint`} className="notebook-cover-drag-hint">Drag image to reposition<span className="sr-only">. Use arrow keys to adjust, Enter to save, or Escape to cancel.</span></div>}
    {value?.author && value.authorUrl && value.sourceUrl && <span className="notebook-cover-credit">Photo by <a href={value.authorUrl} target="_blank" rel="noreferrer">{value.author}</a> on <a href={value.sourceUrl} target="_blank" rel="noreferrer">Unsplash</a></span>}
    <div ref={picker} id={id} popover="auto" role="dialog" aria-label="Page cover" className="notebook-cover-picker" onToggle={e => { if (e.newState === 'closed') { uploadRequest.current?.abort(); setUploading(false); setError('') } }}>
      <div className="notebook-cover-tabs" role="group" aria-label="Cover source">{(['gallery', 'upload', 'link'] as const).map(item => <button key={item} type="button" aria-pressed={tab === item} onClick={() => changeTab(item)}>{item === 'gallery' ? 'Gallery' : item === 'upload' ? 'Upload' : 'Link'}</button>)}<button type="button" className="notebook-cover-close" aria-label="Close cover picker" onClick={() => picker.current?.hidePopover()}>×</button></div>
      {tab === 'gallery' && <div className="notebook-cover-grid">{coverGallery.map(item => <button type="button" key={item.url} aria-label={item.label} onClick={() => choose({ url: item.url, position: 50 })}><img src={item.url} alt={item.label} /><span>{item.label}</span></button>)}</div>}
      {tab === 'link' && <form onSubmit={e => { e.preventDefault(); if (safeCoverUrl(url.trim())) choose({ url: url.trim(), position: 50 }); else setError('Enter a valid HTTPS image URL.') }}><label htmlFor={`${id}-link`}>Image URL</label><input id={`${id}-link`} type="url" placeholder="https://…" value={url} onChange={e => setUrl(e.target.value)} required /><button type="submit">Apply cover</button></form>}
      {tab === 'upload' && <div className="notebook-cover-upload"><label htmlFor={`${id}-upload`}>Choose an image</label><input id={`${id}-upload`} type="file" aria-label="Upload cover image" accept="image/jpeg,image/png,image/webp,image/gif" disabled={uploading} onChange={event => void upload(event)} /><p>JPEG, PNG, WebP or GIF · Up to 8 MB. Animated images use the first frame.</p>{uploading && <p role="status">Uploading image…</p>}</div>}
      {error && <p role="alert">{error}</p>}
    </div>
  </div>
}
