import { inferStatusGroup, validStatusGroup, type StatusGroup } from './statusGroups.ts'
import type { PersonalList, PersonalItem } from './personalLists'
import { validBlockColor, type BlockColor } from './blockPalette.ts'
import { evaluateFormula } from './propertyFormula.ts'
export const storedPropertyTypes = ['text', 'number', 'select', 'multi-select', 'status', 'date', 'person', 'files', 'checkbox', 'url', 'email', 'phone', 'formula', 'relation', 'rollup', 'created-time', 'created-by', 'edited-time', 'edited-by', 'button', 'place', 'id'] as const
export type PropertyType = typeof storedPropertyTypes[number]
/** Retired types stay readable in history/backups, but cannot be newly selected. */
export const propertyTypes: readonly PropertyType[] = storedPropertyTypes.filter(type => !['person', 'phone', 'created-by', 'edited-by', 'place', 'relation'].includes(type))
export const propertyTypeNames: Record<PropertyType, string> = { text: 'Text', number: 'Number', select: 'Select', 'multi-select': 'Multi-select', status: 'Status', date: 'Date', person: 'Person', files: 'Files & media', checkbox: 'Checkbox', url: 'URL', email: 'Email', phone: 'Phone', formula: 'Formula', relation: 'Relation', rollup: 'Rollup', 'created-time': 'Created time', 'created-by': 'Created by', 'edited-time': 'Last edited time', 'edited-by': 'Last edited by', button: 'Button', place: 'Place', id: 'ID' }
export type ButtonStep = { action: 'complete' | 'reopen' | 'check' | 'today' | 'edit'; targetId?: string; targetProperty?: string; value?: PropertyValue }
export type PropertyConfig = { buttonLabel?: string; confirmation?: string; steps?: ButtonStep[]; statusGroups?: Record<string, StatusGroup>; defaultStatus?: string; optionColors?: Record<string, BlockColor | 'default'>; optionSort?: 'manual' | 'ascending' | 'descending'; expression?: string; targetListId?: string; relationId?: string; targetProperty?: string; aggregation?: 'count' | 'sum' | 'average' | 'min' | 'max' | 'unique'; action?: 'complete' | 'reopen' | 'check'; targetId?: string; prefix?: string }
export type PropertyDefinition = { id: string; name: string; type: PropertyType; options: string[]; config?: PropertyConfig | null }
export const automaticPropertyTypes = ['formula', 'rollup', 'created-time', 'created-by', 'edited-time', 'edited-by', 'id', 'button']
export function validPropertyConfig(config: unknown): config is PropertyConfig | null | undefined {
  if (config == null) return true
  if (typeof config !== 'object' || Array.isArray(config)) return false
  const rules: Record<string, (v: unknown) => boolean> = { buttonLabel: v => typeof v === 'string' && v.length <= 60, confirmation: v => typeof v === 'string' && v.length <= 300, steps: v => Array.isArray(v) && v.length <= 10 && v.every(step => step && Object.keys(step).every(key => ['action', 'targetId', 'targetProperty', 'value'].includes(key)) && ['complete', 'reopen', 'check', 'today', 'edit'].includes(step.action) && (step.targetId === undefined || uuid(step.targetId)) && (step.targetProperty === undefined || ['title', 'status', 'date', 'value'].includes(step.targetProperty) || uuid(step.targetProperty)) && (step.value == null || typeof step.value === 'boolean' || typeof step.value === 'number' && Number.isFinite(step.value) || typeof step.value === 'string' && step.value.length <= 2000)), statusGroups: v => !!v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length <= 30 && Object.entries(v).every(([key, group]) => !!key.trim() && key.length <= 60 && validStatusGroup(group)), defaultStatus: v => typeof v === 'string' && !!v.trim() && v.length <= 60, optionSort: v => ['manual', 'ascending', 'descending'].includes(String(v)), optionColors: v => !!v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length <= 30 && Object.entries(v).every(([key, color]) => !!key.trim() && key.length <= 60 && color != null && (color === 'default' || validBlockColor(color))), expression: v => typeof v === 'string' && v.length <= 1000, targetListId: uuid, relationId: uuid, targetProperty: v => typeof v === 'string' && (['title', 'value', 'status', 'date'].includes(v) || uuid(v)), aggregation: v => ['count', 'sum', 'average', 'min', 'max', 'unique'].includes(String(v)), action: v => ['complete', 'reopen', 'check'].includes(String(v)), targetId: uuid, prefix: v => typeof v === 'string' && /^[A-Za-z0-9_-]{0,12}$/.test(v) }
  return Object.entries(config).every(([key, value]) => !!rules[key]?.(value))
}
export type PropertyValue = string | number | boolean | string[] | null
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
export const validPropertyDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(`${v}T12:00:00Z`)) && new Date(`${v}T12:00:00Z`).toISOString().slice(0, 10) === v
export function validPropertyDefinitions(v: unknown): v is PropertyDefinition[] | null | undefined {
  return v == null || Array.isArray(v) && v.length <= 30 && new Set(v.map(p => p?.id)).size === v.length && new Set(v.map(p => p?.name?.toLocaleLowerCase())).size === v.length && v.every(p => p && Object.keys(p).every(key => ['id', 'name', 'type', 'options', 'config'].includes(key)) && validPropertyConfig(p.config) && (!p.config?.statusGroups || p.type === 'status' && Object.keys(p.config.statusGroups).every(key => Array.isArray(p.options) && p.options.includes(key))) && (!p.config?.defaultStatus || p.type === 'status' && Array.isArray(p.options) && p.options.includes(p.config.defaultStatus)) && (!p.config?.optionColors || Object.keys(p.config.optionColors).every(key => Array.isArray(p.options) && p.options.includes(key))) && uuid(p.id) && typeof p.name === 'string' && p.name.trim().length > 0 && p.name.length <= 60 && /^[^\x00-\x1f\x7f]+$/.test(p.name) && storedPropertyTypes.includes(p.type) && Array.isArray(p.options) && p.options.length <= 30 && new Set(p.options).size === p.options.length && p.options.every((o: unknown) => typeof o === 'string' && !!o.trim() && o.length <= 60 && /^[^\x00-\x1f\x7f]+$/.test(o)) && (['select', 'multi-select', 'status', 'person'].includes(p.type) || p.options.length === 0))
}
export function validPropertyValue(value: unknown, definition: PropertyDefinition): value is PropertyValue {
  if (value === null) return true
  switch (definition.type) {
    case 'place': case 'text': return typeof value === 'string' && value.length <= 2000
    case 'number': return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1e12
    case 'checkbox': return typeof value === 'boolean'
    case 'date': return typeof value === 'string' && validPropertyDate(value)
    case 'url': { if (typeof value !== 'string' || value.length > 2000) return false; try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !!url.hostname && !url.username && !url.password } catch { return false } }
    case 'email': return typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    case 'phone': return typeof value === 'string' && value.length <= 60 && /^[+0-9() .#x-]+$/.test(value) && /[0-9]/.test(value)
    case 'files': return Array.isArray(value) && value.length <= 30 && value.every(v => typeof v === 'string' && (validPropertyValue(v, { ...definition, type: 'url' }) || /^\/api\/notebook\/attachments\/[a-f0-9]{64}\/[A-Za-z0-9_.%-]+$/.test(v)))
    case 'relation': return Array.isArray(value) && value.length <= 30 && new Set(value).size === value.length && value.every(uuid)
    case 'person': return Array.isArray(value) && value.length <= 30 && new Set(value).size === value.length && value.every(v => typeof v === 'string' && definition.options.includes(v))
    case 'status': case 'select': return typeof value === 'string' && definition.options.includes(value)
    case 'created-time': case 'created-by': case 'edited-time': case 'edited-by': case 'formula': case 'rollup': case 'button': case 'id': return false
    case 'multi-select': return Array.isArray(value) && value.length <= 30 && new Set(value).size === value.length && value.every(option => typeof option === 'string' && definition.options.includes(option))
  }
}
export function validPropertyValues(value: unknown, definitions?: PropertyDefinition[] | null): boolean {
  if (value == null) return true
  return typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length <= 30 && Object.entries(value).every(([id, v]) => { const definition = definitions?.find(p => p.id === id); return !!definition && validPropertyValue(v, definition) })
}
export function upsertTaskProperty(list: PersonalList, definition: PropertyDefinition, lists: PersonalList[] = [list], approval?: string): PersonalList {
  if (list.propertyDisplay?.value?.name?.toLowerCase() === definition.name.toLowerCase()) return list
  const previous = list.properties || [], current = previous.find(p => p.id === definition.id)
  if (current && current.type !== definition.type) {
    const plan = planTaskPropertyChange(list, definition, lists)
    if (!plan || plan.cleared && approval !== plan.signature) return list
    return { ...list, properties: previous.map(p => p.id === definition.id ? plan.definition : p), items: plan.items }
  }
  const next = current ? { ...current, name: definition.name, options: definition.options, config: definition.config ?? null } : definition
  const properties = current ? previous.map(p => p.id === next.id ? next : p) : [...previous, next]
  return validPropertyDefinitions(properties) && list.items.every(item => validPropertyValues(item.properties, properties)) ? { ...list, properties, ...(!current && definition.type === 'status' ? { items: list.items.map(item => ({ ...item, properties: { ...item.properties, [definition.id]: definition.config?.defaultStatus || definition.options[0] || null } })) } : {}) } : list
}

export function removeTaskProperty(list: PersonalList, id: string): PersonalList {
  if (!list.properties?.some(p => p.id === id)) return list
  const propertyDisplay = { ...list.propertyDisplay }; delete propertyDisplay[id]
  return { ...list, ...(list.propertyDisplay ? { propertyDisplay } : {}), properties: list.properties.filter(p => p.id !== id), items: list.items.map(item => { if (!item.properties || !(id in item.properties)) return item; const properties = { ...item.properties }; delete properties[id]; return { ...item, properties } }) }
}

/** Type selection creates a named property directly, as in Notion's add menu. */
export function newTaskProperty(definitions: PropertyDefinition[], type: PropertyType, requestedName = ''): PropertyDefinition | string {
  if (!propertyTypes.includes(type)) return 'This property type is no longer available.'
  const labels = propertyTypeNames
  const used = new Set(['name', 'status', 'date', 'value', 'image', ...definitions.map(p => p.name.toLowerCase())])
  let name = requestedName.trim() || labels[type]
  if (requestedName.trim() && used.has(name.toLowerCase())) return 'A property with this name already exists.'
  if (!requestedName.trim()) { let suffix = 2; while (used.has(name.toLowerCase())) name = `${labels[type]} ${suffix++}` }
  const property: PropertyDefinition = { ...(type === 'id' ? { config: { prefix: 'TASK' } } : {}), ...(type === 'status' ? { config: { defaultStatus: 'Not started', statusGroups: { 'Not started': 'todo', 'In progress': 'in-progress', Done: 'complete' } } } : {}), id: crypto.randomUUID(), name, type, options: type === 'status' ? ['Not started', 'In progress', 'Done'] : type === 'person' ? ['You'] : [] }
  return validPropertyDefinitions([...definitions, property]) ? property : 'Use a valid name (up to 60 characters) and keep at most 30 properties.'
}

/** Computed values are derived, not editable snapshots. Missing legacy metadata stays unknown. */
export function computedProperty(definition: PropertyDefinition, item: PersonalItem, list: PersonalList, lists: PersonalList[] = [list], seen = new Set<string>()): PropertyValue {
  const key = `${list.id}:${item.id}:${definition.id}`
  if (seen.has(key) || seen.size > 30) throw new Error('Circular property reference.')
  const path = new Set(seen).add(key), config = definition.config || {}
  const read = (target: PersonalItem, source: PersonalList, name: string): PropertyValue => {
    const builtins: Record<string, PropertyValue> = { Name: target.title, Status: target.status, Date: target.date, Value: target.value, title: target.title, status: target.status, date: target.date, value: target.value }
    if (Object.hasOwn(builtins, name)) return builtins[name]
    const prop = source.properties?.find(p => p.id === name || p.name === name)
    if (!prop) throw new Error(`Property unavailable: ${name}`)
    return automaticPropertyTypes.includes(prop.type) ? computedProperty(prop, target, source, lists, path) : target.properties?.[prop.id] ?? null
  }
  switch (definition.type) {
    case 'formula': return config.expression ? evaluateFormula(config.expression, name => read(item, list, name)) : null
    case 'rollup': {
      const relation = list.properties?.find(p => p.id === config.relationId && p.type === 'relation')
      if (!relation) { if (!config.relationId) return null; throw new Error('Relation unavailable.') }
      const source = lists.find(l => l.id === relation.config?.targetListId) || (!relation.config?.targetListId ? list : undefined)
      if (!source) throw new Error('Related list unavailable.')
      const ids = item.properties?.[relation.id], targets = Array.isArray(ids) ? ids.map(id => source.items.find(t => t.id === id)).filter((t): t is PersonalItem => !!t) : []
      if (!config.aggregation || config.aggregation === 'count') return targets.length
      const values = targets.map(t => read(t, source, config.targetProperty || 'value')).filter(v => v != null)
      if (config.aggregation === 'unique') return [...new Set(values.flat().map(String))].join(', ')
      if (values.some(v => typeof v !== 'number')) throw new Error('Choose a number property for this calculation.')
      const numbers = values as number[]
      if (!numbers.length) return null
      const sum = numbers.reduce((a, b) => a + b, 0)
      return config.aggregation === 'sum' ? sum : config.aggregation === 'average' ? sum / numbers.length : config.aggregation === 'min' ? Math.min(...numbers) : Math.max(...numbers)
    }
    case 'created-time': return item.metadata?.createdAt || null
    case 'edited-time': return item.metadata?.editedAt || null
    case 'created-by': return item.metadata?.createdBy || null
    case 'edited-by': return item.metadata?.editedBy || null
    case 'id': return item.metadata?.number ? `${config.prefix ? config.prefix + '-' : ''}${item.metadata.number}` : null
    default: return item.properties?.[definition.id] ?? null
  }
}

export type PropertyChangeEntry = { id: string; title: string; before: PropertyValue; after: PropertyValue; cleared: boolean; reason: string }
export type PropertyChangePlan = { definition: PropertyDefinition; items: PersonalItem[]; entries: PropertyChangeEntry[]; cleared: number; signature: string }
const selectionTypes = ['select', 'multi-select', 'status', 'person']
const blankPropertyValue = (value: PropertyValue) => value === null || value === '' || Array.isArray(value) && !value.length
/** Plan against the entire canonical list, including tasks hidden by board filters. */
export function planTaskPropertyChange(list: PersonalList, requested: PropertyDefinition, lists: PersonalList[] = [list]): PropertyChangePlan | null {
  const current = list.properties?.find(p => p.id === requested.id)
  if (!current || current.type === requested.type || !propertyTypes.includes(requested.type)) return null
  const definition = { ...requested, options: selectionTypes.includes(requested.type) ? [...requested.options] : [], config: requested.config ?? null }
  if (!validPropertyDefinitions(list.properties!.map(p => p.id === requested.id ? definition : p))) return null
  const sources = lists.map(l => l.id === list.id ? list : l)
  if (!sources.some(l => l.id === list.id)) sources.push(list)
  const inferChoices = selectionTypes.includes(definition.type) && definition.options.length === 0
  if (inferChoices && selectionTypes.includes(current.type)) {
    definition.options = [...current.options]
    definition.config = { ...definition.config, ...(current.config?.optionColors ? { optionColors: { ...current.config.optionColors } } : {}), ...(current.config?.optionSort ? { optionSort: current.config.optionSort } : {}) }
  }
  const entries: PropertyChangeEntry[] = []
  const items = list.items.map(item => {
    let before: PropertyValue = item.properties?.[current.id] ?? null, error = ''
    try { if (automaticPropertyTypes.includes(current.type) && current.type !== 'button') before = computedProperty(current, item, list, sources) }
    catch { error = 'The current calculation cannot be evaluated.' }
    let after: PropertyValue = null
    let reason = error
    if (!error && !blankPropertyValue(before)) {
      let source = before
      if (current.type === 'relation' && definition.type !== 'relation' && Array.isArray(source)) {
        const related = sources.find(l => l.id === current.config?.targetListId) || (!current.config?.targetListId ? list : undefined)
        source = source.map(id => related?.items.find(t => t.id === id)?.title || id)
      }
      const single = Array.isArray(source) ? source.length === 1 ? source[0] : null : source
      const text = single === null ? '' : String(single)
      switch (definition.type) {
        case 'text': after = Array.isArray(source) ? source.join('\n') : String(source); break
        case 'number': if (typeof single === 'number') after = single; else if (typeof single === 'boolean') after = single ? 1 : 0; else if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text.trim())) after = Number(text.trim()); break
        case 'checkbox': if (typeof single === 'boolean') after = single; else if (/^(true|yes|1|checked)$/i.test(text.trim())) after = true; else if (/^(false|no|0|unchecked)$/i.test(text.trim())) after = false; break
        case 'date': { const day = ['created-time', 'edited-time'].includes(current.type) ? text.slice(0, 10) : text.trim(); if (validPropertyDate(day)) after = day; break }
        case 'url': case 'email': if (single !== null) after = text; break
        case 'files': after = Array.isArray(source) ? source : typeof source === 'string' ? source.split('\n').map(v => v.trim()).filter(Boolean) : null; break
        case 'relation': { const ids = Array.isArray(source) ? source : typeof source === 'string' ? [source.trim()] : []; const related = sources.find(l => l.id === definition.config?.targetListId) || (!definition.config?.targetListId ? list : undefined); if (ids.length && ids.every(id => related?.items.some(t => t.id === id))) after = [...new Set(ids)]; break }
        case 'select': case 'status': case 'multi-select': {
          const candidates = Array.isArray(source) ? [...new Set(source)] : [String(source)]
          if (['select', 'status'].includes(definition.type) && candidates.length > 1) { reason = 'Multiple choices cannot fit in a single-choice property.'; break }
          if (inferChoices) for (const option of candidates) if (option.trim() && option.length <= 60 && !/[\x00-\x1f\x7f]/.test(option) && !definition.options.includes(option) && definition.options.length < 30) definition.options.push(option)
          after = definition.type === 'multi-select' ? candidates : candidates[0] ?? null
          break
        }
        default: reason = 'This type calculates its own values instead of storing manual values.'
      }
      if (!validPropertyValue(after, definition)) { after = null; reason ||= 'This value does not fit the new type.' }
      if (after === null) reason ||= 'This value cannot be converted.'
    }
    const cleared = !!error || !blankPropertyValue(before) && blankPropertyValue(after)
    entries.push({ id: item.id, title: item.title || 'Untitled', before, after, cleared, reason })
    // A type change is one atomic definition/value update. Other fields remain untouched.
    return { ...item, properties: { ...item.properties, [definition.id]: after } }
  })
  const properties = list.properties!.map(p => p.id === definition.id ? definition : p)
  if (!validPropertyDefinitions(properties) || !items.every(item => validPropertyValues(item.properties, properties))) return null
  const cleared = entries.filter(entry => entry.cleared).length
  return { definition, items, entries, cleared, signature: JSON.stringify({ from: current.type, to: definition, loss: entries.filter(entry => entry.cleared).map(({ id, before, reason }) => ({ id, before, reason })) }) }
}

export type PropertyMenuAction = { kind: 'duplicate'; id: string; newId?: string } | { kind: 'rename-option'; id: string; option: string; name: string; color?: BlockColor | 'default' | null } | { kind: 'delete-option'; id: string; option: string }
/** Menu actions update schema and all affected values together, retaining property identities. */
export function applyPropertyMenuAction(list: PersonalList, action: PropertyMenuAction): PersonalList {
  const definition = list.properties?.find(p => p.id === action.id)
  if (!definition) return list
  if (action.kind === 'duplicate') {
    if (!propertyTypes.includes(definition.type) || list.properties!.length >= 30) return list
    const used = new Set(list.properties!.map(p => p.name.toLowerCase()))
    let n = 1, name: string
    do { const suffix = n === 1 ? ' (copy)' : ` (copy ${n})`; name = definition.name.slice(0, 60 - suffix.length) + suffix; n++ } while (used.has(name.toLowerCase()))
    const id = action.newId || crypto.randomUUID()
    if (!uuid(id) || list.properties!.some(p => p.id === id)) return list
    const copy: PropertyDefinition = { ...definition, id, name, options: [...definition.options], config: definition.config ? { ...definition.config, ...(definition.config.statusGroups ? { statusGroups: { ...definition.config.statusGroups } } : {}), ...(definition.config.optionColors ? { optionColors: { ...definition.config.optionColors } } : {}) } : null }
    const items = list.items.map(item => {
      if (!item.properties || !(definition.id in item.properties)) return item
      const value = item.properties[definition.id]
      return { ...item, properties: { ...item.properties, [copy.id]: Array.isArray(value) ? [...value] : value } }
    })
    return { ...list, ...(list.propertyDisplay?.[definition.id]?.number ? { propertyDisplay: { ...list.propertyDisplay, [copy.id]: { number: { ...list.propertyDisplay[definition.id].number! } } } } : {}), properties: [...list.properties!, copy], items }
  }
  if (!selectionTypes.includes(definition.type) || !definition.options.includes(action.option)) return list
  const name = action.kind === 'rename-option' ? action.name.trim() : ''
  if (action.kind === 'rename-option' && (name === action.option || !name || name.length > 60 || /[\x00-\x1f\x7f]/.test(name) || definition.options.includes(name))) return list
  const options = action.kind === 'rename-option' ? definition.options.map(v => v === action.option ? name : v) : definition.options.filter(v => v !== action.option)
  const items = list.items.map(item => {
    const value = item.properties?.[definition.id]
    if (value !== action.option && !(Array.isArray(value) && value.includes(action.option))) return item
    const next = Array.isArray(value) ? action.kind === 'rename-option' ? value.map(v => v === action.option ? name : v) : value.filter(v => v !== action.option) : action.kind === 'rename-option' ? name : null
    return { ...item, properties: { ...item.properties, [definition.id]: next } }
  })
  if (action.kind === 'rename-option' && action.color != null && action.color !== 'default' && !validBlockColor(action.color)) return list
  const previousColor = definition.config?.optionColors && Object.hasOwn(definition.config.optionColors, action.option) ? definition.config.optionColors[action.option] : undefined
  const color = action.kind === 'rename-option' ? Object.hasOwn(action, 'color') ? action.color : previousColor : undefined
  const colors = Object.fromEntries([...Object.entries(definition.config?.optionColors || {}).filter(([key]) => key !== action.option), ...(color ? [[name, color]] : [])])
  const config = { ...definition.config, ...(definition.config?.optionColors || color ? { optionColors: colors } : {}) }
  if (config.statusGroups) config.statusGroups = Object.fromEntries(Object.entries(config.statusGroups).filter(([key]) => key !== action.option).concat(action.kind === 'rename-option' ? [[name, propertyStatusGroup(definition, action.option)]] : []))
  if (config.defaultStatus === action.option) { if (action.kind === 'rename-option') config.defaultStatus = name; else if (options.length) config.defaultStatus = options[0]; else delete config.defaultStatus }
  return upsertTaskProperty({ ...list, items }, { ...definition, options, config })
}

/** Sorting changes presentation only; manual order and selected values remain stable. */
export function orderedPropertyOptions(definition: PropertyDefinition): string[] {
  const options = [...definition.options]
  return definition.config?.optionSort === 'ascending' ? options.sort((a, b) => a.localeCompare(b)) : definition.config?.optionSort === 'descending' ? options.sort((a, b) => b.localeCompare(a)) : options
}
export function reorderPropertyOption(definition: PropertyDefinition, from: string, to: string): PropertyDefinition {
  const options = orderedPropertyOptions(definition), source = options.indexOf(from), target = options.indexOf(to)
  if (source < 0 || target < 0 || source === target) return definition
  options.splice(source, 1); options.splice(target, 0, from)
  return { ...definition, options, config: { ...definition.config, optionSort: 'manual' } }
}

export function propertyStatusGroup(definition: PropertyDefinition, option: string): StatusGroup { return definition.config?.statusGroups && Object.hasOwn(definition.config.statusGroups, option) ? definition.config.statusGroups[option] : inferStatusGroup(option) }

export function taskPropertyDefaults(definitions?: PropertyDefinition[] | null): Record<string, PropertyValue> { return Object.fromEntries((definitions || []).filter(p => p.type === 'status').map(p => [p.id, p.config?.defaultStatus || p.options.find(option => propertyStatusGroup(p, option) === 'todo') || p.options[0] || null])) }
