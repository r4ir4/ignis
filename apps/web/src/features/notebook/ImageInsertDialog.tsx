import { useEffect, useRef, useState } from 'react'
import { uploadNotebookImage } from './imageUpload'

export function ImageInsertDialog({ insert, close, initialFile = null }: { initialFile?: File | null; insert: (src: string, alt: string) => void; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const request = useRef<AbortController | null>(null)
  const [source, setSource] = useState<'upload' | 'link'>('upload')
  const [file, setFile] = useState<File | null>(initialFile)
  const [url, setUrl] = useState('')
  const [alt, setAlt] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    dialog.current?.showModal()
    return () => { request.current?.abort() }
  }, [])
  function dismiss() { request.current?.abort(); close() }
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return
    setError('')
    const controller = new AbortController()
    request.current = controller
    setBusy(true)
    try {
      let src: string
      if (source === 'upload') {
        if (!file) throw new Error('Choose an image to upload.')
        src = await uploadNotebookImage(file, controller.signal)
      } else {
        const parsed = new URL(url)
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Enter a complete http or https image URL.')
        src = parsed.href
      }
      if (!controller.signal.aborted) { insert(src, alt.trim()); close() }
    } catch (error) {
      if (!controller.signal.aborted) setError(error instanceof TypeError ? (source === 'link' ? 'Enter a complete http or https image URL.' : 'The upload could not connect. Please try again.') : error instanceof Error ? error.message : 'The image could not be inserted. Please try again.')
    } finally { if (!controller.signal.aborted) setBusy(false) }
  }
  return <dialog ref={dialog} className="notebook-image-dialog" aria-label="Insert image" onCancel={event => { event.preventDefault(); event.stopPropagation(); dismiss() }}>
    <div className="notebook-dialog-heading"><h2>Insert image</h2><button type="button" aria-label="Close image dialog" onClick={dismiss}>×</button></div>
    <div className="notebook-image-tabs" role="group" aria-label="Image source">{(['upload', 'link'] as const).map(tab => <button type="button" key={tab} aria-pressed={source === tab} disabled={busy} onClick={() => { setSource(tab); setError('') }}>{tab === 'upload' ? 'Upload' : 'Link'}</button>)}</div>
    <form className="notebook-image grid gap-3" onSubmit={event => void submit(event)}>
      {source === 'upload' ? <><label>Choose an image<input autoFocus type="file" aria-label="Upload page image" accept="image/jpeg,image/png,image/webp,image/gif" disabled={busy} onChange={event => { setFile(event.target.files?.[0] || null); setError('') }} /></label><p className="notebook-image-help">{file ? `${file.name || 'Pasted image'} selected. ` : ''}JPEG, PNG, WebP or GIF · Up to 8 MB. Animated images use the first frame.</p></> : <label>Image URL<input autoFocus maxLength={2000} type="url" value={url} required disabled={busy} onChange={e => setUrl(e.target.value)} /></label>}
      <label>Image description<input maxLength={500} value={alt} required disabled={busy} placeholder="Describe the image…" onChange={e => setAlt(e.target.value)} /></label>
      {error && <p role="alert">{error}</p>}
      {busy && <p role="status">{source === 'upload' ? 'Uploading image…' : 'Inserting image…'}</p>}
      <div className="flex gap-2"><button type="submit" disabled={busy || (source === 'upload' && !file)}>{busy ? 'Uploading…' : 'Insert image'}</button><button type="button" onClick={dismiss}>Cancel</button></div>
    </form>
  </dialog>
}
