import { validNumberDisplay, type NumberDisplay } from './numberDisplay.ts'
import type { PersonalList } from './personalLists.ts'
import { newTaskProperty, type PropertyDefinition } from './taskProperties.ts'
export type PropertyVisibility = 'always' | 'empty' | 'hidden'
export type PropertyDisplay = Record<string, { name?: string | null; visibility?: PropertyVisibility; number?: NumberDisplay | null; order?: number | null }>
export type PropertyDisplayPatch = PropertyDisplay[string] | { before: string | null }
const builtins = ['status', 'date', 'value', 'image']
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function validPropertyDisplay(value: unknown, definitions: PropertyDefinition[] = []): value is PropertyDisplay | null | undefined {
  if (value == null) return true
  if (typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 34) return false
  return Object.entries(value).every(([id, settings]) => {
    if (!builtins.includes(id) && (!uuid.test(id) || !definitions.some(p => p.id === id))) return false
    if (!settings || typeof settings !== 'object' || Array.isArray(settings) || Object.keys(settings).some(key => !['name', 'visibility', 'number', 'order'].includes(key))) return false
    return (settings.order == null || Number.isInteger(settings.order) && settings.order >= 0 && settings.order < 34) && validNumberDisplay(settings.number) && (settings.visibility == null || ['always', 'empty', 'hidden'].includes(settings.visibility)) && (settings.name == null || id === 'value' && typeof settings.name === 'string' && settings.name.trim() === settings.name && settings.name.length > 0 && settings.name.length <= 60 && !/[\x00-\x1f\x7f]/.test(settings.name) && !['name', 'status', 'date', 'image', ...definitions.map(p => p.name.toLowerCase())].includes(settings.name.toLowerCase()))
  })
}
export function propertyShown(list: PersonalList, id: string, value: unknown): boolean {
  const visibility = list.propertyDisplay?.[id]?.visibility
  return visibility !== 'hidden' && !(visibility === 'empty' && (value == null || value === '' || Array.isArray(value) && !value.length))
}
export function updatePropertyDisplay(list: PersonalList, id: string, patch: PropertyDisplayPatch): PersonalList {
  if ('before' in patch) {
    const entries = taskPropertyEntries(list).map(entry => entry.id)
    if (!entries.includes(id) || patch.before !== null && !entries.includes(patch.before) || patch.before === id) return list
    const ordered = entries.filter(entry => entry !== id)
    ordered.splice(patch.before === null ? ordered.length : ordered.indexOf(patch.before), 0, id)
    const propertyDisplay = { ...list.propertyDisplay }
    ordered.forEach((entry, order) => { propertyDisplay[entry] = { ...propertyDisplay[entry], order } })
    return { ...list, propertyDisplay }
  }
  const propertyDisplay = { ...list.propertyDisplay, [id]: { ...list.propertyDisplay?.[id], ...patch } }
  return validPropertyDisplay(propertyDisplay, list.properties || []) ? { ...list, propertyDisplay } : list
}
export function duplicateValueProperty(list: PersonalList, id: string): PersonalList {
  if (!uuid.test(id) || list.properties?.some(p => p.id === id)) return list
  const base = (list.propertyDisplay?.value?.name || 'Value').slice(0, 48)
  let name = `${base} (copy)`, suffix = 2
  while (list.properties?.some(p => p.name.toLowerCase() === name.toLowerCase())) name = `${base} (copy ${suffix++})`
  const created = newTaskProperty(list.properties || [], 'number', name)
  if (typeof created === 'string') return list
  const property = { ...created, id }
  return { ...list, ...(list.propertyDisplay?.value?.number ? { propertyDisplay: { ...list.propertyDisplay, [id]: { number: { ...list.propertyDisplay.value.number } } } } : {}), properties: [...(list.properties || []), property], items: list.items.map(item => ({ ...item, properties: { ...item.properties, [id]: item.value } })) }
}

export function taskPropertyEntries(list: PersonalList) {
  return [{ id: 'status', name: 'Status', type: 'status' }, { id: 'date', name: 'Date', type: 'date' }, { id: 'value', name: list.propertyDisplay?.value?.name || 'Value', type: 'number' }, { id: 'image', name: 'Image', type: 'files' }, ...(list.properties || [])]
    .map((entry, index) => ({ ...entry, index }))
    .sort((a, b) => (list.propertyDisplay?.[a.id]?.order ?? a.index) - (list.propertyDisplay?.[b.id]?.order ?? b.index) || a.index - b.index)
}
