// Notion-style page addresses: /my-page-title-6a5f5e66 (readable slug + short id), not /#page=<uuid>.
// Only the id decides which page opens; the slug is cosmetic and follows the title.
const SHORT = 8

export function slugify(title: string): string {
  return title.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/g, '')
}
export const shortId = (id: string) => id.replace(/-/g, '').slice(0, SHORT)
export function pagePath(page: { id: string; title: string }): string {
  const slug = slugify(page.title || '')
  return `/${slug ? `${slug}-` : ''}${shortId(page.id)}`
}
// Reads the page reference from a location: the new path form, or a legacy #page=<uuid> link.
export function tokenFromLocation(loc: { pathname: string; hash: string } = location): string {
  const legacy = new URLSearchParams(loc.hash.replace(/^#/, '')).get('page')
  if (legacy) return legacy
  let segment = ''
  try { segment = decodeURIComponent(loc.pathname.split('/').filter(Boolean)[0] || '') } catch { return '' }
  const tail = /(?:^|-)([0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{8})$/i.exec(segment)
  return tail ? tail[1].toLowerCase() : ''
}
export function matchesToken(page: { id: string }, token: string): boolean {
  if (!token) return false
  if (page.id === token) return true
  const compact = page.id.replace(/-/g, '').toLowerCase(), want = token.replace(/-/g, '').toLowerCase()
  return /^[0-9a-f]+$/.test(want) && (want.length === 32 ? compact === want : compact.startsWith(want) && want.length >= SHORT)
}
