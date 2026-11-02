import { gridImages, validImageGrid } from './imageGrid.ts'
import { defaultViewConfig, validViewConfig, viewKinds } from './viewModel.ts'
import type { JSONContent } from '@tiptap/core'

// A shared contract for insertable blocks. Future view blocks register here instead
// of embedding persistence or data-source logic in the editor's slash menu.
export type BlockDefinition = {
  id: string; label: string; icon: string; hint: string; aliases: string; nodeType: string
  category: 'Layout' | 'Navigation' | 'Views'; create: () => JSONContent
}
export const blockContainerTypes = ['doc', 'callout', 'detailsContent', 'column', 'tabPanel']
export const structuralBlockTypes = ['detailsSummary', 'detailsContent', 'column', 'tabPanel']
const empty = (): JSONContent => ({ type: 'paragraph' })
export function newTab(title: string): JSONContent { return { type: 'tabPanel', attrs: { id: crypto.randomUUID(), title }, content: [empty()] } }
export const layoutBlockDefinitions: BlockDefinition[] = [
  ...[2, 3, 4, 5].map(count => ({ id: `columns-${count}`, label: `${count} columns`, icon: '▥', hint: `Arrange blocks in ${count} equal columns.`, aliases: `columns ${count} layout`, nodeType: 'columns', category: 'Layout' as const, create: (): JSONContent => ({ type: 'columns', content: Array.from({ length: count }, () => ({ type: 'column', content: [empty()] })) }) })),
  ...[2, 3, 4].map(count => ({ id: `image-grid-${count}`, label: `${count}-image grid`, icon: '▧', hint: count === 4 ? 'A two-by-two image grid. Upload images or add links.' : `${count} images side by side. Upload images or add links.`, aliases: `image photos upload grid ${count} collage`, nodeType: 'imageGrid', category: 'Layout' as const, create: (): JSONContent => ({ type: 'imageGrid', attrs: { count, images: gridImages(count) } }) })),
  { id: 'tabs', label: 'Tabs', icon: '▤', hint: 'Organize blocks into named tabs.', aliases: 'tab panels sections', nodeType: 'tabs', category: 'Layout', create: () => ({ type: 'tabs', content: [newTab('Tab 1'), newTab('Tab 2')] }) },
  ...viewKinds.filter(kind => ['line', 'horizontal-bar', 'vertical-bar', 'number'].includes(kind.id)).map(kind => ({ id: `view-${kind.id}`, label: kind.label, icon: kind.icon, hint: `Show records as a ${kind.label.toLowerCase()}.`, aliases: `${kind.id} view chart records`, nodeType: 'viewBlock', category: 'Views' as const, create: (): JSONContent => ({ type: 'viewBlock', attrs: defaultViewConfig(kind.id) }) })),
  { id: 'table-of-contents', label: 'Table of contents', icon: '☷', hint: 'Navigate the headings in this page.', aliases: 'toc outline headings navigation', nodeType: 'tableOfContents', category: 'Navigation', create: () => ({ type: 'tableOfContents' }) },
]

const layoutChildTypes = new Set(['imageGrid', 'viewBlock', 'paragraph', 'heading', 'bulletList', 'orderedList', 'taskList', 'blockquote', 'codeBlock', 'horizontalRule', 'image', 'callout', 'details', 'table', 'pageLink', 'columns', 'tabs', 'tableOfContents'])
export function validLayoutNode(node: JSONContent): boolean {
  const content = node.content || []
  if (node.type === 'imageGrid') return content.length === 0 && validImageGrid(node.attrs)
  if (node.type === 'viewBlock') return content.length === 0 && validViewConfig(node.attrs)
  if (node.type === 'columns') return content.length >= 2 && content.length <= 5 && content.every(child => child?.type === 'column') && validColumnWidths(node.attrs?.widths, content.length)
  if (node.type === 'tabs') return content.length >= 1 && content.length <= 12 && content.every(child => child?.type === 'tabPanel') && new Set(content.map(child => child.attrs?.id)).size === content.length
  if (node.type === 'tabPanel') return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(node.attrs?.id || '') && typeof node.attrs?.title === 'string' && node.attrs.title.length <= 80 && content.length > 0 && content.every(child => layoutChildTypes.has(child?.type || ''))
  if (node.type === 'column') return content.length > 0 && content.every(child => layoutChildTypes.has(child?.type || ''))
  if (node.type === 'tableOfContents') return content.length === 0
  return true
}

export function validColumnWidths(widths: unknown, count: number): boolean {
  return widths == null || (Array.isArray(widths) && widths.length === count && widths.every(value => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 100))
}
export function columnWidths(widths: unknown, count: number): number[] {
  const values: number[] = Array.isArray(widths) && validColumnWidths(widths, count) ? widths : Array(count).fill(1)
  const sum = values.reduce((total, value) => total + value, 0)
  return values.map(value => value / sum * 100)
}
// Only the two neighboring columns change; the rest of the row stays fixed.
export function dragColumnBoundary(widths: number[], index: number, delta: number, minimum: number): number[] {
  const next = [...widths], pair = widths[index] + widths[index + 1]
  const lower = Math.min(minimum, pair / 2)
  next[index] = Math.max(lower, Math.min(pair - lower, widths[index] + delta))
  next[index + 1] = pair - next[index]
  return next
}
