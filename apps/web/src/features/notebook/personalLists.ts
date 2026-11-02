import { validPropertyDisplay, type PropertyDisplay } from './propertyDisplay.ts'
import type { JSONContent } from '@tiptap/core'
import { validTaskDescription } from './taskDescription.ts'
import { taskPropertyDefaults, validPropertyDefinitions, validPropertyValues, type PropertyDefinition, type PropertyValue } from './taskProperties.ts'
import { validItemStatus, itemStatuses, type ItemStatus } from './itemStatus.ts'
import { validBoardDefinition, type BoardDefinition } from './boardColumns.ts'
export { itemStatuses } from './itemStatus.ts'
export type ItemMetadata = { number?: number | null; createdAt: string | null; createdBy: string | null; editedAt: string | null; editedBy: string | null }
export function touchItem(item: PersonalItem): PersonalItem { const now = new Date().toISOString(); return { ...item, metadata: { ...item.metadata, createdAt: item.metadata?.createdAt || null, createdBy: item.metadata?.createdBy || null, editedAt: now, editedBy: 'You' } } }
export type PersonalItem = { id: string; title: string; status: ItemStatus; date: string | null; value: number | null; description: string; descriptionContent?: JSONContent | null; cover: string | null; properties?: Record<string, PropertyValue> | null; metadata?: ItemMetadata | null }
export type PersonalList = { idCounter?: number | null; propertyDisplay?: PropertyDisplay | null; id: string; name: string; items: PersonalItem[]; board?: BoardDefinition | null; properties?: PropertyDefinition[] | null }
export const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
export function validItem(value: unknown): value is PersonalItem {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const item = value as PersonalItem
  return (item.descriptionContent == null || validTaskDescription(item.descriptionContent)) && (item.metadata == null || typeof item.metadata === 'object' && (item.metadata.number == null || Number.isSafeInteger(item.metadata.number) && item.metadata.number > 0 && item.metadata.number <= 1e12) && ['createdAt', 'editedAt'].every(key => { const v = item.metadata![key as 'createdAt']; return v === null || typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v)) }) && ['createdBy', 'editedBy'].every(key => { const v = item.metadata![key as 'createdBy']; return v === null || typeof v === 'string' && v.length <= 120 })) && uuid(item.id) && typeof item.title === 'string' && item.title.length <= 500 && validItemStatus(item.status) && (item.date === null || typeof item.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.date) && Number.isFinite(Date.parse(`${item.date}T12:00:00Z`)) && new Date(`${item.date}T12:00:00Z`).toISOString().slice(0, 10) === item.date) && (item.value === null || typeof item.value === 'number' && Number.isFinite(item.value) && item.value >= 0 && item.value <= 1e12) && typeof item.description === 'string' && item.description.length <= 5000 && (item.cover === null || typeof item.cover === 'string' && item.cover.length <= 2000 && (/^https:\/\//i.test(item.cover) || /^\/api\/notebook\/cover-images\/[a-f0-9]{64}\.(webp|png|jpg)$/.test(item.cover)))
}
export function validLists(value: unknown): value is PersonalList[] {
  return Array.isArray(value) && value.length <= 50 && new Set(value.map(list => list?.id)).size === value.length && value.every(list => list && (list.idCounter == null || Number.isSafeInteger(list.idCounter) && list.idCounter >= 0 && list.idCounter <= 1e12) && Array.isArray(list.items) && new Set(list.items?.map((item: PersonalItem) => item.metadata?.number).filter((number: unknown) => number != null)).size === (list.items?.filter((item: PersonalItem) => item.metadata?.number != null).length || 0) && uuid(list.id) && typeof list.name === 'string' && list.name.length <= 120 && Array.isArray(list.items) && list.items.length <= 1000 && new Set(list.items.map((item: PersonalItem) => item?.id)).size === list.items.length && list.items.every(validItem) && (list.idCounter == null || list.items.every((item: PersonalItem) => !item.metadata?.number || item.metadata.number <= list.idCounter)) && validPropertyDefinitions(list.properties) && validPropertyDisplay(list.propertyDisplay, list.properties || []) && list.items.every((item: PersonalItem) => validPropertyValues(item.properties, list.properties)) && validBoardDefinition(list.board) && (list.board ? list.items.every((item: PersonalItem) => list.board.order.includes(item.status)) : list.items.every((item: PersonalItem) => (itemStatuses as readonly string[]).includes(item.status))))
}
export function blankItem(list?: PersonalList): PersonalItem { return { ...(list ? { properties: taskPropertyDefaults(list.properties) } : {}), id: crypto.randomUUID(), title: '', status: 'To do', date: null, value: null, description: '', cover: null, metadata: { createdAt: new Date().toISOString(), createdBy: 'You', editedAt: new Date().toISOString(), editedBy: 'You' } } }

/** Update against the latest list so a card drag never overwrites other item edits. */
export function moveItemStatus(list: PersonalList, id: string, status: PersonalItem['status']): PersonalList {
  if (!validItemStatus(status) || !!list.board && !list.board.order.includes(status) || !list.items.some(item => item.id === id && item.status !== status)) return list
  return { ...list, items: list.items.map(item => item.id === id ? touchItem({ ...item, status }) : item) }
}

/** Move relative to a stable card identity, preserving hidden records and current field edits. */
export function moveBoardItem(list: PersonalList, id: string, status: PersonalItem['status'], targetId?: string, after = false, displayedOrder?: readonly string[]): PersonalList {
  const item = list.items.find(item => item.id === id)
  if (!item || !validItemStatus(status) || !!list.board && !list.board.order.includes(status) || targetId === id) return list
  const target = targetId ? list.items.find(item => item.id === targetId) : undefined
  if (targetId && (!target || target.status !== status)) return list
  const visible = displayedOrder ? [...new Set(displayedOrder)].map(id => list.items.find(item => item.id === id)).filter((item): item is PersonalItem => !!item) : []
  const visibleIds = new Set(visible.map(item => item.id))
  let visibleIndex = 0
  const ordered = visible.length ? list.items.map(item => visibleIds.has(item.id) ? visible[visibleIndex++] : item) : list.items
  const items = ordered.filter(item => item.id !== id)
  let last = -1
  items.forEach((item, index) => { if (item.status === status) last = index })
  const index = target ? items.findIndex(item => item.id === target.id) + (after ? 1 : 0) : last >= 0 ? last + 1 : items.length
  items.splice(index, 0, item.status === status ? item : touchItem({ ...item, status }))
  if (items.every((item, index) => item === list.items[index])) return list
  return { ...list, items }
}

/** Apply only changed cells and explicit row removals, retaining newer edits elsewhere. */
export function mergeDataEdits(current: PersonalList, base: PersonalList, draft: PersonalItem[]): PersonalList {
  const original = new Map(base.items.map(item => [item.id, item]))
  const edited = new Map(draft.map(item => [item.id, item]))
  const items = current.items.filter(item => !original.has(item.id) || edited.has(item.id)).map(item => {
    const before = original.get(item.id), after = edited.get(item.id)
    if (!before || !after) return item
    const next = { ...item }
    for (const field of ['title', 'status', 'date', 'value'] as const) if (before[field] !== after[field]) Object.assign(next, { [field]: after[field] })
    return ['title', 'status', 'date', 'value'].some(field => item[field as keyof PersonalItem] !== next[field as keyof PersonalItem]) ? touchItem(next) : item
  })
  const currentIds = new Set(current.items.map(item => item.id))
  const added = draft.filter(item => !original.has(item.id) && !currentIds.has(item.id))
  return { ...current, items: [...items, ...added] }
}

/** Autosave only the edited fields against the current task; never recreate a deleted task. */
export function patchPersonalItem(list: PersonalList, id: string, patch: Partial<Omit<PersonalItem, 'id'>>): PersonalList {
  const current = list.items.find(item => item.id === id)
  if (!current) return list
  const next = { ...current, ...patch, ...(patch.properties ? { properties: { ...current.properties, ...patch.properties } } : {}), id }
  if (!validItem(next) || !validPropertyValues(next.properties, list.properties) || list.board && !list.board.order.includes(next.status)) return list
  if (Object.keys(patch).every(key => JSON.stringify(current[key as keyof PersonalItem]) === JSON.stringify(next[key as keyof PersonalItem]))) return list
  return { ...list, items: list.items.map(item => item.id === id ? touchItem(next) : item) }
}
