import test from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
registerHooks({
  resolve(specifier, context, next) { return specifier === 'react' && context.parentURL?.endsWith('/useInbox.ts') ? { url: 'ignis-inbox:hooks', shortCircuit: true } : next(specifier, context) },
  load(url, context, next) { return url === 'ignis-inbox:hooks' ? { format: 'module', source: ['useState','useRef','useEffect','useCallback'].map(name => `export const ${name} = (...args) => globalThis.inboxHooks.${name}(...args);`).join('\n'), shortCircuit: true } : next(url, context) },
})
const { useInbox } = await import('../src/features/notebook/useInbox.ts')
const row = (id = 'notice', readAt = null) => ({ id, pageId: null, kind: 'workspace', title: 'Backup notice', body: 'Kept in the database', dueAt: new Date().toISOString(), createdAt: new Date().toISOString(), readAt, archivedAt: null })
const data = (items, unreadCount = items.filter(n => !n.readAt && !n.archivedAt).length) => ({ items, unreadCount, nextCursor: null })
const json = value => new Response(JSON.stringify(value))
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
function harness(fetcher) {
  const originals = Object.fromEntries(['fetch','window','document','inboxHooks'].map(key => [key, globalThis[key]]))
  const slots = [], effects = [], cleanups = []
  let cursor = 0, state
  const timers = new Map()
  const window = Object.assign(new EventTarget(), { setInterval: fn => { const id = timers.size + 1; timers.set(id, fn); return id } })
  const document = Object.assign(new EventTarget(), { hidden: false })
  Object.assign(globalThis, { fetch: fetcher, window, document, inboxHooks: {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next }] },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial } },
    useCallback(fn, deps) { const i = cursor++; if (!slots[i] || deps.some((d,j) => d !== slots[i].deps[j])) slots[i] = { fn, deps }; return slots[i].fn },
    useEffect(fn, deps) { const i = cursor++; if (!slots[i] || deps.some((d,j) => d !== slots[i][j])) { slots[i] = deps; effects.push(() => { cleanups[i]?.(); cleanups[i] = fn() }) } },
  } })
  function render() { cursor = 0; state = useInbox(); effects.splice(0).forEach(fn => fn()) }
  return { get state() { return state }, async settle() { for (let i = 0; i < 12; i++) { render(); await new Promise(r => setImmediate(r)) } }, close() { cleanups.forEach(fn => fn?.()); Object.assign(globalThis, originals) } }
}

test('a late Inbox response cannot replace the newly selected Archived filter', async () => {
  const old = deferred()
  const h = harness(async url => url.includes('status=archived') ? json(data([{ ...row('archived'), archivedAt: new Date().toISOString() }], 0)) : old.promise)
  try {
    await h.settle(); h.state.setStatus('archived'); await h.settle()
    old.resolve(json(data([row('old')]))); await h.settle()
    assert.equal(h.state.status, 'archived')
    assert.deepEqual(h.state.items.map(n => n.id), ['archived'])
  } finally { h.close() }
})
test('polling or malformed responses retain the last confirmed notifications', async () => {
  let mode = 'healthy'
  const h = harness(async () => { if (mode === 'offline') throw new Error('Offline'); return json(mode === 'invalid' ? { items: null } : data([row()])) })
  try {
    await h.settle(); mode = 'offline'; await h.state.reload(); await h.settle()
    assert.equal(h.state.items[0].id, 'notice'); assert.match(h.state.error, /Offline/)
    mode = 'invalid'; await h.state.reload(); await h.settle()
    assert.equal(h.state.items[0].id, 'notice'); assert.match(h.state.error, /invalid data/)
    mode = 'healthy'; await h.state.reload(); await h.settle(); assert.equal(h.state.error, '')
  } finally { h.close() }
})
test('a mutation finishing after a filter change refreshes the current view', async () => {
  const patch = deferred(), requests = []
  const h = harness(async (url, init) => { requests.push(url); if (init?.method === 'PATCH') return patch.promise; return json(data(url.includes('status=archived') ? [] : [row()])) })
  try {
    await h.settle(); const change = h.state.change('notice', { archived: true })
    h.state.setStatus('archived'); await h.settle(); patch.resolve(json(row())); await change; await h.settle()
    assert.equal(h.state.status, 'archived'); assert.equal(h.state.items.length, 0)
    assert.match(requests.at(-1), /status=archived/)
  } finally { h.close() }
})
test('failed read actions do not optimistically clear the badge or discard the item', async () => {
  const h = harness(async (_url, init) => { if (init?.method) throw new Error('Cannot save'); return json(data([row()])) })
  try {
    await h.settle(); assert.equal(await h.state.change('notice', { read: true }), false); await h.settle()
    assert.equal(h.state.unreadCount, 1); assert.equal(h.state.items[0].readAt, null); assert.match(h.state.error, /Cannot save/)
  } finally { h.close() }
})
