import type { RairaHabitsSnapshot } from './rairaHabitsModel'
export const habitSnapshotCache: { value: RairaHabitsSnapshot | null } = { value: null }
export function invalidateHabitSnapshot() {
  habitSnapshotCache.value = null
  window.dispatchEvent(new Event('ignis:habits-updated'))
}
