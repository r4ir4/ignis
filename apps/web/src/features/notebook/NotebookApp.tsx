import { PageBreadcrumbs } from './PageBreadcrumbs'
import { Dropdown } from '../../components/Dropdown'
import { PageEditor } from './PageEditor'
import { isFixedPage, isRetiredFixedPage, openFixedPage, type FixedPageKind } from './fixedPages'
import type { PersonalList } from './personalLists'
import { FixedNotebookView, NotebookSaveStatus } from './NotebookView'
import { InboxPanel } from './InboxPanel'
import { ReminderForm } from './ReminderForm'
import { useInbox } from './useInbox'
import { PageActions } from './PageActions'
import { PageCover } from './PageCover.tsx'
import { PageIconPicker } from './PageIconPicker'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { type JSONContent } from '@tiptap/react'
import { WorkspaceMenu } from './WorkspaceMenu'
import './notebook.css'
import './notebookMetrics.css'
import './notebookSurfaces.css'

import { type Page, validPages, descendants, duplicate, reparent, restore, textOf, trash } from './notebookModel'
import { useNotebook } from './useNotebook'
import { PageSidebar } from './PageSidebar'
const STORAGE = 'ignis.tiptap.playground.v1'
const blank = (): JSONContent => ({ type: 'doc', content: [{ type: 'paragraph' }] })
const paragraph = (text: string): JSONContent => ({ type: 'paragraph', content: [{ type: 'text', text }] })
function load(): { pages: Page[]; error: string } {
  try {
    const raw = localStorage.getItem(STORAGE)
    if (raw) {
      const pages: Page[] = JSON.parse(raw)
      if (!validPages(pages) || !pages.length) throw new Error('Invalid notebook')
      return { pages, error: '' }
    }
  } catch {
    return { pages: [{ id: crypto.randomUUID(), parentId: null, title: 'Recovery workspace', content: blank() }], error: 'The browser notebook could not be opened. Its stored copy is preserved. Edits in this session are not saved; download a backup before leaving.' }
  }
  return { pages: [{ id: crypto.randomUUID(), parentId: null, title: 'A place for your thoughts', content: { type: 'doc', content: [
    paragraph('A little room to write, collect and make sense of things. Welcome to your Ignis notebook.'),
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Start with a thought' }] },
    paragraph('Type / on an empty line to choose a block, or use the + beside a block. Select text to open the formatting menu. You can also use Markdown shortcuts, like ## followed by a space for a heading.'),
    { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: false }, content: [paragraph('Make a page of your own')] }, { type: 'taskItem', attrs: { checked: false }, content: [paragraph('Try a heading, a quote or a checklist')] }] },
    { type: 'blockquote', content: [paragraph('Keep what matters. Let the rest find its place.')] },
    paragraph('Pages save to your Ignis database, with a browser recovery copy while editing.'),
    { type: 'paragraph' },
  ] } }], error: '' }
}

function SidebarIcon({ kind }: { kind: 'inbox' | 'new' | 'close' | 'open' }) {
  const paths = {
    inbox: 'M4 4h16l2 10v6H2v-6L4 4ZM2 14h6l2 3h4l2-3h6',
    new: 'M12 4H4v16h16v-8M10 14l1-4 8-8 3 3-8 8-4 1ZM17 4l3 3',
    close: 'M4 4h16v16H4zM9 4v16',
    open: 'M4 6h16M4 12h16M4 18h16',
  }
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[kind]} /></svg>
}

export default function NotebookApp() {
  const [boardTitleActions, setBoardTitleActions] = useState<HTMLDivElement | null>(null)
  const [inputMode, setInputMode] = useState<'pointer' | 'keyboard'>('pointer')
  const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
  const inbox = useInbox()
  const [inboxOpen, setInboxOpen] = useState(false)
  const [inboxPresent, setInboxPresent] = useState(false)
  const [inboxPinned, setInboxPinned] = useState(false)
  const [inboxWidth, setInboxWidth] = useState(390)
  const [inboxNotice, setInboxNotice] = useState('')
  const [initial] = useState(load)
  const store = useNotebook(initial)
  const { pages, setPages } = store
  const [activeId, setActiveId] = useState(() => new URLSearchParams(location.hash.slice(1)).get('page') || initial.pages[0].id)
  const [query, setQuery] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(() => window.matchMedia('(min-width: 768px)').matches)
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 767px)').matches)
  const [sidebarWidth, setSidebarWidth] = useState(270)
  const [resizing, setResizing] = useState(false)
  const resizeStart = useRef({ x: 0, width: 270 })
  const [panel, setPanel] = useState<'trash' | 'move' | 'history' | 'recovery' | 'reminder' | null>(null)
  const [parentChoice, setParentChoice] = useState('')
  const [versions, setVersions] = useState<{ revision: number; savedAt: string; page: Page }[]>([])
  const [historyError, setHistoryError] = useState('')
  const [historyLoading, setHistoryLoading] = useState(false)
  const [editorEpoch, setEditorEpoch] = useState(0)
  const dialog = useRef<HTMLDialogElement>(null)
  const live = pages.filter(p => !p.deletedAt && !isRetiredFixedPage(p))
  const page = live.find(p => p.id === activeId) ?? live[0]

  useEffect(() => {
    if (inboxOpen) { setInboxPresent(true); return }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setInboxPresent(false); return }
    const timer = window.setTimeout(() => setInboxPresent(false), 200)
    return () => window.clearTimeout(timer)
  }, [inboxOpen])
  useEffect(() => {
    const navigate = () => setActiveId(new URLSearchParams(location.hash.slice(1)).get('page') || '')
    window.addEventListener('popstate', navigate); window.addEventListener('hashchange', navigate)
    return () => { window.removeEventListener('popstate', navigate); window.removeEventListener('hashchange', navigate) }
  }, [])
  useEffect(() => {
    if (page && !store.loading) { setActiveId(page.id); history.replaceState(null, '', `${location.pathname}${location.search}#page=${page.id}`) }
  }, [page?.id, store.loading])
  useEffect(() => {
    if (panel && !dialog.current?.open) dialog.current?.showModal()
    else if (!panel && dialog.current?.open) dialog.current?.close()
  }, [panel])
  useEffect(() => {
    if (panel !== 'history' || !page) return
    let live = true
    setVersions([]); setHistoryError(''); setHistoryLoading(true)
    fetch(`/api/notebook/pages/${page.id}/history`).then(async response => { if (!response.ok) throw new Error('Page history is unavailable. Save this page and retry.'); return response.json() })
      .then(value => { if (live) setVersions(value) }).catch(error => { if (live) setHistoryError(error.message) }).finally(() => { if (live) setHistoryLoading(false) })
    return () => { live = false }
  }, [panel, page?.id])
  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)')
    const changed = () => setCompact(media.matches)
    media.addEventListener('change', changed)
    return () => media.removeEventListener('change', changed)
  }, [])
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return
      if (event.key.toLowerCase() === 'k') {
        event.preventDefault(); setSidebarOpen(true)
        requestAnimationFrame(() => document.getElementById('notebook-page-search')?.focus())
      } else if (event.key === '\\') {
        event.preventDefault(); toggleSidebar(!sidebarOpen)
      }
    }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  }, [sidebarOpen])
  function select(id: string) {
    history.pushState(null, '', `${location.pathname}${location.search}#page=${id}`)
    setActiveId(id); if (!window.matchMedia('(min-width: 768px)').matches) setSidebarOpen(false)
  }
  function openFixed(kind: FixedPageKind) {
    const result = openFixedPage(pages, kind)
    setPages(items => openFixedPage(items, kind).pages); select(result.id)
  }
  function add(parentId: string | null, title = '', icon: string | null = null) {
    const next = { id: crypto.randomUUID(), parentId, title, icon, fullWidth: true, content: blank(), favorite: false, deletedAt: null }
    setPages(items => [...items, next]); select(next.id); setQuery('')
    requestAnimationFrame(() => document.getElementById('notebook-title')?.focus())
  }
  function openInbox() {
    setInboxNotice('')
    setInboxOpen(open => !open)
    if (compact) setSidebarOpen(false)
    void inbox.reload()
  }
  function closeInbox() {
    setInboxNotice('')
    setInboxOpen(false)
    requestAnimationFrame(() => document.getElementById(sidebarOpen ? 'notebook-inbox-trigger' : 'notebook-open-sidebar')?.focus())
  }
  function toggleSidebar(open: boolean) {
    if (!open) document.getElementById('notebook-sidebar')?.querySelectorAll<HTMLElement>('[popover]:popover-open').forEach(element => element.hidePopover())
    setSidebarOpen(open)
    requestAnimationFrame(() => document.getElementById(open ? 'notebook-close-sidebar' : 'notebook-open-sidebar')?.focus())
  }
  function backup() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 1, pages }, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = 'ignis-notebook-backup.json'; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  function duplicateCurrent() { if (!page) return; const result = duplicate(pages, page.id); setPages(result.pages); select(result.id) }
  const excludedParents = page ? descendants(pages, page.id) : new Set<string>()
  return <NotebookSaveStatus.Provider value={{ status: store.status, error: store.error, retry: () => { void store.retry() } }}><main data-input-mode={inputMode} onPointerDownCapture={() => setInputMode('pointer')} onKeyDownCapture={event => { if (['Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) setInputMode('keyboard') }} style={{ '--nb-sidebar-width': `${sidebarWidth}px`, '--nb-inbox-width': `${inboxWidth}px` } as CSSProperties} className={`notebook min-h-dvh ${sidebarOpen ? '' : 'is-sidebar-collapsed'} ${resizing ? 'is-resizing' : ''} ${inboxPresent ? 'has-inbox' : ''} ${inboxPresent && !inboxOpen ? 'is-inbox-closing' : ''} ${inboxPinned ? 'is-inbox-pinned' : ''}`}>
    <a className="notebook-skip" href="#notebook-title">Skip to writing</a>
    <div className="notebook-sidebar-frame" inert={!sidebarOpen || (compact && inboxOpen)}>
    <aside id="notebook-sidebar" className="notebook-sidebar" onKeyDown={event => {
      if (!compact || !sidebarOpen) return
      if (event.key === 'Escape' && !event.currentTarget.querySelector('[popover]:popover-open, dialog[open]')) { event.preventDefault(); toggleSidebar(false) }
      if (event.key === 'Tab') {
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input, a[href], [tabindex="0"]')).filter(element => element.getClientRects().length > 0)
        const first = controls[0], last = controls.at(-1)
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }}>
      <div className="notebook-sidebar-toolbar" role="group" aria-label="Sidebar actions">
        <button id="notebook-close-sidebar" type="button" title="Close sidebar" aria-label="Close sidebar" aria-controls="notebook-sidebar" aria-expanded={sidebarOpen} onClick={() => toggleSidebar(false)}><SidebarIcon kind="close" /></button>
        <div className="notebook-sidebar-toolbar-end">
          <button id="notebook-inbox-trigger" type="button" className="notebook-inbox-trigger" title="Inbox" aria-label={inbox.unreadCount ? `Open Inbox, ${inbox.unreadCount} unread notification${inbox.unreadCount === 1 ? '' : 's'}` : 'Open Inbox'} aria-expanded={inboxOpen} aria-controls="notebook-inbox" onClick={openInbox}><SidebarIcon kind="inbox" />{inbox.unreadCount > 0 && <span className="notebook-inbox-badge" aria-hidden="true">{inbox.unreadCount > 99 ? '99+' : inbox.unreadCount}</span>}</button>
          <button type="button" title="New page" aria-label="Create new page" disabled={store.loading} onClick={() => add(null)}><SidebarIcon kind="new" /></button>
        </div>
      </div>
      <div id="notebook-library" className="notebook-library">
        {!store.loading && <PageSidebar openFixed={openFixed} isLocal={isLocal} pages={pages} activeId={page?.id || ''} query={query} setQuery={setQuery} select={select} add={add} move={(id, parent) => setPages(items => reparent(items, id, parent))} />}
        {store.loading && <p className="notebook-no-results" role="status">Opening notebook…</p>}
      </div>
      <div className="notebook-workspace-slot"><WorkspaceMenu openTrash={() => setPanel('trash')} isLocal={isLocal} backup={backup} openRecovery={() => setPanel('recovery')} /></div>
      <div className="notebook-sidebar-resize" role="separator" aria-label="Resize sidebar" aria-orientation="vertical" aria-valuemin={220} aria-valuemax={420} aria-valuenow={sidebarWidth} tabIndex={0}
        onDoubleClick={() => setSidebarWidth(270)}
        onKeyDown={event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); setSidebarWidth(width => event.key === 'Home' ? 220 : event.key === 'End' ? 420 : Math.max(220, Math.min(420, width + (event.key === 'ArrowRight' ? 10 : -10)))) } }}
        onPointerDown={event => { event.preventDefault(); resizeStart.current = { x: event.clientX, width: sidebarWidth }; event.currentTarget.setPointerCapture(event.pointerId); setResizing(true) }}
        onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) setSidebarWidth(Math.max(220, Math.min(420, resizeStart.current.width + event.clientX - resizeStart.current.x))) }}
        onPointerUp={event => { event.currentTarget.releasePointerCapture(event.pointerId); setResizing(false) }} onLostPointerCapture={() => setResizing(false)} />
    </aside>
    </div>
    {inboxPresent && <InboxPanel open={inboxOpen} notice={inboxNotice} inbox={inbox} pages={pages} pinned={inboxPinned} setPinned={setInboxPinned} width={inboxWidth} setWidth={setInboxWidth} compact={compact} close={closeInbox} navigate={id => { select(id); if (!inboxPinned || compact) closeInbox() }} />}
    {sidebarOpen && !(compact && inboxOpen) && <button type="button" className="notebook-sidebar-backdrop" tabIndex={-1} aria-label="Close sidebar overlay" onClick={() => toggleSidebar(false)} />}
    <section className={`notebook-page-pane min-w-0 ${(page?.fullWidth ?? true) ? 'is-full-width' : ''}`} inert={compact && (sidebarOpen || inboxOpen)}>
      <header className="notebook-topbar flex flex-wrap items-center justify-between gap-3 px-5 py-3 md:px-8"><div className="notebook-breadcrumb">{!sidebarOpen && <button id="notebook-open-sidebar" type="button" title="Open sidebar" aria-label="Open sidebar" aria-controls="notebook-sidebar" aria-expanded={sidebarOpen} onClick={() => toggleSidebar(true)}><SidebarIcon kind="open" /></button>}<PageBreadcrumbs pages={pages} page={page} select={select} /></div><div className="notebook-topbar-end"><span role="status">{store.status}</span>{page && !store.loading && !isFixedPage(page) && (<div className="notebook-page-controls flex flex-wrap items-center justify-end gap-2">
            <button aria-label={page.favorite ? 'Remove from favorites' : 'Add to favorites'} aria-pressed={!!page.favorite} onClick={() => setPages(items => items.map(p => p.id === page.id ? { ...p, favorite: !p.favorite } : p))}>{page.favorite ? '★ Favorited' : '☆ Favorite'}</button>
            <PageActions key={page.id} page={page} pages={pages} update={patch => setPages(items => items.map(p => p.id === page.id ? { ...p, ...patch } : p))}
              rename={() => document.getElementById('notebook-title')?.focus()} duplicate={duplicateCurrent}
              move={() => { setParentChoice(page.parentId || ''); setPanel('move') }} history={() => setPanel('history')} reminder={() => setPanel('reminder')}
              trash={() => setPages(items => trash(items, page.id))} />
          </div>)}</div></header>
      {page && page.cover && !store.loading && (!isFixedPage(page) || page.kind === 'board') && <PageCover key={`${page.id}:${!!page.locked}`} readOnly={page.locked} value={page.cover} onChange={cover => setPages(items => items.map(p => p.id === page.id ? { ...p, cover } : p))} />}
      <article className={`notebook-sheet mx-auto ${(page?.fullWidth ?? true) ? 'is-full-width' : ''} ${page?.cover ? 'has-page-cover' : ''} page-font-${page?.font || 'default'} ${page?.smallText ? 'is-small-text' : ''}`}>
        {store.backupWarning && <div className="notebook-error mb-4" role="alert"><p>{store.backupWarning}</p><button onClick={backup}>Download backup</button></div>}
        {(store.error || initial.error) && <div className="notebook-error mb-6" role="alert"><p>{store.error || initial.error}</p><div className="flex flex-wrap gap-2 mt-2"><button onClick={() => void store.retry()} disabled={store.loading}>Retry saving</button><button onClick={backup}>Download browser copy</button>{store.conflict && <><button onClick={() => void store.resolve(true)}>Keep both versions</button><button onClick={() => void store.resolve(false)}>Open server version</button></>}</div></div>}
        {store.loading ? <p role="status">Opening your notebook…</p> : page ? <>
          {(!isFixedPage(page) || page.kind === 'board') && <div className={`notebook-heading-tools ${page.icon ? 'has-page-icon' : ''} ${page.cover ? 'with-cover' : ''}`}><PageIconPicker key={`${page.id}:${!!page.locked}`} readOnly={page.locked} value={page.icon} onChange={icon => setPages(items => items.map(p => p.id === page.id ? { ...p, icon } : p))} />{!page.cover && <PageCover key={`${page.id}:${!!page.locked}`} readOnly={page.locked} value={page.cover} onChange={cover => setPages(items => items.map(p => p.id === page.id ? { ...p, cover } : p))} />}</div>}
          {page.locked && <div className="notebook-page-locked" role="status"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M5 10h14v11H5zM8 10V6a4 4 0 0 1 8 0v4" /></svg>Page locked<button type="button" onClick={() => setPages(items => items.map(p => p.id === page.id ? { ...p, locked: false } : p))}>Unlock</button></div>}
          {isFixedPage(page) ? <>{page.kind === 'board' ? <div className="notebook-board-title-row"><label htmlFor="notebook-title" className="sr-only">Page title</label><textarea rows={1} id="notebook-title" readOnly={page.locked} className="notebook-title w-full" placeholder="Tasks" value={page.title} onChange={event => { const title = event.target.value; setPages(items => items.map(p => p.id === page.id && !p.locked ? { ...p, title } : p)) }} /><div className="notebook-board-title-actions" ref={setBoardTitleActions} /></div> : page.kind === 'habits' ? null : <h1 className="notebook-title mt-8 mb-5" id="notebook-title">{page.title}</h1>}<FixedNotebookView changeMoods={change => setPages(items => items.map(p => p.id === page.id && !p.locked && !p.deletedAt ? { ...p, moods: change(p.moods || []) } : p))} changeReading={change => setPages(items => items.map(p => p.id === page.id && !p.locked && !p.deletedAt ? { ...p, reading: change(p.reading || { books: [], entries: [] }) } : p))} changeHabits={change => setPages(items => items.map(p => p.id === page.id && !p.locked && !p.deletedAt ? { ...p, habits: change(p.habits || []) } : p))} settingsTarget={page.kind === 'board' ? boardTitleActions : null} page={page} pages={pages} mutateLists={(owner, change) => setPages(items => items.map(p => p.id === owner && !p.locked && !p.deletedAt ? { ...p, lists: change(p.lists || []) } : p))} update={content => setPages(items => items.map(p => p.id === page.id && !p.locked ? { ...p, content } : p))} /></> : <>
          <label htmlFor="notebook-title" className="sr-only">Page title</label>
          <textarea rows={1} id="notebook-title" readOnly={page.locked} className="notebook-title mt-8 mb-5 w-full" placeholder="Untitled" value={page.title} onChange={event => { const title = event.target.value; setPages(items => items.map(p => p.id === page.id ? { ...p, title } : p)) }} />
          <PageEditor mutateLists={(owner, change) => setPages(items => items.map(p => p.id === owner && !p.locked && !p.deletedAt ? { ...p, lists: change(p.lists || []) } : p))} key={`${page.id}:${store.editorEpoch}:${editorEpoch}`} page={page} pages={pages} createPage={(id, content) => { setPages(items => [...items.map(p => p.id === page.id ? { ...p, content } : p), { id, parentId: page.id, title: '', content: blank(), fullWidth: true }]); select(id); requestAnimationFrame(() => document.getElementById('notebook-title')?.focus()) }} update={patch => setPages(items => items.map(p => p.id === page.id && !p.locked ? { ...p, ...patch } : p))} />
          </>}
        </> : <div className="notebook-empty"><h1>Your notebook starts here</h1><p>Create a page, or restore one from Trash.</p><button onClick={() => add(null)}>+ New page</button><button onClick={() => setPanel('trash')}>Open Trash</button></div>}
      </article>
    </section>
    <dialog ref={dialog} className="notebook-settings notebook-page-dialog" aria-label={panel === 'trash' ? 'Trash' : panel === 'move' ? 'Move page' : panel === 'recovery' ? 'Browser recovery' : panel === 'reminder' ? 'Remind me' : 'Page history'} onClose={() => setPanel(null)}>
      <div className="flex justify-between items-center mb-5"><h2>{panel === 'trash' ? 'Trash' : panel === 'move' ? 'Move page' : panel === 'recovery' ? 'Browser recovery' : panel === 'reminder' ? 'Remind me' : 'Page history'}</h2><button aria-label="Close dialog" onClick={() => setPanel(null)}>×</button></div>
      {panel === 'reminder' && page && <ReminderForm key={page.id} pageId={page.id} created={dueAt => { setInboxNotice(Date.parse(dueAt) <= Date.now() ? 'Reminder delivered to your Inbox.' : `Reminder scheduled for ${new Date(dueAt).toLocaleString()}. It will appear here when due.`); setPanel(null); setInboxOpen(true); if (compact) setSidebarOpen(false); void inbox.reload() }} />}
      {panel === 'recovery' && <><p>Recent browser drafts are retained separately from server pages. Recovering adds copies, preserving saved pages.</p>{store.recoveries().map(entry => <div className="notebook-history-version" key={entry.key}><strong>{entry.pages.length} pages</strong><p>{entry.savedAt ? new Date(entry.savedAt).toLocaleString() : 'Recovered browser draft'}</p><p>{entry.pages.slice(0, 3).map(p => p.title || 'Untitled').join(', ')}</p><button onClick={() => { void store.restoreRecovery(entry.pages); setPanel(null) }}>Recover as copies</button></div>)}{!store.recoveries().length && <p>No browser drafts need recovery.</p>}</>}
      {panel === 'trash' && <><p>Deleted pages stay here until you restore them. Nothing is permanently deleted.</p>{pages.filter(p => p.deletedAt).map(p => <div key={p.id} className="notebook-trash-row"><span>{p.title || 'Untitled'}</span><button onClick={() => { setPages(items => restore(items, p.id)); select(p.id) }}>Restore</button></div>)}{!pages.some(p => p.deletedAt) && <p>Trash is empty.</p>}</>}
      {panel === 'move' && page && <form onSubmit={event => { event.preventDefault(); setPages(items => reparent(items, page.id, parentChoice || null)); setPanel(null) }}><label htmlFor="notebook-parent">Move “{page.title || 'Untitled'}” into</label><Dropdown id="notebook-parent" value={parentChoice} onValueChange={selectedValue => setParentChoice(selectedValue)}><option value="">Private — top level</option>{live.filter(p => !excludedParents.has(p.id)).map(p => <option key={p.id} value={p.id}>{p.title || 'Untitled'}</option>)}</Dropdown><button type="submit" className="notebook-settings-save mt-4">Move page</button></form>}
      {panel === 'history' && <>{historyLoading && <p role="status">Loading versions…</p>}{historyError && <p role="alert">{historyError}</p>}{!historyLoading && !historyError && !versions.length && <p>No saved versions yet.</p>}{versions.map(version => <div className="notebook-history-version" key={version.revision}><strong>{version.page.title || 'Untitled'}</strong><p>{new Date(version.savedAt).toLocaleString()} · revision {version.revision}</p><p className="notebook-history-excerpt">{textOf(version.page.content).slice(0, 180)}</p><button disabled={page?.locked} title={page?.locked ? 'Unlock the page to restore a version' : undefined} onClick={() => { if (page && !page.locked) setPages(items => items.map(p => p.id === page.id ? { ...p, title: version.page.title, icon: version.page.icon ?? null, cover: version.page.cover ?? null, fullWidth: version.page.fullWidth ?? true, font: version.page.font ?? 'default', smallText: !!version.page.smallText, lists: version.page.lists || [], content: version.page.content } : p)); setEditorEpoch(value => value + 1); setPanel(null) }}>Restore this version</button></div>)}</>}
    </dialog>
  </main></NotebookSaveStatus.Provider>
}
