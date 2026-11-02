import { Children, Fragment, isValidElement, useEffect, useId, useRef, useState, type ReactNode, type SelectHTMLAttributes } from 'react'
import './dropdown.css'

type Choice = { value: string; label: ReactNode; text: string; disabled: boolean }
type Props = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'multiple' | 'size'> & { onValueChange: (value: string) => void }
function text(node: ReactNode): string {
  return Children.toArray(node).map(child => isValidElement<{ children?: ReactNode }>(child) ? text(child.props.children) : String(child ?? '')).join('')
}
function choices(nodes: ReactNode, disabled = false): Choice[] {
  return Children.toArray(nodes).flatMap(node => {
    if (!isValidElement<{ children?: ReactNode; value?: string | number; disabled?: boolean }>(node)) return []
    if (node.type === 'option') return [{ value: String(node.props.value ?? text(node.props.children)), label: node.props.children, text: text(node.props.children), disabled: disabled || !!node.props.disabled }]
    if (node.type === Fragment || node.type === 'optgroup') return choices(node.props.children, disabled || !!node.props.disabled)
    return []
  })
}
/** Shared single-choice menu. Native popovers keep it above dialogs and support light dismissal. */
export function Dropdown({ children, value, defaultValue, onValueChange, disabled, required, name, id, className = '', style, 'aria-label': label, 'aria-labelledby': labelledBy, ...rest }: Props) {
  const uid = useId(), panel = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null)
  const [local, setLocal] = useState(String(defaultValue ?? '')), [open, setOpen] = useState(false)
  const options = choices(children), selected = String(value ?? local), current = options.find(option => option.value === selected) || options[0]
  const openingFocus = useRef<'first' | 'last' | 'selected'>('selected')
  const search = useRef({ value: '', at: 0 })
  function position() {
    const menu = panel.current, rect = trigger.current?.getBoundingClientRect()
    if (!menu || !rect) return
    const below = window.innerHeight - rect.bottom - 12, above = rect.top - 12
    const up = below < Math.min(200, menu.scrollHeight) && above > below
    menu.style.width = `${Math.min(Math.max(rect.width, 160), window.innerWidth - 16)}px`
    menu.style.maxHeight = `${Math.max(64, Math.min(300, up ? above : below))}px`
    menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - menu.offsetWidth - 8))}px`
    menu.style.top = `${up ? Math.max(8, rect.top - menu.offsetHeight - 5) : rect.bottom + 5}px`
  }
  useEffect(() => {
    if (!open) return
    window.addEventListener('resize', position); window.addEventListener('scroll', position, true)
    return () => { window.removeEventListener('resize', position); window.removeEventListener('scroll', position, true) }
  }, [open])
  function close(focus = true) { panel.current?.hidePopover(); if (focus) trigger.current?.focus() }
  function focusOption(which: 'first' | 'last' | 'selected' = 'selected') {
    const rows = [...(panel.current?.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled)') || [])]
    const row = which === 'last' ? rows.at(-1) : which === 'selected' ? rows.find(row => row.getAttribute('aria-selected') === 'true') || rows[0] : rows[0]
    row?.focus({ preventScroll: true }); row?.scrollIntoView({ block: 'nearest' })
  }
  return <span className="ignis-dropdown">
    <button ref={trigger} id={id} type="button" role="combobox" aria-label={label} aria-labelledby={labelledBy} aria-describedby={rest['aria-describedby']} aria-required={required || undefined} aria-expanded={open} aria-haspopup="listbox" aria-controls={`${uid}-menu`} disabled={disabled} className={`ignis-dropdown-trigger ${className}`} style={style} popoverTarget={`${uid}-menu`} onKeyDown={event => {
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) { event.preventDefault(); openingFocus.current = event.key === 'ArrowUp' || event.key === 'End' ? 'last' : event.key === 'Home' ? 'first' : 'selected'; panel.current?.showPopover(); position(); focusOption(openingFocus.current) }
    }}><span className="ignis-dropdown-value">{current?.label || 'Choose…'}</span><svg className="ignis-dropdown-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="m4.5 6 3.5 3.5L11.5 6" /></svg></button>
    {(name || required) && <input className="ignis-dropdown-validation" tabIndex={-1} aria-hidden="true" name={name} required={required} disabled={disabled} value={current?.value ?? ''} onChange={() => {}} onInvalid={event => { event.preventDefault(); trigger.current?.focus() }} />}
    <div ref={panel} id={`${uid}-menu`} className="ignis-dropdown-menu" popover="auto" role="listbox" aria-label={label || 'Options'} onToggle={event => {
      if (event.target !== event.currentTarget) return
      const visible = event.newState === 'open'; setOpen(visible)
      if (visible) { position(); focusOption(openingFocus.current); openingFocus.current = 'selected' }
    }} onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return }
      if (event.key === 'Tab') { close(); return }
      const rows = [...(panel.current?.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled)') || [])], index = rows.indexOf(event.target as HTMLButtonElement)
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length
        rows[next]?.focus(); return
      }
      if (event.key.length === 1 && event.key !== ' ' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault(); const now = Date.now(); search.current = { value: (now - search.current.at < 650 ? search.current.value : '') + event.key.toLowerCase(), at: now }
        rows.find(row => row.textContent?.trim().toLowerCase().startsWith(search.current.value))?.focus()
      }
    }}>{options.map((option, index) => <button key={`${option.value}-${index}`} type="button" role="option" aria-selected={option.value === selected || !options.some(entry => entry.value === selected) && option === current} disabled={option.disabled} className="ignis-dropdown-option" onClick={() => { setLocal(option.value); onValueChange(option.value); close() }}><span>{option.label}</span><svg viewBox="0 0 16 16" aria-hidden="true" style={{ visibility: option === current ? 'visible' : 'hidden' }}><path d="m3.5 8 3 3 6-6" /></svg></button>)}</div>
  </span>
}
