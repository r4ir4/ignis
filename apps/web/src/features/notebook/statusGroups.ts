export const statusGroups = [
  { id: 'todo', label: 'To-do', color: 'gray' },
  { id: 'in-progress', label: 'In progress', color: 'blue' },
  { id: 'complete', label: 'Complete', color: 'green' },
] as const
export type StatusGroup = typeof statusGroups[number]['id']
export function validStatusGroup(value: unknown): value is StatusGroup { return statusGroups.some(group => group.id === value) }
/** Legacy statuses retain their meaning until the user explicitly assigns a group. */
export function inferStatusGroup(name: string): StatusGroup {
  const normalized = name.trim().toLowerCase()
  return ['done', 'complete', 'completed'].includes(normalized) ? 'complete' : ['in progress', 'in-progress', 'doing'].includes(normalized) ? 'in-progress' : 'todo'
}
