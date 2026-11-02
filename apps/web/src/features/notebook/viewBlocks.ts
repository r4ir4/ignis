import { Node, mergeAttributes } from '@tiptap/core'
import { defaultViewConfig, validViewConfig } from './viewModel.ts'
export const ViewBlock = Node.create({
  name: 'viewBlock', group: 'block', atom: true, draggable: true,
  addAttributes: () => Object.fromEntries(Object.entries(defaultViewConfig('table')).map(([name, value]) => [name, { default: value, parseHTML: (el: HTMLElement) => { let parsed: unknown = el.getAttribute(`data-view-${name}`) ?? value; if (['columns', 'columnOrder', 'hiddenColumns', 'hideAggregation', 'cardProperties', 'cardSize', 'cardPreview', 'cardImageFit'].includes(name) && typeof parsed === 'string') { try { parsed = JSON.parse(parsed) } catch { parsed = value } } return validViewConfig({ ...defaultViewConfig('table'), [name]: parsed }) ? parsed : value }, renderHTML: (attrs: Record<string, unknown>) => ({ [`data-view-${name}`]: ['columns', 'columnOrder', 'hiddenColumns', 'hideAggregation', 'cardProperties', 'cardSize', 'cardPreview', 'cardImageFit'].includes(name) ? JSON.stringify(attrs[name]) : attrs[name] }) }])),
  parseHTML: () => [{ tag: 'div[data-type="viewBlock"]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'viewBlock' }), 'Ignis view'],
})
