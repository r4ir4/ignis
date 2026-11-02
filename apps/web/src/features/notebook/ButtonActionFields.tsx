import { Dropdown } from '../../components/Dropdown'
import type { PersonalItem, PersonalList } from './personalLists'
import type { ButtonStep, PropertyDefinition } from './taskProperties'

export function ButtonActionFields({ step, definitions, list, change }: { step: ButtonStep; definitions: PropertyDefinition[]; list?: PersonalList; change: (step: ButtonStep) => void }) {
  const editable = definitions.filter(property => ['text', 'number', 'select', 'status', 'date', 'checkbox', 'url', 'email'].includes(property.type))
  const target = step.targetProperty || 'title'
  const property = editable.find(property => property.id === target)
  const type = property?.type || ({ title: 'text', status: 'status', date: 'date', value: 'number' } as Record<string, string>)[target]
  const options = property?.options || (target === 'status' ? list?.board?.order || ['To do', 'In progress', 'Done'] : [])
  return <><label>Property<Dropdown aria-label="Action property" value={target} onValueChange={selectedValue => change({ action: 'edit', targetProperty: selectedValue, value: null })}><option value="title">Name</option><option value="status">Status</option><option value="date">Date</option><option value="value">Value</option>{editable.map(property => <option key={property.id} value={property.id}>{property.name}</option>)}</Dropdown></label><label>Set to{['select', 'status'].includes(type) ? <Dropdown aria-label="Action value" value={String(step.value ?? '')} onValueChange={selectedValue => change({ ...step, value: selectedValue || null })}><option value="">Empty</option>{options.map(option => <option key={option} value={option}>{target === 'status' ? list?.board?.columns?.[option as PersonalItem['status']]?.name || option : option}</option>)}</Dropdown> : type === 'checkbox' ? <input aria-label="Action value" type="checkbox" checked={step.value === true} onChange={event => change({ ...step, value: event.target.checked })} /> : <input aria-label="Action value" type={type === 'number' ? 'number' : type === 'date' ? 'date' : 'text'} min={type === 'number' ? 0 : undefined} maxLength={type === 'text' ? 500 : 2000} value={typeof step.value === 'string' || typeof step.value === 'number' ? step.value : ''} onChange={event => change({ ...step, value: event.target.value === '' ? null : type === 'number' ? Number(event.target.value) : event.target.value })} />}</label></>
}
