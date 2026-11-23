(() => {
  'use strict';

  const PAGE = 20;
  const MAX = 2000;
  const AVATARS = ['var(--lime)', 'var(--blush)', 'var(--yellow)', 'var(--lav)', 'var(--peri)', 'var(--kiwi)', '#ff8a5c'];
  const RING = 69.115; // circumference of the counter ring

  const $ = (sel) => document.querySelector(sel);
  const el = {
    feed: $('#feed'), empty: $('#empty'), status: $('#status'), more: $('#more'), chips: $('#chips'),
    form: $('#composer'), dlg: $('#composeDialog'), closeBtn: $('#closeCompose'), promptText: $('#promptText'), text: $('#text'), post: $('#post'), ring: $('#ringBar'), left: $('#left'), err: $('#formErr'),
    nowLabel: $('#nowLabel'),
    calTitle: $('#calTitle'), calGrid: $('#calGrid'), calPrev: $('#calPrev'), calNext: $('#calNext'),
    tagList: $('#tagList'), browse: $('#browse'), browseStats: $('#browseStats'),
    toast: $('#toast'), dTitle: $('#dTitle'), dBackToday: $('#dBackToday'), dToday: $('#dToday'), dTodayMeta: $('#dTodayMeta'),
  };

  const state = {
    entries: [], meds: [], todos: [], q: '', tag: '', day: dayKey(new Date()), exhausted: false, loading: false,
    stats: null, tags: [], month: firstOfMonth(new Date()), editing: null,
  };

  // ---------- small helpers ----------
  function pad(n) { return String(n).padStart(2, '0'); }
  function dayKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function firstOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
  function tzMinutes() { return -new Date().getTimezoneOffset(); }
  const timeFmt = { hour: '2-digit', minute: '2-digit' };

  function ago(date) {
    const s = (Date.now() - date.getTime()) / 1000;
    if (s < 45) return 'just now';
    if (s < 3600) return Math.max(1, Math.round(s / 60)) + ' min ago';
    if (s < 86400) return Math.round(s / 3600) + ' h ago';
    if (s < 7 * 86400) return Math.round(s / 86400) + ' d ago';
    return '';
  }

  function h(tag, attrs = {}, ...kids) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null) node.append(kid);
    return node;
  }

  function avatar(color) {
    const box = h('div', { class: 'd-avatar', 'aria-hidden': 'true', style: '--av:' + color });
    box.innerHTML = '<img src="img/avatar.jpg?v=3" alt="" width="64" height="64" decoding="async">';
    return box;
  }

  let toastTimer;
  function toast(message) {
    el.toast.textContent = message;
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.toast.hidden = true; }, 1800);
  }

  function showStatus(message) {
    el.status.textContent = message || '';
    el.status.hidden = !message;
  }

  // The page and the API share one origin; nginx adds the credentials the backend needs.
  async function api(path, options = {}) {
    let res;
    try {
      res = await fetch('api' + path, { headers: { 'Content-Type': 'application/json' }, ...options });
    } catch (e) {
      throw new Error('Could not reach the server. If you were signed out, reload the page.');
    }
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json()).detail; } catch (e) { /* no body */ }
      throw new Error(typeof detail === 'string' && detail ? detail : 'Server error ' + res.status);
    }
    return res.status === 204 ? null : res.json();
  }

  // ---------- entry text: #tags and links, built from text nodes only ----------
  const TEXT_RE = /(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])|(^|[^\p{L}\p{N}_])#([\p{L}\p{N}_]{1,40})/gu;

  function renderText(container, text) {
    container.textContent = '';
    let last = 0;
    for (const m of text.matchAll(TEXT_RE)) {
      if (m[1]) {
        container.append(text.slice(last, m.index));
        container.append(h('a', { href: m[1], target: '_blank', rel: 'noopener noreferrer', text: m[1] }));
      } else {
        if (/^\d+$/.test(m[3])) continue; // "#123" is not a tag
        container.append(text.slice(last, m.index) + m[2]);
        container.append(h('button', {
          type: 'button', class: 'd-tag', 'data-tag': m[3].toLowerCase(), text: '#' + m[3],
          onclick: () => setTag(m[3].toLowerCase()),
        }));
      }
      last = m.index + m[0].length;
    }
    container.append(text.slice(last));
  }

  // ---------- feed ----------
  function hasFilters() { return !!(state.q || state.tag); }
  const todayKey = () => dayKey(new Date());
  const dayMode = () => !state.q && !state.tag;

  let seq = 0;
  async function loadFeed(reset) {
    if (state.loading && !reset) return;
    const mine = ++seq;
    state.loading = true;
    el.more.disabled = true;
    try {
      const params = new URLSearchParams({ limit: String(PAGE) });
      if (state.q) params.set('q', state.q);
      if (state.tag) params.set('tag', state.tag);
      if (state.day && dayMode()) {
        const [y, m, d] = state.day.split('-').map(Number);
        params.set('start', new Date(y, m - 1, d).toISOString());
        params.set('end', new Date(y, m - 1, d + 1).toISOString());
      }
      if (!reset && state.entries.length) {
        const last = state.entries[state.entries.length - 1];
        params.set('before', last.created_at + '_' + last.id);
      }
      const page = await api('/v1/entries?' + params);
      if (mine !== seq) return;
      state.entries = reset ? page : state.entries.concat(page);
      state.exhausted = page.length < PAGE;
      showStatus('');
    } catch (e) {
      if (mine === seq) showStatus(e.message);
    } finally {
      if (mine === seq) {
        state.loading = false;
        el.more.disabled = false;
        renderFeed();
      }
    }
  }

  async function loadSide() {
    try {
      const [stats, tags] = await Promise.all([
        api('/v1/entries/stats?tz=' + tzMinutes()),
        api('/v1/entries/tags?limit=24'),
      ]);
      state.stats = stats;
      state.tags = tags;
    } catch (e) {
      showStatus(e.message);
    }
    renderSide();
  }

  function refreshAll() { return Promise.all([loadFeed(true), loadSide()]); }

  function renderFeed() {
    const loadedCount = {};
    for (const e of state.entries) {
      const k = dayKey(new Date(e.created_at));
      loadedCount[k] = (loadedCount[k] || 0) + 1;
    }
    const lastKey = state.entries.length ? dayKey(new Date(state.entries[state.entries.length - 1].created_at)) : '';

    const frag = document.createDocumentFragment();
    let current = '';
    // Venvanse moments for the day on screen (taken, kicked in, wore off), shown between the entries in time order.
    const marks = dayMode() ? medMarks(state.day) : [];
    if (marks.length) {
      const items = state.entries.map((entry) => ({ t: new Date(entry.created_at).getTime(), node: entryItem(entry, new Date(entry.created_at)) }))
        .concat(marks.map((m) => ({ t: m.t, node: medItem(m) })));
      items.sort((a, b) => b.t - a.t);
      items.forEach((it) => frag.append(it.node));
    }
    for (const entry of (marks.length ? [] : state.entries)) {
      const d = new Date(entry.created_at);
      const key = dayKey(d);
      if (key !== current && !dayMode()) {
        current = key;
        const known = !hasFilters() && state.stats ? state.stats.days[key] : null;
        const n = known != null ? known : loadedCount[key];
        const plus = known == null && !state.exhausted && key === lastKey ? '+' : '';
        frag.append(h('li', { class: 'd-day', 'aria-hidden': 'true' },
          h('span', { text: d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) }),
          h('i'),
          h('span', { text: n + plus + (n === 1 && !plus ? ' entry' : ' entries') })));
      }
      frag.append(entryItem(entry, d));
    }
    el.feed.replaceChildren(frag);

    el.more.hidden = state.exhausted || !state.entries.length;
    const showEmpty = !state.entries.length && !marks.length && !state.loading && el.status.hidden;
    el.empty.hidden = !showEmpty;
    if (showEmpty) {
      el.empty.textContent = hasFilters()
        ? 'No entries match that.'
        : 'Nada escrito neste dia.';
    }
    renderMoodRail();
    renderTopicRail();
    renderTagsRail();
    renderChips();
  }

  // ---------- right column: #tags used on the day (click one to see it across all days) ----------
  const TAG_RE = /(^|\s)#([\p{L}\p{N}_-]+)/gu;
  function renderTagsRail() {
    const box = document.getElementById('railTags');
    if (!box) return;
    const empty = document.getElementById('railTagsEmpty');
    const count = document.getElementById('railTagsCount');
    box.replaceChildren();
    if (state.tag) {
      // a tag filter is on: say so, and offer the way back to the day
      box.append(h('button', { type: 'button', class: 'd-rail-chip on', title: 'Voltar ao dia', onclick: clearFilters }, '#' + state.tag, h('b', { text: '×' })));
      empty.hidden = false; empty.textContent = 'Mostrando #' + state.tag + ' em todos os dias.'; count.textContent = '';
      return;
    }
    const tags = new Map();
    for (const e of state.entries) {
      for (const m of String(e.text || '').matchAll(TAG_RE)) {
        if (/^\d+$/.test(m[2])) continue;
        const k = m[2].toLowerCase();
        tags.set(k, (tags.get(k) || 0) + 1);
      }
    }
    const rows = [...tags.entries()].sort((a, b) => b[1] - a[1]);
    rows.forEach(([tag, n]) => box.append(h('button', { type: 'button', class: 'd-rail-chip', title: 'Ver #' + tag + ' em todos os dias', onclick: () => setTag(tag) }, '#' + tag, n > 1 ? h('b', { text: String(n) }) : null)));
    count.textContent = rows.length ? String(rows.length) : '';
    empty.hidden = rows.length > 0;
    empty.textContent = 'Nenhuma tag neste dia. Escreva #algo numa entrada.';
  }

  // ---------- mood + topic labels (words only, no AI; see mood.js) ----------
  // The engine guesses; you can fix it. Fixes live in this browser only (localStorage) and teach the next guesses:
  //   rm    labels you removed from one entry         add  labels you added to one entry (also teaches the words)
  //   ban   "this word does not mean this label"      learn  words that came with a label you added
  const LBL_KEY = 'ignis-diary-labels-v1';
  const LBL = (() => { try { return Object.assign({ entries: {}, ban: {}, learn: {} }, JSON.parse(localStorage.getItem(LBL_KEY) || '{}')); } catch (e) { return { entries: {}, ban: {}, learn: {} }; } })();
  const saveLbl = () => { try { localStorage.setItem(LBL_KEY, JSON.stringify(LBL)); } catch (e) { /* storage blocked: corrections last until reload */ } };
  const MOOD_KEYS = () => Object.keys(window.IgnisMood.LABELS);
  const TOPIC_KEYS = () => Object.keys(window.IgnisMood.TOPIC_LABELS);
  const fold = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const STOP = new Set(('para como mais muito porque quando onde tinha tenho estou estava fazer coisa coisas ainda depois antes sobre entre isso essa esse aqui pouco minha meu voce vamos hoje agora entao tambem mesmo sempre nunca tudo nada algo vezes muita muitos todas todos nosso dela dele seja pelo pela assim quero queria preciso estao estar ficar fiquei pode posso deve sera tive tava uma uns umas mas nao sim bem bom boa dias tempo vez isso ainda esta foram sido ser tem tinha vou vai foi').split(' '));
  const wordsOf = (text) => [...new Set(fold(text).split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !STOP.has(w)))];
  const kindOf = (key) => (MOOD_KEYS().includes(key) ? 'mood' : 'topic');
  const labelText = (key) => (window.IgnisMood.LABELS[key] || window.IgnisMood.TOPIC_LABELS[key] || key);
  const toneOf = (key) => window.IgnisMood.TONE[key] || '?';

  // the engine's guess for one entry, with your fixes applied -> { moods: [...], topics: [...] }
  function labelsFor(entry) {
    if (!window.IgnisMood) return { moods: [], topics: [] };
    const fix = LBL.entries[entry.id] || { rm: [], add: [] };
    const keep = (item, kind) => {
      const k = kind + ':' + item.key;
      if ((fix.rm || []).includes(k)) return false;
      const banned = LBL.ban[k] || [];
      return item.hits.some((w) => !banned.includes(w)); // dropped only if every word behind it was marked wrong
    };
    const moods = window.IgnisMood.analyze(entry.text).filter((m) => keep(m, 'mood'));
    const topics = (window.IgnisMood.topics ? window.IgnisMood.topics(entry.text) : []).filter((t) => keep(t, 'topic'));
    const have = new Set([...moods.map((m) => 'mood:' + m.key), ...topics.map((t) => 'topic:' + t.key)]);
    const put = (full, why) => {
      if (have.has(full) || (fix.rm || []).includes(full)) return;
      have.add(full);
      const [kind, key] = full.split(':');
      const item = { key, label: labelText(key), tone: toneOf(key), hits: [why] };
      (kind === 'mood' ? moods : topics).push(item);
    };
    (fix.add || []).forEach((full) => put(full, 'você escolheu'));
    const mine = new Set(wordsOf(entry.text));
    for (const [full, words] of Object.entries(LBL.learn)) {
      // a taught word only counts once it has been confirmed: two different words, or the same word taught twice
      const seen = Object.keys(words).filter((w) => mine.has(w));
      if (seen.reduce((n, w) => n + words[w], 0) >= 2) put(full, 'aprendido: ' + seen.slice(0, 3).join(', '));
    }
    return { moods, topics };
  }
  const afterFix = () => { saveLbl(); renderFeed(); };
  function removeLabel(entry, full, hits) {
    const fix = (LBL.entries[entry.id] = LBL.entries[entry.id] || { rm: [], add: [] });
    fix.add = (fix.add || []).filter((x) => x !== full);
    if (!fix.rm.includes(full)) fix.rm.push(full);
    // the words that caused this guess are wrong for this label from now on
    const ban = (LBL.ban[full] = LBL.ban[full] || []);
    hits.filter((w) => !/^(você escolheu|aprendido: )/.test(w)).forEach((w) => { if (!ban.includes(w)) ban.push(w); });
    // and if it came from something you taught, forget that too
    if (LBL.learn[full]) wordsOf(entry.text).forEach((w) => { delete LBL.learn[full][w]; });
  }
  function addLabel(entry, full) {
    const fix = (LBL.entries[entry.id] = LBL.entries[entry.id] || { rm: [], add: [] });
    fix.rm = (fix.rm || []).filter((x) => x !== full);
    if (!fix.add.includes(full)) fix.add.push(full);
    const learn = (LBL.learn[full] = LBL.learn[full] || {});
    wordsOf(entry.text).forEach((w) => { learn[w] = (learn[w] || 0) + 1; });
    if (LBL.ban[full]) LBL.ban[full] = LBL.ban[full].filter((w) => !wordsOf(entry.text).includes(w));
  }

  // one small floating menu, reused
  let menuEl = null;
  function closeMenu() { if (menuEl) { menuEl.remove(); menuEl = null; } }
  function openMenu(anchor, title, items) {
    closeMenu();
    menuEl = h('div', { class: 'd-lbl-menu', role: 'menu' }, h('p', { class: 'd-lbl-title', text: title }),
      ...items.map((it) => (it.heading
        ? h('p', { class: 'd-lbl-head', text: it.heading })
        : h('button', { type: 'button', role: 'menuitem', class: it.danger ? 'danger' : '', text: it.text, onclick: () => { closeMenu(); it.run(); } }))));
    document.body.append(menuEl);
    const r = anchor.getBoundingClientRect();
    const mw = menuEl.offsetWidth, mh = menuEl.offsetHeight;
    menuEl.style.left = Math.max(8, Math.min(r.left, innerWidth - mw - 8)) + 'px';
    menuEl.style.top = (r.bottom + mh + 12 > innerHeight ? Math.max(8, r.top - mh - 6) : r.bottom + 6) + 'px';
    const first = menuEl.querySelector('button'); if (first) first.focus();
  }
  document.addEventListener('pointerdown', (e) => { if (menuEl && !menuEl.contains(e.target) && !e.target.closest('[data-lbl]')) closeMenu(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
  window.addEventListener('scroll', closeMenu, { passive: true });

  // click a chip: remove it, or swap it for another label of the same kind
  function chipMenu(anchor, entry, item, kind) {
    const full = kind + ':' + item.key;
    const others = (kind === 'mood' ? MOOD_KEYS() : TOPIC_KEYS()).filter((k) => k !== item.key);
    openMenu(anchor, (kind === 'mood' ? 'Humor: ' : 'Tema: ') + item.label, [
      { text: 'Não é isso (remover)', danger: true, run: () => { removeLabel(entry, full, item.hits); afterFix(); } },
      { heading: 'Trocar por' },
      ...others.map((k) => ({ text: labelText(k), run: () => { removeLabel(entry, full, item.hits); addLabel(entry, kind + ':' + k); afterFix(); } })),
    ]);
  }
  // "Rotular": add any mood or topic the engine missed
  function addMenu(anchor, entry) {
    const cur = labelsFor(entry);
    const has = new Set([...cur.moods.map((m) => 'mood:' + m.key), ...cur.topics.map((t) => 'topic:' + t.key)]);
    const row = (kind, k) => ({ text: labelText(k), run: () => { addLabel(entry, kind + ':' + k); afterFix(); } });
    openMenu(anchor, 'Adicionar a esta entrada', [
      { heading: 'Tema' }, ...TOPIC_KEYS().filter((k) => !has.has('topic:' + k)).map((k) => row('topic', k)),
      { heading: 'Humor' }, ...MOOD_KEYS().filter((k) => !has.has('mood:' + k)).map((k) => row('mood', k)),
    ]);
  }

  function moodChips(entry) {
    const { moods, topics } = labelsFor(entry);
    if (!moods.length && !topics.length) return null;
    const chip = (kind, item, cls, inner) => h('button', {
      type: 'button', class: cls, 'data-lbl': '1',
      title: (kind === 'mood' ? 'Humor' : 'Tema') + ', pelas palavras: ' + item.hits.join(', ') + '. Clique para corrigir.',
      onclick: (ev) => chipMenu(ev.currentTarget, entry, item, kind),
    }, ...inner);
    return h('p', { class: 'd-moods' },
      ...topics.map((t) => chip('topic', t, 'd-topic', [t.label])),
      ...moods.map((m) => chip('mood', m, 'd-mood tone-' + (m.tone === '+' ? 'pos' : m.tone === '-' ? 'neg' : 'q'), [h('i', { 'aria-hidden': 'true' }), m.label])));
  }
  function labelButton(entry) {
    return h('button', { type: 'button', text: 'Rotular', 'data-lbl': '1', onclick: (ev) => addMenu(ev.currentTarget, entry) });
  }

  function railRows(listId, emptyId, pick, emptyText) {
    const list = document.getElementById(listId);
    if (!list) return;
    const empty = document.getElementById(emptyId);
    if (!dayMode()) { list.replaceChildren(); empty.hidden = true; return; }
    const count = new Map();
    for (const e of state.entries) for (const it of pick(labelsFor(e))) { const c = count.get(it.key) || { it, n: 0 }; c.n += 1; count.set(it.key, c); }
    const rows = [...count.values()].sort((a, b) => b.n - a.n);
    list.replaceChildren(...rows.map(({ it, n }) => h('li', { class: 'd-rail-item' },
      it.tone != null
        ? h('span', { class: 'd-mood tone-' + (it.tone === '+' ? 'pos' : it.tone === '-' ? 'neg' : 'q') }, h('i', { 'aria-hidden': 'true' }), it.label)
        : h('span', { class: 'd-topic', text: it.label }),
      h('span', { class: 'd-rail-tag', text: n + (n === 1 ? ' entrada' : ' entradas') }))));
    empty.hidden = rows.length > 0 || state.loading;
    empty.textContent = state.entries.length ? emptyText : 'Sem entradas neste dia.';
  }
  function renderTopicRail() { railRows('railTopics', 'railTopicsEmpty', (l) => l.topics.map((t) => ({ ...t, tone: null })), 'Nenhum tema claro neste dia.'); }
  function renderMoodRail() { railRows('railMood', 'railMoodEmpty', (l) => l.moods, 'Nenhum humor claro nas entradas deste dia.'); }
  async function resetLabels() {
    if (!(await IgnisConfirm.ask({ title: 'Apagar correções', text: 'Apagar todas as correções de humor e tema e o que o diário aprendeu com elas?' }))) return;
    LBL.entries = {}; LBL.ban = {}; LBL.learn = {};
    saveLbl(); renderFeed();
  }

  // ---------- right column: tasks finished on the day on screen ----------
  function renderRail() {
    const list = document.getElementById('railTasks');
    if (!list) return;
    const done = state.todos.filter((t) => t.done && t.done_day === state.day);
    const check = () => {
      const NS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('class', 'd-rail-check'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
      const p = document.createElementNS(NS, 'path'); p.setAttribute('d', 'm5 12.5 4.5 4.5L19 7.5'); svg.appendChild(p);
      return svg;
    };
    list.replaceChildren(...done.map((t) => h('li', { class: 'd-rail-item' },
      check(),
      h('span', { class: 'd-rail-title', text: t.title }),
      t.category ? h('span', { class: 'd-rail-tag', text: '#' + t.category }) : null)));
    document.getElementById('railTasksCount').textContent = done.length ? String(done.length) : '';
    const empty = document.getElementById('railTasksEmpty');
    empty.hidden = done.length > 0;
    empty.textContent = 'Nenhuma tarefa concluída neste dia.';
  }
  async function loadTodos() {
    try { const d = await api('/v1/todos'); state.todos = d.todos || []; renderRail(); } catch (e) { /* the diary works without it */ }
  }

  // ---------- Venvanse moments in the diary ----------
  const MED_LABEL = { taken: 'Tomou Venvanse', onset: 'O efeito bateu', wearing_off: 'O efeito passou' };
  function medMarks(dayStr) {
    const out = [];
    for (const d of state.meds) {
      const t = new Date(d.taken_at);
      if (dayKey(t) === dayStr) out.push({ kind: 'taken', t: t.getTime(), text: MED_LABEL.taken + ' · ' + d.dose_mg + ' mg' });
      for (const e of (d.events || [])) {
        if (e.type !== 'onset' && e.type !== 'wearing_off') continue;
        const at = new Date(e.occurred_at);
        if (dayKey(at) === dayStr) out.push({ kind: e.type, t: at.getTime(), text: MED_LABEL[e.type] });
      }
    }
    return out;
  }
  function medItem(m) {
    const when = new Date(m.t);
    const meta = h('span', { class: 'd-meta' }, h('time', { datetime: when.toISOString(), text: when.toLocaleTimeString([], timeFmt) }));
    const text = h('p', { class: 'd-text d-med-text' }, h('i', { class: 'd-med-dot ' + m.kind, 'aria-hidden': 'true' }), m.text);
    return h('li', { class: 'd-med' }, h('article', { class: 'd-entry d-med-row' }, text, meta));
  }
  async function loadMeds() {
    try {
      state.meds = await api('/v1/meds/vyvanse/doses?limit=200');
      renderFeed();
    } catch (e) { /* the diary works without it */ }
  }

  function entryItem(entry, d) {
    const color = AVATARS[d.getDate() % AVATARS.length];
    const textEl = h('p', { class: 'd-text' });
    renderText(textEl, entry.text);

    // time, kept together on the right
    const meta = h('span', { class: 'd-meta' },
      h('time', { datetime: entry.created_at, title: d.toLocaleString([], { dateStyle: 'full', timeStyle: 'short' }), text: d.toLocaleTimeString([], timeFmt) }),
      h('span', { class: 'd-ago', 'data-ts': entry.created_at, text: ago(d) ? ' · ' + ago(d) : '' }),
      entry.edited_at ? h('span', { text: ' · edited' }) : null);

    if (state.editing === entry.id) {
      const ta = h('textarea', { maxlength: String(MAX), 'aria-label': 'Edit entry' });
      ta.value = entry.text;
      const save = h('button', { type: 'button', class: 'd-mini go', text: 'Save' });
      const cancel = h('button', { type: 'button', class: 'd-mini', text: 'Cancel', onclick: () => { state.editing = null; renderFeed(); } });
      const commit = async () => {
        const next = ta.value.trim();
        if (!next) return;
        save.disabled = true;
        try {
          await api('/v1/entries/' + encodeURIComponent(entry.id), { method: 'PATCH', body: JSON.stringify({ text: next }) });
          state.editing = null;
          toast('Saved');
          await refreshAll();
        } catch (e) {
          save.disabled = false;
          showStatus(e.message);
        }
      };
      save.addEventListener('click', commit);
      ta.addEventListener('keydown', (ev) => {
        if ((ev.metaKey || ev.ctrlKey) && ev.key === 'Enter') { ev.preventDefault(); commit(); }
        if (ev.key === 'Escape') { state.editing = null; renderFeed(); }
      });
      queueMicrotask(() => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); });
      return h('li', {}, h('article', { class: 'd-entry is-editing' }, meta,
        h('div', { class: 'd-edit' }, ta, h('div', { class: 'row' }, save, cancel))));
    }

    return h('li', {}, h('article', { class: 'd-entry' }, textEl, meta, moodChips(entry),
      h('div', { class: 'd-actions' }, editButton(entry), labelButton(entry), deleteButton(entry))));
  }

  function editButton(entry) {
    return h('button', { type: 'button', text: 'Edit', onclick: () => { state.editing = entry.id; renderFeed(); } });
  }

  function confirmDelete(entry) {
    return new Promise((resolve) => {
      const when = new Date(entry.created_at).toLocaleString([], { dateStyle: 'long', timeStyle: 'short' });
      const preview = entry.text.length > 160 ? entry.text.slice(0, 160).trimEnd() + '…' : entry.text;
      const dlg = h('dialog', { class: 'd-confirm', 'aria-labelledby': 'dcTitle' });
      const cancel = h('button', { type: 'button', class: 'd-mini', text: 'Keep it' });
      const ok = h('button', { type: 'button', class: 'd-mini danger-go', text: 'Delete entry' });
      dlg.append(h('form', { method: 'dialog' },
        h('h2', { id: 'dcTitle', text: 'Delete this entry?' }),
        h('p', { class: 'dc-when', text: when }),
        h('blockquote', { class: 'dc-text', text: preview }),
        h('p', { class: 'dc-note', text: 'This can’t be undone.' }),
        h('div', { class: 'row' }, cancel, ok)));
      let done = false;
      const finish = (v) => { if (done) return; done = true; if (dlg.open) dlg.close(); dlg.remove(); resolve(v); };
      cancel.addEventListener('click', () => finish(false));
      ok.addEventListener('click', () => finish(true));
      dlg.addEventListener('cancel', (ev) => { ev.preventDefault(); finish(false); });
      dlg.addEventListener('close', () => finish(false));
      document.body.append(dlg);
      dlg.showModal();
      cancel.focus();
    });
  }

  function deleteButton(entry) {
    const btn = h('button', { type: 'button', class: 'danger', text: 'Delete' });
    btn.addEventListener('click', async () => {
      if (!(await confirmDelete(entry))) return;
      btn.disabled = true;
      try {
        await api('/v1/entries/' + encodeURIComponent(entry.id), { method: 'DELETE' });
        toast('Deleted');
        await refreshAll();
      } catch (e) {
        btn.disabled = false;
        showStatus(e.message);
      }
    });
    return btn;
  }

  // ---------- filters ----------
  function setTag(tag) {
    state.tag = state.tag === tag ? '' : tag;
    loadFeed(true);
    renderSide();
  }

  function toggleDay(key) { goDay(key); }
  function goDay(key) {
    state.day = key;
    state.editing = null;
    loadFeed(true);
    renderCalendar();
    renderHeader();
  }
  function stepDay(n) {
    const [y, m, d] = state.day.split('-').map(Number);
    goDay(dayKey(new Date(y, m - 1, d + n)));
  }
  const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
  function renderHeader() {
    const [y, m, d] = state.day.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const now = new Date();
    const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diff = Math.round((date - t0) / 86400000);
    const left = Math.round((new Date(y, 11, 31) - date) / 86400000);
    const full = d + ' de ' + MONTHS[m - 1] + ' de ' + y;
    let title;
    const tail = left === 0 ? 'hoje é o último dia do ano!' : (left === 1 ? 'falta 1 dia' : 'faltam ' + left + ' dias') + ' para o ano acabar!';
    if (diff === 0) title = 'Hoje é dia ' + full + ', ' + tail;
    else title = 'Dia ' + full + (diff < 0 ? ' · há ' + plural(-diff, 'dia', 'dias') : ' · daqui a ' + plural(diff, 'dia', 'dias'));
    if (el.dTitle) el.dTitle.textContent = title;
    if (el.dBackToday) el.dBackToday.hidden = diff === 0;
    renderRail();
  }

  function clearFilters() {
    state.q = ''; state.tag = ''; state.day = todayKey();
    loadFeed(true);
    renderSide();
    renderHeader();
  }

  function renderChips() {
    const chips = [];
    if (state.tag) chips.push(h('li', {}, h('button', { type: 'button', 'aria-label': 'Remove tag filter #' + state.tag, text: '#' + state.tag, onclick: () => setTag(state.tag) })));
    if (chips.length > 1 || (chips.length && state.q)) {
      chips.push(h('li', {}, h('button', { type: 'button', class: 'clear', text: 'Clear all', onclick: clearFilters })));
    }
    el.chips.replaceChildren(...chips);
    syncToolbar();
  }

  el.more.addEventListener('click', () => loadFeed(false));
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((items) => {
      if (items.some((i) => i.isIntersecting) && !el.more.hidden && !state.loading) loadFeed(false);
    }, { rootMargin: '300px' }).observe(el.more);
  }

  // ---------- sidebar: profile numbers, calendar, tags ----------
  function renderSide() {
    if (state.stats) {
      const n = state.stats.total;
      el.browseStats.textContent = n + (n === 1 ? ' entry' : ' entries') + (state.stats.streak > 1 ? ' · ' + state.stats.streak + '-day streak' : '');
    }
    renderCalendar();
    renderTags();
  }

  function renderCalendar() {
    const m = state.month;
    const y = m.getFullYear();
    const mo = m.getMonth();
    el.calTitle.textContent = m.toLocaleDateString([], { month: 'long', year: 'numeric' });
    const lead = (new Date(y, mo, 1).getDay() + 6) % 7; // weeks start on Monday
    const total = new Date(y, mo + 1, 0).getDate();
    const today = dayKey(new Date());
    const counts = state.stats ? state.stats.days : {};
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push(h('span', { class: 'd-pad' }));
    for (let d = 1; d <= total; d++) {
      const key = y + '-' + pad(mo + 1) + '-' + pad(d);
      const n = counts[key] || 0;
      cells.push(h('button', {
        type: 'button',
        class: 'd-dayb' + (n ? ' has' : '') + (key === today ? ' today' : '') + (key === state.day ? ' sel' : ''),
        'aria-pressed': key === state.day ? 'true' : 'false',
        'aria-label': new Date(y, mo, d).toLocaleDateString([], { day: 'numeric', month: 'long' }) + (n ? ', ' + n + (n === 1 ? ' entry' : ' entries') : ''),
        onclick: () => toggleDay(key),
        text: String(d),
      }));
    }
    el.calGrid.replaceChildren(...cells);
  }

  function renderTags() {
    el.tagList.replaceChildren(...state.tags.map((t) => h('li', {},
      h('button', { type: 'button', 'aria-pressed': t.tag === state.tag ? 'true' : 'false', onclick: () => setTag(t.tag) },
        '#' + t.tag, h('span', { text: String(t.count) })))));
  }

  el.calPrev.addEventListener('click', () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth() - 1, 1); renderCalendar(); });
  el.calNext.addEventListener('click', () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth() + 1, 1); renderCalendar(); });

  // ---------- composer ----------
  function updateComposer() {
    const len = el.text.value.length;
    const trimmed = el.text.value.trim();
    const used = Math.min(len / MAX, 1);
    el.ring.style.strokeDashoffset = String(RING * (1 - used));
    const warn = MAX - len <= 100;
    el.ring.classList.toggle('warn', warn);
    el.left.classList.toggle('warn', warn);
    el.left.textContent = warn ? String(MAX - len) : '';
    el.post.disabled = !trimmed || len > MAX;
    el.text.style.height = 'auto';
    el.text.style.height = Math.min(el.text.scrollHeight + 2, 380) + 'px';
  }

  function updateNow() {
    const now = new Date();
    el.nowLabel.textContent = now.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }) + ' · ' + now.toLocaleTimeString([], timeFmt);
    el.dToday.textContent = String(now.getDate());
    el.dTodayMeta.textContent = now.toLocaleDateString([], { weekday: 'short' }) + ' · ' + now.toLocaleDateString([], { month: 'short' });
  }

  el.text.addEventListener('input', updateComposer);
  el.text.addEventListener('keydown', (ev) => {
    if ((ev.metaKey || ev.ctrlKey) && ev.key === 'Enter') { ev.preventDefault(); el.form.requestSubmit(); }
  });

  el.form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const text = el.text.value.trim();
    if (!text || text.length > MAX) return;
    // no date is sent: the server stamps the entry with the exact moment it is posted
    const body = { text };
    el.post.disabled = true;
    el.err.hidden = true;
    try {
      await api('/v1/entries', { method: 'POST', body: JSON.stringify(body) });
      el.text.value = '';
      updateComposer();
      closeCompose();
      // show the new entry, even if a filter would have hidden it
      state.q = ''; state.tag = ''; state.day = todayKey();
      renderHeader();
      toast('Posted');
      await refreshAll();
    } catch (e) {
      el.err.textContent = e.message;
      el.err.hidden = false;
      updateComposer();
    }
  });

  // ---------- composer modal (like the post box on Twitter) ----------
  const DRAFT_KEY = 'ignis-diary-draft';
  const readDraft = () => { try { return localStorage.getItem(DRAFT_KEY) || ''; } catch (e) { return ''; } };
  const writeDraft = (value) => {
    try { if (value) localStorage.setItem(DRAFT_KEY, value); else localStorage.removeItem(DRAFT_KEY); } catch (e) { /* storage blocked */ }
  };

  function refreshPrompt() {
    const draft = el.text.value.trim().replace(/\s+/g, ' ');
    el.promptText.textContent = draft ? 'Continue draft' : 'New entry';
    const btn = el.promptText.closest('button');
    btn.classList.toggle('has-draft', !!draft);
    btn.title = draft ? 'Draft: ' + draft.slice(0, 80) : 'Write a new entry (N)';
  }

  function openCompose() {
    if (el.dlg.open) return;
    el.dlg.showModal();
    updateNow();
    updateComposer();
    el.text.focus();
    el.text.setSelectionRange(el.text.value.length, el.text.value.length);
  }

  function closeCompose() { if (el.dlg.open) el.dlg.close(); }

  document.querySelectorAll('[data-compose]').forEach((btn) => btn.addEventListener('click', openCompose));
  el.closeBtn.addEventListener('click', closeCompose);
  el.dlg.addEventListener('click', (ev) => { if (ev.target === el.dlg) closeCompose(); }); // click on the dim backdrop
  el.dlg.addEventListener('close', () => { writeDraft(el.text.value); refreshPrompt(); });  // Esc, ×, backdrop or after posting
  el.text.addEventListener('input', () => writeDraft(el.text.value));
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'n' || ev.metaKey || ev.ctrlKey || ev.altKey || el.dlg.open) return;
    if (ev.target.closest && ev.target.closest('input, textarea, select, [contenteditable]')) return;
    ev.preventDefault();
    openCompose();
  });

  // ---------- greeting: "Olá" becomes hello in another language on every reload (or click) ----------
  const HELLOS = [
    ['Olá', 'pt'], ['Hello', 'en'], ['Hola', 'es'], ['Bonjour', 'fr'], ['Ciao', 'it'], ['Hallo', 'de'], ['Hej', 'sv'],
    ['Hei', 'fi'], ['Hoi', 'nl'], ['Ahoj', 'cs'], ['Cześć', 'pl'], ['Szia', 'hu'], ['Salut', 'ro'], ['Merhaba', 'tr'],
    ['Aloha', 'haw'], ['Kia ora', 'mi'], ['Sawubona', 'zu'], ['Jambo', 'sw'], ['Xin chào', 'vi'], ['Selamat', 'id'],
    ['Kamusta', 'fil'], ['Namaste', 'hi-Latn'], ['Konnichiwa', 'ja-Latn'], ['Annyeong', 'ko-Latn'], ['Ni hao', 'zh-Latn'],
    ['Marhaba', 'ar-Latn'], ['Shalom', 'he-Latn'], ['Salam', 'fa-Latn'], ['Sveiki', 'lv'], ['Tere', 'et'], ['Labas', 'lt'],
    ['Bok', 'hr'], ['Dia duit', 'ga'], ['Bula', 'fj'], ['Sawasdee', 'th-Latn'], ['Privet', 'ru-Latn'], ['Yassou', 'el-Latn'],
  ];
  const helloEl = $('#helloWord');
  const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let helloIndex = -1;
  try { helloIndex = Number(localStorage.getItem('ignis-diary-hello')); } catch (e) { /* storage blocked */ }

  function sayHello(animate) {
    let next;
    do { next = Math.floor(Math.random() * HELLOS.length); } while (HELLOS.length > 1 && next === helloIndex);
    helloIndex = next;
    helloEl.textContent = HELLOS[next][0];
    helloEl.lang = HELLOS[next][1];
    try { localStorage.setItem('ignis-diary-hello', String(next)); } catch (e) { /* storage blocked */ }
    if (animate && !reduceMotion && helloEl.animate) {
      helloEl.animate([{ opacity: 0, transform: 'translateY(.18em) rotate(-2deg)' }, { opacity: 1, transform: 'none' }],
        { duration: 320, easing: 'cubic-bezier(.2, 1.3, .4, 1)' });
    }
  }
  helloEl.addEventListener('click', () => sayHello(true));
  sayHello(false);

  // ---------- keep clocks honest ----------
  function tick() {
    updateNow();
    document.querySelectorAll('.d-ago').forEach((node) => {
      const text = ago(new Date(node.dataset.ts));
      node.textContent = text ? ' · ' + text : '';
    });
    renderCalendar();
  }
  setInterval(tick, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { tick(); loadFeed(true); loadSide(); } });

  // On wide screens the calendar and tags are always shown, with the New entry button above them.
  // On small ones the panel folds away and the button sits above the feed instead.
  const wide = window.matchMedia('(min-width: 1001px)');
  const newBtn = $('#openCompose');
  const newSlot = $('#newSlot');
  const toolbar = $('.d-toolbar');
  function placeNewButton() {
    (wide.matches ? newSlot : toolbar).append(newBtn);
    syncToolbar();
  }
  function syncToolbar() {
    toolbar.hidden = !toolbar.contains(newBtn) && !el.chips.children.length;
  }
  const syncLayout = () => {
    placeNewButton();
  };
  el.browse.open = false;
  placeNewButton();
  if (wide.addEventListener) wide.addEventListener('change', syncLayout);

  // ---------- one day per page ----------
  $('#dPrev').addEventListener('click', () => stepDay(-1));
  $('#dNext').addEventListener('click', () => stepDay(1));
  el.dBackToday.addEventListener('click', () => goDay(todayKey()));
  document.addEventListener('keydown', (ev) => {
    if (ev.metaKey || ev.ctrlKey || ev.altKey || el.dlg.open) return;
    const t = ev.target;
    if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.isContentEditable)) return;
    if (ev.key === 'ArrowLeft') { ev.preventDefault(); stepDay(-1); }
    if (ev.key === 'ArrowRight') { ev.preventDefault(); stepDay(1); }
  });
  let tx = null;
  document.addEventListener('touchstart', (ev) => { tx = ev.touches[0].clientX; }, { passive: true });
  document.addEventListener('touchend', (ev) => {
    if (tx == null) return;
    const dx = ev.changedTouches[0].clientX - tx; tx = null;
    if (Math.abs(dx) > 90 && !el.dlg.open) stepDay(dx < 0 ? 1 : -1);
  }, { passive: true });

  // ---------- go ----------
  renderHeader();
  el.text.value = readDraft();
  updateNow();
  updateComposer();
  refreshPrompt();
  refreshAll();
  loadMeds();
  loadTodos();
  const rb = document.getElementById('lblReset'); if (rb) rb.addEventListener('click', resetLabels);
})();
