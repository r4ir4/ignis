import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
export function useStoredList<T>(key: string, initial: T[], validate: (value: unknown) => value is T): [T[], Dispatch<SetStateAction<T[]>>, string] {
  const [loaded] = useState(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw === null) return { data: initial, error: '' }
      const data: unknown = JSON.parse(raw)
      if (!Array.isArray(data) || !data.every(validate)) throw new Error('Invalid records')
      return { data: data as T[], error: '' }
    } catch { return { data: initial, error: 'Some saved check-ins could not be read. They will not be overwritten.' } }
  })
  const [data, setData] = useState(loaded.data)
  const [error, setError] = useState(loaded.error)
  useEffect(() => {
    if (loaded.error) return
    try { localStorage.setItem(key, JSON.stringify(data)); setError('') }
    catch { setError('Check-ins could not be saved. Garden changes may be lost on reload.') }
  }, [data, key, loaded.error])
  return [data, setData, error]
}
