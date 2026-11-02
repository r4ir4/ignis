import { TaskPropertyRows } from './TaskPropertyRows'
import { statusGroups, type StatusGroup } from './statusGroups'
import { optionPalette, type OptionColor } from './optionPalette'
import { NumberDisplaySettings, NumberPropertyValue } from './NumberProperty'
import type { NumberDisplay } from './numberDisplay'
import { propertyShown, taskPropertyEntries, type PropertyDisplayPatch, type PropertyVisibility } from './propertyDisplay'
import { AdvancedPropertyValue, PropertyConfiguration } from './AdvancedTaskProperties'
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { calendarDays } from './viewModel'
import { boardStatusGroup, boardColumn, type BoardColumns } from './boardColumns'
import { propertyStatusGroup, orderedPropertyOptions, reorderPropertyOption, validPropertyDate, newTaskProperty, propertyTypes, propertyTypeNames, planTaskPropertyChange, automaticPropertyTypes, computedProperty, type PropertyMenuAction, type PropertyDefinition, type PropertyValue } from './taskProperties'
import type { PersonalList, PersonalItem } from './personalLists'

const typeNames = propertyTypeNames
export function PropertyIcon({ type }: { type: string }) {
  const paths: Record<string, string> = { board: 'M3 4h14v12H3ZM7 4v12M13 4v12', visibility: 'M2 10s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5ZM10 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z', filter: 'M3 5h14M5 10h10M8 15h4', sort: 'M5 3v14m-3-3 3 3 3-3M12 17V3m-3 3 3-3 3 3', text: 'M4 5h12M10 5v12M7 17h6', number: 'M8 3 6 17M14 3l-2 14M3 8h14M2 13h14', select: 'm5 8 5 5 5-5', 'multi-select': 'M3 5h14M3 10h14M3 15h14', date: 'M4 5h12v12H4ZM7 3v4M13 3v4M4 9h12', checkbox: 'M4 4h12v12H4Zm3 6 2 2 4-5', url: 'm8 12 4-4M7 7l2-2a4 4 0 0 1 6 6l-2 2M7 7l-2 2a4 4 0 0 0 6 6l2-2', email: 'M3 5h14v11H3Zm0 0 7 6 7-6', phone: 'M5 3 3 5c0 6 6 12 12 12l2-2-4-3-2 2-5-5 2-2Z', person: 'M10 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM4 17v-2a6 6 0 0 1 12 0v2', files: 'M5 3h7l4 4v10H5ZM12 3v5h4', formula: 'M5 17 9 3h7M4 8h10', relation: 'M3 10h14m-5-5 5 5-5 5', rollup: 'M3 4h14L9 10l8 6H3', 'created-time': 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM10 6v4l3 2', 'edited-time': 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM10 6v4l3 2', 'created-by': 'M10 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM4 17v-2a6 6 0 0 1 12 0v2', 'edited-by': 'M10 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM4 17v-2a6 6 0 0 1 12 0v2', button: 'M3 5h14v10H3Zm6 3 4 2-4 2Z', place: 'M10 18S4 11 4 7a6 6 0 0 1 12 0c0 4-6 11-6 11ZM10 5a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z', id: 'M3 5h14M3 15h14M7 3v14M13 3v14', status: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm0 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z' }
  return <svg className="notebook-property-icon" viewBox="0 0 20 20" aria-hidden="true"><path d={paths[type] || paths.text} /></svg>
}
export function PropertyPopover({ label, trigger, children, disabled = false, className = '', onDismiss }: { onDismiss?: () => void; label: string; trigger: ReactNode; children: (close: () => void) => ReactNode; disabled?: boolean; className?: string }) {
  const [epoch, setEpoch] = useState(0)
  const id = useId(), panel = useRef<HTMLDivElement>(null), button = useRef<HTMLButtonElement>(null)
  function position() { const el = panel.current, rect = button.current?.getBoundingClientRect(); if (!el || !rect) return; el.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - el.offsetWidth - 8))}px`; el.style.top = `${Math.max(8, Math.min(rect.bottom + 5, window.innerHeight - el.offsetHeight - 8))}px` }
  useEffect(() => { const update = () => { if (panel.current?.matches(':popover-open')) position() }; window.addEventListener('resize', update); window.addEventListener('scroll', update, true); return () => { window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true) } }, [])
  useLayoutEffect(() => { if (epoch) { position(); (label.startsWith('Edit property ') ? panel.current : panel.current?.querySelector<HTMLElement>('input:not([hidden]):not(:disabled):not(.ignis-dropdown-validation)') || panel.current?.querySelector<HTMLElement>('button:not(:disabled)'))?.focus({ preventScroll: true }) } }, [epoch])
  useEffect(() => { const observer = new ResizeObserver(() => { if (panel.current?.matches(':popover-open')) position() }); if (panel.current) observer.observe(panel.current); return () => observer.disconnect() }, [])
  const close = () => { panel.current?.hidePopover(); button.current?.focus({ preventScroll: true }) }
  return <><button ref={button} type="button" disabled={disabled} className={`notebook-property-trigger ${className}`} popoverTarget={id} aria-label={label} aria-haspopup="dialog">{trigger}</button><div ref={panel} id={id} popover="auto" role="dialog" tabIndex={-1} aria-label={label} className="notebook-property-popover" onToggle={event => { if (event.target !== event.currentTarget) return; if (event.newState === 'open') { position(); setEpoch(value => value + 1) } else onDismiss?.() }} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close() } else if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key) && (event.target as HTMLElement).getAttribute('role') === 'option') { const options = [...(panel.current?.querySelectorAll<HTMLButtonElement>('[role=option]') || [])], index = options.indexOf(event.target as HTMLButtonElement); event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length; options[next]?.focus() } }}><div key={epoch}>{children(close)}</div></div></>
}
function StatusPill({ name, color }: { name: string; color: OptionColor }) {
  const palette = optionPalette.find(entry => entry.id === color) || optionPalette[0]
  return <span className="notebook-status-pill" style={{ backgroundColor: palette.background, color: palette.text }}><i aria-hidden="true" />{name}</span>
}
export function TaskStatusPicker({ value, statuses, columns, disabled, change }: { value: PersonalItem['status']; statuses: PersonalItem['status'][]; columns?: BoardColumns | null; disabled: boolean; change: (value: PersonalItem['status']) => void }) {
  const [query, setQuery] = useState('')
  const column = boardColumn(value, columns)
  return <PropertyPopover label="Item status" onDismiss={() => setQuery('')} disabled={disabled} trigger={<StatusPill name={column.name} color={column.color} />}>{close => <div className="notebook-status-picker"><input aria-label="Search statuses" placeholder="Search for a status…" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); event.currentTarget.parentElement?.querySelector<HTMLButtonElement>('[role=option]')?.focus() } if (event.key === 'Enter') { const match = statuses.find(id => boardColumn(id, columns).name.toLowerCase().includes(query.toLowerCase())); if (match) { event.preventDefault(); change(match); close() } } }} /><div role="listbox" aria-label="Task status">{statusGroups.map(group => <div key={group.id} role="group" aria-label={group.label}><p className="notebook-property-caption">{group.label}</p>{statuses.filter(id => boardStatusGroup(id, columns) === group.id && boardColumn(id, columns).name.toLowerCase().includes(query.toLowerCase())).map(id => <button key={id} type="button" className="notebook-property-menu-row" role="option" aria-selected={value === id} onClick={() => { change(id); close() }}><StatusPill name={boardColumn(id, columns).name} color={boardColumn(id, columns).color} />{value === id && <span className="notebook-option-color-check">✓</span>}</button>)}</div>)}</div></div>}</PropertyPopover>
}

export function TaskDatePicker({ value, change, label = 'Date', disabled = false }: { value: string | null; change: (value: string | null) => void; label?: string; disabled?: boolean }) {
  const [month, setMonth] = useState(() => value ? new Date(`${value}T12:00:00`) : new Date()), [draft, setDraft] = useState(value || ''), [error, setError] = useState('')
  useEffect(() => { setDraft(value || ''); if (value) setMonth(new Date(`${value}T12:00:00`)) }, [value])
  const pretty = value ? new Date(`${value}T12:00:00`).toLocaleDateString('en', { month: 'long', day: 'numeric', year: 'numeric' }) : 'Empty'
  return <PropertyPopover label={label} disabled={disabled} trigger={<span className={!value ? 'is-empty' : ''}>{pretty}</span>}>{close => <div className="notebook-task-calendar"><input aria-label={`${label} input`} placeholder="YYYY-MM-DD" value={draft} onChange={event => { setDraft(event.target.value); setError('') }} onBlur={() => { if (draft && validPropertyDate(draft) && draft !== value) change(draft) }} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); if (!draft || validPropertyDate(draft)) { change(draft || null); close() } else setError('Use a valid date: YYYY-MM-DD.') } }} /><div className="notebook-calendar-navigation"><strong>{month.toLocaleDateString('en', { month: 'long', year: 'numeric' })}</strong><button type="button" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1, 12))}>‹</button><button type="button" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1, 12))}>›</button></div><div className="notebook-date-grid" onKeyDown={event => { if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return; const days = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')], index = days.indexOf(event.target as HTMLButtonElement); if (index < 0) return; event.preventDefault(); const next = event.key === 'Home' ? index - index % 7 : event.key === 'End' ? index + 6 - index % 7 : index + (event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' ? -7 : 7); days[Math.max(0, Math.min(days.length - 1, next))]?.focus() }}>{['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(day => <span key={day}>{day}</span>)}{calendarDays(month).map(day => <button key={day} type="button" className={Number(day.slice(5, 7)) !== month.getMonth() + 1 ? 'is-other-month' : ''} aria-label={day} aria-pressed={value === day} onClick={() => { change(day); close() }}>{Number(day.slice(-2))}</button>)}</div>{error && <p role="alert">{error}</p>}<div className="notebook-date-footer"><button type="button" onClick={() => { const now = new Date(); change(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`); close() }}>Today</button><button type="button" onClick={() => { change(null); close() }}>Clear date</button></div></div>}</PropertyPopover>
}
function AddPropertyMenu({ definitions, create, close }: { definitions: PropertyDefinition[]; create: (property: PropertyDefinition) => string | void; close: () => void }) {
  const [name, setName] = useState(''), [query, setQuery] = useState(''), [searching, setSearching] = useState(false), [error, setError] = useState('')
  const search = useRef<HTMLInputElement>(null), menu = useRef<HTMLDivElement>(null)
  const types = propertyTypes.filter(type => typeNames[type].toLowerCase().includes(query.trim().toLowerCase()))
  useEffect(() => { if (searching) search.current?.focus() }, [searching])
  function choose(type: PropertyDefinition['type']) {
    const next = newTaskProperty(definitions, type, name)
    if (typeof next === 'string') { setError(next); return }
    const issue = create(next)
    if (issue) { setError(issue); return }
    close()
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-property-id="${next.id}"] .notebook-task-value :is(input, button)`)?.focus({ preventScroll: true }))
  }
  return <div className="notebook-add-property-menu"><div className="notebook-property-name-entry"><PropertyIcon type="text" /><input aria-label="Property name" placeholder="Property name" maxLength={60} value={name} onChange={event => { setName(event.target.value); setError('') }} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); choose(types[0] || 'text') } if (event.key === 'ArrowDown') { event.preventDefault(); menu.current?.querySelector<HTMLButtonElement>('button')?.focus() } }} /></div><div className="notebook-property-type-heading"><span>Type</span><button type="button" aria-label="Search types" title="Search types…" onClick={() => setSearching(value => !value)}><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8" cy="8" r="4.5" /><path d="m12 12 4 4" /></svg></button></div>{searching && <input ref={search} className="notebook-property-type-search" aria-label="Search property types" placeholder="Search types…" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && types[0]) { event.preventDefault(); choose(types[0]) } if (event.key === 'ArrowDown') { event.preventDefault(); menu.current?.querySelector<HTMLButtonElement>('button')?.focus() } }} />}<div ref={menu} role="menu" aria-label="Property types" className="notebook-property-types" onKeyDown={event => { if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return; const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')], index = buttons.indexOf(event.target as HTMLButtonElement); event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length; buttons[next]?.focus() }}>{types.map(type => <button type="button" role="menuitem" key={type} onClick={() => choose(type)}><PropertyIcon type={type} />{typeNames[type]}</button>)}</div>{!types.length && <p className="notebook-property-caption">No matching types</p>}{error && <p role="alert">{error}</p>}</div>
}
function optionColor(definition: PropertyDefinition, option: string) { const colors = definition.config?.optionColors; return colors && Object.hasOwn(colors, option) ? colors[option] : definition.type === 'status' ? statusGroups.find(group => group.id === propertyStatusGroup(definition, option))!.color : 'default' }
function optionStyle(definition: PropertyDefinition, option: string) {
  const color = optionPalette.find(color => color.id === (optionColor(definition, option)))!
  return { backgroundColor: color.background, color: color.text }
}
function withNewOption(definition: PropertyDefinition, option: string, group: StatusGroup = 'todo'): PropertyDefinition {
  const color = definition.type === 'status' ? statusGroups.find(entry => entry.id === group)!.color : optionPalette[1 + definition.options.length % (optionPalette.length - 1)].id as Exclude<OptionColor, 'default'>
  return { ...definition, options: [...definition.options, option], config: { ...definition.config, ...(definition.type === 'status' ? { statusGroups: { ...definition.config?.statusGroups, [option]: group } } : {}), optionColors: { ...definition.config?.optionColors, [option]: color } } }
}
function OptionSettings({ definition, option, save, action, back, anchor, renamed }: { definition: PropertyDefinition; option: string; save: (property: PropertyDefinition) => string | void; action?: (action: PropertyMenuAction) => string | void; back: () => void; anchor: HTMLElement | null; renamed: (name: string) => void }) {
  const [name, setName] = useState(option), [error, setError] = useState(''), [confirm, setConfirm] = useState(false)
  const panel = useRef<HTMLDivElement>(null), origin = useRef(anchor?.getBoundingClientRect())
  useLayoutEffect(() => {
    const el = panel.current
    if (!el) return
    const position = () => {
      const rect = anchor?.isConnected ? anchor.getBoundingClientRect() : origin.current
      if (!rect) return
      const right = rect.right + 6, left = rect.left - el.offsetWidth - 6
      el.style.left = `${Math.max(8, Math.min(right + el.offsetWidth <= window.innerWidth - 8 ? right : left >= 8 ? left : window.innerWidth - el.offsetWidth - 8, window.innerWidth - el.offsetWidth - 8))}px`
      el.style.top = `${Math.max(8, Math.min(rect.top, window.innerHeight - el.offsetHeight - 8))}px`
    }
    el.showPopover(); position(); el.querySelector('input')?.focus({ preventScroll: true })
    const observer = new ResizeObserver(position); observer.observe(el)
    window.addEventListener('resize', position); window.addEventListener('scroll', position, true)
    return () => { observer.disconnect(); window.removeEventListener('resize', position); window.removeEventListener('scroll', position, true) }
  }, [])
  function dismiss() {
    const source = anchor?.closest('.notebook-status-options, .notebook-property-tag-picker, .notebook-property-definition')
    panel.current?.hidePopover(); back()
    requestAnimationFrame(() => {
      const replacement = [...(source?.querySelectorAll<HTMLButtonElement>('button') || [])].find(button => [`Edit status ${name.trim()}`, `Edit option ${name.trim()}`].includes(button.getAttribute('aria-label') || ''))
      const target = replacement || (anchor?.isConnected ? anchor instanceof HTMLButtonElement ? anchor : anchor.querySelector<HTMLButtonElement>('.notebook-option-more') : null)
      target?.focus({ preventScroll: true })
    })
  }
  function rename() {
    if (name.trim() === option) return true
    if (!name.trim() || definition.options.some(v => v !== option && v.toLowerCase() === name.trim().toLowerCase())) { setError('Choose a unique option name.'); return false }
    const issue = action?.({ kind: 'rename-option', id: definition.id, option, name: name.trim() })
    if (issue) { setError(issue); return false }
    renamed(name.trim()); return true
  }
  function chooseColor(value: OptionColor) {
    if (name.trim() !== option) {
      if (!name.trim() || definition.options.some(v => v !== option && v.toLowerCase() === name.trim().toLowerCase())) { setError('Choose a unique option name.'); return }
      const issue = action?.({ kind: 'rename-option', id: definition.id, option, name: name.trim(), color: value === 'default' && definition.type !== 'status' ? null : value })
      if (issue) setError(issue); else dismiss()
      return
    }
    const colors = Object.fromEntries(Object.entries(definition.config?.optionColors || {}).filter(([key]) => key !== option))
    const issue = save({ ...definition, config: { ...definition.config, optionColors: value === 'default' && definition.type !== 'status' ? colors : { ...colors, [option]: value } } })
    if (issue) setError(issue); else dismiss()
  }
  return <div ref={panel} popover="auto" role="dialog" tabIndex={-1} aria-label={`Option settings ${option}`} className="notebook-option-submenu" onToggle={event => { event.stopPropagation(); if (event.newState === 'closed') back() }} onKeyDown={event => {
    if (event.key === 'Escape' || event.key === 'ArrowLeft' && event.target instanceof HTMLButtonElement) { event.preventDefault(); event.stopPropagation(); dismiss() }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) && event.target instanceof HTMLButtonElement) { event.preventDefault(); event.stopPropagation(); const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')], index = buttons.indexOf(event.target); buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus() }
  }}>
    <input aria-label="Option name" value={name} maxLength={60} onChange={event => setName(event.target.value)} onBlur={rename} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); if (rename()) dismiss() } if (event.key === 'ArrowDown') { event.preventDefault(); panel.current?.querySelector('button')?.focus() } }} />
    {definition.type === 'status' && <><button type="button" className="notebook-property-menu-row" onMouseDown={event => event.preventDefault()} onClick={() => { const issue = save({ ...definition, config: { ...definition.config, defaultStatus: option } }); if (issue) setError(issue); else dismiss() }}>{definition.config?.defaultStatus === option ? '✓ Default status' : 'Set as default'}</button><p className="notebook-property-caption">Group</p><div role="menu" aria-label="Status group">{statusGroups.map(group => <button key={group.id} type="button" className="notebook-property-menu-row" role="menuitemradio" aria-checked={propertyStatusGroup(definition, option) === group.id} onMouseDown={event => event.preventDefault()} onClick={() => { const issue = save({ ...definition, config: { ...definition.config, statusGroups: { ...definition.config?.statusGroups, [option]: group.id } } }); if (issue) setError(issue); else dismiss() }}>{group.label}<span className="notebook-option-color-check">{propertyStatusGroup(definition, option) === group.id ? '✓' : ''}</span></button>)}</div><hr /></>}
    {confirm && <p className="notebook-property-caption">Remove this option from all tasks? Previous values remain in page history.</p>}<button type="button" className="notebook-property-menu-row notebook-item-delete" onMouseDown={event => event.preventDefault()} onClick={() => { if (!confirm) { setConfirm(true); return } const issue = action?.({ kind: 'delete-option', id: definition.id, option }); if (issue) setError(issue); else dismiss() }}><PropertyMenuIcon name="delete" />{confirm ? 'Confirm delete' : 'Delete'}</button>
    <hr /><p className="notebook-property-caption">Colors</p><div role="menu" aria-label="Option color">{optionPalette.map(color => <button type="button" role="menuitemradio" aria-checked={optionColor(definition, option) === color.id} className="notebook-property-menu-row" key={color.id} onClick={() => chooseColor(color.id)} onMouseDown={event => event.preventDefault()}><span className="notebook-option-color-swatch" style={{ backgroundColor: color.background }} />{color.label}<span className="notebook-option-color-check">{optionColor(definition, option) === color.id ? '✓' : ''}</span></button>)}</div>{error && <p role="alert">{error}</p>}
  </div>
}

function OptionSort({ definition, save }: { definition: PropertyDefinition; save: (property: PropertyDefinition) => string | void }) {
  const [open, setOpen] = useState(false), [error, setError] = useState('')
  const names = { manual: 'Manual', ascending: 'Alphabetical', descending: 'Reverse alphabetical' } as const
  return <><button type="button" className="notebook-property-menu-row" aria-expanded={open} onClick={() => setOpen(v => !v)}><span aria-hidden="true">↕</span>Sort<span className="notebook-property-row-value">{names[definition.config?.optionSort || 'manual']}</span><PropertyMenuIcon name="chevron" /></button>{open && <div role="menu" aria-label="Sort options">{Object.entries(names).map(([id, label]) => <button key={id} type="button" role="menuitemradio" aria-checked={(definition.config?.optionSort || 'manual') === id} className="notebook-property-menu-row" onClick={() => { const issue = save({ ...definition, config: { ...definition.config, optionSort: id as 'manual' | 'ascending' | 'descending' } }); setError(issue || ''); if (!issue) setOpen(false) }}>{label}<span className="notebook-option-color-check">{(definition.config?.optionSort || 'manual') === id ? '✓' : ''}</span></button>)}</div>}{error && <p role="alert">{error}</p>}</>
}
function StatusValuePicker({ definition, value, editable, change }: { definition: PropertyDefinition; value: PropertyValue; editable: boolean; change: (value: PropertyValue) => void }) {
  const [query, setQuery] = useState('')
  const selected = typeof value === 'string' ? value : ''
  return <PropertyPopover label={definition.name} onDismiss={() => setQuery('')} disabled={!editable} trigger={selected ? <StatusPill name={selected} color={optionColor(definition, selected)} /> : <span className="is-empty">Empty</span>}>{close => <div className="notebook-status-picker"><input aria-label={`Search ${definition.name} statuses`} placeholder="Search for a status…" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); event.currentTarget.parentElement?.querySelector<HTMLButtonElement>('[role=option]')?.focus() } if (event.key === 'Enter') { const option = definition.options.find(option => option.toLowerCase().includes(query.toLowerCase())); if (option) { event.preventDefault(); change(option); close() } } }} /><div role="listbox" aria-label={definition.name}>{statusGroups.map(group => <div key={group.id} role="group" aria-label={group.label}><p className="notebook-property-caption">{group.label}</p>{definition.options.filter(option => propertyStatusGroup(definition, option) === group.id && option.toLowerCase().includes(query.toLowerCase())).map(option => <button type="button" className="notebook-property-menu-row" role="option" aria-selected={selected === option} key={option} onClick={() => { change(option); close() }}><StatusPill name={option} color={optionColor(definition, option)} />{selected === option && <span className="notebook-option-color-check">✓</span>}</button>)}</div>)}</div></div>}</PropertyPopover>
}
function StatusPropertyOptions({ definition, save, action }: { definition: PropertyDefinition; save: (property: PropertyDefinition) => string | void; action?: (action: PropertyMenuAction) => string | void }) {
  const [editing, setEditing] = useState<string | null>(null), [adding, setAdding] = useState<StatusGroup | null>(null), [name, setName] = useState(''), [error, setError] = useState('')
  const anchor = useRef<HTMLElement | null>(null), dragged = useRef<string | null>(null)
  function move(option: string, group: StatusGroup) { const issue = save({ ...definition, config: { ...definition.config, statusGroups: { ...definition.config?.statusGroups, [option]: group } } }); setError(issue || '') }
  function add(group: StatusGroup) { const option = name.trim(); if (!option || definition.options.some(v => v.toLowerCase() === option.toLowerCase())) { setError('Choose a unique status name.'); return } const issue = save(withNewOption(definition, option, group)); setError(issue || ''); if (!issue) setName('') }
  return <section className="notebook-status-options" aria-label="Status options">{statusGroups.map(group => <div role="group" aria-label={group.label} key={group.id} className="notebook-status-group" onDragOver={event => { if (dragged.current) { event.preventDefault(); event.stopPropagation() } }} onDrop={event => { if (dragged.current) { event.preventDefault(); event.stopPropagation(); move(dragged.current, group.id); dragged.current = null } }}><div className="notebook-property-options-heading"><span>{group.label}</span><button type="button" aria-label={`Add ${group.label} status`} disabled={definition.options.length >= 30} onClick={() => { setAdding(group.id); setName(''); setError('') }}><PropertyMenuIcon name="plus" /></button></div>{adding === group.id && <div className="notebook-property-new-option"><input autoFocus aria-label={`New ${group.label} status`} placeholder="Type a new option…" maxLength={60} value={name} onChange={event => setName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); add(group.id) } if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setAdding(null) } }} /></div>}{definition.options.filter(option => propertyStatusGroup(definition, option) === group.id).map(option => <button type="button" className="notebook-property-option-row" key={option} aria-label={`Edit status ${option}`} aria-haspopup="dialog" draggable onDragStart={event => { dragged.current = option; event.stopPropagation(); event.dataTransfer.setData('text/plain', option); event.dataTransfer.effectAllowed = 'move' }} onDragEnd={() => { dragged.current = null }} onClick={event => { anchor.current = event.currentTarget; setEditing(option) }}><span className="notebook-property-option-grip" aria-hidden="true">⠿</span><StatusPill name={option} color={optionColor(definition, option)} />{(definition.config?.defaultStatus || definition.options[0]) === option && <small className="notebook-status-default">DEFAULT</small>}<PropertyMenuIcon name="chevron" /></button>)}</div>)}{editing && <OptionSettings definition={definition} option={editing} anchor={anchor.current} renamed={setEditing} save={save} action={action} back={() => setEditing(null)} />}{error && <p role="alert">{error}</p>}</section>
}
function PropertySelection({ definition, value, editable, change, configure, schemaAction }: { definition: PropertyDefinition; value: PropertyValue; editable: boolean; change: (value: PropertyValue) => void; schemaAction?: (action: PropertyMenuAction) => string | void; configure: (property: PropertyDefinition, value?: PropertyValue) => string | void }) {
  const [editing, setEditing] = useState<string | null>(null), [dragged, setDragged] = useState<string | null>(null)
  const [query, setQuery] = useState(''), [error, setError] = useState(''), [active, setActive] = useState(0)
  const optionAnchor = useRef<HTMLElement | null>(null)
  const input = useRef<HTMLInputElement>(null), menu = useRef<HTMLDivElement>(null), listId = useId()
  const single = ['select', 'status'].includes(definition.type)
  const selected = Array.isArray(value) ? value : typeof value === 'string' && value ? [value] : []
  const options = orderedPropertyOptions(definition).filter(option => option.toLowerCase().includes(query.trim().toLowerCase()))
  const exact = definition.options.find(option => option.toLowerCase() === query.trim().toLowerCase())
  const canCreate = !!query.trim() && !exact
  const count = options.length + Number(canCreate)
  useEffect(() => { setActive(0) }, [query])
  useEffect(() => { menu.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' }) }, [active, query])
  function remove(option: string, focusTag = false) {
    const index = selected.indexOf(option), remaining = selected.filter(v => v !== option)
    change(single ? null : remaining)
    requestAnimationFrame(() => {
      const tags = menu.current?.querySelectorAll<HTMLButtonElement>('[data-remove-tag]')
      if (focusTag && remaining.length) tags?.[Math.min(index, remaining.length - 1)]?.focus({ preventScroll: true })
      else input.current?.focus({ preventScroll: true })
    })
  }
  function choose(option: string, close: () => void) {
    change(single ? option : selected.includes(option) ? selected.filter(v => v !== option) : [...selected, option])
    setQuery(''); setError(''); if (single) close(); else input.current?.focus()
  }
  function create(close: () => void) {
    const option = query.trim()
    if (!option || exact) return
    const issue = configure(withNewOption(definition, option), single ? option : [...selected, option])
    if (issue) { setError(issue); return }
    setQuery(''); setError(''); if (single) close(); else input.current?.focus()
  }
  return <PropertyPopover label={definition.name} disabled={!editable} trigger={<span className={`notebook-property-selected-tags ${!selected.length ? 'is-empty' : ''}`}>{selected.length ? selected.map(option => <span key={option} className="notebook-property-option-pill" style={optionStyle(definition, option)}>{option}</span>) : 'Empty'}</span>}>{close => <><div ref={menu} className={`notebook-property-select-menu notebook-property-tag-picker ${!single ? 'notebook-property-multi-picker' : ''}`}>
    <div className="notebook-property-tag-composer" onClick={() => input.current?.focus()} onKeyDown={event => {
      const target = event.target as HTMLElement
      if (single || !target.hasAttribute('data-remove-tag')) return
      const tags = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-remove-tag]')], index = tags.indexOf(target as HTMLButtonElement)
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); const next = tags[index + (event.key === 'ArrowLeft' ? -1 : 1)]; (next || input.current)?.focus({ preventScroll: true }) }
      if (event.key === 'Backspace' || event.key === 'Delete') { event.preventDefault(); remove(selected[index], true) }
    }}>
      {selected.map(option => <span key={option} className="notebook-property-option-pill notebook-property-removable-tag" style={optionStyle(definition, option)}><span>{option}</span><button type="button" data-remove-tag aria-label={`Remove ${option}`} onMouseDown={event => event.preventDefault()} onClick={event => { event.stopPropagation(); remove(option) }}>×</button></span>)}
      <input ref={input} role="combobox" aria-expanded="true" aria-controls={listId} aria-autocomplete="list" aria-activedescendant={count ? `${listId}-${Math.min(active, count - 1)}` : undefined} aria-label={`Search or create ${definition.name} option`} aria-describedby={`${listId}-hint`} placeholder={selected.length ? '' : 'Search for an option…'} maxLength={60} value={query} onChange={event => { setQuery(event.target.value); setActive(0); setError('') }} onKeyDown={event => {
        if (event.nativeEvent.isComposing) return
        if (!single && event.key === 'ArrowLeft' && !query && event.currentTarget.selectionStart === 0 && selected.length) { event.preventDefault(); menu.current?.querySelectorAll<HTMLButtonElement>('[data-remove-tag]')[selected.length - 1]?.focus(); return }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); if (count) setActive(index => (index + (event.key === 'ArrowDown' ? 1 : -1) + count) % count) }
        if (event.key === 'Enter') { event.preventDefault(); if (options[active]) choose(options[active], close); else if (canCreate) create(close) }
        if (event.key === 'Backspace' && !query && selected.length) { event.preventDefault(); remove(selected[selected.length - 1]) }
      }} />
    </div>
    <p id={`${listId}-hint`} className="notebook-property-caption">Select an option or create one</p>
    <div className="notebook-property-choices" id={listId} role="listbox" aria-label={definition.name} aria-multiselectable={!single}>
      {options.map((option, index) => <div key={option} className="notebook-property-choice-row" data-active={active === index} draggable onDragStart={event => { setDragged(option); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', option); event.stopPropagation() }} onDragEnd={() => setDragged(null)} onDragOver={event => { if (dragged && dragged !== option) { event.preventDefault(); event.stopPropagation() } }} onDrop={event => { if (!dragged) return; event.preventDefault(); event.stopPropagation(); const issue = configure(reorderPropertyOption(definition, dragged, option)); setError(issue || ''); setDragged(null) }}>
        <span className="notebook-property-option-grip" aria-hidden="true">⠿</span><button type="button" id={`${listId}-${index}`} role="option" onKeyDown={event => { if (event.altKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); const all = orderedPropertyOptions(definition), target = all[all.indexOf(option) + (event.key === 'ArrowDown' ? 1 : -1)]; if (target) setError(configure(reorderPropertyOption(definition, option, target)) || '') } }} aria-selected={selected.includes(option)} data-active={active === index} onMouseEnter={() => setActive(index)} onClick={() => choose(option, close)}><span className="notebook-property-option-pill" style={optionStyle(definition, option)}>{option}</span>{selected.includes(option) && <span className="notebook-property-option-check" aria-hidden="true">✓</span>}</button><button type="button" className="notebook-option-more" aria-label={`Edit option ${option}`} aria-haspopup="dialog" aria-expanded={editing === option} onClick={event => { optionAnchor.current = event.currentTarget.closest<HTMLElement>('.notebook-property-choice-row'); setEditing(option) }}><svg viewBox="0 0 20 20" aria-hidden="true" fill="currentColor"><circle cx="4" cy="10" r="1.5" /><circle cx="10" cy="10" r="1.5" /><circle cx="16" cy="10" r="1.5" /></svg></button>
      </div>)}
      {canCreate && <button type="button" id={`${listId}-${options.length}`} role="option" aria-selected={false} data-active={active === options.length} className="notebook-property-create-option" onMouseEnter={() => setActive(options.length)} onClick={() => create(close)}><span>Create</span><span className="notebook-property-option-pill" style={optionStyle(withNewOption(definition, query.trim()), query.trim())}>{query.trim()}</span><span className="notebook-property-enter-hint" aria-hidden="true">↵</span></button>}
    </div>
    {error && <p role="alert">{error}</p>}
  </div>{editing && <OptionSettings anchor={optionAnchor.current} renamed={setEditing} definition={definition} option={editing} save={configure} action={schemaAction} back={() => setEditing(null)} />}</>}</PropertyPopover>
}

function PropertyMenuIcon({ name }: { name: 'type' | 'duplicate' | 'delete' | 'back' | 'chevron' | 'plus' | 'rename' | 'eye' | 'layout' }) {
  const paths = { rename: 'M4 14 14 4l3 3L7 17H4ZM12 6l3 3', eye: 'M2 10s3-6 8-6 8 6 8 6-3 6-8 6-8-6-8-6Zm8-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z', layout: 'M3 3h5v14H3ZM11 3h6v6h-6ZM11 12h6v5h-6Z', type: 'M3 6h14M3 14h14M7 3v6M13 11v6', duplicate: 'M7 7h10v10H7ZM3 13V3h10', delete: 'M3 5h14M7 5V3h6v2M5 5l1 12h8l1-12M8 8v6M12 8v6', back: 'm12 4-6 6 6 6', chevron: 'm8 5 5 5-5 5', plus: 'M10 4v12M4 10h12' }
  return <svg className="notebook-property-menu-icon" viewBox="0 0 20 20" aria-hidden="true"><path d={paths[name]} /></svg>
}
function PropertyTypePicker({ selected, choose, back }: { selected: PropertyDefinition['type']; choose: (type: PropertyDefinition['type']) => void; back: () => void }) {
  const [query, setQuery] = useState(''), [searching, setSearching] = useState(false)
  const menu = useRef<HTMLDivElement>(null)
  const types = propertyTypes.filter(type => typeNames[type].toLowerCase().includes(query.toLowerCase().trim()))
  useLayoutEffect(() => { menu.current?.querySelector<HTMLButtonElement>('[aria-checked=true]')?.focus({ preventScroll: true }) }, [])
  return <div className="notebook-property-type-picker" onKeyDown={event => { if (event.key === 'Escape' || event.key === 'ArrowLeft' && event.target instanceof HTMLButtonElement) { event.preventDefault(); event.stopPropagation(); back() } }}><div className="notebook-property-type-heading"><button type="button" aria-label="Back to property" onClick={back}><PropertyMenuIcon name="back" /></button><span>Type</span><button type="button" aria-label="Search types" onClick={() => setSearching(value => !value)}><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8" cy="8" r="4.5" /><path d="m12 12 4 4" /></svg></button></div>{searching && <input autoFocus aria-label="Search property types" placeholder="Search types…" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); menu.current?.querySelector<HTMLButtonElement>('button')?.focus() } if (event.key === 'Enter' && types[0]) { event.preventDefault(); choose(types[0]) } }} />}<div ref={menu} className="notebook-property-types" role="menu" aria-label="Property types" onKeyDown={event => { const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')], index = buttons.indexOf(event.target as HTMLButtonElement); if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) { event.preventDefault(); buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus() } }}>{types.map(kind => <button type="button" role="menuitemradio" aria-checked={kind === selected} key={kind} onClick={() => choose(kind)}><PropertyIcon type={kind} /><span>{typeNames[kind]}</span>{kind === selected && <span className="notebook-property-type-check" aria-hidden="true">✓</span>}</button>)}</div>{!types.length && <p className="notebook-property-caption">No matching types</p>}</div>
}

type DisplayChange = (id: string, patch: PropertyDisplayPatch) => string | void
const visibilityChoices: { value: PropertyVisibility; label: string }[] = [{ value: 'always', label: 'Always show' }, { value: 'empty', label: 'Hide when empty' }, { value: 'hidden', label: 'Always hide' }]
function PropertyLayoutMenu({ list, display, back }: { list: PersonalList; display: DisplayChange; back: () => void }) {
  const [error, setError] = useState(''), [over, setOver] = useState<string | null>(null)
  const drag = useRef<{ id: string; y: number; before: string | null; moved: boolean } | null>(null)
  const entries = taskPropertyEntries(list)
  const move = (id: string, before: string | null) => setError(display(id, { before }) || '')
  return <div className="notebook-property-layout-menu"><button autoFocus type="button" className="notebook-property-back" onClick={back}><PropertyMenuIcon name="back" />Customize layout</button><p className="notebook-property-caption">Drag to reorder properties. Removed properties can be shown again.</p>{entries.map((entry, index) => <div key={entry.id} data-layout-property={entry.id} className={`notebook-property-layout-row ${over === entry.id ? 'is-property-drop' : ''}`}>
    <button type="button" className="notebook-property-order-grip" aria-label={`Drag ${entry.name} to reorder`} onPointerDown={event => {
      if (event.button !== 0) return
      event.preventDefault(); drag.current = { id: entry.id, y: event.clientY, before: entry.id, moved: false }; event.currentTarget.setPointerCapture(event.pointerId)
    }} onPointerMove={event => {
      const current = drag.current
      if (!current || !event.currentTarget.hasPointerCapture(event.pointerId)) return
      if (Math.abs(event.clientY - current.y) > 4) current.moved = true
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-layout-property]')
      if (!target) return
      const id = target.dataset.layoutProperty!, rect = target.getBoundingClientRect(), at = entries.findIndex(entry => entry.id === id)
      current.before = event.clientY > rect.top + rect.height / 2 ? entries[at + 1]?.id || null : id
      setOver(current.before)
    }} onPointerUp={event => {
      const current = drag.current; drag.current = null; setOver(null)
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
      if (current?.moved && current.id !== current.before) move(current.id, current.before)
    }} onPointerCancel={() => { drag.current = null; setOver(null) }} onLostPointerCapture={() => { drag.current = null; setOver(null) }}>⠿</button>
    <label><PropertyIcon type={entry.type} /><span>{entry.name}</span><input type="checkbox" aria-label={`Show ${entry.name}`} checked={list.propertyDisplay?.[entry.id]?.visibility !== 'hidden'} onChange={event => setError(display(entry.id, { visibility: event.target.checked ? 'always' : 'hidden' }) || '')} /></label>
    <button type="button" aria-label={`Move ${entry.name} up`} disabled={!index} onClick={() => move(entry.id, entries[index - 1].id)}>↑</button>
    <button type="button" aria-label={`Move ${entry.name} down`} disabled={index === entries.length - 1} onClick={() => move(entry.id, entries[index + 2]?.id || null)}>↓</button>
  </div>)}{error && <p role="alert">{error}</p>}</div>
}
function PropertyActionMenu({ name, type, id, list, rename, editor, duplicate, remove, close, display }: { name: string; type: string; id: string; list: PersonalList; rename: (name: string) => string | void; editor: ReactNode; duplicate?: () => string | void; remove?: () => void; close: () => void; display: DisplayChange }) {
  const [view, setView] = useState<'main' | 'rename' | 'edit' | 'visibility' | 'layout'>('main'), [draft, setDraft] = useState(name), [error, setError] = useState(''), [confirm, setConfirm] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = root.current
    const target = view === 'rename' ? el?.querySelector<HTMLElement>('input') : el?.querySelector<HTMLElement>('[role=menuitemradio], [role=menuitem]') || el?.querySelector<HTMLElement>('button')
    target?.focus({ preventScroll: true })
  }, [view])
  function commit() { const issue = rename(draft.trim()); if (issue) setError(issue); else close() }
  if (view === 'edit') return <div ref={root}><button type="button" className="notebook-property-back" onClick={() => setView('main')}><PropertyMenuIcon name="back" />Property actions</button>{editor}</div>
  if (view === 'layout') return <div ref={root}><PropertyLayoutMenu list={list} display={display} back={() => setView('main')} /></div>
  if (view === 'rename') return <div ref={root} className="notebook-property-rename-menu"><button type="button" className="notebook-property-back" onClick={() => setView('main')}><PropertyMenuIcon name="back" />Rename</button><div className="notebook-property-editor-name"><PropertyIcon type={type} /><input autoFocus aria-label="Property name" maxLength={60} value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); commit() } if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setView('main') } }} /></div><button type="button" className="notebook-property-menu-row" onClick={commit}>Rename property</button>{error && <p role="alert">{error}</p>}</div>
  if (view === 'visibility') return <div ref={root} className="notebook-property-action-menu" onKeyDown={event => { if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return; const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role=menuitemradio]')], index = buttons.indexOf(event.target as HTMLButtonElement); event.preventDefault(); buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus() }}><button type="button" className="notebook-property-back" onClick={() => setView('main')}><PropertyMenuIcon name="back" />Property visibility</button><div role="menu" aria-label="Property visibility">{visibilityChoices.map(choice => <button type="button" role="menuitemradio" aria-checked={(list.propertyDisplay?.[id]?.visibility || 'always') === choice.value} className="notebook-property-menu-row" key={choice.value} onClick={() => { const issue = display(id, { visibility: choice.value }); if (issue) setError(issue); else close() }}><PropertyMenuIcon name="eye" /><span>{choice.label}</span>{(list.propertyDisplay?.[id]?.visibility || 'always') === choice.value && <span className="notebook-property-type-check" aria-hidden="true">✓</span>}</button>)}</div>{error && <p role="alert">{error}</p>}</div>
  return <div ref={root} className="notebook-property-action-menu" role="menu" aria-label={`${name} actions`} onKeyDown={event => { if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return; const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role=menuitem]')], index = buttons.indexOf(event.target as HTMLButtonElement); event.preventDefault(); buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus() }}>
    <button type="button" role="menuitem" className="notebook-property-menu-row" onClick={() => setView('rename')}><PropertyMenuIcon name="rename" />Rename</button>
    <button type="button" role="menuitem" className="notebook-property-menu-row" onClick={() => setView('edit')}><PropertyMenuIcon name="type" />Edit property</button>
    <hr />
    <button type="button" role="menuitem" className="notebook-property-menu-row" onClick={() => setView('visibility')}><PropertyMenuIcon name="eye" /><span>Property visibility</span><span className="notebook-property-type-check"><PropertyMenuIcon name="chevron" /></span></button>
    {duplicate && <button type="button" role="menuitem" className="notebook-property-menu-row" onClick={() => { const issue = duplicate(); if (issue) setError(issue); else close() }}><PropertyMenuIcon name="duplicate" />Duplicate property</button>}
    {id === 'value' && <button type="button" role="menuitem" className="notebook-property-menu-row notebook-item-delete" onClick={() => { const issue = display(id, { visibility: 'hidden' }); if (issue) setError(issue); else close() }}><PropertyMenuIcon name="delete" />Remove property</button>}
    {remove && <><button type="button" role="menuitem" className="notebook-property-menu-row notebook-item-delete" onClick={() => { if (!confirm) setConfirm(true); else { remove(); close() } }}><PropertyMenuIcon name="delete" />{confirm ? 'Delete property and values' : 'Delete property'}</button>{confirm && <p className="notebook-property-caption">Removes this property from every task. Previous values remain in page history.</p>}</>}
    <hr /><button type="button" role="menuitem" className="notebook-property-menu-row" onClick={() => setView('layout')}><PropertyMenuIcon name="layout" />Customize layout</button>{error && <p role="alert">{error}</p>}
  </div>
}
export function BuiltinValueProperty({ list, editable, display, duplicate }: { list: PersonalList; editable: boolean; display: DisplayChange; duplicate: () => string | void }) {
  const name = list.propertyDisplay?.value?.name || 'Value'
  const rename = (name: string) => display('value', { name })
  return <PropertyPopover label={`Edit property ${name}`} disabled={!editable} className="notebook-property-name" trigger={<><PropertyIcon type="number" /><span>{name}</span></>}>{close => <PropertyActionMenu name={name} type="number" id="value" list={list} rename={rename} duplicate={list.properties?.length === 30 ? undefined : duplicate} display={display} close={close} editor={<BuiltinValueEditor name={name} rename={rename} close={close} number={list.propertyDisplay?.value?.number} changeNumber={number => display('value', { number })} />} />}</PropertyPopover>
}
export function BuiltinImageProperty({ list, editable, display }: { list: PersonalList; editable: boolean; display: DisplayChange }) {
  const [layout, setLayout] = useState(false), [error, setError] = useState('')
  return <PropertyPopover label="Edit property Image" disabled={!editable} className="notebook-property-name" onDismiss={() => { setLayout(false); setError('') }} trigger={<><PropertyIcon type="files" /><span>Image</span></>}>{close => layout ? <PropertyLayoutMenu list={list} display={display} back={() => setLayout(false)} /> : <div className="notebook-property-action-menu"><button type="button" className="notebook-property-menu-row notebook-item-delete" onClick={() => { const issue = display('image', { visibility: 'hidden' }); if (issue) setError(issue); else close() }}><PropertyMenuIcon name="delete" />Remove property</button><button type="button" className="notebook-property-menu-row" onClick={() => setLayout(true)}><PropertyMenuIcon name="layout" />Customize layout</button>{error && <p role="alert">{error}</p>}</div>}</PropertyPopover>
}

function BuiltinValueEditor({ name, rename, close, number, changeNumber }: { number?: NumberDisplay | null; changeNumber: (value: NumberDisplay) => string | void; name: string; rename: (name: string) => string | void; close: () => void }) {
  const [draft, setDraft] = useState(name), [error, setError] = useState('')
  function commit() { const issue = rename(draft.trim()); if (issue) setError(issue); else close() }
  return <div className="notebook-property-definition"><div className="notebook-property-editor-name"><PropertyIcon type="number" /><input aria-label="Property name" value={draft} maxLength={60} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); commit() } }} /></div><div className="notebook-property-menu-row"><PropertyMenuIcon name="type" /><span>Type</span><span className="notebook-property-row-value">Number</span></div><p className="notebook-property-caption">Built-in number used by charts. Duplicate it to create a property with a different type.</p><NumberDisplaySettings config={number} change={changeNumber} />{draft !== name && <button type="button" className="notebook-property-menu-row" onClick={commit}>Rename property</button>}{error && <p role="alert">{error}</p>}</div>
}
function AddPropertyWithLayout({ list, definitions, create, display, close }: { list: PersonalList; definitions: PropertyDefinition[]; create: (property: PropertyDefinition) => string | void; display: DisplayChange; close: () => void }) {
  const [layout, setLayout] = useState(false)
  return layout ? <PropertyLayoutMenu list={list} display={display} back={() => setLayout(false)} /> : <><AddPropertyMenu definitions={definitions} create={create} close={close} /><hr /><button type="button" className="notebook-property-menu-row" onClick={() => setLayout(true)}><PropertyMenuIcon name="layout" />Customize layout</button></>
}

export function PropertyDefinitionEditor({ initial, definitions, save, remove, close, list, lists = [], action, numberChange }: { numberChange?: (value: NumberDisplay) => string | void; action?: (action: PropertyMenuAction) => string | void; list?: PersonalList; lists?: PersonalList[]; initial?: PropertyDefinition; definitions: PropertyDefinition[]; save: (value: PropertyDefinition, approval?: string) => string | void; remove?: () => void; close: () => void }) {
  const [name, setName] = useState(initial?.name || ''), [type, setType] = useState<PropertyDefinition['type']>(initial?.type || 'text'), [options, setOptions] = useState(initial?.options.join('\n') || ''), [error, setError] = useState(''), [confirm, setConfirm] = useState(false)
  const [config, setConfig] = useState(initial?.config || {}), [approval, setApproval] = useState('')
  const [view, setView] = useState<'main' | 'types' | 'option'>('main'), [activeOption, setActiveOption] = useState(''), [adding, setAdding] = useState(false), [newOption, setNewOption] = useState('')
  const typeButton = useRef<HTMLButtonElement>(null), addButton = useRef<HTMLButtonElement>(null), newOptionInput = useRef<HTMLInputElement>(null), optionAnchor = useRef<HTMLElement | null>(null)
  function returnToMain() { setView('main'); requestAnimationFrame(() => typeButton.current?.focus({ preventScroll: true })) }
  useEffect(() => { setConfig(initial?.config || {}) }, [initial?.config])
  const changingType = !!initial && initial.type !== type
  const draft: PropertyDefinition = { id: initial?.id || '', name: name.trim(), type, config, options: ['select', 'multi-select', 'status', 'person'].includes(type) ? options.split('\n').map(s => s.trim()).filter(Boolean) : [] }
  const plan = changingType && list ? planTaskPropertyChange(list, draft, lists) : null
  function chooseType(next: PropertyDefinition['type']) {
    setView('main'); requestAnimationFrame(() => typeButton.current?.focus()); setType(next); setApproval(''); setError('')
    const previous = next === initial?.type
    const nextConfig = previous ? initial?.config || {} : {}
    const candidate = { ...draft, type: next, config: nextConfig, options: previous ? initial?.options || [] : [] }
    const prepared = initial && list && !previous ? planTaskPropertyChange(list, candidate, lists) : null
    setConfig(prepared?.definition.config || nextConfig); setOptions((prepared?.definition.options || candidate.options).join('\n'))
  }
  const commit = () => {
    const next = { ...draft, id: initial?.id || crypto.randomUUID() }
    if (!next.name) { setError('Give the property a name.'); return }
    if (['name', 'status', 'date', 'value', 'image'].includes(next.name.toLowerCase()) || definitions.some(p => p.id !== next.id && p.name.toLowerCase() === next.name.toLowerCase())) { setError('A property with this name already exists.'); return }
    if (changingType && !plan) { setError('Check the property settings before converting.'); return }
    if (plan?.cleared && approval !== plan.signature) { setApproval(plan.signature); return }
    const issue = save(plan?.definition || next, plan?.cleared ? plan.signature : undefined)
    if (issue) setError(issue); else close()
  }
  const populated = plan?.entries.filter(entry => entry.before !== null && entry.before !== '' && (!Array.isArray(entry.before) || entry.before.length)) || []
  const kept = populated.filter(entry => !entry.cleared).length
  const format = (value: PropertyValue) => value === null || Array.isArray(value) && !value.length || value === '' ? 'Empty' : Array.isArray(value) ? value.join(', ') : String(value)
  const currentOptions = changingType ? draft.options : initial ? orderedPropertyOptions(initial) : []
  const draggedOption = useRef<string | null>(null)
  const configChanged = JSON.stringify(config) !== JSON.stringify(initial?.config || {})
  function rename() {
    if (!initial || name.trim() === initial.name) return
    if (!name.trim() || ['name', 'status', 'date', 'value', 'image'].includes(name.trim().toLowerCase()) || definitions.some(p => p.id !== initial.id && p.name.toLowerCase() === name.trim().toLowerCase())) { setError('Choose a unique property name.'); return }
    const issue = save({ ...initial, name: name.trim() })
    setError(issue || '')
  }
  function addOption() {
    const option = newOption.trim()
    if (!option || option.length > 60 || currentOptions.includes(option) || currentOptions.length >= 30) { setError('Use a unique option name, up to 60 characters (30 options maximum).'); return }
    const next = [...currentOptions, option]
    const issue = changingType ? undefined : save(withNewOption(initial!, option))
    if (issue) { setError(issue); return }
    setOptions(next.join('\n')); setNewOption(''); setError(''); requestAnimationFrame(() => newOptionInput.current?.focus({ preventScroll: true }))
  }
  if (view === 'types') return <PropertyTypePicker selected={type} choose={chooseType} back={() => { setView('main'); requestAnimationFrame(() => typeButton.current?.focus()) }} />
  return <div className="notebook-property-definition" onKeyDown={event => { if (event.key === 'ArrowDown' && event.target === event.currentTarget.querySelector('input')) { event.preventDefault(); typeButton.current?.focus() } }}>
    <div className="notebook-property-editor-name"><span className="notebook-property-editor-icon"><PropertyIcon type={type} /></span><input aria-label="Property name" placeholder="Property name" maxLength={60} value={name} onChange={event => { setName(event.target.value); setApproval('') }} onBlur={rename} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); typeButton.current?.focus() } }} /></div>
    <button ref={typeButton} type="button" className="notebook-property-menu-row notebook-property-type-row" aria-label="Property type" aria-haspopup="menu" onClick={() => setView('types')} onKeyDown={event => { if (event.key === 'ArrowRight') { event.preventDefault(); setView('types') } }}><PropertyMenuIcon name="type" /><span>Type</span><span className="notebook-property-row-value">{typeNames[type]}</span><PropertyMenuIcon name="chevron" /></button>
    {type === 'number' && !changingType && numberChange && <NumberDisplaySettings config={list?.propertyDisplay?.[initial?.id || '']?.number} change={numberChange} />}
    <PropertyConfiguration type={type} config={config} setConfig={value => { setConfig(value); setApproval('') }} definitions={definitions} list={list} lists={lists} />
    {type === 'status' && !changingType && initial ? <StatusPropertyOptions definition={initial} save={save} action={action} /> : ['select', 'multi-select', 'status', 'person'].includes(type) && <><OptionSort definition={initial || draft} save={save} /><section className="notebook-property-options" aria-label="Property options"><div className="notebook-property-options-heading"><span>Options</span>{currentOptions.length > 0 && <button ref={addButton} type="button" aria-label="Add an option" disabled={currentOptions.length >= 30} onClick={() => { setAdding(true); setError('') }}><PropertyMenuIcon name="plus" /></button>}</div>{adding ? <div className="notebook-property-new-option"><input ref={newOptionInput} autoFocus aria-label="New option name" maxLength={60} placeholder="Type a new option…" value={newOption} onChange={event => setNewOption(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addOption() } if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setAdding(false); requestAnimationFrame(() => addButton.current?.focus()) } }} /></div> : !currentOptions.length && <button type="button" className="notebook-property-menu-row" onClick={() => setAdding(true)}><PropertyMenuIcon name="plus" />Add an option</button>}<div className="notebook-property-option-rows">{currentOptions.map(option => <button type="button" key={option} className="notebook-property-option-row" onKeyDown={event => { if (event.altKey && ['ArrowUp', 'ArrowDown'].includes(event.key) && initial && !changingType) { event.preventDefault(); event.stopPropagation(); const target = currentOptions[currentOptions.indexOf(option) + (event.key === 'ArrowDown' ? 1 : -1)]; if (target) setError(save(reorderPropertyOption(initial, option, target)) || '') } }} draggable={!changingType} onDragStart={event => { draggedOption.current = option; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', option); event.stopPropagation() }} onDragEnd={() => { draggedOption.current = null }} onDragOver={event => { if (draggedOption.current) { event.preventDefault(); event.stopPropagation() } }} onDrop={event => { if (!draggedOption.current || !initial) return; event.preventDefault(); event.stopPropagation(); const issue = save(reorderPropertyOption(initial, draggedOption.current, option)); setError(issue || ''); draggedOption.current = null }} aria-label={`Edit option ${option}`} aria-haspopup="dialog" aria-expanded={view === 'option' && activeOption === option} onClick={event => { optionAnchor.current = event.currentTarget; setActiveOption(option); setView('option'); setError('') }}><span className="notebook-property-option-grip" aria-hidden="true">⠿</span><span className="notebook-property-option-pill" style={optionStyle(initial || draft, option)}>{option}</span><PropertyMenuIcon name="chevron" /></button>)}</div></section>{view === 'option' && initial && <OptionSettings anchor={optionAnchor.current} renamed={setActiveOption} definition={initial} option={activeOption} save={save} action={action} back={() => setView('main')} />}</>}
    {changingType && plan && <section className="notebook-property-conversion" aria-label="Type change preview"><strong>{typeNames[initial!.type]} → {typeNames[type]}</strong><p>{kept} {kept === 1 ? 'value' : 'values'} kept · {plan.cleared} {plan.cleared === 1 ? 'value' : 'values'} will be cleared</p>{automaticPropertyTypes.includes(type) && <p>This type uses automatic values. Existing manual values cannot be retained.</p>}{automaticPropertyTypes.includes(initial!.type) && !automaticPropertyTypes.includes(type) && <p>Calculated values become editable snapshots.</p>}<div className="notebook-property-conversion-rows">{plan.entries.filter(entry => entry.cleared || entry.before !== null && entry.before !== '' && (!Array.isArray(entry.before) || entry.before.length)).slice(0, 20).map(entry => <div key={entry.id} className={entry.cleared ? 'will-clear' : ''}><strong>{entry.title}</strong><span title={format(entry.before)}>{format(entry.before)}</span><span aria-hidden="true">→</span><span title={entry.reason || format(entry.after)}>{entry.cleared ? 'Will clear' : format(entry.after)}</span></div>)}</div>{plan.entries.length > 20 && <p>Preview shows up to 20 tasks. The change applies to all {plan.entries.length} tasks.</p>}{plan.cleared > 0 && <p role="status">{approval === plan.signature ? 'Confirm below to clear incompatible values. Previous values remain in page history.' : 'Review the values above before continuing.'}</p>}</section>}
    {error && <p role="alert">{error}</p>}
    {(changingType || configChanged) && <button type="button" className="notebook-property-apply" onClick={commit}>{changingType ? plan?.cleared ? approval === plan.signature ? `Change type and clear ${plan.cleared} ${plan.cleared === 1 ? 'value' : 'values'}` : 'Review type change' : 'Change type' : 'Apply changes'}</button>}
    {changingType && <button type="button" className="notebook-property-cancel-change" onClick={close}>Cancel</button>}
    <hr />
    {action && initial && <button type="button" className="notebook-property-menu-row" disabled={definitions.length >= 30 || !propertyTypes.includes(initial.type)} onClick={() => { const issue = action({ kind: 'duplicate', id: initial.id, newId: crypto.randomUUID() }); if (issue) setError(issue); else close() }}><PropertyMenuIcon name="duplicate" />Duplicate property</button>}
    {remove && <>{confirm && <p className="notebook-property-caption">Removes this property and its values from every task. Page history keeps previous versions.</p>}<button type="button" className="notebook-property-menu-row notebook-item-delete" onClick={() => { if (!confirm) setConfirm(true); else { remove(); close() } }}><PropertyMenuIcon name="delete" />{confirm ? 'Delete property and values' : 'Delete property'}</button></>}

  </div>
}

export function CustomTaskProperties({ builtins, definitions, values, editable, change, configure, remove, item, list, lists, action, schemaAction, display }: { builtins?: Record<string, ReactNode>; display: DisplayChange; schemaAction?: (action: PropertyMenuAction) => string | void; item: PersonalItem; list: PersonalList; lists: PersonalList[]; action: (patch: Partial<PersonalItem>) => void; definitions: PropertyDefinition[]; values: Record<string, PropertyValue>; editable: boolean; change: (id: string, value: PropertyValue) => void; configure: (value: PropertyDefinition, valueToSet?: PropertyValue, approval?: string) => string | void; remove: (id: string) => void }) {
  const visible = definitions.filter(definition => propertyShown(list, definition.id, definition.type === 'button' ? true : automaticPropertyTypes.includes(definition.type) ? computedProperty(definition, item, list, lists) : values[definition.id] ?? null))
  const rows = visible.map(definition => { const value = values[definition.id] ?? null; const input = definition.type === 'number' ? <NumberPropertyValue label={definition.name} value={typeof value === 'number' ? value : null} config={list.propertyDisplay?.[definition.id]?.number} editable={editable} change={next => change(definition.id, next)} /> : ['files', 'relation', 'formula', 'rollup', 'created-time', 'created-by', 'edited-time', 'edited-by', 'id', 'button'].includes(definition.type) ? <AdvancedPropertyValue definition={definition} value={value} editable={editable} item={item} list={list} lists={lists} change={next => change(definition.id, next)} configure={configure} action={action} schemaAction={schemaAction} /> : definition.type === 'date' ? <TaskDatePicker value={value as string | null} label={definition.name} disabled={!editable} change={next => change(definition.id, next)} /> : definition.type === 'checkbox' ? <input type="checkbox" aria-label={definition.name} checked={value === true} disabled={!editable} onChange={event => change(definition.id, event.target.checked)} /> : definition.type === 'status' ? <StatusValuePicker definition={definition} value={value} editable={editable} change={next => change(definition.id, next)} /> : ['select', 'multi-select', 'person'].includes(definition.type) ? <PropertySelection schemaAction={schemaAction} definition={definition} value={value} editable={editable} change={next => change(definition.id, next)} configure={configure} /> : <input aria-label={definition.name} type={definition.type === 'url' ? 'url' : definition.type === 'email' ? 'email' : definition.type === 'phone' ? 'tel' : 'text'} step="any" maxLength={2000} placeholder="Empty" readOnly={!editable} value={value == null ? '' : String(value)} onChange={event => change(definition.id, event.target.value === '' ? null : event.target.value)} />
    return <div key={definition.id} data-property-id={definition.id} className="notebook-task-property-row"><PropertyPopover label={`Edit property ${definition.name}`} disabled={!editable} className="notebook-property-name" trigger={<><PropertyIcon type={definition.type} /><span>{definition.name}</span></>}>{close => <PropertyActionMenu name={definition.name} type={definition.type} id={definition.id} list={list} rename={name => configure({ ...definition, name })} display={display} duplicate={schemaAction && definitions.length < 30 ? () => schemaAction({ kind: 'duplicate', id: definition.id, newId: crypto.randomUUID() }) : undefined} remove={() => remove(definition.id)} close={close} editor={<PropertyDefinitionEditor numberChange={number => display(definition.id, { number })} action={schemaAction} list={list} lists={lists} initial={definition} definitions={definitions} save={(property, approval) => configure(property, undefined, approval)} remove={() => remove(definition.id)} close={close} />} />}</PropertyPopover><div className="notebook-task-value">{input}</div></div>
  })
  const custom = new Map(visible.map((definition, index) => [definition.id, rows[index]]))
  const entries = taskPropertyEntries(list).flatMap(entry => {
    const content = builtins && entry.id in builtins ? propertyShown(list, entry.id, entry.id === 'image' ? item.cover : entry.id === 'value' ? item.value : entry.id === 'status' ? item.status : item.date) ? builtins[entry.id] : null : custom.get(entry.id)
    return content ? [{ id: entry.id, name: entry.name, content }] : []
  })
  return <><TaskPropertyRows entries={entries} editable={editable} display={display} />{editable && <PropertyPopover label="Add a property" className="notebook-property-add" trigger={<><span aria-hidden="true">＋</span> Add a property</>}>{close => <AddPropertyWithLayout list={list} definitions={definitions} create={property => configure(property)} display={display} close={close} />}</PropertyPopover>}{editable && <PropertyPopover label="Customize properties" className="notebook-property-add" trigger={<>Customize properties</>}>{close => <PropertyLayoutMenu list={list} display={display} back={close} />}</PropertyPopover>}</>
}
