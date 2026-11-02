import type { Page } from './notebookModel.ts'
export const fixedPages: readonly { kind: 'board'; id: string; title: string; icon: string }[] = []
export type FixedPageKind = 'board'
export const isRetiredFixedPage = (page: Page) => page.kind === 'calendar' || page.kind === 'dashboard' || page.kind === 'board' || page.kind === 'meds' || page.kind === 'habits' // tasks, meds and habits live on project.ignis.farm
export const isFixedPage = (page: Page) => isRetiredFixedPage(page) || fixedPages.some(entry => entry.kind === page.kind)
