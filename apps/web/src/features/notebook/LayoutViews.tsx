import { ImageGridView } from './ImageGridView'
import { NotebookView } from './NotebookView'
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { NodeViewContent, NodeViewWrapper, useEditorState, type Editor, type NodeViewProps } from '@tiptap/react'
import { createPortal } from 'react-dom'
import { TextSelection } from '@tiptap/pm/state'
import { closeHistory } from '@tiptap/pm/history'
import { activeTab, editTabs, layoutNavigationKey, outlineHeadings, setColumnWidths, reorderColumns, moveColumnToRow, moveColumnOutsideRow } from './layoutBlocks'
import { columnWidths, dragColumnBoundary } from './blockCatalog'

function useLayoutState(editor: Editor) {
  return useEditorState({ editor, selector: context => ({ doc: context.editor.state.doc, editable: context.editor.isEditable, navigation: layoutNavigationKey.getState(context.editor.state) }) })
}
function ColumnsView({ editor, node, getPos }: NodeViewProps) {
  const state = useLayoutState(editor), root = useRef<HTMLDivElement>(null)
  const [preview, setPreview] = useState<number[] | null>(null)
  const drag = useRef<{ index: number; x: number; available: number; widths: number[]; next: number[]; pointer: number } | null>(null)
  const [ordering, setOrdering] = useState<{ from: number; to: number; target: number | null; edge?: 'above' | 'below'; x: number; y: number; height: number; width?: number } | null>(null)
  const orderDrag = useRef<{ from: number; to: number; target: number | null; edge?: 'above' | 'below'; pointer: number; doc: typeof state.doc; columns: Array<{ left: number; right: number }> } | null>(null)
  const widths = preview || columnWidths(node.attrs.widths, node.childCount)
  useEffect(() => { if (!state.editable) { drag.current = null; setPreview(null); orderDrag.current = null; setOrdering(null) } }, [state.editable])
  function commit(next: number[]) {
    const pos = getPos()
    if (!editor.isEditable || typeof pos !== 'number') return
    const tr = setColumnWidths(editor.state, pos, next)
    if (tr) editor.view.dispatch(tr)
  }
  function start(event: PointerEvent<HTMLDivElement>, index: number) {
    if (event.button !== 0 || !editor.isEditable) return
    event.preventDefault(); event.stopPropagation()
    const available = (root.current?.getBoundingClientRect().width || 0) - 28 * (node.childCount - 1)
    if (available <= 0) return
    drag.current = { index, x: event.clientX, available, widths, next: widths, pointer: event.pointerId }
    event.currentTarget.setPointerCapture(event.pointerId)
    setPreview(widths)
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current
    if (!current || current.pointer !== event.pointerId) return
    const minimum = Math.min(80, current.available / node.childCount / 2) / current.available * 100
    current.next = dragColumnBoundary(current.widths, current.index, (event.clientX - current.x) / current.available * 100, minimum)
    setPreview(current.next)
  }
  function finish(event: PointerEvent<HTMLDivElement>, cancel = false) {
    const current = drag.current
    if (!current || current.pointer !== event.pointerId) return
    drag.current = null
    if (!cancel && Math.abs(event.clientX - current.x) > 1) commit(current.next)
    setPreview(null)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  function reorder(from: number, to: number) {
    const pos = getPos()
    if (!editor.isEditable || typeof pos !== 'number') return
    const tr = reorderColumns(editor.state, pos, from, to)
    if (tr) {
      editor.view.dispatch(tr)
      requestAnimationFrame(() => root.current?.querySelector<HTMLButtonElement>(`[data-column-grip="${to}"]`)?.focus({ preventScroll: true }))
    }
  }
  function beginOrder(event: PointerEvent<HTMLButtonElement>, from: number) {
    if (event.button !== 0 || !editor.isEditable || drag.current) return
    event.preventDefault(); event.stopPropagation()
    const columns = Array.from(root.current?.querySelector('.notebook-columns-row > [data-node-view-content-react]')?.children || []).map(column => { const rect = column.getBoundingClientRect(); return { left: rect.left, right: rect.right } })
    if (columns.length !== node.childCount) return
    orderDrag.current = { from, to: from, target: getPos() ?? null, pointer: event.pointerId, doc: editor.state.doc, columns }
    event.currentTarget.setPointerCapture(event.pointerId)
    setOrdering({ from, to: from, target: getPos() ?? null, x: 0, y: 0, height: 0 })
  }
  function moveOrder(event: PointerEvent<HTMLButtonElement>) {
    const current = orderDrag.current
    if (!current || current.pointer !== event.pointerId) return
    const sourcePos = getPos()
    if (typeof sourcePos !== 'number' || current.doc !== editor.state.doc) return
    let hit: { pos: number; rect: DOMRect; columns: DOMRect[] } | null = null
    editor.state.doc.descendants((row, pos) => {
      if (row.type.name !== 'columns') return
      const dom = editor.view.nodeDOM(pos)
      if (!(dom instanceof HTMLElement)) return
      const wrapper = dom.matches('[data-type="columns"]') ? dom : dom.querySelector<HTMLElement>(':scope > [data-type="columns"]')
      const rect = wrapper?.getBoundingClientRect()
      if (!rect || !rect.height || event.clientY < rect.top - 24 || event.clientY > rect.bottom + 12 || event.clientX < rect.left - 40 || event.clientX > rect.right + 40) return
      const columns = Array.from(wrapper!.querySelector('.notebook-columns-row > [data-node-view-content-react]')?.children || []).map(item => item.getBoundingClientRect())
      if (columns.length === row.childCount) hit = { pos, rect, columns }
    })
    const destination = hit as { pos: number; rect: DOMRect; columns: DOMRect[] } | null
    if (!destination) { current.target = null; setOrdering(null); return }
    const above = event.clientY < destination.rect.top - 10 || event.clientY >= destination.rect.top && event.clientY < destination.rect.top + 7
    const below = event.clientY > destination.rect.bottom - 7
    const edge = above ? 'above' : below ? 'below' : undefined
    current.edge = edge
    if (edge) {
      const valid = !!moveColumnOutsideRow(editor.state, sourcePos, current.from, destination.pos, edge)
      current.target = valid ? destination.pos : null
      if (!valid) { setOrdering(null); return }
      setOrdering({ from: current.from, to: 0, target: destination.pos, edge, x: destination.rect.left, y: edge === 'above' ? destination.rect.top - 3 : destination.rect.bottom + 1, height: 3, width: destination.rect.width })
      return
    }
    const others = destination.columns.filter((_column, index) => destination.pos !== sourcePos || index !== current.from)
    const to = others.filter(column => event.clientX > (column.left + column.right) / 2).length
    const valid = destination.pos === sourcePos && to === current.from || !!moveColumnToRow(editor.state, sourcePos, current.from, destination.pos, to)
    current.to = to; current.target = valid ? destination.pos : null
    if (!valid) { setOrdering(null); return }
    const boundary = to === others.length ? others.at(-1)!.right + 14 : others[to].left - 14
    setOrdering({ from: current.from, to, target: destination.pos, x: boundary, y: destination.rect.top, height: destination.rect.height })
  }
  function endOrder(event: PointerEvent<HTMLButtonElement>, cancel = false) {
    const current = orderDrag.current
    if (!current || current.pointer !== event.pointerId) return
    orderDrag.current = null
    if (!cancel && current.doc === editor.state.doc && current.target != null) {
      const pos = getPos()
      if (typeof pos === 'number' && editor.isEditable) {
        if (current.edge) { const tr = moveColumnOutsideRow(editor.state, pos, current.from, current.target, current.edge); if (tr) editor.view.dispatch(tr) }
        else if (pos === current.target) reorder(current.from, current.to)
        else { const tr = moveColumnToRow(editor.state, pos, current.from, current.target, current.to); if (tr) editor.view.dispatch(tr) }
      }
    }
    setOrdering(null)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  let gripOffset = 0
  let cumulative = 0
  return <NodeViewWrapper ref={root} data-type="columns" className={[preview ? 'is-resizing-columns' : '', ordering ? 'is-reordering-columns' : ''].join(' ')} style={{ '--nb-column-tracks': widths.map(width => `minmax(0, ${width}fr)`).join(' ') } as CSSProperties}>
    <NodeViewContent className="notebook-columns-row" />
    {state.editable && widths.map((width, index) => {
      const fraction = (gripOffset + width / 2) / 100; gripOffset += width
      return <button key={index} type="button" contentEditable={false} data-column-grip={index} className="notebook-column-grip" aria-label={`Move column ${index + 1}`} title="Drag to move column · use arrow keys to reorder" style={{ left: `calc(${fraction * 100}% + ${28 * index - 28 * (widths.length - 1) * fraction}px)` }} onPointerDown={event => beginOrder(event, index)} onPointerMove={moveOrder} onPointerUp={event => endOrder(event)} onPointerCancel={event => endOrder(event, true)} onLostPointerCapture={event => endOrder(event, true)} onKeyDown={event => { if (event.key === 'Escape') { orderDrag.current = null; setOrdering(null) } else if (['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); reorder(index, index + (event.key === 'ArrowLeft' ? -1 : 1)) } }}><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 5h.01M8 5h.01M12 5h.01M4 10h.01M8 10h.01M12 10h.01" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /></svg></button>
    })}
    {ordering && ordering.target != null && (ordering.edge || ordering.target !== getPos() || ordering.from !== ordering.to) && createPortal(<div className="notebook-column-order-line" style={{ position: 'fixed', left: ordering.x, top: ordering.y, height: ordering.height, width: ordering.width || 3, transform: ordering.edge ? 'none' : 'translateX(-50%)', bottom: 'auto', zIndex: 1000 }} />, document.body)}

    {state.editable && widths.slice(0, -1).map((width, index) => {
      cumulative += width
      const fraction = cumulative / 100
      return <div key={index} contentEditable={false} role="separator" aria-orientation="vertical" aria-label={`Resize columns ${index + 1} and ${index + 2}`} aria-valuenow={Math.round(width)} aria-valuemin={1} aria-valuemax={Math.round(width + widths[index + 1] - 1)} tabIndex={0} className="notebook-column-divider" style={{ left: `calc(${cumulative}% + ${28 * index + 14 - 28 * (widths.length - 1) * fraction}px)` }} onPointerDown={event => start(event, index)} onPointerMove={move} onPointerUp={event => finish(event)} onPointerCancel={event => finish(event, true)} onLostPointerCapture={event => finish(event, true)} onDoubleClick={() => { const next = [...widths]; next[index] = next[index + 1] = (widths[index] + widths[index + 1]) / 2; commit(next) }} onKeyDown={event => { if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return; event.preventDefault(); event.stopPropagation(); commit(dragColumnBoundary(widths, index, event.key === 'ArrowLeft' ? -2 : 2, 5)) }} />
    })}
  </NodeViewWrapper>
}
function TabsView({ editor, node, getPos }: NodeViewProps) {
  const state = useLayoutState(editor), pos = getPos() ?? 0
  const selected = activeTab(editor.state, pos, node)
  const panels: Array<{ id: string; title: string; pos: number }> = []
  node.forEach((panel, offset) => panels.push({ id: panel.attrs.id, title: panel.attrs.title, pos: pos + 1 + offset }))
  const [renaming, setRenaming] = useState(false), [name, setName] = useState('')
  const nameInput = useRef<HTMLInputElement>(null), tabList = useRef<HTMLDivElement>(null), options = useRef<HTMLDetailsElement>(null)
  const current = panels.find(panel => panel.id === selected) || panels[0]
  useEffect(() => { if (renaming) { nameInput.current?.focus(); nameInput.current?.select() } }, [renaming])
  useEffect(() => { if (!state.editable) setRenaming(false) }, [state.editable])
  function switchTo(id: string, focus = false) {
    const at = getPos(); if (typeof at !== 'number') return
    const tr = editor.state.tr.setMeta(layoutNavigationKey, [{ pos: at, id }])
    if (editor.isEditable) tr.doc.nodeAt(at)?.forEach((panel, offset) => { if (panel.attrs.id === id) tr.setSelection(TextSelection.near(tr.doc.resolve(at + 2 + offset))) })
    editor.view.dispatch(tr)
    if (focus) requestAnimationFrame(() => tabList.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus())
  }
  function change(action: 'add' | 'rename' | 'remove' | 'left' | 'right', title?: string) {
    const at = getPos(); if (typeof at !== 'number' || !editor.isEditable) return
    const tr = editTabs(editor.state, at, action, selected, title)
    if (tr) editor.view.dispatch(tr)
    if (options.current) options.current.open = false
  }
  function keys(event: KeyboardEvent<HTMLButtonElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const index = panels.findIndex(panel => panel.id === selected)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? panels.length - 1 : (index + (event.key === 'ArrowLeft' ? -1 : 1) + panels.length) % panels.length
    switchTo(panels[next].id, true)
  }
  function rename() { setName(current.title); setRenaming(true); if (options.current) options.current.open = false }
  return <NodeViewWrapper data-type="tabs">
    <div className="notebook-tabs-header" contentEditable={false}>
      <div ref={tabList} role="tablist" aria-label="Page section tabs" className="notebook-layout-tablist">{panels.map(panel => <button key={panel.id} id={`notebook-layout-tab-${panel.pos}`} type="button" role="tab" aria-selected={selected === panel.id} aria-controls={`notebook-layout-panel-${panel.pos}`} tabIndex={selected === panel.id ? 0 : -1} onClick={() => switchTo(panel.id)} onKeyDown={keys} onDoubleClick={() => { if (state.editable) { switchTo(panel.id); setName(panel.title); setRenaming(true) } }}>{panel.title}</button>)}</div>
      {state.editable && <div className="notebook-layout-controls"><button type="button" aria-label="Add tab" title="Add tab" disabled={panels.length >= 12} onClick={() => change('add')}>＋</button><details ref={options} className="notebook-layout-menu"><summary role="button" aria-label="Tab options">•••</summary><div role="group" aria-label="Tab actions"><button type="button" onClick={rename}>Rename tab</button><button type="button" disabled={current.id === panels[0].id} onClick={() => change('left')}>Move tab left</button><button type="button" disabled={current.id === panels.at(-1)?.id} onClick={() => change('right')}>Move tab right</button><button type="button" disabled={panels.length < 2} onClick={() => change('remove')}>Remove tab, keep its content</button></div></details></div>}
    </div>
    {renaming && state.editable && <form className="notebook-tab-rename" contentEditable={false} onSubmit={event => { event.preventDefault(); change('rename', name); setRenaming(false) }}><label>Tab name<input ref={nameInput} aria-label="Tab name" value={name} maxLength={80} onChange={event => setName(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); setRenaming(false) } }} /></label><button type="submit">Save</button><button type="button" onClick={() => setRenaming(false)}>Cancel</button></form>}
    <NodeViewContent className="notebook-tabs-panels" />
  </NodeViewWrapper>
}
function TabPanelView({ editor, node, getPos }: NodeViewProps) {
  useLayoutState(editor)
  const pos = getPos() ?? 0, point = editor.state.doc.resolve(pos), parent = point.parent
  const selected = parent.type.name === 'tabs' ? activeTab(editor.state, point.before(), parent) : node.attrs.id
  return <NodeViewWrapper data-type="tabPanel" data-tab-id={node.attrs.id} data-tab-title={node.attrs.title} hidden={selected !== node.attrs.id} role="tabpanel" id={`notebook-layout-panel-${pos}`} aria-labelledby={`notebook-layout-tab-${pos}`}>
    <NodeViewContent className="notebook-tab-panel-content" />
  </NodeViewWrapper>
}
function ContentsView({ editor }: NodeViewProps) {
  const state = useLayoutState(editor), headings = outlineHeadings(state.doc)
  function navigate(pos: number) {
    const point = editor.state.doc.resolve(pos), tr = editor.state.tr
    const tabs: Array<{ pos: number; id: string }> = [], toggles: number[] = []
    for (let depth = 1; depth <= point.depth; depth++) {
      const node = point.node(depth)
      if (node.type.name === 'details') { const at = point.before(depth); toggles.push(at); if (editor.isEditable && !node.attrs.open) tr.setNodeMarkup(at, undefined, { ...node.attrs, open: true }) }
      if (node.type.name === 'tabPanel' && point.node(depth - 1).type.name === 'tabs') tabs.push({ pos: point.before(depth - 1), id: node.attrs.id })
    }
    tr.setMeta(layoutNavigationKey, tabs)
    editor.view.dispatch(tr.docChanged ? closeHistory(tr) : tr)
    requestAnimationFrame(() => {
      if (editor.isDestroyed) return
      if (!editor.isEditable) toggles.forEach(at => { const dom = editor.view.nodeDOM(at); if (dom instanceof HTMLElement) { const toggle = dom.matches('[data-type="details"]') ? dom : dom.querySelector('[data-type="details"]'); if (toggle && !toggle.classList.contains('is-open')) toggle.querySelector<HTMLButtonElement>(':scope > button')?.click() } })
      requestAnimationFrame(() => {
        if (editor.isDestroyed) return
        const target = editor.view.nodeDOM(pos)
        if (target instanceof HTMLElement) target.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
        if (editor.isEditable) { editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, pos + 1))); editor.view.focus() }
      })
    })
  }
  return <NodeViewWrapper data-type="tableOfContents" contentEditable={false}><nav aria-label="Table of contents" className="notebook-contents">{headings.length ? headings.map(heading => <button type="button" key={heading.pos} style={{ paddingInlineStart: `${8 + (Math.min(heading.level, 4) - 1) * 16}px` }} onClick={() => navigate(heading.pos)}>{heading.title}</button>) : <p>Add headings to create a table of contents.</p>}</nav></NodeViewWrapper>
}
export const layoutNodeViews = { imageGrid: ImageGridView, viewBlock: NotebookView, columns: ColumnsView, tabs: TabsView, tabPanel: TabPanelView, tableOfContents: ContentsView }
