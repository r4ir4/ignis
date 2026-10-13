import { Button } from '@chakra-ui/react'
import { actionLabel, type DayEntry, type Kind } from './DayOverview'
import { previewToday } from './Calendar'
import { Icon } from './Icon'

export const categoryKinds = { Food: 'Food', Exercises: 'Exercise', Meds: 'Meds', Habits: 'Habit' } as const satisfies Record<string, Kind>
export type CategoryName = keyof typeof categoryKinds
const introductions: Record<CategoryName, string> = {
  Food: 'See your meals and check in after eating.',
  Exercises: 'Keep your planned movement in view.',
  Meds: 'Review reminders in one place. These are sample check-ins, with no prescriptions or doses connected.',
  Habits: 'Small actions you can return to each day.',
}

export function CategoryPage({ name, entries, onChange }: { name: CategoryName; entries: DayEntry[]; onChange: (id: string, done: boolean) => void }) {
  const items = entries.filter(item => item.kind === categoryKinds[name])
  return <section className="category-page" aria-labelledby="category-heading">
    <div className="document-title"><h1 id="category-heading">{name}</h1><span>{previewToday.toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric' })} · Sample day</span></div>
    <p className="document-intro">{introductions[name]}</p>
    <div className="agenda-heading"><h2>{name === 'Food' ? 'Your meals' : name === 'Exercises' ? 'Planned movement' : name === 'Meds' ? 'Reminder reviews' : 'Your checklist'}</h2><span aria-live="polite">{items.filter(item => item.done).length} of {items.length} {name === 'Meds' ? 'reviewed' : 'done'}</span></div>
    <ul className="category-list">{items.map(item => <li className={`category-row ${item.done ? 'is-done' : ''}`} key={item.id}>
      <span className="agenda-time">{item.time}</span>
      <div className="category-copy"><h3>{item.title}</h3><p>{item.detail}</p>{item.done && <span className="category-status"><Icon name="check" size={14} />{name === 'Meds' ? 'Reminder reviewed · No dose logged' : 'Logged for today'}</span>}</div>
      <Button className={item.done ? 'category-undo' : 'category-log'} onClick={() => onChange(item.id, !item.done)} aria-label={`${item.done ? 'Undo' : actionLabel(item)}: ${item.title}`}>{item.done ? 'Undo' : actionLabel(item)}</Button>
    </li>)}</ul>
  </section>
}
