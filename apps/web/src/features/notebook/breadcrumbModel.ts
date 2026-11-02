import type { Page } from './notebookModel'
export function pageTrail(pages: Page[], current: Page): Page[] {
  const byId = new Map(pages.filter(page => !page.deletedAt).map(page => [page.id, page]))
  const seen = new Set<string>(), trail: Page[] = []
  let page: Page | undefined = current
  while (page && !seen.has(page.id)) {
    seen.add(page.id); trail.unshift(page)
    page = page.parentId ? byId.get(page.parentId) : undefined
  }
  return trail
}
