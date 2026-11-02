import type { JSONContent } from '@tiptap/core'
import type { PersonalItem } from './personalLists.ts'
import { uuid } from './personalLists.ts'
import { attachmentPreview } from './taskFiles.ts'
export type CardSize = 'small' | 'medium' | 'large'
export function validCardLayout(value: { cardSize?: unknown; cardPreview?: unknown; cardImageFit?: unknown }) {
  return (value.cardSize == null || typeof value.cardSize === 'string' && ['small', 'medium', 'large'].includes(value.cardSize)) && (value.cardPreview == null || typeof value.cardPreview === 'string' && (['none', 'cover', 'content'].includes(value.cardPreview) || uuid(value.cardPreview))) && (value.cardImageFit == null || typeof value.cardImageFit === 'boolean')
}
export function cardPreview(item: PersonalItem | undefined, source: string, cover?: string): { kind: 'image'; src: string } | { kind: 'text'; text: string } | null {
  if (source === 'none') return null
  if (source === 'cover') return cover ? { kind: 'image', src: cover } : null
  if (!item) return null
  if (source === 'content') {
    const first = item.descriptionContent?.content?.[0]
    if (first?.type === 'image' && typeof first.attrs?.src === 'string') return { kind: 'image', src: first.attrs.src }
    const text = (node: JSONContent): string => node.text || (node.content || []).map(text).join(' ')
    const summary = first ? text(first) : item.description
    return summary.trim() ? { kind: 'text', text: summary.slice(0, 500) } : null
  }
  const files = item.properties?.[source]
  if (!Array.isArray(files)) return null
  for (const file of files) { const src = attachmentPreview(file); if (src) return { kind: 'image', src } }
  return null
}
