import { invalidateMedsSnapshot } from './medsSnapshotCache'
import { habitSnapshotCache } from './habitSnapshotCache'
import { HabitMonth, habitStyle } from './HabitVisuals'
import { shiftHabitMonth } from './habitCalendarModel'
import { Dropdown } from '../../components/Dropdown'
import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { PropertyPopover } from './TaskPropertyControls'
import { cadenceLabels, habitDayMark, rairaHabitMark, type RairaHabit, type RairaHabitMark, type RairaHabitsSnapshot } from './rairaHabitsModel'
const dateLabel = (day: string, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) => new Date(day + 'T12:00:00Z').toLocaleDateString('en-GB', { ...options, timeZone: 'UTC' })
async function request(path = '', options?: RequestInit): Promise<RairaHabitsSnapshot> {
  const response = await fetch('/api/habits' + path, options)
  if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(typeof body.detail === 'string' ? body.detail : 'Could not reach Ignis habit storage. Refresh before retrying.') }
  const snapshot = await response.json() as RairaHabitsSnapshot
  if (path === '/mark' && options?.method === 'POST') invalidateMedsSnapshot()
  return snapshot
}
function ConnectedHabit({ habit, today, month, disabled, mark, markDay, edit, archive }: { today: string; month: string; habit: RairaHabit; disabled: boolean; mark: (habit: RairaHabit, undo?: boolean) => void; markDay: (habit: RairaHabit, day: string) => void; edit: (habit: RairaHabit) => void; archive: (habit: RairaHabit) => void }) {
  const [selected, setSelected] = useState<string | null>(null), [showHistory, setShowHistory] = useState(false)
  const canMark = habit.status === 'active' && habit.due && !habit.rest_day
  const inspect = habit.history.find(period => period.date === selected)
  return <article className="habit-calendar-card" style={habitStyle(habit.id)}><header className="habit-card-heading"><div><h3>{habit.name}</h3><p>{habit.section} · {habit.target_count} per {cadenceLabels[habit.cadence]}</p></div>
</header><HabitMonth line disabled={disabled} toggle={day => habit.cadence === 'daily' ? markDay(habit, day) : mark(habit, habit.period_done)} habit={habit} month={month} today={today} selected={selected} inspect={day => setSelected(value => value === day ? null : day)} /><div className="habit-card-stats"><span title="Current streak"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2C9 5 12 6 12 10a4 4 0 0 1-8 0c0-2 1-3 2-4 0 2 1 2 1 2S9 6 8 2Z" /></svg>{habit.current_streak} {cadenceLabels[habit.cadence]}{habit.current_streak === 1 ? '' : 's'}</span><span title={`${habit.totals.completed} of ${habit.totals.periods} periods completed across all time`}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 2h6v5a3 3 0 0 1-6 0V2ZM5 3H2v2a3 3 0 0 0 3 3m6-5h3v2a3 3 0 0 1-3 3M8 10v4m-3 0h6" /></svg>{habit.totals.percent}%<small>all time</small></span></div>
    <PropertyPopover label={`View ${habit.name} details`} trigger={<span aria-hidden="true">•••</span>}>{close => <div className="habits-menu"><button type="button" className="notebook-property-menu-row" disabled={disabled} onClick={() => { close(); edit(habit) }}>Edit habit</button><button type="button" className="notebook-property-menu-row" disabled={disabled} onClick={() => { close(); archive(habit) }}>Archive habit</button><div className="notebook-property-menu-divider" /><button type="button" className="notebook-property-menu-row" onClick={() => { setShowHistory(value => !value); close() }}>{showHistory ? 'Hide' : 'Show'} history</button>{habit.completed_count > 0 && canMark && <button type="button" className="notebook-property-menu-row" disabled={disabled} onClick={() => { mark(habit, true); close() }}>Undo latest check-in</button>}<p>{habit.totals.completed} of {habit.totals.periods} {cadenceLabels[habit.cadence]}s completed · {habit.totals.percent}%</p><p>{habit.current_streak} {cadenceLabels[habit.cadence]} streak</p></div>}</PropertyPopover>
    {inspect && <p className="raira-habit-inspection" role="status">{dateLabel(inspect.date, { day: 'numeric', month: 'long', year: 'numeric' })} · {inspect.rest ? 'Rest day' : `${inspect.count} of ${habit.target_count} check-ins`}{habit.cadence !== 'daily' ? ` · ${cadenceLabels[habit.cadence]} starting` : ''}</p>}
    {showHistory && <div className="raira-habit-history"><p>Recorded history · {habit.totals.completed} completed {cadenceLabels[habit.cadence]}s across all time</p><div><table><caption>{habit.name} · {habit.cadence === 'daily' ? 'Daily' : 'Period'} totals</caption><thead><tr><th>Period starting</th><th>Check-ins</th><th>Status</th></tr></thead><tbody>{[...habit.history].reverse().map(period => <tr key={period.date}><th>{period.date}</th><td>{period.count} / {habit.target_count}</td><td>{period.rest ? 'Rest' : period.checked ? 'Complete' : 'Incomplete'}</td></tr>)}</tbody></table></div></div>}
  </article>
}
export function RairaHabits({ title = 'Habits', children, localCount = 0, localCompleted = 0, readOnly = false, reading, mood }: { mood?: (month: string, today: string) => ReactNode; reading?: (month: string, today: string) => ReactNode; title?: string; children?: ReactNode; localCount?: number; localCompleted?: number; readOnly?: boolean }) {
  const [snapshot, setSnapshot] = useState<RairaHabitsSnapshot | null>(habitSnapshotCache.value), [error, setError] = useState(''), [loading, setLoading] = useState(!habitSnapshotCache.value), [saving, setSaving] = useState(false)
  const pending = useRef(false), generation = useRef(0)
  const [tab, setTab] = useState<'habits' | 'medications' | 'paused' | 'read' | 'mood'>('habits')
  const tabId = useId(), dialog = useRef<HTMLDialogElement>(null)
  const [calendarMonth, setCalendarMonth] = useState<string | null>(null)
  const [editing, setEditing] = useState<RairaHabit | null>(null)
  const [adding, setAdding] = useState(false), [createError, setCreateError] = useState('')
  const [draft, setDraft] = useState({ name: '', section: '', cadence: 'daily', target: '1' })
  useEffect(() => { if (adding) { dialog.current?.showModal(); dialog.current?.querySelector<HTMLInputElement>('input')?.focus() } }, [adding])
  const closeCreate = () => { if (!pending.current) { dialog.current?.close(); setAdding(false); setEditing(null); setCreateError('') } }
  async function createHabit(event: FormEvent) {
    event.preventDefault()
    if (pending.current || !draft.name.trim()) return
    pending.current = true; generation.current++; setSaving(true); setLoading(false); setCreateError('')
    try {
      const config = { name: draft.name.trim(), section: draft.section.trim() || 'Other', cadence: draft.cadence, target_count: Number(draft.target) }
      const body = editing ? { ...config, habit_id: editing.id, expected: { name: editing.name, section: editing.section, cadence: editing.cadence, target_count: editing.target_count } } : config
      const next = await request(editing ? '/edit' : '/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      habitSnapshotCache.value = next; setSnapshot(next); setError(''); setFailed(null); if (!editing) setTab('habits'); setEditing(null); setDraft({ name: '', section: '', cadence: 'daily', target: '1' }); dialog.current?.close(); setAdding(false)
    } catch (cause) { setCreateError(cause instanceof Error ? cause.message : 'Could not add this habit. Retry with the same name.') }
    finally { pending.current = false; setSaving(false) }
  }
  const [failed, setFailed] = useState<RairaHabitMark | null>(null)
  const load = useCallback(async () => { const version = ++generation.current; setLoading(true); try { const next = await request(); if (generation.current === version) { habitSnapshotCache.value = next; setSnapshot(next); setError('') } } catch (cause) { if (generation.current === version) setError(cause instanceof Error ? cause.message : 'Could not load habits.') } finally { if (generation.current === version) setLoading(false) } }, [])
  useEffect(() => { void load(); const refresh = () => { if (!document.hidden && !pending.current) void load() }; const timer = window.setInterval(refresh, 60_000); window.addEventListener('focus', refresh); window.addEventListener('ignis:habits-updated', refresh); document.addEventListener('visibilitychange', refresh); return () => { generation.current++; window.clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener('ignis:habits-updated', refresh); document.removeEventListener('visibilitychange', refresh) } }, [load])
  async function save(body: RairaHabitMark) {
    if (pending.current) return
    pending.current = true; generation.current++; setSaving(true); setLoading(false); setError(''); setFailed(null)
    try { const next = await request('/mark', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); habitSnapshotCache.value = next; setSnapshot(next);  }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save this check-in.'); setFailed(body) }
    finally { pending.current = false; setSaving(false) }
  }
  function editHabit(habit: RairaHabit) {
    setEditing(habit); setCreateError(''); setDraft({ name: habit.name, section: habit.section, cadence: habit.cadence, target: String(habit.target_count) }); setAdding(true)
  }
  async function archiveHabit(habit: RairaHabit) {
    if (pending.current || readOnly || error) return
    pending.current = true; generation.current++; setSaving(true); setLoading(false); setFailed(null)
    try {
      const next = await request('/archive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ habit_id: habit.id, expected: { name: habit.name, section: habit.section, cadence: habit.cadence, target_count: habit.target_count } }) })
      habitSnapshotCache.value = next; setSnapshot(next); setError('')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not archive this habit. Refresh to check its status.') }
    finally { pending.current = false; setSaving(false) }
  }
  const mark = (habit: RairaHabit, undo = false) => { if (!snapshot || error || readOnly || pending.current) return; const body = rairaHabitMark(habit, snapshot.owner_day, undo, true); if (body) void save(body) }
  const markDay = (habit: RairaHabit, day: string) => { if (!snapshot || error || readOnly || pending.current) return; const body = habitDayMark(habit, day, snapshot.owner_day); if (body) void save(body) }
  const regular = snapshot?.habits.filter(habit => habit.status === 'active' && !habit.medication_linked) || []
  const linked = snapshot?.habits.filter(habit => habit.status === 'active' && habit.medication_linked) || []
  const paused = snapshot?.habits.filter(habit => habit.status !== 'active') || []
  useEffect(() => { if (tab === 'paused' && snapshot && !paused.length) setTab('habits') }, [tab, paused.length, !!snapshot])
  const month = calendarMonth || snapshot?.owner_day.slice(0, 7) || new Date().toISOString().slice(0, 7)
  const candidates = tab === 'medications' ? linked : tab === 'paused' ? paused : regular
  const tabs = [{ id: 'habits', label: 'Habits', count: regular.length + localCount }, { id: 'medications', label: 'Medication-linked', count: linked.length }, ...(mood ? [{ id: 'mood', label: 'Mood', count: null }] : []), ...(reading ? [{ id: 'read', label: 'Read', count: null }] : []), ...(paused.length ? [{ id: 'paused', label: 'Paused', count: paused.length }] : [])] as const
  return <section className="raira-habits" aria-label="Habit tracker"><div className="habit-page-title-row"><h1 className="notebook-title" id="notebook-title">{title}</h1><div className="habit-month-nav"><button type="button" aria-label="Previous month" onClick={() => setCalendarMonth(shiftHabitMonth(month, -1))}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m10 4-4 4 4 4" /></svg></button><span>{dateLabel(month + '-01', { month: 'long', year: 'numeric' })}</span><button type="button" aria-label="Next month" disabled={!snapshot || month >= snapshot.owner_day.slice(0, 7)} onClick={() => setCalendarMonth(shiftHabitMonth(month, 1))}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 4 4 4-4 4" /></svg></button>{snapshot && month !== snapshot.owner_day.slice(0, 7) && <button type="button" onClick={() => setCalendarMonth(null)}>Today</button>}</div></div>{tab !== 'read' && tab !== 'mood' && <header className="habits-toolbar"><div><h2>Today</h2><p>{snapshot ? <>{dateLabel(snapshot.owner_day, { weekday: 'short', day: 'numeric', month: 'short' })}</> : 'Your habits and check-in history'}</p></div><button type="button" className="habits-new-button" disabled={saving || readOnly || !snapshot || !!error} onClick={() => { setEditing(null); setDraft({ name: '', section: '', cadence: 'daily', target: '1' }); setCreateError(''); setAdding(true) }}>＋ New habit</button></header>}
    <div className="habits-tabs" role="tablist" aria-label="Habit categories" onKeyDown={event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
      const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')], index = buttons.indexOf(event.target as HTMLButtonElement)
      if (index < 0) return
      event.preventDefault()
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length
      buttons[next].click(); buttons[next].focus()
    }}>{tabs.map(item => <button key={item.id} type="button" role="tab" id={`${tabId}-${item.id}`} aria-selected={tab === item.id} aria-controls={`${tabId}-panel`} tabIndex={tab === item.id ? 0 : -1} onClick={() => setTab(item.id as typeof tab)}>{item.label}{item.count !== null && <span>{item.count}</span>}</button>)}</div>
    {error && <div className="habits-connection-error" role="alert"><span>{error}</span><button type="button" disabled={saving || loading} onClick={() => void load()}>Refresh</button>{failed && <button type="button" disabled={saving} onClick={() => void save(failed)}>Retry same check-in</button>}</div>}
    <div role="tabpanel" id={`${tabId}-panel`} aria-labelledby={`${tabId}-${tab}`} tabIndex={0}>
      {!snapshot && loading ? <p className="habits-connection-loading" role="status">Loading your habits…</p> : snapshot && <>


        {tab === 'mood' ? mood?.(month, snapshot.owner_day) : tab === 'read' ? reading?.(month, snapshot.owner_day) : <><div className="habit-card-grid">{candidates.map(habit => <ConnectedHabit key={habit.id} habit={habit} today={snapshot.owner_day} month={month} disabled={saving || readOnly || !!error} mark={mark} markDay={markDay} edit={editHabit} archive={habit => void archiveHabit(habit)} />)}{tab === 'habits' && children}</div>
        {!candidates.length && !(tab === 'habits' && localCount) && <p className="habits-connection-loading">{tab === 'habits' ? 'Add your first habit to start tracking your days.' : 'No habits in this category.'}</p>}</>}
      </>}
      {!snapshot && tab === 'habits' && children}
    </div>
    <dialog ref={dialog} className="habits-create-dialog notebook-settings" aria-labelledby={`${tabId}-create-title`} onCancel={event => { event.preventDefault(); closeCreate() }} onClick={event => { if (event.target === event.currentTarget) closeCreate() }}>
      <form onSubmit={createHabit}><header><h2 id={`${tabId}-create-title`}>{editing ? 'Edit habit' : 'New habit'}</h2><button type="button" aria-label={editing ? 'Close edit habit' : 'Close new habit'} disabled={saving} onClick={closeCreate}>×</button></header>
        <label>Habit name<input autoFocus required maxLength={200} placeholder="e.g. Read a few pages" value={draft.name} disabled={saving} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
        <label>Category<input maxLength={80} placeholder="Other" value={draft.section} disabled={saving} onChange={event => setDraft({ ...draft, section: event.target.value })} /></label>
        <div className="habits-create-target"><label>Repeat<Dropdown aria-label="Repeat" value={draft.cadence} disabled={saving || !!editing && (editing.history.some(period => period.count > 0) || editing.totals.completed > 0)} onValueChange={cadence => setDraft({ ...draft, cadence })}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></Dropdown></label><label>Check-ins per {draft.cadence === 'weekly' ? 'week' : draft.cadence === 'monthly' ? 'month' : 'day'}<input type="number" min="1" max="50" step="1" required value={draft.target} disabled={saving} onChange={event => setDraft({ ...draft, target: event.target.value })} /></label></div>
        {editing && <p className="habits-edit-note">Past check-ins are kept. Repeat stays fixed once check-ins exist.</p>}
        {createError && <p className="habits-connection-error" role="alert">{createError}</p>}<footer><button type="button" disabled={saving} onClick={closeCreate}>Cancel</button><button type="submit" disabled={saving || !draft.name.trim()}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Add habit'}</button></footer>
      </form>
    </dialog>
  </section>
}
