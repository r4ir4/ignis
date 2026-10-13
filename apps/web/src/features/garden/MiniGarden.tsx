import { useEffect, useRef, useState } from 'react'
import { useFarmClock } from './useFarmClock'
import { plantStages } from './gardenModel'
import { InteractiveFarm, type FarmPlace } from './InteractiveFarm'
export function MiniGarden({ growth, storageError, onOpenPlace, date }: { growth: number; storageError: string; onOpenPlace: (place: FarmPlace) => void; date: Date }) {
  const clock = useFarmClock()
  const [windPaused, setWindPaused] = useState(false)
  const stages = plantStages(growth)
  const previous = useRef(growth)
  const [growing, setGrowing] = useState<number | null>(null)
  useEffect(() => { setGrowing(growth > previous.current ? (growth - 1) % 3 : null); previous.current = growth }, [growth])
  return <section className={`mini-garden ${windPaused ? 'wind-paused' : ''}`} aria-labelledby="garden-heading">
    <div className="garden-heading"><div><h2 id="garden-heading">Your farm</h2><time className="farm-day">{date.toLocaleDateString('en', { weekday: 'long', month: 'short', day: 'numeric' })}</time><p>{growth >= 9 ? 'In bloom. Every small action still counts.' : 'A little growth with every check-in.'}</p></div><div className="farm-clock-hud"><span className="farm-clock" title="America/Bahia · Artistic day/night schedule">Bahia · {clock.label} · {clock.phase}</span><span className="garden-count" aria-live="polite">{growth} growth {growth === 1 ? 'step' : 'steps'}</span><button className="wind-toggle" aria-label={windPaused ? 'Resume wind animation' : 'Pause wind animation'} onClick={() => setWindPaused(!windPaused)}>{windPaused ? 'Resume wind' : 'Pause wind'}</button></div></div>
    <InteractiveFarm onOpenPlace={onOpenPlace} stages={stages} growth={growth} growing={growing} onGrowthEnd={() => setGrowing(null)} />
    <details className="garden-guide"><summary>How it grows</summary><p>Completed tasks, exercise and habit check-ins, and each food log contribute once. Undo removes that contribution. Seeds become sprouts, leaves, then blooms. Missed days never remove growth. A porch light appears at 3 growth steps, a cottage flag at 6, and flowers at 9. Medication reviews, meal plans and saved meals do not earn growth.</p><p>Saved in this browser, with your check-ins. Device sync is not connected.</p></details>
    {storageError && <p className="food-error" role="alert">{storageError}</p>}
  </section>
}
