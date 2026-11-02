import { Dropdown } from '../../components/Dropdown'
import { createPortal } from 'react-dom'
import { HabitsPage } from './HabitsPage'
import { MedsPage } from './MedsPage'
import { BoardViewSettings } from './BoardViewSettings'
import { cardPreview } from './boardCardLayout'
import { BoardCardProperties } from './BoardCardProperties'
import { defaultCardProperties } from './cardProperties'
import { reconcileTaskSystems } from './taskSystemFields'
import { statusGroups, inferStatusGroup, type StatusGroup } from './statusGroups'
import { NumberPropertyValue, NumberVisualization } from './NumberProperty'
import { updatePropertyDisplay, duplicateValueProperty, type PropertyDisplayPatch } from './propertyDisplay'
import { PageEditor } from './PageEditor'
import { taskDescriptionDocument, taskDescriptionText } from './taskDescription'
import { TaskImagePicker, TaskImagePreview } from './TaskImagePicker'
import { BuiltinImageProperty, BuiltinValueProperty, CustomTaskProperties, PropertyPopover, PropertyIcon, TaskDatePicker, TaskStatusPicker } from './TaskPropertyControls'
import { upsertTaskProperty, removeTaskProperty, validPropertyValue, validPropertyDefinitions, planTaskPropertyChange, applyPropertyMenuAction, type PropertyMenuAction, type PropertyDefinition, type PropertyValue } from './taskProperties'
import { boardStatusGroup, boardColumn, boardColumnStyle, boardColors, type BoardColumn, type BoardColumns, type BoardDefinition, listBoard, addBoardColumn, deleteBoardColumn, moveBoardColumn } from './boardColumns'
import { createContext, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode, type CSSProperties } from 'react'
import { NodeViewWrapper, useEditorState, type NodeViewProps } from '@tiptap/react'
import type { JSONContent } from '@tiptap/core'
import { blankItem, validItem, patchPersonalItem, moveBoardItem, itemStatuses, mergeDataEdits, type PersonalItem, type PersonalList } from './personalLists'
import type { Page } from './notebookModel'
import { calendarDays, defaultViewConfig, groupRecords, importedRecords, pageRecords, listRecords, metricValue, recordDay, recordsOnDay, viewKinds, visibleRecords, validViewConfig, type ViewConfig, type ViewRecord, type ViewSource } from './viewModel'

type SourceState = { records: ViewRecord[]; loading: boolean; error: string; connected: boolean }
const empty = (): SourceState => ({ records: [], loading: false, error: '', connected: false })
const cached = { tasks: empty(), meetings: empty() }
type OwnedList = { list: PersonalList; owner: string; locked: boolean }
type ListsMutation = (owner: string, change: (lists: PersonalList[]) => PersonalList[]) => void
const ViewData = createContext<{ sourcePages: Page[]; mutateLists: ListsMutation; pages: ViewRecord[]; tasks: SourceState; meetings: SourceState; lists: OwnedList[]; refresh: () => void; createList: (name: string, items?: PersonalItem[], board?: BoardDefinition, properties?: PropertyDefinition[]) => string; changeList: (id: string, change: (list: PersonalList) => PersonalList) => void; removeItem: (listId: string, itemId: string) => void }>({ sourcePages: [], mutateLists: () => {}, pages: [], ...cached, lists: [], refresh: () => {}, createList: () => '', changeList: () => {}, removeItem: () => {} })
export const NotebookSaveStatus = createContext<{ status: string; error?: string; retry?: () => void }>({ status: '' })
const RecordAction = createContext<((id: string) => void) | null>(null)
export function NotebookViewsProvider({ pages, content, children, pageId, mutateLists: persistLists }: { pages: Page[]; content: JSONContent; children: ReactNode; pageId: string; mutateLists: ListsMutation }) {
  const mutateLists: ListsMutation = (owner, change) => persistLists(owner, previous => reconcileTaskSystems(previous, change(previous)))
  const [removed, setRemoved] = useState<{ listId: string; owner: string; item: PersonalItem; index: number } | null>(null)
  const lists = pages.filter(page => !page.deletedAt).flatMap(page => (page.lists || []).map(list => ({ list, owner: page.id, locked: !!page.locked })))
  function changeList(id: string, change: (list: PersonalList) => PersonalList) { const owner = lists.find(entry => entry.list.id === id); if (owner && !owner.locked) mutateLists(owner.owner, current => current.map(list => list.id === id ? change(list) : list)) }
  function createList(name: string, items: PersonalItem[] = [], board?: BoardDefinition, properties?: PropertyDefinition[]) { const page = pages.find(page => page.id === pageId); if (!page || page.locked || page.deletedAt || (page.lists?.length || 0) >= 50) return ''; const id = crypto.randomUUID(); mutateLists(pageId, current => current.length < 50 ? [...current, { id, name: name.trim() || 'Untitled list', items, ...(board ? { board } : {}), ...(properties ? { properties } : {}) }] : current); return id }
  useEffect(() => { for (const entry of lists) if (!entry.locked && entry.list.properties?.some(property => property.type === 'id') && entry.list.items.some(item => !item.metadata?.number)) changeList(entry.list.id, list => list) }, [pages])
  const requestedHistory = useRef(new Set<string>())
  useEffect(() => {
    const owners = new Set(lists.filter(entry => !entry.locked && entry.list.properties?.some(property => ['created-time', 'edited-time'].includes(property.type)) && entry.list.items.some(item => !item.metadata?.createdAt || !item.metadata?.editedAt)).map(entry => entry.owner))
    for (const owner of owners) {
      if (requestedHistory.current.has(owner)) continue
      requestedHistory.current.add(owner)
      void fetch(`/api/notebook/pages/${owner}/task-metadata`).then(response => response.ok ? response.json() : null).then(result => {
        if (!result) return
        mutateLists(owner, previous => previous.map(list => ({ ...list, items: list.items.map(item => {
          const metadata = result[item.id]
          if (!metadata || !validItem({ ...item, metadata }) || !metadata.createdAt && !metadata.editedAt) return item
          return { ...item, metadata: { ...metadata, ...item.metadata, createdAt: item.metadata?.createdAt || metadata.createdAt, editedAt: item.metadata?.editedAt || metadata.editedAt } }
        }) })))
      }).catch(() => { requestedHistory.current.delete(owner) })
    }
  }, [pages])
  function removeItem(listId: string, itemId: string) {
    const owner = lists.find(entry => entry.list.id === listId), index = owner?.list.items.findIndex(item => item.id === itemId) ?? -1
    if (!owner || owner.locked || index < 0) return
    setRemoved({ listId, owner: owner.owner, item: owner.list.items[index], index })
    changeList(listId, list => ({ ...list, items: list.items.filter(item => item.id !== itemId) }))
  }
  const [sources, setSources] = useState({ ...cached }), [revision, setRevision] = useState(0)
  const wanted = new Set<string>()
  function inspect(node: JSONContent) { if (node.type === 'viewBlock') wanted.add(node.attrs?.source); node.content?.forEach(inspect) }
  inspect(content)
  const key = [...wanted].filter(source => source === 'tasks' || source === 'meetings').sort().join(',')
  useEffect(() => {
    const controller = new AbortController()
    for (const name of key.split(',').filter(Boolean) as Array<'tasks' | 'meetings'>) {
      setSources(previous => ({ ...previous, [name]: { ...previous[name], loading: true } }))
      void (async () => {
        try {
          const response = await fetch(`/api/${name === 'tasks' ? 'ticktick' : 'apple-calendar'}/status`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) })
          if (!response.ok) throw new Error('This source is unavailable. Showing the last loaded records.')
          const status = await response.json()
          if (!status || typeof status.connected !== 'boolean' || status.imported != null && (typeof status.imported !== 'object' || !Array.isArray(status.imported[name === 'tasks' ? 'tasks' : 'events']))) throw new Error('This source returned an invalid response. Showing the last loaded records.')
          if (controller.signal.aborted) return
          const next = { records: status.imported ? importedRecords(name, status.imported) : cached[name].records, connected: status.connected, loading: false, error: typeof status.error === 'string' ? status.error : '' }
          cached[name] = next; setSources(previous => ({ ...previous, [name]: next }))
        } catch (reason) {
          if (!controller.signal.aborted) setSources(previous => ({ ...previous, [name]: { ...previous[name], loading: false, error: reason instanceof Error ? reason.message : 'Source unavailable.' } }))
        }
      })()
    }
    return () => controller.abort()
  }, [key, revision])
  const records = useMemo(() => pageRecords(pages), [pages])
  return <ViewData.Provider value={{ sourcePages: pages, mutateLists, pages: records, ...sources, lists, createList, changeList, removeItem, refresh: () => setRevision(value => value + 1) }}>{children}{removed && <div className="notebook-list-undo" role="status">Item deleted<button type="button" onClick={() => { mutateLists(removed.owner, current => current.map(list => { if (list.id !== removed.listId || list.items.length >= 1000 || list.items.some(item => item.id === removed.item.id)) return list; const items = [...list.items]; items.splice(removed.index, 0, removed.item); return { ...list, items } })); setRemoved(null) }}>Undo</button><button type="button" aria-label="Dismiss deletion notice" onClick={() => setRemoved(null)}>×</button></div>}</ViewData.Provider>
}
function RecordTitle({ record }: { record: ViewRecord }) { const open = useContext(RecordAction), title = record.done ? <s>{record.title || 'Untitled'}</s> : record.title || 'Untitled'; return open ? <button type="button" className="notebook-record-title" onClick={() => open(record.id)}>{title}</button> : record.url ? <a href={record.url}>{title}</a> : <span>{title}</span> }
function BoardCardImage({ record, preview }: { record: ViewRecord; preview: ReturnType<typeof cardPreview> }) {
  const open = useContext(RecordAction)
  if (!preview) return null
  if (preview.kind === 'text') return <div className="notebook-board-card-content-preview">{preview.text}</div>
  return open ? <button type="button" className="notebook-board-card-image" aria-label={`Open image for ${record.title}`} draggable={false} onClick={() => open(record.id)}><TaskImagePreview src={preview.src} /></button> : <TaskImagePreview src={preview.src} alt={`Image for ${record.title}`} className="notebook-board-card-image" />
}

function Badge({ children }: { children: ReactNode }) { return <span className="notebook-view-badge">{children}</span> }
function TableView({ records }: { records: ViewRecord[] }) {
  return <div className="notebook-view-scroll"><table className="notebook-data-table"><thead><tr><th scope="col">Name</th><th scope="col">Status</th><th scope="col">Date</th><th scope="col">Value</th></tr></thead><tbody>{records.slice(0, 200).map(record => <tr key={record.id}><td><RecordTitle record={record} /></td><td><Badge>{record.statusLabel || record.status}</Badge></td><td>{record.date ? <time dateTime={record.date}>{record.date}</time> : <span className="notebook-view-muted">—</span>}</td><td>{record.value == null ? <span className="notebook-view-muted">—</span> : <NumberVisualization value={record.value} config={record.numberDisplay} />}</td></tr>)}</tbody></table></div>
}
function ColumnSettings({ initial, save, close, create = false, remove, canRemove = true }: { create?: boolean; remove?: () => void; canRemove?: boolean; initial: BoardColumn; save: (column: BoardColumn) => string | void; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), [name, setName] = useState(initial.name), [color, setColor] = useState(initial.color), [error, setError] = useState(''), [group, setGroup] = useState<StatusGroup>(initial.group || inferStatusGroup(initial.name))
  useEffect(() => { dialog.current?.showModal(); dialog.current?.querySelector<HTMLInputElement>('input')?.select() }, [])
  return <dialog ref={dialog} className="notebook-settings notebook-column-settings" aria-label="Column settings" onCancel={close}><form onSubmit={event => { event.preventDefault(); if (name.trim()) { const issue = save({ name: name.trim(), color, group }); if (issue) setError(issue) } }}><header><h2>{create ? 'New column' : 'Column settings'}</h2><button type="button" aria-label="Close column settings" onClick={close}>×</button></header><label className="notebook-column-name">Name<input autoFocus aria-label="Column name" required maxLength={60} value={name} onChange={event => setName(event.target.value)} /></label><label className="notebook-column-name">Status group<Dropdown aria-label="Column status group" value={group} onValueChange={selectedValue => setGroup(selectedValue as StatusGroup)}>{statusGroups.map(group => <option key={group.id} value={group.id}>{group.label}</option>)}</Dropdown></label><fieldset><legend>Color</legend><div className="notebook-column-colors">{boardColors.map(option => <label key={option.id} style={{ '--column-swatch': option.accent, '--column-tint': option.background } as CSSProperties}><input type="radio" name="column-color" value={option.id} checked={color === option.id} onChange={() => setColor(option.id)} /><i aria-hidden="true" /><span>{option.label}</span><svg className="notebook-column-color-check" aria-hidden="true" viewBox="0 0 16 16" fill="none"><path d="m3.5 8 3 3 6-6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg></label>)}</div></fieldset>{error && <p role="alert">{error}</p>}<footer>{remove && <button type="button" className="notebook-column-delete" disabled={!canRemove} title={!canRemove ? 'Keep at least one column' : undefined} onClick={remove}>Delete column</button>}<button type="button" onClick={close}>Cancel</button><button type="submit" disabled={!name.trim()}>{create ? 'Add column' : 'Save column'}</button></footer></form></dialog>
}
function DeleteColumnDialog({ name, count, choices, close, remove }: { name: string; count: number; choices: Array<{ id: PersonalItem['status']; name: string }>; close: () => void; remove: (target?: PersonalItem['status']) => string | void }) {
  const dialog = useRef<HTMLDialogElement>(null), [target, setTarget] = useState(''), [error, setError] = useState('')
  useEffect(() => { dialog.current?.showModal() }, [])
  return <dialog ref={dialog} className="notebook-settings notebook-column-settings" aria-label="Delete column" onCancel={close}><form onSubmit={event => { event.preventDefault(); const issue = remove(target ? target as PersonalItem['status'] : undefined); if (issue) setError(issue) }}><h2>Delete “{name}”?</h2>{count ? <><p>{count} {count === 1 ? 'task will be moved' : 'tasks will be moved'} to another column, including tasks hidden by filters.</p><label className="notebook-column-name">Move tasks to<Dropdown required aria-label="Move column tasks to" value={target} onValueChange={selectedValue => setTarget(selectedValue)}><option value="">Choose a column…</option>{choices.map(choice => <option key={choice.id} value={choice.id}>{choice.name}</option>)}</Dropdown></label></> : <p>This column is empty.</p>}{error && <p role="alert">{error}</p>}<footer><button type="button" onClick={close}>Cancel</button><button type="submit" className="notebook-column-delete" disabled={count > 0 && !target}>Delete column</button></footer></form></dialog>
}
function ColumnMenu({ name, hideAggregation, edit, toggleAggregation, hide, remove, canRemove, moveLeft, moveRight }: { moveLeft?: () => void; moveRight?: () => void; name: string; hideAggregation: boolean; edit: () => void; toggleAggregation: () => void; hide: () => void; remove?: () => void; canRemove: boolean }) {
  const id = useId(), trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null)
  const dismiss = () => menu.current?.hidePopover()
  function place() {
    const button = trigger.current, panel = menu.current
    if (!button || !panel) return
    const rect = button.getBoundingClientRect(), height = panel.offsetHeight
    panel.style.left = `${Math.max(8, Math.min(rect.right - panel.offsetWidth, window.innerWidth - panel.offsetWidth - 8))}px`
    panel.style.top = `${Math.max(8, rect.bottom + height + 8 <= window.innerHeight ? rect.bottom + 5 : rect.top - height - 5)}px`
  }
  useEffect(() => { const reposition = () => { if (menu.current?.matches(':popover-open')) place() }; window.addEventListener('resize', reposition); window.addEventListener('scroll', reposition, true); return () => { window.removeEventListener('resize', reposition); window.removeEventListener('scroll', reposition, true) } }, [])
  const run = (action: () => void) => { dismiss(); action() }
  return <><button ref={trigger} type="button" className="notebook-column-options" aria-label={`Column options for ${name}`} aria-haspopup="menu" popoverTarget={id}>•••</button><div ref={menu} id={id} popover="auto" role="menu" aria-label={`Options for ${name}`} className="notebook-column-menu" onToggle={event => { if (event.newState === 'open') { place(); menu.current?.querySelector<HTMLButtonElement>('button')?.focus() } }} onKeyDown={event => {
    const items = [...(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || [])], index = items.indexOf(document.activeElement as HTMLButtonElement)
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) { event.preventDefault(); items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus() }
    if (event.key === 'Tab') dismiss()
  }}>
    <button type="button" role="menuitem" onClick={() => run(edit)}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m12 4 4 4M4 16l4-1 9-9-4-4-9 9-1 5Z" /></svg>Edit group</button>
    <button type="button" role="menuitem" onClick={() => run(toggleAggregation)}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 3 5 17M14 3l-2 14M3 7h14M2 13h14" /></svg>{hideAggregation ? 'Show aggregation' : 'Hide aggregation'}</button>
    <button type="button" role="menuitem" onClick={() => run(hide)}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m3 3 14 14M8 5c5-1 9 5 9 5l-2 3M12 15c-5 1-9-5-9-5l2-3M8 8a3 3 0 0 0 4 4" /></svg>Hide group</button>
    {(moveLeft || moveRight) && <><hr /><button type="button" role="menuitem" disabled={!moveLeft} onClick={() => moveLeft && run(moveLeft)}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m8 5-5 5 5 5M3 10h14" /></svg>Move left</button><button type="button" role="menuitem" disabled={!moveRight} onClick={() => moveRight && run(moveRight)}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m12 5 5 5-5 5M3 10h14" /></svg>Move right</button></>}
    {remove && <><hr /><button type="button" role="menuitem" className="notebook-column-menu-delete" disabled={!canRemove} title={!canRemove ? 'Keep at least one column' : undefined} onClick={() => run(remove)}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 5h14M7 5V3h6v2M5 5l1 12h8l1-12M8 8v6M12 8v6" /></svg>Delete group</button></>}
  </div></>
}
function BoardView({ records, config, change, cardDetails, previewFor, move, add, configure, addColumn, removeColumn, reorderColumn, allRecords = records }: { previewFor?: (record: ViewRecord) => ReturnType<typeof cardPreview>; cardDetails?: (record: ViewRecord) => ReactNode; reorderColumn?: (id: PersonalItem['status'], target: PersonalItem['status'], after?: boolean) => void; change: (patch: Partial<ViewConfig>) => void; allRecords?: ViewRecord[]; addColumn?: (column: BoardColumn) => string | void; removeColumn?: (status: PersonalItem['status'], target?: PersonalItem['status']) => string | void; records: ViewRecord[]; config: ViewConfig; configure?: (status: PersonalItem['status'], column: BoardColumn) => void; add?: (title: string, status: PersonalItem['status']) => string | void; move?: (id: string, status: PersonalItem['status'], targetId?: string, after?: boolean) => void }) {
  const dragging = useRef<string | null>(null), keyboardFocus = useRef<string | null>(null), board = useRef<HTMLDivElement>(null)
  useEffect(() => { if (keyboardFocus.current) { const card = [...(board.current?.querySelectorAll<HTMLElement>('article[data-card-id]') || [])].find(card => card.dataset.cardId === keyboardFocus.current); card?.focus(); keyboardFocus.current = null } }, [records])
  const [active, setActive] = useState<string | null>(null), [over, setOver] = useState<string | null>(null), [announcement, setAnnouncement] = useState(''), [insertion, setInsertion] = useState<{ id: string; after: boolean } | null>(null)
  const [creatingColumn, setCreatingColumn] = useState(false), [deletingColumn, setDeletingColumn] = useState<string | null>(null)
  const order = config.columnOrder || [...itemStatuses]
  const hidden = order.filter(id => config.hiddenColumns?.includes(id)), shownOrder = order.filter(id => !hidden.includes(id))
  const columnDrag = useRef<string | null>(null), columnFocus = useRef<string | null>(null)
  const [draggedColumn, setDraggedColumn] = useState<string | null>(null), [columnDrop, setColumnDrop] = useState<{ id: string; after: boolean } | null>(null)
  const canReorder = !!reorderColumn && config.group === 'status'
  useEffect(() => { if (columnFocus.current) { [...(board.current?.querySelectorAll<HTMLButtonElement>('[data-column-handle]') || [])].find(button => button.dataset.columnHandle === columnFocus.current)?.focus(); columnFocus.current = null } }, [config.columnOrder])
  const clearColumn = () => { columnDrag.current = null; setDraggedColumn(null); setColumnDrop(null) }
  useEffect(() => { if (!canReorder) clearColumn() }, [canReorder])
  function reorder(id: string, target: string, after = false) {
    if (canReorder) { reorderColumn!(id as PersonalItem['status'], target as PersonalItem['status'], after); setAnnouncement(`${boardColumn(id, config.columns).name} moved ${after ? 'after' : 'before'} ${boardColumn(target, config.columns).name}`) }
    clearColumn()
  }
  function nudgeColumn(id: string, direction: -1 | 1) {
    const target = shownOrder[shownOrder.indexOf(id as PersonalItem['status']) + direction]
    if (target) { columnFocus.current = id; reorder(id, target, direction === 1) }
  }
  const [columnSettings, setColumnSettings] = useState<string | null>(null)
  useEffect(() => { if (!configure) { setColumnSettings(null); setCreatingColumn(false); setDeletingColumn(null) } }, [!!configure])
  const columnName = (status: string) => config.group === 'status' ? boardColumn(status, config.columns).name : status
  const [newIn, setNewIn] = useState<string | null>(null), [newTitle, setNewTitle] = useState(''), [newError, setNewError] = useState('')
  useEffect(() => { if (!add) { setNewIn(null); setNewTitle(''); setNewError('') } }, [!!add])
  const canMove = !!move && config.group === 'status'
  const grouped = groupRecords(records.slice(0, 200), config.group)
  const groups = config.source === 'list' && config.group === 'status' ? shownOrder.map(label => grouped.find(group => group.label === label) || { label, items: [], count: 0 }) : grouped
  const cardPointer = useRef<{ id: string; pointer: number; x: number; y: number; moved: boolean; handle: HTMLButtonElement; target?: { status: PersonalItem['status']; id?: string; after?: boolean } } | null>(null)
  const clear = () => {
    const pointer = cardPointer.current; cardPointer.current = null
    if (pointer?.handle.hasPointerCapture(pointer.pointer)) pointer.handle.releasePointerCapture(pointer.pointer)
    dragging.current = null; setActive(null); setOver(null); setInsertion(null)
  }
  useEffect(() => { if (!canMove) clear() }, [canMove])
  const finish = (id: string, status: PersonalItem['status'], targetId?: string, after = false) => {
    const record = records.find(record => record.id === id)
    if (canMove && record) { move!(id, status, targetId, after); setAnnouncement(`${record.title} moved ${targetId ? `${after ? 'after' : 'before'} ${records.find(item => item.id === targetId)?.title || 'card'}` : `to ${columnName(status)}`}`) }
    clear()
  }
  return <><span className="sr-only" role="status">{announcement}</span><div ref={board} className="notebook-data-board" data-card-size={config.cardSize || 'medium'} data-image-fit={config.cardImageFit ? 'contain' : 'cover'}>{groups.map(group => <section key={group.label} aria-label={`${columnName(group.label)} column`} style={config.group === 'status' ? boardColumnStyle(boardColumn(group.label, config.columns)) as CSSProperties : undefined} data-status={config.group === 'status' ? group.label : undefined} className={`${over === group.label ? 'is-drop-target' : ''} ${draggedColumn === group.label ? 'is-column-dragging' : ''} ${columnDrop?.id === group.label ? columnDrop.after ? 'column-drop-after' : 'column-drop-before' : ''}`}
    onDragOver={event => { if (canReorder && columnDrag.current) { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'move'; const rect = event.currentTarget.getBoundingClientRect(); setColumnDrop(columnDrag.current === group.label ? null : { id: group.label, after: event.clientX > rect.left + rect.width / 2 }); const bounds = board.current?.getBoundingClientRect(); if (bounds && board.current) board.current.scrollLeft += event.clientX > bounds.right - 40 ? 18 : event.clientX < bounds.left + 40 ? -18 : 0; return } if (!canMove || !dragging.current) return; event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'move'; setOver(group.label); setInsertion(null) }}
    onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) { setOver(null); setColumnDrop(null) } }}
    onDrop={event => { if (canReorder && columnDrag.current) { event.preventDefault(); event.stopPropagation(); const rect = event.currentTarget.getBoundingClientRect(); reorder(columnDrag.current, group.label, event.clientX > rect.left + rect.width / 2); return } if (!canMove || !dragging.current) return; event.preventDefault(); event.stopPropagation(); finish(dragging.current, group.label as PersonalItem['status']) }}>
    <header><button type="button" className="notebook-board-column-handle" data-column-handle={group.label} aria-label={`Reorder ${columnName(group.label)} column`} title="Drag to reorder · Alt+Left/Right to move column" disabled={!canReorder} draggable={canReorder} onDragStart={event => { if (!canReorder) { event.preventDefault(); return } event.stopPropagation(); clear(); columnDrag.current = group.label; setDraggedColumn(group.label); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/x-ignis-board-column', group.label); const section = event.currentTarget.closest('section'); if (section) event.dataTransfer.setDragImage(section, 30, 16) }} onDragEnd={event => { event.stopPropagation(); clearColumn() }} onKeyDown={event => { if (event.key === 'Escape') { clearColumn(); return } if (canReorder && event.altKey && ['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); nudgeColumn(group.label, event.key === 'ArrowLeft' ? -1 : 1) } }}><Badge><i aria-hidden="true" />{columnName(group.label)}</Badge>{!config.hideAggregation && <span>{group.count}</span>}</button>{configure && config.group === 'status' && <ColumnMenu moveLeft={canReorder && shownOrder.indexOf(group.label as PersonalItem['status']) > 0 ? () => nudgeColumn(group.label, -1) : undefined} moveRight={canReorder && shownOrder.indexOf(group.label as PersonalItem['status']) < shownOrder.length - 1 ? () => nudgeColumn(group.label, 1) : undefined} name={columnName(group.label)} hideAggregation={!!config.hideAggregation} edit={() => setColumnSettings(group.label)} toggleAggregation={() => change({ hideAggregation: !config.hideAggregation })} hide={() => change({ hiddenColumns: [...hidden, group.label as PersonalItem['status']] })} canRemove={order.length > 1} remove={removeColumn ? () => setDeletingColumn(group.label) : undefined} />}</header>{group.items.map((record, index) => <article key={record.id} data-card-id={record.id} draggable={canMove} tabIndex={canMove ? 0 : undefined} aria-label={canMove ? `${record.title}, ${columnName(record.status)}. Alt+Left/Right to change status; Alt+Up/Down to reorder.` : undefined} className={`${active === record.id ? 'is-dragging' : ''} ${insertion?.id === record.id ? insertion.after ? 'drop-after' : 'drop-before' : ''}`}
      onDragOver={event => { if (!canMove || !dragging.current || dragging.current === record.id) return; event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'move'; setOver(group.label); const rect = event.currentTarget.getBoundingClientRect(); setInsertion({ id: record.id, after: event.clientY > rect.top + rect.height / 2 }) }}
      onDrop={event => { if (!canMove || !dragging.current) return; event.preventDefault(); event.stopPropagation(); const rect = event.currentTarget.getBoundingClientRect(); finish(dragging.current, group.label as PersonalItem['status'], record.id, event.clientY > rect.top + rect.height / 2) }}
      onDragStart={event => { event.stopPropagation(); if (!canMove) { event.preventDefault(); return } dragging.current = record.id; setActive(record.id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/x-ignis-board-card', record.id) }}
      onDragEnd={event => { event.stopPropagation(); clear() }}
      onKeyDown={event => { if (event.key === 'Escape') { clear(); return } if (!canMove || !event.altKey || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return; event.preventDefault(); event.stopPropagation(); if (['ArrowUp', 'ArrowDown'].includes(event.key)) { const target = group.items[index + (event.key === 'ArrowUp' ? -1 : 1)]; if (target) { keyboardFocus.current = record.id; finish(record.id, record.status as PersonalItem['status'], target.id, event.key === 'ArrowDown') } return } const next = shownOrder[shownOrder.indexOf(record.status as PersonalItem['status']) + (event.key === 'ArrowLeft' ? -1 : 1)]; if (next) { keyboardFocus.current = record.id; finish(record.id, next) } }}>
      <BoardCardImage record={record} preview={previewFor?.(record) || null} /><RecordTitle record={record} />{canMove && <span className="notebook-board-reorder"><button type="button" className="notebook-board-card-grip" aria-label={`Drag ${record.title}`} title="Drag to move card · Alt+arrows to move with keyboard" onPointerDown={event => {
        if (event.button !== 0) return
        event.preventDefault(); event.stopPropagation(); event.currentTarget.focus({ preventScroll: true })
        cardPointer.current = { id: record.id, pointer: event.pointerId, x: event.clientX, y: event.clientY, moved: false, handle: event.currentTarget }
        event.currentTarget.setPointerCapture(event.pointerId)
      }} onPointerMove={event => {
        const current = cardPointer.current
        if (!current || current.pointer !== event.pointerId || !canMove) return
        if (Math.hypot(event.clientX - current.x, event.clientY - current.y) > 4) current.moved = true
        if (!current.moved) return
        setActive(current.id)
        const bounds = board.current?.getBoundingClientRect()
        if (bounds && board.current) board.current.scrollLeft += event.clientX > bounds.right - 40 ? 18 : event.clientX < bounds.left + 40 ? -18 : 0
        const target = document.elementFromPoint(event.clientX, event.clientY), section = target?.closest<HTMLElement>('section[data-status]')
        current.target = undefined; setOver(null); setInsertion(null)
        if (!section || !board.current?.contains(section)) return
        const status = section.dataset.status as PersonalItem['status'], card = target?.closest<HTMLElement>('article[data-card-id]')
        if (card?.dataset.cardId === current.id) return
        const id = card?.dataset.cardId, rect = card?.getBoundingClientRect(), after = !!rect && event.clientY > rect.top + rect.height / 2
        current.target = { status, id, after }; setOver(status); if (id) setInsertion({ id, after })
      }} onPointerUp={event => {
        const current = cardPointer.current
        clear()
        if (current?.pointer === event.pointerId && current.moved && current.target) {
          keyboardFocus.current = current.id
          finish(current.id, current.target.status, current.target.id, current.target.after)
        }
      }} onPointerCancel={clear} onLostPointerCapture={() => { if (cardPointer.current) clear() }}><svg viewBox="0 0 16 20" aria-hidden="true" fill="currentColor">{[5, 10, 15].flatMap(y => [5, 11].map(x => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.2" />))}</svg></button></span>}{cardDetails?.(record)}</article>)}{!group.items.length && active && <div className="notebook-board-empty">Drop here</div>}{add && config.group === 'status' && (newIn === group.label ? <form className="notebook-board-new-task" onSubmit={event => { event.preventDefault(); const title = newTitle.trim(); if (!title) return; const issue = add(title, group.label as PersonalItem['status']); if (issue) { setNewError(issue); return } setNewTitle(''); setNewError(''); setNewIn(null) }} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setNewIn(null); setNewTitle(''); setNewError('') } }}><input autoFocus aria-label={`New task in ${columnName(group.label)}`} placeholder="Task name…" maxLength={500} value={newTitle} onChange={event => setNewTitle(event.target.value)} /><div><button type="submit" disabled={!newTitle.trim()}>Add task</button><button type="button" onClick={() => { setNewIn(null); setNewTitle(''); setNewError('') }}>Cancel</button></div>{newError && <p role="alert">{newError}</p>}</form> : <button type="button" className="notebook-board-add-task" aria-label={`New task in ${columnName(group.label)}`} onClick={() => { setNewIn(group.label); setNewTitle(''); setNewError('') }}><span aria-hidden="true">＋</span> New task</button>)}</section>)}{addColumn && config.group === 'status' && <button type="button" className="notebook-board-add-column" disabled={order.length >= 20} onClick={() => setCreatingColumn(true)}>＋ Add column</button>}</div>{hidden.length > 0 && config.group === 'status' && <div className="notebook-board-hidden"><span>Hidden groups</span>{hidden.map(id => <button key={id} type="button" disabled={!configure} aria-label={`Show ${columnName(id)} column`} onClick={() => change({ hiddenColumns: hidden.filter(value => value !== id) })}><i style={{ background: boardColors.find(color => color.id === boardColumn(id, config.columns).color)?.accent }} aria-hidden="true" />{columnName(id)}<span aria-hidden="true">＋</span></button>)}</div>}{creatingColumn && addColumn && <ColumnSettings create initial={{ name: 'New column', color: 'gray' }} close={() => setCreatingColumn(false)} save={column => { const issue = addColumn(column); if (!issue) setCreatingColumn(false); return issue }} />}{deletingColumn && removeColumn && <DeleteColumnDialog name={columnName(deletingColumn)} count={allRecords.filter(record => record.status === deletingColumn).length} choices={order.filter(id => id !== deletingColumn).map(id => ({ id, name: columnName(id) }))} close={() => setDeletingColumn(null)} remove={target => { const issue = removeColumn(deletingColumn as PersonalItem['status'], target); if (!issue) setDeletingColumn(null); return issue }} />}{columnSettings && configure && <ColumnSettings initial={{ ...boardColumn(columnSettings, config.columns), group: boardStatusGroup(columnSettings, config.columns) }} canRemove={order.length > 1} remove={removeColumn ? () => { setDeletingColumn(columnSettings); setColumnSettings(null) } : undefined} close={() => setColumnSettings(null)} save={column => { configure(columnSettings as PersonalItem['status'], column); setColumnSettings(null) }} />}</>
}
function GalleryView({ records }: { records: ViewRecord[] }) {
  return <div className="notebook-data-gallery">{records.slice(0, 200).map(record => <article key={record.id}>{record.cover ? <img src={record.cover} alt="" loading="lazy" /> : <div className="notebook-gallery-placeholder" aria-hidden="true">{record.title.slice(0, 1).toLocaleUpperCase()}</div>}<div><RecordTitle record={record} /><p><Badge>{record.statusLabel || record.status}</Badge>{record.date && <time>{record.date}</time>}</p></div></article>)}</div>
}
function FeedView({ records }: { records: ViewRecord[] }) {
  return <div className="notebook-data-feed">{records.slice(0, 200).map(record => <article key={record.id}><div><RecordTitle record={record} /><Badge>{record.statusLabel || record.status}</Badge></div>{record.description && <p>{record.description.slice(0, 300)}</p>}{record.date && <time dateTime={record.date}>{record.date}</time>}</article>)}</div>
}
function CalendarView({ records }: { records: ViewRecord[] }) {
  const [month, setMonth] = useState(() => new Date()), today = recordDay(new Date().toISOString())
  const key = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`
  const undated = records.filter(record => !record.date).length
  return <div className="notebook-data-calendar"><header><strong aria-live="polite">{month.toLocaleDateString('en', { month: 'long', year: 'numeric' })}</strong><div><button type="button" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button><button type="button" onClick={() => setMonth(new Date())}>Today</button><button type="button" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button></div></header><div className="notebook-view-scroll"><div className="notebook-calendar-week">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => <span key={day}>{day}</span>)}</div><div className="notebook-calendar-month">{calendarDays(month).map(day => <section key={day} className={`${day.startsWith(key) ? '' : 'is-other-month'} ${day === today ? 'is-today' : ''}`} aria-label={day}><time dateTime={day}>{Number(day.slice(-2))}</time>{recordsOnDay(records, day).map(record => <div key={record.id} title={record.title}><RecordTitle record={record} /></div>)}</section>)}</div></div>{undated > 0 && <p className="notebook-view-muted">{undated} {undated === 1 ? 'item has' : 'items have'} no date.</p>}</div>
}
function Chart({ records, config, kind = config.view }: { records: ViewRecord[]; config: ViewConfig; kind?: string }) {
  const groups = groupRecords(records, kind === 'line' ? 'day' : config.group).filter(group => kind !== 'line' || group.label !== 'No date').map(group => ({ ...group, label: config.group === 'status' && kind !== 'line' ? records.find(record => record.status === group.label)?.statusLabel || group.label : group.label, count: metricValue(group.items, config.metric) })).filter((group): group is typeof group & { count: number } => group.count !== null).slice(-30)
  const max = Math.max(1, ...groups.map(group => group.count))
  if (!groups.length) return <p className="notebook-view-empty">{config.metric === 'sum' ? 'No numeric values to chart.' : kind === 'line' ? 'No dated records to chart.' : 'No items to chart.'}</p>
  if (kind === 'horizontal-bar') return <div className="notebook-horizontal-chart" role="img" aria-label={groups.map(group => `${group.label}: ${group.count}`).join(', ')}>{groups.map(group => <div key={group.label}><span title={group.label}>{group.label}</span><div><i style={{ width: `${group.count / max * 100}%` }} /></div><b>{group.count}</b></div>)}</div>
  const width = 640, height = 210, left = 36, bottom = 174, available = width - left - 20
  const ticks = [...new Set([0, Math.ceil(max / 2), max])]
  const points = groups.map((group, i) => ({ ...group, x: left + (groups.length === 1 ? available / 2 : i / (groups.length - 1) * available), y: bottom - group.count / max * 145 }))
  return <div className="notebook-view-chart"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${kind === 'line' ? 'Line' : 'Bar'} chart: ${groups.map(group => `${group.label}: ${group.count}`).join(', ')}`}><title>Records by {kind === 'line' ? 'day' : config.group}</title>{ticks.map(tick => <g key={tick}><line x1={left} x2={width - 20} y1={bottom - tick / max * 145} y2={bottom - tick / max * 145} className="notebook-chart-grid" /><text x={left - 8} y={bottom - tick / max * 145 + 4} textAnchor="end">{tick}</text></g>)}{kind === 'line' ? <><polyline points={points.map(point => `${point.x},${point.y}`).join(' ')} fill="none" className="notebook-chart-line" />{points.map(point => <circle key={point.label} cx={point.x} cy={point.y} r="4" className="notebook-chart-fill"><title>{point.label}: {point.count}</title></circle>)}</> : groups.map((group, i) => <rect key={group.label} x={left + i * available / groups.length + 8} y={bottom - group.count / max * 145} width={Math.max(2, available / groups.length - 16)} height={group.count / max * 145} rx="3" className="notebook-chart-fill"><title>{group.label}: {group.count}</title></rect>)}{groups.map((group, i) => (groups.length <= 8 || i % Math.ceil(groups.length / 7) === 0) && <text key={group.label} x={kind === 'line' ? points[i].x : left + (i + .5) * available / groups.length} y="198" textAnchor={i === 0 ? 'start' : i === groups.length - 1 ? 'end' : 'middle'}>{/^\d{4}-\d{2}-\d{2}$/.test(group.label) ? group.label.slice(5) : group.label.length > 12 ? group.label.slice(-8) : group.label}</text>)}</svg></div>
}
function NumberView({ records, label = 'Total items', metric = 'count' }: { records: ViewRecord[]; label?: string; metric?: 'count' | 'sum' }) { return <div className="notebook-number-chart"><span>{metric === 'sum' ? 'Total value' : label}</span><strong>{metricValue(records, metric)?.toLocaleString() ?? '—'}</strong><small>{records.filter(record => record.done).length} completed</small></div> }
function Dashboard({ records, config }: { records: ViewRecord[]; config: ViewConfig }) {
  return <div className="notebook-data-dashboard"><div className="notebook-dashboard-metrics"><NumberView records={records} metric={config.metric} /><NumberView records={records.filter(record => !record.done)} label="Open items" /><NumberView records={records.filter(record => !!record.date)} label="With a date" /></div><Chart records={records} config={config} kind="horizontal-bar" /><TableView records={records.slice(0, 8)} /></div>
}
function ItemDialog({ initial, existing, editable, save, autosave, remove, close, properties = [], configureProperty, deleteProperty, task = false, columns, statuses = [...itemStatuses], propertyList, propertyLists = [], propertyAction, displayProperty, copyValue }: { displayProperty: (id: string, patch: PropertyDisplayPatch) => string | void; copyValue: (id: string) => string | void; propertyAction?: (action: PropertyMenuAction) => string | void; propertyList?: PersonalList; propertyLists?: PersonalList[]; properties?: PropertyDefinition[]; configureProperty?: (property: PropertyDefinition, value?: PropertyValue, approval?: string) => string | void; deleteProperty?: (id: string) => void; statuses?: PersonalItem['status'][]; columns?: BoardColumns | null; task?: boolean; initial: PersonalItem; existing: boolean; editable: boolean; save: (item: PersonalItem) => void; autosave?: (item: PersonalItem, patch: Partial<Omit<PersonalItem, 'id'>>) => string | void; remove: () => void; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), finish = useRef(close), title = useRef<HTMLTextAreaElement>(null)
  const [preferredWidth, setPreferredWidth] = useState(() => { try { const value = Number(localStorage.getItem('ignis.notebook.task-panel-width')); return Number.isFinite(value) && value >= 400 && value <= 1100 ? value : 720 } catch { return 720 } })
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth), [resizing, setResizing] = useState(false)
  const resizeStart = useRef({ x: 0, width: 720 }), widthRef = useRef(preferredWidth)
  const maxWidth = Math.max(400, Math.min(1100, viewportWidth - 240)), panelWidth = viewportWidth <= 767 ? viewportWidth : Math.max(400, Math.min(maxWidth, preferredWidth))
  function resizeTo(value: number) { const next = Math.max(400, Math.min(maxWidth, value)); widthRef.current = next; setPreferredWidth(next) }
  function rememberWidth() { try { localStorage.setItem('ignis.notebook.task-panel-width', String(widthRef.current)) } catch { /* Resizing remains available when browser storage is unavailable. */ } }
  useEffect(() => { const resize = () => setViewportWidth(window.innerWidth); window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize) }, [])
  const persistence = useContext(NotebookSaveStatus)
  const notebook = useContext(ViewData)
  const [noteEpoch, setNoteEpoch] = useState(0)
  const [historicalMetadata, setHistoricalMetadata] = useState<PersonalItem['metadata']>(null)
  const [item, setItem] = useState(initial), [error, setError] = useState(''), [invalid, setInvalid] = useState<Record<string, string>>({}), [closing, setClosing] = useState(false)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    dialog.current?.showModal()
    dialog.current?.querySelector<HTMLElement>(task && existing ? 'header button' : task ? 'textarea' : 'input')?.focus()
    return () => { if (previous?.isConnected) previous.focus({ preventScroll: true }) }
  }, [])
  useEffect(() => {
    if (!task || initial.metadata?.createdAt && initial.metadata?.editedAt || !propertyList) return
    const owner = notebook.lists.find(entry => entry.list.id === propertyList.id)?.owner
    if (!owner) return
    const request = new AbortController()
    void fetch(`/api/notebook/pages/${owner}/task-metadata`, { signal: request.signal }).then(response => response.ok ? response.json() : null).then(result => {
      const metadata = result?.[initial.id]
      if (request.signal.aborted || !metadata || !validItem({ ...initial, metadata })) return
      setHistoricalMetadata(metadata)
      const entry = notebook.lists.find(entry => entry.list.id === propertyList.id)
      if (entry && !entry.locked) notebook.changeList(propertyList.id, list => ({ ...list, items: list.items.map(item => item.id === initial.id ? { ...item, metadata: { ...metadata, ...item.metadata, createdAt: item.metadata?.createdAt || metadata.createdAt, editedAt: item.metadata?.editedAt || metadata.editedAt } } : item) }))
    }).catch(() => { /* An unavailable history leaves an honest empty value. */ })
    return () => request.abort()
  }, [initial.id, propertyList?.id])
  useEffect(() => { if (title.current) { title.current.style.height = 'auto'; title.current.style.height = `${title.current.scrollHeight}px` } }, [item.title, panelWidth])
  useEffect(() => { if (!closing) return; const timer = window.setTimeout(() => finish.current(), window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180); return () => window.clearTimeout(timer) }, [closing])
  const exit = (action = close) => { if (task && Object.keys(invalid).length && action === close) { setError('Some changes could not be saved. Fix them or discard the invalid changes.'); return } if (!task) { action(); return } if (closing) return; finish.current = action; setClosing(true) }
  function edit<K extends keyof Omit<PersonalItem, 'id'>>(key: K, value: PersonalItem[K]) {
    const next = { ...item, [key]: value }
    setItem(next)
    if (!task || !autosave || !editable) return
    let fieldValid = validItem({ ...initial, [key]: value })
    if (key === 'cover' && typeof value === 'string' && !value.startsWith('/api/notebook/cover-images/')) { try { const url = new URL(value); fieldValid = fieldValid && url.protocol === 'https:' && !!url.hostname } catch { fieldValid = false } }
    const issue = !fieldValid ? key === 'cover' ? 'Use a complete HTTPS image link.' : key === 'value' ? 'Enter a number between 0 and 1 trillion.' : 'Check this value.' : autosave(next, { [key]: value })
    setInvalid(previous => { const errors = { ...previous }; if (issue) errors[key] = issue; else delete errors[key]; return errors })
    setError('')
  }
  function editDescription(content: JSONContent) {
    if (!editable) return
    const patch = { descriptionContent: content, description: taskDescriptionText(content) }
    const next = { ...item, ...patch }
    setItem(next)
    if (!task || !autosave) return
    const issue = !validItem(next) ? 'This task note is too large or contains an unsupported block.' : autosave(next, patch)
    setInvalid(previous => { const errors = { ...previous }; if (issue) errors.descriptionContent = issue; else delete errors.descriptionContent; return errors })
    setError('')
  }
  function editProperty(id: string, value: PropertyValue) {
    const definition = properties.find(property => property.id === id)
    setItem(previous => ({ ...previous, properties: { ...previous.properties, [id]: value } }))
    const issue = !definition || !validPropertyValue(value, definition) ? 'Check the property value.' : autosave?.({ ...item, properties: { ...item.properties, [id]: value } }, { properties: { [id]: value } })
    setInvalid(previous => { const next = { ...previous }; if (issue) next[`property:${id}`] = issue; else delete next[`property:${id}`]; return next })
  }
  const Form = task ? 'div' : 'form'
  const titleControl = task ? <label className="notebook-task-title"><span className="sr-only">Name</span><textarea ref={title} rows={1} maxLength={500} placeholder="Untitled" className={boardStatusGroup(item.status, columns) === 'complete' ? 'is-completed' : undefined} value={item.title} readOnly={!editable} onChange={event => edit('title', event.target.value)} /></label> : <label>Name<input required maxLength={500} value={item.title} readOnly={!editable} onChange={event => edit('title', event.target.value)} /></label>
  return <dialog ref={dialog} className={`notebook-item-dialog ${task ? 'notebook-task-panel' : ''} ${closing ? 'is-closing' : ''} ${resizing ? 'is-resizing-task' : ''}`} style={task ? { width: panelWidth } : undefined} aria-label={existing ? task ? 'Edit task' : 'Edit item' : task ? 'New task' : 'New item'} onCancel={event => { event.preventDefault(); exit() }} onClick={event => { if (!task || event.target !== event.currentTarget) return; const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) exit() }}>
    {task && <div className="notebook-task-resize" role="separator" aria-label="Resize task panel" aria-orientation="vertical" aria-valuemin={400} aria-valuemax={maxWidth} aria-valuenow={panelWidth} tabIndex={0}
      title="Drag to resize · Left/Right arrow keys · Double-click to reset"
      onDoubleClick={() => { resizeTo(720); rememberWidth() }}
      onKeyDown={event => { if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); event.stopPropagation(); resizeTo(event.key === 'Home' ? 400 : event.key === 'End' ? maxWidth : panelWidth + (event.key === 'ArrowLeft' ? 20 : -20)); rememberWidth() }}
      onPointerDown={event => { event.preventDefault(); event.stopPropagation(); resizeStart.current = { x: event.clientX, width: panelWidth }; event.currentTarget.setPointerCapture(event.pointerId); setResizing(true) }}
      onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) resizeTo(resizeStart.current.width + resizeStart.current.x - event.clientX) }}
      onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); setResizing(false); rememberWidth() }}
      onLostPointerCapture={() => { setResizing(false); rememberWidth() }} />}
    <Form className={task ? 'notebook-task-form' : undefined} onSubmit={event => { event.preventDefault(); if (task) return; const next = { ...item, title: item.title.trim() || 'Untitled' }; if (!validItem(next)) { setError('Check the date, value, and image link. Use an HTTPS image URL.'); return } exit(() => save(next)) }}>
      <header>{task ? <><button type="button" aria-label="Close item editor" title="Close task" onClick={() => exit()}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 5 5-5 5m5-10 5 5-5 5" /></svg></button><span className="notebook-task-save-status" role="status">{Object.keys(invalid).length ? 'Check changes' : persistence.error ? 'Save needs attention' : persistence.status}</span>{editable && existing && <details className="notebook-task-actions"><summary aria-label="Task actions">•••</summary><div><button type="button" className="notebook-item-delete" disabled={closing} onClick={() => exit(remove)}>Delete task</button></div></details>}</> : <><strong>{existing ? 'Item details' : 'New item'}</strong><button type="button" aria-label="Close item editor" onClick={() => exit()}>×</button></>}</header>
      <div className="notebook-item-body">
        {titleControl}
        <div className="notebook-item-fields">{task ? <>
          <CustomTaskProperties builtins={{status: <div className="notebook-task-property-row"><span className="notebook-property-name"><PropertyIcon type="status" />Status</span><div className="notebook-task-value"><TaskStatusPicker value={item.status} statuses={statuses} columns={columns} disabled={!editable} change={value => edit('status', value)} /></div></div>, date: <div className="notebook-task-property-row"><span className="notebook-property-name"><PropertyIcon type="date" />Date</span><div className="notebook-task-value"><TaskDatePicker value={item.date} disabled={!editable} change={value => edit('date', value)} /></div></div>, value: <div className="notebook-task-property-row">{propertyList ? <BuiltinValueProperty list={propertyList} editable={editable} display={displayProperty} duplicate={() => { const id = crypto.randomUUID(), issue = copyValue(id); if (!issue) setItem(previous => ({ ...previous, properties: { ...previous.properties, [id]: previous.value } })); return issue }} /> : <label htmlFor={`task-value-${item.id}`} className="notebook-property-name"><PropertyIcon type="number" />Value</label>}<div className="notebook-task-value"><NumberPropertyValue label={propertyList?.propertyDisplay?.value?.name || 'Value'} value={item.value} config={propertyList?.propertyDisplay?.value?.number} editable={editable} minimum={0} change={value => edit('value', value)} /></div></div>, image: <div className="notebook-task-property-row"><BuiltinImageProperty list={propertyList || { id: initial.id, name: 'Tasks', items: [item] }} editable={editable} display={displayProperty} /><div className="notebook-task-value"><TaskImagePicker value={item.cover} disabled={!editable} change={value => edit('cover', value)} /></div></div>}} display={displayProperty} schemaAction={action => {
            if (!propertyAction || !propertyList) return 'This board is unavailable.'
            if (action.kind === 'duplicate' && !action.newId) action = { ...action, newId: crypto.randomUUID() }
            const preview = applyPropertyMenuAction(propertyList, action), changed = preview.items.find(t => t.id === item.id)?.properties || {}
            const updates = Object.fromEntries(Object.entries(changed).filter(([id, value]) => JSON.stringify(value) !== JSON.stringify(propertyList.items.find(t => t.id === item.id)?.properties?.[id])))
            const issue = propertyAction(action)
            if (!issue) { setItem(previous => ({ ...previous, properties: { ...previous.properties, ...updates } })); setInvalid(previous => { const next = { ...previous }; Object.keys(updates).forEach(id => delete next[`property:${id}`]); return next }) }
            return issue
          }} item={{ ...item, metadata: { ...historicalMetadata, ...initial.metadata, createdAt: initial.metadata?.createdAt || historicalMetadata?.createdAt || null, editedAt: initial.metadata?.editedAt || historicalMetadata?.editedAt || null, createdBy: initial.metadata?.createdBy || historicalMetadata?.createdBy || null, editedBy: initial.metadata?.editedBy || historicalMetadata?.editedBy || null } }} list={propertyList || { id: initial.id, name: 'Board items', items: [item], properties }} lists={propertyLists} action={patch => { const next = { ...item, ...patch, properties: { ...item.properties, ...patch.properties } }; const issue = !validItem(next) ? 'Check the button settings.' : autosave?.(next, patch); if (issue) setError(issue); else { setItem(next); setError('') } }} definitions={properties} values={item.properties || {}} editable={editable} change={editProperty} configure={(property, value, approval) => {
            if (!configureProperty) return 'This board is unavailable.'
            const current = properties.find(p => p.id === property.id), changingType = current && current.type !== property.type
            if (changingType && invalid[`property:${property.id}`]) return 'Fix or discard this property’s unsaved value before changing its type.'
            const converted = changingType && propertyList ? planTaskPropertyChange(propertyList, property, propertyLists)?.items.find(t => t.id === item.id)?.properties?.[property.id] : undefined
            const creatingStatus = !current && property.type === 'status'
            if (creatingStatus && value === undefined) value = property.config?.defaultStatus || property.options[0] || null
            const issue = configureProperty(property, value, approval)
            if (!issue && (value !== undefined || changingType)) { setItem(previous => ({ ...previous, properties: { ...previous.properties, [property.id]: value !== undefined ? value : converted ?? null } })); setInvalid(previous => { const next = { ...previous }; delete next[`property:${property.id}`]; return next }) }
            return issue
          }} remove={id => { deleteProperty?.(id); setInvalid(previous => { const next = { ...previous }; delete next[`property:${id}`]; return next }); setItem(previous => { const values = { ...previous.properties }; delete values[id]; return { ...previous, properties: values } }) }} />
        </> : <><label>Status<Dropdown aria-label="Item status" value={item.status} disabled={!editable} onValueChange={selectedValue => edit('status', selectedValue as PersonalItem['status'])}>{statuses.map(status => <option key={status} value={status}>{boardColumn(status, columns).name}</option>)}</Dropdown></label><label>Date<input type="date" value={item.date || ''} readOnly={!editable} onChange={event => edit('date', event.target.value || null)} /></label><label>Value<input type="number" min="0" max="1000000000000" step="any" value={item.value ?? ''} readOnly={!editable} onChange={event => edit('value', event.target.value === '' ? null : Number(event.target.value))} /></label></>}</div>
        {task ? <section className="notebook-task-description notebook-task-rich-description" aria-label="Task notes"><PageEditor key={noteEpoch} label="Description" writingOnly page={{ id: item.id, parentId: null, title: item.title, locked: !editable, content: taskDescriptionDocument(item) }} pages={notebook.sourcePages} mutateLists={notebook.mutateLists} update={patch => { if (patch.content) editDescription(patch.content) }} /></section> : <label className="notebook-task-description"><span>Description</span><textarea rows={3} maxLength={5000} value={item.description} readOnly={!editable} onChange={event => { edit('description', event.target.value) }} /></label>}{!task && <label>Image link<input type="url" maxLength={2000} placeholder="https://…" value={item.cover || ''} readOnly={!editable} onChange={event => edit('cover', event.target.value || null)} /></label>}
        {(error || Object.keys(invalid).length > 0 || task && persistence.error) && <div className="notebook-task-errors" role="alert"><p>{error || Object.values(invalid)[0] || persistence.error}</p>{Object.keys(invalid).length > 0 && <button type="button" onClick={() => { if (invalid.descriptionContent) setNoteEpoch(epoch => epoch + 1); setItem(previous => { const next = { ...previous }; for (const key of Object.keys(invalid)) { if (key.startsWith('property:')) { const id = key.slice(9); next.properties = { ...next.properties, [id]: initial.properties?.[id] ?? null } } else { Object.assign(next, { [key]: initial[key as keyof PersonalItem] }); if (key === 'descriptionContent') next.description = initial.description } } return next }); setInvalid({}); setError('') }}>Discard invalid changes</button>}{task && persistence.error && <button type="button" onClick={persistence.retry}>Retry saving</button>}</div>}
      </div>
      {!task && <footer>{editable && existing && <button type="button" className="notebook-item-delete" onClick={remove}>Delete item</button>}<button type="button" onClick={() => exit()}>{editable ? 'Cancel' : 'Close'}</button>{editable && <button type="submit">Save item</button>}</footer>}
    </Form>
  </dialog>
}

type DataViewProps = { config: ViewConfig; editable: boolean; change: (patch: Partial<ViewConfig>) => void; fixed?: boolean; settingsTarget?: HTMLElement | null }
export function NotebookView({ editor, node, updateAttributes }: NodeViewProps) {
  const editable = useEditorState({ editor, selector: context => context.editor.isEditable })
  const config = (validViewConfig(node.attrs) ? node.attrs : defaultViewConfig('line')) as ViewConfig
  return <NodeViewWrapper data-type="viewBlock" contentEditable={false}><NotebookDataView config={config} editable={editable} change={patch => { if (editor.isEditable) updateAttributes(patch) }} /></NodeViewWrapper>
}
export function FixedNotebookView({ page, pages, mutateLists, update, changeHabits, changeReading, changeMoods, settingsTarget }: { changeMoods: (change: (entries: import('./moodModel').MoodEntry[]) => import('./moodModel').MoodEntry[]) => void; changeReading: (change: (data: import('./readingModel').ReadingData) => import('./readingModel').ReadingData) => void; changeHabits: (change: (habits: import('./habitsModel').Habit[]) => import('./habitsModel').Habit[]) => void; settingsTarget?: HTMLElement | null; page: Page; pages: Page[]; mutateLists: ListsMutation; update: (content: JSONContent) => void }) {
  if (page.kind === 'meds') return <MedsPage />
  if (page.kind === 'habits') return <HabitsPage page={page} change={changeHabits} changeReading={changeReading} changeMoods={changeMoods} />
  const view = page.kind as ViewConfig['view']
  const config = { ...defaultViewConfig(view), ...page.content.content?.[0]?.attrs, view } as ViewConfig
  return <NotebookViewsProvider pages={pages} content={page.content} pageId={page.id} mutateLists={mutateLists}><NotebookDataView key={page.id} fixed settingsTarget={settingsTarget} config={config} editable={!page.locked} change={patch => { if (!page.locked) update({ type: 'doc', content: [{ type: 'viewBlock', attrs: { ...config, ...patch, view } }] }) }} /></NotebookViewsProvider>
}
function ListDataEditor({ list, save, close }: { list?: PersonalList; save: (items: PersonalItem[], base?: PersonalList) => string | void; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), base = useRef(list)
  const [items, setItems] = useState<PersonalItem[]>(() => list?.items.map(item => ({ ...item })) || [{ ...blankItem(list), title: 'Item 1' }])
  const [error, setError] = useState('')
  useEffect(() => { dialog.current?.showModal() }, [])
  const patch = (id: string, value: Partial<PersonalItem>) => setItems(items => items.map(item => item.id === id ? { ...item, ...value } : item))
  return <dialog ref={dialog} className="notebook-data-editor" aria-label="Edit chart data" onCancel={close}><form onSubmit={event => { event.preventDefault(); const next = items.map(item => ({ ...item, title: item.title.trim() || 'Untitled' })); if (!next.every(validItem)) { setError('Check the dates and values. Values must be zero or greater.'); return } const issue = save(next, base.current); if (issue) setError(issue) }}>
    <header><div><h2>Edit data</h2><p>Each row is one item. Use dates for a line chart and numbers for totals.</p></div><button type="button" aria-label="Close data editor" onClick={close}>×</button></header>
    <div className="notebook-view-scroll"><table><thead><tr><th>Name</th><th>Value</th><th>Date</th><th>Status</th><th><span className="sr-only">Remove</span></th></tr></thead><tbody>{items.map((item, index) => <tr key={item.id}><td><input aria-label={`Row ${index + 1} name`} value={item.title} maxLength={500} onChange={event => patch(item.id, { title: event.target.value })} /></td><td><input aria-label={`Row ${index + 1} value`} type="number" min="0" max="1000000000000" step="any" value={item.value ?? ''} onChange={event => patch(item.id, { value: event.target.value === '' ? null : Number(event.target.value) })} /></td><td><input aria-label={`Row ${index + 1} date`} type="date" value={item.date || ''} onInput={event => patch(item.id, { date: event.currentTarget.value || null })} onChange={event => patch(item.id, { date: event.target.value || null })} /></td><td><Dropdown aria-label={`Row ${index + 1} status`} value={item.status} onValueChange={selectedValue => patch(item.id, { status: selectedValue as PersonalItem['status'] })}>{(list?.board?.order || itemStatuses).map(status => <option key={status} value={status}>{boardColumn(status, list?.board?.columns).name}</option>)}</Dropdown></td><td><button type="button" aria-label={`Remove row ${index + 1}`} onClick={() => setItems(items => items.filter(row => row.id !== item.id))}>×</button></td></tr>)}</tbody></table></div>
    <button type="button" disabled={items.length >= 1000} onClick={() => setItems(items => [...items, { ...blankItem(list), status: list?.board?.order[0] || 'To do' }])}>+ Add row</button>{error && <p role="alert">{error}</p>}<footer><button type="button" onClick={close}>Cancel</button><button type="submit">Save data</button></footer>
  </form></dialog>
}
export function NotebookDataView({ config: storedConfig, editable, change, fixed = false, settingsTarget }: DataViewProps) {
  const data = useContext(ViewData), newTaskId = useRef<string | null>(null)
  const selected = data.lists.find(entry => entry.list.id === storedConfig.collectionId)
  const definition = listBoard(selected?.list, storedConfig.columns)
  const config = { ...storedConfig, ...(selected?.list.board ? { columns: definition.columns, columnOrder: definition.order } : {}) }
  const [editing, setEditing] = useState<PersonalItem | null>(null), [creatingList, setCreatingList] = useState(false), [renamingList, setRenamingList] = useState(false), [listName, setListName] = useState(''), [settings, setSettings] = useState(false), [editData, setEditData] = useState(false)
  const settingsDialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { if (settings) settingsDialog.current?.showModal(); else settingsDialog.current?.close() }, [settings])
  useEffect(() => { if (!editable) { setEditData(false); setSettings(false); setEditing(null) } }, [editable])
  const source = config.source === 'list' ? { records: selected ? listRecords(selected.list) : [], loading: false, connected: true, error: config.collectionId && !selected ? 'This list is unavailable. Restore its source page from Trash to reconnect it.' : '' } : config.source === 'pages' ? { records: data.pages, loading: false, error: '', connected: true } : data[config.source]
  const records = visibleRecords(source.records, config), label = viewKinds.find(kind => kind.id === config.view)?.label || 'Chart'
  const own = config.source === 'list', canEditItems = editable && !!selected && !selected.locked
  const chart = ['line', 'horizontal-bar', 'vertical-bar', 'number'].includes(config.view)
  const fixedBoard = fixed && config.view === 'board'
  const canAddBoardItem = editable && own && config.view === 'board' && (canEditItems || !selected && !config.collectionId)
  function mutateBoard(mutation: (list: PersonalList) => PersonalList): string | void {
    if (!canAddBoardItem) return 'This board is locked or unavailable.'
    if (selected) data.changeList(selected.list.id, mutation)
    else { const next = mutation({ id: crypto.randomUUID(), name: 'Board items', items: [], board: definition }); const id = data.createList(next.name, next.items, next.board || undefined, next.properties || undefined); if (!id) return 'This page has reached its list limit.'; change({ source: 'list', collectionId: id }) }
  }
  const boardSettings = editable && config.view === 'board' ? <PropertyPopover label="Page view settings" trigger={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6M10 15v6" /></svg>}>{close => <BoardViewSettings config={config} list={selected?.list} change={change} close={close} />}</PropertyPopover> : null
  const existing = !!editing && !!selected?.list.items.some(item => item.id === editing.id)
  return <div className={`notebook-view-block ${fixed ? 'is-fixed-view' : ''} ${fixedBoard && settingsTarget && own ? 'has-title-actions' : ''}`}>
    <header className="notebook-view-heading"><strong>{fixedBoard ? '' : config.title || (fixed ? selected?.list.name || '' : label)}</strong><div className="notebook-view-header-actions">
      {editable && own && (!selected || canEditItems) && config.view !== 'board' && <button type="button" onClick={() => setEditData(true)}>{chart ? 'Edit data' : selected ? 'Edit items' : 'Add items'}</button>}
      {config.view !== 'board' && own && canEditItems && !chart && <button type="button" disabled={(selected?.list.items.length || 0) >= 1000} onClick={() => { const item = { ...blankItem(selected?.list), status: 'To do' as const }; newTaskId.current = item.id; setEditing(item) }}>+ New item</button>}
      {!own && config.source !== 'pages' && <button type="button" aria-label="Refresh view source" disabled={source.loading} onClick={data.refresh}>{source.loading ? 'Loading…' : '↻'}</button>}
      {boardSettings && (settingsTarget ? createPortal(boardSettings, settingsTarget) : boardSettings)}
      {editable && config.view !== 'board' && <button type="button" aria-label={fixed ? 'Page view settings' : 'Chart settings'} title="Settings" onClick={() => setSettings(true)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6M10 15v6" /></svg></button>}
    </div></header>
    {source.error && <p className="notebook-view-notice" role="alert">{source.error}</p>}
    {own && !selected && !fixed ? <div className="notebook-view-empty">{chart ? 'Add your data to draw this chart.' : 'Add items or choose an existing list in settings.'}</div> : <RecordAction.Provider value={own && selected ? id => { const item = selected.list.items.find(item => item.id === id); if (item) { newTaskId.current = null; setEditing(item) } } : null}>
      {source.loading && !source.records.length ? <p className="notebook-view-empty" role="status">Loading…</p> : config.view === 'number' ? <NumberView records={records} metric={config.metric} /> : !records.length && !['calendar', 'board', 'dashboard'].includes(config.view) ? <p className="notebook-view-empty">No items to display.</p> : config.view === 'table' ? <TableView records={records} /> : config.view === 'board' ? <BoardView records={records} previewFor={record => cardPreview(selected?.list.items.find(item => item.id === record.id), config.cardPreview ?? ((config.cardProperties || defaultCardProperties).includes('cover') ? 'cover' : 'none'), record.cover)} cardDetails={record => <BoardCardProperties record={record} edit={canEditItems && selected ? patch => data.changeList(selected.list.id, list => patchPersonalItem(list, record.id, patch)) : undefined} selected={config.cardProperties || defaultCardProperties} list={selected?.list} lists={data.lists.map(entry => entry.list)} />} config={config} change={change} reorderColumn={canAddBoardItem ? (id, target, after) => { mutateBoard(list => moveBoardColumn(list, definition, id, target, after)) } : undefined} allRecords={source.records} configure={canAddBoardItem ? (status, column) => { mutateBoard(list => ({ ...list, board: { ...(list.board || definition), columns: { ...(list.board || definition).columns, [status]: column } } })) } : undefined} addColumn={canAddBoardItem ? column => mutateBoard(list => addBoardColumn(list, definition, `column:${crypto.randomUUID()}`, column)) : undefined} removeColumn={canAddBoardItem ? (status, target) => { if ((selected?.list.items || []).some(item => item.status === status) && !target) return 'Choose where to move the tasks.'; return mutateBoard(list => deleteBoardColumn(list, definition, status, target)) } : undefined} add={canAddBoardItem ? (title, status) => { const item = { ...blankItem(selected?.list), title, status }; if (!selected) { const id = data.createList('Board items', [item]); if (!id) return 'This board has reached its list limit.'; change({ source: 'list', collectionId: id }); } else { if (selected.list.items.length >= 1000) return 'This board has reached its 1,000 task limit.'; data.changeList(selected.list.id, list => ({ ...list, items: [...list.items, item] })); } } : undefined} move={canEditItems ? (id, status, targetId, after) => { change({ sort: 'manual' }); data.changeList(selected!.list.id, list => moveBoardItem(list, id, status, targetId, after, config.sort === 'manual' ? undefined : records.map(record => record.id))) } : undefined} /> : config.view === 'gallery' ? <GalleryView records={records} /> : config.view === 'feed' ? <FeedView records={records} /> : config.view === 'calendar' ? <CalendarView records={records} /> : config.view === 'dashboard' ? <Dashboard records={records} config={config} /> : <Chart records={records} config={config} />}
    </RecordAction.Provider>}
    {records.length > 200 && ['table', 'board', 'gallery', 'feed'].includes(config.view) && <p className="notebook-view-muted">Showing the first 200 items.</p>}
    <dialog ref={settingsDialog} className="notebook-settings notebook-view-settings" aria-label="View settings" onCancel={() => setSettings(false)} onClose={() => setSettings(false)}><header><h2>{fixed ? 'Page settings' : 'Chart settings'}</h2><button type="button" aria-label="Close view settings" onClick={() => setSettings(false)}>×</button></header>
      {!fixedBoard && <label>Title<input aria-label="View title" value={config.title} maxLength={120} onChange={event => change({ title: event.target.value })} /></label>}
      {!fixed && chart && <label>Chart type<Dropdown aria-label="View layout" value={config.view} onValueChange={selectedValue => change({ view: selectedValue as ViewConfig['view'] })}>{viewKinds.filter(kind => ['line', 'horizontal-bar', 'vertical-bar', 'number'].includes(kind.id)).map(kind => <option key={kind.id} value={kind.id}>{kind.label}</option>)}</Dropdown></label>}
      {!fixedBoard && <label>Data source<Dropdown aria-label="View data source" value={config.source} onValueChange={selectedValue => change({ source: selectedValue as ViewSource })}><option value="list">My lists</option><option value="pages">Notebook pages</option><option value="tasks">TickTick tasks</option><option value="meetings">Calendar meetings</option></Dropdown></label>}
      {own && !fixedBoard && <><label>List<Dropdown aria-label="Choose a list" value={selected?.list.id || ''} onValueChange={selectedValue => change({ collectionId: selectedValue || null })}><option value="">Choose a list…</option>{data.lists.map(entry => <option key={entry.list.id} value={entry.list.id}>{entry.list.name}{entry.locked ? ' (locked)' : ''}</option>)}</Dropdown></label><div className="flex gap-2"><button type="button" onClick={() => { setCreatingList(true); setRenamingList(false); setListName('') }}>New list</button>{canEditItems && <button type="button" onClick={() => { setCreatingList(true); setRenamingList(true); setListName(selected!.list.name) }}>Rename list</button>}</div></>}
      {creatingList && !fixedBoard && <form onSubmit={event => { event.preventDefault(); if (renamingList && selected) data.changeList(selected.list.id, list => ({ ...list, name: listName.trim() || 'Untitled list' })); else { const id = data.createList(listName); if (id) change({ collectionId: id, source: 'list' }) } setCreatingList(false) }}><label>List name<input required maxLength={120} value={listName} onChange={event => setListName(event.target.value)} /></label><button type="submit">{renamingList ? 'Save list name' : 'Create list'}</button></form>}
      <label>Show<Dropdown aria-label="Filter records" value={config.filter} onValueChange={selectedValue => change({ filter: selectedValue as ViewConfig['filter'] })}><option value="all">All items</option><option value="open">Open</option><option value="done">Completed</option></Dropdown></label>
      <label>Order<Dropdown aria-label="Sort records" value={config.sort} onValueChange={selectedValue => change({ sort: selectedValue as ViewConfig['sort'] })}><option value="manual">Manual order</option><option value="title">Name ↑</option><option value="date">Date ↑</option></Dropdown></label>
      {['board', 'horizontal-bar', 'vertical-bar', 'dashboard'].includes(config.view) && <label>Group<Dropdown aria-label="Group records" value={config.group} onValueChange={selectedValue => change({ group: selectedValue as ViewConfig['group'] })}><option value="status">By status</option><option value="day">By day</option>{config.view !== 'board' && <option value="name">By name</option>}</Dropdown></label>}
      {(chart || config.view === 'dashboard') && own && <label>Calculate<Dropdown aria-label="Chart metric" value={config.metric || 'count'} onValueChange={selectedValue => change({ metric: selectedValue as 'count' | 'sum' })}><option value="count">Count items</option><option value="sum">Sum values</option></Dropdown></label>}
      <button type="button" onClick={() => change({ query: '', filter: 'all' })}>Reset filters</button><button type="button" onClick={() => setSettings(false)}>Done</button>
    </dialog>
    {editData && editable && (!selected || canEditItems) && <ListDataEditor list={selected?.list} close={() => setEditData(false)} save={(items, base) => { if (selected && base) { if (mergeDataEdits(selected.list, base, items).items.length > 1000) return 'This list has reached its 1,000 item limit. Remove a row before saving.'; data.changeList(selected.list.id, list => mergeDataEdits(list, base, items)); } else { const id = data.createList(config.title || (chart ? 'Chart data' : 'My items'), items); if (!id) return 'This page has reached its list limit. Choose an existing list in settings.'; change({ source: 'list', collectionId: id, metric: chart ? 'sum' : config.metric }) } setEditData(false) }} />}
    {editing && (selected || canAddBoardItem) && <ItemDialog displayProperty={(id, patch) => {
      if (!selected) return 'Add a task before customizing properties.'
      const next = updatePropertyDisplay(selected.list, id, patch)
      if (next === selected.list) return 'Use a unique property name, up to 60 characters.'
      return mutateBoard(list => updatePropertyDisplay(list, id, patch))
    }} copyValue={id => {
      if (!selected || duplicateValueProperty(selected.list, id) === selected.list) return 'This property could not be duplicated (30 properties maximum).'
      return mutateBoard(list => duplicateValueProperty(list, id))
    }} propertyAction={action => {
      if (!selected || applyPropertyMenuAction(selected.list, action) === selected.list) return 'This property could not be updated. Use a unique option name and keep at most 30 properties.'
      return mutateBoard(list => applyPropertyMenuAction(list, action))
    }} propertyList={selected?.list} propertyLists={data.lists.map(entry => entry.list)} properties={selected?.list.properties || []} configureProperty={(property, value, approval) => {
      const definitions = selected?.list.properties || [], current = definitions.find(p => p.id === property.id)
      if (!validPropertyDefinitions(current ? definitions.map(p => p.id === property.id ? property : p) : [...definitions, property])) return 'Choose a unique name and valid options (up to 30 properties).'
      if (selected && upsertTaskProperty(selected.list, property, data.lists.map(entry => entry.list), approval) === selected.list) return current?.type !== property.type ? 'Review this type change again; task values may have changed.' : 'Some tasks use those options. Keep used options or clear their values first.'
      const createTask = value !== undefined && !!editing && newTaskId.current === editing.id
      if (createTask) newTaskId.current = null
      return mutateBoard(list => { const next = upsertTaskProperty(list, property, data.lists.map(entry => entry.list), approval); if (value === undefined || !editing) return next; if (createTask && !next.items.some(item => item.id === editing.id)) return next.items.length < 1000 ? { ...next, items: [...next.items, { ...editing, properties: { ...editing.properties, [property.id]: value } }] } : next; return patchPersonalItem(next, editing.id, { properties: { [property.id]: value } }) })
    }} deleteProperty={id => { mutateBoard(list => removeTaskProperty(list, id)) }} statuses={definition.order} columns={config.columns} task={config.view === 'board'} key={editing.id} initial={selected?.list.items.find(item => item.id === editing.id) || editing} existing={existing} editable={canEditItems || canAddBoardItem} close={() => setEditing(null)} autosave={(item, patch) => {
      if (selected) {
        if (!canEditItems) return 'This task is locked.'
        if (!existing && newTaskId.current !== item.id) return 'This task no longer exists. Close the panel to continue.'
        if (!existing && selected.list.items.length >= 1000) return 'This board has reached its task limit.'
        newTaskId.current = null
        data.changeList(selected.list.id, list => existing ? patchPersonalItem(list, item.id, patch) : list.items.some(value => value.id === item.id) ? patchPersonalItem(list, item.id, patch) : { ...list, items: [...list.items, { ...editing, ...patch }] })
      } else {
        if (!canAddBoardItem) return 'This board is locked or unavailable.'
        const next = { ...editing, ...patch }, id = data.createList('Board items', [next], definition)
        if (!id) return 'This page has reached its list limit.'
        newTaskId.current = null
        change({ source: 'list', collectionId: id })
      }
    }} save={item => { if (!selected && canAddBoardItem) { const id = data.createList('Board items', [item]); if (id) { change({ source: 'list', collectionId: id }); setEditing(null) } return } if (!canEditItems || !selected) return; data.changeList(selected.list.id, list => ({ ...list, items: list.items.some(value => value.id === item.id) ? list.items.map(value => value.id === item.id ? item : value) : list.items.length < 1000 ? [...list.items, item] : list.items })); setEditing(null) }} remove={() => { if (canEditItems && selected) data.removeItem(selected.list.id, editing.id); setEditing(null) }} />}
  </div>
}
