import { isBlockPosition } from './blockDrop.ts'
import { Fragment, type Node as ProseMirrorNode } from '@tiptap/pm/model'
import { NodeSelection, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state'
import { closeHistory } from '@tiptap/pm/history'
export const blockStyles = [
  { id: 'text', label: 'Text', icon: 'Aa' },
  { id: 'heading1', label: 'Heading 1', icon: 'H1' },
  { id: 'heading2', label: 'Heading 2', icon: 'H2' },
  { id: 'heading3', label: 'Heading 3', icon: 'H3' },
  { id: 'bullet', label: 'Bulleted list', icon: '•' },
  { id: 'numbered', label: 'Numbered list', icon: '1.' },
  { id: 'checklist', label: 'To-do list', icon: '☑' },
  { id: 'toggle', label: 'Toggle list', icon: '▸' },
  { id: 'toggleHeading1', label: 'Toggle heading 1', icon: '▸ H1' },
  { id: 'toggleHeading2', label: 'Toggle heading 2', icon: '▸ H2' },
  { id: 'toggleHeading3', label: 'Toggle heading 3', icon: '▸ H3' },
  { id: 'callout', label: 'Callout', icon: '☼' },
  { id: 'quote', label: 'Quote', icon: '❝' },
  { id: 'code', label: 'Code', icon: '<>' },
] as const
export type BlockStyle = typeof blockStyles[number]['id']
const lists = new Set(['bulletList', 'orderedList', 'taskList'])
const convertible = new Set(['paragraph', 'heading', 'blockquote', 'codeBlock', 'bulletList', 'orderedList', 'taskList', 'listItem', 'taskItem', 'text', 'hardBreak', 'callout', 'details', 'detailsSummary', 'detailsContent'])
export function canTurnInto(node: ProseMirrorNode | null | undefined, action?: BlockStyle): boolean {
  if (!node || !convertible.has(node.type.name)) return false
  if (node.type.name === 'details' && (!action || action === 'toggle' || action.startsWith('toggleHeading') || action === 'callout')) return true
  let allowed = true
  node.descendants(child => { if (!convertible.has(child.type.name)) allowed = false })
  return allowed
}
export function blockStyle(node: ProseMirrorNode | null | undefined): BlockStyle | null {
  if (!node) return null
  if (node.type.name === 'details') return node.firstChild?.attrs.headingLevel ? `toggleHeading${node.firstChild.attrs.headingLevel}` as BlockStyle : 'toggle'
  if (node.type.name === 'heading') return `heading${node.attrs.level}` as BlockStyle
  return ({ paragraph: 'text', bulletList: 'bullet', orderedList: 'numbered', taskList: 'checklist', blockquote: 'quote', codeBlock: 'code', callout: 'callout', details: 'toggle' } as Record<string, BlockStyle>)[node.type.name] ?? null
}
export function changeBlock(state: EditorState, pos: number, action: 'duplicate' | 'delete' | BlockStyle): Transaction | null {
  if (!isBlockPosition(state.doc, pos)) return null
  const node = state.doc.nodeAt(pos)
  if (!node) return null
  const end = pos + node.nodeSize
  if (action === 'duplicate') {
    const tr = state.tr.insert(end, node)
    tr.setSelection(NodeSelection.create(tr.doc, end))
    return closeHistory(tr).scrollIntoView()
  }
  if (action === 'delete') {
    const tr = state.doc.childCount === 1 ? state.tr.replaceWith(pos, end, state.schema.nodes.paragraph.create()) : state.tr.delete(pos, end)
    tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(pos, tr.doc.content.size))))
    return closeHistory(tr).scrollIntoView()
  }
  if (!canTurnInto(node, action) || blockStyle(node) === action) return null
  const { schema } = state
  const paragraphs: ProseMirrorNode[] = []
  function collect(current: ProseMirrorNode) {
    if (current.isTextblock) paragraphs.push(schema.nodes.paragraph.create(current.attrs, current.content))
    else current.forEach(collect)
  }
  collect(node)
  const listName = ({ bullet: 'bulletList', numbered: 'orderedList', checklist: 'taskList' } as Record<string, string>)[action]
  let replacement: ProseMirrorNode[]
  if (listName) {
    const itemName = action === 'checklist' ? 'taskItem' : 'listItem'
    function convertList(current: ProseMirrorNode): ProseMirrorNode {
      const items: ProseMirrorNode[] = []
      current.forEach(item => {
        const children: ProseMirrorNode[] = []
        item.forEach(child => children.push(lists.has(child.type.name) ? convertList(child) : child))
        items.push(schema.nodes[itemName].create(action === 'checklist' ? { checked: !!item.attrs.checked } : null, children))
      })
      return schema.nodes[listName].create(current.attrs, items)
    }
    replacement = [lists.has(node.type.name) ? convertList(node) : schema.nodes[listName].create(null, paragraphs.map(p => schema.nodes[itemName].create(action === 'checklist' ? { checked: false } : null, p)))]
  } else if (action === 'callout') {
    const content = node.type.name === 'details'
      ? [schema.nodes.paragraph.create(null, node.firstChild!.content), ...Array.from({ length: node.child(1).childCount }, (_, i) => node.child(1).child(i))]
      : [node]
    replacement = [schema.nodes.callout.create(null, content)]
  } else if (action === 'toggle' || action.startsWith('toggleHeading')) {
    const headingLevel = action === 'toggle' ? null : Number(action.slice(-1))
    if (node.type.name === 'details') {
      replacement = [node.type.create(node.attrs, [schema.nodes.detailsSummary.create({ ...node.firstChild!.attrs, headingLevel }, node.firstChild!.content), node.child(1)])]
    } else {
    let title = Fragment.empty
    let body: ProseMirrorNode[] = []
    if (node.isTextblock) title = node.content
    else if (lists.has(node.type.name)) {
      const first = node.firstChild!
      title = first.firstChild!.content
      first.forEach((child, _offset, index) => { if (index > 0) body.push(child) })
      if (node.childCount > 1) body.push(node.type.create(node.attrs, node.content.cut(first.nodeSize)))
    } else {
      node.forEach((child, _offset, index) => {
        if (index === 0 && child.isTextblock) title = child.content
        else body.push(child)
      })
    }
    replacement = [schema.nodes.details.create({ open: true }, [
      schema.nodes.detailsSummary.create({ headingLevel }, title),
      schema.nodes.detailsContent.create(null, body.length ? body : schema.nodes.paragraph.create()),
    ])]
    }
  } else if (action.startsWith('heading') && node.type.name === 'details') {
    replacement = [schema.nodes.heading.create({ level: Number(action.slice(-1)) }, node.firstChild!.content)]
    node.child(1).forEach(child => replacement.push(child))
  } else if (action === 'quote') replacement = [schema.nodes.blockquote.create(null, node)]
  else if (action === 'code') {
    const text = paragraphs.map(p => p.textBetween(0, p.content.size, '\n', '\n')).join('\n')
    replacement = [schema.nodes.codeBlock.create(null, text ? schema.text(text) : null)]
  } else replacement = action === 'text' ? paragraphs : paragraphs.map(p => schema.nodes.heading.create({ level: Number(action.slice(-1)) }, p.content))
  replacement = replacement.map(block => block.type.create({ ...block.attrs, textColor: block.attrs.textColor ?? node.attrs.textColor ?? null, backgroundColor: block.attrs.backgroundColor ?? node.attrs.backgroundColor ?? null }, block.content, block.marks))
  const tr = state.tr.replaceWith(pos, end, Fragment.fromArray(replacement))
  tr.setSelection(NodeSelection.create(tr.doc, pos))
  return closeHistory(tr).scrollIntoView()
}
