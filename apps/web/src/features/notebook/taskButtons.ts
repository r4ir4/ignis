import type { PersonalItem, PersonalList } from './personalLists.ts'
import { validPropertyValue, validPropertyDate, type PropertyConfig } from './taskProperties.ts'
import { boardStatusGroup } from './boardColumns.ts'

/** Validate the entire automation before changing any fields. */
export function buttonPatch(config: PropertyConfig, list: PersonalList, now = new Date()): Partial<PersonalItem> {
  const steps = config.steps || (config.action ? [{ action: config.action, targetId: config.targetId }] : [])
  if (!steps.length) throw new Error('Add an action in this button’s settings.')
  const patch: Partial<PersonalItem> = {}
  for (const step of steps) {
    if (step.action === 'edit') {
      const target = step.targetProperty || 'title', value = step.value ?? null
      if (['title', 'status', 'date', 'value'].includes(target)) {
        const valid = target === 'title' ? typeof value === 'string' && value.length <= 500 : target === 'status' ? typeof value === 'string' && (list.board?.order || ['To do', 'In progress', 'Done']).includes(value as PersonalItem['status']) : target === 'date' ? value === null || typeof value === 'string' && validPropertyDate(value) : value === null || typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1e12
        if (!valid) throw new Error('Choose a valid value for this action.')
        Object.assign(patch, { [target]: value })
      } else {
        const property = list.properties?.find(property => property.id === target)
        if (!property || !['text', 'number', 'select', 'status', 'date', 'checkbox', 'url', 'email'].includes(property.type) || !validPropertyValue(value, property)) throw new Error('Choose an existing editable property and a valid value.')
        patch.properties = { ...patch.properties, [target]: value }
      }
    } else if (step.action === 'check') {
      if (!list.properties?.some(property => property.id === step.targetId && property.type === 'checkbox')) throw new Error('Choose an existing checkbox in this button’s settings.')
      patch.properties = { ...patch.properties, [step.targetId!]: true }
    } else if (step.action === 'today') {
      patch.date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    } else {
      const group = step.action === 'complete' ? 'complete' : 'todo'
      const status = (list.board?.order || ['To do', 'In progress', 'Done']).find(status => boardStatusGroup(status, list.board?.columns) === group)
      if (!status) throw new Error(`Add a ${group === 'complete' ? 'Complete' : 'To-do'} status group first.`)
      patch.status = status
    }
  }
  return patch
}
