export type PageCover = { url: string; position: number; author?: string | null; authorUrl?: string | null; sourceUrl?: string | null }
export function coverPositionAfterDrag(position: number, deltaY: number, overflow: number): number {
  return overflow > 0 ? Math.max(0, Math.min(100, position - deltaY / overflow * 100)) : position
}
export const coverGallery = [
  { url: '/field-notes/meadow.webp', label: 'Wildflower meadow' },
  { url: '/storybook/woodland-path.webp', label: 'Woodland path' },
]
export function safeCoverUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false
  if (coverGallery.some(item => item.url === value) || /^\/api\/notebook\/cover-images\/[a-f0-9]{64}\.webp$/.test(value)) return true
  try { const url = new URL(value); return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password } catch { return false }
}
export function validCover(value: unknown): value is PageCover {
  if (!value || typeof value !== 'object') return false
  const cover = value as PageCover
  return safeCoverUrl(cover.url) && Number.isFinite(cover.position) && cover.position >= 0 && cover.position <= 100 &&
    (cover.author == null || typeof cover.author === 'string' && cover.author.length <= 200) &&
    [cover.authorUrl, cover.sourceUrl].every(url => url == null || safeCoverUrl(url) && url.startsWith('https://'))
}
