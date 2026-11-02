import { Node, mergeAttributes } from '@tiptap/core'
import { Details, DetailsContent, DetailsSummary } from '@tiptap/extension-details'
import { TableKit } from '@tiptap/extension-table'

export const Callout = Node.create({
  name: 'callout', group: 'block', content: 'block+', defining: true,
  addAttributes: () => ({ icon: {
    default: 'emoji:💡',
    parseHTML: element => element.hasAttribute('data-callout-icon') ? element.getAttribute('data-callout-icon') || null : 'emoji:💡',
    renderHTML: attrs => ({ 'data-callout-icon': attrs.icon || '' }),
  } }),
  parseHTML: () => [{ tag: 'div[data-type="callout"]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'callout' }), 0],
  addKeyboardShortcuts() {
    return { Enter: () => this.editor.isActive('callout') && this.editor.state.selection.$from.parent.content.size === 0 ? this.editor.commands.lift('callout') : false }
  },
})
export const PageLink = Node.create({
  name: 'pageLink',
  addOptions: () => ({ titleFor: (_id: string): string | undefined => undefined }),
  group: 'block', atom: true, draggable: true,
  addAttributes: () => ({ pageId: { default: null }, title: { default: 'Untitled' } }),
  parseHTML: () => [{ tag: 'a[data-type="pageLink"]', getAttrs: el => ({ pageId: el.getAttribute('data-page-id'), title: el.textContent }) }],
  renderHTML({ node }) { return ['a', { 'data-type': 'pageLink', 'data-page-id': node.attrs.pageId, href: `#page=${encodeURIComponent(node.attrs.pageId || '')}`, contenteditable: 'false' }, `▤  ${this.options.titleFor(node.attrs.pageId) ?? node.attrs.title ?? 'Untitled'}`] },
  renderText: ({ node }) => node.attrs.title || 'Untitled',
})
export const writingExtensions = [
  Callout, PageLink, TableKit.configure({ table: { resizable: true } }),
  Details.configure({
    persist: true,
    renderToggleButton: ({ element, isOpen }) => {
      element.setAttribute('aria-label', isOpen ? 'Collapse details content' : 'Expand details content')
      element.setAttribute('aria-expanded', String(isOpen))
      if (!element.firstChild) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        svg.setAttribute('viewBox', '0 0 16 16')
        svg.setAttribute('aria-hidden', 'true')
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
        path.setAttribute('d', 'M4.5 2.5a.6.6 0 0 0-.9.52v9.96a.6.6 0 0 0 .9.52l8.3-4.98a.6.6 0 0 0 0-1.04z')
        svg.append(path)
        element.append(svg)
      }
    },
  }), DetailsSummary.extend({
    addAttributes() {
      return { ...this.parent?.(), headingLevel: {
        default: null,
        parseHTML: element => { const level = Number(element.getAttribute('data-heading-level')); return [1, 2, 3].includes(level) ? level : null },
        renderHTML: attrs => [1, 2, 3].includes(attrs.headingLevel) ? { 'data-heading-level': attrs.headingLevel, 'data-placeholder': `Heading ${attrs.headingLevel}`, role: 'heading', 'aria-level': attrs.headingLevel } : {},
      } }
    },
  }).configure({ HTMLAttributes: { 'data-placeholder': 'Toggle' } }), DetailsContent,
]
