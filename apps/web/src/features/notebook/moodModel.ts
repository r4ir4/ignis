export const moods = [
  { id: 'happy', label: 'Happy', color: '#d88c99' },
  { id: 'excited', label: 'Excited', color: '#edbd65' },
  { id: 'okay', label: 'So-so', color: '#a9bc83' },
  { id: 'sad', label: 'Sad', color: '#b8a3d0' },
  { id: 'low', label: 'Low', color: '#c0a78b' },
  { id: 'angry', label: 'Angry', color: '#d87e70' },
] as const
export type Mood = typeof moods[number]['id']
export type MoodEntry = { date: string; mood: Mood }
export function validMoodEntries(value: unknown): value is MoodEntry[] {
 if (!Array.isArray(value) || value.length > 20000) return false
 const days = new Set<string>()
 return value.every(entry => {
  if (!entry || typeof entry.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date) || !Number.isFinite(Date.parse(entry.date)) || new Date(entry.date).toISOString().slice(0, 10) !== entry.date || days.has(entry.date) || !moods.some(mood => mood.id === entry.mood)) return false
  days.add(entry.date); return true
 })
}
export function paintMood(entries: MoodEntry[], date: string, mood: Mood | null, today: string): MoodEntry[] {
 if (date > today || !validMoodEntries([{ date, mood: mood || 'happy' }])) return entries
 const others = entries.filter(entry => entry.date !== date)
 return mood ? [...others, { date, mood }].sort((a, b) => a.date.localeCompare(b.date)) : others
}
