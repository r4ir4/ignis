import { Node, mergeAttributes } from '@tiptap/core'
export type GridImage = { url: string; alt: string } | null
const safeCount = (value: unknown) => [2, 3, 4].includes(Number(value)) ? Number(value) : 2
export const gridImages = (count: number): GridImage[] => Array(count).fill(null)
export function validImageGrid(attrs: Record<string, unknown> | undefined): boolean {
  return !!attrs && [2, 3, 4].includes(attrs.count as number) && Array.isArray(attrs.images) && attrs.images.length === attrs.count && attrs.images.every(image => image === null || image && typeof image.url === 'string' && image.url.length <= 2000 && (/^https?:\/\/[^\s]+$/i.test(image.url) || /^\/api\/notebook\/cover-images\/[a-f0-9]{64}\.webp$/.test(image.url)) && typeof image.alt === 'string' && image.alt.length <= 500)
}
export const ImageGrid = Node.create({
  name: 'imageGrid', group: 'block', atom: true, draggable: true,
  addAttributes: () => ({ count: { default: 2, parseHTML: el => safeCount(el.getAttribute('data-grid-count')), renderHTML: attrs => ({ 'data-grid-count': attrs.count }) }, images: { default: gridImages(2), parseHTML: el => { try { const attrs = { count: safeCount(el.getAttribute('data-grid-count')), images: JSON.parse(el.getAttribute('data-grid-images') || '[]') }; return validImageGrid(attrs) ? attrs.images : gridImages(attrs.count) } catch { return gridImages(2) } }, renderHTML: attrs => ({ 'data-grid-images': JSON.stringify(attrs.images) }) } }),
  parseHTML: () => [{ tag: 'div[data-type="imageGrid"]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'imageGrid' })],
})
