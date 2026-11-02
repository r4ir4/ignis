import { isBlockPosition } from './blockDrop.ts'
import { Extension } from '@tiptap/core'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import { closeHistory } from '@tiptap/pm/history'
import { colorBlockTypes, validBlockColor, type BlockColor } from './blockPalette.ts'
export const BlockColors = Extension.create({
  name: 'blockColors',
  addGlobalAttributes() {
    return [{ types: colorBlockTypes, attributes: {
      textColor: {
        default: null,
        parseHTML: element => { const value = element.getAttribute('data-text-color'); return validBlockColor(value) ? value : null },
        renderHTML: attrs => attrs.textColor && validBlockColor(attrs.textColor) ? { 'data-text-color': attrs.textColor } : {},
      },
      backgroundColor: {
        default: null,
        parseHTML: element => { const value = element.getAttribute('data-background-color'); return validBlockColor(value) ? value : null },
        renderHTML: attrs => attrs.backgroundColor && validBlockColor(attrs.backgroundColor) ? { 'data-background-color': attrs.backgroundColor } : {},
      },
    } }]
  },
})
export function setBlockColor(state: EditorState, pos: number, kind: 'textColor' | 'backgroundColor', color: BlockColor | null): Transaction | null {
  if (!validBlockColor(color) || !isBlockPosition(state.doc, pos)) return null
  const node = state.doc.nodeAt(pos)
  if (!node || !colorBlockTypes.includes(node.type.name) || node.attrs[kind] === color) return null
  return closeHistory(state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, [kind]: color })).scrollIntoView()
}
