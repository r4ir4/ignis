/** Anchor controls to the first visible text line, rather than the whole block box. */
export function blockHandleRect(element: HTMLElement): DOMRect {
  const bounds = element.getBoundingClientRect()
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  let text: Node | null
  while ((text = walker.nextNode())) {
    if (text.parentElement?.closest('[contenteditable="false"], [aria-hidden="true"]')) continue
    const first = text.textContent?.search(/\S/) ?? -1
    if (first < 0) continue
    const range = document.createRange()
    range.setStart(text, first)
    range.setEnd(text, first + 1)
    const line = range.getClientRects()[0]
    if (line && line.height > 0) return new DOMRect(bounds.left, line.top, bounds.width, line.height)
  }
  // Empty paragraphs still have a line box; non-text blocks use their top edge.
  const style = getComputedStyle(element)
  const padding = parseFloat(style.paddingTop) || 0
  const border = parseFloat(style.borderTopWidth) || 0
  const lineHeight = parseFloat(style.lineHeight) || (parseFloat(style.fontSize) || 16) * 1.2
  return new DOMRect(bounds.left, bounds.top + padding + border, bounds.width, Math.min(lineHeight, Math.max(1, bounds.height - padding - border)))
}
