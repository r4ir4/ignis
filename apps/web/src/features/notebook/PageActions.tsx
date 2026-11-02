import { NotebookChevron } from './NotebookChevron'
import { useId, useLayoutEffect, useRef, useState } from 'react'
import { autoUpdate, computePosition, flip, offset, shift, size } from '@floating-ui/dom'
import { pageMarkdown } from './pageExport'
import { textOf, type Page } from './notebookModel'
type Props = { page: Page; pages: Page[]; update: (patch: Partial<Page>) => void; rename: () => void; duplicate: () => void; move: () => void; history: () => void; reminder: () => void; trash: () => void }
const paths = {
  link: 'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2',
  copy: 'M8 8h12v13H8zM4 16H2V2h13v2',
  star: 'm12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z',
  rename: 'm4 17 1-4L16 2l4 4L9 17zM3 21h18',
  move: 'M3 5h7l2 2h9v14H3zM8 14h8m-3-3 3 3-3 3',
  history: 'M3 11a9 9 0 1 1 2 7M3 4v7h7M12 7v5l3 2',
  reminder: 'M5 16h14l-2-3V8a5 5 0 0 0-10 0v5zM10 20h4',
  style: 'M3 20 9 4h3l6 16M5 15h11M20 6v14',
  export: 'M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5',
  lock: 'M5 10h14v11H5zM8 10V6a4 4 0 0 1 8 0v4M12 14v3',
  trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',
} as const
function Icon({ name }: { name: keyof typeof paths }) { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg> }
export function PageActions({ page, pages, update, ...actions }: Props) {
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [appearance, setAppearance] = useState(false)
  const [notice, setNotice] = useState('')
  useLayoutEffect(() => {
    if (!open || !trigger.current || !menu.current) return
    let live = true, focused = false
    const stop = autoUpdate(trigger.current, menu.current, () => {
      void computePosition(trigger.current!, menu.current!, { strategy: 'fixed', placement: 'bottom-end', middleware: [offset(6), flip({ padding: 12 }), shift({ padding: 12 }), size({ padding: 12, apply: ({ availableHeight, elements }) => { elements.floating.style.maxHeight = `${Math.max(0, availableHeight)}px` } })] }).then(({ x, y }) => { if (live && menu.current) { Object.assign(menu.current.style, { left: `${x}px`, top: `${y}px`, visibility: 'visible' }); if (!focused) { focused = true; menu.current.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true }) } } })
    })
    return () => { live = false; stop() }
  }, [open, appearance])
  function run(action: () => void) { menu.current?.hidePopover(); action() }
  async function copy(contents: boolean) {
    try {
      const url = new URL(location.href); url.hash = `page=${page.id}`
      await navigator.clipboard.writeText(contents ? pageMarkdown(page, pages) : url.href)
      setNotice(contents ? 'Page contents copied.' : 'Page link copied.')
    } catch { setNotice('Could not copy. Please try again.') }
  }
  function exportPage() {
    const url = URL.createObjectURL(new Blob([pageMarkdown(page, pages)], { type: 'text/markdown;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = `${(page.title.trim() || 'Untitled').replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 100) || 'Untitled'}.md`; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setNotice('Page exported as Markdown.')
  }
  const wordCount = textOf(page.content).trim().split(/\s+/).filter(Boolean).length
  return <>
    <button ref={trigger} type="button" className="notebook-page-actions-trigger" aria-label="Page actions" title="Page actions" popoverTarget={id} aria-haspopup="dialog" aria-expanded={open}>•••</button>
    <div id={id} ref={menu} popover="auto" role="dialog" aria-label="Page options" className="notebook-page-menu" onToggle={event => { setOpen(event.newState === 'open'); if (event.newState === 'closed') { setAppearance(false); setNotice('') } }}>
      {appearance ? <>
        <button type="button" className="notebook-menu-back" onClick={() => setAppearance(false)}>‹ Appearance & layout</button>
        <p className="notebook-menu-label">Font style</p>
        <div className="notebook-page-fonts" role="group" aria-label="Font style">{(['default', 'serif', 'mono'] as const).map(font => <button type="button" key={font} className={`page-font-${font}`} disabled={page.locked} aria-pressed={(page.font ?? 'default') === font} onClick={() => update({ font })}><span aria-hidden="true">Ag</span>{font === 'default' ? 'Default' : font === 'serif' ? 'Serif' : 'Mono'}</button>)}</div>
        <p className="notebook-menu-label">Appearance</p>
        <button type="button" disabled={page.locked} role="switch" aria-checked={!!page.smallText} onClick={() => update({ smallText: !page.smallText })}>Small text<span className="notebook-menu-switch" aria-hidden="true" /></button>
        <button type="button" disabled={page.locked} role="switch" aria-checked={page.fullWidth ?? true} onClick={() => update({ fullWidth: !(page.fullWidth ?? true) })}>Full width<span className="notebook-menu-switch" aria-hidden="true" /></button>
      </> : <>
        <button type="button" onClick={() => void copy(false)}><Icon name="link" />Copy link</button>
        <button type="button" onClick={() => void copy(true)}><Icon name="copy" />Copy page contents</button>
        <button type="button" onClick={() => run(() => update({ favorite: !page.favorite }))}><Icon name="star" />{page.favorite ? 'Remove from favorites' : 'Add to favorites'}</button>
        <hr />
        <button type="button" disabled={page.locked} onClick={() => run(actions.rename)}><Icon name="rename" />Rename</button>
        <button type="button" onClick={() => run(actions.duplicate)}><Icon name="copy" />Duplicate</button>
        <button type="button" onClick={() => run(actions.move)}><Icon name="move" />Move to</button>
        <button type="button" onClick={() => run(actions.history)}><Icon name="history" />Version history</button>
        <button type="button" onClick={() => run(actions.reminder)}><Icon name="reminder" />Remind me</button>
        <hr />
        <button type="button" onClick={() => { setNotice(''); setAppearance(true) }}><Icon name="style" />Appearance & layout<span className="notebook-menu-chevron"><NotebookChevron direction="right" /></span></button>
        <button type="button" onClick={exportPage}><Icon name="export" />Export page<span className="notebook-menu-shortcut">Markdown</span></button>
        <hr />
        <button type="button" role="switch" aria-checked={!!page.locked} onClick={() => run(() => update({ locked: !page.locked }))}><Icon name="lock" />Lock page<span className="notebook-menu-switch" aria-hidden="true" /></button>
        <button type="button" className="notebook-menu-danger" onClick={() => run(actions.trash)}><Icon name="trash" />Move to Trash</button>
        <p className="notebook-menu-footer">{wordCount} {wordCount === 1 ? 'word' : 'words'}</p>
      </>}
      {notice && <p className="notebook-menu-notice" role="status">{notice}</p>}
    </div>
  </>
}
