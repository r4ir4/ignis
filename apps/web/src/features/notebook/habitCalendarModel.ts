function shiftHabitDay(day: string, offset: number) { const date = new Date(day + 'T12:00:00Z'); date.setUTCDate(date.getUTCDate() + offset); return date.toISOString().slice(0, 10) }
import type { RairaHabit, RairaHabitPeriod } from './rairaHabitsModel'
export function habitMonthDays(month: string): (string | null)[] {
  const first = month + '-01', start = new Date(first + 'T12:00:00Z').getUTCDay()
  const count = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate()
  return [...Array.from({ length: start }, () => null), ...Array.from({ length: count }, (_, index) => shiftHabitDay(first, index))]
}
export function shiftHabitMonth(month: string, offset: number) {
  const date = new Date(month + '-01T12:00:00Z'); date.setUTCMonth(date.getUTCMonth() + offset); return date.toISOString().slice(0, 7)
}
export function habitHeatmapDays(today: string) {
  const sunday = shiftHabitDay(today, -new Date(today + 'T12:00:00Z').getUTCDay())
  return Array.from({ length: 112 }, (_, index) => shiftHabitDay(sunday, index - 105))
}
export function habitDayState(habit: Pick<RairaHabit, 'start_date' | 'target_count'>, day: string, today: string, period?: RairaHabitPeriod) {
  if (day > today || day < habit.start_date || !period) return 'unknown'
  if (period.rest) return 'rest'
  return period.checked ? 'complete' : period.count > 0 ? 'partial' : 'empty'
}
export const habitColors = ['#d2a46d', '#87b59a', '#b49acb', '#d18b88', '#7fb3c2', '#c3b97f']
export function habitColor(id: number) { return habitColors[Math.abs(id) % habitColors.length] }
