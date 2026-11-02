import { blockContainerTypes, structuralBlockTypes, columnWidths } from './blockCatalog.ts'
import { Extension } from '@tiptap/core'
import { Fragment, type Node as ProseMirrorNode } from '@tiptap/pm/model'
import { NodeSelection, TextSelection, Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state'
import { closeHistory } from '@tiptap/pm/history'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'

const parents = new Set(blockContainerTypes)
export function isBlockPosition(doc: ProseMirrorNode, pos: number): boolean {
  if (pos < 0 || pos >= doc.content.size) return false
  const point = doc.resolve(pos), node = doc.nodeAt(pos)
  return parents.has(point.parent.type.name) && !!node?.isBlock && !structuralBlockTypes.includes(node.type.name)
}
// Clean only columns that contained the dragged block, leaving intentionally blank
// layouts elsewhere untouched. Mapping keeps nested moves in the same transaction.
function cleanSourceColumns(tr: Transaction, sourceColumns: number[]): Transaction {
  for (const original of sourceColumns) {
    const mapped = tr.mapping.mapResult(original)
    if (mapped.deleted) continue
    const column = tr.doc.nodeAt(mapped.pos)
    if (column?.type.name !== 'column' || !Array.from({ length: column.childCount }, (_, i) => column.child(i)).every(child => child.type.name === 'paragraph' && child.content.size === 0)) continue
    const point = tr.doc.resolve(mapped.pos), rowPos = point.before(), row = point.parent
    if (row.type.name !== 'columns') continue
    const index = point.index(), before = tr.steps.length, selected = tr.selection.from
    if (row.childCount > 2) {
      const widths = columnWidths(row.attrs.widths, row.childCount).filter((_width, i) => i !== index)
      tr.delete(mapped.pos, mapped.pos + column.nodeSize)
      tr.setNodeMarkup(rowPos, undefined, { ...row.attrs, widths: columnWidths(widths, widths.length) })
    } else {
      const remaining = row.child(index === 0 ? 1 : 0)
      const remainingPos = rowPos + 1 + (index === 0 ? column.nodeSize : 0)
      const inside = selected >= remainingPos + 1 && selected < remainingPos + remaining.nodeSize - 1
      tr.replaceWith(rowPos, rowPos + row.nodeSize, remaining.content)
      // A replacement maps all positions inside a row to its edge. Preserve the
      // moved block's exact selection when it now lives in the surviving column.
      const next = inside ? rowPos + selected - remainingPos - 1 : tr.mapping.slice(before).map(selected)
      if (isBlockPosition(tr.doc, next)) tr.setSelection(NodeSelection.create(tr.doc, next))
    }
  }
  return tr
}
function sourceColumns(doc: ProseMirrorNode, source: number): number[] {
  const point = doc.resolve(source), positions: number[] = []
  for (let depth = point.depth; depth > 0; depth--) if (point.node(depth).type.name === 'column') positions.push(point.before(depth))
  return positions
}
export type BlockDestination = { pos: number; container?: number; side?: 'left' | 'right' }
// Move exact nodes at block boundaries. Never split, flatten or reconstruct their contents.
export function moveBlockTo(state: EditorState, source: number, target: BlockDestination): Transaction | null {
  if (target.side) return moveBlockBeside(state, source, target)
  const { doc, schema } = state
  if (!isBlockPosition(doc, source) || target.pos < 0 || target.pos > doc.content.size) return null
  const node = doc.nodeAt(source)!, end = source + node.nodeSize
  if (target.pos >= source && target.pos <= end) return null
  const from = doc.resolve(source), destination = doc.resolve(target.pos)
  if (!parents.has(destination.parent.type.name) || !destination.parent.canReplaceWith(destination.index(), destination.index(), node.type)) return null
  const emptyTarget = destination.parent.childCount === 1 && destination.parent.firstChild?.type.name === 'paragraph' && !destination.parent.firstChild.content.size
  const replaceFrom = emptyTarget ? destination.start() : target.pos
  const replaceTo = emptyTarget ? destination.end() : target.pos
  // Containers require a block even when their last real child is dragged away.
  const tr = from.parent.childCount === 1 && from.parent.type.name !== 'doc'
    ? state.tr.replaceWith(source, end, schema.nodes.paragraph.create())
    : state.tr.delete(source, end)
  const at = tr.mapping.map(replaceFrom), until = tr.mapping.map(replaceTo)
  tr.replaceWith(at, until, node)
  if (target.container != null) {
    const container = tr.mapping.map(target.container)
    const wrapper = tr.doc.nodeAt(container)
    if (wrapper?.type.name === 'details' && !wrapper.attrs.open) tr.setNodeMarkup(container, undefined, { ...wrapper.attrs, open: true })
  }
  const depth = (block: ProseMirrorNode): number => { let childDepth = 0; block.forEach(child => { childDepth = Math.max(childDepth, depth(child)) }); return 1 + childDepth }
  if (destination.depth + depth(node) > 40) return null
  tr.setSelection(NodeSelection.create(tr.doc, at))
  return closeHistory(cleanSourceColumns(tr, sourceColumns(doc, source))).scrollIntoView()
}

// Side drops move the original node, preserving marks, descendants and attributes.
export function moveBlockBeside(state: EditorState, source: number, target: BlockDestination): Transaction | null {
  const { doc, schema } = state
  if (!target.side || !isBlockPosition(doc, source) || !isBlockPosition(doc, target.pos)) return null
  const node = doc.nodeAt(source)!, other = doc.nodeAt(target.pos)!
  if (target.pos >= source && target.pos < source + node.nodeSize || source >= target.pos && source < target.pos + other.nodeSize) return null
  // A whole column row is already a layout; never wrap it into another row by accident.
  if (other.type.name === 'columns') return null
  const from = doc.resolve(source), point = doc.resolve(target.pos)
  if (point.parent.type.name === 'column' && point.node(point.depth - 1).childCount >= 5) return null
  const tr = from.parent.childCount === 1 && from.parent.type.name !== 'doc'
    ? state.tr.replaceWith(source, source + node.nodeSize, schema.nodes.paragraph.create())
    : state.tr.delete(source, source + node.nodeSize)
  const at = tr.mapping.map(target.pos), destination = tr.doc.resolve(at)
  let selected: number
  if (destination.parent.type.name === 'column') {
    const rowPos = destination.before(destination.depth - 1), row = tr.doc.nodeAt(rowPos)!
    const columnPos = destination.before(), insertAt = columnPos + (target.side === 'right' ? destination.parent.nodeSize : 0)
    // Make room for one average-sized column while preserving existing proportions.
    const widths = columnWidths(row.attrs.widths, row.childCount).map(width => width * row.childCount / (row.childCount + 1))
    widths.splice(destination.index(destination.depth - 1) + (target.side === 'right' ? 1 : 0), 0, 100 / (row.childCount + 1))
    tr.setNodeMarkup(rowPos, undefined, { ...row.attrs, widths })
    tr.insert(insertAt, schema.nodes.column.create(null, node))
    selected = insertAt + 1
  } else {
    const current = tr.doc.nodeAt(at)!
    const ordered = target.side === 'left' ? [node, current] : [current, node]
    const columns = ordered.map(block => schema.nodes.column.create(null, block))
    const row = schema.nodes.columns.create(null, columns)
    if (!destination.parent.canReplaceWith(destination.index(), destination.index() + 1, row.type)) return null
    tr.replaceWith(at, at + current.nodeSize, row)
    selected = at + 2 + (target.side === 'right' ? columns[0].nodeSize : 0)
  }
  let tooDeep = false
  tr.doc.descendants((_node, pos) => { if (tr.doc.resolve(pos).depth > 40) tooDeep = true })
  if (tooDeep) return null
  tr.setSelection(NodeSelection.create(tr.doc, selected))
  return closeHistory(cleanSourceColumns(tr, sourceColumns(doc, source))).scrollIntoView()
}

export function normalizeBlockGroup(doc: ProseMirrorNode, positions: number[]): number[] {
  const result: number[] = []
  for (const pos of [...new Set(positions)].sort((a, b) => a - b)) {
    if (!isBlockPosition(doc, pos)) continue
    const previous = result.at(-1)
    if (previous != null && pos < previous + doc.nodeAt(previous)!.nodeSize) continue
    result.push(pos)
  }
  return result
}
export function moveBlocksTo(state: EditorState, sources: number[], target: BlockDestination): Transaction | null {
  const positions = normalizeBlockGroup(state.doc, sources)
  if (positions.length < 2) return positions.length ? moveBlockTo(state, positions[0], target) : null
  const { doc, schema } = state
  if (target.pos < 0 || target.pos > doc.content.size) return null
  const nodes = positions.map(pos => doc.nodeAt(pos)!), fragment = Fragment.fromArray(nodes)
  if (positions.some((pos, index) => target.pos >= pos && target.pos < pos + nodes[index].nodeSize)) return null
  const contiguous = positions.every((pos, index) => !index || pos === positions[index - 1] + nodes[index - 1].nodeSize)
  if (!target.side && contiguous && target.pos === positions.at(-1)! + nodes.at(-1)!.nodeSize) return null
  if (target.side && (!isBlockPosition(doc, target.pos) || positions.some(pos => pos > target.pos && pos < target.pos + doc.nodeAt(target.pos)!.nodeSize))) return null
  const tr = state.tr
  for (const pos of [...positions].reverse()) {
    const point = tr.doc.resolve(pos), block = tr.doc.nodeAt(pos)!
    if (point.parent.childCount === 1 && point.parent.type.name !== 'doc') tr.replaceWith(pos, pos + block.nodeSize, schema.nodes.paragraph.create())
    else tr.delete(pos, pos + block.nodeSize)
  }
  const at = tr.mapping.map(target.pos), point = tr.doc.resolve(at)
  let selected = at
  if (target.side) {
    const other = tr.doc.nodeAt(at)
    if (!other || other.type.name === 'columns') return null
    const groupColumn = schema.nodes.column.create(null, fragment)
    if (point.parent.type.name === 'column') {
      const rowPos = point.before(point.depth - 1), row = tr.doc.nodeAt(rowPos)!
      if (row.childCount >= 5) return null
      const insertAt = point.before() + (target.side === 'right' ? point.parent.nodeSize : 0)
      const widths = columnWidths(row.attrs.widths, row.childCount).map(width => width * row.childCount / (row.childCount + 1))
      widths.splice(point.index(point.depth - 1) + (target.side === 'right' ? 1 : 0), 0, 100 / (row.childCount + 1))
      tr.setNodeMarkup(rowPos, undefined, { ...row.attrs, widths }).insert(insertAt, groupColumn)
      selected = insertAt + 1
    } else {
      const otherColumn = schema.nodes.column.create(null, other)
      const columns = target.side === 'left' ? [groupColumn, otherColumn] : [otherColumn, groupColumn]
      if (!point.parent.canReplaceWith(point.index(), point.index() + 1, schema.nodes.columns)) return null
      tr.replaceWith(at, at + other.nodeSize, schema.nodes.columns.create(null, columns))
      selected = at + 2 + (target.side === 'right' ? otherColumn.nodeSize : 0)
    }
  } else {
    if (!parents.has(point.parent.type.name) || !point.parent.canReplace(point.index(), point.index(), fragment)) return null
    const empty = point.parent.childCount === 1 && point.parent.firstChild?.type.name === 'paragraph' && !point.parent.firstChild.content.size
    selected = empty ? point.start() : at
    tr.replaceWith(selected, empty ? point.end() : at, fragment)
    if (target.container != null) {
      const wrapperPos = tr.mapping.map(target.container), wrapper = tr.doc.nodeAt(wrapperPos)
      if (wrapper?.type.name === 'details' && !wrapper.attrs.open) tr.setNodeMarkup(wrapperPos, undefined, { ...wrapper.attrs, open: true })
    }
  }
  tr.setSelection(NodeSelection.create(tr.doc, selected))
  cleanSourceColumns(tr, [...new Set(positions.flatMap(pos => sourceColumns(doc, pos)))].sort((a, b) => b - a))
  let tooDeep = false
  tr.doc.descendants((_node, pos) => { if (tr.doc.resolve(pos).depth > 40) tooDeep = true })
  if (tooDeep) return null
  let offset = tr.selection.from
  const moved = nodes.map(node => { const pos = offset; offset += node.nodeSize; return pos })
  tr.setMeta(blockSelectionKey, { positions: moved, anchor: moved[0], explicit: true })
  return closeHistory(tr).scrollIntoView()
}

type BlockGroup = { positions: number[]; anchor: number | null; explicit: boolean }
export const blockSelectionKey = new PluginKey<BlockGroup>('notebook-block-selection')
export function selectBlockGroup(state: EditorState, pos: number, range: boolean): Transaction {
  const previous = blockSelectionKey.getState(state), anchor = previous?.anchor ?? (isBlockPosition(state.doc, state.selection.from) ? state.selection.from : pos)
  let positions: number[]
  if (range) {
    const start = state.doc.resolve(anchor), end = state.doc.resolve(pos)
    const depth = start.sharedDepth(pos), parent = start.node(depth), base = start.start(depth)
    positions = []
    if (parents.has(parent.type.name)) parent.forEach((node, offset) => { const at = base + offset; if (at + node.nodeSize > Math.min(anchor, pos) && at <= Math.max(anchor, pos)) positions.push(at) })
  } else {
    positions = previous?.positions.includes(pos) ? previous.positions.filter(value => value !== pos) : [...(previous?.positions || []), pos]
  }
  return state.tr.setMeta(blockSelectionKey, { positions: normalizeBlockGroup(state.doc, positions), anchor, explicit: true })
}
function textBlockGroup(state: EditorState): number[] {
  const selection = state.selection
  if (!(selection instanceof TextSelection) || selection.empty) return []
  const depth = selection.$from.sharedDepth(selection.to), parent = selection.$from.node(depth), base = selection.$from.start(depth)
  if (!parents.has(parent.type.name)) return []
  const positions: number[] = []
  parent.forEach((node, offset) => { const at = base + offset; if (at < selection.to && at + node.nodeSize > selection.from) positions.push(at) })
  return positions.length > 1 ? normalizeBlockGroup(state.doc, positions) : []
}
export function createBlockSelectionPlugin(isEditable: () => boolean = () => true): Plugin<BlockGroup> {
  const empty = (): BlockGroup => ({ positions: [], anchor: null, explicit: false })
  return new Plugin({
    key: blockSelectionKey,
    state: { init: empty, apply(tr, previous, _old, state) {
      const meta = tr.getMeta(blockSelectionKey)
      if (meta) return { ...meta, positions: normalizeBlockGroup(tr.doc, meta.positions) }
      const positions = normalizeBlockGroup(tr.doc, previous.positions.flatMap(pos => { const mapped = tr.mapping.mapResult(pos); return mapped.deleted ? [] : [mapped.pos] }))
      if (tr.selectionSet && !previous.explicit) { const range = textBlockGroup(state); return { positions: range, anchor: range[0] ?? null, explicit: false } }
      return { ...previous, positions, anchor: previous.anchor == null ? null : tr.mapping.map(previous.anchor) }
    } },
    view(view) {
      const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && blockSelectionKey.getState(view.state)?.positions.length) view.dispatch(view.state.tr.setMeta(blockSelectionKey, empty())) }
      document.addEventListener('keydown', escape)
      return { destroy() { document.removeEventListener('keydown', escape) } }
    },
    props: {
      decorations(state) { return isEditable() ? DecorationSet.create(state.doc, (blockSelectionKey.getState(state)?.positions || []).map(pos => Decoration.node(pos, pos + state.doc.nodeAt(pos)!.nodeSize, { class: 'notebook-multi-selected' }))) : null },
      handleDOMEvents: { mousedown(view, event) { if (!event.shiftKey && !event.metaKey && !event.ctrlKey) view.dispatch(view.state.tr.setMeta(blockSelectionKey, empty())); return false } },
      handleKeyDown(view, event) {
        if (event.key === 'Escape' && blockSelectionKey.getState(view.state)?.positions.length) { view.dispatch(view.state.tr.setMeta(blockSelectionKey, empty())); return true }
        if (!event.metaKey && !event.ctrlKey && (event.key.length === 1 || ['Backspace', 'Delete', 'Enter'].includes(event.key))) view.dispatch(view.state.tr.setMeta(blockSelectionKey, empty()))
        return false
      },
    },
  })
}

export const blockDropKey = new PluginKey<number[] | null>('notebook-block-drop')
type VisualTarget = BlockDestination & { left: number; right: number; y: number; element: HTMLElement | null; height?: number }
function elementAt(view: EditorView, pos: number): HTMLElement | null {
  const dom = view.nodeDOM(pos)
  if (!(dom instanceof HTMLElement)) return null
  // Resized images occupy only part of their block row; target their visible edges.
  if (view.state.doc.nodeAt(pos)?.type.name === 'image') return dom.querySelector<HTMLElement>('.notebook-image-frame') || dom
  return dom.matches('[data-type="callout"], [data-type="details"], [data-type="column"], [data-type="tabPanel"]') ? dom : dom.querySelector<HTMLElement>(':scope > [data-type="callout"], :scope > [data-type="details"], :scope > [data-type="column"], :scope > [data-type="tabPanel"]') || dom
}
function dropTarget(view: EditorView, x: number, y: number): VisualTarget | null {
  const doc = view.state.doc, editor = view.dom.getBoundingClientRect()
  if (x < editor.left - 80 || x > editor.right + 40 || y < editor.top - 40 || y > editor.bottom + 60) return null
  // Near a block's left/right edge, preview a vertical column insertion instead
  // of the normal horizontal reorder line. Ignore hidden tab contents.
  let sideTarget: VisualTarget | null = null, nearestEdge = Infinity
  doc.descendants((node, pos) => {
    if (node.type.name === 'columns' || !isBlockPosition(doc, pos)) return
    const dom = elementAt(view, pos), rect = dom?.getBoundingClientRect()
    if (!rect || rect.height < 8 || y < rect.top + 4 || y > rect.bottom - 4) return
    const edge = Math.min(36, rect.width * .18), leftDistance = Math.abs(x - rect.left), rightDistance = Math.abs(x - rect.right)
    if (Math.min(leftDistance, rightDistance) > edge || Math.min(leftDistance, rightDistance) > nearestEdge) return
    nearestEdge = Math.min(leftDistance, rightDistance)
    const side = leftDistance < rightDistance ? 'left' : 'right'
    sideTarget = { pos, side, left: side === 'left' ? rect.left - 14 : rect.right + 14, right: rect.right, y: rect.top, height: rect.height, element: null }
  })
  if (sideTarget) return sideTarget
  let parent = doc, start = 0, container: number | undefined, element: HTMLElement | null = null
  // The horizontal indent decides nesting. Moving left of a container returns to its parent.
  doc.descendants((node, pos) => {
    if (!['details', 'callout', 'column', 'tabPanel'].includes(node.type.name)) return
    const dom = elementAt(view, pos)
    if (!dom) return
    const rect = dom.getBoundingClientRect()
    if (y < rect.top + 5 || y > rect.bottom - 5 || x < rect.left + (['column', 'tabPanel'].includes(node.type.name) ? 8 : 28) || x > rect.right) return
    if (node.type.name === 'details') { parent = node.child(1); start = pos + 2 + node.firstChild!.nodeSize }
    else { parent = node; start = pos + 1 }
    container = pos; element = dom
  })
  const targetElement = element as HTMLElement | null
  let at = start, lineY = targetElement?.getBoundingClientRect().bottom ?? editor.top
  let left = editor.left, right = editor.right
  if (targetElement) { const rect = targetElement.getBoundingClientRect(); left = rect.left + (parent.type.name === 'column' || parent.type.name === 'tabPanel' ? 4 : 32); right = rect.right - 12 }
  let chosen = false
  parent.forEach((node, offset) => {
    if (chosen) return
    const pos = start + offset, dom = elementAt(view, pos), rect = dom?.getBoundingClientRect()
    if (!rect || rect.height === 0) { at = pos + node.nodeSize; return }
    if (y < rect.top + rect.height / 2) { at = pos; lineY = rect.top; chosen = true }
    else { at = pos + node.nodeSize; lineY = rect.bottom }
  })
  return { pos: at, container, left, right, y: lineY, element }
}
export const BlockDrop = Extension.create({
  name: 'notebookBlockDrop',
  addProseMirrorPlugins() {
    const editor = this.editor
    let line: HTMLDivElement | null = null, outlined: HTMLElement | null = null
    function clear() { line?.remove(); line = null; outlined?.classList.remove('notebook-drop-inside'); outlined = null }
    return [createBlockSelectionPlugin(() => editor.isEditable), new Plugin<number[] | null>({
      key: blockDropKey,
      state: {
        init: () => null,
        apply: (tr, source) => {
          const meta = tr.getMeta(blockDropKey)
          if (meta) return meta.source == null ? null : meta.sources || [meta.source]
          if (source == null) return null
          const mapped = source.flatMap(pos => { const next = tr.mapping.mapResult(pos); return next.deleted ? [] : [next.pos] })
          return mapped.length ? mapped : null
        },
      },
      props: {
        handleDOMEvents: {
          dragover(view, event) {
            const source = blockDropKey.getState(view.state)
            if (source == null || !view.dragging || !editor.isEditable) return false
            event.preventDefault()
            if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
            clear()
            const target = dropTarget(view, event.clientX, event.clientY)
            if (!target || !moveBlocksTo(view.state, source, target)) return true
            line = document.createElement('div'); line.className = 'notebook-block-drop-line'
            Object.assign(line.style, { left: `${target.left}px`, top: `${target.y - 1}px`, width: target.side ? '3px' : `${Math.max(0, target.right - target.left)}px`, height: target.side ? `${target.height}px` : '3px' })
            document.body.append(line)
            outlined = target.element; outlined?.classList.add('notebook-drop-inside')
            return true
          },
          dragleave(view, event) { if (!(event.relatedTarget instanceof Node) || !view.dom.contains(event.relatedTarget)) clear(); return false },
        },
        handleDrop(view, event, _slice, moved) {
          const source = blockDropKey.getState(view.state)
          if (source == null || !moved) return false
          event.preventDefault(); clear()
          const target = dropTarget(view, event.clientX, event.clientY)
          const tr = editor.isEditable && target ? moveBlocksTo(view.state, source, target) : null
          view.dragging = null
          view.dispatch((tr || view.state.tr).setMeta(blockDropKey, { source: null }))
          return true
        },
      },
      view(view) {
        const finish = () => { clear(); if (!editor.isDestroyed && blockDropKey.getState(view.state) != null) view.dispatch(view.state.tr.setMeta(blockDropKey, { source: null })) }
        document.addEventListener('dragend', finish); document.addEventListener('drop', finish)
        return { destroy() { clear(); document.removeEventListener('dragend', finish); document.removeEventListener('drop', finish) } }
      },
    })]
  },
})
