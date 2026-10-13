import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { PixelFarm } from './PixelFarm'
export type FarmPlace = 'cottage' | 'Food' | 'Exercises' | 'Habits' | 'Meds'
const names = ['Tomato', 'Basil', 'Flower']
const stagesText = ['Seed', 'Sprout', 'Leaves', 'Bloom']
type Point = { x: number; y: number }
const bound = (point: Point): Point => ({ x: Math.max(16, Math.min(240, point.x)), y: Math.max(74, Math.min(94, point.y)) })
export function InteractiveFarm({ stages, growth, growing, onGrowthEnd, onOpenPlace }: { stages: number[]; growth: number; growing: number | null; onGrowthEnd: () => void; onOpenPlace: (place: FarmPlace) => void }) {
  const [position, setPosition] = useState<Point>({ x: 128, y: 86 })
  const positionRef = useRef(position)
  const [target, setTarget] = useState(position)
  const [frame, setFrame] = useState(0)
  const [selected, setSelected] = useState<number | FarmPlace | null>(null)
  const move = (point: Point) => {
    const next = bound(point)
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { positionRef.current = next; setPosition(next); setFrame(0) }
    setTarget(next)
  }
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let id = 0
    let previous = performance.now()
    const start = previous
    const tick = (now: number) => {
      const elapsed = Math.min(now - previous, 50) / 1000
      previous = now
      const current = positionRef.current
      const dx = target.x - current.x, dy = target.y - current.y
      const distance = Math.hypot(dx, dy)
      if (distance < 1) { positionRef.current = target; setPosition(target); setFrame(0); return }
      const step = Math.min(distance, elapsed * 65)
      const next = { x: current.x + dx / distance * step, y: current.y + dy / distance * step }
      positionRef.current = next
      setPosition(next)
      setFrame(Math.floor((now - start) / 140) % 4)
      id = requestAnimationFrame(tick)
    }
    id = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(id)
  }, [target])
  const pointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const svg = event.currentTarget.querySelector('svg')
    const matrix = svg?.getScreenCTM()
    if (!svg || !matrix) return
    const point = svg.createSVGPoint(); point.x = event.clientX; point.y = event.clientY
    const mapped = point.matrixTransform(matrix.inverse())
    move(mapped); setSelected(null)
    event.currentTarget.focus({ preventScroll: true })
  }
  const keyboardMove = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return
    const offsets: Record<string, Point> = { ArrowLeft: { x: -12, y: 0 }, a: { x: -12, y: 0 }, ArrowRight: { x: 12, y: 0 }, d: { x: 12, y: 0 }, ArrowUp: { x: 0, y: -6 }, w: { x: 0, y: -6 }, ArrowDown: { x: 0, y: 6 }, s: { x: 0, y: 6 } }
    const offset = offsets[event.key]
    if (!offset) return
    event.preventDefault(); setSelected(null)
    move({ x: positionRef.current.x + offset.x, y: positionRef.current.y + offset.y })
  }
  const inspect = (index: number | FarmPlace) => { setSelected(index); move({ x: typeof index === 'number' ? 52 + index * 76 : index === 'Food' ? 56 : index === 'Exercises' ? 190 : 128, y: typeof index === 'number' ? 94 : 74 }) }
  return <div className="interactive-farm">
    <div className="farm-map" role="group" aria-label="Walkable farm. Click or tap the grass to move, or use arrow keys or WASD." tabIndex={0} onPointerDown={pointerMove} onKeyDown={keyboardMove}>
      <PixelFarm stages={stages} growth={growth} growing={growing} onGrowthEnd={onGrowthEnd} overlay={<>
        <g><rect x={Math.round(position.x) - 6} y={Math.round(position.y) - 2} width="12" height="3" fill="#5d5d5d" opacity=".5" /><svg x={Math.round(position.x) - 8} y={Math.round(position.y) - 24} width="16" height="24" viewBox={`${frame * 16} 0 16 24`}><image href="/farm/farmer.png" width="64" height="24" /></svg></g>
        <rect className="farm-hotspot" x="40" y="24" width="38" height="33" onPointerDown={event => { event.stopPropagation(); inspect('Food') }} />
        <rect className="farm-hotspot" x="170" y="24" width="38" height="33" onPointerDown={event => { event.stopPropagation(); inspect('Exercises') }} />
        <rect className="farm-hotspot" x="148" y="39" width="10" height="15" onPointerDown={event => { event.stopPropagation(); inspect('Meds') }} />
        <rect className="farm-hotspot" x="105" y="17" width="46" height="40" onPointerDown={event => { event.stopPropagation(); inspect('cottage') }} />
        {stages.map((_, index) => <rect key={index} className="farm-hotspot" x={24 + index * 76} y="98" width="56" height="22" onPointerDown={event => { event.stopPropagation(); inspect(index) }} />)}
      </>} />
    </div>
    <nav className="farm-destinations" aria-label="Open farm tools">{([{ place: 'cottage', label: 'Cottage', detail: 'Daily plan', crop: '104 17 49 42' }, { place: 'Food', label: 'Kitchen', detail: 'Meals & logs', crop: '40 19 38 40' }, { place: 'Exercises', label: 'Training yard', detail: 'Movement', crop: '174 29 32 28' }, { place: 'Habits', label: 'Garden', detail: 'Habits', crop: '6 108 14 20' }, { place: 'Meds', label: 'Medicine cabinet', detail: 'Reminders', crop: '146 37 12 16' }] as const).map(item => <button key={item.place} onClick={() => onOpenPlace(item.place)}><svg className="destination-sprite" viewBox={item.crop} shapeRendering="crispEdges" aria-hidden="true"><image href="/farm/farm-scene.png" width="256" height="128" /></svg><span>{item.label}</span><small>{item.detail}</small></button>)}</nav>
    <details className="farm-bed-controls"><summary>Inspect planting beds</summary><div className="farm-controls">{names.map((name, index) => <button key={name} aria-pressed={selected === index} onClick={() => inspect(index)}>{name} · {stagesText[stages[index]]}</button>)}</div></details>
    <div className="farm-inspection" role="status">{typeof selected === 'string' ? <><span>{selected === 'cottage' ? 'Cottage · Plan your day.' : selected === 'Food' ? 'Kitchen · Plan a meal or log what you ate.' : selected === 'Exercises' ? 'Training yard · Your planned movement.' : selected === 'Meds' ? 'Medicine cabinet · Review your reminders.' : 'Garden · Your habits.'}</span><button onClick={() => onOpenPlace(selected)}>Enter {selected === 'cottage' ? 'cottage' : selected === 'Food' ? 'kitchen' : selected === 'Exercises' ? 'training yard' : selected === 'Meds' ? 'medicine cabinet' : 'garden'}</button></> : selected !== null ? <><span>{names[selected]}: {stagesText[stages[selected]]}. {stages[selected] === 3 ? 'Fully grown. Your progress stays.' : 'Your real-life check-ins help it grow.'}</span><button onClick={() => onOpenPlace('Habits')}>Open habits</button></> : <span>Walk with a click, tap or arrow keys. Open any place directly below the map.</span>}</div>
  </div>
}
