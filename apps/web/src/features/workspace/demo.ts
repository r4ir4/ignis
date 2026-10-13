export type TaskGroup = 'Priority' | 'In progress' | 'Later'
export type Task = { id: number; title: string; group: TaskGroup; done: boolean }
export const initialTasks: Task[] = [
  { id: 1, title: 'Write down one thing to do today', group: 'Priority', done: false },
  { id: 2, title: 'Sketch the Ignis Farm homepage', group: 'In progress', done: false },
  { id: 3, title: 'Save one homepage reference', group: 'In progress', done: false },
  { id: 4, title: 'Clear a space to work', group: 'In progress', done: false },
  { id: 5, title: 'Sort the notes you want to keep', group: 'Later', done: false },
  { id: 6, title: 'Review this week’s plans', group: 'Later', done: false },
]
export const noteSamples: Record<string, string> = {
  'Daily notes': '# A place to begin\n\nA few thoughts, a small plan, and enough space to make sense of the day.\n\nWhat deserves my attention today?\n\nThis is sample content. Try writing something here.',
  'Loose notes': '# Loose notes\n\nKeep the ideas that do not have a home yet.\n\n• Something to explore\n• Something to remember\n• Something to come back to',
  'Reading list': '# Reading list\n\nA quiet place for books, articles, and the thoughts they leave behind.',
  'Ignis Farm': '# Ignis Farm\n\nAn early sketch of a personal workspace.\n\nStart with a clear place for tasks, notes, and the days between them.',
  'Personal': '# Personal\n\nA space for the things that matter outside of a project.',
  'Work': '# Work\n\nGather projects, next steps, and useful context in one place.',
  'Archive': '# Archive\n\nA home for finished work and notes you might want to revisit.',
}
