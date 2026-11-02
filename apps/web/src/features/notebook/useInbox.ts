import { useCallback, useEffect, useRef, useState } from 'react'
export type Notification = { id: string; pageId: string | null; kind: 'reminder' | 'workspace'; title: string; body: string; createdAt: string; dueAt: string; readAt: string | null; archivedAt: string | null }
export type InboxStatus = 'inbox' | 'unread' | 'archived' | 'all'
export type InboxKind = '' | 'reminder' | 'workspace'
type InboxData = { items: Notification[]; unreadCount: number; nextCursor: string | null }
export async function inboxRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/notebook${path}`, { ...init, signal: init?.signal || AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json', ...init?.headers } })
  if (!response.ok) {
    const message = await response.json().catch(() => null)
    throw new Error(response.status === 401 || response.status === 403 ? 'Sign in to open your Inbox.' : typeof message?.detail === 'string' ? message.detail : 'Inbox is unavailable. Please retry.')
  }
  return response.json()
}
function checked(value: InboxData): InboxData {
  if (!Array.isArray(value?.items) || !Number.isInteger(value.unreadCount) || value.unreadCount < 0 || !(value.nextCursor === null || typeof value.nextCursor === 'string') || value.items.some(n => !n || typeof n.id !== 'string' || typeof n.title !== 'string' || typeof n.body !== 'string' || !['reminder', 'workspace'].includes(n.kind) || !Number.isFinite(Date.parse(n.dueAt)))) throw new Error('Inbox returned invalid data. Please retry.')
  return value
}
export function useInbox() {
  const [status, setStatus] = useState<InboxStatus>('inbox')
  const [kind, setKind] = useState<InboxKind>('')
  const [data, setData] = useState<InboxData>({ items: [], unreadCount: 0, nextCursor: null })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const request = useRef(0)
  const dataRef = useRef(data); dataRef.current = data
  const alive = useRef(true)
  const reload = useCallback(async (more = false) => {
    const version = ++request.current
    if (more || !dataRef.current.items.length) setLoading(true)
    const params = new URLSearchParams({ status })
    if (kind) params.set('kind', kind)
    if (more && dataRef.current.nextCursor) params.set('cursor', dataRef.current.nextCursor)
    try {
      const value = checked(await inboxRequest<InboxData>(`/inbox?${params}`))
      if (!alive.current || version !== request.current) return false
      setData(previous => ({ ...value, items: more ? [...previous.items, ...value.items.filter(item => !previous.items.some(p => p.id === item.id))] : value.items }))
      setError(''); return true
    } catch (error) { if (alive.current && version === request.current) setError(error instanceof Error ? error.message : 'Inbox is unavailable. Please retry.'); return false }
    finally { if (alive.current && version === request.current) setLoading(false) }
  }, [status, kind])
  useEffect(() => {
    alive.current = true; setData(previous => ({ ...previous, items: [], nextCursor: null })); setLoading(true); void reload()
    const poll = () => { if (!document.hidden) void reload() }
    const timer = window.setInterval(poll, 30000)
    window.addEventListener('focus', poll); document.addEventListener('visibilitychange', poll)
    return () => { alive.current = false; ++request.current; clearInterval(timer); window.removeEventListener('focus', poll); document.removeEventListener('visibilitychange', poll) }
  }, [reload])
  const refresh = useRef(reload); refresh.current = reload
  const saving = useRef(false)
  async function mutate(path: string, body: unknown, method = 'PATCH') {
    if (saving.current) return false
    saving.current = true; setBusy(true)
    try {
      await inboxRequest(path, { method, body: JSON.stringify(body) })
      const refreshed = await refresh.current()
      if (!refreshed && alive.current) setError('Your change was saved, but Inbox could not refresh. Retry to see the latest state.')
      return true
    } catch (error) { if (alive.current) setError(error instanceof Error ? error.message : 'Your change could not be saved. Please retry.'); return false }
    finally { saving.current = false; if (alive.current) setBusy(false) }
  }
  return { ...data, status, kind, setStatus, setKind, loading, error, busy, reload,
    change: (id: string, patch: { read?: boolean; archived?: boolean }) => mutate(`/inbox/${id}`, patch),
    markRead: () => { const ids = data.items.filter(n => !n.readAt).map(n => n.id); return ids.length ? mutate('/inbox/read', { ids }, 'POST') : Promise.resolve(true) } }
}
