import { inferStatusGroup, validStatusGroup, type StatusGroup } from './statusGroups.ts'
import { validItemStatus, itemStatuses, type ItemStatus } from './itemStatus.ts'
import type { PersonalList } from './personalLists.ts'
export const boardColors = [
  { id: 'gray', label: 'Gray', background: '#20201f', badge: '#56554f', accent: '#bcbab6', text: '#f0efed' },
  { id: 'brown', label: 'Brown', background: '#29221e', badge: '#634a3a', accent: '#c99d7e', text: '#f5e7dc' },
  { id: 'orange', label: 'Orange', background: '#2b221b', badge: '#80491f', accent: '#db9b63', text: '#ffead7' },
  { id: 'yellow', label: 'Yellow', background: '#29261a', badge: '#756025', accent: '#d7b65d', text: '#faf0c9' },
  { id: 'green', label: 'Green', background: '#1c251f', badge: '#3a6a4c', accent: '#6aaf87', text: '#e8f1ec' },
  { id: 'blue', label: 'Blue', background: '#1b222a', badge: '#315f90', accent: '#5297df', text: '#e5f2fc' },
  { id: 'purple', label: 'Purple', background: '#25202c', badge: '#63467e', accent: '#b58bd0', text: '#f0e6fa' },
  { id: 'pink', label: 'Pink', background: '#2a2026', badge: '#7e3f63', accent: '#d58bb7', text: '#f9e5f0' },
  { id: 'red', label: 'Red', background: '#2b201f', badge: '#803e38', accent: '#dd8a81', text: '#ffe7e2' },
] as const
export type BoardColor = typeof boardColors[number]['id']
export type BoardColumn = { name: string; color: BoardColor; group?: StatusGroup | null }
export type BoardColumns = Partial<Record<ItemStatus, BoardColumn>>
const defaults: Record<ItemStatus, BoardColumn> = { 'To do': { name: 'To do', color: 'gray' }, 'In progress': { name: 'In progress', color: 'blue' }, Done: { name: 'Done', color: 'green' } }
export function boardColumn(status: string, columns?: BoardColumns | null): BoardColumn {
  return columns?.[status as ItemStatus] || defaults[status as ItemStatus] || { name: validItemStatus(status) && status.startsWith('column:') ? 'Untitled column' : status, color: 'gray' }
}
export function validBoardColumns(value: unknown): value is BoardColumns | null | undefined {
  if (value == null) return true
  return typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length <= 20 && Object.entries(value).every(([status, entry]) => validItemStatus(status) && entry && typeof entry === 'object' && !Array.isArray(entry) && Object.keys(entry).every(key => ['name', 'color', 'group'].includes(key)) && (entry.group == null || validStatusGroup(entry.group)) && typeof entry.name === 'string' && entry.name.length <= 60 && !!entry.name.trim() && /^[^\x00-\x1f\x7f]+$/.test(entry.name) && boardColors.some(color => color.id === entry.color))
}
export function boardColumnStyle(column: BoardColumn) {
  const color = boardColors.find(color => color.id === column.color) || boardColors[0]
  return { backgroundColor: color.background, '--board-pill': color.badge, '--board-accent': color.accent, '--board-label': color.text }
}

export type BoardDefinition = { order: ItemStatus[]; columns: BoardColumns }
export function validBoardDefinition(value: unknown): value is BoardDefinition | null | undefined {
  if (value == null) return true
  const v = value as BoardDefinition
  return typeof v === 'object' && !Array.isArray(v) && Object.keys(v).every(key => ['order', 'columns'].includes(key)) && Array.isArray(v.order) && v.order.length >= 1 && v.order.length <= 20 && v.order.every(validItemStatus) && new Set(v.order).size === v.order.length && !!v.columns && validBoardColumns(v.columns) && Object.keys(v.columns).length === v.order.length && v.order.every(id => Object.hasOwn(v.columns, id))
}
export function listBoard(list?: PersonalList, columns?: BoardColumns | null): BoardDefinition {
  if (list?.board) return list.board
  const order = [...new Set<ItemStatus>([...itemStatuses, ...(list?.items.map(item => item.status) || [])])]
  return { order, columns: Object.fromEntries(order.map(id => [id, boardColumn(id, columns)])) }
}
export function addBoardColumn(list: PersonalList, board: BoardDefinition, id: ItemStatus, column: BoardColumn): PersonalList {
  const current = list.board || board
  if (!validItemStatus(id) || current.order.includes(id) || current.order.length >= 20) return list
  return { ...list, board: { order: [...current.order, id], columns: { ...current.columns, [id]: column } } }
}
export function deleteBoardColumn(list: PersonalList, board: BoardDefinition, id: ItemStatus, target?: ItemStatus): PersonalList {
  const current = list.board || board
  if (current.order.length <= 1 || !current.order.includes(id)) return list
  const items = list.items.filter(item => item.status === id)
  if (items.length && (!target || target === id || !current.order.includes(target))) return list
  const columns = { ...current.columns }; delete columns[id]
  return { ...list, board: { order: current.order.filter(key => key !== id), columns }, items: list.items.map(item => item.status === id && target ? { ...item, status: target } : item) }
}

export function moveBoardColumn(list: PersonalList, board: BoardDefinition, id: ItemStatus, target: ItemStatus, after = false): PersonalList {
  const current = list.board || board
  if (id === target || !current.order.includes(id) || !current.order.includes(target)) return list
  const order = current.order.filter(key => key !== id)
  order.splice(order.indexOf(target) + (after ? 1 : 0), 0, id)
  if (order.every((key, index) => key === current.order[index])) return list
  return { ...list, board: { ...current, order } }
}

export function boardStatusGroup(status: string, columns?: BoardColumns | null): StatusGroup { return boardColumn(status, columns).group || inferStatusGroup(status) }
