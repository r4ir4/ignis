import { validCardLayout, type CardSize } from './boardCardLayout.ts'
import { validCardProperties } from './cardProperties.ts'
import type { NumberDisplay } from './numberDisplay.ts'
import { validItemStatus, type ItemStatus } from './itemStatus.ts'
import { boardStatusGroup, boardColumn, validBoardColumns, type BoardColumns } from './boardColumns.ts'
import { uuid, type PersonalList } from './personalLists.ts'
import type { Page } from './notebookModel'
export const viewKinds = [
  { id: 'table', label: 'Table view', icon: '▦' }, { id: 'board', label: 'Board view', icon: '▥' },
  { id: 'gallery', label: 'Gallery view', icon: '▧' }, { id: 'feed', label: 'Feed view', icon: '☷' },
  { id: 'calendar', label: 'Calendar view', icon: '▣' }, { id: 'line', label: 'Line chart', icon: '⌁' },
  { id: 'horizontal-bar', label: 'Horizontal bar chart', icon: '▰' }, { id: 'vertical-bar', label: 'Vertical bar chart', icon: '▥' },
  { id: 'number', label: 'Number chart', icon: '#' }, { id: 'dashboard', label: 'Dashboard view', icon: '◫' },
] as const
export type ViewKind = typeof viewKinds[number]['id']
export type ViewSource = 'list' | 'pages' | 'tasks' | 'meetings'
export type ViewConfig = { cardSize?: CardSize | null; cardPreview?: string | null; cardImageFit?: boolean | null; cardProperties?: string[] | null; view: ViewKind; source: ViewSource; title: string; query: string; filter: 'all' | 'open' | 'done'; sort: 'title' | 'date' | 'manual'; group: 'status' | 'day' | 'name'; collectionId?: string | null; metric?: 'count' | 'sum'; columns?: BoardColumns | null; columnOrder?: ItemStatus[] | null; hiddenColumns?: ItemStatus[] | null; hideAggregation?: boolean }
export type ViewRecord = { numberDisplay?: NumberDisplay | null; id: string; title: string; status: string; statusLabel?: string; done: boolean; date: string | null; endDate?: string | null; description: string; url?: string; cover?: string; value?: number | null }
export const defaultViewConfig = (view: ViewKind): ViewConfig => ({ view, source: 'list', cardSize: null, cardPreview: null, cardImageFit: false, cardProperties: null, columns: null, columnOrder: null, hiddenColumns: [], hideAggregation: false, collectionId: null, metric: 'count', title: '', query: '', filter: 'all', sort: view === 'board' ? 'manual' : 'title', group: ['horizontal-bar', 'vertical-bar'].includes(view) ? 'name' : 'status' })
export function validViewConfig(value: unknown): value is ViewConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const v = value as ViewConfig
  return validCardLayout(v) && validCardProperties(v.cardProperties) && (v.hideAggregation == null || typeof v.hideAggregation === 'boolean') && (v.hiddenColumns == null || Array.isArray(v.hiddenColumns) && v.hiddenColumns.length <= 20 && v.hiddenColumns.every(validItemStatus) && new Set(v.hiddenColumns).size === v.hiddenColumns.length) && validBoardColumns(v.columns) && (v.columnOrder == null || Array.isArray(v.columnOrder) && v.columnOrder.length >= 1 && v.columnOrder.length <= 20 && v.columnOrder.every(validItemStatus) && new Set(v.columnOrder).size === v.columnOrder.length) && viewKinds.some(kind => kind.id === v.view) && ['list', 'pages', 'tasks', 'meetings'].includes(v.source) && typeof v.title === 'string' && v.title.length <= 120 && typeof v.query === 'string' && v.query.length <= 200 && ['all', 'open', 'done'].includes(v.filter) && ['title', 'date', 'manual'].includes(v.sort) && ['status', 'day', 'name'].includes(v.group) && (v.collectionId == null || uuid(v.collectionId)) && (v.metric == null || ['count', 'sum'].includes(v.metric))
}
export function recordDay(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) { const date = new Date(`${value}T12:00:00Z`); return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null }
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return null
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'America/Bahia', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  return ['year', 'month', 'day'].map(key => parts.find(part => part.type === key)!.value).join('-')
}
export function pageRecords(pages: Page[]): ViewRecord[] {
  return pages.filter(page => !page.deletedAt).map(page => ({ id: page.id, title: page.title || 'Untitled', status: page.kind === 'meeting' ? 'Meeting note' : 'Page', done: false, date: null, description: '', url: `#page=${page.id}`, cover: page.cover?.url }))
}
export function importedRecords(source: 'tasks' | 'meetings', snapshot: unknown): ViewRecord[] {
  if (!snapshot || typeof snapshot !== 'object') return []
  const value = snapshot as Record<string, unknown>, items = value[source === 'tasks' ? 'tasks' : 'events']
  if (!Array.isArray(items)) return []
  const seen = new Set<string>()
  return items.flatMap(item => {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' || typeof item.title !== 'string' || seen.has(item.id)) return []
    seen.add(item.id)
    if (source === 'tasks' && item.status === -1) return []
    const done = source === 'tasks' && item.status === 2
    return [{ id: item.id, title: item.title || 'Untitled', status: source === 'meetings' ? 'Meeting' : done ? 'Done' : item.status === 1 ? 'In progress' : 'To do', done,
      date: recordDay(source === 'meetings' ? item.allDay ? item.startDay || item.start : item.start : item.dueDate || item.startDate),
      endDate: source === 'meetings' && item.allDay ? recordDay(item.endDay || item.end) : null,
      description: typeof item.location === 'string' ? item.location : typeof item.content === 'string' ? item.content : '',
    }]
  })
}
export function visibleRecords(records: ViewRecord[], config: ViewConfig): ViewRecord[] {
  const query = config.query.trim().toLocaleLowerCase()
  return records.filter(record => (!query || `${record.title} ${record.description}`.toLocaleLowerCase().includes(query)) && (config.filter === 'all' || (config.filter === 'done' ? record.done : !record.done))).sort((a, b) => config.sort === 'manual' ? 0 : (config.sort === 'date' ? (a.date || '9999').localeCompare(b.date || '9999') : 0) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id))
}
export function groupRecords(records: ViewRecord[], group: 'status' | 'day' | 'name') {
  const buckets = new Map<string, ViewRecord[]>()
  for (const record of records) { const key = group === 'status' ? record.status : group === 'name' ? record.title : record.date || 'No date'; buckets.set(key, [...(buckets.get(key) || []), record]) }
  const order: Record<string, number> = { 'To do': 0, 'In progress': 1, 'Done': 2 }
  return [...buckets].sort(([a], [b]) => group === 'status' ? (order[a] ?? 3) - (order[b] ?? 3) || a.localeCompare(b) : a.localeCompare(b)).map(([label, items]) => ({ label, items, count: items.length }))
}
export function calendarDays(month: Date): string[] {
  const start = new Date(month.getFullYear(), month.getMonth(), 1, 12)
  start.setDate(start.getDate() - (start.getDay() + 6) % 7)
  return Array.from({ length: 42 }, (_, index) => { const date = new Date(start); date.setDate(date.getDate() + index); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` })
}
export function recordsOnDay(records: ViewRecord[], day: string) { return records.filter(record => record.date === day || !!(record.date && record.endDate && record.date <= day && record.endDate > day)) }

export function listRecords(list: PersonalList): ViewRecord[] { return list.items.map(item => ({ ...item, numberDisplay: list.propertyDisplay?.value?.number, statusLabel: boardColumn(item.status, list.board?.columns).name, done: boardStatusGroup(item.status, list.board?.columns) === 'complete', cover: item.cover || undefined })) }
export function metricValue(records: ViewRecord[], metric: 'count' | 'sum' = 'count'): number | null {
  if (metric === 'count') return records.length
  const known = records.filter(record => typeof record.value === 'number' && Number.isFinite(record.value))
  return known.length ? known.reduce((sum, record) => sum + record.value!, 0) : null
}
