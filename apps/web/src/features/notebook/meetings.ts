export type MeetingEvent = { id: string; title: string; start: string; end: string; allDay: boolean; startDay?: string; endDay?: string; location?: string }
const dayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

export function groupMeetingsByDay(events: MeetingEvent[], now = new Date()) {
  const today = dayKey(now)
  const tomorrowDate = new Date(now)
  tomorrowDate.setDate(tomorrowDate.getDate() + 1)
  const tomorrow = dayKey(tomorrowDate)
  const groups = new Map<string, { day: string; label: string; events: MeetingEvent[] }>()
  for (const event of [...events].sort((a, b) => Date.parse(a.start) - Date.parse(b.start))) {
    // Calendar all-day dates are date-only values, independent of UTC offsets.
    const startDay = event.allDay && event.startDay ? event.startDay : dayKey(new Date(event.start))
    const day = startDay < today ? today : startDay
    if (!groups.has(day)) {
      const [year, month, date] = day.split('-').map(Number)
      const label = day === today ? 'Today' : day === tomorrow ? 'Tomorrow' : new Date(year, month - 1, date).toLocaleDateString('en', { weekday: 'long', month: 'short', day: 'numeric', ...(year !== now.getFullYear() ? { year: 'numeric' } : {}) })
      groups.set(day, { day, label, events: [] })
    }
    groups.get(day)!.events.push(event)
  }
  return [...groups.values()].sort((a, b) => a.day.localeCompare(b.day))
}

export function meetingsForDay(events: MeetingEvent[], now = new Date()): MeetingEvent[] {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  const today = dayKey(start)
  return events.filter(event => {
    if (!event || typeof event.id !== 'string' || typeof event.title !== 'string') return false
    const from = Date.parse(event.start)
    const until = Date.parse(event.end)
    if (!Number.isFinite(from) || !Number.isFinite(until) || until < from) return false
    if (event.allDay && event.startDay && event.endDay) return event.startDay <= today && event.endDay > today
    return from < end.getTime() && (until > start.getTime() || from === until && from >= start.getTime())
  }).sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
}
