import { uuid, type PersonalList } from './personalLists.ts'
export const defaultCardProperties = ['cover', 'date']
export const validCardProperties = (value: unknown): value is string[] | null | undefined => value == null || Array.isArray(value) && value.length <= 36 && new Set(value).size === value.length && value.every(key => ['status', 'date', 'value', 'cover', 'description'].includes(key) || uuid(key))
export function cardPropertyChoices(list?: PersonalList) {
  return [{ id: 'status', name: 'Status', type: 'status' }, { id: 'date', name: 'Date', type: 'date' }, { id: 'value', name: list?.propertyDisplay?.value?.name || 'Value', type: 'number' }, { id: 'cover', name: 'Image', type: 'files' }, { id: 'description', name: 'Description', type: 'text' }, ...(list?.properties || []).map(property => ({ id: property.id, name: property.name, type: property.type }))]
}
