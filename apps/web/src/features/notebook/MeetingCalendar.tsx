import { useEffect, useState } from 'react'
import { meetingsForDay, type MeetingEvent } from './meetings'
type Connection = { connected: boolean; ready: boolean; pending: boolean; error: string; imported: { importedAt: number; rangeStart?: string; rangeEnd?: string; events: MeetingEvent[] } | null }
export function MeetingCalendar({ isLocal }: { isLocal: boolean }) {
  const [connection, setConnection] = useState<Connection | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [expanded, setExpanded] = useState(true)
  const [clock, setClock] = useState(() => new Date())
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  useEffect(() => {
    if (!isLocal) return
    const controller = new AbortController()
    const refresh = async () => {
      setClock(new Date())
      try {
        const response = await fetch('/api/apple-calendar/status', { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) })
        if (!response.ok) throw new Error('Calendar connection is unavailable. Retry in a moment.')
        const value: Connection = await response.json()
        if (!Array.isArray(value.imported?.events) && value.imported !== null) throw new Error('Calendar returned invalid data.')
        if (!controller.signal.aborted) { setConnection(value); setError(value.error || ''); setClock(new Date()) }
      } catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Calendar is unavailable.') }
    }
    void refresh()
    const interval = window.setInterval(() => { if (!document.hidden) void refresh() }, connection?.pending ? 2000 : 60000)
    const focus = () => void refresh()
    window.addEventListener('focus', focus)
    return () => { controller.abort(); window.clearInterval(interval); window.removeEventListener('focus', focus) }
  }, [isLocal, connection?.pending])
  async function calendarAction() {
    setBusy(true); setError('')
    try {
      const response = await fetch(`/api/apple-calendar/${connection?.connected ? 'import' : 'connect'}`, { method: 'POST', signal: AbortSignal.timeout(60000) })
      const value = await response.json()
      if (!response.ok) throw new Error(typeof value.detail === 'string' ? value.detail : 'Calendar could not connect.')
      if (connection?.connected) setConnection({ ...connection, imported: value })
      else setConnection(previous => ({ connected: false, ready: true, error: '', imported: null, ...previous, pending: true }))
      setClock(new Date())
    } catch (error) { setError(error instanceof Error ? error.message : 'Calendar is unavailable.') }
    finally { setBusy(false) }
  }
  const day = selectedDay || clock
  const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  const isToday = dateKey(day) === dateKey(clock)
  const dateLabel = day.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric', ...(day.getFullYear() !== clock.getFullYear() ? { year: 'numeric' } : {}) })
  const adjacentDay = (offset: number) => new Date(day.getFullYear(), day.getMonth(), day.getDate() + offset)
  const canNavigate = (offset: number) => {
    const key = dateKey(adjacentDay(offset))
    return (!connection?.imported?.rangeStart || key >= connection.imported.rangeStart) && (!connection?.imported?.rangeEnd || key <= connection.imported.rangeEnd)
  }
  const events = meetingsForDay(connection?.imported?.events || [], day)
  return <section className="notebook-meeting-calendar" aria-label="Meetings calendar">
    <button type="button" className="notebook-section-toggle" aria-expanded={expanded} aria-controls="notebook-upcoming-events" onClick={() => setExpanded(open => !open)}>Meetings</button>
    <div id="notebook-upcoming-events" hidden={!expanded}>
      {!isLocal ? <p className="notebook-meeting-caption">No calendar connected.</p> : connection?.connected ? <>
        <div className="notebook-meeting-day-nav">
          <button type="button" aria-label="Previous day's meetings" title="Previous day" disabled={!canNavigate(-1)} onClick={() => setSelectedDay(adjacentDay(-1))}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m14 6-6 6 6 6" /></svg></button>
          <time dateTime={dateKey(day)} aria-live="polite">{isToday ? `Today · ${day.toLocaleDateString('en', { month: 'short', day: 'numeric' })}` : dateLabel}</time>
          <button type="button" aria-label="Next day's meetings" title="Next day" disabled={!canNavigate(1)} onClick={() => setSelectedDay(adjacentDay(1))}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m10 6 6 6-6 6" /></svg></button>
          <button type="button" className="notebook-meeting-today" disabled={isToday} onClick={() => { setSelectedDay(null); setClock(new Date()) }}>Today</button>
        </div>
        {!events.length && <p className="notebook-meeting-caption">{isToday ? 'No meetings today.' : 'No meetings on this day.'}</p>}
        <ul className="notebook-meeting-events">{events.map(event => <li key={event.id} className="notebook-meeting-event"><span className="notebook-meeting-event-title">{event.title || 'Untitled event'}</span><time dateTime={event.start}>{event.allDay ? 'All day' : new Date(event.start).toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' })}</time></li>)}</ul>
      </> : <button type="button" className="notebook-calendar-connect" disabled={busy || connection?.pending} onClick={() => void calendarAction()}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 5h16v16H4zM8 2v6m8-6v6M4 10h16" /></svg>{busy || connection?.pending ? 'Waiting for calendar access…' : 'Connect your calendar'}</button>}
      {connection?.pending && <p className="notebook-meeting-caption">Allow calendar access in the macOS prompt to continue.</p>}
      {error && <p className="notebook-meeting-calendar-error" role="alert">{error}</p>}
    </div>
  </section>
}
