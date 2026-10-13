import type { ReactNode } from 'react'
import { useFarmClock } from './useFarmClock'
const colors: Record<string, string> = { s: '#8592aa', g: '#8592aa', h: '#eff0f6', r: '#e884a4', o: '#eff0f6', y: '#eff0f6', p: '#eff0f6' }
const seed = ['..ss..', '.syys.', '..ss..']
const sprout = ['......', '.gg...', '.gh.s.', '..sgg.', '...s..', '...s..', '...s..']
const leaves = ['..........', '...gg.....', '..ghgs....', '...gss.gg.', '....s.ghg.', '.gg.s.gg..', 'ghgss.....', '.gg.s.....', '....s.....', '....s.....', '....s.....']
const mature = [
  ['.....gg.......', '....ghgs......', '..gg.s.ggg....', '.ghgss.ghgg...', '..gg.s.gg.....', '.....s........', '..sss.ssss....', '.srro.s.rros..', '..rrr.s.rrr...', '......s.......', '..gg..s..gg...', '.ghgsss.ghgg..', '..gg..s..gg...', '......s.......', '......s.......', '......s.......'],
  ['.....ggg......', '....ghhgs.....', '.....ggss.....', '..ggg..s.ggg..', '.ghhgs.s.ghhg.', '..gggsss.ggg..', '.......s......', '.gggg..s..ggg.', 'ghhhgsss.ghhg.', '.gggg..s..ggg.', '.......s......', '..ggg..s.ggg..', '.ghhgs.s.ghhg.', '..gggsss.ggg..', '.......s......', '.......s......'],
  ['....rr..rr....', '...roorrrro...', '...rrryyrrr...', '....ryyyyr....', '...rrryyrrr...', '...roorrrro...', '....rrssrr....', '......ss......', '..gg..ss......', '.ghgssss.gg...', '..gg..ss.ghg..', '......ss.gg...', '......ss......', '......ss......', '......ss......', '......ss......'],
]
function Sprite({ rows }: { rows: string[] }) {
  const width = Math.max(...rows.map(row => row.length))
  return <g transform={`translate(${-width * 1.5},${98 - rows.length * 3})`}>{rows.flatMap((row, y) => [...row].map((pixel, x) => colors[pixel] ? <rect key={`${x}-${y}`} x={x * 3} y={y * 3} width="3" height="3" fill={colors[pixel]} /> : null))}</g>
}
export function PixelFarm({ stages, growth, growing, onGrowthEnd, overlay }: { stages: number[]; growth: number; growing: number | null; onGrowthEnd: () => void; overlay?: ReactNode }) {
  const light = useFarmClock()
  return <svg className="garden-scene" viewBox="0 0 256 128" shapeRendering="crispEdges" aria-hidden="true">
    <rect width="256" height="128" fill={light.sky} />
    <g pointerEvents="none"><rect y="22" width="256" height="10" fill={light.dark ? '#838383' : '#eaeaea'} opacity=".06" /><rect y="32" width="256" height="8" fill={light.dark ? '#838383' : '#eaeaea'} opacity=".12" /><rect y="40" width="256" height="10" fill={light.dark ? '#838383' : '#eaeaea'} opacity=".18" /></g>
    <image className="farm-clouds" href="/farm/sky-clouds.png" width="256" height="128" opacity={light.dark ? .22 : light.phase === 'Dawn' ? .75 : .95} />
    {!light.dark && <><g transform={`translate(${light.sunX},${light.sunY})`}><path d="M-5-8h10v4h4v8h-4v4h-10v-4h-4v-8h4Z" fill={light.sunColor} /><path d="M-3-5h5v2h-5Zm-4 3h2v4h-2Z" fill="#efefef" opacity=".7" /><path d="M3 3h3v2H3Zm-1 4h5v1h-5Z" fill="#959595" opacity=".6" /></g><path d="M76 17h3v2h3v-2h3m-9 1h3m3 0h3" stroke="#747474" strokeWidth="1" /></>}
    <image href="/farm/farm-scene.png" width="256" height="128" />
    <g className="farm-tree-canopies" pointerEvents="none">
      <svg x="0" y="0" width="48" height="72" viewBox="0 0 48 72"><g className="farm-oak-wind"><image href="/farm/tree-canopies.png" width="256" height="128" /></g></svg>
      <svg x="200" y="0" width="56" height="72" viewBox="200 0 56 72"><g className="farm-pine-wind"><image href="/farm/tree-canopies.png" width="256" height="128" /></g></svg>
    </g>
    {stages.map((stage, index) => <g transform={`translate(${52 + index * 76},0)`} key={index}>
      {index === 0 && stage >= 2 && <rect x="-5" y="52" width="2" height="47" fill="#6b6b6b" />}
      <g key={`${stage}-${growing === index ? growth : 'still'}`} className={growing === index ? 'garden-plant is-growing' : 'garden-plant'} onAnimationEnd={onGrowthEnd}><Sprite rows={stage === 0 ? seed : stage === 1 ? sprout : stage === 2 ? leaves : mature[index]} /></g>
      {growing === index && <path className="garden-sparkle" d="M22 44h3v-3h3v3h3v3h-3v3h-3v-3h-3Z" fill="#bfbfbf" />}
    </g>)}
    {growth >= 3 && <svg x="140" y="39" width="12" height="12" viewBox="0 0 16 16"><image href="/farm/decorations.png" width="48" height="16" /></svg>}
    {growth >= 6 && <svg x="119" y="8" width="16" height="16" viewBox="16 0 16 16"><image href="/farm/decorations.png" width="48" height="16" /></svg>}
    {growth >= 9 && <svg x="83" y="108" width="16" height="16" viewBox="32 0 16 16"><image href="/farm/decorations.png" width="48" height="16" /></svg>}
    {overlay}
    <g pointerEvents="none">
      {light.opacity > 0 && <rect width="256" height="128" fill={light.tint} opacity={light.opacity} />}
      {light.dark && <>
        <path d="M209 8h7v3h-4v8h4v3h-7v-3h-3V11h3Z" fill="#e9e9e9" /><path d="M209 12h2v3h-2Zm1 6h3v1h-3Z" fill="#bfbfbf" />
        {[{ x: 38, y: 3 }, { x: 65, y: 17 }, { x: 99, y: 4 }, { x: 154, y: 9 }, { x: 190, y: 30 }, { x: 246, y: 14 }].map(point => <rect key={point.x} x={point.x} y={point.y} width="1" height="1" fill="#d3d3d3" />)}
        {[{ x: 16, y: 11 }, { x: 60, y: 8 }, { x: 86, y: 21 }, { x: 172, y: 10 }, { x: 244, y: 30 }].map(point => <path key={point.x} d={`M${point.x} ${point.y - 2}h1v2h2v1h-2v2h-1v-2h-2v-1h2Z`} fill="#e4e4e4" />)}
        <rect x="112" y="35" width="10" height="11" fill="#c2c2c2" opacity=".13" /><rect x="114" y="37" width="6" height="7" fill="#cccccc" opacity=".8" />
        <rect x="137" y="37" width="6" height="7" fill="#cccccc" opacity=".8" /><rect x="46" y="40" width="6" height="7" fill="#cccccc" opacity=".8" />
        <path d="M20 74h1v1h-1Zm71 122h1v1h-1Zm167 73h1v1h-1Zm236 91h1v1h-1Z" fill="#d9d9d9" />
      </>}
    </g>
  </svg>
}
