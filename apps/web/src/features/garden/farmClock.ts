export const farmTimeZone = 'America/Bahia'
export type FarmPhase = 'Dawn' | 'Day' | 'Golden hour' | 'Dusk' | 'Night'
export function farmLighting(date: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: farmTimeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date)
  const hour = Number(parts.find(part => part.type === 'hour')?.value)
  const minute = Number(parts.find(part => part.type === 'minute')?.value)
  const time = hour * 60 + minute
  let phase: FarmPhase, sky: string, tint: string, opacity: number
  if (time >= 300 && time < 420) { phase = 'Dawn'; sky = '#363b49'; tint = '#a1a1a1'; opacity = .13 }
  else if (time >= 420 && time < 960) { phase = 'Day'; sky = '#444d60'; tint = '#bfbfbf'; opacity = 0 }
  else if (time >= 960 && time < 1080) { phase = 'Golden hour'; sky = '#3c3848'; tint = '#969696'; opacity = .17 }
  else if (time >= 1080 && time < 1140) { phase = 'Dusk'; sky = '#292e3d'; tint = '#4d4d4d'; opacity = .27 }
  else { phase = 'Night'; sky = '#191c24'; tint = '#1d1d1d'; opacity = .5 }
  const daylight = Math.max(0, Math.min(1, (time - 300) / 780))
  return { phase, sky, tint, opacity, dark: phase === 'Night' || phase === 'Dusk', sunX: Math.round(18 + daylight * 220), sunY: Math.round(30 - Math.sin(daylight * Math.PI) * 23), sunColor: phase === 'Golden hour' || phase === 'Dawn' ? '#9e9e9e' : '#c4c4c4', label: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}` }
}
