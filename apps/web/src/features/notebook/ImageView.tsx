import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { NodeViewWrapper, useEditorState, type NodeViewProps } from '@tiptap/react'
import { closeHistory } from '@tiptap/pm/history'
import { addImageBeside, canAddImageBeside, imageWidth, resizeImage } from './imageSizing'
import { ImageInsertDialog } from './ImageInsertDialog'
import { blockDropKey } from './blockDrop'

export function ImageView({ editor, node, selected, getPos }: NodeViewProps) {
  const editable = useEditorState({ editor, selector: context => context.editor.isEditable })
  const root = useRef<HTMLDivElement>(null), image = useRef<HTMLImageElement>(null)
  const drag = useRef<{ pointer: number; x: number; width: number; next: number; available: number; ratio: number } | null>(null)
  const [preview, setPreview] = useState<number | null>(null)
  const [addingBeside, setAddingBeside] = useState(false)
  useEffect(() => { if (!editable) { drag.current = null; setPreview(null); setAddingBeside(false) } }, [editable])
  const available = () => root.current?.getBoundingClientRect().width || 0
  const ratio = () => {
    const img = image.current
    return img?.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1
  }
  function commit(width: number, aspect = ratio()) {
    const pos = getPos()
    if (!editor.isEditable || typeof pos !== 'number') return
    const tr = resizeImage(editor.state, pos, width, aspect)
    if (tr) { editor.view.dispatch(tr); editor.view.dispatch(closeHistory(editor.state.tr)) }
  }
  function start(event: PointerEvent<HTMLButtonElement>) {
    if (!editor.isEditable || event.button !== 0 || !available()) return
    event.preventDefault(); event.stopPropagation()
    const width = image.current?.getBoundingClientRect().width || 0
    drag.current = { pointer: event.pointerId, x: event.clientX, width, next: width, available: available(), ratio: ratio() }
    event.currentTarget.setPointerCapture(event.pointerId)
    setPreview(width)
  }
  function move(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current
    if (!current || current.pointer !== event.pointerId) return
    current.next = imageWidth(current.width + event.clientX - current.x, current.available)
    setPreview(current.next)
  }
  function finish(event: PointerEvent<HTMLButtonElement>, cancel = false) {
    const current = drag.current
    if (!current || current.pointer !== event.pointerId) return
    drag.current = null
    setPreview(null)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (!cancel && current.next !== current.width) commit(current.next, current.ratio)
  }
  const width = preview ?? node.attrs.width
  return <NodeViewWrapper ref={root} data-type="resizableImage" contentEditable={false} className={`notebook-resizable-image ${selected ? 'is-selected' : ''} ${preview !== null ? 'is-resizing-image' : ''}`}>
    <div className="notebook-image-frame" style={{ width: width ? `${width}px` : 'fit-content' }}>
      <img ref={image} src={node.attrs.src} alt={node.attrs.alt || ''} title={node.attrs.title || undefined} draggable={editable} data-drag-handle={editable ? '' : undefined} onDragStart={event => {
        const pos = getPos()
        if (!editor.isEditable || typeof pos !== 'number') { event.preventDefault(); return }
        // Tiptap's node-view handle selects the exact image and starts the native
        // move; register it with our column/drop preview instead of a URL drag.
        editor.view.dispatch(editor.state.tr.setMeta(blockDropKey, { source: pos }))
      }} />
      {editable && <button type="button" className="notebook-image-resize-handle" aria-label="Resize image" title="Drag to resize · Arrow keys adjust width" onPointerDown={start} onPointerMove={move} onPointerUp={event => finish(event)} onPointerCancel={event => finish(event, true)} onLostPointerCapture={event => finish(event, true)} onKeyDown={event => {
        if (event.key === 'Escape' && drag.current) { drag.current = null; setPreview(null); event.preventDefault(); event.stopPropagation(); return }
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
        event.preventDefault(); event.stopPropagation()
        const current = image.current?.getBoundingClientRect().width || 0
        commit(imageWidth(event.key === 'Home' ? 64 : event.key === 'End' ? available() : current + (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 50 : 10), available()))
      }}><span aria-hidden="true" /></button>}
    {editable && <div className="notebook-image-size-tools" role="group" aria-label="Image size" onMouseDown={event => event.preventDefault()}>
      {[25, 50, 100].map(percent => <button type="button" key={percent} aria-label={`Image width ${percent}%`} onClick={() => commit(imageWidth(available() * percent / 100, available()))}>{percent}%</button>)}
      <button type="button" aria-label="Add image beside" title="Add image beside" disabled={!canAddImageBeside(editor.state, getPos() ?? -1)} onClick={() => setAddingBeside(true)}>+ Image</button>
    </div>}
    </div>
    {addingBeside && editable && <ImageInsertDialog close={() => setAddingBeside(false)} insert={(src, alt) => {
      const pos = getPos()
      if (!editor.isEditable || typeof pos !== 'number') return
      const tr = addImageBeside(editor.state, pos, src, alt)
      if (!tr) throw new Error('This image row is full. Move an image out before adding another.')
      editor.view.dispatch(tr)
    }} />}
  </NodeViewWrapper>
}
