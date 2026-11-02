export const itemStatuses = ['To do', 'In progress', 'Done'] as const
export type ItemStatus = typeof itemStatuses[number] | `column:${string}`
export function validItemStatus(value: unknown): value is ItemStatus { return typeof value === 'string' && ((itemStatuses as readonly string[]).includes(value) || /^column:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) }
