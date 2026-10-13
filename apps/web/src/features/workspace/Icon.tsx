import type { CSSProperties, ReactNode } from 'react'

export type IconName = 'flame' | 'folder' | 'file' | 'search' | 'calendar' | 'panel' | 'plus' | 'chevron' | 'more' | 'edit' | 'check' | 'close' | 'settings' | 'grid' | 'book' | 'star'
const paths: Record<IconName, ReactNode> = {
  flame: <path d="M12 3c1 4-4 5-4 9a4 4 0 0 0 8 0c0-2-1-3-2-4 0 3-2 4-2 4 1-4 2-5 0-9Z" />,
  folder: <path d="M3 7V5h6l2 2h10v12H3V7Z" />,
  file: <><path d="M5 3h9l5 5v13H5Z" /><path d="M14 3v5h5" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4m10-4v4M3 10h18m-12 4h2m3 0h2m-7 3h2" /></>,
  panel: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  chevron: <path d="m9 5 7 7-7 7" />,
  more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
  edit: <><path d="m15 4 5 5-11 11H4v-5Z" /><path d="m12 7 5 5" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  settings: <><circle cx="12" cy="12" r="3" /><path d="m9 3-1 3-3 1-2 3 2 2-1 3 3 2 3-1 2 2 3-2v-3l3-2-1-3-3-1-1-3-4 1Z" /></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  book: <><path d="M3 4h7l2 2 2-2h7v15h-7l-2 2-2-2H3Z" /><path d="M12 6v15" /></>,
  star: <path d="m12 3 3 6 6 1-4 5 1 6-6-3-6 3 1-6-4-5 6-1Z" />,
}
export function Icon({ name, size = 18, style }: { name: IconName; size?: number; style?: CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}>{paths[name]}</svg>
}
