import { useState } from 'react'
import { emptyFood, normalizeFoodState, type FoodState } from './foodModel'
const key = 'ignis.food.v1'
function loadFood() {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return { data: emptyFood, error: '' }
    const data = normalizeFoodState(JSON.parse(raw))
    if (!data) throw new Error('Invalid food data')
    return { data, error: '' }
  } catch { return { data: emptyFood, error: 'Saved food data could not be read. Changes will not overwrite it.' } }
}
export function useFood() {
  const [loaded] = useState(loadFood)
  const [data, setData] = useState(loaded.data)
  const [undoData, setUndoData] = useState<FoodState | null>(null)
  const [storageError, setStorageError] = useState(loaded.error)
  const [message, setMessage] = useState('')
  const persist = (next: FoodState) => {
    if (loaded.error) return
    try { localStorage.setItem(key, JSON.stringify(next)); setStorageError('') }
    catch { setStorageError('Browser storage is unavailable. These changes will be lost on reload.') }
  }
  const commit = (next: FoodState, feedback: string) => { setUndoData(data); setData(next); persist(next); setMessage(feedback) }
  const undo = () => { if (!undoData) return; setData(undoData); persist(undoData); setUndoData(null); setMessage('Change undone.') }
  return { data, commit, undo, canUndo: undoData !== null, storageError, message }
}
