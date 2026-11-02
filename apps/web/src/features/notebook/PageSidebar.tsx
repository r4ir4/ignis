import { isFixedPage } from './fixedPages'
import { PageSymbol } from './PageSymbol'
import { useEffect, useState } from 'react'
import type { Page } from './notebookModel'
import { textOf } from './notebookModel'

export function PageSidebar({ pages, activeId, query, setQuery, select, add, move }: { isLocal: boolean; pages: Page[]; activeId: string; query: string; setQuery: (value: string) => void; select: (id: string) => void; add: (parent: string | null) => void; move: (id: string, parent: string | null) => void }) {
  const activeKind = pages.find(page => page.id === activeId)?.kind
  const [shortcut, setShortcut] = useState<'home'>('home')
  useEffect(() => { setShortcut('home') }, [activeId, activeKind])
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [dragging, setDragging] = useState<string | null>(null)
  const [privateOpen, setPrivateOpen] = useState(true)
  const [favoritesOpen, setFavoritesOpen] = useState(true)
  const [over, setOver] = useState<string | null>(null)
  const live = pages.filter(p => !p.deletedAt && !isFixedPage(p))
  const matches = (p: Page) => `${p.title} ${textOf(p.content)}`.toLowerCase().includes(query.toLowerCase())
  function row(p: Page, depth: number) {
    const children = live.filter(child => child.parentId === p.id)
    return <div key={p.id}>
      {(!query || matches(p)) && <div className={`notebook-tree-row ${p.id === activeId ? 'is-current' : ''} ${over === p.id ? 'is-drop-target' : ''}`} style={{ paddingLeft: Math.min(depth, 5) * 14 }} draggable
        onDragStart={event => { event.dataTransfer.setData('text/ignis-page', p.id); event.dataTransfer.effectAllowed = 'move'; setDragging(p.id) }}
        onDragEnd={() => { setDragging(null); setOver(null) }}
        onDragOver={event => { if (dragging && dragging !== p.id) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setOver(p.id) } }}
        onDrop={event => { event.preventDefault(); event.stopPropagation(); const id = event.dataTransfer.getData('text/ignis-page'); if (id) move(id, p.id); setDragging(null); setOver(null) }}>
        <button className="notebook-tree-toggle" style={{ left: Math.min(depth, 5) * 14 + 4 }} aria-label={`${collapsed.has(p.id) ? 'Expand' : 'Collapse'} ${p.title || 'Untitled'}`} aria-expanded={!collapsed.has(p.id)} disabled={!children.length} onClick={() => setCollapsed(current => { const next = new Set(current); if (next.has(p.id)) next.delete(p.id); else next.add(p.id); return next })}><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true"><path d={collapsed.has(p.id) ? 'm6 4 4 4-4 4' : 'm4 6 4 4 4-4'} /></svg></button>
        <button className="notebook-page-link" aria-current={p.id === activeId ? 'page' : undefined} onClick={() => select(p.id)}>{p.icon ? <PageSymbol value={p.icon} /> : <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" aria-hidden="true"><path d="M5 2h7l3 3v13H5zM8 9h4m-4 3h4" /></svg>}<span className="truncate">{p.title.trim() || 'Untitled'}</span></button>
        <button className="notebook-tree-add" aria-label={`Add page inside ${p.title || 'Untitled'}`} onClick={() => add(p.id)}>+</button>
      </div>}
      {(!collapsed.has(p.id) || query) && children.map(child => row(child, depth + 1))}
    </div>
  }
  return <>
    <label className="notebook-search block"><span className="sr-only">Search pages and content</span><input id="notebook-page-search" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search pages…" /><kbd aria-hidden="true">⌘K</kbd></label>
    <div className="notebook-sidebar-shortcuts">
      <div className="notebook-sidebar-home" role="group" aria-label="Sidebar navigation" onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
        event.preventDefault()
        const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')], index = buttons.indexOf(event.target as HTMLButtonElement)
        buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length]?.focus()
      }}>
        <button id="notebook-tab-home" type="button" className="notebook-board-shortcut notebook-navigation-shortcut" aria-label="Home" title="Home" aria-pressed={shortcut === 'home'} aria-controls="notebook-home-panel" onClick={() => setShortcut('home')}><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m12 3 10 8h-3v10h-5v-7h-4v7H5V11H2z" /></svg><span className="notebook-sidebar-tab-label" aria-hidden="true"><span><span>Home</span></span></span></button>
      </div>
    </div>
    <div id="notebook-home-panel">
    {!query && live.some(p => p.favorite) && <section className="mt-5" aria-label="Favorite pages"><button type="button" className="notebook-sidebar-caption notebook-section-toggle" aria-expanded={favoritesOpen} aria-controls="notebook-favorites" onClick={() => setFavoritesOpen(open => !open)}>Favorites<Chevron open={favoritesOpen} /></button><div id="notebook-favorites" hidden={!favoritesOpen}>{live.filter(p => p.favorite).map(p => <button className={`notebook-favorite-link ${p.id === activeId ? 'is-current' : ''}`} key={p.id} onClick={() => select(p.id)}>{p.icon ? <PageSymbol value={p.icon} /> : <span aria-hidden="true">☆</span>}<span className="truncate">{p.title || 'Untitled'}</span></button>)}</div></section>}
    <div className="notebook-section-label"><button type="button" className="notebook-section-toggle" aria-expanded={privateOpen || !!query} aria-controls="notebook-private-pages" onClick={() => setPrivateOpen(open => !open)}>Private<Chevron open={privateOpen || !!query} /></button><button onClick={() => add(null)} aria-label="New top-level page">+</button></div>
    <nav id="notebook-private-pages" hidden={!privateOpen && !query} aria-label="Workspace pages" onDragOver={event => { if (dragging && event.target === event.currentTarget) event.preventDefault() }} onDrop={event => { if (event.target === event.currentTarget && dragging) { event.preventDefault(); move(dragging, null); setDragging(null); setOver(null) } }}>{live.filter(p => !p.parentId).map(p => row(p, 0))}</nav>
    {query && !live.some(matches) && <p className="notebook-no-results">No pages found.</p>}
    <button className="notebook-new w-full text-left" onClick={() => add(null)}>+ New page</button>
    </div>
  </>
}

function Chevron({ open }: { open: boolean }) { return <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true"><path d={open ? 'm4 6 4 4 4-4' : 'm6 4 4 4-4 4'} /></svg> }
