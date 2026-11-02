import { ImageGrid } from './imageGrid.ts'
import { ViewBlock } from './viewBlocks.ts'
import { Extension, Node, mergeAttributes } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state'
import { Fragment, type Node as PMNode } from '@tiptap/pm/model'
import { closeHistory } from '@tiptap/pm/history'
import { newTab, validColumnWidths, columnWidths } from './blockCatalog.ts'

export const layoutNavigationKey = new PluginKey<Map<number, string>>('layout-navigation')
export function activeTab(state: EditorState, pos: number, node: PMNode): string {
  const id = layoutNavigationKey.getState(state)?.get(pos)
  return Array.from({ length: node.childCount }, (_, i) => node.child(i).attrs.id).includes(id) ? id! : node.firstChild?.attrs.id
}
export function createLayoutNavigationPlugin(): Plugin<Map<number, string>> {
  return new Plugin({
    key: layoutNavigationKey,
    state: {
      init: () => new Map<number, string>(),
      apply(tr, previous: Map<number, string>) {
        const next = new Map<number, string>()
        previous.forEach((id, pos) => { const mapped = tr.mapping.mapResult(pos); if (!mapped.deleted && tr.doc.nodeAt(mapped.pos)?.type.name === 'tabs') next.set(mapped.pos, id) })
        const changes: Array<{ pos: number; id: string }> | undefined = tr.getMeta(layoutNavigationKey)
        changes?.forEach(({ pos, id }) => next.set(pos, id))
        return next
      },
    },
  })
}
export const LayoutNavigation = Extension.create({ name: 'layoutNavigation', addProseMirrorPlugins: () => [createLayoutNavigationPlugin()] })
export const layoutNodeExtensions: Node[] = [
  ViewBlock, ImageGrid,
  Node.create({ name: 'columns', group: 'block', content: 'column{2,5}', defining: true, isolating: true,
    addAttributes: () => ({ widths: { default: null, parseHTML: el => { try { return JSON.parse(el.getAttribute('data-column-widths') || 'null') } catch { return null } }, renderHTML: attrs => attrs.widths ? { 'data-column-widths': JSON.stringify(attrs.widths) } : {} } }),
    parseHTML: () => [{ tag: 'div[data-type="columns"]' }], renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'columns' }), 0], }),
  Node.create({ name: 'column', content: 'block+', defining: true, isolating: true, selectable: false,
    parseHTML: () => [{ tag: 'div[data-type="column"]' }], renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'column' }), 0], }),
  Node.create({ name: 'tabs', group: 'block', content: 'tabPanel{1,12}', defining: true, isolating: true,
    parseHTML: () => [{ tag: 'div[data-type="tabs"]' }], renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'tabs' }), 0], }),
  Node.create({ name: 'tabPanel', content: 'block+', defining: true, isolating: true, selectable: false,
    addAttributes: () => ({ id: { default: '', parseHTML: el => el.getAttribute('data-tab-id') || crypto.randomUUID(), renderHTML: attrs => ({ 'data-tab-id': attrs.id }) }, title: { default: 'Untitled tab', parseHTML: el => el.getAttribute('data-tab-title') || 'Untitled tab', renderHTML: attrs => ({ 'data-tab-title': attrs.title }) } }),
    parseHTML: () => [{ tag: 'div[data-type="tabPanel"]' }], renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'tabPanel' }), 0], }),
  Node.create({ name: 'tableOfContents', group: 'block', atom: true, draggable: true,
    parseHTML: () => [{ tag: 'nav[data-type="tableOfContents"]' }], renderHTML: () => ['nav', { 'data-type': 'tableOfContents' }, 'Table of contents'], }),
]
const children = (node: PMNode): PMNode[] => Array.from({ length: node.childCount }, (_, i) => node.child(i))
const isEmpty = (node: PMNode) => node.childCount === 1 && node.firstChild?.type.name === 'paragraph' && node.firstChild.content.size === 0
export function resizeColumns(state: EditorState, pos: number, count: number): Transaction | null {
  const node = state.doc.nodeAt(pos)
  if (node?.type.name !== 'columns' || !Number.isInteger(count) || count < 2 || count > 5 || count === node.childCount) return null
  const columns = children(node)
  while (columns.length < count) columns.push(state.schema.nodes.column.createAndFill()!)
  if (columns.length > count) {
    const last = columns[count - 1], extra = columns.slice(count).flatMap(column => isEmpty(column) ? [] : children(column))
    columns[count - 1] = last.type.create(last.attrs, [...(isEmpty(last) && extra.length ? [] : children(last)), ...extra])
    columns.length = count
  }
  return closeHistory(state.tr.replaceWith(pos, pos + node.nodeSize, node.type.create({ ...node.attrs, widths: null }, columns))).scrollIntoView()
}
export function editTabs(state: EditorState, pos: number, action: 'add' | 'rename' | 'remove' | 'left' | 'right', id?: string, title?: string): Transaction | null {
  const node = state.doc.nodeAt(pos)
  if (node?.type.name !== 'tabs') return null
  const panels = children(node), index = panels.findIndex(panel => panel.attrs.id === id)
  let selected = id || panels[0].attrs.id
  if (action === 'add') {
    if (panels.length >= 12) return null
    const panel = state.schema.nodeFromJSON(newTab(`Tab ${panels.length + 1}`)); panels.push(panel); selected = panel.attrs.id
  } else {
    if (index < 0) return null
    if (action === 'rename') {
      const name = title?.trim().slice(0, 80) || 'Untitled tab'
      if (name === panels[index].attrs.title) return null
      panels[index] = panels[index].type.create({ ...panels[index].attrs, title: name }, panels[index].content)
    } else if (action === 'remove') {
      if (panels.length === 1) return null
      const neighbor = index === 0 ? 1 : index - 1, destination = panels[neighbor], removed = panels[index]
      const content = isEmpty(removed) ? children(destination) : [...(isEmpty(destination) ? [] : children(destination)), ...children(removed)]
      panels[neighbor] = destination.type.create(destination.attrs, content)
      selected = destination.attrs.id; panels.splice(index, 1)
    } else {
      const other = index + (action === 'left' ? -1 : 1)
      if (other < 0 || other >= panels.length) return null
      ;[panels[index], panels[other]] = [panels[other], panels[index]]
    }
  }
  const tr = state.tr.replaceWith(pos, pos + node.nodeSize, node.type.create(node.attrs, Fragment.fromArray(panels)))
  tr.doc.nodeAt(pos)!.forEach((panel, offset) => { if (panel.attrs.id === selected) tr.setSelection(TextSelection.near(tr.doc.resolve(pos + 2 + offset))) })
  tr.setMeta(layoutNavigationKey, [{ pos, id: selected }])
  return closeHistory(tr).scrollIntoView()
}
export type OutlineHeading = { pos: number; level: number; title: string }
export function outlineHeadings(doc: PMNode): OutlineHeading[] {
  const headings: OutlineHeading[] = []
  doc.descendants((node, pos) => {
    const level = node.type.name === 'heading' ? node.attrs.level : node.type.name === 'detailsSummary' ? node.attrs.headingLevel : null
    if (level && node.textContent.trim()) headings.push({ pos, level, title: node.textContent })
  })
  return headings
}

export function setColumnWidths(state: EditorState, pos: number, widths: number[]): Transaction | null {
  const node = state.doc.nodeAt(pos)
  if (node?.type.name !== 'columns' || !validColumnWidths(widths, node.childCount)) return null
  if (JSON.stringify(node.attrs.widths) === JSON.stringify(widths)) return null
  // One committed transaction per drag keeps undo and autosave quiet during preview.
  return closeHistory(state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, widths }))
}

// Reorder exact column nodes together with their width weights, in one undo step.
export function reorderColumns(state: EditorState, pos: number, from: number, to: number): Transaction | null {
  if (pos < 0 || pos >= state.doc.content.size) return null
  const row = state.doc.nodeAt(pos)
  if (row?.type.name !== 'columns' || !Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= row.childCount || to >= row.childCount || from === to) return null
  const columns = children(row), widths = columnWidths(row.attrs.widths, row.childCount)
  const [column] = columns.splice(from, 1), [width] = widths.splice(from, 1)
  columns.splice(to, 0, column); widths.splice(to, 0, width)
  const tr = state.tr.replaceWith(pos, pos + row.nodeSize, row.type.create({ ...row.attrs, widths: row.attrs.widths ? widths : null }, columns))
  const inside = pos + 2 + columns.slice(0, to).reduce((total, item) => total + item.nodeSize, 0)
  tr.setSelection(TextSelection.near(tr.doc.resolve(inside)))
  return closeHistory(tr).scrollIntoView()
}

export function moveColumnToRow(state: EditorState, sourcePos: number, from: number, targetPos: number, to: number): Transaction | null {
  if (sourcePos === targetPos) return reorderColumns(state, sourcePos, from, to)
  if (sourcePos < 0 || targetPos < 0 || sourcePos >= state.doc.content.size || targetPos >= state.doc.content.size) return null
  const source = state.doc.nodeAt(sourcePos), target = state.doc.nodeAt(targetPos)
  if (source?.type.name !== 'columns' || target?.type.name !== 'columns' || !Number.isInteger(from) || !Number.isInteger(to) || from < 0 || from >= source.childCount || to < 0 || to > target.childCount || target.childCount >= 5) return null
  const column = source.child(from)
  const columnPos = sourcePos + 1 + children(source).slice(0, from).reduce((sum, item) => sum + item.nodeSize, 0)
  if (targetPos >= columnPos && targetPos < columnPos + column.nodeSize) return null
  const weight = columnWidths(source.attrs.widths, source.childCount)[from]
  if (!(weight > 0 && weight < 100)) return null
  const widths = columnWidths(target.attrs.widths, target.childCount).map(width => width * (100 - weight) / 100)
  widths.splice(to, 0, weight)
  const inserted = targetPos + 1 + children(target).slice(0, to).reduce((sum, item) => sum + item.nodeSize, 0)
  const tr = state.tr.setNodeMarkup(targetPos, undefined, { ...target.attrs, widths }).insert(inserted, column)
  let selected = inserted + 1
  // Insert first so a nested destination remains addressable while the source unwraps.
  const mappedSource = tr.mapping.map(sourcePos), mappedColumn = tr.mapping.map(columnPos)
  const row = tr.doc.nodeAt(mappedSource)!
  const before = tr.steps.length
  if (row.childCount > 2) {
    const remainingWidths = columnWidths(source.attrs.widths, source.childCount).filter((_width, index) => index !== from)
    tr.delete(mappedColumn, mappedColumn + column.nodeSize)
    tr.setNodeMarkup(mappedSource, undefined, { ...row.attrs, widths: columnWidths(remainingWidths, remainingWidths.length) })
    selected = tr.mapping.slice(before).map(selected)
  } else {
    const remaining = row.child(from === 0 ? 1 : 0)
    const remainingPos = mappedSource + 1 + (from === 0 ? column.nodeSize : 0)
    const inside = selected > remainingPos && selected < remainingPos + remaining.nodeSize - 1
    tr.replaceWith(mappedSource, mappedSource + row.nodeSize, remaining.content)
    selected = inside ? mappedSource + selected - remainingPos - 1 : tr.mapping.slice(before).map(selected)
  }
  let tooDeep = false
  tr.doc.descendants((_node, pos) => { if (tr.doc.resolve(pos).depth > 40) tooDeep = true })
  if (tooDeep) return null
  tr.setSelection(TextSelection.near(tr.doc.resolve(selected)))
  return closeHistory(tr).scrollIntoView()
}

// A column moved above/below a row becomes full-width blocks in their original order.
export function moveColumnOutsideRow(state: EditorState, sourcePos: number, from: number, targetPos: number, edge: 'above' | 'below'): Transaction | null {
  if (sourcePos < 0 || targetPos < 0 || sourcePos >= state.doc.content.size || targetPos >= state.doc.content.size) return null
  const source = state.doc.nodeAt(sourcePos), target = state.doc.nodeAt(targetPos)
  if (source?.type.name !== 'columns' || target?.type.name !== 'columns' || !Number.isInteger(from) || from < 0 || from >= source.childCount) return null
  const column = source.child(from)
  const columnPos = sourcePos + 1 + children(source).slice(0, from).reduce((sum, item) => sum + item.nodeSize, 0)
  if (targetPos >= columnPos && targetPos < columnPos + column.nodeSize) return null
  const inserted = targetPos + (edge === 'below' ? target.nodeSize : 0), point = state.doc.resolve(inserted)
  if (!point.parent.canReplace(point.index(), point.index(), column.content)) return null
  const tr = state.tr.insert(inserted, column.content)
  let selected = inserted
  const mappedSource = tr.mapping.map(sourcePos), mappedColumn = tr.mapping.map(columnPos), row = tr.doc.nodeAt(mappedSource)!
  const before = tr.steps.length
  if (row.childCount > 2) {
    const widths = columnWidths(source.attrs.widths, source.childCount).filter((_width, index) => index !== from)
    tr.delete(mappedColumn, mappedColumn + column.nodeSize)
    tr.setNodeMarkup(mappedSource, undefined, { ...row.attrs, widths: columnWidths(widths, widths.length) })
    selected = tr.mapping.slice(before).map(selected)
  } else {
    const remaining = row.child(from === 0 ? 1 : 0)
    const remainingPos = mappedSource + 1 + (from === 0 ? column.nodeSize : 0)
    const inside = selected > remainingPos && selected < remainingPos + remaining.nodeSize - 1
    tr.replaceWith(mappedSource, mappedSource + row.nodeSize, remaining.content)
    selected = inside ? mappedSource + selected - remainingPos - 1 : tr.mapping.slice(before).map(selected)
  }
  let tooDeep = false
  tr.doc.descendants((_node, pos) => { if (tr.doc.resolve(pos).depth > 40) tooDeep = true })
  if (tooDeep) return null
  tr.setSelection(TextSelection.near(tr.doc.resolve(selected)))
  return closeHistory(tr).scrollIntoView()
}
