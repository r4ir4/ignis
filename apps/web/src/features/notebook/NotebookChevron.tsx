/** Fixed geometry keeps dropdown indicators independent of the surrounding font. */
export function NotebookChevron({ direction = 'down' }: { direction?: 'down' | 'right' }) {
  return <svg className="notebook-chevron" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d={direction === 'down' ? 'm6 8 4 4 4-4' : 'm8 6 4 4-4 4'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
}
