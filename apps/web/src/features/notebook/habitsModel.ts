export type Habit = { id: string; title: string; createdOn: string; completions: string[]; archived: boolean }
export function localHabitDay(now = new Date()) { return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}` }
export function shiftHabitDay(day: string, offset: number) { const date = new Date(day + 'T12:00:00Z'); date.setUTCDate(date.getUTCDate() + offset); return date.toISOString().slice(0, 10) }
export function validHabitDay(value: unknown): value is string { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + 'T12:00:00Z')) && new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) === value }
export function validHabits(value: unknown): value is Habit[] {
  return Array.isArray(value) && value.length <= 100 && new Set(value.map(h => h?.id)).size === value.length && value.every(h => h && typeof h.id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(h.id) && typeof h.title === 'string' && h.title.trim() === h.title && h.title.length > 0 && h.title.length <= 120 && validHabitDay(h.createdOn) && typeof h.archived === 'boolean' && Array.isArray(h.completions) && h.completions.length <= 10000 && new Set(h.completions).size === h.completions.length && h.completions.every((day: unknown) => validHabitDay(day) && day >= h.createdOn))
}
export function toggleHabitDay(habits: Habit[], id: string, day: string, today: string): Habit[] {
  if (!validHabitDay(day) || day > today) return habits
  return habits.map(habit => habit.id !== id || habit.archived || day < habit.createdOn || (!habit.completions.includes(day) && habit.completions.length >= 10000) ? habit : { ...habit, completions: habit.completions.includes(day) ? habit.completions.filter(mark => mark !== day) : [...habit.completions, day].sort() })
}
