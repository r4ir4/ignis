import { useRef, useState } from 'react'
import type { Video, WatchState } from './watchModel'
export function VideoNotes({ video, onSaved }: { video: Video; onSaved: (state: WatchState) => void }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(false)
  const addButton = useRef<HTMLButtonElement>(null)
  const draftId = useRef(crypto.randomUUID())
  const attemptedText = useRef('')
  async function post(event: React.FormEvent) {
    event.preventDefault(); if (!text.trim() || busy) return
    if (attemptedText.current && attemptedText.current !== text.trim()) draftId.current = crypto.randomUUID()
    attemptedText.current = text.trim()
    setBusy(true); setError('')
    try {
      const response = await fetch(`/api/watch/${video.id}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: draftId.current, text }), signal: AbortSignal.timeout(15000) })
      if (!response.ok) throw new Error('Could not add your note. Your draft is kept; try again.')
      onSaved(await response.json()); setText(''); setExpanded(false); addButton.current?.focus(); attemptedText.current = ''; draftId.current = crypto.randomUUID()
    } catch (reason) { setError(reason instanceof Error && reason.name !== 'TimeoutError' ? reason.message : 'Note timed out. Your draft is kept; try again.') }
    finally { setBusy(false) }
  }
  const comments = [...(video.comments ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return <section className="w-full min-w-0 border-t border-[#c9bfb0] pt-5 lg:border-t-0 lg:pt-0" aria-labelledby="notes-heading">
    <header className="mb-4 flex items-center justify-between gap-3 border-b border-[#c9bfb0] pb-3">
      <h2 id="notes-heading" className="font-['Iowan_Old_Style',Georgia,serif] text-2xl leading-8">Notes <span className="text-[#756655]">({comments.length})</span></h2>
      <button ref={addButton} type="button" disabled={busy} aria-label={expanded ? 'Close note editor' : 'Add a note'} aria-expanded={expanded} aria-controls="note-editor" title={expanded ? 'Close note editor' : 'Add a note'} onClick={() => setExpanded(previous => !previous)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm text-[#6b5133] hover:bg-[#e4dac9] focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">{expanded ? <path strokeLinecap="round" d="m6 6 12 12M6 18 18 6" /> : <><path strokeLinecap="round" strokeLinejoin="round" d="m14 5 5 5M4 20l4-1 12-12a2.1 2.1 0 0 0-3-3L5 16l-1 4Z" /><path d="M13 20h7" /></>}</svg></button>
    </header>
    <form id="note-editor" hidden={!expanded} onSubmit={post} className="mb-5 w-full min-w-0 border-b border-[#c9bfb0] pb-4">
      <div className="grid w-full min-w-0 grid-cols-[12px_minmax(0,1fr)] items-start gap-3"><span aria-hidden="true" className="mt-3 w-3 shrink-0 text-xl leading-7 text-[#967747]">•</span><label htmlFor="video-note" className="sr-only">Add a note</label><textarea id="video-note" rows={5} maxLength={4000} required disabled={busy} value={text} onFocus={() => setExpanded(true)} onChange={event => setText(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); event.currentTarget.form?.requestSubmit() } }} placeholder="Write a note…" className="block max-h-64 min-h-12 w-full min-w-0 max-w-full resize-none overflow-x-hidden overflow-y-auto [overflow-wrap:anywhere] rounded-sm bg-transparent py-3 pl-1 pr-3 font-['Iowan_Old_Style',Georgia,serif] text-lg leading-7 placeholder:text-[#867761] outline-none focus:outline-none focus-visible:outline-none focus:shadow-[inset_0_-1px_0_#9c8b73]" /></div>
      {(expanded || !!text || busy) && <div className="ml-6 mt-2 flex flex-wrap items-center justify-end gap-2"><span className="mr-auto text-xs tabular-nums text-[#756655]">{text.length} / 4000</span><button type="button" disabled={busy} onClick={() => { setText(''); setExpanded(false); addButton.current?.focus(); setError(''); attemptedText.current = ''; draftId.current = crypto.randomUUID() }} className="min-h-11 rounded-sm px-3 py-2 text-sm text-[#756655] hover:bg-[#e4dac9] focus-visible:outline-2">Cancel</button><button disabled={busy || !text.trim()} className="inline-flex min-h-11 items-center rounded-sm border border-[#3b291b] bg-[#3b291b] px-4 py-2 text-sm font-medium text-white hover:bg-[#291b10] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50">{busy ? 'Saving…' : 'Add note'}</button></div>}
      {error && <p role="alert" className="ml-6 mt-3 text-sm text-red-700">{error}</p>}
    </form>
    {video.notes && <div className="mt-5 border-b border-[#c9bfb0] pb-5"><p className="ml-6 text-xs text-[#756655]">Earlier notes</p><ul className="mt-2 list-disc space-y-2 pl-6 marker:text-[#967747]"><li className="pl-1 font-['Iowan_Old_Style',Georgia,serif] text-lg leading-relaxed"><p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{video.notes}</p></li></ul></div>}
    <ul className="mt-5 list-disc space-y-5 pl-6 marker:text-[#967747]">{comments.map(comment => <li key={comment.id} className="pl-1"><p className="whitespace-pre-wrap [overflow-wrap:anywhere] font-['Iowan_Old_Style',Georgia,serif] text-lg leading-relaxed text-[#2a2119]">{comment.text}</p><time dateTime={comment.createdAt} className="mt-1 block text-xs text-[#756655]">{new Date(comment.createdAt).toLocaleString('en', { timeZone: 'America/Bahia', dateStyle: 'medium', timeStyle: 'short' })}</time></li>)}</ul>
  </section>
}
