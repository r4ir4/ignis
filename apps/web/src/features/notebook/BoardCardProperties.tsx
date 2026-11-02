import { buttonPatch } from './taskButtons'
import { useState, useRef, type ReactNode } from 'react'
import { PropertyIcon } from './TaskPropertyControls'
import { NumberVisualization } from './NumberProperty'
import { automaticPropertyTypes, computedProperty } from './taskProperties'
import { optionPalette } from './optionPalette'
import { boardColumn, boardColumnStyle } from './boardColumns'
import type { PersonalItem, PersonalList } from './personalLists'
import type { ViewRecord } from './viewModel'
import { cardPropertyChoices } from './cardProperties'

function VisibilityEye({ hidden = false }: { hidden?: boolean }) {
  return <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M2 10s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5Z" stroke="currentColor" strokeWidth="1.4" /><circle cx="10" cy="10" r="2" fill="currentColor" />{hidden && <path d="m3 3 14 14" stroke="currentColor" strokeWidth="2" />}</svg>
}
export function CardPropertiesPicker({ list, selected, change, close, back }: { back?: () => void; list?: PersonalList; selected: string[]; change: (keys: string[]) => void; close: () => void }) {
  const [query, setQuery] = useState(''), [dragged, setDragged] = useState<string | null>(null), [over, setOver] = useState<string | null>(null)
  const buttons = useRef(new Map<string, HTMLButtonElement>())
  const choices = cardPropertyChoices(list), matches = (name: string) => name.toLowerCase().includes(query.toLowerCase())
  const shown = selected.flatMap(id => { const property = choices.find(property => property.id === id); return property ? [property] : [] })
  const hidden = choices.filter(property => !selected.includes(property.id))
  function toggle(id: string) { change(selected.includes(id) ? selected.filter(key => key !== id) : [...selected, id]); requestAnimationFrame(() => buttons.current.get(id)?.focus()) }
  function drop(target?: string) { if (!dragged || dragged === target) return; const next = selected.filter(id => id !== dragged); next.splice(target ? Math.max(0, next.indexOf(target)) : next.length, 0, dragged); change(next); setDragged(null); setOver(null) }
  function row(property: typeof choices[number], visible: boolean) {
    return <div key={property.id} className={`notebook-card-visibility-row ${over === property.id ? 'is-property-drop' : ''} ${dragged === property.id ? 'is-property-dragging' : ''}`} role="listitem" draggable onDragStart={event => { setDragged(property.id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', property.id) }} onDragEnd={() => { setDragged(null); setOver(null) }} onDragOver={event => { if (dragged) { event.preventDefault(); event.stopPropagation(); setOver(property.id) } }} onDrop={event => { event.preventDefault(); event.stopPropagation(); if (visible) drop(property.id); else if (dragged) { change(selected.filter(id => id !== dragged)); setDragged(null); setOver(null) } }}>
      <button type="button" className="notebook-card-property-grip" aria-label={`Reorder ${property.name}`} title="Drag to reorder · Alt+Up/Down" onKeyDown={event => { if (!event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return; event.preventDefault(); if (!visible) { toggle(property.id); return } const index = selected.indexOf(property.id), target = Math.max(0, Math.min(selected.length - 1, index + (event.key === 'ArrowUp' ? -1 : 1))); const next = [...selected]; next.splice(index, 1); next.splice(target, 0, property.id); change(next) }}><svg viewBox="0 0 12 18" aria-hidden="true" fill="currentColor">{[4, 9, 14].flatMap(y => [3, 8].map(x => <circle key={`${x}-${y}`} cx={x} cy={y} r="1" />))}</svg></button>
      <PropertyIcon type={property.type} /><span>{property.name}</span><button type="button" className="notebook-card-property-eye" ref={element => { if (element) buttons.current.set(property.id, element); else buttons.current.delete(property.id) }} aria-label={`${visible ? 'Hide' : 'Show'} ${property.name} on cards`} title={visible ? 'Hide in board' : 'Show in board'} onClick={() => toggle(property.id)}><VisibilityEye hidden={!visible} /></button>
    </div>
  }
  return <div className="notebook-card-property-picker" onKeyDown={event => { if (event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return; const root = event.currentTarget, target = event.target as HTMLElement; if (target.tagName === 'INPUT' && event.key !== 'ArrowDown') return; const options = [...root.querySelectorAll<HTMLButtonElement>('.notebook-card-property-eye:not(:disabled)')]; if (!options.length) return; event.preventDefault(); const index = options.indexOf(target as HTMLButtonElement); options[index < 0 ? 0 : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length].focus() }}><header>{back && <button type="button" aria-label="Back to view settings" onClick={back}>←</button>}<strong>Property visibility</strong><button type="button" aria-label="Close card properties" onClick={close}>×</button></header><div className="notebook-card-property-search"><input aria-label="Search card properties" placeholder="Search for a property…" value={query} onChange={event => setQuery(event.target.value)} /></div><div className="notebook-card-property-groups">
    <section aria-label="Shown in board" onDragOver={event => { if (dragged) event.preventDefault() }} onDrop={event => { event.preventDefault(); drop() }}><div className="notebook-card-property-section"><span>Shown in board</span><button type="button" onClick={() => change([])} disabled={!shown.length}>Hide all</button></div><div role="list">{matches('Name') && <div className="notebook-card-visibility-row is-name" role="listitem"><span className="notebook-card-name-icon" aria-hidden="true">Aa</span><span>Name</span><button type="button" className="notebook-card-property-eye" disabled title="Name is always shown" aria-label="Name is always shown"><VisibilityEye /></button></div>}{shown.filter(property => matches(property.name)).map(property => row(property, true))}</div></section>
    <section aria-label="Hidden in board" onDragOver={event => { if (dragged) event.preventDefault() }} onDrop={event => { event.preventDefault(); if (dragged) change(selected.filter(id => id !== dragged)); setDragged(null); setOver(null) }}><div className="notebook-card-property-section"><span>Hidden in board</span><button type="button" disabled={!hidden.length} onClick={() => change([...selected, ...hidden.map(property => property.id)])}>Show all</button></div><div role="list">{hidden.filter(property => matches(property.name)).map(property => row(property, false))}</div></section>
    {!choices.some(property => matches(property.name)) && !matches('Name') && <p className="notebook-card-property-empty">No properties found.</p>}
  </div></div>
}

export function BoardCardProperties({ record, selected, list, lists, edit }: { edit?: (patch: Partial<PersonalItem>) => void; record: ViewRecord; selected: string[]; list?: PersonalList; lists: PersonalList[] }) {
  const [issue, setIssue] = useState('')
  const item = list?.items.find(item => item.id === record.id)
  const choices = cardPropertyChoices(list)
  return <div className="notebook-card-properties">{selected.filter(key => key !== 'cover').map(key => {
    const property = list?.properties?.find(property => property.id === key)
    const choice = choices.find(choice => choice.id === key)
    if (!choice) return null
    let value: unknown = property ? item?.properties?.[key] : key === 'description' ? record.description : key === 'status' ? record.statusLabel || record.status : key === 'date' ? record.date : record.value
    let content: ReactNode
    try { if (property && item && automaticPropertyTypes.includes(property.type)) value = property.type === 'button' ? null : computedProperty(property, item, list!, lists) } catch { value = null }
    if (property?.type === 'button') return <div key={key} className="notebook-card-property" title={property.name}><button type="button" disabled={!edit || !property.config?.action && !property.config?.steps?.length} onClick={event => { event.stopPropagation(); try { const patch = buttonPatch(property.config || {}, list!); if (!property.config?.confirmation || window.confirm(property.config.confirmation)) edit?.(patch); setIssue('') } catch (error) { setIssue(error instanceof Error ? error.message : 'Unable to run action.') } }}>{property.config?.buttonLabel || property.name}</button></div>
    if (value == null || value === '' || Array.isArray(value) && !value.length) return null
    if (key === 'status') content = <span className="notebook-property-status" style={boardColumnStyle(boardColumn(record.status, list?.board?.columns))}>{String(value)}</span>
    else if (property && ['select', 'multi-select', 'status'].includes(property.type)) content = <>{(Array.isArray(value) ? value : [value]).map(option => { const color = optionPalette.find(color => color.id === property.config?.optionColors?.[String(option)]) || optionPalette[0]; return <span key={String(option)} className="notebook-card-tag" style={{ background: color.background, color: color.text }}>{String(option)}</span> })}</>
    else if (choice.type === 'number' && typeof value === 'number') content = <NumberVisualization value={value} config={key === 'value' ? record.numberDisplay : list?.propertyDisplay?.[key]?.number} />
    else if (choice.type === 'checkbox') content = <span aria-label={value ? 'Checked' : 'Unchecked'}>{value ? '☑' : '☐'}</span>
    else if (['created-time', 'edited-time'].includes(choice.type)) content = <time dateTime={String(value)}>{new Date(String(value)).toLocaleString()}</time>
    else if (choice.type === 'date') content = <time dateTime={String(value)}>{new Date(`${value}T12:00:00`).toLocaleDateString()}</time>
    else if (choice.type === 'files' && Array.isArray(value)) content = <span>{value.length} {value.length === 1 ? 'file' : 'files'}</span>
    else content = <span>{Array.isArray(value) ? value.join(', ') : String(value)}</span>
    return <div key={key} className="notebook-card-property" title={choice.name} aria-label={choice.name}><PropertyIcon type={choice.type} />{content}</div>
  })}{issue && <span role="alert">{issue}</span>}</div>
}
