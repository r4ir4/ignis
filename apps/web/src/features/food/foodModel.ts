import type { DayEntry } from '../workspace/DayOverview'
export type MealPlan = { id: string; date: string; name: string; time: string; food: string; notes: string }
export type MealLog = { id: string; date: string; name: string; time: string; food: string; notes: string; planId?: string }
export type SavedMeal = { id: string; name: string; food: string; notes: string }
export type FoodState = { plans: MealPlan[]; logs: MealLog[]; savedMeals: SavedMeal[] }
export const emptyFood: FoodState = { plans: [], logs: [], savedMeals: [] }
export const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
export const savePlan = (state: FoodState, plan: MealPlan): FoodState => ({ ...state, plans: [...state.plans.filter(item => item.id !== plan.id), plan] })
export const saveLog = (state: FoodState, log: MealLog): FoodState => ({ ...state, logs: [...state.logs.filter(item => item.id !== log.id), log] })
export const removePlan = (state: FoodState, id: string): FoodState => ({ ...state, plans: state.plans.filter(item => item.id !== id) })
export const removeLog = (state: FoodState, id: string): FoodState => ({ ...state, logs: state.logs.filter(item => item.id !== id) })
export const saveMeal = (state: FoodState, meal: SavedMeal): FoodState => ({ ...state, savedMeals: [...state.savedMeals.filter(item => item.id !== meal.id), meal] })
export const removeMeal = (state: FoodState, id: string): FoodState => ({ ...state, savedMeals: state.savedMeals.filter(item => item.id !== id) })
export const copyMeal = (meal: SavedMeal, id: string, date: string, time: string): MealPlan => ({ id, date, time, name: meal.name, food: meal.food, notes: meal.notes })
export function foodDayEntries(state: FoodState, date: string): DayEntry[] {
  return state.plans.filter(plan => plan.date === date).map(plan => ({ id: `food-${plan.id}`, time: plan.time, kind: 'Food', title: `${plan.name}: ${plan.food}`, detail: plan.notes || 'Planned meal', done: state.logs.some(log => log.date === date && log.planId === plan.id) }))
}
export function isFoodState(value: unknown): value is FoodState {
  if (!value || typeof value !== 'object') return false
  const candidate = value as FoodState
  const valid = (item: unknown) => {
    if (!item || typeof item !== 'object') return false
    const entry = item as Record<string, unknown>
    return ['id', 'date', 'name', 'time', 'food', 'notes'].every(key => typeof entry[key] === 'string') && /^\d{4}-\d{2}-\d{2}$/.test(entry.date as string) && /^([01]\d|2[0-3]):[0-5]\d$/.test(entry.time as string) && (entry.planId === undefined || typeof entry.planId === 'string')
  }
  return Array.isArray(candidate.savedMeals) && candidate.savedMeals.every(item => item && ['id', 'name', 'food', 'notes'].every(key => typeof (item as unknown as Record<string, unknown>)[key] === 'string')) && Array.isArray(candidate.plans) && Array.isArray(candidate.logs) && candidate.plans.every(valid) && candidate.logs.every(valid)
}

/** Add the new library without changing existing v1 plans or eating history. */
export function normalizeFoodState(value: unknown): FoodState | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Record<string, unknown>
  const upgraded = { ...candidate, savedMeals: candidate.savedMeals === undefined ? [] : candidate.savedMeals }
  return isFoodState(upgraded) ? upgraded : null
}
