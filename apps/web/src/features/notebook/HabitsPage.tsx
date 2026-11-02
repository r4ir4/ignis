import { MoodTracker } from './MoodTracker'
import type { MoodEntry } from './moodModel'
import { useEffect, useState } from 'react'
import type { Page } from './notebookModel'
import { PropertyPopover } from './TaskPropertyControls'
import { localHabitDay, shiftHabitDay, toggleHabitDay, type Habit } from './habitsModel'
import './habits.css'
import { ReadingTracker } from './ReadingTracker'
import type { ReadingData } from './readingModel'
import { RairaHabits } from './RairaHabits'
const dayLabel = (day: string, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) => new Date(day + 'T12:00:00Z').toLocaleDateString('en-GB', { ...options, timeZone: 'UTC' })
function HabitMenu({ habit, change }: { habit: Habit; change: (change: (habits: Habit[]) => Habit[]) => void }) {
  const [title, setTitle] = useState(habit.title)
  useEffect(() => setTitle(habit.title), [habit.title])
  return <PropertyPopover label={`Manage ${habit.title}`} trigger={<span aria-hidden="true">•••</span>}>{close => <div className="habits-menu"><form onSubmit={event => { event.preventDefault(); if (!title.trim()) return; change(items => items.map(item => item.id === habit.id ? { ...item, title: title.trim() } : item)); close() }}><label>Habit name<input maxLength={120} required value={title} onChange={event => setTitle(event.target.value)} /></label><button type="submit" className="notebook-property-menu-row">Save name</button></form><div className="notebook-property-menu-divider" /><button type="button" className="notebook-property-menu-row" onClick={() => { change(items => items.map(item => item.id === habit.id ? { ...item, archived: true } : item)); close() }}>Archive habit</button><p>Past check-ins are kept.</p></div>}</PropertyPopover>
}
export function HabitsPage({ page, change, changeReading, changeMoods }: { changeMoods: (change: (entries: MoodEntry[]) => MoodEntry[]) => void; changeReading: (change: (data: ReadingData) => ReadingData) => void; page: Page; change: (change: (habits: Habit[]) => Habit[]) => void }) {
  const [today, setToday] = useState(localHabitDay)
  useEffect(() => { const refresh = () => setToday(localHabitDay()); const timer = window.setInterval(refresh, 30_000); window.addEventListener('focus', refresh); return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh) } }, [])
  const habits = page.habits || [], active = habits.filter(habit => !habit.archived), archived = habits.filter(habit => habit.archived)
  const days = Array.from({ length: 7 }, (_, i) => shiftHabitDay(today, i - 6))
  const completed = active.filter(habit => habit.completions.includes(today)).length
  const mark = (id: string, date: string) => change(items => toggleHabitDay(items, id, date, localHabitDay()))
  return <div className="habits-page"><RairaHabits mood={(month, today) => <MoodTracker entries={page.moods || []} change={changeMoods} month={month} today={today} readOnly={!!page.locked} />} reading={(month, today) => <ReadingTracker data={page.reading || { books: [], entries: [] }} change={changeReading} month={month} today={today} readOnly={!!page.locked} />} title={page.title} readOnly={!!page.locked} localCount={active.length} localCompleted={completed}>
    {active.map(habit => <article className="habits-row" key={habit.id}><div className="habits-name"><h3>{habit.title}</h3><span>{habit.completions.filter(mark => days.includes(mark)).length} check-ins in the last 7 days</span></div><div className="habits-week" role="group" aria-label={`${habit.title} last seven days`}>{days.map(date => <div key={date}><span>{dayLabel(date, { weekday: 'narrow' })}</span><button type="button" disabled={page.locked || date < habit.createdOn} aria-label={`${habit.title}, ${dayLabel(date, { day: 'numeric', month: 'long', year: 'numeric' })}`} aria-pressed={habit.completions.includes(date)} className={date === today ? 'is-today' : ''} onClick={() => mark(habit.id, date)}>{habit.completions.includes(date) ? '✓' : dayLabel(date, { day: 'numeric' })}</button></div>)}</div><button type="button" className="habits-check" disabled={page.locked || today < habit.createdOn} aria-label={`Mark ${habit.title} for ${today}`} aria-pressed={habit.completions.includes(today)} onClick={() => mark(habit.id, today)}><span aria-hidden="true">{habit.completions.includes(today) ? '✓' : ''}</span><span>{habit.completions.includes(today) ? 'Done' : 'Check in'}</span></button>{!page.locked && <HabitMenu habit={habit} change={change} />}</article>)}
    {archived.length > 0 && <details className="habits-archived"><summary>Archived habits · {archived.length}</summary>{archived.map(habit => <div key={habit.id}><span>{habit.title}<small>{habit.completions.length} saved check-ins</small></span><button type="button" disabled={page.locked} onClick={() => change(items => items.map(item => item.id === habit.id ? { ...item, archived: false } : item))}>Restore</button></div>)}</details>}
  </RairaHabits></div>
}
