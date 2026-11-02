import type { PersonalItem, PersonalList } from './personalLists.ts'

const content = (item: PersonalItem) => JSON.stringify({ title: item.title, status: item.status, date: item.date, value: item.value, description: item.description, descriptionContent: item.descriptionContent ?? null, cover: item.cover, properties: Object.fromEntries(Object.entries(item.properties || {}).sort(([a], [b]) => a.localeCompare(b))) })
/** System fields follow task identity, independently of display order, filters, and property names. */
export function reconcileTaskSystems(previous: PersonalList[], requested: PersonalList[], now = new Date().toISOString()): PersonalList[] {
  return requested.map(list => {
    const before = previous.find(value => value.id === list.id), old = new Map(before?.items.map(item => [item.id, item]) || [])
    const numbered = !!list.idCounter || !!before?.idCounter || list.properties?.some(property => property.type === 'id') || list.items.some(item => item.metadata?.number)
    let counter = Math.max(list.idCounter || 0, before?.idCounter || 0, ...list.items.map(item => item.metadata?.number || 0))
    const used = new Set<number>()
    const items = list.items.map(item => {
      const saved = old.get(item.id), changed = !!saved && content(saved) !== content(item)
      let number = saved?.metadata?.number || item.metadata?.number
      if (numbered && (!number || used.has(number))) number = ++counter
      if (number) used.add(number)
      const metadata = {
        createdAt: saved ? saved.metadata?.createdAt || item.metadata?.createdAt || null : item.metadata?.createdAt || now,
        createdBy: saved ? saved.metadata?.createdBy || item.metadata?.createdBy || null : item.metadata?.createdBy || 'You',
        editedAt: changed ? now : saved ? saved.metadata?.editedAt || item.metadata?.editedAt || null : item.metadata?.editedAt || now,
        editedBy: changed ? 'You' : saved ? saved.metadata?.editedBy || item.metadata?.editedBy || null : item.metadata?.editedBy || 'You',
        ...(number ? { number } : {}),
      }
      return JSON.stringify(metadata) === JSON.stringify(item.metadata) || !saved && !numbered && !!item.metadata ? item : { ...item, metadata }
    })
    return { ...list, ...(numbered ? { idCounter: counter } : {}), items }
  })
}
