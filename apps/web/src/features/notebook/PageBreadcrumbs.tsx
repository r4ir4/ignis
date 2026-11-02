import { Fragment } from 'react'
import type { Page } from './notebookModel'
import { PageSymbol } from './PageSymbol'
import { PropertyPopover } from './TaskPropertyControls'
import { pageTrail } from './breadcrumbModel'
export function PageBreadcrumbs({ pages, page, select }: { pages: Page[]; page: Page | undefined; select: (id: string) => void }) {
  if (!page) return null
  const trail = pageTrail(pages, page), collapsed = trail.length > 3
  const visible = collapsed ? [trail[0], null, ...trail.slice(-2)] : trail
  return <nav className="notebook-page-trail" aria-label="Breadcrumb">{visible.map((item, index) => <Fragment key={item?.id || 'overflow'}>{index > 0 && <span className="notebook-trail-slash" aria-hidden="true">/</span>}{item ? <a className="notebook-trail-page" href={`#page=${item.id}`} aria-current={item.id === page.id ? 'page' : undefined} title={item.title.trim() || 'Untitled'} onClick={event => { event.preventDefault(); select(item.id) }}>{item.icon && <PageSymbol value={item.icon} />}<span>{item.title.trim() || 'Untitled'}</span></a> : <PropertyPopover label="Show parent pages" trigger={<span aria-hidden="true">•••</span>}>{close => <div className="notebook-trail-ancestors">{trail.slice(1, -2).map(parent => <button type="button" key={parent.id} className="notebook-property-menu-row" onClick={() => { close(); select(parent.id) }}><PageSymbol value={parent.icon || 'icon:file'} /><span>{parent.title.trim() || 'Untitled'}</span></button>)}</div>}</PropertyPopover>}</Fragment>)}{trail.length === 1 && <span className="notebook-trail-private"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 7V5a3 3 0 0 1 6 0v2M4 7h8v7H4Z" /></svg>Private</span>}</nav>
}
