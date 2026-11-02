import { validMoodEntries, type MoodEntry } from './moodModel.ts'
import { validReading, type ReadingData } from './readingModel.ts'
import { validHabits, type Habit } from './habitsModel.ts'
import { validStoredPageSymbol } from './pageSymbols.ts'
import { validLists, type PersonalList } from './personalLists.ts'
import { validLayoutNode } from './blockCatalog.ts'
import { validBlockColor } from './blockPalette.ts'
import { validCover, type PageCover } from './coverModel.ts'
import type { JSONContent } from '@tiptap/react'
export type Page = { moods?: MoodEntry[] | null; reading?: ReadingData | null; habits?: Habit[] | null; lists?: PersonalList[]; id: string; parentId: string | null; title: string; content: JSONContent; kind?: 'meeting' | 'board' | 'calendar' | 'dashboard' | 'meds' | 'habits' | null; cover?: PageCover | null; fullWidth?: boolean; font?: 'default' | 'serif' | 'mono'; smallText?: boolean; locked?: boolean; icon?: string | null; favorite?: boolean; deletedAt?: string | null }
export type Snapshot = { revision: number; pages: Page[]; backupWarning?: string | null }
export const descendants = (pages: Page[], id: string): Set<string> => {
  const ids = new Set([id])
  let grew = true
  while (grew) { grew = false; for (const page of pages) if (page.parentId && ids.has(page.parentId) && !ids.has(page.id)) { ids.add(page.id); grew = true } }
  return ids
}
export function reparent(pages: Page[], id: string, parentId: string | null): Page[] {
  if (parentId && descendants(pages, id).has(parentId)) return pages
  return pages.map(p => p.id === id ? { ...p, parentId } : p)
}
export function trash(pages: Page[], id: string, now = new Date().toISOString()): Page[] {
  const ids = descendants(pages, id)
  return pages.map(p => ids.has(p.id) ? { ...p, deletedAt: now } : p)
}
export function restore(pages: Page[], id: string): Page[] {
  const ids = descendants(pages, id)
  let parent = pages.find(p => p.id === id)?.parentId
  while (parent) { ids.add(parent); parent = pages.find(p => p.id === parent)?.parentId }
  return pages.map(p => ids.has(p.id) ? { ...p, deletedAt: null } : p)
}
export function duplicate(pages: Page[], id: string): { pages: Page[]; id: string } {
  const ids = descendants(pages, id)
  const mapping = new Map([...ids].map(old => [old, crypto.randomUUID()]))
  const listMapping = new Map(pages.filter(p => ids.has(p.id)).flatMap(p => (p.lists || []).map(list => [list.id, crypto.randomUUID()] as const)))
  const remapLinks = (node: JSONContent): JSONContent => ({ ...node,
    ...(node.type === 'viewBlock' && listMapping.has(node.attrs?.collectionId) ? { attrs: { ...node.attrs, collectionId: listMapping.get(node.attrs?.collectionId) } } : {}),
    ...(node.type === 'pageLink' && mapping.has(node.attrs?.pageId) ? { attrs: { ...node.attrs, pageId: mapping.get(node.attrs?.pageId) } } : {}),
    ...(node.content ? { content: node.content.map(remapLinks) } : {}),
  })
  const copies = pages.filter(p => ids.has(p.id)).map(p => ({ ...p, ...(p.kind && ['board', 'calendar', 'dashboard', 'meds', 'habits'].includes(p.kind) ? { kind: null } : {}), lists: p.lists?.map(list => ({ ...list, id: listMapping.get(list.id)!, properties: list.properties?.map(prop => prop.config?.targetListId && listMapping.has(prop.config.targetListId) ? { ...prop, config: { ...prop.config, targetListId: listMapping.get(prop.config.targetListId)! } } : prop), items: list.items.map(item => ({ ...item })) })), content: remapLinks(p.content), id: mapping.get(p.id)!, parentId: p.parentId && mapping.has(p.parentId) ? mapping.get(p.parentId)! : p.parentId, title: p.id === id ? `${p.title || 'Untitled'} (copy)` : p.title, deletedAt: null, favorite: false }))
  return { pages: [...pages, ...copies], id: mapping.get(id)! }
}
export function textOf(content: JSONContent): string { return [content.type === 'pageLink' ? content.attrs?.title || '' : content.text || '', ...(content.content || []).map(textOf)].join(' ') }

const normalizePropertyConfig = (value: unknown): unknown => Array.isArray(value) ? value.map(normalizePropertyConfig) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter(([, item]) => item != null).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, normalizePropertyConfig(item)])) : value
export function samePages(left: Page[], right: Page[]): boolean {
  const normalize = (pages: Page[]) => pages.map(p => ({ id: p.id, parentId: p.parentId ?? null, title: p.title, habits: p.habits || [], moods: p.moods || [], reading: p.reading ? { ...p.reading, books: p.reading.books.map(book => ({ ...book, alreadyReadPages: book.alreadyReadPages || 0 })) } : { books: [], entries: [] }, content: p.content, kind: p.kind ?? null, cover: p.cover ? { url: p.cover.url, position: p.cover.position, author: p.cover.author ?? null, authorUrl: p.cover.authorUrl ?? null, sourceUrl: p.cover.sourceUrl ?? null } : null, fullWidth: p.fullWidth ?? true, font: p.font ?? 'default', smallText: !!p.smallText, lists: (p.lists || []).map(list => ({ ...list, idCounter: list.idCounter ?? null, propertyDisplay: Object.fromEntries(Object.entries(list.propertyDisplay || {}).sort(([a], [b]) => a.localeCompare(b)).map(([id, settings]) => [id, { name: settings.name ?? null, visibility: settings.visibility || 'always', number: settings.number ?? null, order: settings.order ?? null }])), board: list.board ?? null, properties: list.properties?.map(p => ({ ...p, config: p.config ? normalizePropertyConfig(p.config) : null })) ?? null, items: list.items.map(item => ({ id: item.id, title: item.title, status: item.status, date: item.date, value: item.value, description: item.description, descriptionContent: item.descriptionContent ?? null, cover: item.cover, properties: item.properties ?? null, metadata: item.metadata ? { ...item.metadata, number: item.metadata.number ?? null } : null })) })), locked: !!p.locked, icon: p.icon ?? null, favorite: !!p.favorite, deletedAt: p.deletedAt ?? null }))
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right))
}

// Browser journals and network responses are untrusted input, even when JSON parses.
// Validate before traversing a tree or handing content to the editor.
export function validPages(value: unknown): value is Page[] {
  if (!Array.isArray(value) || value.length > 1000) return false
  const byId = new Map<string, Page>()
  for (const p of value) {
    if (!p || (p.moods != null && !validMoodEntries(p.moods)) || (p.reading != null && !validReading(p.reading)) || (p.habits != null && !validHabits(p.habits)) || (p.lists != null && !validLists(p.lists)) || typeof p.id !== 'string' || !p.id || byId.has(p.id) || typeof p.title !== 'string' ||
        !(p.parentId == null || typeof p.parentId === 'string') ||
        !(p.deletedAt == null || typeof p.deletedAt === 'string') ||
        !(p.kind == null || ['meeting', 'board', 'calendar', 'dashboard', 'meds', 'habits'].includes(p.kind)) ||
        !(p.locked == null || typeof p.locked === 'boolean') ||
        !(p.font == null || ['default', 'serif', 'mono'].includes(p.font)) || !(p.smallText == null || typeof p.smallText === 'boolean') ||
        !(p.cover == null || validCover(p.cover)) || !(p.fullWidth == null || typeof p.fullWidth === 'boolean') ||
        !(p.icon == null || validStoredPageSymbol(p.icon)) ||
        !(p.favorite == null || typeof p.favorite === 'boolean') || p.content?.type !== 'doc' || !Array.isArray(p.content.content)) return false
    if (['board', 'calendar', 'dashboard', 'meds', 'habits'].includes(p.kind) && (p.content.content.length !== 1 || p.content.content[0]?.type !== 'viewBlock' || p.content.content[0]?.attrs?.view !== (['meds', 'habits'].includes(p.kind) ? 'dashboard' : p.kind))) return false
    const pending: Array<{ node: JSONContent; depth: number; parent?: string }> = [{ node: p.content, depth: 0 }]
    let count = 0
    while (pending.length) {
      const { node, depth, parent } = pending.pop()!
      if (!node || typeof node !== 'object' || typeof node.type !== 'string' || depth > 40 || ++count > 20000 ||
          (node.text !== undefined && typeof node.text !== 'string') ||
          (node.content !== undefined && !Array.isArray(node.content))) return false
      if (node.attrs != null && (typeof node.attrs !== 'object' || Array.isArray(node.attrs))) return false
      if (node.attrs && (!validBlockColor(node.attrs.textColor) || !validBlockColor(node.attrs.backgroundColor))) return false
      if (node.type === 'callout' && node.attrs?.icon != null && !validStoredPageSymbol(node.attrs.icon)) return false
      if (node.type === 'pageLink' && (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(node.attrs?.pageId || '') || typeof node.attrs?.title !== 'string' || node.attrs.title.length > 500)) return false
      if (node.type === 'detailsSummary' && node.attrs?.headingLevel != null && ![1, 2, 3].includes(node.attrs.headingLevel)) return false
      if (node.type === 'details' && node.attrs?.open != null && typeof node.attrs.open !== 'boolean') return false
      if (!validLayoutNode(node) || (node.type === 'column' && parent !== 'columns') || (node.type === 'tabPanel' && parent !== 'tabs')) return false
      pending.push(...(node.content || []).map((child: JSONContent) => ({ node: child, depth: depth + 1, parent: node.type })))
    }
    byId.set(p.id, p)
  }
  const listIds = value.flatMap(page => (page.lists || []).map((list: PersonalList) => list.id))
  if (new Set(listIds).size !== listIds.length) return false
  for (const page of byId.values()) {
    const visited = new Set([page.id])
    let parent = page.parentId
    while (parent) {
      const ancestor = byId.get(parent)
      if (!ancestor || visited.has(parent) || (ancestor.deletedAt && !page.deletedAt)) return false
      visited.add(parent); parent = ancestor.parentId
    }
  }
  return true
}

export function recoveredCopies(source: Page[]): Page[] {
  const pageIds = new Map(source.map(page => [page.id, crypto.randomUUID()])), listIds = new Map(source.flatMap(page => (page.lists || []).map(list => [list.id, crypto.randomUUID()] as const)))
  const remap = (node: JSONContent): JSONContent => ({ ...node,
    ...(node.type === 'pageLink' && pageIds.has(node.attrs?.pageId) ? { attrs: { ...node.attrs, pageId: pageIds.get(node.attrs?.pageId) } } : {}),
    ...(node.type === 'viewBlock' && listIds.has(node.attrs?.collectionId) ? { attrs: { ...node.attrs, collectionId: listIds.get(node.attrs?.collectionId) } } : {}),
    ...(node.content ? { content: node.content.map(remap) } : {}),
  })
  return source.map(page => ({ ...page, ...(page.kind && ['board', 'calendar', 'dashboard', 'meds', 'habits'].includes(page.kind) ? { kind: null } : {}), id: pageIds.get(page.id)!, parentId: page.parentId ? pageIds.get(page.parentId) || null : null, title: `${page.title || 'Untitled'} (recovered)`, content: remap(page.content), lists: page.lists?.map(list => ({ ...list, id: listIds.get(list.id)!, properties: list.properties?.map(prop => prop.config?.targetListId && listIds.has(prop.config.targetListId) ? { ...prop, config: { ...prop.config, targetListId: listIds.get(prop.config.targetListId)! } } : prop), items: list.items.map(item => ({ ...item })) })) }))
}
