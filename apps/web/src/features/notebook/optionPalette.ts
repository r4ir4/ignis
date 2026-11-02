import type { BlockColor } from './blockPalette'

// Select tags use Notion's dark-mode tag palette, independently of writing-block colors.
export const optionPalette = [
  { id: 'default', label: 'Default', background: 'rgba(255,255,243,.082)', text: '#f0efed' },
  { id: 'gray', label: 'Gray', background: 'rgba(255,252,235,.306)', text: '#f0efed' },
  { id: 'brown', label: 'Brown', background: 'rgba(255,184,132,.365)', text: '#f5ede9' },
  { id: 'orange', label: 'Orange', background: 'rgba(255,143,71,.482)', text: '#fbebde' },
  { id: 'yellow', label: 'Yellow', background: 'rgba(255,188,53,.46)', text: '#f9f3dc' },
  { id: 'green', label: 'Green', background: 'rgba(113,255,175,.337)', text: '#e8f1ec' },
  { id: 'blue', label: 'Blue', background: 'rgba(81,166,255,.494)', text: '#e5f2fc' },
  { id: 'purple', label: 'Purple', background: 'rgba(208,147,255,.427)', text: '#f3ebf9' },
  { id: 'pink', label: 'Pink', background: 'rgba(255,133,192,.427)', text: '#fae9f1' },
  { id: 'red', label: 'Red', background: 'rgba(255,116,105,.525)', text: '#fce9e7' },
] as const
export type OptionColor = BlockColor | 'default'
