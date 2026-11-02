import { useEffect, useRef, useState } from 'react'
import { validPages, samePages, recoveredCopies, type Page, type Snapshot } from './notebookModel'

const POINTER = 'ignis.notebook.recovery-key.v1'
const CACHE = 'ignis.notebook.server-cache.v1'
const MIGRATED = 'ignis.notebook.browser-migrated.v1'
function stored(key: string | null) {
  try { return key ? JSON.parse(localStorage.getItem(key) || 'null') : null } catch { return null }
}
function pointer() {
  try { return sessionStorage.getItem(POINTER) } catch { return null }
}
export async function checked(response: Response): Promise<Snapshot> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    const error = new Error(typeof body.detail === 'string' ? body.detail : Array.isArray(body.detail) ? body.detail.map((item: { msg?: string }) => item.msg || 'Invalid page').join(' ') : 'Notebook could not be saved.') as Error & { status: number }
    error.status = response.status; throw error
  }
  const value = await response.json()
  if (!Number.isSafeInteger(value?.revision) || value.revision < 0 || !validPages(value?.pages)) throw new Error('Notebook storage returned an invalid response. Your browser copy is retained.')
  return value
}
export function useNotebook(initial: { pages: Page[]; error: string }) {
  const [pages, displayPages] = useState(initial.pages)
  const [status, setStatus] = useState('Opening notebook…')
  const [error, setError] = useState('')
  const [backupWarning, setBackupWarning] = useState('')
  const [loading, setLoading] = useState(true)
  const [conflict, setConflict] = useState(false)
  const [saved, setSaved] = useState(false)
  const [editorEpoch, setEditorEpoch] = useState(0)
  const data = useRef(initial.pages)
  const revision = useRef<number | null>(null)
  const generation = useRef(0)
  const dirty = useRef(true)
  const unconfirmed = useRef<{ revision: number; pages: Page[] }[]>([])
  const running = useRef(false)
  const connecting = useRef(false)
  const resolving = useRef(false)
  const bootSequence = useRef(0)
  const blocked = useRef(false)
  const mounted = useRef(true)
  const recoveryKey = useRef('')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const latestFlush = useRef<() => void>(() => {})

  function cacheConfirmed(value: Snapshot) {
    try {
      localStorage.setItem(CACHE, JSON.stringify(value))
      localStorage.setItem(MIGRATED, 'true')
      localStorage.removeItem(recoveryKey.current)
    } catch { /* Database confirmation does not depend on browser storage. */ }
  }
  function recover() {
    try { localStorage.setItem(recoveryKey.current, JSON.stringify({ pages: data.current, revision: revision.current, dirty: true, savedAt: new Date().toISOString() })); return true }
    catch { setError('Browser recovery is unavailable. Keep this tab open until the server confirms saving.'); return false }
  }
  function setPages(next: Page[] | ((items: Page[]) => Page[])) {
    data.current = typeof next === 'function' ? next(data.current) : next
    dirty.current = true
    generation.current++; displayPages(data.current); setSaved(false); recover()
    setStatus(blocked.current ? 'Resolve save conflict' : 'Unsaved changes')
    clearTimeout(timer.current); timer.current = setTimeout(() => latestFlush.current(), 600)
  }
  async function flush() {
    if (!dirty.current || running.current || resolving.current || blocked.current || revision.current === null || !mounted.current) return
    running.current = true
    setStatus('Saving…'); setError('')
    const sentGeneration = generation.current
    const sentPages = data.current
    const sentRevision = revision.current
    // Retain recent attempts across transport failures: any one may have committed.
    unconfirmed.current = [...unconfirmed.current, { revision: sentRevision, pages: sentPages }].slice(-10)
    const ticket = bootSequence.current
    try {
      const confirmed = await checked(await fetch('/api/notebook', { method: 'PUT', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: revision.current, pages: sentPages }) }))
      if (!mounted.current || ticket !== bootSequence.current) return
      unconfirmed.current = []
      revision.current = confirmed.revision
      if (sentGeneration === generation.current) {
        dirty.current = false; setSaved(true); setStatus('All changes saved')
        cacheConfirmed(confirmed)
      } else { recover(); timer.current = setTimeout(() => latestFlush.current(), 0) }
    } catch (cause) {
      if (!mounted.current || ticket !== bootSequence.current) return
      const message = cause instanceof Error ? cause.message : 'Connection lost. Your recovery copy is kept in this browser.'
      if ((cause as { status?: number }).status === 409) {
        // A response can be lost after a successful commit. Matching server content is an acknowledgement, not a conflict.
        try {
          const latest = await checked(await fetch('/api/notebook', { signal: AbortSignal.timeout(15000) }))
          if (!mounted.current || ticket !== bootSequence.current) return
          if (samePages(latest.pages, data.current) || unconfirmed.current.some(attempt => attempt.revision === sentRevision && samePages(latest.pages, attempt.pages))) {
            unconfirmed.current = []
            revision.current = latest.revision
            if (!samePages(latest.pages, data.current)) {
              recover(); timer.current = setTimeout(() => latestFlush.current(), 0); return
            }
            dirty.current = false; setSaved(true); setStatus('All changes saved'); setError('')
            cacheConfirmed(latest)
            return
          }
        } catch { /* Keep the recovery journal until the user resolves the conflict. */ }
        blocked.current = true; setConflict(true)
      }
      setSaved(false); setStatus('Not saved to server'); setError(message); recover()
    } finally { running.current = false }
  }
  latestFlush.current = () => { void flush() }

  async function connect(start = false) {
    if (!start && (blocked.current || connecting.current || resolving.current || running.current)) return
    connecting.current = true
    const ticket = start ? ++bootSequence.current : bootSequence.current
    setLoading(true); setError('')
    try {
      const remote = await checked(await fetch('/api/notebook', { signal: AbortSignal.timeout(15000) }))
      if (!mounted.current || ticket !== bootSequence.current) return
      setBackupWarning(remote.backupWarning || '')
      if (start) {
        // A browser with older standalone pages must not lose them when a server notebook already exists.
        try {
          if (remote.pages.length && !localStorage.getItem(MIGRATED)) {
            const legacy = JSON.parse(localStorage.getItem('ignis.tiptap.playground.v1') || 'null') as Page[] | null
            if (validPages(legacy) && legacy.some(p => !remote.pages.some(saved => saved.id === p.id && saved.title === p.title && saved.parentId === p.parentId && JSON.stringify(saved.content) === JSON.stringify(p.content)))) {
              localStorage.setItem(`ignis.notebook.recovery.${crypto.randomUUID()}`, JSON.stringify({ pages: legacy, revision: null, dirty: true, savedAt: new Date().toISOString() }))
            }
            localStorage.setItem(MIGRATED, 'true')
          }
        } catch { /* Original standalone storage is never removed or overwritten. */ }
        let pending: { pages: Page[]; revision: number | null; dirty: boolean } | null = null
        try {
          pending = stored(pointer())
        } catch { /* legacy copy remains available */ }
        // Rotate the journal key so duplicated/reloaded tabs never write the same recovery file.
        recoveryKey.current = `ignis.notebook.recovery.${crypto.randomUUID()}`
        try { sessionStorage.setItem(POINTER, recoveryKey.current) } catch { /* server saving remains available */ }
        if (pending?.dirty && validPages(pending.pages) && pending.pages.length) {
          data.current = pending.pages; displayPages(pending.pages); revision.current = !remote.pages.length && remote.revision === 0 ? 0 : pending.revision
          generation.current++
          if (samePages(remote.pages, pending.pages)) { revision.current = remote.revision; data.current = remote.pages; displayPages(remote.pages); dirty.current = false; setSaved(true); setStatus('All changes saved'); cacheConfirmed(remote); return }
          if (remote.revision !== revision.current) { blocked.current = true; setConflict(true); setError('A recovered draft differs from the latest server version. Choose how to continue.') }
          recover(); setStatus('Recovered browser draft')
        } else if (!remote.pages.length && remote.revision === 0) {
          revision.current = 0; recover(); setStatus('Importing browser pages…')
        } else {
          data.current = remote.pages; displayPages(remote.pages); revision.current = remote.revision
          dirty.current = false; setSaved(true); setStatus('All changes saved')
          cacheConfirmed(remote)
          return
        }
      } else if (revision.current === null) {
        if (remote.revision !== 0 || remote.pages.length) { blocked.current = true; setConflict(true); setError('Server pages already exist. Keep both copies or open the saved version.'); return }
        revision.current = remote.revision
      }
      await flush()
    } catch (cause) {
      if (!mounted.current || ticket !== bootSequence.current) return
      if (!recoveryKey.current) {
        recoveryKey.current = `ignis.notebook.recovery.${crypto.randomUUID()}`
        const pending = stored(pointer())
        const cached = stored(CACHE)
        const recovered = validPages(pending?.pages) ? pending : validPages(cached?.pages) ? cached : null
        if (recovered?.pages?.length) { data.current = recovered.pages; displayPages(data.current); revision.current = recovered.revision }
        try { sessionStorage.setItem(POINTER, recoveryKey.current) } catch { /* preserve original browser data */ }
      }
      recover(); setError(cause instanceof Error ? cause.message : 'Could not connect to notebook storage.'); setStatus('Offline · browser recovery only')
    } finally { if (mounted.current && ticket === bootSequence.current) { connecting.current = false; setLoading(false) } }
  }
  async function resolve(keepBoth: boolean, source = data.current) {
    if (running.current || connecting.current || resolving.current) return
    resolving.current = true
    clearTimeout(timer.current)
    setLoading(true)
    const ticket = bootSequence.current
    try {
      const remote = await checked(await fetch('/api/notebook', { signal: AbortSignal.timeout(15000) }))
      if (!mounted.current || ticket !== bootSequence.current) return
      // Never replace the only remaining copy if the browser cannot archive it.
      if (!recover()) throw new Error('Cannot retain your current draft in browser recovery. Download a browser copy and free browser storage before opening another version.')
      recoveryKey.current = `ignis.notebook.recovery.${crypto.randomUUID()}`
      try { sessionStorage.setItem(POINTER, recoveryKey.current) } catch { /* optional */ }
      unconfirmed.current = []
      revision.current = remote.revision; blocked.current = false; setConflict(false); setError(''); setEditorEpoch(value => value + 1)
      if (keepBoth) {
        const copies = recoveredCopies(source)
        setPages([...remote.pages, ...copies])
      } else { data.current = remote.pages; displayPages(remote.pages); dirty.current = false; setSaved(true); setStatus('Opened server version'); cacheConfirmed(remote) }
    } catch (cause) { if (mounted.current && ticket === bootSequence.current) setError(cause instanceof Error ? cause.message : 'Could not load server pages.') }
    finally {
      resolving.current = false
      if (mounted.current && ticket === bootSequence.current) {
        setLoading(false)
        // A failed resolution must not strand an already queued edit.
        timer.current = setTimeout(() => latestFlush.current(), 600)
      }
    }
  }
  useEffect(() => {
    mounted.current = true
    void connect(true)
    const online = () => { if (!blocked.current) void connect() }
    window.addEventListener('online', online)
    return () => { mounted.current = false; bootSequence.current++; clearTimeout(timer.current); window.removeEventListener('online', online) }
  }, [])
  useEffect(() => {
    if (saved) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [saved])
  function recoveries(): { key: string; savedAt: string; pages: Page[] }[] {
    const entries: { key: string; savedAt: string; pages: Page[] }[] = []
    try {
      for (const key of Object.keys(localStorage).filter(key => key.startsWith('ignis.notebook.recovery.'))) {
        try {
          const entry = JSON.parse(localStorage.getItem(key) || '{}')
          if (validPages(entry.pages) && entry.pages.length) entries.push({ key, savedAt: typeof entry.savedAt === 'string' ? entry.savedAt : '', pages: entry.pages })
        } catch { /* One corrupt journal must not hide other recovery copies. */ }
      }
    } catch { /* Browser storage may be unavailable. */ }
    return entries.sort((a, b) => b.savedAt.localeCompare(a.savedAt)).slice(0, 20)
  }
  return { pages, setPages, saved, loading, status, error, backupWarning, conflict, editorEpoch, retry: () => connect(), resolve, recoveries, restoreRecovery: (source: Page[]) => saved ? resolve(true, source) : Promise.resolve(setError('Save or resolve the open draft before recovering another browser copy.')) }
}
