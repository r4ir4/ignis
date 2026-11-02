import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { autoUpdate, computePosition, flip, offset, shift } from '@floating-ui/dom'
import { type Page } from './notebookModel'
import { type InboxStatus, type InboxKind, type Notification, type useInbox } from './useInbox'

type Inbox = ReturnType<typeof useInbox>
const statusNames: Record<InboxStatus, string> = { inbox: 'Inbox', unread: 'Unread', archived: 'Archived', all: 'All workspace updates' }
function Glyph({ name }: { name: 'filter' | 'close' | 'pin' | 'archive' | 'check' | 'bell' | 'workspace' }) {
  const paths = { filter: 'M4 6h16M7 12h10M10 18h4', close: 'm14 6-6 6 6 6m6-12-6 6 6 6', pin: 'M9 3h6l-1 6 4 4v2H6v-2l4-4-1-6Zm3 12v7', archive: 'M4 8h16v13H4zM3 3h18v5H3zM9 12h6', check: 'm5 12 4 4L19 6', bell: 'M18 8a6 6 0 0 0-12 0v7l-2 3h16l-2-3V8ZM10 21h4', workspace: 'M3 5h18v15H3zM8 2v6M16 2v6M3 10h18' }
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>
}
function when(value: string) {
  const minutes = Math.round((Date.parse(value) - Date.now()) / 60000)
  return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(Math.abs(minutes) < 60 ? minutes : Math.abs(minutes) < 1440 ? Math.round(minutes / 60) : Math.round(minutes / 1440), Math.abs(minutes) < 60 ? 'minute' : Math.abs(minutes) < 1440 ? 'hour' : 'day')
}
export function InboxPanel({ inbox, pages, pinned, setPinned, width, setWidth, close, navigate, compact, notice, open }: { open: boolean; inbox: Inbox; notice: string; pages: Page[]; pinned: boolean; setPinned: (value: boolean) => void; width: number; setWidth: (value: number) => void; close: () => void; navigate: (id: string) => void; compact: boolean }) {
  const id = useId()
  const panel = useRef<HTMLElement>(null)
  const filter = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const first = useRef<HTMLButtonElement>(null)
  const resizeStart = useRef({ x: 0, width })
  const [filterOpen, setFilterOpen] = useState(false)
  useLayoutEffect(() => { if (open) first.current?.focus({ preventScroll: true }); else menu.current?.hidePopover() }, [open])
  useLayoutEffect(() => {
    const button = filter.current, floating = menu.current
    if (!filterOpen || !button || !floating) return
    let alive = true
    const stop = autoUpdate(button, floating, () => { void computePosition(button, floating, { strategy: 'fixed', placement: 'bottom-end', middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 })] }).then(({ x, y }) => { if (alive) Object.assign(floating.style, { left: `${x}px`, top: `${y}px`, visibility: 'visible' }) }) })
    return () => { alive = false; stop(); floating.style.visibility = 'hidden' }
  }, [filterOpen])
  function keyboard(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape' && !filterOpen) { event.preventDefault(); close() }
    if (compact && event.key === 'Tab') {
      const items = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, [tabindex="0"]') || []).filter(el => el.getClientRects().length)
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1)?.focus() }
      else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0]?.focus() }
    }
  }
  async function openPage(item: Notification) { if (!item.readAt && !(await inbox.change(item.id, { read: true }))) return; if (item.pageId) navigate(item.pageId) }
  return <div className={`notebook-inbox-frame ${pinned ? 'is-pinned' : ''} ${open ? '' : 'is-closing'}`} inert={!open}>
  <aside id="notebook-inbox" ref={panel} className={`notebook-inbox-panel ${pinned ? 'is-pinned' : ''}`} aria-hidden={!open || undefined} role={compact ? 'dialog' : 'region'} aria-modal={compact || undefined} aria-label="Notification Inbox" onKeyDown={keyboard}>
    <header className="notebook-inbox-header"><h2>{statusNames[inbox.status]}</h2><div>
      <button type="button" className="notebook-inbox-pin" title={pinned ? 'Unpin Inbox' : 'Pin Inbox'} aria-label={pinned ? 'Unpin Inbox' : 'Pin Inbox'} aria-pressed={pinned} onClick={() => setPinned(!pinned)}><Glyph name="pin" /></button>
      <button ref={first} type="button" title="Close Inbox" aria-label="Close Inbox" onClick={close}><Glyph name="close" /></button>
      <button ref={filter} type="button" title="Filter notifications" aria-label="Filter notifications" popoverTarget={id} aria-expanded={filterOpen} aria-haspopup="menu" className={inbox.status !== 'inbox' || inbox.kind ? 'has-filter' : ''}><Glyph name="filter" /></button>
    </div></header>
    <div ref={menu} id={id} className="notebook-inbox-filters" popover="auto" role="menu" aria-label="Notification filters" onToggle={event => { setFilterOpen(event.newState === 'open'); if (event.newState === 'open') requestAnimationFrame(() => menu.current?.querySelector<HTMLElement>('[role="menuitemradio"]')?.focus()) }} onKeyDown={event => {
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
      event.preventDefault()
      const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitemradio"]'))
      const index = items.indexOf(document.activeElement as HTMLElement)
      items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus()
    }}>
      <p>Status</p>{(Object.keys(statusNames) as InboxStatus[]).map(status => <button key={status} type="button" role="menuitemradio" aria-checked={inbox.status === status} onClick={() => { inbox.setStatus(status); menu.current?.hidePopover(); filter.current?.focus() }}><span aria-hidden="true">{inbox.status === status ? '◉' : '○'}</span>{status === 'inbox' ? 'Unread & read' : statusNames[status]}</button>)}
      <hr /><p>Type</p>{([['', 'All types'], ['reminder', 'Reminders'], ['workspace', 'Workspace']] as [InboxKind, string][]).map(([kind, label]) => <button key={kind} type="button" role="menuitemradio" aria-checked={inbox.kind === kind} onClick={() => { inbox.setKind(kind); menu.current?.hidePopover(); filter.current?.focus() }}><span aria-hidden="true">{inbox.kind === kind ? '◉' : '○'}</span>{label}</button>)}
    </div>
    {notice && <p className="notebook-inbox-notice" role="status">{notice}</p>}
    {inbox.error && <div className="notebook-inbox-error" role="alert"><p>{inbox.error}</p><button type="button" onClick={() => void inbox.reload()}>Retry</button></div>}
    <div className="notebook-inbox-list" aria-busy={inbox.loading}>
      {inbox.loading && !inbox.items.length ? <p className="notebook-inbox-loading" role="status">Loading notifications…</p> : !inbox.items.length && !inbox.error ? <div className="notebook-inbox-empty"><Glyph name={inbox.status === 'archived' ? 'archive' : 'check'} /><p>{inbox.status === 'archived' ? 'Archived notifications go here' : 'You’re all caught up'}</p></div> : null}
      {inbox.items.map(item => {
        const page = pages.find(p => p.id === item.pageId)
        return <article className={`notebook-notification ${item.readAt ? '' : 'is-unread'}`} key={item.id} aria-label={item.title}>
          <div className="notebook-notification-source"><Glyph name={item.kind === 'reminder' ? 'bell' : 'workspace'} /></div>
          <div className="notebook-notification-detail"><strong>{item.title}</strong><p>{item.body}</p><time dateTime={item.dueAt} title={new Date(item.dueAt).toLocaleString()}>{when(item.dueAt)}</time>
            {item.pageId && <button type="button" className="notebook-notification-page" disabled={inbox.busy || !page || !!page.deletedAt} onClick={() => void openPage(item)}>{!page ? 'Page unavailable' : page.deletedAt ? 'Page in Trash' : `Open ${page.title || 'Untitled'}`}</button>}
            <div className="notebook-notification-actions"><button type="button" disabled={inbox.busy} onClick={() => void inbox.change(item.id, { read: !item.readAt })}>{item.readAt ? 'Mark unread' : 'Mark read'}</button><button type="button" disabled={inbox.busy} onClick={() => void inbox.change(item.id, { archived: !item.archivedAt })}>{item.archivedAt ? 'Unarchive' : 'Archive'}</button></div>
          </div>{!item.readAt && <span className="notebook-unread-dot" aria-label="Unread" />}
        </article>
      })}
      {inbox.nextCursor && <button type="button" className="notebook-inbox-more" disabled={inbox.loading || inbox.busy} onClick={() => void inbox.reload(true)}>Load more</button>}
    </div>
    {!!inbox.items.some(n => !n.readAt) && <footer><button type="button" disabled={inbox.busy} onClick={() => void inbox.markRead()}>Mark loaded notifications as read</button></footer>}
    <div className="notebook-inbox-resize" role="separator" tabIndex={0} aria-label="Resize Inbox" aria-orientation="vertical" aria-valuemin={320} aria-valuemax={640} aria-valuenow={width}
      onKeyDown={event => { if (['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); setWidth(Math.max(320, Math.min(640, width + (event.key === 'ArrowRight' ? 10 : -10)))) } }}
      onPointerDown={event => { event.preventDefault(); resizeStart.current = { x: event.clientX, width }; event.currentTarget.setPointerCapture(event.pointerId) }}
      onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) setWidth(Math.max(320, Math.min(640, resizeStart.current.width + event.clientX - resizeStart.current.x))) }}
      onPointerUp={event => event.currentTarget.releasePointerCapture(event.pointerId)} onDoubleClick={() => setWidth(390)} />
  </aside>
  </div>
}
