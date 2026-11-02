import type { MedsSnapshot } from './medsModel'
export const medsSnapshotCache: { value: MedsSnapshot | null } = { value: null }
export function invalidateMedsSnapshot() {
  medsSnapshotCache.value = null
  window.dispatchEvent(new Event('ignis:meds-updated'))
}
