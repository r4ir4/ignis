// Workout page: routines, a live workout screen with sets you tick off (pre-filled from last time), recent workouts and personal bests, backed by the shared ignis API.
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(2, '0');
  const dayKey = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parseDay = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const make = (tag, cls, text) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  };
  const fmt = (n) => Math.round(n).toLocaleString();
  const num = (v) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : 0; };
  const kg = (n) => (Math.round(n * 10) / 10).toString();

  async function api(path, options) {
    const init = options ? { method: options.method, headers: { 'Content-Type': 'application/json' }, body: options.body ? JSON.stringify(options.body) : undefined } : undefined;
    const res = await fetch('api' + path, init);
    if (!res.ok) {
      let detail = '';
      try { const body = await res.json(); if (typeof body.detail === 'string') detail = body.detail; } catch (e) { /* not json */ }
      throw new Error(detail || 'Something went wrong (' + res.status + ').');
    }
    return res.status === 204 ? null : res.json();
  }
  let toastTimer;
  function toast(text) {
    const el = $('toast');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
  }

  const todayKey = () => dayKey(new Date());
  const S = { data: null };
  const MUSCLE = { chest: 'Chest', back: 'Back', legs: 'Legs', shoulders: 'Shoulders', arms: 'Arms', core: 'Core', cardio: 'Cardio', full: 'Full body' };
  const COLORS = ['#c1ff1a', '#ff9ccf', '#ffd34d', '#b9c7f8', '#ff5e32'];

  async function load() {
    S.data = await api('/v1/workouts/overview?day=' + todayKey() + '&window=30');
    render();
  }

  const figure = (cls) => make('figure', 'wk-fig ' + cls);
  const emptyIn = (c, text) => { c.appendChild(make('p', 'wk-empty', text)); return c; };
  const ago = (k) => {
    if (!k) return 'not yet';
    const n = Math.round((parseDay(todayKey()) - parseDay(k)) / 86400000);
    return n <= 0 ? 'today' : n === 1 ? 'yesterday' : n < 14 ? n + ' days ago' : parseDay(k).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  };

  // ---- top row ----------------------------------------------------------------------------------------------------------------------------------
  function wordCard() {
    const f = figure('wk-word grain');
    f.innerHTML = '<svg viewBox="0 0 600 200" aria-hidden="true"><g transform="rotate(-4 300 100)"><text x="307" y="141" text-anchor="middle" class="goo-word wk-shadow">workout</text><text x="300" y="134" text-anchor="middle" class="goo-word">workout</text></g></svg>' +
      '<svg class="wk-tw" style="--x:4%;--y:14%;--s:20px;--d:0s" viewBox="0 0 32 32" aria-hidden="true"><use href="#spark"/></svg><svg class="wk-tw wk-tw-p" style="--x:91%;--y:70%;--s:22px;--d:.9s" viewBox="0 0 32 32" aria-hidden="true"><use href="#spark"/></svg><svg class="wk-tw" style="--x:90%;--y:12%;--s:12px;--d:1.7s" viewBox="0 0 32 32" aria-hidden="true"><use href="#spark"/></svg><svg class="wk-tw wk-tw-p" style="--x:6%;--y:74%;--s:14px;--d:2.3s" viewBox="0 0 32 32" aria-hidden="true"><use href="#spark"/></svg>';
    return f;
  }

  const ICON = {
    bell: '<g class="wk-i-bell"><rect x="8" y="34" width="10" height="26" rx="3" fill="currentColor"/><rect x="66" y="34" width="10" height="26" rx="3" fill="currentColor"/><rect x="18" y="26" width="8" height="42" rx="3" fill="currentColor"/><rect x="58" y="26" width="8" height="42" rx="3" fill="currentColor"/><rect x="26" y="44" width="32" height="6" rx="3" fill="currentColor"/></g>',
    plate: '<g class="wk-i-plate"><circle cx="42" cy="42" r="30" fill="currentColor"/><circle cx="42" cy="42" r="9" fill="#fff" opacity=".85"/><circle cx="42" cy="42" r="22" fill="none" stroke="#fff" stroke-width="3" stroke-dasharray="4 6" opacity=".7"/></g>',
    cal: '<g class="wk-i-cal"><rect x="10" y="16" width="64" height="56" rx="10" fill="currentColor"/><rect x="22" y="6" width="8" height="18" rx="4" fill="currentColor"/><rect x="54" y="6" width="8" height="18" rx="4" fill="currentColor"/><path d="M26 46l10 10 22-22" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" opacity=".9"/></g>',
    star: '<g class="wk-i-star"><path d="M42 8L51 31L76 33L57 49L63 74L42 61L21 74L27 49L8 33L33 31Z" fill="currentColor" stroke="currentColor" stroke-width="6" stroke-linejoin="round"/></g>',
  };

  function tile(cls, label, value, unit, icon, sub) {
    const li = make('li', 'wk-tile ' + cls);
    const left = make('span', 'wk-tl');
    left.appendChild(make('small', '', label));
    const b = make('b', 'wk-num');
    const n = make('span', '', '0');
    b.appendChild(n);
    if (unit) b.appendChild(make('em', '', unit));
    left.appendChild(b);
    if (sub) left.appendChild(make('span', 'wk-sub', sub));
    li.appendChild(left);
    const art = make('span', 'wk-art');
    art.setAttribute('aria-hidden', 'true');
    art.innerHTML = '<svg viewBox="0 0 84 84">' + ICON[icon] + '</svg>';
    li.appendChild(art);
    li.setAttribute('aria-label', label + ': ' + fmt(value) + (unit ? ' ' + unit : ''));
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !value) n.textContent = fmt(value);
    else {
      const t0 = performance.now();
      const tick = (t) => { const k = Math.min(1, (t - t0) / 700); n.textContent = fmt(value * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    }
    return li;
  }

  function tiles() {
    const d = S.data;
    const ul = make('ul', 'wk-tiles');
    ul.setAttribute('aria-label', 'Training numbers');
    ul.append(
      tile('t-week', 'This week', d.week_sessions, d.week_sessions === 1 ? 'workout' : 'workouts', 'bell', ''),
      tile('t-vol', 'Volume this week', d.week_volume, 'kg', 'plate', 'weight × reps'),
      tile('t-month', 'Last 30 days', d.month_sessions, d.month_sessions === 1 ? 'workout' : 'workouts', 'cal', ''),
      tile('t-pr', 'New records', d.prs, d.prs === 1 ? 'record' : 'records', 'star', 'last 30 days'),
    );
    return ul;
  }

  // ---- routines ----------------------------------------------------------------------------------------------------------------------------------
  function routinesCard() {
    const c = figure('wk-routines');
    const head = make('div', 'wk-head');
    head.appendChild(make('p', 'wk-k', 'Routines'));
    const add = make('button', 'wk-mini');
    add.type = 'button';
    add.innerHTML = '<span class="wk-plus" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></span><span>New routine</span>';
    add.addEventListener('click', () => openRoutine(null));
    head.appendChild(add);
    c.appendChild(head);

    if (S.data.active_session) {
      const a = S.data.recent.find((r) => r.id === S.data.active_session);
      const banner = make('button', 'wk-banner');
      banner.type = 'button';
      banner.innerHTML = '<span class="wk-live" aria-hidden="true"></span><span>Workout in progress' + (a ? ': ' + a.name : '') + '</span><b>Continue</b>';
      banner.addEventListener('click', () => openSession(S.data.active_session));
      c.appendChild(banner);
    }

    const list = make('ul', 'wk-list');
    S.data.routines.forEach((r, i) => {
      const li = make('li', 'wk-row');
      li.style.setProperty('--hc', COLORS[i % COLORS.length]);
      li.appendChild(make('i', 'wk-bullet'));
      const t = make('div', 'wk-name', r.name);
      const names = r.items.slice(0, 3).map((it) => it.exercise_name).join(' · ');
      t.appendChild(make('small', '', r.items.length + (r.items.length === 1 ? ' exercise' : ' exercises') + (names ? ' · ' + names : '') + ' · last ' + ago(r.last_day)));
      if ((r.days || []).length) t.appendChild(make('small', 'wk-plan', (r.days).map((d) => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][d]).join(' · ')));
      li.appendChild(t);
      const start = make('button', 'wk-go', 'Start');
      start.type = 'button';
      start.addEventListener('click', () => startSession(r.id));
      const edit = make('button', 'wk-edit', 'Edit');
      edit.type = 'button';
      edit.addEventListener('click', () => openRoutine(r));
      li.append(start, edit);
      list.appendChild(li);
    });
    c.appendChild(list);
    if (!S.data.routines.length) c.appendChild(make('p', 'wk-empty', 'No routines yet. Build one, or start an empty workout and add exercises as you go.'));
    const quick = make('button', 'wk-quick', 'Start an empty workout');
    quick.type = 'button';
    quick.addEventListener('click', () => startSession(null));
    c.appendChild(quick);
    return c;
  }

  // ---- recent workouts -----------------------------------------------------------------------------------------------------------------------
  function recentCard() {
    const c = figure('wk-recent');
    c.appendChild(make('p', 'wk-k', 'Recent workouts'));
    const done = S.data.recent.filter((r) => r.finished_at);
    if (!done.length) return emptyIn(c, 'Finished workouts show up here.');
    const ul = make('ul', 'wk-rlist');
    done.slice(0, 8).forEach((r, i) => {
      const li = make('li', 'wk-rrow');
      li.style.setProperty('--hc', COLORS[i % COLORS.length]);
      const btn = make('button', 'wk-rbtn');
      btn.type = 'button';
      btn.appendChild(make('i', 'wk-dot'));
      const t = make('span', 'wk-rt');
      t.appendChild(make('span', 'wk-rn', r.name));
      t.appendChild(make('small', '', parseDay(r.day).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) + ' · ' + (r.sets_done || 0) + ' sets · ' + r.exercises + (r.exercises === 1 ? ' exercise' : ' exercises')));
      btn.appendChild(t);
      if (r.volume) btn.appendChild(make('span', 'wk-rv', fmt(r.volume) + ' kg'));
      btn.addEventListener('click', () => openSession(r.id));
      li.appendChild(btn);
      ul.appendChild(li);
    });
    c.appendChild(ul);
    return c;
  }

  // ---- bests and 30 days ---------------------------------------------------------------------------------------------------------------------
  function bestScore(b) {
    if (b.kind === 'weight') return kg(b.weight) + ' kg × ' + b.reps;
    if (b.kind === 'reps') return b.reps + ' reps';
    return b.seconds + ' s';
  }
  function bestsCard() {
    const c = figure('wk-bests');
    c.appendChild(make('p', 'wk-k', 'Personal bests'));
    if (!S.data.bests.length) return emptyIn(c, 'Your best set of each exercise shows up here once you finish a workout.');
    const grid = make('ul', 'wk-bgrid');
    S.data.bests.slice(0, 8).forEach((b, i) => {
      const li = make('li', 'wk-best');
      li.style.setProperty('--hc', COLORS[i % COLORS.length]);
      li.appendChild(make('small', '', b.name));
      li.appendChild(make('b', '', bestScore(b)));
      li.appendChild(make('span', '', b.sessions + (b.sessions === 1 ? ' workout' : ' workouts') + ' · ' + ago(b.last_day)));
      grid.appendChild(li);
    });
    c.appendChild(grid);
    return c;
  }

  function monthCard() {
    const c = figure('wk-month-card');
    c.appendChild(make('p', 'wk-k', 'Last 30 days'));
    const grid = make('div', 'wk-month');
    for (let i = 29; i >= 0; i--) {
      const d = addDays(new Date(), -i);
      const key = dayKey(d);
      const n = S.data.days[key] || 0;
      const sq = make('div', 'wk-sq' + (n ? ' l' + Math.min(n, 2) : '') + (i === 0 ? ' now' : ''), String(d.getDate()));
      sq.title = d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }) + ' · ' + (n ? n + (n === 1 ? ' workout' : ' workouts') : 'rest day');
      grid.appendChild(sq);
    }
    c.appendChild(grid);
    return c;
  }

  function render() {
    const board = make('div', 'identity wk-board');
    const g = make('div', 'wk-idgrid');
    g.append(wordCard(), tiles(), routinesCard(), recentCard(), bestsCard(), monthCard());
    board.appendChild(g);
    $('wkGrid').replaceChildren(board);
  }

  // ---- exercise picker: a custom dropdown (button + a styled list with a search box, grouped by muscle) -------------------------------------------
  const DDS = {};
  const MUSCLE_COLOR = { chest: '#c1ff1a', back: '#ff9ccf', legs: '#ffd34d', shoulders: '#b9c7f8', arms: '#ff5e32', core: '#c1ff1a', cardio: '#ff9ccf', full: '#ffd34d' };
  function makeDD(root) {
    const dd = { value: '', open: false, items: [], active: -1 };
    root.classList.add('wk-ddroot');
    const btn = make('button', 'wk-ddbtn');
    btn.type = 'button';
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    const label = make('span', 'wk-ddlabel');
    btn.appendChild(label);
    btn.insertAdjacentHTML('beforeend', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>');
    const panel = make('div', 'wk-ddpanel');
    panel.hidden = true;
    const search = make('input', 'wk-ddsearch');
    search.type = 'search'; search.placeholder = 'Search exercises…'; search.autocomplete = 'off'; search.setAttribute('aria-label', 'Search exercises');
    const list = make('ul', 'wk-ddlist');
    list.setAttribute('role', 'listbox');
    panel.append(search, list);
    root.append(btn, panel);

    const exs = () => S.data.exercises;
    const placeholder = () => (exs().length ? 'Pick an exercise…' : 'No exercises yet: create one');
    const shown = () => { const q = search.value.trim().toLowerCase(); return exs().filter((e) => !q || e.name.toLowerCase().includes(q)); };

    function draw() {
      list.replaceChildren();
      const items = shown();
      dd.items = items;
      if (!items.length) { list.appendChild(make('li', 'wk-ddempty', exs().length ? 'Nothing matches.' : 'Create your first exercise with the New exercise button.')); return; }
      let gi = 0;
      Object.keys(MUSCLE).forEach((m) => {
        const inGroup = items.filter((e) => e.muscle === m);
        if (!inGroup.length) return;
        const h = make('li', 'wk-ddgroup g' + (gi++ % 3), MUSCLE[m]);
        h.setAttribute('role', 'presentation');
        list.appendChild(h);
        inGroup.forEach((e) => {
          const li = make('li', 'wk-ddopt' + (e.id === dd.value ? ' on' : '') + (items[dd.active] === e ? ' act' : ''));
          li.setAttribute('role', 'option');
          li.setAttribute('aria-selected', String(e.id === dd.value));
          li.dataset.id = e.id;
          li.style.setProperty('--hc', MUSCLE_COLOR[e.muscle] || '#c1ff1a');
          li.appendChild(make('i', 'wk-dddot'));
          li.appendChild(make('span', 'wk-ddname', e.name));
          li.appendChild(make('small', '', e.kind === 'weight' ? 'kg × reps' : e.kind === 'reps' ? 'reps' : 'time'));
          li.addEventListener('mousedown', (ev) => { ev.preventDefault(); choose(e); });
          li.addEventListener('mousemove', () => { dd.active = items.indexOf(e); markActive(); });
          list.appendChild(li);
        });
      });
    }
    function markActive() {
      list.querySelectorAll('.wk-ddopt').forEach((li) => li.classList.toggle('act', dd.items[dd.active] && li.dataset.id === dd.items[dd.active].id));
      const cur = list.querySelector('.wk-ddopt.act');
      if (cur) cur.scrollIntoView({ block: 'nearest' });
    }
    function refreshLabel() {
      const e = exById(dd.value);
      label.textContent = e ? e.name : placeholder();
      btn.classList.toggle('empty', !e);
    }
    function choose(e) { dd.value = e.id; refreshLabel(); close(); btn.focus(); }
    function openIt() {
      if (dd.open) return;
      dd.open = true;
      search.value = '';
      dd.active = Math.max(0, shown().findIndex((e) => e.id === dd.value));
      draw();
      panel.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      root.classList.add('open');
      // open upward when there is not enough room below
      const r = btn.getBoundingClientRect();
      const box = root.closest('dialog') ? root.closest('dialog').getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
      const below = Math.min(window.innerHeight, box.bottom) - r.bottom, above = r.top - Math.max(0, box.top);
      const up = below < 300 && above > below;
      panel.classList.toggle('up', up);
      list.style.maxHeight = Math.max(110, Math.min(250, (up ? above : below) - 110)) + 'px';
      search.focus({ preventScroll: true });
      markActive();
    }
    function close() {
      if (!dd.open) return;
      dd.open = false;
      panel.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      root.classList.remove('open');
    }
    btn.addEventListener('click', () => (dd.open ? close() : openIt()));
    btn.addEventListener('keydown', (ev) => { if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); openIt(); } });
    search.addEventListener('input', () => { dd.active = 0; draw(); markActive(); });
    search.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); close(); btn.focus(); }
      else if (ev.key === 'ArrowDown') { ev.preventDefault(); dd.active = Math.min(dd.items.length - 1, dd.active + 1); markActive(); }
      else if (ev.key === 'ArrowUp') { ev.preventDefault(); dd.active = Math.max(0, dd.active - 1); markActive(); }
      else if (ev.key === 'Enter') { ev.preventDefault(); ev.stopPropagation(); if (dd.items[dd.active]) choose(dd.items[dd.active]); }
    });
    document.addEventListener('mousedown', (ev) => { if (dd.open && !root.contains(ev.target)) close(); });
    dd.fill = () => { if (!exById(dd.value)) dd.value = ''; refreshLabel(); if (dd.open) draw(); };
    dd.reset = () => { dd.value = ''; refreshLabel(); };
    return dd;
  }
  function fillSelect(el) { (DDS[el.id] = DDS[el.id] || makeDD(el)).fill(); }
  const selValue = (el) => (DDS[el.id] ? DDS[el.id].value : '');
  const resetSel = (el) => { if (DDS[el.id]) DDS[el.id].reset(); };
  const exById = (id) => S.data.exercises.find((e) => e.id === id);

  // new-exercise dialog: calls back with the created exercise
  let exDone = null;
  let exMuscle = 'full';
  let exKind = 'weight';
  const pressed = (box, value) => box.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === value)));
  function openExercise(done) {
    exDone = done;
    exMuscle = 'chest';
    exKind = 'weight';
    $('wkExName').value = '';
    pressed($('wkExMuscle'), exMuscle);
    pressed($('wkExKind'), exKind);
    $('wkExErr').hidden = true;
    $('wkExSave').disabled = false;
    $('wkExDialog').showModal();
    $('wkExName').focus();
  }
  async function saveExercise(event) {
    event.preventDefault();
    const name = $('wkExName').value.trim();
    const err = $('wkExErr');
    err.hidden = true;
    if (!name) { err.textContent = 'Give the exercise a name.'; err.hidden = false; return; }
    $('wkExSave').disabled = true;
    try {
      const ex = await api('/v1/workouts/exercises', { method: 'POST', body: { name, muscle: exMuscle, kind: exKind } });
      if (!exById(ex.id)) S.data.exercises.push(ex);
      S.data.exercises.sort((a, b) => a.name.localeCompare(b.name));
      $('wkExDialog').close();
      if (exDone) exDone(ex);
    } catch (e) {
      err.textContent = e.message;
      err.hidden = false;
      $('wkExSave').disabled = false;
    }
  }

  // ---- the workout screen -----------------------------------------------------------------------------------------------------------------------------
  const W = { session: null, saveTimer: 0, tick: 0, dirty: false };

  async function startSession(routineId) {
    try {
      const s = await api('/v1/workouts/sessions', { method: 'POST', body: { day: todayKey(), routine_id: routineId } });
      openSessionData(s);
    } catch (e) { toast(e.message); }
  }
  async function openSession(id) {
    try { openSessionData(await api('/v1/workouts/sessions/' + id)); } catch (e) { toast(e.message); }
  }
  function openSessionData(s) {
    W.session = s;
    W.dirty = false;
    $('wkSName').value = s.name;
    $('wkSNotes').value = s.notes || '';
    $('wkSErr').hidden = true;
    $('wkSFinish').disabled = false;
    $('wkSFinish').firstChild.textContent = s.finished_at ? 'Save changes' : 'Finish workout';
    fillSelect($('wkAddSel'));
    renderSession();
    clearInterval(W.tick);
    const timer = $('wkTimer');
    const update = () => {
      if (s.finished_at) { timer.textContent = parseDay(s.day).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }); return; }
      const sec = Math.max(0, Math.floor((Date.now() - new Date(s.started_at).getTime()) / 1000));
      timer.textContent = (sec >= 3600 ? Math.floor(sec / 3600) + ':' : '') + pad(Math.floor((sec % 3600) / 60)) + ':' + pad(sec % 60);
    };
    update();
    W.tick = setInterval(update, 1000);
    $('wkSessionDialog').showModal();
  }

  const setUnit = (g) => (g.kind === 'time' ? 'sec' : g.kind === 'reps' ? 'reps' : 'kg × reps');
  const lastText = (g) => (g.last && g.last.length ? 'Last time: ' + g.last.map((s) => (g.kind === 'weight' ? kg(s.weight) + '×' + s.reps : g.kind === 'reps' ? s.reps + ' reps' : s.seconds + 's')).join(', ') : 'First time. Set your numbers.');

  function renderSession() {
    const body = $('wkSBody');
    body.replaceChildren();
    const s = W.session;
    if (!s.groups.length) body.appendChild(make('p', 'wk-empty', 'Empty workout. Pick an exercise below to add your first sets.'));
    s.groups.forEach((g, gi) => {
      const card = make('section', 'wk-ex');
      card.style.setProperty('--hc', COLORS[gi % COLORS.length]);
      const head = make('div', 'wk-exhead');
      if (window.WkArt && WkArt.has(g.name)) {
        const th = make('button', 'wk-thumb');
        th.type = 'button';
        th.setAttribute('aria-label', 'How to do ' + g.name);
        const box = make('span', 'wk-thumbbox');
        th.appendChild(box);
        th.appendChild(make('small', '', 'How to'));
        WkArt.mount(box, g.name);
        th.addEventListener('click', () => openHow(g.name));
        head.appendChild(th);
      }
      const t = make('div', 'wk-ext');
      t.appendChild(make('p', 'wk-exn', g.name));
      t.appendChild(make('small', '', lastText(g)));
      head.appendChild(t);
      const rm = make('button', 'wk-link', 'Remove');
      rm.type = 'button';
      rm.addEventListener('click', () => { s.groups.splice(gi, 1); changed(); renderSession(); });
      head.appendChild(rm);
      card.appendChild(head);
      const done = g.sets.filter((x) => x.done).length;
      card.appendChild(make('p', 'wk-prog', done + ' of ' + g.sets.length + ' sets done'));
      const rows = make('div', 'wk-sets');
      const labels = make('div', 'wk-setrow wk-setlabels');
      labels.append(make('span', '', 'Set'), make('span', '', g.kind === 'time' ? '' : g.kind === 'weight' ? 'kg' : ''), make('span', '', g.kind === 'time' ? 'Seconds' : 'Reps'), make('span', ''), make('span', ''));
      rows.appendChild(labels);
      g.sets.forEach((st, si) => {
        const row = make('div', 'wk-setrow' + (st.done ? ' done' : ''));
        row.appendChild(make('span', 'wk-setno', String(si + 1)));
        const w = make('input', 'wk-num-in');
        w.type = 'number'; w.inputMode = 'decimal'; w.min = '0'; w.step = '0.5'; w.value = st.weight ? kg(st.weight) : ''; w.placeholder = '0';
        w.setAttribute('aria-label', g.name + ' set ' + (si + 1) + ' weight in kilograms');
        w.addEventListener('input', () => { st.weight = num(w.value); changed(); });
        if (g.kind !== 'weight') w.style.visibility = 'hidden';
        const r = make('input', 'wk-num-in');
        r.type = 'number'; r.inputMode = 'numeric'; r.min = '0'; r.value = (g.kind === 'time' ? st.seconds : st.reps) || ''; r.placeholder = '0';
        r.setAttribute('aria-label', g.name + ' set ' + (si + 1) + (g.kind === 'time' ? ' seconds' : ' reps'));
        r.addEventListener('input', () => { if (g.kind === 'time') st.seconds = Math.round(num(r.value)); else st.reps = Math.round(num(r.value)); changed(); });
        const ok = make('button', 'wk-check');
        ok.type = 'button';
        ok.setAttribute('aria-pressed', String(st.done));
        ok.setAttribute('aria-label', 'Set ' + (si + 1) + ' done');
        ok.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.5 6.6 19.5l1.2-6L3.3 9.3l6.1-.7Z"/></svg>';
        ok.addEventListener('click', () => { st.done = !st.done; changed(); renderSession(); });
        const del = make('button', 'wk-xs');
        del.type = 'button';
        del.setAttribute('aria-label', 'Remove set ' + (si + 1));
        del.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
        del.addEventListener('click', () => { g.sets.splice(si, 1); if (!g.sets.length) s.groups.splice(gi, 1); changed(); renderSession(); });
        row.append(w, r, ok, del);
        rows.appendChild(row);
      });
      card.appendChild(rows);
      const more = make('button', 'wk-chipbtn wk-addset', '+ Set');
      more.type = 'button';
      more.addEventListener('click', () => {
        const last = g.sets[g.sets.length - 1];
        g.sets.push(last ? { reps: last.reps, weight: last.weight, seconds: last.seconds, done: false } : { reps: 0, weight: 0, seconds: 0, done: false });
        changed();
        renderSession();
      });
      card.appendChild(more);
      body.appendChild(card);
    });
  }

  function changed() {
    W.dirty = true;
    clearTimeout(W.saveTimer);
    W.saveTimer = setTimeout(flush, 700);
  }
  async function flush() {
    clearTimeout(W.saveTimer);
    if (!W.session || !W.dirty) return;
    W.dirty = false;
    const sets = W.session.groups.flatMap((g) => g.sets.map((x) => ({ exercise_id: g.exercise_id, reps: x.reps || 0, weight: x.weight || 0, seconds: x.seconds || 0, done: !!x.done })));
    try { await api('/v1/workouts/sessions/' + W.session.id + '/sets', { method: 'PUT', body: { sets } }); } catch (e) { W.dirty = true; toast(e.message); }
  }

  function addExerciseToSession(ex) {
    const s = W.session;
    if (s.groups.some((g) => g.exercise_id === ex.id)) { toast(ex.name + ' is already in this workout.'); return; }
    s.groups.push({ exercise_id: ex.id, name: ex.name, kind: ex.kind, muscle: ex.muscle, last: [], sets: [{ reps: ex.kind === 'weight' ? 8 : ex.kind === 'reps' ? 10 : 0, weight: 0, seconds: ex.kind === 'time' ? 30 : 0, done: false }] });
    // look up what you did last time so the first set starts from there
    api('/v1/workouts/exercises/' + ex.id + '/history').then((h) => {
      const prev = h.history[h.history.length - 1];
      const g = s.groups.find((x) => x.exercise_id === ex.id);
      if (prev && g && !g.sets[0].done && W.session === s) {
        g.sets[0] = { reps: prev.reps || g.sets[0].reps, weight: prev.weight || 0, seconds: prev.seconds || g.sets[0].seconds, done: false };
        g.last = [{ reps: prev.reps, weight: prev.weight, seconds: prev.seconds }];
        changed();
        renderSession();
      }
    }).catch(() => {});
    changed();
    renderSession();
  }

  async function closeSession() {
    await flush();
    clearInterval(W.tick);
    $('wkSessionDialog').close();
    W.session = null;
    await load().catch(() => {});
  }
  async function finishSession(event) {
    event.preventDefault();
    const s = W.session;
    const err = $('wkSErr');
    err.hidden = true;
    $('wkSFinish').disabled = true;
    try {
      await flush();
      await api('/v1/workouts/sessions/' + s.id, { method: 'PATCH', body: { name: $('wkSName').value.trim() || 'Workout', notes: $('wkSNotes').value.trim(), finish: true } });
      const sets = s.groups.reduce((n, g) => n + g.sets.filter((x) => x.done).length, 0);
      clearInterval(W.tick);
      $('wkSessionDialog').close();
      W.session = null;
      toast(s.finished_at ? 'Saved' : 'Workout done. ' + sets + (sets === 1 ? ' set' : ' sets') + ' logged.');
      await load();
    } catch (e) {
      err.textContent = e.message;
      err.hidden = false;
      $('wkSFinish').disabled = false;
    }
  }
  let sArmed = 0;
  async function deleteSession() {
    const del = $('wkSDelete');
    if (!sArmed) {
      sArmed = setTimeout(() => { sArmed = 0; del.classList.remove('sure'); del.textContent = 'Delete this workout'; }, 4000);
      del.classList.add('sure');
      del.textContent = 'Sure? Tap again to delete';
      return;
    }
    clearTimeout(sArmed);
    sArmed = 0;
    try {
      clearTimeout(W.saveTimer);
      W.dirty = false;
      await api('/v1/workouts/sessions/' + W.session.id, { method: 'DELETE' });
      clearInterval(W.tick);
      $('wkSessionDialog').close();
      W.session = null;
      toast('Workout deleted');
      await load();
    } catch (e) { toast(e.message); }
  }

  // ---- how-to animation -----------------------------------------------------------------------------------------------------------------------
  let howArt = null;
  function openHow(name) {
    if (howArt) howArt.stop();
    howArt = WkArt.mount($('wkHowArt'), name);
    if (!howArt) return;
    $('wkHowTitle').textContent = howArt.title;
    const ol = $('wkHowTips');
    ol.replaceChildren(...howArt.tips.map((t) => make('li', '', t)));
    $('wkHowDialog').showModal();
  }

  // ---- routine dialog ---------------------------------------------------------------------------------------------------------------------------------------
  let editingRoutine = null;
  let items = [];
  let rArmed = 0;
  function openRoutine(r) {
    editingRoutine = r;
    items = r ? r.items.map((i) => ({ exercise_id: i.exercise_id, sets: i.sets, reps: i.reps, weight: i.weight, seconds: i.seconds })) : [];
    $('wkRoutineTitle').textContent = r ? 'Edit routine' : 'New routine';
    $('wkRName').value = r ? r.name : '';
    const planned = new Set(r ? r.days || [] : []);
    $('wkRDays').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(planned.has(Number(b.dataset.d)))));
    $('wkRErr').hidden = true;
    $('wkRSave').disabled = false;
    const del = $('wkRDelete');
    del.hidden = !r;
    del.classList.remove('sure');
    del.textContent = 'Delete this routine';
    fillSelect($('wkRSel'));
    drawItems();
    $('wkRoutineDialog').showModal();
    $('wkRName').focus();
  }
  function drawItems() {
    const box = $('wkRItems');
    box.replaceChildren();
    if (!items.length) box.appendChild(make('p', 'wk-empty wk-empty-in', 'No exercises yet. Add some below.'));
    items.forEach((it, i) => {
      const ex = exById(it.exercise_id) || { name: '?', kind: 'weight' };
      const row = make('div', 'wk-ritem');
      row.appendChild(make('span', 'wk-rin', ex.name));
      const mk = (label, val, set, step) => {
        const w = make('label', 'wk-rfield');
        w.appendChild(make('small', '', label));
        const inp = make('input', 'wk-num-in');
        inp.type = 'number'; inp.min = '0'; inp.step = step || '1'; inp.value = val || ''; inp.placeholder = '0';
        inp.addEventListener('input', () => set(num(inp.value)));
        w.appendChild(inp);
        return w;
      };
      row.appendChild(mk('Sets', it.sets, (v) => { it.sets = Math.max(1, Math.round(v)); }));
      if (ex.kind === 'time') row.appendChild(mk('Sec', it.seconds, (v) => { it.seconds = Math.round(v); }));
      else {
        row.appendChild(mk('Reps', it.reps, (v) => { it.reps = Math.round(v); }));
        if (ex.kind === 'weight') row.appendChild(mk('kg', it.weight, (v) => { it.weight = v; }, '0.5'));
      }
      const up = make('button', 'wk-xs');
      up.type = 'button'; up.setAttribute('aria-label', 'Move up'); up.disabled = i === 0;
      up.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>';
      up.addEventListener('click', () => { [items[i - 1], items[i]] = [items[i], items[i - 1]]; drawItems(); });
      const rm = make('button', 'wk-xs');
      rm.type = 'button'; rm.setAttribute('aria-label', 'Remove ' + ex.name);
      rm.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
      rm.addEventListener('click', () => { items.splice(i, 1); drawItems(); });
      row.append(up, rm);
      box.appendChild(row);
    });
  }
  function addRoutineExercise(ex) {
    items.push({ exercise_id: ex.id, sets: 3, reps: ex.kind === 'reps' ? 10 : ex.kind === 'time' ? 0 : 8, weight: 0, seconds: ex.kind === 'time' ? 30 : 0 });
    fillSelect($('wkRSel'));
    drawItems();
  }
  async function saveRoutine(event) {
    event.preventDefault();
    const name = $('wkRName').value.trim();
    const err = $('wkRErr');
    err.hidden = true;
    if (!name) { err.textContent = 'Give the routine a name.'; err.hidden = false; return; }
    $('wkRSave').disabled = true;
    const days = [...$('wkRDays').querySelectorAll('button[aria-pressed="true"]')].map((b) => Number(b.dataset.d));
    const body = { name, days, items };
    try {
      if (editingRoutine) await api('/v1/workouts/routines/' + editingRoutine.id, { method: 'PUT', body });
      else await api('/v1/workouts/routines', { method: 'POST', body });
      $('wkRoutineDialog').close();
      toast(editingRoutine ? 'Saved' : 'Routine added');
      await load();
    } catch (e) {
      err.textContent = e.message;
      err.hidden = false;
      $('wkRSave').disabled = false;
    }
  }
  async function deleteRoutine() {
    const del = $('wkRDelete');
    if (!rArmed) {
      rArmed = setTimeout(() => { rArmed = 0; del.classList.remove('sure'); del.textContent = 'Delete this routine'; }, 4000);
      del.classList.add('sure');
      del.textContent = 'Sure? Your logged workouts stay';
      return;
    }
    clearTimeout(rArmed);
    rArmed = 0;
    try {
      await api('/v1/workouts/routines/' + editingRoutine.id, { method: 'DELETE' });
      $('wkRoutineDialog').close();
      toast('Routine deleted');
      await load();
    } catch (e) { toast(e.message); }
  }

  // ---- stars trail the pointer (same as the other pages) ---------------------------------------------------------------------------------------
  function sparkTrail() {
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const SP = 'M0,-1 C.15,-.3 .3,-.15 1,0 C.3,.15 .15,.3 0,1 C-.15,.3 -.3,.15 -1,0 C-.3,-.15 -.15,-.3 0,-1Z';
    const layer = make('div', 'wk-trail');
    document.body.appendChild(layer);
    const LIGHT = ['#ff5e32', '#1a0088', '#fffdf6'];
    const DARK = ['#c1ff1a', '#ff9ccf', '#efe7d4'];
    let last = 0, lx = -99, ly = -99;
    document.addEventListener('pointermove', (event) => {
      if (event.pointerType === 'touch') return;
      const now = performance.now();
      if (now - last < 55 || Math.hypot(event.clientX - lx, event.clientY - ly) < 18) return;
      const target = event.target;
      if (target.closest && target.closest('dialog, input, button, select')) return;
      last = now; lx = event.clientX; ly = event.clientY;
      const surface = target.closest ? target.closest('.wk-fig') : null;
      let dark = false;
      if (surface) {
        const m = getComputedStyle(surface).backgroundColor.match(/\d+(\.\d+)?/g);
        if (m) dark = (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]) < 110;
      }
      const colors = dark ? DARK : LIGHT;
      const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      s.setAttribute('viewBox', '-1 -1 2 2');
      s.setAttribute('class', 'wk-bs');
      s.innerHTML = '<path d="' + SP + '"/>';
      const size = 12 + Math.random() * 16;
      s.style.cssText = 'left:' + event.clientX + 'px;top:' + event.clientY + 'px;width:' + size + 'px;height:' + size + 'px;color:' + colors[Math.floor(Math.random() * 3)] +
        ';--dx:' + (Math.random() * 40 - 20).toFixed(0) + 'px;--dy:' + (Math.random() * 30 - 8).toFixed(0) + 'px';
      s.addEventListener('animationend', () => s.remove());
      layer.appendChild(s);
    });
  }

  function init() {
    sparkTrail();
    $('wkSessionClose').addEventListener('click', closeSession);
    $('wkSessionDialog').addEventListener('cancel', (e) => { e.preventDefault(); closeSession(); });
    $('wkRoutineClose').addEventListener('click', () => $('wkRoutineDialog').close());
    $('wkHowClose').addEventListener('click', () => $('wkHowDialog').close());
    $('wkHowDialog').addEventListener('close', () => { if (howArt) { howArt.stop(); howArt = null; } });
    $('wkHowDialog').addEventListener('click', (e) => { if (e.target === $('wkHowDialog')) $('wkHowDialog').close(); });
    $('wkExClose').addEventListener('click', () => $('wkExDialog').close());
    ['wkRoutineDialog', 'wkExDialog'].forEach((id) => $(id).addEventListener('click', (e) => { if (e.target === $(id)) $(id).close(); }));
    $('wkSessionForm').addEventListener('submit', finishSession);
    $('wkSDelete').addEventListener('click', deleteSession);
    $('wkSName').addEventListener('change', async () => { if (W.session) { try { await api('/v1/workouts/sessions/' + W.session.id, { method: 'PATCH', body: { name: $('wkSName').value.trim() || 'Workout' } }); } catch (e) { toast(e.message); } } });
    $('wkSNotes').addEventListener('change', async () => { if (W.session) { try { await api('/v1/workouts/sessions/' + W.session.id, { method: 'PATCH', body: { notes: $('wkSNotes').value.trim() } }); } catch (e) { toast(e.message); } } });
    $('wkAddBtn').addEventListener('click', () => { const ex = exById(selValue($('wkAddSel'))); if (!ex) { toast('Pick an exercise first.'); return; } addExerciseToSession(ex); resetSel($('wkAddSel')); });
    $('wkNewEx').addEventListener('click', () => openExercise((ex) => { fillSelect($('wkAddSel')); addExerciseToSession(ex); }));
    $('wkRoutineForm').addEventListener('submit', saveRoutine);
    $('wkRDays').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true')); });
    $('wkRDelete').addEventListener('click', deleteRoutine);
    $('wkRAdd').addEventListener('click', () => { const ex = exById(selValue($('wkRSel'))); if (!ex) { toast('Pick an exercise first.'); return; } addRoutineExercise(ex); resetSel($('wkRSel')); });
    $('wkRNewEx').addEventListener('click', () => openExercise((ex) => addRoutineExercise(ex)));
    $('wkExForm').addEventListener('submit', saveExercise);
    $('wkExMuscle').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { exMuscle = b.dataset.v; pressed($('wkExMuscle'), exMuscle); } });
    $('wkExKind').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { exKind = b.dataset.v; pressed($('wkExKind'), exKind); } });
    load().catch(() => {
      $('wkGrid').hidden = true;
      $('wkEmpty').textContent = 'Could not load your workouts right now.';
      $('wkEmpty').hidden = false;
    });
  }

  init();
})();
