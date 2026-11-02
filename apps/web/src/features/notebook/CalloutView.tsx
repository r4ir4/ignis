import { NodeViewContent, NodeViewWrapper, useEditorState, type NodeViewProps } from '@tiptap/react'
import { closeHistory } from '@tiptap/pm/history'
import { PageIconPicker } from './PageIconPicker'

export function CalloutView({ editor, node, getPos }: NodeViewProps) {
  const editable = useEditorState({ editor, selector: context => context.editor.isEditable })
  return <NodeViewWrapper data-type="callout" data-text-color={node.attrs.textColor || undefined} data-background-color={node.attrs.backgroundColor || undefined}>
    <div className="notebook-callout-icon" contentEditable={false}>
      <PageIconPicker kind="callout" value={node.attrs.icon} readOnly={!editable} onChange={icon => {
        const pos = getPos()
        if (!editor.isEditable || typeof pos !== 'number') return
        const current = editor.state.doc.nodeAt(pos)
        if (current?.type.name === 'callout') editor.view.dispatch(closeHistory(editor.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, icon })))
      }} />
    </div>
    <NodeViewContent className="notebook-callout-content" />
  </NodeViewWrapper>
}
