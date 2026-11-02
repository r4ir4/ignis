import type { EditorState } from '@tiptap/pm/state'
import { closeHistory } from '@tiptap/pm/history'
import { NodeSelection } from '@tiptap/pm/state'
import { moveBlockBeside } from './blockDrop.ts'

export function imageWidth(width: number, available: number) {
  return Math.round(Math.max(Math.min(64, available), Math.min(width, available)))
}

/** Commit once per gesture, separately from surrounding typing and resizes. */
export function resizeImage(state: EditorState, pos: number, width: number, ratio: number) {
  const node = state.doc.nodeAt(pos)
  if (node?.type.name !== 'image' || !Number.isFinite(width) || width <= 0 || !Number.isFinite(ratio) || ratio <= 0) return null
  return closeHistory(state.tr).setNodeMarkup(pos, undefined, { ...node.attrs, width: Math.round(width), height: Math.max(1, Math.round(width / ratio)) })
}

export function canAddImageBeside(state: EditorState, pos: number) {
  if (pos < 0 || pos >= state.doc.content.size || state.doc.nodeAt(pos)?.type.name !== 'image') return false
  const point = state.doc.resolve(pos)
  return point.parent.type.name !== 'column' || point.node(point.depth - 1).childCount < 5
}

/** Reuse the side-drop transaction so adding and dragging share column behavior. */
export function addImageBeside(state: EditorState, pos: number, src: string, alt: string) {
  if (!canAddImageBeside(state, pos)) return null
  const next = pos + state.doc.nodeAt(pos)!.nodeSize
  const tr = state.tr.insert(next, state.schema.nodes.image.create({ src, alt }))
  const placed = moveBlockBeside(state.apply(tr), next, { pos, side: 'right' })
  if (!placed) return null
  for (const step of placed.steps) tr.step(step)
  tr.setSelection(NodeSelection.create(tr.doc, placed.selection.from))
  return closeHistory(tr).scrollIntoView()
}
