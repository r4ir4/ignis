import type { JSONContent } from '@tiptap/core'

// Existing notes stay literal text, including Markdown-like characters.
export function taskDescriptionDocument(item: { description: string; descriptionContent?: JSONContent | null }): JSONContent {
  return item.descriptionContent || { type: 'doc', content: item.description.split('\n').map(text => ({ type: 'paragraph', ...(text ? { content: [{ type: 'text', text }] } : {}) })) }
}
export function taskDescriptionText(content: JSONContent): string {
  function text(node: JSONContent): string {
    if (node.type === 'text') return node.text || ''
    if (node.type === 'hardBreak') return '\n'
    if (node.type === 'image') return node.attrs?.alt || ''
    if (node.type === 'pageLink') return node.attrs?.title || ''
    const block = ['doc', 'bulletList', 'orderedList', 'taskList', 'listItem', 'taskItem', 'blockquote', 'callout', 'details', 'detailsContent', 'columns', 'column', 'tabs', 'tabPanel', 'table', 'tableRow'].includes(node.type || '')
    return (node.content || []).map(text).join(block ? '\n' : '')
  }
  return text(content).slice(0, 5000)
}

const taskNodes = new Set(['doc', 'paragraph', 'heading', 'text', 'bulletList', 'orderedList', 'listItem', 'taskList', 'taskItem', 'blockquote', 'codeBlock', 'horizontalRule', 'hardBreak', 'image', 'callout', 'details', 'detailsSummary', 'detailsContent', 'table', 'tableRow', 'tableCell', 'tableHeader', 'pageLink', 'columns', 'column', 'tabs', 'tabPanel', 'tableOfContents', 'imageGrid'])
export function validTaskDescription(value: unknown): value is JSONContent {
  if (!value || typeof value !== 'object' || (value as JSONContent).type !== 'doc' || !Array.isArray((value as JSONContent).content)) return false
  const pending = [{ node: value as JSONContent, depth: 0, parent: '' }]
  let count = 0
  while (pending.length) {
    const { node, depth, parent } = pending.pop()!
    if (!node || typeof node !== 'object' || !taskNodes.has(node.type || '') || depth > 40 || ++count > 20000 || node.text != null && typeof node.text !== 'string' || node.content != null && !Array.isArray(node.content) || node.attrs != null && (typeof node.attrs !== 'object' || Array.isArray(node.attrs))) return false
    if (node.type === 'column' && parent !== 'columns' || node.type === 'tabPanel' && parent !== 'tabs') return false
    if (node.type === 'columns' && (!node.content || node.content.length < 2 || node.content.length > 5 || node.content.some(child => child?.type !== 'column'))) return false
    if (node.type === 'tabs' && (!node.content || node.content.length < 1 || node.content.length > 12 || node.content.some(child => child?.type !== 'tabPanel'))) return false
    pending.push(...(node.content || []).map(child => ({ node: child, depth: depth + 1, parent: node.type || '' })))
  }
  return JSON.stringify(value).length <= 1_000_000
}
