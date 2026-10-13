import type { Task } from '../workspace/demo'
import type { DayEntry } from '../workspace/DayOverview'
import type { MealLog } from '../food/foodModel'
export function gardenGrowth(tasks: Task[], entries: DayEntry[], logs: MealLog[]): number {
  const contributions = new Set<string>()
  tasks.filter(task => task.done).forEach(task => contributions.add(`task:${task.id}`))
  entries.filter(item => item.done && (item.kind === 'Exercise' || item.kind === 'Habit')).forEach(item => contributions.add(`check-in:${item.id}`))
  logs.forEach(log => contributions.add(`food:${log.id}`))
  return contributions.size
}
export function plantStages(growth: number): number[] {
  return [0, 1, 2].map(index => Math.max(0, Math.min(3, Math.floor((growth + 2 - index) / 3))))
}

export function isTask(value: unknown): value is Task {
  if (!value || typeof value !== 'object') return false
  const item = value as Task
  return Number.isFinite(item.id) && typeof item.title === 'string' && typeof item.done === 'boolean' && ['Priority', 'In progress', 'Later'].includes(item.group)
}
export function isDayEntry(value: unknown): value is DayEntry {
  if (!value || typeof value !== 'object') return false
  const item = value as DayEntry
  return ['id', 'time', 'title', 'detail'].every(key => typeof (value as Record<string, unknown>)[key] === 'string') && typeof item.done === 'boolean' && ['Task', 'Food', 'Exercise', 'Meds', 'Habit'].includes(item.kind)
}
