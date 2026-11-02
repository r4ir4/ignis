import { useEffect, useId, useRef, useState } from 'react'
import { PropertyPopover } from './TaskPropertyControls'
import type { PropertyValue } from './taskProperties'
import { attachmentBatchError, attachmentLimit, attachmentName, attachmentPreview, attachmentSource } from './taskFiles'

function FileIcon({ folder = false }: { folder?: boolean }) { return <svg viewBox="0 0 20 20" aria-hidden="true"><path d={folder ? 'M2 5h6l2 2h8v10H2Zm0 5h16' : 'M5 2h7l4 4v12H5ZM12 2v5h4'} /></svg> }
function FileThumbnail({ source }: { source: string }) {
  const [failed, setFailed] = useState(false), preview = attachmentPreview(source)
  return preview && !failed ? <img src={preview} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : <FileIcon />
}
function ImagePreview({ source, close }: { source: string; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), [failed, setFailed] = useState(false)
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; dialog.current?.showModal(); return () => { if (previous?.isConnected) previous.focus({ preventScroll: true }) } }, [])
  return <dialog ref={dialog} className="notebook-file-preview" aria-label={`Preview ${attachmentName(source)}`} onCancel={event => { event.preventDefault(); event.stopPropagation(); close() }}><header><span>{attachmentName(source)}</span><a href={source} target="_blank" rel="noopener noreferrer">Open original</a><button type="button" aria-label="Close file preview" onClick={close}>×</button></header>{failed ? <p>This image could not be previewed. You can open the original file.</p> : <img src={attachmentPreview(source)!} alt={attachmentName(source)} referrerPolicy="no-referrer" onError={() => setFailed(true)} />}</dialog>
}

export function FilesProperty({ label, value, change, editable }: { label: string; value: PropertyValue; change: (value: PropertyValue) => void; editable: boolean }) {
  const [busy, setBusy] = useState(false), [progress, setProgress] = useState(''), [error, setError] = useState(''), [preview, setPreview] = useState<string | null>(null)
  const current = useRef<string[]>([]), allowed = useRef(editable), controller = useRef<AbortController | null>(null)
  const files = Array.isArray(value) ? value : []
  current.current = files; allowed.current = editable
  useEffect(() => () => controller.current?.abort(), [])
  function append(url: string) {
    if (!allowed.current || current.current.length >= attachmentLimit) return
    const next = [...current.current, url]; current.current = next; change(next)
  }
  async function upload(batch: File[]) {
    if (!allowed.current || controller.current || !batch.length) return
    const issue = attachmentBatchError(batch, current.current.length)
    if (issue) { setError(issue); return }
    setBusy(true); setError('')
    const request = new AbortController(); controller.current = request
    try {
      for (let index = 0; index < batch.length; index++) {
        if (!allowed.current || request.signal.aborted) break
        const file = batch[index]
        setProgress(`Uploading ${index + 1} of ${batch.length}…`)
        const response = await fetch(`/api/notebook/attachments?filename=${encodeURIComponent(file.name)}`, { method: 'POST', body: file, headers: { 'Content-Type': 'application/octet-stream' }, signal: AbortSignal.any([request.signal, AbortSignal.timeout(60000)]) })
        const data = await response.json()
        if (!response.ok || typeof data.url !== 'string' || !/^\/api\/notebook\/attachments\/[a-f0-9]{64}\/[A-Za-z0-9_.%-]+$/.test(data.url)) throw new Error(typeof data.detail === 'string' ? data.detail : `Could not upload “${file.name}”. Please retry.`)
        append(data.url)
      }
    } catch (issue) { if (!request.signal.aborted) setError(`${issue instanceof Error ? issue.message : 'Upload failed.'} Files already uploaded remain attached.`) }
    finally { if (!request.signal.aborted) { controller.current = null; setBusy(false); setProgress('') } }
  }
  function addLink(input: string) {
    if (!allowed.current || busy) return false
    try { const source = attachmentSource(input, window.location.origin); if (current.current.length >= attachmentLimit) throw new Error('You can attach up to 30 files.'); append(source); setError(''); return true }
    catch (issue) { setError(issue instanceof Error ? issue.message : 'Check the file link.'); return false }
  }
  const trigger = <span className={`notebook-file-value ${!files.length ? 'is-empty' : ''}`}>{files.length ? files.map((source, index) => <span key={`${source}:${index}`}><FileThumbnail source={source} /><span>{attachmentName(source)}</span></span>) : <><span aria-hidden="true">＋</span> Add a file or image</>}</span>
  return <><PropertyPopover label={label} trigger={trigger}>{() => <FilePicker label={label} files={files} editable={editable} busy={busy} progress={progress} error={error} upload={upload} addLink={addLink} remove={index => { if (!allowed.current || busy) return; const next = current.current.filter((_, i) => i !== index); current.current = next; change(next) }} preview={setPreview} />}</PropertyPopover>{preview && <ImagePreview source={preview} close={() => setPreview(null)} />}</>
}
function FilePicker({ label, files, editable, busy, progress, error, upload, addLink, remove, preview }: { label: string; files: string[]; editable: boolean; busy: boolean; progress: string; error: string; upload: (files: File[]) => Promise<void>; addLink: (value: string) => boolean; remove: (index: number) => void; preview: (source: string) => void }) {
  const [tab, setTab] = useState<'upload' | 'link'>('upload'), [link, setLink] = useState(''), [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null), folderInput = useRef<HTMLInputElement>(null), linkInput = useRef<HTMLInputElement>(null), id = useId()
  useEffect(() => { if (tab === 'link') linkInput.current?.focus() }, [tab])
  const blocked = !editable || busy || files.length >= attachmentLimit
  function submitLink() { if (addLink(link)) { setLink(''); linkInput.current?.focus() } }
  function fileSelection(input: HTMLInputElement) { const batch = Array.from(input.files || []); input.value = ''; void upload(batch) }
  return <div className={`notebook-files-picker ${dragging ? 'is-dragging' : ''}`} onPaste={event => { if (blocked) return; const images = Array.from(event.clipboardData.files).filter(file => file.type.startsWith('image/')); if (images.length) { event.preventDefault(); event.stopPropagation(); void upload(images) } }} onDragOver={event => { if (!blocked && event.dataTransfer.types.includes('Files')) { event.preventDefault(); event.stopPropagation(); setDragging(true); event.dataTransfer.dropEffect = 'copy' } }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false) }} onDrop={event => { if (blocked || !event.dataTransfer.files.length) return; event.preventDefault(); event.stopPropagation(); setDragging(false); void upload(Array.from(event.dataTransfer.files)) }}>
    {!!files.length && <div className="notebook-file-list" aria-label={`${label} attachments`}>{files.map((source, index) => <div key={`${source}:${index}`} className="notebook-file-row"><span className="notebook-file-thumbnail"><FileThumbnail source={source} /></span>{attachmentPreview(source) ? <button type="button" className="notebook-file-name" onClick={() => preview(source)} title={attachmentName(source)}>{attachmentName(source)}</button> : <a className="notebook-file-name" href={source} target="_blank" rel="noopener noreferrer" title={attachmentName(source)}>{attachmentName(source)}</a>}<a className="notebook-file-open" aria-label={`Open ${attachmentName(source)}`} href={source} target="_blank" rel="noopener noreferrer">↗</a>{editable && <button type="button" className="notebook-file-remove" disabled={busy} aria-label={`Remove ${attachmentName(source)}`} onClick={() => remove(index)}>×</button>}</div>)}</div>}
    {editable && <><div className="notebook-file-tabs" role="tablist" aria-label="Add attachment" onKeyDown={event => { if (['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); const next = tab === 'upload' ? 'link' : 'upload'; setTab(next); event.currentTarget.querySelector<HTMLButtonElement>(`[data-tab=${next}]`)?.focus() } }}>{(['upload', 'link'] as const).map(value => <button type="button" key={value} data-tab={value} id={`${id}-${value}`} role="tab" tabIndex={tab === value ? 0 : -1} aria-selected={tab === value} aria-controls={`${id}-panel`} onClick={() => { setTab(value) }}>{value === 'upload' ? 'Upload' : 'Link'}</button>)}</div><div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${tab}`} className="notebook-file-tab-panel">{tab === 'upload' ? <><div className="notebook-file-upload-actions"><button type="button" className="notebook-file-primary" disabled={blocked} onClick={() => fileInput.current?.click()}>Upload file</button><button type="button" className="notebook-file-folder" aria-label="Upload folder" title="Upload folder" disabled={blocked} onClick={() => folderInput.current?.click()}><FileIcon folder /></button></div><input ref={fileInput} hidden type="file" multiple aria-label="Choose attachment files" disabled={blocked} onChange={event => fileSelection(event.currentTarget)} /><input ref={element => { folderInput.current = element; element?.setAttribute('webkitdirectory', '') }} hidden type="file" multiple aria-label="Choose attachment folder" disabled={blocked} onChange={event => fileSelection(event.currentTarget)} /><p className="notebook-file-hint">Drop files here or paste an image</p><p className="notebook-file-limit">Up to 8 MB per file · {files.length}/30 files</p></> : <><input ref={linkInput} type="url" aria-label="Attachment URL" placeholder="Paste in https://…" value={link} maxLength={2000} disabled={blocked} onChange={event => setLink(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); if (link.trim()) submitLink() } }} /><button type="button" className="notebook-file-primary" disabled={blocked || !link.trim()} onClick={submitLink}>Link</button></>}</div></>}
    {busy && <p className="notebook-file-hint" role="status">{progress || 'Uploading…'}</p>}{error && <p className="notebook-file-error" role="alert">{error}</p>}
  </div>
}
