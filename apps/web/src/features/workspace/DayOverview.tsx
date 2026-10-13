import { useState, type ReactNode } from 'react'
import { Button } from '@chakra-ui/react'
import type { Task } from './demo'
import { Icon } from './Icon'

export type Kind = 'Task' | 'Food' | 'Exercise' | 'Meds' | 'Habit'
export type DayEntry = { id: string; time: string; kind: Kind; title: string; detail: string; done: boolean; taskId?: number }
export const sampleEntries: DayEntry[] = [
  { id: 'breakfast', time: '08:30', kind: 'Food', title: 'Breakfast', detail: 'A simple meal to start the day', done: false },
  { id: 'meds', time: '09:00', kind: 'Meds', title: 'Review your medication reminders', detail: 'Example check-in · No prescription or dose connected', done: false },
  { id: 'lunch', time: '12:30', kind: 'Food', title: 'Lunch', detail: 'Decide what is ready to eat', done: false },
  { id: 'exercise', time: '17:00', kind: 'Exercise', title: 'Make time for movement', detail: 'Choose a walk or your planned session', done: false },
  { id: 'habit', time: '20:00', kind: 'Habit', title: 'A short evening reset', detail: 'Put things away and prepare for tomorrow', done: false },
]
export const actionLabel = (item: DayEntry) => item.kind === 'Meds' ? 'Mark reviewed' : item.kind === 'Food' ? 'Log meal' : item.kind === 'Exercise' ? 'Log exercise' : 'Mark done'

export function DayOverview({ tasks, extras, onTaskChange, onExtraChange, garden }: { tasks: Task[]; extras: DayEntry[]; garden?: ReactNode; onTaskChange: (id: number, done: boolean) => void; onExtraChange: (id: string, done: boolean) => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [lastCompleted, setLastCompleted] = useState<DayEntry | null>(null)
  const entries: DayEntry[] = [
    ...tasks.slice(0, 2).map((task, index) => ({ id: `task-${task.id}`, taskId: task.id, time: index === 0 ? '08:00' : '10:30', kind: 'Task' as const, title: task.title, detail: 'Daily plan', done: task.done })),
    ...extras,
  ].sort((a, b) => a.time.localeCompare(b.time))
  const recentCompletion = lastCompleted && entries.some(item => item.id === lastCompleted.id && item.done) ? lastCompleted : null
  const pending = entries.filter(item => !item.done)
  const next = pending.find(item => item.id === selectedId) ?? pending[0]
  const changeDone = (item: DayEntry, done: boolean) => {
    if (item.taskId !== undefined) onTaskChange(item.taskId, done)
    else onExtraChange(item.id, done)
  }
  const complete = () => { if (!next) return; changeDone(next, true); setLastCompleted(next); setSelectedId(null) }
  const chooseAnother = () => { if (!next) return; setSelectedId(pending[(pending.findIndex(item => item.id === next.id) + 1) % pending.length]?.id ?? null) }
  const undo = () => { if (!lastCompleted) return; changeDone(lastCompleted, false); setSelectedId(lastCompleted.id); setLastCompleted(null) }
  return <div className="day-overview">
    <section className="focus-task" aria-labelledby="focus-heading"><div className="quest-portrait" aria-hidden="true"><svg viewBox="0 0 16 22"><image href="/farm/farmer.png" width="64" height="24" /></svg></div>
      <div className="focus-caption"><span>Up next{next ? ` · ${next.kind}` : ''}</span><span>{entries.filter(item => item.done).length} of {entries.length} checked in</span></div>
      <h2 id="focus-heading">{next?.title ?? 'Your planned day is complete.'}</h2>
      {next && <><p className="next-context">{next.time} · {next.detail}</p><div className="focus-actions"><Button className="focus-done" onClick={complete}><Icon name="check" size={18} />{actionLabel(next)}</Button>{pending.length > 1 && <button className="choose-another" onClick={chooseAnother}>Choose another</button>}</div></>}
    </section>
    <div className="completion-message" role="status">{recentCompletion && <><span>{recentCompletion.kind === 'Meds' ? 'Reminder reviewed' : 'Logged'}: {recentCompletion.title}</span><button onClick={undo}>Undo</button></>}</div>
    {garden}
    <details className="day-agenda" aria-labelledby="agenda-heading">
      <summary className="agenda-heading"><h2 id="agenda-heading">Day journal</h2><span>Open your whole day</span></summary>
      <ol className="agenda-list">{entries.map(item => <li className={`agenda-row ${item.id === next?.id ? 'is-next' : ''} ${item.done ? 'is-done' : ''}`} key={item.id}>
        <span className="agenda-time">{item.time}</span>
        <div className="agenda-copy"><span className="agenda-kind">{item.kind}</span><span className="agenda-title">{item.title}</span>{item.kind === 'Meds' && <span className="agenda-detail">Reminder review only; no dose logged.</span>}</div>
        {item.done ? <button className="agenda-status" aria-label={`${item.kind === 'Food' ? 'Undo latest meal log for' : 'Undo'} ${item.title}`} onClick={() => { changeDone(item, false); setSelectedId(item.id); setLastCompleted(null) }}><Icon name="check" size={16} /><span>{item.kind === 'Meds' ? 'Reviewed' : 'Done'}</span></button> : <button className={`agenda-pick ${item.id === next?.id ? 'selected' : ''}`} aria-label={`Focus on ${item.title}`} aria-pressed={item.id === next?.id} onClick={() => setSelectedId(item.id)}>{item.id === next?.id ? 'Up next' : 'Make next'}</button>}
      </li>)}</ol>
    </details>
  </div>
}
