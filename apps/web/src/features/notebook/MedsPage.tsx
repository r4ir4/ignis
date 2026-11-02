import { medsSnapshotCache } from './medsSnapshotCache'
import { invalidateHabitSnapshot } from './habitSnapshotCache'
import { Dropdown } from '../../components/Dropdown'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { doseRows, duration, elapsed, timelineScale, medClock, median, medDay, phaseLabels, phases, wallInput, wallISO, type MedsPhase, type MedsSnapshot } from './medsModel'
import './meds.css'

type Entry = { kind: 'intake' | MedsPhase; doseId?: number; at: string; amount: string; key: string }
type QuickEntry = { dose_id: number; event_type: MedsPhase; occurred_at: string; clientEventId: string }
type QuickIntake = { dose_mg: number; taken_at: string; clientEventId: string }
type UndoMark = { kind: 'intake' | MedsPhase; dose_id: number; expected_at: string; dose_mg?: number }
type Row = ReturnType<typeof doseRows>[number]
const shortDay = (day: string) => new Date(day + 'T12:00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short' })
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch('/api/meds/vyvanse' + path, options)
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw Object.assign(new Error(typeof body.detail === 'string' ? body.detail : Array.isArray(body.detail) ? body.detail.map((item: { msg?: string }) => item.msg || 'Check the entered value.').join(' ') : response.status === 404 ? 'Ignis medication storage is unavailable. Start the API to load Meds.' : 'Could not save or load this entry. Please try again.'), { status: response.status })
  }
  const result = await response.json()
  if (options?.method && options.method !== 'GET') invalidateHabitSnapshot()
  return result
}

function TimingChart({ rows, zone }: { rows: Row[]; zone: string }) {
  const [relative, setRelative] = useState(false)
  const [detail, setDetail] = useState<{ key: string; text: string } | null>(null)
  const recent = [...rows].reverse()
  const hour = (row: Row, at: string) => relative ? elapsed(row.taken_at, at) / 60 : (Date.parse(wallInput(at, zone) + 'Z') - Date.parse(row.day + 'T00:00:00Z')) / 3_600_000
  const points = (row: Row) => [{ type: 'taken', at: row.taken_at, label: 'Taken' }, ...phases.flatMap(type => row.events[type] ? [{ type, at: row.events[type]!, label: phaseLabels[type] }] : [])]
  const scale = timelineScale(recent.flatMap(row => points(row).map(point => hour(row, point.at))), relative)
  const position = (value: number) => (value - scale.start) / (scale.end - scale.start) * 100
  const tickLabel = (value: number) => relative ? `${value}h` : `${String((value % 24 + 24) % 24).padStart(2, '0')}:00${Math.floor(value / 24) ? ` +${Math.floor(value / 24)}` : ''}`
  return <section className="meds-chart meds-timeline" aria-labelledby="meds-timing-title">
    <header className="meds-timeline-heading"><div><h2 id="meds-timing-title">Your dose timeline</h2><p>All {rows.length} recorded doses · newest first</p></div><div className="meds-timeline-modes" role="group" aria-label="Timeline scale"><button type="button" aria-pressed={!relative} onClick={() => setRelative(false)}>Time of day</button><button type="button" aria-pressed={relative} onClick={() => setRelative(true)}>Since taken</button></div></header>
    <div className="meds-legend"><span className="taken">● Taken</span>{phases.map(phase => <span className={phase} key={phase}>● {phaseLabels[phase]}</span>)}</div>
    {!recent.length ? <p className="meds-empty">Your recorded doses and check-ins will appear here.</p> : <div className="meds-timing-plot"><div className="meds-timing-content"><div className="meds-ruler"><span>Dose</span><div>{scale.ticks.map(tick => <span key={tick} style={{ left: `${position(tick)}%` }}>{tickLabel(tick)}</span>)}</div><span>Duration</span></div>{recent.map(row => <div className="meds-timing-row" key={row.id}><span className="meds-timeline-date">{shortDay(row.day)}<small>{row.day.slice(0, 4)} · {row.dose_mg} mg</small></span><div className="meds-track">
      {scale.ticks.map(tick => <span className="meds-gridline" key={tick} style={{ left: `${position(tick)}%` }} />)}
      {row.events.onset && row.onset !== null && <span className="meds-onset-wait" style={{ left: `${position(hour(row, row.taken_at))}%`, width: `${row.onset / 60 / (scale.end - scale.start) * 100}%` }} />}
      {row.events.onset && row.events.wearing_off && row.effect !== null && <span className="meds-effect-range" style={{ left: `${position(hour(row, row.events.onset))}%`, width: `${row.effect / 60 / (scale.end - scale.start) * 100}%` }} />}
      {points(row).map(point => {
        const key = `${row.id}-${point.type}`
        const text = `${shortDay(row.day)} ${row.day.slice(0, 4)} · ${row.dose_mg} mg · ${point.label} at ${medClock(point.at, zone)}${medDay(point.at, zone) !== row.day ? ' (next day)' : ''} · ${point.type === 'taken' ? 'Dose taken' : duration(elapsed(row.taken_at, point.at)) + ' after taking'}`
        return <button type="button" key={key} className={`meds-marker ${point.type}`} style={{ left: `${position(hour(row, point.at))}%` }} aria-label={text} aria-pressed={detail?.key === key} onClick={() => setDetail({ key, text })} data-tooltip={`${point.label} · ${medClock(point.at, zone)}`} />
      })}
    </div><span className="meds-timeline-duration">{duration(row.effect)}</span></div>)}</div></div>}
    <p className="meds-chart-note meds-timeline-detail" role="status">{detail?.text || 'Select a dot for the exact time. Colored bars connect Started to Wearing off.'}</p>
  </section>
}

function DurationChart({ rows, zone }: { rows: Row[]; zone: string }) {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const measured = rows.filter(row => row.effect !== null)
  const selected = measured.find(row => row.id === selectedId)
  const yMax = Math.max(4, Math.ceil(Math.max(0, ...measured.map(row => row.effect! / 60)) / 2) * 2)
  const start = rows.length ? Date.parse(rows[0].taken_at) : 0, end = rows.length ? Date.parse(rows.at(-1)!.taken_at) : 1
  return <section className="meds-chart meds-duration-section" aria-labelledby="meds-duration-title"><header><h2 id="meds-duration-title">Reported duration</h2><p>All time · From feeling it start to wearing off · {measured.length} complete pairs</p></header>
    {!measured.length ? <p className="meds-empty">Log both Started and Wearing off to see your duration over time.</p> : <>
      <div className="meds-duration-plot"><div className="meds-duration-graph" role="group" aria-label="Reported effect duration by dose date, in hours">
        {[0, 1, 2, 3].map(i => <div className="meds-duration-gridline" key={i} style={{ top: `${100 - i / 3 * 100}%` }}><span>{(yMax * i / 3).toFixed(0)}h</span></div>)}
        {measured.map(row => <button type="button" key={row.id} className="meds-duration-dot" aria-pressed={selectedId === row.id} aria-label={`${shortDay(row.day)} ${row.day.slice(0, 4)} · ${row.dose_mg} mg · Taken at ${medClock(row.taken_at, zone)} · Duration ${duration(row.effect)}`} onClick={() => setSelectedId(row.id)} style={{ left: `${end === start ? 50 : 2 + (Date.parse(row.taken_at) - start) / (end - start) * 96}%`, top: `${100 - row.effect! / 60 / yMax * 100}%` }} />)}
      </div><div className="meds-duration-dates"><span>{rows[0].day}</span><span>{rows.at(-1)!.day}</span></div></div>
      <p className="meds-chart-note meds-duration-detail" role="status">{selected ? `${shortDay(selected.day)} ${selected.day.slice(0, 4)} · ${selected.dose_mg} mg · Taken at ${medClock(selected.taken_at, zone)} · Duration ${duration(selected.effect)}` : 'Select a dot to see the date and exact duration.'}</p>
    </>}
  </section>
}

export function MedsPage() {
  const [snapshot, setSnapshot] = useState<MedsSnapshot | null>(medsSnapshotCache.value)
  const [error, setError] = useState(''), [loading, setLoading] = useState(!medsSnapshotCache.value), [saving, setSaving] = useState(false)
  const [entry, setEntry] = useState<Entry | null>(null), [saveError, setSaveError] = useState(''), [notice, setNotice] = useState(''), [selected, setSelected] = useState<number | null>(null)
  const [quickError, setQuickError] = useState<{ body: QuickEntry; message: string; retryOriginal: boolean } | null>(null)
  const [recording, setRecording] = useState<MedsPhase | null>(null)
  const [needsIntake, setNeedsIntake] = useState<MedsPhase | null>(null)
  const [taking, setTaking] = useState(false), [intakeError, setIntakeError] = useState<{ body: QuickIntake; message: string } | null>(null)
  const [undoMark, setUndoMark] = useState<UndoMark | null>(null), [undoError, setUndoError] = useState('')
  const dialog = useRef<HTMLDialogElement>(null), pending = useRef(false), generation = useRef(0)
  const load = useCallback(async () => {
    const version = ++generation.current
    setLoading(true)
    try { const next = await request<MedsSnapshot>(''); if (version === generation.current) { medsSnapshotCache.value = next; setSnapshot(next); setError('') } }
    catch (cause) { if (version === generation.current) setError(cause instanceof Error ? cause.message : 'Could not reach Ignis medication storage.') }
    finally { if (version === generation.current) setLoading(false) }
  }, [])
  useEffect(() => {
    void load()
    const refresh = () => { if (!document.hidden && !pending.current) void load() }
    const timer = window.setInterval(refresh, 60_000)
    window.addEventListener('focus', refresh); window.addEventListener('ignis:meds-updated', refresh); document.addEventListener('visibilitychange', refresh)
    return () => { generation.current++; window.clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener('ignis:meds-updated', refresh); document.removeEventListener('visibilitychange', refresh) }
  }, [load])
  useEffect(() => { if (entry) dialog.current?.showModal() }, [entry?.key])
  useEffect(() => { setSelected(null) }, [snapshot?.owner_day])
  const rows = snapshot ? doseRows(snapshot) : [], zone = snapshot?.timezone || 'America/Bahia'
  const recent = rows.filter(row => elapsed(row.taken_at, new Date().toISOString()) <= 36 * 60)
  const current = recent.find(row => row.id === selected) || recent.at(-1)
  const markedDose = current && (current.id === selected || current.owner_day === snapshot?.owner_day) ? current : undefined
  const lastAmount = rows.at(-1)?.dose_mg
  const entryDose = rows.find(row => row.id === entry?.doseId)
  const open = (kind: Entry['kind']) => {
    if (!snapshot || error) return
    const at = kind === 'intake' ? markedDose?.taken_at || new Date().toISOString() : current?.events[kind] || new Date().toISOString()
    setSaveError(''); setNotice(''); setNeedsIntake(null)
    setEntry({ kind, doseId: kind === 'intake' ? markedDose?.id : current?.id, at: wallInput(at, zone), amount: kind === 'intake' ? String(markedDose?.dose_mg || lastAmount || '') : '', key: crypto.randomUUID() })
  }
  const close = () => { if (!pending.current) { dialog.current?.close(); setEntry(null) } }
  async function recordIntake(body: QuickIntake) {
    if (pending.current) return
    // Ignore any refresh that began before this write.
    generation.current++; setLoading(false)
    pending.current = true; setSaving(true); setTaking(true); setIntakeError(null); setNotice(''); setNeedsIntake(null)
    try {
      const saved = await request<{ id: number }>('/intake', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      setSelected(saved.id)
      setSnapshot(previous => previous ? { ...previous, doses: [...previous.doses.filter(dose => dose.id !== saved.id), { id: saved.id, taken_at: body.taken_at, dose_mg: body.dose_mg, owner_day: previous.owner_day }] } : previous)
      setNotice(`Taken recorded at ${medClock(body.taken_at, zone)} · ${body.dose_mg} mg. Click Taken to edit.`)
      setUndoMark({ kind: 'intake', dose_id: saved.id, expected_at: body.taken_at, dose_mg: body.dose_mg }); setUndoError('')
      await load()
    } catch (cause) { setIntakeError({ body, message: cause instanceof Error ? cause.message : 'Could not record your dose.' }) }
    finally { pending.current = false; setSaving(false); setTaking(false) }
  }
  function clickTaken() {
    if (!snapshot || pending.current || error) return
    if (markedDose || !lastAmount) { open('intake'); return }
    void recordIntake(intakeError?.body || { dose_mg: lastAmount, taken_at: new Date().toISOString(), clientEventId: crypto.randomUUID() })
  }
  async function recordPhase(body: QuickEntry) {
    if (pending.current) return
    // Ignore any refresh that began before this write.
    generation.current++; setLoading(false)
    pending.current = true; setSaving(true); setRecording(body.event_type); setQuickError(null); setNotice('')
    try {
      const saved = await request<{ id: number }>('/phase', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      // Show the confirmed timestamp even if the subsequent refresh is offline.
      setSnapshot(previous => previous ? { ...previous, events: [...previous.events.filter(event => event.dose_id !== body.dose_id || event.event_type !== body.event_type), { id: saved.id, dose_id: body.dose_id, event_type: body.event_type, occurred_at: body.occurred_at }] } : previous)
      setNotice(`${phaseLabels[body.event_type]} recorded at ${medClock(body.occurred_at, zone)}. Click the recorded time to edit.`)
      setUndoMark({ kind: body.event_type, dose_id: body.dose_id, expected_at: body.occurred_at }); setUndoError('')
      await load()
    } catch (cause) { setQuickError({ body, retryOriginal: ![400, 409, 422].includes((cause as { status?: number })?.status || 0), message: cause instanceof Error ? cause.message : 'Could not save this time.' }) }
    finally { pending.current = false; setSaving(false); setRecording(null) }
  }
  function clickPhase(phase: MedsPhase) {
    if (!snapshot || pending.current || error) return
    if (!current) { setNeedsIntake(phase); return }
    setNeedsIntake(null)
    if (current.events[phase]) { open(phase); return }
    if (quickError?.body.dose_id === current.id && quickError.body.event_type === phase) { void recordPhase(quickError.retryOriginal ? quickError.body : { ...quickError.body, occurred_at: new Date().toISOString(), clientEventId: crypto.randomUUID() }); return }
    void recordPhase({ dose_id: current.id, event_type: phase, occurred_at: new Date().toISOString(), clientEventId: crypto.randomUUID() })
  }
  async function removeMark(mark: UndoMark) {
    if (pending.current) return
    // Ignore any refresh that began before this write.
    generation.current++; setLoading(false)
    pending.current = true; setSaving(true); setUndoError(''); setSaveError('')
    try {
      await request('/undo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(mark) })
      setSnapshot(previous => previous ? { ...previous, doses: mark.kind === 'intake' ? previous.doses.filter(dose => dose.id !== mark.dose_id) : previous.doses, events: previous.events.filter(event => event.dose_id !== mark.dose_id || (mark.kind !== 'intake' && event.event_type !== mark.kind)) } : previous)
      if (mark.kind === 'intake') setSelected(null)
      setUndoMark(null); setQuickError(null); setIntakeError(null); setNotice(mark.kind === 'intake' ? 'Taken and its Started, Peak and Wearing off marks cleared. The linked habit was unchecked.' : `${phaseLabels[mark.kind]} mark removed.`)
      dialog.current?.close(); setEntry(null)
      await load()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not remove the mark. Please retry.'
      setUndoError(message); setSaveError(message)
    } finally { pending.current = false; setSaving(false) }
  }
  const editorMark: UndoMark | null = entry?.doseId && entryDose ? entry.kind === 'intake' ? { kind: 'intake', dose_id: entryDose.id, expected_at: entryDose.taken_at, dose_mg: entryDose.dose_mg } : entryDose.events[entry.kind] ? { kind: entry.kind, dose_id: entryDose.id, expected_at: entryDose.events[entry.kind]! } : null : null
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!entry || pending.current) return
    // Ignore any refresh that began before this write.
    generation.current++; setLoading(false)
    pending.current = true; setSaving(true); setSaveError('')
    try {
      const at = wallISO(entry.at, zone)
      const body = entry.kind === 'intake' ? { dose_mg: Number(entry.amount), taken_at: at, clientEventId: entry.key } : { dose_id: entry.doseId, event_type: entry.kind, occurred_at: at, clientEventId: entry.key }
      const editingIntake = entry.kind === 'intake' && entry.doseId
      const saved = await request<{ id: number }>(entry.kind === 'intake' ? '/intake' : '/phase', { method: editingIntake ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editingIntake ? { ...body, dose_id: entry.doseId } : body) })
      if (entry.kind === 'intake') setSelected(saved.id)
      setUndoMark(entry.kind === 'intake' ? editingIntake ? null : { kind: 'intake', dose_id: saved.id, expected_at: at, dose_mg: Number(entry.amount) } : entryDose?.events[entry.kind] ? null : { kind: entry.kind, dose_id: entry.doseId!, expected_at: at }); setUndoError('')
      dialog.current?.close(); setEntry(null); setNotice(`${entry.kind === 'intake' ? 'Dose' : phaseLabels[entry.kind]} saved in Ignis.`)
      await load()
    } catch (cause) { setSaveError(cause instanceof Error ? cause.message : 'Could not save. Retry this entry.') }
    finally { pending.current = false; setSaving(false) }
  }
  return <div className="meds-page">
    <div className="meds-toolbar"><strong>Venvanse</strong></div>
    {error && <p className="meds-error" role="alert">{error} {snapshot && 'Showing the last loaded records.'}<button type="button" onClick={() => void load()}>Retry</button></p>}
    {loading && !snapshot ? <p className="meds-empty" role="status">Loading your Venvanse history…</p> : !snapshot ? null : <>
      <section className="meds-today" aria-label="Record medication times">
        {recent.length > 1 && <label className="meds-dose-choice">Track dose<Dropdown aria-label="Dose to track" value={current?.id} disabled={saving} onValueChange={selectedValue => setSelected(Number(selectedValue))}>{recent.map(row => <option key={row.id} value={row.id}>{shortDay(row.day)} · {medClock(row.taken_at, zone)} · {row.dose_mg} mg</option>)}</Dropdown></label>}
        <div className="meds-stage-actions"><button type="button" className={`taken ${markedDose ? 'is-recorded' : ''}`} onClick={clickTaken} disabled={!!error || saving}><span className="meds-stage-index">1</span><span><strong>Taken</strong><small>{taking ? 'Saving…' : markedDose ? `${medClock(markedDose.taken_at, zone)} · Edit time` : lastAmount ? `${lastAmount} mg · Record now` : 'Choose amount'}</small></span><span aria-hidden="true">{markedDose ? '✓' : '+'}</span></button>{phases.map((phase, i) => <button key={phase} type="button" className={`${phase} ${current?.events[phase] ? 'is-recorded' : ''}`} onClick={() => clickPhase(phase)} disabled={!!error || saving}><span className="meds-stage-index">{i + 2}</span><span><strong>{phaseLabels[phase]}</strong><small>{recording === phase ? 'Saving…' : current?.events[phase] ? `${medClock(current.events[phase]!, zone)} · Edit time` : current ? 'Record now' : 'Add Taken first'}</small></span><span aria-hidden="true">{current?.events[phase] ? '✓' : '+'}</span></button>)}</div>
      </section>
      {needsIntake && !current && <div className="meds-intake-prompt meds-mark-feedback" role="status"><span>Record Taken first to link {phaseLabels[needsIntake]} to your dose.</span><button type="button" disabled={!!error || saving} onClick={() => open('intake')}>Add Taken time</button></div>}
      {intakeError && <p className="meds-error" role="alert">{intakeError.message}<button type="button" disabled={saving} onClick={() => void recordIntake(intakeError.body)}>Retry recording Taken</button></p>}
      {quickError && <p className="meds-error" role="alert">{quickError.message}<button type="button" disabled={saving} onClick={() => void recordPhase(quickError.retryOriginal ? quickError.body : { ...quickError.body, occurred_at: new Date().toISOString(), clientEventId: crypto.randomUUID() })}>Retry recording {phaseLabels[quickError.body.event_type]}</button></p>}
      {(notice || undoMark) && <div className="meds-success meds-mark-feedback" role="status"><span>{notice}</span>{undoMark && <button type="button" disabled={saving} onClick={() => void removeMark(undoMark)}>Undo {undoMark.kind === 'intake' ? 'Taken' : phaseLabels[undoMark.kind]}</button>}</div>}
      {undoError && !entry && <p className="meds-error" role="alert">{undoError}</p>}
      <div className="meds-metrics">{[{ title: 'Typical start', phase: 'onset', values: rows.map(row => row.onset), note: 'after taking' }, { title: 'Typical peak', phase: 'strongest', values: rows.map(row => row.peak), note: 'after taking' }, { title: 'Reported duration', phase: 'wearing_off', values: rows.map(row => row.effect), note: 'start → wearing off' }].map(metric => {
        const value = duration(median(metric.values))
        const count = metric.values.filter(value => value !== null).length
        return <article key={metric.title} className={`meds-metric ${metric.phase}`}>
          <header><span className="meds-metric-symbol" aria-hidden="true"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="7" /><path d={metric.phase === 'onset' ? 'M10 6v4l3 2' : metric.phase === 'strongest' ? 'M6 12l4-5 4 5' : 'M6 10h8m-3-3 3 3-3 3'} /></svg></span><h2>{metric.title}</h2></header>
          <strong className="meds-metric-value" aria-label={value}>{value.split(' ').map((part, index) => <span key={index} aria-hidden="true">{part.replace(/[a-z]/g, '')}<span className="meds-metric-unit">{part.match(/[a-z]+/)?.[0]}</span></span>)}</strong>
          <p className="meds-metric-context">{metric.note}</p>
          <footer><span>Median · all time</span><span>{count} {count === 1 ? 'record' : 'records'}</span></footer>
        </article>
      })}</div>
      <TimingChart rows={rows} zone={zone} /><DurationChart rows={rows} zone={zone} />
      <details className="meds-history"><summary>Dose history <span>{rows.length} recorded doses</span></summary><div className="meds-history-scroll"><table><caption>Recorded times in {zone}. A dash means no check-in.</caption><thead><tr><th>Date</th><th>Dose</th><th>Taken</th>{phases.map(phase => <th key={phase}>{phaseLabels[phase]}</th>)}<th>Duration</th></tr></thead><tbody>{[...rows].reverse().map(row => <tr key={row.id}><th>{row.day}</th><td>{row.dose_mg} mg</td><td>{medClock(row.taken_at, zone)}</td>{phases.map(phase => <td key={phase}>{row.events[phase] ? `${medClock(row.events[phase]!, zone)}${medDay(row.events[phase]!, zone) !== row.day ? ' +1' : ''}` : '—'}</td>)}<td>{duration(row.effect)}</td></tr>)}</tbody></table></div></details>
    </>}
    <dialog ref={dialog} aria-labelledby="meds-entry-title" className="meds-entry" onCancel={event => { event.preventDefault(); close() }} onClick={event => { if (event.target === event.currentTarget) close() }}>
      {entry && <form onSubmit={submit}><header><h2 id="meds-entry-title">{entry.kind === 'intake' ? entry.doseId ? 'Edit Venvanse dose' : 'Record Venvanse' : `${phaseLabels[entry.kind]} time`}</h2><button type="button" aria-label="Close entry" onClick={close} disabled={saving}>×</button></header><p>{entry.kind === 'intake' ? 'Record the amount you actually took.' : `For the ${entryDose?.dose_mg ?? ''} mg dose taken ${entryDose ? shortDay(entryDose.day) + ' at ' + medClock(entryDose.taken_at, zone) : ''}.`}</p>
        {entry.kind === 'intake' && <label>Amount taken (mg)<input type="number" min="0.01" step="any" required value={entry.amount} disabled={saving} onChange={event => setEntry({ ...entry, amount: event.target.value })} />{!entry.doseId && rows.length > 0 && <small>Prefilled from your last recorded dose.</small>}</label>}
        <label>Date and time<input type="datetime-local" required value={entry.at} disabled={saving} onChange={event => setEntry({ ...entry, at: event.target.value })} /></label><small>Timezone: {zone}</small>
        {editorMark && <div className="meds-remove-mark"><button type="button" disabled={saving} onClick={() => void removeMark(editorMark)}>Remove {editorMark.kind === 'intake' ? 'Taken' : phaseLabels[editorMark.kind]} mark</button>{editorMark.kind === 'intake' && <small>Also clears Started, Peak and Wearing off and unchecks the linked habit. Doses with saved response reports are retained.</small>}</div>}
        {saveError && <p className="meds-error" role="alert">{saveError}</p>}<footer>{entry.kind === 'intake' && entry.doseId && <button type="button" disabled={saving} onClick={() => { setSaveError(''); setEntry({ kind: 'intake', at: wallInput(new Date().toISOString(), zone), amount: String(lastAmount || ''), key: crypto.randomUUID() }) }}>Record another dose</button>}<button type="button" onClick={close} disabled={saving}>Cancel</button><button type="submit" className="meds-log-dose" disabled={saving}>{saving ? 'Saving…' : 'Save to Ignis'}</button></footer>
      </form>}
    </dialog>
  </div>
}
