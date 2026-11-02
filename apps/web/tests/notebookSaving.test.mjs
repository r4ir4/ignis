import test from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

// Execute the real hook with deterministic hooks, storage, timers and transport.
// No DOM or real user notebook is touched by these fault-injection tests.
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'react' && context.parentURL?.endsWith('/useNotebook.ts')) return { url: 'ignis-test:hooks', shortCircuit: true }
    if (specifier === './notebookModel') return next(`${specifier}.ts`, context)
    return next(specifier, context)
  },
  load(url, context, next) {
    if (url === 'ignis-test:hooks') return { format: 'module', source: 'export const useState = (...args) => globalThis.notebookHooks.useState(...args); export const useRef = (...args) => globalThis.notebookHooks.useRef(...args); export const useEffect = (...args) => globalThis.notebookHooks.useEffect(...args);', shortCircuit: true }
    return next(url, context)
  },
})
const { useNotebook } = await import('../src/features/notebook/useNotebook.ts')
const page = title => ({ id: '11111111-1111-4111-8111-111111111111', parentId: null, title, content: { type: 'doc', content: [{ type: 'paragraph' }] } })
const snapshot = (title, revision = 1) => ({ revision, pages: [page(title)] })
const json = (value, status = 200) => new Response(JSON.stringify(value), { status })
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
const storage = () => {
  const data = Object.create(null)
  return new Proxy(data, { get(target, key) {
    if (key === 'getItem') return k => target[k] ?? null
    if (key === 'setItem') return (k, v) => { target[k] = String(v) }
    if (key === 'removeItem') return k => { delete target[k] }
    return target[key]
  } })
}
function harness(request, local = storage(), session = storage()) {
  const originals = Object.fromEntries(['fetch', 'localStorage', 'sessionStorage', 'window', 'setTimeout', 'clearTimeout', 'notebookHooks'].map(key => [key, globalThis[key]]))
  const slots = [], effects = [], cleanups = [], timers = new Map()
  let cursor = 0, timerId = 0, result
  Object.assign(globalThis, { fetch: request, localStorage: local, sessionStorage: session, window: new EventTarget(), setTimeout: fn => { timers.set(++timerId, fn); return timerId }, clearTimeout: id => timers.delete(id) })
  globalThis.notebookHooks = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value }] },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial } },
    useEffect(fn, deps) { const i = cursor++; if (!slots[i] || deps.some((value, j) => value !== slots[i][j])) { slots[i] = deps; effects.push(() => { cleanups[i]?.(); cleanups[i] = fn() }) } },
  }
  function render() { cursor = 0; result = useNotebook({ pages: [page('Seed')], error: '' }); for (const fn of effects.splice(0)) fn(); return result }
  render()
  return {
    get state() { return render() }, local, session,
    async settle() { for (let i = 0; i < 15; i++) await new Promise(setImmediate); return render() },
    async tick() { const work = [...timers.values()]; timers.clear(); for (const fn of work) fn(); return this.settle() },
    close() { for (const fn of cleanups) fn?.(); Object.assign(globalThis, originals) },
  }
}

test('edits made during an in-flight save queue behind its confirmed revision', async () => {
  const first = deferred(), writes = []
  const h = harness(async (_url, init) => {
    if (!init?.method) return json(snapshot('Server'))
    const body = JSON.parse(init.body); writes.push(body)
    return writes.length === 1 ? first.promise : json(body)
  })
  try {
    await h.settle(); h.state.setPages([page('A')]); await h.tick()
    h.state.setPages([page('B')]); await h.tick()
    assert.equal(writes.length, 1)
    first.resolve(json(snapshot('A', 2))); await h.settle(); await h.tick()
    assert.deepEqual(writes.map(w => [w.revision, w.pages[0].title]), [[1, 'A'], [2, 'B']])
    assert.equal(h.state.saved, true)
  } finally { h.close() }
})

test('a lost commit response acknowledges the submitted draft and keeps later typing queued', async () => {
  let remote = snapshot('Server'), count = 0
  const first = deferred(), writes = []
  const h = harness(async (_url, init) => {
    if (!init?.method) return json(remote)
    const body = JSON.parse(init.body); writes.push(body)
    count++
    if (count === 1) return first.promise
    if (body.revision !== remote.revision) return json({ detail: 'Conflict' }, 409)
    remote = { ...body, revision: body.revision + 1 }; return json(remote)
  })
  try {
    await h.settle(); h.state.setPages([page('A')]); await h.tick()
    remote = snapshot('A', 2)
    h.state.setPages([page('B')]); await h.tick()
    first.resolve(json({ detail: 'Conflict' }, 409)); await h.settle(); await h.tick()
    assert.equal(h.state.conflict, false)
    assert.equal(h.state.saved, true)
    assert.equal(remote.pages[0].title, 'B')
    assert.equal(writes[1].revision, 2)
  } finally { h.close() }
})

test('a real tab conflict retains local changes and makes no blind overwrite', async () => {
  let remote = snapshot('Server')
  const h = harness(async (_url, init) => !init?.method ? json(remote) : json({ detail: 'Conflict' }, 409))
  try {
    await h.settle(); remote = snapshot('Other tab', 2)
    h.state.setPages([page('Local draft')]); await h.tick()
    assert.equal(h.state.conflict, true); assert.equal(h.state.saved, false)
    const conflictMessage = h.state.error
    await h.state.retry(); await h.settle()
    assert.equal(h.state.error, conflictMessage, 'Retry must keep conflict resolution visible')
    assert.equal(h.state.pages[0].title, 'Local draft')
    assert.ok(h.state.recoveries().some(entry => entry.pages[0].title === 'Local draft'))
    await h.state.resolve(false); await h.settle(); await h.tick()
    assert.equal(h.state.pages[0].title, 'Other tab'); assert.equal(h.state.saved, true)
    assert.equal(h.state.conflict, false)
  } finally { h.close() }
})

test('offline reload restores its journal, then retries without losing rich content', async () => {
  const local = storage(), session = storage()
  session.setItem('ignis.notebook.recovery-key.v1', 'ignis.notebook.recovery.previous')
  const draft = page('Offline draft'); draft.content.content[0].content = [{ type: 'text', text: 'Keep bold', marks: [{ type: 'bold' }] }]
  local.setItem('ignis.notebook.recovery.previous', JSON.stringify({ pages: [draft], revision: 1, dirty: true }))
  let offline = true, remote = snapshot('Server')
  const h = harness(async (_url, init) => {
    if (offline) throw new Error('Offline')
    if (!init?.method) return json(remote)
    remote = { ...JSON.parse(init.body), revision: 2 }; return json(remote)
  }, local, session)
  try {
    await h.settle(); assert.deepEqual(h.state.pages, [draft]); assert.equal(h.state.saved, false)
    offline = false; await h.state.retry(); await h.settle()
    assert.equal(h.state.saved, true); assert.deepEqual(remote.pages, [draft])
    assert.ok(local.getItem('ignis.notebook.recovery.previous'), 'Older recovery artifacts are preserved')
  } finally { h.close() }
})

test('malformed recovery trees are ignored without discarding the original journal', async () => {
  const local = storage(), session = storage(), broken = page('Broken')
  broken.parentId = broken.id
  session.setItem('ignis.notebook.recovery-key.v1', 'ignis.notebook.recovery.broken')
  local.setItem('ignis.notebook.recovery.broken', JSON.stringify({ pages: [broken], revision: 1, dirty: true }))
  const h = harness(async () => json(snapshot('Healthy server')), local, session)
  try {
    await h.settle(); assert.equal(h.state.pages[0].title, 'Healthy server')
    assert.equal(h.state.recoveries().length, 0)
    assert.ok(local.getItem('ignis.notebook.recovery.broken'))
  } finally { h.close() }
})

test('retry and recovery actions cannot replace pages while a write is pending', async () => {
  const pending = deferred(); let reads = 0
  const h = harness(async (_url, init) => {
    if (!init?.method) { reads++; return json(snapshot('Server')) }
    return pending.promise
  })
  try {
    await h.settle(); h.state.setPages([page('In flight')]); await h.tick()
    await h.state.retry(); await h.state.resolve(false)
    assert.equal(reads, 1)
    pending.resolve(json(snapshot('In flight', 2))); await h.settle()
    assert.equal(h.state.saved, true); assert.equal(h.state.pages[0].title, 'In flight')
  } finally { h.close() }
})

test('invalid server success never clears a browser recovery copy', async () => {
  const h = harness(async (_url, init) => json(init?.method ? { revision: 2, pages: [{ title: 'bad' }] } : snapshot('Server')))
  try {
    await h.settle(); h.state.setPages([page('Keep me')]); await h.tick()
    assert.equal(h.state.saved, false); assert.match(h.state.error, /invalid response/)
    assert.ok(h.state.recoveries().some(entry => entry.pages[0].title === 'Keep me'))
  } finally { h.close() }
})

test('retry recognizes an earlier committed request after a lost network response and more typing', async () => {
  let remote = snapshot('Server'), writes = 0
  const h = harness(async (_url, init) => {
    if (!init?.method) return json(remote)
    const body = JSON.parse(init.body); writes++
    if (writes === 1) { remote = { ...body, revision: 2 }; throw new Error('Response lost after commit') }
    if (body.revision !== remote.revision) return json({ detail: 'Conflict' }, 409)
    remote = { ...body, revision: body.revision + 1 }; return json(remote)
  })
  try {
    await h.settle(); h.state.setPages([page('A')]); await h.tick()
    assert.equal(h.state.saved, false)
    h.state.setPages([page('B')]); await h.tick(); await h.tick()
    assert.equal(h.state.conflict, false); assert.equal(h.state.saved, true)
    assert.equal(remote.pages[0].title, 'B'); assert.equal(remote.revision, 3)
  } finally { h.close() }
})

test('opening the server version refreshes the offline cache while archiving the conflicting draft', async () => {
  let remote = snapshot('Server')
  const h = harness(async (_url, init) => !init?.method ? json(remote) : json({ detail: 'Conflict' }, 409))
  try {
    await h.settle(); remote = snapshot('Latest server', 2)
    h.state.setPages([page('Keep this draft')]); await h.tick()
    await h.state.resolve(false); await h.settle()
    assert.deepEqual(JSON.parse(h.local.getItem('ignis.notebook.server-cache.v1')), remote)
    assert.ok(h.state.recoveries().some(entry => entry.pages[0].title === 'Keep this draft'))
  } finally { h.close() }
})

test('a recovered draft already committed on the server refreshes the offline cache without writing', async () => {
  const local = storage(), session = storage(), remote = snapshot('Recovered committed draft', 3)
  local.setItem('ignis.notebook.server-cache.v1', JSON.stringify(snapshot('Old cache')))
  session.setItem('ignis.notebook.recovery-key.v1', 'ignis.notebook.recovery.old')
  local.setItem('ignis.notebook.recovery.old', JSON.stringify({ pages: remote.pages, revision: 2, dirty: true }))
  const h = harness(async (_url, init) => { assert.ok(!init?.method); return json(remote) }, local, session)
  try {
    await h.settle(); assert.equal(h.state.saved, true)
    assert.deepEqual(JSON.parse(local.getItem('ignis.notebook.server-cache.v1')), remote)
  } finally { h.close() }
})

test('unavailable browser storage prevents discarding the only conflicting copy', async () => {
  let failStorage = false, remote = snapshot('Server')
  const local = storage(), normalWrite = local.setItem
  // Supply a storage facade because the basic storage helper exposes native-style methods.
  const quotaStorage = new Proxy(local, { get(target, key) { return key === 'setItem' ? (k, v) => { if (failStorage) throw new Error('Quota exceeded'); normalWrite(k, v) } : target[key] } })
  const h = harness(async (_url, init) => !init?.method ? json(remote) : json({ detail: 'Conflict' }, 409), quotaStorage)
  try {
    await h.settle(); failStorage = true; remote = snapshot('Other tab', 2)
    h.state.setPages([page('Only remaining copy')]); await h.tick()
    await h.state.resolve(false); await h.settle()
    assert.equal(h.state.pages[0].title, 'Only remaining copy')
    assert.equal(h.state.saved, false); assert.match(h.state.error, /Cannot retain/)
  } finally { h.close() }
})

test('unsaved-tab protection remains active while a reconnect is pending', async () => {
  let reads = 0
  const reconnect = deferred()
  const h = harness(async () => ++reads === 1 ? json(snapshot('Server')) : reconnect.promise)
  try {
    await h.settle(); h.state.setPages([page('Unconfirmed draft')])
    const retry = h.state.retry(); h.state
    const leave = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(leave)
    assert.equal(leave.defaultPrevented, true)
    reconnect.resolve(json(snapshot('Server'))); await retry; await h.settle()
  } finally { h.close() }
})

test('a corrupt journal cannot hide a healthy cached notebook during an offline reload', async () => {
  const local = storage(), session = storage()
  session.setItem('ignis.notebook.recovery-key.v1', 'ignis.notebook.recovery.corrupt')
  local.setItem('ignis.notebook.recovery.corrupt', '{invalid JSON')
  local.setItem('ignis.notebook.server-cache.v1', JSON.stringify(snapshot('Healthy cached pages')))
  const h = harness(async () => { throw new Error('Offline') }, local, session)
  try {
    await h.settle(); assert.equal(h.state.pages[0].title, 'Healthy cached pages')
    assert.equal(h.state.saved, false)
    assert.equal(local.getItem('ignis.notebook.recovery.corrupt'), '{invalid JSON')
  } finally { h.close() }
})
