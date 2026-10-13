import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button, Checkbox, Input } from '@chakra-ui/react'
import type { Task } from '../workspace/demo'
import { Icon } from '../workspace/Icon'
export function FarmPanel({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { if (ref.current && !ref.current.open) ref.current.showModal() }, [])
  return <dialog ref={ref} className="farm-panel" aria-labelledby="farm-panel-title" onCancel={event => { if (event.target === event.currentTarget) { event.preventDefault(); ref.current?.close(); onClose() } }}>
    <header className="farm-panel-header"><span id="farm-panel-title">{title}</span><button aria-label={`Close ${title}`} onClick={() => { ref.current?.close(); onClose() }}><Icon name="close" size={18} /></button></header>
    <div className="farm-panel-content">{children}</div>
  </dialog>
}
export function CottagePlanner({ tasks, onChange, onAdd }: { tasks: Task[]; onChange: (id: number, done: boolean) => void; onAdd: (title: string) => void }) {
  const [title, setTitle] = useState('')
  return <section className="cottage-planner" aria-labelledby="cottage-heading">
    <div className="document-title"><h1 id="cottage-heading">Your daily plan</h1><span>A few real-life quests. One at a time.</span></div>
    <form className="cottage-add" onSubmit={event => { event.preventDefault(); if (title.trim()) { onAdd(title.trim()); setTitle('') } }}><label htmlFor="cottage-new-task">Add a task</label><div><Input id="cottage-new-task" value={title} onChange={event => setTitle(event.target.value)} placeholder="What would you like to do?" maxLength={300} required /><Button className="category-log" type="submit" disabled={!title.trim()}>Add task</Button></div></form>
    <div className="agenda-heading"><h2>Your tasks</h2><span aria-live="polite">{tasks.filter(task => task.done).length} of {tasks.length} complete</span></div>
    <ul className="category-list">{tasks.map(task => <li className={task.done ? 'task-row completed' : 'task-row'} key={task.id}><Checkbox.Root className="task-checkbox" checked={task.done} onCheckedChange={event => onChange(task.id, event.checked === true)}><Checkbox.HiddenInput aria-label={`Complete ${task.title}`} /><Checkbox.Control className="task-check-control"><Checkbox.Indicator><Icon name="check" size={14} /></Checkbox.Indicator></Checkbox.Control><Checkbox.Label className="task-copy">{task.title}</Checkbox.Label></Checkbox.Root></li>)}</ul>
  </section>
}
