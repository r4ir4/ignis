import { useEffect, useState } from 'react'
import { NodeViewWrapper, useEditorState, type NodeViewProps } from '@tiptap/react'
import { ImageInsertDialog } from './ImageInsertDialog'
import { gridImages, validImageGrid, type GridImage } from './imageGrid'
export function ImageGridView({ editor, node, updateAttributes }: NodeViewProps) {
  const editable = useEditorState({ editor, selector: context => context.editor.isEditable })
  const [slot, setSlot] = useState<number | null>(null)
  useEffect(() => { if (!editable) setSlot(null) }, [editable])
  const count = validImageGrid(node.attrs) ? node.attrs.count as number : 2
  const images = validImageGrid(node.attrs) ? node.attrs.images as GridImage[] : gridImages(count)
  return <NodeViewWrapper contentEditable={false} data-type="imageGrid" className={`notebook-image-grid grid-${count}`}>
    {images.map((image, index) => <figure key={index}>{image ? <><img src={image.url} alt={image.alt} loading="lazy" />{editable && <div className="notebook-grid-image-actions"><button type="button" aria-label={`Replace grid image ${index + 1}`} onClick={() => setSlot(index)}>Replace</button><button type="button" aria-label={`Remove grid image ${index + 1}`} onClick={() => updateAttributes({ images: images.map((item, i) => i === index ? null : item) })}>Remove</button></div>}</> : editable ? <button type="button" aria-label={`Add grid image ${index + 1}`} onClick={() => setSlot(index)}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="m3 17 5-5 4 4 4-6 5 7M8 7h.01" /></svg>Add image</button> : <div className="notebook-grid-empty" aria-label="Empty image slot" />}</figure>)}
    {slot !== null && editable && <ImageInsertDialog close={() => setSlot(null)} insert={(url, alt) => { if (editor.isEditable) updateAttributes({ images: images.map((item, i) => i === slot ? { url, alt } : item) }); setSlot(null) }} />}
  </NodeViewWrapper>
}
