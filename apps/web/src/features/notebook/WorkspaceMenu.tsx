import { IgnisFlame } from './IgnisFlame'
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { autoUpdate, computePosition, flip, offset, shift, size } from '@floating-ui/dom'

const PREFERENCES = 'ignis.notebook.preferences.v1'
function preferences() {
  try { const value = JSON.parse(localStorage.getItem(PREFERENCES) || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {} } catch { return {} }
}
function initialName() {
  try {
    const name = preferences().name
    return typeof name === 'string' && name.trim() ? name : 'Ignis notebook'
  } catch { return 'Ignis notebook' }
}

function Icon({ kind }: { kind: 'settings' | 'download' | 'watch' | 'notes' | 'check' | 'chevron' | 'trash' }) {
  const paths = {
    trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',
    settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M10 3h4l.6 2.4 2 .9 2.2-.7 2 3.4-1.7 1.8v2.4l1.7 1.8-2 3.4-2.2-.7-2 .9L14 21h-4l-.6-2.4-2-.9-2.2.7-2-3.4 1.7-1.8v-2.4L3.2 9l2-3.4 2.2.7 2-.9Z',
    download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
    watch: 'M4 4h16v16H4zM10 8l6 4-6 4z',
    notes: 'M5 3h11l3 3v15H5zM9 10h6m-6 4h6',
    check: 'm5 12 4 4L19 6',
    chevron: 'm7 10 5 5 5-5',
  }
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[kind]} /></svg>
}

export function WorkspaceMenu({ isLocal, backup, openRecovery, openTrash }: { openTrash?: () => void; isLocal: boolean; backup: () => void; openRecovery?: () => void }) {
  const [name, setName] = useState(initialName)
  const [draftName, setDraftName] = useState(name)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const settings = useRef<HTMLDialogElement>(null)

  useLayoutEffect(() => {
    const button = trigger.current, popover = menu.current
    if (!open || !button || !popover) return
    let live = true
    let positioned = false
    const stop = autoUpdate(button, popover, () => {
      void computePosition(button, popover, { strategy: 'fixed', placement: 'top-start', middleware: [offset(8), flip({ padding: 12 }), shift({ padding: 12 }), size({ padding: 12, apply: ({ availableHeight, elements }) => { elements.floating.style.maxHeight = `${Math.max(0, availableHeight)}px` } })] })
        .then(({ x, y }) => {
          if (!live) return
          Object.assign(popover.style, { left: `${x}px`, top: `${y}px`, visibility: 'visible' })
          if (!positioned) { positioned = true; popover.querySelector<HTMLElement>('[role^="menuitem"]')?.focus({ preventScroll: true }) }
        })
    })
    return () => { live = false; stop(); popover.style.visibility = 'hidden' }
  }, [open])

  function dismiss() { menu.current?.hidePopover(); trigger.current?.focus({ preventScroll: true }) }
  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Tab') { menu.current?.hidePopover(); return }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const items = Array.from(menu.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])
    const current = items.indexOf(document.activeElement as HTMLElement)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
    items[next]?.focus()
  }
  function openSettings() { dismiss(); setDraftName(name); setError(''); settings.current?.showModal() }
  const links = [
    { href: isLocal ? '/watch' : 'https://watch.ignis.farm', label: 'Watch', icon: 'watch' as const },
  ]

  return <div className="notebook-workspace">
    <div className="notebook-workspace-footer">
    <button ref={trigger} type="button" className="notebook-workspace-trigger" popoverTarget="notebook-workspace-menu" aria-haspopup="menu" aria-expanded={open} aria-label={`Workspace menu: ${name}`}>
      <span className="notebook-workspace-avatar" aria-hidden="true"><IgnisFlame /></span><span className="truncate">{name}</span><Icon kind="chevron" />
    </button>
    <button type="button" className="notebook-workspace-tools" popoverTarget="notebook-workspace-menu" title="Tools and settings" aria-label="Tools and settings" aria-haspopup="menu" aria-expanded={open}><svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><rect x="3" y="3" width="5" height="5" rx="1.5" /><rect x="12" y="3" width="5" height="5" rx="1.5" /><rect x="3" y="12" width="5" height="5" rx="1.5" /><rect x="12" y="12" width="5" height="5" rx="1.5" /></svg></button>
    </div>
    <div ref={menu} id="notebook-workspace-menu" popover="auto" role="menu" aria-label="Workspace" className="notebook-workspace-menu" onToggle={event => setOpen(event.newState === 'open')} onKeyDown={keyboard}>
      <button type="button" role="menuitemradio" aria-checked="true" onClick={dismiss} className="notebook-workspace-current"><span className="notebook-workspace-avatar" aria-hidden="true"><IgnisFlame /></span><span className="min-w-0"><strong className="block truncate">{name}</strong><span className="notebook-workspace-caption">Personal notebook</span></span><Icon kind="check" /></button>
      <hr role="separator" />
      <button type="button" role="menuitem" onClick={() => openSettings()}><Icon kind="settings" />Settings</button>
      <button type="button" role="menuitem" onClick={() => { dismiss(); backup() }}><Icon kind="download" />Download backup</button>
      {openTrash && <button type="button" role="menuitem" onClick={() => { dismiss(); openTrash() }}><Icon kind="trash" />Trash</button>}
      {openRecovery && <button type="button" role="menuitem" onClick={() => { dismiss(); openRecovery() }}><Icon kind="notes" />Browser recovery</button>}
      <hr role="separator" />
      <p className="notebook-workspace-eyebrow">Ignis tools</p>
      {links.map(link => <a role="menuitem" key={link.href} href={link.href}><Icon kind={link.icon} />{link.label}<span className="notebook-workspace-external" aria-hidden="true">↗</span></a>)}
    </div>
    <dialog ref={settings} className="notebook-settings" aria-labelledby="notebook-settings-title" onClose={() => trigger.current?.focus({ preventScroll: true })}>
      <form onSubmit={event => {
        event.preventDefault()
        const next = draftName.trim()
        if (!next) { setError('Give your notebook a name.'); return }
        try { localStorage.setItem(PREFERENCES, JSON.stringify({ ...preferences(), name: next })); setName(next); settings.current?.close() }
        catch { setError('The browser could not save this setting. Your notebook pages are unchanged.') }
      }}>
        <h2 id="notebook-settings-title">Notebook settings</h2>
        <label htmlFor="notebook-workspace-name">Workspace name</label>
        <input id="notebook-workspace-name" value={draftName} maxLength={60} required onChange={event => setDraftName(event.target.value)} />
        <p>This name is saved in this browser. {isLocal ? 'Pages save to the local Ignis database on this Mac.' : 'Pages save to your private Ignis cloud database after sign-in.'} A browser recovery copy protects changes while saving.</p>
        {error && <p role="alert" className="notebook-settings-error">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2 mt-6"><button type="button" onClick={() => settings.current?.close()}>Cancel</button><button className="notebook-settings-save" type="submit">Save changes</button></div>
      </form>
    </dialog>
  </div>
}
