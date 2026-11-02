import { useEffect, useRef, useState, type RefObject } from 'react'
import { PropertyPopover } from './TaskPropertyControls'
import { uploadNotebookImage } from './imageUpload'
import { loadTaskImage, taskImageSource } from './taskImage'

export function TaskImagePreview({ src, alt = '', className = '' }: { src: string; alt?: string; className?: string }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [src])
  return failed ? <span className={`notebook-task-image-unavailable ${className}`} role="img" aria-label={alt || 'Image unavailable'}>Image unavailable</span> : <img className={className} src={src} alt={alt} draggable={false} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
}
function ImagePropertyEditor({ value, disabled, change, close, request }: { value: string | null; disabled: boolean; change: (value: string | null) => void; close: () => void; request: RefObject<AbortController | null> }) {
  const [tab, setTab] = useState<'upload' | 'link'>('upload'), [url, setUrl] = useState(value?.startsWith('https:') ? value : ''), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const editable = useRef(!disabled)
  editable.current = !disabled
  useEffect(() => () => request.current?.abort(), [request])
  useEffect(() => { if (disabled) request.current?.abort() }, [disabled, request])
  async function add(file?: File) {
    if (busy || disabled) return
    const controller = new AbortController()
    request.current?.abort(); request.current = controller
    setBusy(true); setError('')
    try {
      const source = file ? await uploadNotebookImage(file, controller.signal) : taskImageSource(url, window.location.origin)
      if (!file) await loadTaskImage(source, AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]))
      if (!controller.signal.aborted && editable.current) { change(source); close() }
    } catch (issue) {
      if (!controller.signal.aborted) setError(issue instanceof Error && issue.name !== 'TimeoutError' ? issue.message : 'The image took too long to load. Check the link or upload the file.')
    } finally { if (!controller.signal.aborted) setBusy(false) }
  }
  return <div className="notebook-task-image-editor">
    {value && <div className="notebook-task-image-current"><TaskImagePreview src={value} alt="Task image preview" /></div>}
    {!disabled && <><div className="notebook-task-image-tabs" role="tablist" aria-label="Task image source">{(['upload', 'link'] as const).map(source => <button type="button" role="tab" aria-selected={source === tab} disabled={busy} key={source} onClick={() => { setTab(source); setError('') }}>{source === 'upload' ? 'Upload' : 'Link'}</button>)}</div>
      {tab === 'upload' ? <div className="notebook-task-image-upload"><label>Choose an image<input type="file" aria-label="Upload task image" accept="image/jpeg,image/png,image/webp,image/gif" disabled={busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void add(file) }} /></label><p>JPEG, PNG, WebP or GIF · Up to 8 MB.</p></div> : <div className="notebook-task-image-link"><input type="url" aria-label="Task image URL" placeholder="Paste an image link…" maxLength={2000} value={url} disabled={busy} onChange={event => { setUrl(event.target.value); setError('') }} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void add() } }} /><button type="button" disabled={busy || !url.trim()} onClick={() => void add()}>Add image</button></div>}
      {busy && <p role="status">{tab === 'upload' ? 'Uploading image…' : 'Checking image…'}</p>}
      {error && <p role="alert">{error}</p>}
      {value && <button type="button" className="notebook-task-image-remove" disabled={busy} onClick={() => { request.current?.abort(); change(null); close() }}>Remove image</button>}
    </>}
    <button type="button" className="notebook-task-image-close" onClick={() => { request.current?.abort(); close() }}>{busy ? 'Cancel' : 'Close'}</button>
  </div>
}
export function TaskImagePicker({ value, disabled, change }: { value: string | null; disabled: boolean; change: (value: string | null) => void }) {
  const request = useRef<AbortController | null>(null)
  useEffect(() => () => request.current?.abort(), [])
  return <PropertyPopover label="Image" className="notebook-task-image-trigger" disabled={disabled && !value} onDismiss={() => request.current?.abort()} trigger={value ? <><TaskImagePreview src={value} className="notebook-task-image-thumb" /><span>1 image</span></> : <span className="is-empty">Empty</span>}>{close => <ImagePropertyEditor value={value} disabled={disabled} change={change} close={close} request={request} />}</PropertyPopover>
}
