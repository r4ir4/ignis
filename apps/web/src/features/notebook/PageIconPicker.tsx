import { iconColors, iconParts, coloredIcon, type IconColor } from './pageSymbols'
import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { autoUpdate, computePosition, flip, offset, shift, size } from '@floating-ui/dom'
import { PageSymbol, pageEmojis, pageIcons, isPageEmoji } from './PageSymbol'

export function PageIconPicker({ value, onChange, readOnly = false, kind = 'page' }: { kind?: 'page' | 'callout'; readOnly?: boolean; value?: string | null; onChange: (value: string | null) => void }) {
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const picker = useRef<HTMLDivElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'emojis' | 'icons'>('emojis')
  const [query, setQuery] = useState('')
  const [custom, setCustom] = useState('')
  const [color, setColor] = useState<IconColor>(() => value?.startsWith('icon:') ? iconParts(value).color.id : 'default')
  const [colorsOpen, setColorsOpen] = useState(false)
  const matches = tab === 'emojis'
    ? pageEmojis.map(([emoji, label]) => ({ value: `emoji:${emoji}`, label }))
    : pageIcons.map(icon => ({ value: coloredIcon(icon.id, color), label: icon.name }))
  const choices = matches.filter(item => item.label.toLowerCase().includes(query.trim().toLowerCase()) || tab === 'emojis' && item.value.includes(query.trim()))

  useLayoutEffect(() => {
    const button = trigger.current, popover = picker.current
    if (!open || !button || !popover) return
    let live = true, focused = false
    const stop = autoUpdate(button, popover, () => {
      void computePosition(button, popover, { strategy: 'fixed', placement: 'bottom-start', middleware: [offset(8), flip({ padding: 12 }), shift({ padding: 12 }), size({ padding: 12, apply: ({ availableHeight, elements }) => { elements.floating.style.maxHeight = `${Math.max(0, Math.min(440, availableHeight))}px` } })] }).then(({ x, y }) => {
        if (!live) return
        Object.assign(popover.style, { left: `${x}px`, top: `${y}px`, visibility: 'visible' })
        if (!focused) { focused = true; search.current?.focus({ preventScroll: true }) }
      })
    })
    return () => { live = false; stop(); popover.style.visibility = 'hidden' }
  }, [open])
  function choose(next: string | null) { onChange(next); picker.current?.hidePopover(); trigger.current?.focus({ preventScroll: true }) }
  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button'))
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
    if (current < 0) return
    const columns = getComputedStyle(event.currentTarget).gridTemplateColumns.split(' ').length
    const step = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' ? -columns : columns
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + step + buttons.length) % buttons.length
    event.preventDefault(); buttons[next]?.focus()
  }
  if (readOnly) return value ? <div className="notebook-page-icon-area has-icon"><span className="notebook-page-icon-static"><PageSymbol value={value} /></span></div> : null
  return <div className={`notebook-page-icon-area ${value ? 'has-icon' : ''}`}>
    <button ref={trigger} type="button" className="notebook-page-icon-trigger" popoverTarget={id} aria-haspopup="dialog" aria-expanded={open} aria-label={`${value ? 'Change' : 'Add'} ${kind} icon`}>{value ? <PageSymbol value={value} /> : <><span aria-hidden="true">{kind === 'callout' ? '＋' : '☺'}</span>{kind === 'page' && ' Add icon'}</>}</button>
    <div ref={picker} id={id} popover="auto" role="dialog" aria-label={kind === 'page' ? 'Page icon' : 'Callout icon'} className="notebook-symbol-picker notebook-page-icon-picker" onToggle={event => { setOpen(event.newState === 'open'); if (event.newState === 'closed') { setQuery(''); setCustom(''); setColorsOpen(false) } else if (value?.startsWith('icon:')) setColor(iconParts(value).color.id) }}>
      <div className="notebook-symbol-tabs" role="group" aria-label="Icon type">
        <button type="button" aria-pressed={tab === 'emojis'} onClick={() => { setTab('emojis'); setQuery(''); setColorsOpen(false); search.current?.focus() }}>Emojis</button>
        <button type="button" aria-pressed={tab === 'icons'} onClick={() => { setTab('icons'); setQuery(''); search.current?.focus() }}>Icons</button>
        {value && <button type="button" className="notebook-remove-icon" onClick={() => choose(null)}>Remove</button>}
      </div>
      <div className="notebook-symbol-search-row"><input ref={search} type="search" aria-label={`Search ${kind} icons`} placeholder={tab === 'emojis' ? 'Search emojis…' : 'Search icons…'} value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); picker.current?.querySelector<HTMLButtonElement>('.notebook-symbol-grid button')?.focus() } }} />
      {tab === 'icons' && <button type="button" className="notebook-icon-color-trigger" aria-label="Select icon color" aria-expanded={colorsOpen} title="Select icon color" onClick={() => setColorsOpen(value => !value)}><span style={{ background: iconColors.find(option => option.id === color)?.value || '#9b9b9b' }} /></button>}</div>
      {tab === 'icons' && colorsOpen && <div className="notebook-icon-colors" role="group" aria-label="Icon colors">{iconColors.map(option => <button key={option.id} type="button" aria-label={`${option.name} icon color`} aria-pressed={color === option.id} title={option.name} onClick={() => { setColor(option.id); setColorsOpen(false); if (value?.startsWith('icon:')) onChange(coloredIcon(iconParts(value).id, option.id)); search.current?.focus() }}><span style={{ background: option.value || '#9b9b9b' }} />{color === option.id && <i aria-hidden="true">✓</i>}</button>)}</div>}
      <div className="notebook-symbol-scroll"><div className="notebook-symbol-grid" role="group" aria-label={tab === 'emojis' ? 'Emojis' : 'Icons'} onKeyDown={keyboard}>
        {choices.map(item => <button key={item.value} type="button" title={item.label} aria-label={item.label} aria-pressed={value === item.value} onClick={() => choose(item.value)}><PageSymbol value={item.value} /></button>)}
      </div>
      {!choices.length && <p className="notebook-icon-empty">No matching {tab}.</p>}</div>
      {tab === 'emojis' && <div className="notebook-custom-emoji"><input aria-label="Custom emoji" placeholder="Or paste any emoji" maxLength={20} value={custom} onChange={event => setCustom(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && isPageEmoji(custom.trim())) choose(`emoji:${custom.trim()}`) }} /><button type="button" disabled={!isPageEmoji(custom.trim())} onClick={() => choose(`emoji:${custom.trim()}`)}>Use emoji</button></div>}
    </div>
  </div>
}
