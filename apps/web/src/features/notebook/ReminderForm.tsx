import { useEffect, useRef, useState } from 'react'
import { inboxRequest, type Notification } from './useInbox'
function localTime(date: Date) { return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16) }
export function ReminderForm({ pageId, created }: { pageId: string; created: (dueAt: string) => void }) {
  const [time, setTime] = useState(() => localTime(new Date(Date.now() + 15 * 60000)))
  const [upcoming, setUpcoming] = useState<Notification[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const pending = useRef<{ key: string; dueAt: string; immediate: boolean } | null>(null)
  async function load() {
    try { setUpcoming(await inboxRequest<Notification[]>(`/reminders?pageId=${pageId}`)) }
    catch (error) { setError(error instanceof Error ? error.message : 'Scheduled reminders are unavailable.') }
  }
  useEffect(() => { void load() }, [pageId])
  async function schedule(now = false) {
    if (busy) return
    setBusy(true); setError('')
    try {
      if (!pending.current || pending.current.immediate !== now) {
        const date = now ? new Date() : new Date(time)
        if (!Number.isFinite(date.getTime())) throw new Error('Choose a reminder date and time.')
        pending.current = { key: crypto.randomUUID(), dueAt: date.toISOString(), immediate: now }
      }
      await inboxRequest('/reminders', { method: 'POST', body: JSON.stringify({ requestId: pending.current.key, pageId, dueAt: pending.current.dueAt }) })
      const scheduledFor = pending.current.dueAt; pending.current = null; created(scheduledFor)
    } catch (error) { setError(error instanceof Error ? error.message : 'The reminder could not be saved. Retry to keep the same reminder request.') }
    finally { setBusy(false) }
  }
  async function cancel(id: string) {
    setBusy(true); setError('')
    try { await inboxRequest(`/inbox/${id}`, { method: 'PATCH', body: JSON.stringify({ archived: true, read: true }) }); await load() }
    catch (error) { setError(error instanceof Error ? error.message : 'The reminder could not be canceled.') }
    finally { setBusy(false) }
  }
  return <>
    <p>Get a notification in your Ignis Inbox. It will appear when Ignis is open or when you return.</p>
    <form onSubmit={event => { event.preventDefault(); void schedule() }} className="notebook-reminder-form">
      <label htmlFor="notebook-reminder-time">Remind me at</label><input id="notebook-reminder-time" type="datetime-local" value={time} required disabled={busy} onChange={event => { pending.current = null; setTime(event.target.value) }} />
      <p>Times use {Intl.DateTimeFormat().resolvedOptions().timeZone}.</p>
      {error && <p role="alert">{error}</p>}
      <div className="flex gap-2 mt-4"><button type="submit" className="notebook-settings-save" disabled={busy}>Set reminder</button><button type="button" disabled={busy} onClick={() => void schedule(true)}>Remind me now</button></div>
    </form>
    {!!upcoming.length && <section className="notebook-reminder-upcoming" aria-label="Scheduled reminders"><h3>Scheduled for this page</h3>{upcoming.map(item => <div key={item.id}><time dateTime={item.dueAt}>{new Date(item.dueAt).toLocaleString()}</time><button type="button" disabled={busy} onClick={() => void cancel(item.id)}>Cancel reminder</button></div>)}</section>}
  </>
}
