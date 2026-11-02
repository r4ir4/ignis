import { blockContainerTypes } from './blockCatalog.ts'
import { NodeSelection, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state'
import { closeHistory } from '@tiptap/pm/history'

// Move a whole block among siblings, keeping lists and quotes intact in one undo step.
export function moveBlock(state: EditorState, direction: -1 | 1): Transaction | null {
  const { doc, selection } = state
  let start = selection.from
  if (!(selection instanceof NodeSelection)) {
    let depth = 1
    for (let d = 1; d <= selection.$from.depth; d++) if (blockContainerTypes.includes(selection.$from.node(d - 1).type.name)) depth = d
    if (!selection.$from.depth) return null
    start = selection.$from.before(depth)
  }
  const point = doc.resolve(start), parent = point.parent
  if (!blockContainerTypes.includes(parent.type.name)) return null
  const index = point.index(), target = index + direction
  if (target < 0 || target >= parent.childCount) return null
  const current = parent.child(index), neighbor = parent.child(target)
  if (!(selection instanceof NodeSelection) && selection.to > start + current.nodeSize - 1) return null
  const rangeStart = direction === -1 ? start - neighbor.nodeSize : start
  const rangeEnd = direction === -1 ? start + current.nodeSize : start + current.nodeSize + neighbor.nodeSize
  const nextStart = direction === -1 ? rangeStart : start + neighbor.nodeSize
  const tr = state.tr.replaceWith(rangeStart, rangeEnd, direction === -1 ? [current, neighbor] : [neighbor, current])
  if (selection instanceof NodeSelection) tr.setSelection(NodeSelection.create(tr.doc, nextStart))
  else tr.setSelection(TextSelection.create(tr.doc, nextStart + selection.anchor - start, nextStart + selection.head - start))
  return closeHistory(tr).scrollIntoView()
}
