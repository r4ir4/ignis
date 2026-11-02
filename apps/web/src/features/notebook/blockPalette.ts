export const blockPalette = [
  { id: 'default', label: 'Default', text: '#f0efed', background: 'transparent' },
  { id: 'gray', label: 'Gray', text: '#7d7a75', background: '#383836' },
  { id: 'brown', label: 'Brown', text: '#9f765a', background: '#45362d' },
  { id: 'orange', label: 'Orange', text: '#d27b2d', background: '#53361f' },
  { id: 'yellow', label: 'Yellow', text: '#cb9434', background: '#504425' },
  { id: 'green', label: 'Green', text: '#50946e', background: '#263d30' },
  { id: 'blue', label: 'Blue', text: '#387dc9', background: '#233850' },
  { id: 'purple', label: 'Purple', text: '#9a6bb4', background: '#3c2d47' },
  { id: 'pink', label: 'Pink', text: '#c14c8a', background: '#4e2b3c' },
  { id: 'red', label: 'Red', text: '#cf5148', background: '#502c29' },
] as const
export type BlockColor = Exclude<typeof blockPalette[number]['id'], 'default'>
export const colorBlockTypes = ['paragraph', 'heading', 'bulletList', 'orderedList', 'taskList', 'blockquote', 'codeBlock', 'callout', 'details', 'table']
export function validBlockColor(value: unknown): value is BlockColor | null { return value == null || blockPalette.some(color => color.id !== 'default' && color.id === value) }
