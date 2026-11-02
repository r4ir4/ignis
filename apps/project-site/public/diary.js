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
    toast: $('#toast'), dToday: $('#dToday'), dTodayMeta: $('#dTodayMeta'),
  };

  const state = {
    entries: [], q: '', tag: '', day: '', exhausted: false, loading: false,
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
  function hasFilters() { return !!(state.q || state.tag || state.day); }

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
      if (state.day) {
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
    for (const entry of state.entries) {
      const d = new Date(entry.created_at);
      const key = dayKey(d);
      if (key !== current) {
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
    const showEmpty = !state.entries.length && !state.loading && el.status.hidden;
    el.empty.hidden = !showEmpty;
    if (showEmpty) {
      el.empty.textContent = hasFilters()
        ? 'No entries match that.'
        : 'Nothing here yet. Write your first entry above.';
    }
    renderChips();
  }

  function entryItem(entry, d) {
    const color = AVATARS[d.getDate() % AVATARS.length];
    const textEl = h('p', { class: 'd-text' });
    renderText(textEl, entry.text);

    // device label (only for entries that came from the app) + time, kept together on the right
    const meta = h('span', { class: 'd-meta' },
      entry.source && entry.source !== 'web' ? h('span', { class: 'd-src', text: entry.source }) : null,
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
      return h('li', {}, h('article', { class: 'd-entry is-editing' }, avatar(color), meta,
        h('div', { class: 'd-edit' }, ta, h('div', { class: 'row' }, save, cancel))));
    }

    return h('li', {}, h('article', { class: 'd-entry' }, avatar(color), textEl, meta,
      h('div', { class: 'd-actions' }, editButton(entry), deleteButton(entry))));
  }

  function editButton(entry) {
    return h('button', { type: 'button', text: 'Edit', onclick: () => { state.editing = entry.id; renderFeed(); } });
  }

  function deleteButton(entry) {
    let disarm;
    const btn = h('button', { type: 'button', class: 'danger', text: 'Delete' });
    btn.addEventListener('click', async () => {
      if (!btn.classList.contains('armed')) {
        btn.classList.add('armed');
        btn.textContent = 'Really delete?';
        disarm = setTimeout(() => { btn.classList.remove('armed'); btn.textContent = 'Delete'; }, 3000);
        return;
      }
      clearTimeout(disarm);
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

  function toggleDay(key) {
    state.day = state.day === key ? '' : key;
    loadFeed(true);
    renderCalendar();
  }

  function clearFilters() {
    state.q = ''; state.tag = ''; state.day = '';
    loadFeed(true);
    renderSide();
  }

  function renderChips() {
    const chips = [];
    if (state.tag) chips.push(h('li', {}, h('button', { type: 'button', 'aria-label': 'Remove tag filter #' + state.tag, text: '#' + state.tag, onclick: () => setTag(state.tag) })));
    if (state.day) {
      const [y, m, d] = state.day.split('-').map(Number);
      const label = new Date(y, m - 1, d).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
      chips.push(h('li', {}, h('button', { type: 'button', 'aria-label': 'Remove day filter ' + label, text: label, onclick: () => toggleDay(state.day) })));
    }
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
      state.q = ''; state.tag = ''; state.day = '';
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
    if (wide.matches) el.browse.open = true;
    placeNewButton();
  };
  el.browse.open = wide.matches;
  placeNewButton();
  if (wide.addEventListener) wide.addEventListener('change', syncLayout);

  // ---------- go ----------
  el.text.value = readDraft();
  updateNow();
  updateComposer();
  refreshPrompt();
  refreshAll();
})();
