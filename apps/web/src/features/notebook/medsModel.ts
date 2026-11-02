export type MedsPhase = 'onset' | 'strongest' | 'wearing_off'
export const phases: MedsPhase[] = ['onset', 'strongest', 'wearing_off']
export const phaseLabels: Record<MedsPhase, string> = { onset: 'Started', strongest: 'Peak', wearing_off: 'Wearing off' }
export type MedsDose = { id: number; taken_at: string; dose_mg: number; owner_day?: string }
export type MedsEvent = { id: number; dose_id: number; event_type: MedsPhase; occurred_at: string }
export type MedsSnapshot = { medication: { id: number; slug: 'vyvanse'; name: string; dose_presets: number[] }; timezone: string; owner_day: string; range: 'all'; fetched_at: string; doses: MedsDose[]; events: MedsEvent[] }
export function wallInput(iso: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso))
  const get = (key: string) => parts.find(part => part.type === key)!.value
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
}
export const medDay = (iso: string, zone: string) => wallInput(iso, zone).slice(0, 10)
export const medClock = (iso: string, zone: string) => new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso))
export function wallISO(wall: string, zone: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(wall)) throw new Error('Choose a date and time.')
  const target = Date.parse(wall + 'Z')
  let instant = target
  for (let attempt = 0; attempt < 4; attempt++) instant += target - Date.parse(wallInput(new Date(instant).toISOString(), zone) + 'Z')
  const iso = new Date(instant).toISOString()
  if (wallInput(iso, zone) !== wall) throw new Error('This time does not exist in your timezone.')
  return iso
}
export const elapsed = (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / 60_000
export const duration = (minutes: number | null) => minutes == null ? '—' : minutes < 60 ? `${Math.round(minutes)} min` : `${Math.floor(Math.round(minutes) / 60)}h ${String(Math.round(minutes) % 60).padStart(2, '0')}m`
export function doseRows(snapshot: MedsSnapshot) {
  return [...snapshot.doses].sort((a, b) => Date.parse(a.taken_at) - Date.parse(b.taken_at)).map(dose => {
    const events = Object.fromEntries(snapshot.events.filter(event => event.dose_id === dose.id).map(event => [event.event_type, event.occurred_at])) as Partial<Record<MedsPhase, string>>
    const valid = (type: MedsPhase) => events[type] && elapsed(dose.taken_at, events[type]!) >= 0 && elapsed(dose.taken_at, events[type]!) <= 36 * 60
    const onset = valid('onset') ? elapsed(dose.taken_at, events.onset!) : null
    const peak = valid('strongest') ? elapsed(dose.taken_at, events.strongest!) : null
    const effect = valid('onset') && valid('wearing_off') && elapsed(events.onset!, events.wearing_off!) >= 0 ? elapsed(events.onset!, events.wearing_off!) : null
    return { ...dose, events, day: medDay(dose.taken_at, snapshot.timezone), onset, peak, effect }
  })
}
export function median(values: Array<number | null>) {
  const ordered = values.filter((value): value is number => value !== null && Number.isFinite(value)).sort((a, b) => a - b)
  return ordered.length ? (ordered[Math.floor((ordered.length - 1) / 2)] + ordered[Math.floor(ordered.length / 2)]) / 2 : null
}

export function timelineScale(values: number[], relative: boolean) {
  const finite = values.filter(Number.isFinite)
  const low = relative ? 0 : Math.floor(Math.min(...finite, 6) / 2) * 2
  const high = Math.max(low + 4, ...finite)
  const step = high - low > 30 ? 6 : high - low > 16 ? 4 : 2
  const start = relative ? 0 : Math.floor(low / step) * step
  const end = Math.max(start + step * 2, Math.ceil((high + .5) / step) * step)
  return { start, end, step, ticks: Array.from({ length: Math.round((end - start) / step) + 1 }, (_, i) => start + i * step) }
}
