import type { PersonalList } from './personalLists'
import { NotebookViewsProvider } from './NotebookView'
import { layoutBlockDefinitions, blockContainerTypes, structuralBlockTypes } from './blockCatalog'
import { layoutNodeExtensions, LayoutNavigation } from './layoutBlocks'
import { layoutNodeViews } from './LayoutViews'
import { CalloutView } from './CalloutView'
import { ImageView } from './ImageView'
import { ImageInsertDialog } from './ImageInsertDialog'
import { useEffect, useLayoutEffect, useRef, useState, useId, type ComponentProps } from 'react'
import { autoUpdate, computePosition, flip, offset, shift, size } from '@floating-ui/dom'
import { EditorContent, ReactNodeViewRenderer, useEditor, type Editor, type JSONContent } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import DragHandle from '@tiptap/extension-drag-handle-react'
import { TextSelection } from '@tiptap/pm/state'
import StarterKit from '@tiptap/starter-kit'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import Image from '@tiptap/extension-image'
import { Placeholder } from '@tiptap/extensions'
import { Callout, writingExtensions } from './writingBlocks'
import { BlockColors, setBlockColor } from './blockColors'
import { blockPalette, colorBlockTypes, type BlockColor } from './blockPalette'
import { blockStyles, blockStyle, canTurnInto, changeBlock, type BlockStyle } from './blockActions'
import { blockHandleRect } from './blockHandlePosition'
import { BlockDrop, blockDropKey, blockSelectionKey, selectBlockGroup } from './blockDrop'
import { moveBlock } from './moveBlock'
import './notebook.css'

import { type Page, duplicate } from './notebookModel'
// Stable plugin options prevent unregister/register cycles during selection updates.
const resizableImage = Image.extend({ addNodeView: () => ReactNodeViewRenderer(ImageView) })
const calloutRenderer = ReactNodeViewRenderer(CalloutView)
const editorWritingExtensions = writingExtensions.map(extension => extension.name === 'callout' ? Callout.extend({ addNodeView: () => calloutRenderer }) : extension)
const editorLayoutExtensions = layoutNodeExtensions.map(extension => { const view = layoutNodeViews[extension.name as keyof typeof layoutNodeViews]; return view ? extension.extend({ addNodeView: () => ReactNodeViewRenderer(view) }) : extension })
const nestedDrag = { defaultRules: false, edgeDetection: { edges: ['left' as const], threshold: 12, strength: 500 }, rules: [{ id: 'notebook-blocks', evaluate: ({ node, parent }: { node: { isBlock: boolean; type: { name: string } }; parent: { type: { name: string } } | null }) => node.isBlock && !!parent && blockContainerTypes.includes(parent.type.name) && !structuralBlockTypes.includes(node.type.name) ? 0 : 1000 }] }
const dragPosition = { placement: 'left' as const }
const bubblePosition = { placement: 'top' as const, offset: 10, flip: true, shift: { padding: 24 } }
const showTableMenu: ComponentProps<typeof BubbleMenu>['shouldShow'] = ({ editor, state }) => editor.isEditable && editor.isFocused && editor.isActive('table') && state.selection.empty
const showSelectionMenu: ComponentProps<typeof BubbleMenu>['shouldShow'] = ({ editor, state }) => editor.isEditable && editor.isFocused && state.selection instanceof TextSelection && !state.selection.empty && state.doc.textBetween(state.selection.from, state.selection.to).trim().length > 0
type Block = { label: string; hint: string; icon: string; section: 'Basic blocks' | 'Media' | 'Advanced blocks' | 'Layout' | 'Navigation' | 'Views'; shortcut?: string; aliases?: string; run: (editor: Editor) => void }
const blocks: Block[] = [
  { label: 'Text', icon: 'T', section: 'Basic blocks', hint: 'Just start writing with plain text.', run: e => { e.chain().focus().setParagraph().run() } },
  ...([1, 2, 3, 4] as const).map(level => ({ label: `Heading ${level}`, icon: `H${level}`, section: 'Basic blocks' as const, shortcut: '#'.repeat(level), hint: 'Give your writing a clear heading.', run: (e: Editor) => { e.chain().focus().setHeading({ level }).run() } })),
  { label: 'Bulleted list', icon: '☷', section: 'Basic blocks', shortcut: '-', aliases: 'bullet unordered', hint: 'Create a simple bulleted list.', run: e => { e.chain().focus().toggleBulletList().run() } },
  { label: 'Numbered list', icon: '≡', section: 'Basic blocks', shortcut: '1.', aliases: 'ordered', hint: 'Create a list with numbering.', run: e => { e.chain().focus().toggleOrderedList().run() } },
  { label: 'To-do list', icon: '☑', section: 'Basic blocks', shortcut: '[]', aliases: 'checklist task checkbox', hint: 'Keep track of tasks with a to-do list.', run: e => { e.chain().focus().toggleTaskList().run() } },
  { label: 'Toggle list', icon: '▸', section: 'Basic blocks', shortcut: '>', aliases: 'details collapse', hint: 'Hide content inside a collapsible toggle.', run: e => { e.chain().focus().insertContent({ type: 'details', attrs: { open: true }, content: [{ type: 'detailsSummary' }, { type: 'detailsContent', content: [{ type: 'paragraph' }] }] }).run() } },
  { label: 'Callout', icon: '☼', section: 'Basic blocks', hint: 'Make something stand out.', run: e => { e.chain().focus().wrapIn('callout').run() } },
  { label: 'Quote', icon: '❞', section: 'Basic blocks', shortcut: '"', hint: 'Capture a quote.', run: e => { e.chain().focus().toggleBlockquote().run() } },
  { label: 'Table', icon: '▦', section: 'Basic blocks', hint: 'Add a simple table.', run: e => { e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: false }).run() } },
  { label: 'Divider', icon: '—', section: 'Basic blocks', shortcut: '---', hint: 'Visually divide blocks.', run: e => { e.chain().focus().setHorizontalRule().run() } },
  ...([1, 2, 3] as const).map(level => ({ label: `Toggle heading ${level}`, icon: `▸ H${level}`, section: 'Advanced blocks' as const, shortcut: `${'#'.repeat(level)} >`, aliases: `collapse heading ${level}`, hint: 'Hide content beneath a collapsible heading.', run: (e: Editor) => { e.chain().focus().insertContent({ type: 'details', attrs: { open: true }, content: [{ type: 'detailsSummary', attrs: { headingLevel: level } }, { type: 'detailsContent', content: [{ type: 'paragraph' }] }] }).run() } })),
  { label: 'Code', icon: '‹›', section: 'Media', shortcut: '```', aliases: 'code block', hint: 'Capture a code snippet.', run: e => { e.chain().focus().toggleCodeBlock().run() } },
]
function SlashIcon({ block }: { block: Block }) {
  const paths: Record<string, string> = {
    'Text': 'M5 5h14M12 5v14M9 19h6',
    'Bulleted list': 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
    'Numbered list': 'M9 6h12M9 12h12M9 18h12M3 4h1v5M2 13c0-3 4-2 3 0l-3 4h3',
    'To-do list': 'M4 4h16v16H4zM8 12l3 3 6-6',
    'Toggle list': 'm8 5 8 7-8 7z',
    'Page': 'M5 3h9l5 5v13H5zM14 3v6h5M8 13h8M8 17h6',
    'Callout': 'M4 4h16v13h-9l-5 4v-4H4zM12 8v4M12 14h.01',
    'Quote': 'M4 7h6v6H4zM10 13c0 4-2 5-5 5M14 7h6v6h-6zM20 13c0 4-2 5-5 5',
    'Table': 'M3 4h18v16H3zM3 9h18M9 4v16M15 4v16M3 15h18',
    'Divider': 'M3 12h18',
    'Link to page': 'M5 14v7h14v-7M11 3h10v10M21 3 9 15',
    'Image': 'M3 4h18v16H3zM3 16l6-6 5 5 3-3 4 4M16 8h.01',
    'Code': 'm8 6-6 6 6 6M16 6l6 6-6 6M14 3l-4 18',
  }
  return <span className="notebook-slash-icon" aria-hidden="true">{paths[block.label] ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={paths[block.label]} /></svg> : block.icon}</span>
}
export function PageEditor({ page, pages, update, createPage, mutateLists, label = 'Page content', writingOnly = false }: { mutateLists: (owner: string, change: (lists: PersonalList[]) => PersonalList[]) => void; page: Page; pages: Page[]; update: (patch: Partial<Page>) => void; writingOnly?: boolean; label?: string; createPage?: (id: string, content: JSONContent) => void }) {
  const pageTitles = useRef(pages)
  pageTitles.current = pages
  const [slash, setSlash] = useState<{ from: number; to: number; query: string } | null>(null)
  const dismissedSlash = useRef<string | null>(null)
  const slashLocation = useRef<string | null>(null)
  const [selected, setSelected] = useState(0)
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkQuery, setLinkQuery] = useState('')
  const linkDialog = useRef<HTMLDialogElement>(null)
  const [imageOpen, setImageOpen] = useState(false)
  const [pastedImage, setPastedImage] = useState<File | null>(null)
  const actionId = useId(), choicesId = useId()
  const actionMenu = useRef<HTMLDivElement>(null)
  const actionButton = useRef<HTMLButtonElement>(null)
  const actionPos = useRef(-1)
  const [actionsOpen, setActionsOpen] = useState(false)
  const [turnInto, setTurnInto] = useState(false)
  const [colorOpen, setColorOpen] = useState(false)
  const imageAfter = useRef<number | null>(null)
  const hoveredBlock = useRef(-1)
  const insertAnchor = useRef<number | null>(null)
  const blockMenu = useRef<HTMLDivElement>(null)
  const keyboard = useRef<(event: KeyboardEvent) => boolean>(() => false)
  const editor = useEditor({
    extensions: [StarterKit.configure({ link: { openOnClick: false } }), TaskList, TaskItem.configure({ nested: true }), resizableImage, ...editorWritingExtensions.map(extension => extension.name === 'pageLink' ? extension.configure({ titleFor: (id: string) => pageTitles.current.find(p => p.id === id)?.title || 'Untitled' }) : extension), BlockColors, BlockDrop, ...editorLayoutExtensions, LayoutNavigation, Placeholder.configure({ placeholder: 'Write something, or type / for blocks…' })],
    content: page.content,
    editable: !page.locked,
    shouldRerenderOnTransaction: true,
    editorProps: { attributes: { 'aria-label': label, role: 'textbox', 'aria-multiline': 'true', spellcheck: 'true' }, handleKeyDown: (_view, event) => keyboard.current(event), handlePaste: (view, event) => {
      if (!view.editable) return false
      const file = Array.from(event.clipboardData?.files || []).find(file => file.type.startsWith('image/'))
      if (!file) return false
      imageAfter.current = null; setPastedImage(file); setImageOpen(true); return true
    } },
    onUpdate: ({ editor: e }) => { if (e.isEditable) update({ content: e.getJSON() }) },
    onTransaction: ({ editor: e }) => {
      const { $from, empty } = e.state.selection
      const text = $from.parent.textBetween(0, $from.parentOffset, '\n', '\ufffc')
      const match = empty && $from.parent.type.name === 'paragraph' && /(?:^|\s)\/([^/\n]*)$/.exec(text)
      if (match) {
        const from = $from.pos - match[1].length - 1
        slashLocation.current = `${from}:${$from.pos}:${match[1]}`
        if (dismissedSlash.current !== slashLocation.current) setSlash({ from, to: $from.pos, query: match[1] })
      }
      else if (empty && $from.parent.type.name === 'paragraph' && !$from.parent.content.size && insertAnchor.current === $from.start()) setSlash({ from: $from.pos, to: $from.pos, query: '' })
      else { insertAnchor.current = null; dismissedSlash.current = null; slashLocation.current = null; setSlash(null) }
    },
  })
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    if (editor.isEditable === !!page.locked) editor.setEditable(!page.locked)
    editor.view.dom.setAttribute('aria-readonly', String(!!page.locked))
    if (page.locked) { editor.view.dispatch(editor.state.tr.setMeta(blockSelectionKey, { positions: [], anchor: null, explicit: false })); setSlash(null); insertAnchor.current = null; setImageOpen(false); setLinkOpen(false); actionMenu.current?.hidePopover() }
  }, [editor, page.locked])
  const allChoices: Block[] = [
    ...blocks.filter(b => b.section === 'Basic blocks'),
    { label: 'Page', icon: '▤', section: 'Basic blocks', hint: 'Create a new nested page.', run: e => {
      const id = crypto.randomUUID()
      e.chain().focus().insertContent({ type: 'pageLink', attrs: { pageId: id, title: 'Untitled' } }).run()
      createPage?.(id, e.getJSON())
    } },
    { label: 'Link to page', icon: '↗', section: 'Basic blocks', hint: 'Link to an existing page.', run: () => { setLinkQuery(''); setLinkOpen(true) } },
    { label: 'Image', icon: '▧', section: 'Media', hint: 'Embed an image.', run: () => { imageAfter.current = null; setImageOpen(true) } },
    ...blocks.filter(b => b.section === 'Media'),
    ...blocks.filter(b => b.section === 'Advanced blocks'),
    ...layoutBlockDefinitions.map(definition => ({ label: definition.label, icon: definition.icon, hint: definition.hint, aliases: definition.aliases, section: definition.category, run: (e: Editor) => { e.chain().focus().insertContent(definition.create()).run() } })),
  ]
  const order = ['Text', 'Heading 1', 'Heading 2', 'Heading 3', 'Heading 4', 'Bulleted list', 'Numbered list', 'To-do list', 'Toggle list', 'Page', 'Callout', 'Quote', 'Table', 'Divider', 'Link to page', 'Image', 'Code', 'Toggle heading 1', 'Toggle heading 2', 'Toggle heading 3', ...layoutBlockDefinitions.map(definition => definition.label)]
  const choices = allChoices.filter(b => (createPage || b.label !== 'Page') && (!writingOnly || b.section !== 'Views')).sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label)).filter(b => `${b.label} ${b.aliases || ''}`.toLowerCase().includes(slash?.query.trim().toLowerCase() ?? ''))
  useEffect(() => {
    if (linkOpen) { linkDialog.current?.showModal(); linkDialog.current?.querySelector('input')?.focus() }
    else linkDialog.current?.close()
  }, [linkOpen])
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    editor.view.dispatch(editor.state.tr.setMeta('lockDragHandle', actionsOpen))
    return () => { if (!editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta('lockDragHandle', false)) }
  }, [editor, actionsOpen])
  useLayoutEffect(() => {
    const button = actionButton.current, menu = actionMenu.current
    if (!actionsOpen || !button || !menu) return
    let live = true, focused = false
    const stop = autoUpdate(button, menu, () => {
      void computePosition(button, menu, { strategy: 'fixed', placement: 'right-start', middleware: [offset(8), flip({ padding: 12 }), shift({ padding: 12 })] }).then(({ x, y }) => { if (live) { Object.assign(menu.style, { left: `${x}px`, top: `${y}px`, visibility: 'visible' }); if (!focused) { focused = true; menu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true }) } } })
    })
    return () => { live = false; stop() }
  }, [actionsOpen, turnInto, colorOpen])
  useEffect(() => setSelected(0), [slash?.query])
  useLayoutEffect(() => {
    const menu = blockMenu.current
    if (!editor || editor.isDestroyed || !slash || !menu) return
    let live = true
    const cursor = { contextElement: editor.view.dom, getBoundingClientRect: () => {
      const rect = editor.view.coordsAtPos(slash.to)
      return new DOMRect(rect.left, rect.top, 0, rect.bottom - rect.top)
    } }
    const position = () => {
      if (editor.isDestroyed) return
      void computePosition(cursor, menu, { strategy: 'fixed', placement: 'bottom-start', middleware: [
        offset(6), flip({ padding: 16 }), shift({ padding: 24 }),
        size({ padding: 16, apply: ({ availableHeight, elements }) => { elements.floating.style.maxHeight = `${Math.max(0, Math.min(440, availableHeight))}px` } }),
      ] }).then(({ x, y }) => { if (live) Object.assign(menu.style, { left: `${x}px`, top: `${y}px`, visibility: 'visible' }) })
    }
    const stop = autoUpdate(cursor, menu, position)
    return () => { live = false; stop() }
  }, [editor, slash?.from, slash?.to, slash?.query])
  useEffect(() => {
    if (!slash) return
    blockMenu.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [selected, slash?.query])
  useEffect(() => {
    if (!editor || editor.isDestroyed || !slash) return
    const dismiss = (event: PointerEvent) => {
      if (!editor.isDestroyed && event.target instanceof Node && !blockMenu.current?.contains(event.target) && !editor.view.dom.contains(event.target)) { dismissedSlash.current = slashLocation.current; insertAnchor.current = null; setSlash(null) }
    }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [editor, Boolean(slash)])
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    const dom = editor.view.dom
    if (slash && choices.length) { dom.setAttribute('aria-controls', choicesId); dom.setAttribute('aria-activedescendant', `${choicesId}-${Math.min(selected, choices.length - 1)}`) }
    else { dom.removeAttribute('aria-controls'); dom.removeAttribute('aria-activedescendant') }
  }, [editor, Boolean(slash), selected, choices.length])
  function choose(block: Block) {
    if (!editor || !slash) return
    insertAnchor.current = null
    editor.chain().focus().deleteRange({ from: slash.from, to: slash.to }).run()
    block.run(editor); setSlash(null)
  }
  keyboard.current = event => {
    if (event.isComposing || page.locked) return false
    if (event.altKey && event.shiftKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
      if (editor) {
        const tr = moveBlock(editor.state, event.key === 'ArrowUp' ? -1 : 1)
        if (tr) editor.view.dispatch(tr)
      }
      return true
    }
    if (!slash) return false
    if (event.key === 'Escape') { dismissedSlash.current = slashLocation.current; insertAnchor.current = null; setSlash(null); return true }
    if (choices.length && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      setSelected(i => (i + (event.key === 'ArrowDown' ? 1 : -1) + choices.length) % choices.length); return true
    }
    if (event.key === 'Enter' && choices.length) { choose(choices[Math.min(selected, choices.length - 1)]); return true }
    return false
  }
  if (!editor) return null
  function insertBlock() {
    if (!editor) return
    const { $from } = editor.state.selection
    const pos = hoveredBlock.current >= 0 ? hoveredBlock.current : $from.depth ? $from.before(1) : $from.pos
    const node = editor.state.doc.nodeAt(pos)
    if (!node) return
    const after = pos + node.nodeSize
    const tr = editor.state.tr.insert(after, editor.schema.nodes.paragraph.create())
    insertAnchor.current = after + 1
    tr.setSelection(TextSelection.create(tr.doc, after + 1))
    editor.view.dispatch(tr.scrollIntoView()); editor.view.focus()
  }
  function move(direction: -1 | 1) {
    if (!editor) return
    const tr = moveBlock(editor.state, direction)
    if (tr) { editor.view.dispatch(tr); editor.view.focus() }
  }
  function applyBlockAction(action: 'duplicate' | 'delete' | BlockStyle) {
    if (!editor || !editor.isEditable) return
    const tr = changeBlock(editor.state, actionPos.current, action)
    actionMenu.current?.hidePopover()
    if (tr) editor.view.dispatch(tr)
    editor.view.focus()
  }
  const tools = [
    { label: 'Bold', text: 'B', active: editor.isActive('bold'), run: () => editor.chain().focus().toggleBold().run() },
    { label: 'Italic', text: 'I', active: editor.isActive('italic'), run: () => editor.chain().focus().toggleItalic().run() },
    { label: 'Underline', text: 'U', active: editor.isActive('underline'), run: () => editor.chain().focus().toggleUnderline().run() },
    { label: 'Strikethrough', text: 'S', active: editor.isActive('strike'), run: () => editor.chain().focus().toggleStrike().run() },
    { label: 'Inline code', text: '<>', active: editor.isActive('code'), run: () => editor.chain().focus().toggleCode().run() },
    { label: 'Heading', text: 'H2', active: editor.isActive('heading', { level: 2 }), run: () => editor.chain().focus().toggleHeading({ level: 2 }).run() },
    { label: 'Bullet list', text: 'List', active: editor.isActive('bulletList'), run: () => editor.chain().focus().toggleBulletList().run() },
    { label: 'Checklist', text: 'To-do', active: editor.isActive('taskList'), run: () => editor.chain().focus().toggleTaskList().run() },
    { label: 'Quote', text: 'Quote', active: editor.isActive('blockquote'), run: () => editor.chain().focus().toggleBlockquote().run() },
  ]
  return <>
    <p className="sr-only">{page.locked ? 'Page locked. Text can be selected and copied. Unlock the page to edit.' : 'Select text to format. Use the plus to insert blocks, or the six-dot handle for block actions. Undo and redo use the standard keyboard shortcuts.'}</p>
    <div id={actionId} ref={actionMenu} popover="auto" className="notebook-block-actions" role="dialog" aria-label="Block actions" onToggle={event => { setActionsOpen(event.newState === 'open'); if (event.newState === 'closed') { setTurnInto(false); setColorOpen(false) } }}>
      {colorOpen ? <>
        <button type="button" onClick={() => setColorOpen(false)}>‹ Color</button>
        {(['textColor', 'backgroundColor'] as const).map(kind => <div key={kind} role="group" aria-label={kind === 'textColor' ? 'Text colors' : 'Background colors'}>
          <p className="notebook-color-label">{kind === 'textColor' ? 'Text color' : 'Background'}</p>
          {blockPalette.map(color => {
            const selectedColor = actionPos.current >= 0 ? editor.state.doc.nodeAt(actionPos.current)?.attrs[kind] ?? null : null
            const value = color.id === 'default' ? null : color.id
            return <button type="button" key={color.id} className="notebook-color-choice" aria-label={`${color.label} ${kind === 'textColor' ? 'text' : 'background'}`} aria-pressed={selectedColor === value} onClick={() => {
              if (!editor.isEditable) return
              const tr = setBlockColor(editor.state, actionPos.current, kind, value as BlockColor | null)
              actionMenu.current?.hidePopover()
              if (tr) editor.view.dispatch(tr)
              editor.view.focus()
            }}><span className="notebook-color-swatch" style={{ color: kind === 'textColor' ? color.text : 'var(--nb-ink)', backgroundColor: kind === 'backgroundColor' ? color.background : undefined }} aria-hidden="true">A</span>{color.label}{selectedColor === value && <span className="notebook-block-style-check" aria-hidden="true">✓</span>}</button>
          })}
        </div>)}
      </> : turnInto ? <>
        <button type="button" onClick={() => setTurnInto(false)}>‹ Turn into</button>
        <hr />
        {blockStyles.map(style => <button type="button" key={style.id} disabled={!canTurnInto(editor.state.doc.nodeAt(actionPos.current), style.id)} aria-pressed={blockStyle(editor.state.doc.nodeAt(actionPos.current)) === style.id} onClick={() => applyBlockAction(style.id)}><span aria-hidden="true">{style.icon}</span>{style.label}{blockStyle(editor.state.doc.nodeAt(actionPos.current)) === style.id && <span className="notebook-block-style-check" aria-hidden="true">✓</span>}</button>)}
      </> : <>
      <p>Block actions</p>
      <button type="button" disabled={!canTurnInto(actionPos.current >= 0 ? editor.state.doc.nodeAt(actionPos.current) : null)} onClick={() => setTurnInto(true)}><span aria-hidden="true">Aa</span>Turn into<span className="notebook-block-style-check" aria-hidden="true">›</span></button>
      <button type="button" disabled={actionPos.current < 0 || !colorBlockTypes.includes(editor.state.doc.nodeAt(actionPos.current)?.type.name || '')} onClick={() => setColorOpen(true)}><span aria-hidden="true">A</span>Color<span className="notebook-block-style-check" aria-hidden="true">›</span></button>
      <button type="button" onClick={() => applyBlockAction('duplicate')}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 8h13v13H8zM4 16H2V2h14v2" /></svg>Duplicate</button>
      <button type="button" className="notebook-block-delete" onClick={() => applyBlockAction('delete')}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" /></svg>Delete</button>
      <hr />
      <button type="button" onClick={() => { actionMenu.current?.hidePopover(); insertBlock() }}><span aria-hidden="true">＋</span>Insert block below</button>
      <button type="button" onClick={() => {
        const node = editor.state.doc.nodeAt(actionPos.current)
        if (node) { imageAfter.current = actionPos.current + node.nodeSize; setImageOpen(true) }
        actionMenu.current?.hidePopover()
      }}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h18v16H3zM3 17l6-6 4 4 3-3 5 5" /><circle cx="16" cy="8" r="1" /></svg>Insert image below</button>
      <hr />
      <button type="button" disabled={!moveBlock(editor.state, -1)} onClick={() => { move(-1); actionMenu.current?.hidePopover() }}><span aria-hidden="true">↑</span>Move up<kbd>⌥⇧↑</kbd></button>
      <button type="button" disabled={!moveBlock(editor.state, 1)} onClick={() => { move(1); actionMenu.current?.hidePopover() }}><span aria-hidden="true">↓</span>Move down<kbd>⌥⇧↓</kbd></button>
      <hr />
      <button type="button" disabled={!editor.can().undo()} onClick={() => { editor.chain().focus().undo().run(); actionMenu.current?.hidePopover() }}><span aria-hidden="true">↶</span>Undo<kbd>{navigator.platform.includes('Mac') ? '⌘Z' : 'Ctrl Z'}</kbd></button>
      <button type="button" disabled={!editor.can().redo()} onClick={() => { editor.chain().focus().redo().run(); actionMenu.current?.hidePopover() }}><span aria-hidden="true">↷</span>Redo<kbd>{navigator.platform.includes('Mac') ? '⇧⌘Z' : 'Ctrl Shift Z'}</kbd></button>
      </>}
    </div>
    <BubbleMenu editor={editor} className="notebook-bubble" role="group" aria-label="Selection formatting" updateDelay={0}
      options={bubblePosition} shouldShow={showSelectionMenu}>
      {tools.map(tool => <button key={tool.label} type="button" title={tool.label} aria-label={tool.label} aria-pressed={tool.active} onMouseDown={e => e.preventDefault()} onClick={tool.run}>{tool.text}</button>)}
    </BubbleMenu>
    {imageOpen && <ImageInsertDialog initialFile={pastedImage} insert={(src, alt) => {
      if (editor.isDestroyed || !editor.isEditable) return
      if (imageAfter.current !== null) editor.chain().focus().insertContentAt(imageAfter.current, { type: 'image', attrs: { src, alt } }).run()
      else editor.chain().focus().setImage({ src, alt }).run()
    }} close={() => { setImageOpen(false); setPastedImage(null); imageAfter.current = null; if (!editor.isDestroyed) editor.commands.focus() }} />}
    <div className="notebook-editor-surface">
      {!page.locked && (blockSelectionKey.getState(editor.state)?.positions.length || 0) > 1 && <div className="notebook-block-selection-status" role="status">{blockSelectionKey.getState(editor.state)!.positions.length} blocks selected <span>Drag a selected handle · Esc to clear</span></div>}
      {!page.locked && <DragHandle editor={editor} className="notebook-drag-handle" computePositionConfig={dragPosition} nested={nestedDrag}
        onElementDragStart={() => {
          const source = hoveredBlock.current
          if (source < 0) return
          const selected = blockSelectionKey.getState(editor.state)?.positions || []
          const sources = selected.includes(source) ? selected : [source]
          editor.view.dispatch(editor.state.tr.setMeta(blockDropKey, { source, sources }).setMeta(blockSelectionKey, { positions: sources, anchor: sources[0], explicit: true }))
        }}
        getReferencedVirtualElement={() => {
          if (hoveredBlock.current < 0 || editor.isDestroyed) return null
          const element = editor.view.nodeDOM(hoveredBlock.current)
          return element instanceof HTMLElement ? { contextElement: element, getBoundingClientRect: () => blockHandleRect(element) } : null
        }}
        onNodeChange={({ node, pos }) => { hoveredBlock.current = node ? pos : -1 }}>
        <button className="notebook-add-block" type="button" aria-label="Insert block below" aria-haspopup="listbox" title="Add a block below" draggable={false}
          onMouseDown={e => e.preventDefault()} onDragStart={e => { e.preventDefault(); e.stopPropagation() }} onClick={insertBlock}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M8 2v12M2 8h12" /></svg>
        </button>
        <button ref={actionButton} type="button" aria-label="Block actions; drag to reorder" aria-haspopup="dialog" aria-expanded={actionsOpen} popoverTarget={actionId} title="Drag to move · Shift-click to select a range · Cmd/Ctrl-click to add a block" onMouseDown={event => { if (event.shiftKey || event.metaKey || event.ctrlKey) event.preventDefault() }} onClick={event => {
          const pos = hoveredBlock.current
          if (pos >= 0 && (event.shiftKey || event.metaKey || event.ctrlKey)) { event.preventDefault(); event.stopPropagation(); actionMenu.current?.hidePopover(); editor.view.dispatch(selectBlockGroup(editor.state, pos, event.shiftKey)); return }
          const selected = blockSelectionKey.getState(editor.state)?.positions || []
          if (selected.length > 1 && selected.includes(pos)) { event.preventDefault(); return }
          editor.view.dispatch(editor.state.tr.setMeta(blockSelectionKey, { positions: [], anchor: pos, explicit: true }))
          if (hoveredBlock.current >= 0) { actionPos.current = hoveredBlock.current; editor.chain().focus().setNodeSelection(actionPos.current).run() }
        }}><svg width="16" height="20" viewBox="0 0 16 20" fill="currentColor" aria-hidden="true">{[5, 10, 15].flatMap(y => [5, 11].map(x => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.5" />))}</svg></button>
      </DragHandle>}
      <NotebookViewsProvider pages={pages} content={page.content} pageId={page.id} mutateLists={mutateLists}><EditorContent editor={editor} /></NotebookViewsProvider>
    </div>
    <dialog ref={linkDialog} className="notebook-image-dialog notebook-page-link-dialog" aria-label="Link to page" onCancel={event => { event.preventDefault(); event.stopPropagation(); setLinkOpen(false) }} onClose={() => setLinkOpen(false)}>
      <div className="notebook-dialog-heading"><strong>Link to page</strong><button type="button" aria-label="Close page picker" onClick={() => setLinkOpen(false)}>×</button></div>
      <input aria-label="Search pages to link" placeholder="Search pages…" value={linkQuery} onChange={event => setLinkQuery(event.target.value)} />
      <div className="notebook-page-link-results">{pages.filter(p => !p.deletedAt && p.id !== page.id && (p.title || 'Untitled').toLowerCase().includes(linkQuery.toLowerCase())).map(p => <button type="button" key={p.id} onClick={() => { setLinkOpen(false); editor.chain().focus().insertContent({ type: 'pageLink', attrs: { pageId: p.id, title: p.title || 'Untitled' } }).run() }}>▤ {p.title || 'Untitled'}</button>)}{!pages.some(p => !p.deletedAt && p.id !== page.id && (p.title || 'Untitled').toLowerCase().includes(linkQuery.toLowerCase())) && <p>No pages found.</p>}</div>
    </dialog>
    {!page.locked && <BubbleMenu editor={editor} pluginKey="notebook-table-menu" shouldShow={showTableMenu} options={bubblePosition}><div className="notebook-table-tools" role="toolbar" aria-label="Table actions" onMouseDown={e => e.preventDefault()}>
      <button type="button" onClick={() => editor.chain().focus().addRowAfter().run()}>Add row</button><button type="button" onClick={() => editor.chain().focus().addColumnAfter().run()}>Add column</button><button type="button" onClick={() => editor.chain().focus().toggleHeaderRow().run()}>Header row</button><button type="button" onClick={() => editor.chain().focus().deleteRow().run()}>Delete row</button><button type="button" onClick={() => editor.chain().focus().deleteColumn().run()}>Delete column</button><button type="button" onClick={() => editor.chain().focus().deleteTable().run()}>Delete table</button>
    </div></BubbleMenu>}
    {!page.locked && slash && <div ref={blockMenu} className="notebook-blocks" id={choicesId} role="listbox" aria-label="Choose a block">
      <div className="notebook-slash-items">
      {choices.length ? choices.map((block, i) => <div key={block.label}>
        {(i === 0 || choices[i - 1].section !== block.section) && <p className="notebook-slash-section">{block.section}</p>}
        <button id={`${choicesId}-${i}`} role="option" aria-label={block.label} aria-selected={i === selected} tabIndex={-1} type="button" title={block.hint} className={i === selected ? 'is-selected' : ''} onMouseDown={e => e.preventDefault()} onClick={() => choose(block)}><SlashIcon block={block} /><span className="notebook-slash-name">{block.label}</span>{block.shortcut && <span className="notebook-slash-shortcut" aria-hidden="true">{block.shortcut}</span>}</button>
      </div>) : <p className="notebook-slash-empty">No matching blocks.</p>}
      </div>
      <button type="button" className="notebook-slash-close" onMouseDown={e => e.preventDefault()} onClick={() => { dismissedSlash.current = slashLocation.current; insertAnchor.current = null; setSlash(null); editor.commands.focus() }}>Close menu <span>esc</span></button>
    </div>}
  </>
}

