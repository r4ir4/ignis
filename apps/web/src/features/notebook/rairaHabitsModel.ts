export type RairaHabitPeriod = { date: string; count: number; checked: boolean; rest: boolean }
export type RairaHabit = { id: number; name: string; section: string; moment: string | null; status: 'active' | 'paused' | 'archived'; cadence: 'daily' | 'weekly' | 'monthly'; target_count: number; start_date: string; period_key: string; completed_count: number; period_done: boolean; due: boolean; rest_day: boolean; current_streak: number; medication_linked: boolean; history: RairaHabitPeriod[]; totals: { periods: number; completed: number; percent: number } }
export type RairaHabitsSnapshot = { timezone: string; owner_day: string; fetched_at: string; habits: RairaHabit[] }
export type RairaHabitMark = { habit_id: number; date: string; period_key: string; expected_count: number; desired_count: number }
export const cadenceLabels = { daily: 'day', weekly: 'week', monthly: 'month' }
export function rairaHabitMark(habit: RairaHabit, day: string, undo = false, native = false): RairaHabitMark | null {
  if (habit.status !== 'active' || habit.medication_linked && !native || !habit.due || habit.rest_day || day < habit.start_date || (undo ? habit.completed_count <= 0 : habit.completed_count >= habit.target_count)) return null
  return { habit_id: habit.id, date: day, period_key: habit.period_key, expected_count: habit.completed_count, desired_count: habit.completed_count + (undo ? -1 : 1) }
}

export function habitDayMark(habit: RairaHabit, day: string, today: string): RairaHabitMark | null {
  const period = habit.history.find(item => item.date === day)
  if (habit.status !== 'active' || habit.cadence !== 'daily' || day > today || day < habit.start_date || !period || period.rest || habit.medication_linked && day !== today) return null
  return { habit_id: habit.id, date: day, period_key: day, expected_count: period.count, desired_count: period.count >= habit.target_count ? period.count - 1 : period.count + 1 }
}
