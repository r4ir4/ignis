import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { PropertyDisplayPatch } from './propertyDisplay'

type Row = { id: string; name: string; content: ReactNode }
type Drag = { id: string; pointer: number; y: number; before: string | null | undefined; moved: boolean }

/** Direct row dragging uses the same list-level order as Customize properties. */
export function TaskPropertyRows({ entries, editable, display }: { entries: Row[]; editable: boolean; display: (id: string, patch: PropertyDisplayPatch) => string | void }) {
  const root = useRef<HTMLDivElement>(null), drag = useRef<Drag | null>(null)
  const [indicator, setIndicator] = useState<string | null | undefined>(undefined)
  const [error, setError] = useState(''), [announcement, setAnnouncement] = useState('')
  const cancel = () => { drag.current = null; setIndicator(undefined) }
  useEffect(() => { if (!editable) cancel() }, [editable])
  function move(id: string, before: string | null) {
    if (!editable) return
    const issue = display(id, { before })
    setError(issue || '')
    if (!issue) setAnnouncement(`Moved ${entries.find(entry => entry.id === id)?.name || 'property'}`)
  }
  return <div ref={root} className="notebook-task-property-list">
    {entries.map((entry, index) => <div key={entry.id} data-task-property-row={entry.id} className={`notebook-task-property-entry ${indicator === entry.id ? 'is-property-drop' : ''} ${indicator === null && index === entries.length - 1 ? 'is-property-drop-after' : ''}`}>
      {editable && <button type="button" className="notebook-task-property-grip" aria-label={`Reorder ${entry.name}`} title="Drag to reorder · Alt+Up/Down" onPointerDown={event => {
        if (event.button !== 0) return
        event.preventDefault(); event.stopPropagation(); event.currentTarget.focus({ preventScroll: true })
        drag.current = { id: entry.id, pointer: event.pointerId, y: event.clientY, before: undefined, moved: false }
        event.currentTarget.setPointerCapture(event.pointerId)
      }} onPointerMove={event => {
        const current = drag.current
        if (!current || current.pointer !== event.pointerId) return
        if (Math.abs(event.clientY - current.y) > 4) current.moved = true
        if (!current.moved) return
        const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-task-property-row]')
        current.before = undefined
        if (target && root.current?.contains(target)) {
          const at = entries.findIndex(entry => entry.id === target.dataset.taskPropertyRow), rect = target.getBoundingClientRect()
          if (at >= 0) current.before = event.clientY > rect.top + rect.height / 2 ? entries[at + 1]?.id ?? null : entries[at].id
        }
        setIndicator(current.before)
      }} onPointerUp={event => {
        const current = drag.current
        cancel()
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
        if (current?.pointer === event.pointerId && current.moved && current.before !== undefined && current.id !== current.before) move(current.id, current.before)
      }} onPointerCancel={cancel} onLostPointerCapture={cancel} onKeyDown={event => {
        if (event.key === 'Escape' && drag.current) { event.preventDefault(); event.stopPropagation(); const pointer = drag.current.pointer; cancel(); if (event.currentTarget.hasPointerCapture(pointer)) event.currentTarget.releasePointerCapture(pointer); return }
        if (!event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return
        event.preventDefault(); event.stopPropagation()
        if (event.key === 'ArrowUp' && index > 0) move(entry.id, entries[index - 1].id)
        if (event.key === 'ArrowDown' && index < entries.length - 1) move(entry.id, entries[index + 2]?.id ?? null)
      }}><svg viewBox="0 0 16 20" aria-hidden="true" fill="currentColor">{[5, 10, 15].flatMap(y => [5, 11].map(x => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.2" />))}</svg></button>}
      {entry.content}
    </div>)}
    {error && <p role="alert">{error}</p>}<span className="sr-only" role="status">{announcement}</span>
  </div>
}
