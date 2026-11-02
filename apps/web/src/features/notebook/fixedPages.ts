import { duplicate, type Page } from './notebookModel.ts'
import { defaultViewConfig } from './viewModel.ts'
export const fixedPages = [
  { kind: 'board', id: '1d8d1aa0-1b11-4011-8011-111111111111', title: 'Tasks', icon: 'icon:grid' },
  { kind: 'meds', id: '1d8d1aa0-1b11-4011-8011-444444444444', title: 'Meds', icon: 'icon:heart' },
  { kind: 'habits', id: '1d8d1aa0-1b11-4011-8011-555555555555', title: 'Habits', icon: 'icon:target' },
] as const
export type FixedPageKind = typeof fixedPages[number]['kind']
export const isRetiredFixedPage = (page: Page) => page.kind === 'calendar' || page.kind === 'dashboard'
export const isFixedPage = (page: Page) => isRetiredFixedPage(page) || fixedPages.some(entry => entry.kind === page.kind)
export function openFixedPage(pages: Page[], kind: FixedPageKind): { pages: Page[]; id: string } {
  const definition = fixedPages.find(entry => entry.kind === kind)!
  const existing = pages.find(page => page.kind === kind && !page.deletedAt) || pages.find(page => page.id === definition.id)
  if (existing) return { pages: existing.deletedAt ? pages.map(page => page.id === existing.id ? { ...page, deletedAt: null } : page) : pages, id: existing.id }
  if (kind === 'meds') {
    const dashboard = pages.find(page => page.kind === 'dashboard' && !page.deletedAt)
    if (dashboard) {
      const copy = duplicate(pages, dashboard.id)
      const cloned = copy.pages.find(page => page.id === copy.id)!
      const content = structuredClone(cloned.content)
      // A fixed dashboard has one view; preserve its remapped list and layout.
      return { pages: [...pages, { ...cloned, ...definition, content, parentId: null, cover: null, locked: false }], id: definition.id }
    }
  }
  return { pages: [...pages, { ...definition, parentId: null, fullWidth: true, lists: [], content: { type: 'doc', content: [{ type: 'viewBlock', attrs: defaultViewConfig(kind === 'meds' || kind === 'habits' ? 'dashboard' : kind) }] } }], id: definition.id }
}
