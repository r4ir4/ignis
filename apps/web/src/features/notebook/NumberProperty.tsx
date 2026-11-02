import { NotebookChevron } from './NotebookChevron'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { blockPalette } from './blockPalette'
import { PropertyPopover } from './TaskPropertyControls'
import { defaultNumberDisplay, numberDisplay, numberProgress, numberText, parsePropertyNumber, type NumberDisplay } from './numberDisplay'

export function NumberVisualization({ value, config }: { value: number | null; config?: NumberDisplay | null }) {
  if (value === null) return <span className="is-empty">Empty</span>
  const settings = numberDisplay(config), progress = numberProgress(value, settings)
  const color = blockPalette.find(color => color.id === settings.color)!.text
  return <span className={`notebook-number-property is-${settings.showAs}`} style={{ '--number-color': color } as CSSProperties} title={settings.showAs === 'number' ? numberText(value) : `${numberText(value)} / ${numberText(settings.divideBy)}`}>
    {settings.showAs !== 'number' && <span role="progressbar" aria-label="Progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Number((progress * 100).toFixed(2))} aria-valuetext={`${numberText(value)} out of ${numberText(settings.divideBy)}`}>
      {settings.showAs === 'bar' ? <span className="notebook-number-track"><span style={{ width: `${progress * 100}%` }} /></span> : <svg className="notebook-number-ring" viewBox="0 0 24 24" aria-hidden="true"><circle className="number-ring-track" cx="12" cy="12" r="9" /><circle className="number-ring-fill" cx="12" cy="12" r="9" pathLength="100" strokeDasharray={`${progress * 100} 100`} transform="rotate(-90 12 12)" /></svg>}
    </span>}
    {(settings.showAs === 'number' || settings.showNumber) && <span>{numberText(value)}</span>}
  </span>
}
export function NumberPropertyValue({ label, value, config, editable, change, minimum = -1e12 }: { label: string; value: number | null; config?: NumberDisplay | null; editable: boolean; change: (value: number | null) => void; minimum?: number }) {
  return <PropertyPopover label={label} disabled={!editable} trigger={<NumberVisualization value={value} config={config} />}>{close => <NumberValueEditor label={label} value={value} minimum={minimum} change={change} close={close} />}</PropertyPopover>
}
function NumberValueEditor({ label, value, minimum, change, close }: { label: string; value: number | null; minimum: number; change: (value: number | null) => void; close: () => void }) {
  const [draft, setDraft] = useState(value === null ? '' : String(value))
  const parsed = parsePropertyNumber(draft, minimum)
  return <div className="notebook-number-value-editor"><input autoFocus aria-label={`Edit ${label} number`} inputMode="decimal" placeholder="Empty" value={draft} onBlur={event => { const panel = event.currentTarget.closest<HTMLElement>('[popover]'); if (event.relatedTarget instanceof HTMLElement && event.relatedTarget.getAttribute('popovertarget') === panel?.id) return; panel?.hidePopover() }} onChange={event => { setDraft(event.target.value); const next = parsePropertyNumber(event.target.value, minimum); if (next !== undefined) change(next) }} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); if (parsed !== undefined) close() } }} />{parsed === undefined && <p role="alert">Enter a number between {minimum.toLocaleString()} and 1 trillion.</p>}</div>
}
export function NumberDisplaySettings({ config, change }: { config?: NumberDisplay | null; change: (value: NumberDisplay) => string | void }) {
  const current = numberDisplay(config)
  const colorButton = useRef<HTMLButtonElement>(null)
  const [divide, setDivide] = useState(String(current.divideBy)), [error, setError] = useState(''), [colors, setColors] = useState(false)
  useEffect(() => setDivide(String(current.divideBy)), [current.divideBy])
  const parsedDivide = parsePropertyNumber(divide, 0), invalidDivide = parsedDivide == null || parsedDivide <= 0
  function update(patch: Partial<NumberDisplay>) { const issue = change({ ...current, ...patch }); setError(issue || '') }
  function divisor(text: string) { const value = parsePropertyNumber(text, 0); if (value == null || value <= 0) { setError('Divide by must be greater than zero and at most 1 trillion.'); return } update({ divideBy: value }) }
  return <section className="notebook-number-settings" aria-label="Number display settings"><p>Show as</p><div className="notebook-number-modes" role="group" aria-label="Show as">{(['number', 'bar', 'ring'] as const).map(mode => <button key={mode} type="button" aria-label={`Show as ${mode === 'number' ? 'Number' : mode === 'bar' ? 'Bar' : 'Ring'}`} aria-pressed={current.showAs === mode} onClick={() => update({ showAs: mode })}><span aria-hidden="true">{mode === 'number' ? <strong>42</strong> : <NumberVisualization value={60} config={{ ...defaultNumberDisplay, showAs: mode, color: 'blue', showNumber: false }} />}</span><span>{mode === 'number' ? 'Number' : mode === 'bar' ? 'Bar' : 'Ring'}</span></button>)}</div>
    {current.showAs !== 'number' && <div className="notebook-number-settings-panel"><div className="notebook-number-setting-row"><span>Color</span><button ref={colorButton} type="button" aria-label="Progress color" aria-expanded={colors} onClick={() => setColors(value => !value)}><i style={{ backgroundColor: blockPalette.find(color => color.id === current.color)!.text }} />{blockPalette.find(color => color.id === current.color)!.label}<NotebookChevron /></button></div>{colors && <div className="notebook-number-colors" role="group" aria-label="Progress colors">{blockPalette.filter(color => color.id !== 'default').map(color => <button type="button" key={color.id} aria-label={`Progress color ${color.label}`} aria-pressed={current.color === color.id} onClick={() => { update({ color: color.id as NumberDisplay['color'] }); setColors(false); requestAnimationFrame(() => colorButton.current?.focus({ preventScroll: true })) }}><i style={{ backgroundColor: color.text }} />{color.label}</button>)}</div>}
    <label className="notebook-number-setting-row"><span>Divide by</span><input aria-label="Divide by" inputMode="decimal" value={divide} onChange={event => { setDivide(event.target.value); const number = parsePropertyNumber(event.target.value, 0); if (number != null && number > 0) update({ divideBy: number }) }} onBlur={() => divisor(divide)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); divisor(divide) } }} /></label><label className="notebook-number-setting-row"><span>Show number</span><input type="checkbox" role="switch" aria-label="Show number" checked={current.showNumber} onChange={event => update({ showNumber: event.target.checked })} /></label></div>}
    {(error || current.showAs !== 'number' && invalidDivide) && <p role="alert">{error || 'Divide by must be greater than zero and at most 1 trillion.'}</p>}<p className="notebook-property-caption">Changes apply to all tasks showing this property.</p>
  </section>
}
