import { useId, useState } from 'react'
import { habitMonthDays } from './habitCalendarModel'
import { moods, paintMood, type Mood, type MoodEntry } from './moodModel'
import './mood.css'
function Cat({ mood, variant = 0, patternId }: { mood?: Mood; variant?: number; patternId: string }) {
 const color = moods.find(item => item.id === mood)?.color || '#fffdf7'
 const top = [19, 29, 16, 24][variant % 4]
 const body = `M10 108 Q9 74 15 ${top} Q17 ${top - 9} 29 ${top + 5} Q48 ${top - 2} 67 ${top + 5} Q80 ${top - 13} 82 ${top} Q91 67 90 108 Z`
 return <svg className="mood-cat" viewBox="0 0 100 118" aria-hidden="true"><defs><pattern id={patternId} width="8" height="9" patternUnits="userSpaceOnUse"><path d="m-2 10 12-12M1 12 12 1" stroke="#65523a" strokeWidth="1.2" opacity=".12" /></pattern></defs><path d={body} fill={color} stroke="#3a3731" strokeWidth="2.5" strokeLinejoin="round" /><path d={body} fill={mood ? `url(#${patternId})` : 'none'} />{mood && <g className="mood-cat-face" fill="none" stroke="#3a3731" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
 {mood === 'excited' || mood === 'angry' || mood === 'sad' ? <><ellipse cx="33" cy="60" rx="1.3" ry="2" fill="#3a3731" /><ellipse cx="65" cy="60" rx="1.3" ry="2" fill="#3a3731" /></> : mood === 'okay' ? <path d="M28 60h10m22 0h10" /> : <path d="M27 57q5 9 11 0m21 0q5 9 11 0" />}
 <path d="m46 69 6 0-3 5Z" fill="#3a3731" />
 {mood === 'sad' || mood === 'low' ? <path d="M35 87q14-20 28 0" /> : mood === 'angry' ? <><path d="m26 49 12 5m21 0 12-5M35 84q14-16 28 0l-4 8H40Z" /><path d="m44 81 2 6m9-6-2 6" /></> : mood === 'excited' ? <path d="M35 78q14 29 28 0m-14-4v8" /> : <path d="M49 74q-5 14-16 7m16-7q5 14 16 7" />}
 <path d="m16 71 10 3m-11 5 11 1m46-6 11-3m-11 9 12-1" />
 {mood === 'low' && <path d="m29 65-4 18m10-17-3 17m31-17 3 17m3-18 5 18" />}
 </g>}</svg>
}
export function MoodTracker({ entries, change, month, today, readOnly }: { entries: MoodEntry[]; change: (update: (entries: MoodEntry[]) => MoodEntry[]) => void; month: string; today: string; readOnly: boolean }) {
 const [brush, setBrush] = useState<Mood | null>('happy'), id = useId().replace(/:/g, '')
 const days = habitMonthDays(month).filter((day): day is string => !!day)
 const rows = Array.from({ length: Math.ceil(days.length / 8) }, (_, index) => days.slice(index * 8, index * 8 + 8))
 const recorded = entries.filter(entry => entry.date.startsWith(month + '-')).length
 return <section className="mood-tracker" aria-label="Monthly mood tracker"><div className="mood-instructions"><span>{recorded} of {days.length} days filled</span></div><div className="mood-journal"><header><h2>A month of moods</h2><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 40S4 26 8 14c4-10 14-6 16 1 3-8 14-11 17-1 4 12-17 26-17 26Z" fill="#d88c99" stroke="#3a3731" strokeWidth="2" /></svg></header><div className="mood-cat-rows">{rows.map((row, rowIndex) => <div className="mood-cat-row" key={rowIndex}>{row.map((date, index) => { const saved = entries.find(entry => entry.date === date)?.mood, name = moods.find(item => item.id === saved)?.label; return <button type="button" key={date} disabled={readOnly || date > today} className={`mood-day ${date === today ? 'is-today' : ''}`} aria-label={`${Number(date.slice(-2))} ${new Date(date + 'T12:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}: ${name || 'No mood'}. ${brush ? `Paint ${moods.find(item => item.id === brush)?.label}` : 'Clear mood'}`} onClick={() => change(current => paintMood(current, date, brush, today))}><Cat mood={saved} variant={index + rowIndex} patternId={`${id}-${date}`} /><span>{Number(date.slice(-2))}</span></button> })}</div>)}</div><div className="mood-palette" role="group" aria-label="Choose a mood color">{moods.map(mood => <button type="button" key={mood.id} aria-pressed={brush === mood.id} disabled={readOnly} onClick={() => setBrush(mood.id)}><span className="mood-swatch" style={{ background: mood.color }} /> <span>{mood.label}</span><span className="mood-palette-check" aria-hidden="true">{brush === mood.id ? '✓' : ''}</span></button>)}<button type="button" className="mood-eraser" aria-pressed={brush === null} disabled={readOnly} onClick={() => setBrush(null)}>Clear a day<span className="mood-palette-check" aria-hidden="true">{brush === null ? '✓' : ''}</span></button></div></div></section>
}
