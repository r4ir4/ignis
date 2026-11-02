// Habits page: a daily checklist, a week view and a 30-day view, backed by the shared ignis API.
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(2, '0');
  const dayKey = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const make = (tag, cls, text) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  };

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
    toastTimer = setTimeout(() => { el.hidden = true; }, 2400);
  }

  const S = { habits: [], today: dayKey(new Date()) };

  async function load() {
    S.today = dayKey(new Date());
    const data = await api('/v1/habits/overview?today=' + S.today + '&window=60');
    S.habits = data.habits;
    render();
  }

  const statusOf = (h, day) => { const c = h.days[day] || 0; return c >= h.target_count ? 'done' : c > 0 ? 'part' : ''; };

  // ---- identity-board style: periwinkle board, lime word card, tag pills, navy and eggshell cards ----------------------------------------
  const COLORS = ['#dde22b', '#efe7d4', '#f2b3da', '#ff7a4d', '#9fb0f0'];
  const STAR_SVG = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16.00,5.00 L19.29,12.47 L27.41,13.29 L21.33,18.73 L23.05,26.71 L16.00,22.60 L8.95,26.71 L10.67,18.73 L4.59,13.29 L12.71,12.47Z"/></svg>';
  // the four ways to count a habit: how much one tap adds, and the limits of the daily goal in the dialog
  const KINDS = {
    check: { label: 'Check-in', goal: 'Times a day', step: 1, min: 1, max: 20, def: 1, quick: 1 },
    count: { label: 'Count', goal: 'Goal per day', step: 1, min: 1, max: 999, def: 8, quick: 1 },
    time: { label: 'Time', goal: 'Minutes a day', step: 5, min: 5, max: 720, def: 30, quick: 0 },
    steps: { label: 'Steps', goal: 'Steps a day', step: 500, min: 500, max: 100000, def: 8000, quick: 0 },
  };
  const kindOf = (h) => KINDS[h.kind] || KINDS.check;
  const clock = (m) => (m >= 60 ? Math.floor(m / 60) + 'h' + (m % 60 ? ' ' + (m % 60) + 'm' : '') : m + ' min');
  // an amount as the habit measures it: "3 / 8 glasses", "45 min / 1h", "4,200 / 8,000 steps"
  function amount(h, n) {
    if (h.kind === 'time') return clock(n) + ' / ' + clock(h.target_count);
    if (h.kind === 'steps') return n.toLocaleString() + ' / ' + h.target_count.toLocaleString() + ' steps';
    if (h.kind === 'count') return n + ' / ' + h.target_count + (h.unit ? ' ' + h.unit : '');
    return n + ' of ' + h.target_count + ' today';
  }
  const plural = (n, one, many) => (n === 1 ? one : many);
  const ago = (d, key) => d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }) + ' · ' + key;

  function figure(cls) { return make('figure', 'hab-fig ' + cls); }
  function emptyIn(c, text) { c.appendChild(make('p', 'hab-empty', text)); return c; }

  // the lime word card: the page name in the goo lettering
  function wordCard() {
    const f = figure('hab-word grain');
    f.innerHTML = '<svg viewBox="0 0 600 200" aria-hidden="true"><g filter="url(#goo)"><text x="300" y="135" text-anchor="middle" transform="rotate(-4 300 100)" class="goo-word">habits</text></g></svg>' +
      '<svg class="h-tw hab-tw" style="--x:5%;--y:14%;--s:20px;--d:0s" viewBox="0 0 32 32" aria-hidden="true"><use href="#spark"/></svg><svg class="h-tw hab-tw hab-tw-p" style="--x:90%;--y:70%;--s:16px;--d:.9s" viewBox="0 0 32 32" aria-hidden="true"><use href="#spark"/></svg><svg class="h-tw hab-tw" style="--x:89%;--y:12%;--s:12px;--d:1.7s" viewBox="0 0 32 32" aria-hidden="true"><use href="#spark"/></svg><svg class="h-tw hab-tw hab-tw-p" style="--x:6%;--y:72%;--s:14px;--d:2.3s" viewBox="0 0 32 32" aria-hidden="true"><use href="#spark"/></svg>';
    return f;
  }

  // four pills with the headline numbers
  function tags() {
    const total = S.habits.length;
    const done = S.habits.filter((h) => h.done_today).length;
    const now = Math.max(0, ...S.habits.map((h) => h.streak));
    const best = Math.max(0, ...S.habits.map((h) => h.best_streak));
    const total30 = S.habits.reduce((n, h) => n + h.done_30, 0);
    const ul = make('ul', 'hab-tags');
    ul.setAttribute('aria-label', 'At a glance');
    const FLAME = 'M17 4C18 10 12 12 13 17C15 16 16 14 17 12C17 16 23 18 23 23C23 27 20 29 16 29C12 29 8 26 8 21C8 14 15 11 17 4Z';
    const FLAME_FRAMES = 'M17 4C18 10 12 12 13 17C15 16 16 14 17 12C17 16 23 18 23 23C23 27 20 29 16 29C12 29 8 26 8 21C8 14 15 11 17 4Z;M15 3C17 9 11 12 12 17C14 16 15 14 16 11C17 16 23 18 23 23C23 27 20 29 16 29C12 29 8 26 8 21C8 14 13 10 15 3Z;M17 4C18 10 12 12 13 17C15 16 16 14 17 12C17 16 23 18 23 23C23 27 20 29 16 29C12 29 8 26 8 21C8 14 15 11 17 4Z;M19 4C19 10 13 12 14 17C16 16 17 14 18 11C18 16 24 18 23 23C23 27 20 29 16 29C12 29 8 26 8 21C8 14 16 11 19 4Z;M17 2C17 9 12 12 13 17C15 15 16 13 17 10C17 15 23 18 23 23C23 27 20 29 16 29C12 29 8 26 8 21C8 14 15 9 17 2Z;M17 4C18 10 12 12 13 17C15 16 16 14 17 12C17 16 23 18 23 23C23 27 20 29 16 29C12 29 8 26 8 21C8 14 15 11 17 4Z';
    const lit = now > 0;
    const fire = make('li', 't2 hab-fire' + (lit ? ' lit' : ''));
    fire.innerHTML = '<svg class="hab-flame" viewBox="2 -2 28 36" aria-hidden="true"><circle class="hab-halo" cx="16" cy="21" r="14"/><path class="hab-fbody" d="' + FLAME + '">' + (lit ? '<animate attributeName="d" dur="2.4s" repeatCount="indefinite" calcMode="spline" keyTimes="0;.2;.4;.6;.8;1" keySplines=".45 0 .55 1;.45 0 .55 1;.45 0 .55 1;.45 0 .55 1;.45 0 .55 1" values="' + FLAME_FRAMES + '"/>' : '') + '</path><path class="hab-fcore" d="M16 19C16 22 13 23 13 25C13 27 14 28 16 28C18 28 19 27 19 25C19 23 17 22 16 19Z">' + (lit ? '<animate attributeName="fill" dur="1.2s" repeatCount="indefinite" values="#ffca26;#ff5e32;#ffca26"/>' : '') + '</path>' +
      (lit ? '<circle class="hab-ember" cx="10" cy="14" r="1" style="--dx:-4px;--t:2.1s;--d:0s"/><circle class="hab-ember" cx="22" cy="12" r="1.1" style="--dx:5px;--t:2.5s;--d:.7s"/><circle class="hab-ember" cx="16" cy="6" r=".9" style="--dx:2px;--t:1.9s;--d:1.2s"/><circle class="hab-ember e2" cx="25" cy="20" r=".8" style="--dx:4px;--t:2.3s;--d:.3s"/>' : '') + '</svg>';
    const txt = make('span', 'hab-ftxt');
    txt.appendChild(make('b', '', String(now)));
    fire.appendChild(txt);
    fire.setAttribute('aria-label', now + (now === 1 ? '-day streak' : '-day streak'));
    fire.title = lit ? 'Your longest streak right now' : 'Check in today to start a streak';
    // a tile with a small label, a giant counted-up numeral and a bit of motion on the right
    const tile = (cls, label, value, suffix, deco) => {
      const li = make('li', cls + ' hab-tile');
      const left = make('span', 'hab-tl');
      left.appendChild(make('small', '', label));
      const b = make('b', 'hab-num');
      const num = make('span', '', '0');
      b.appendChild(num);
      if (suffix) b.appendChild(make('em', '', suffix));
      left.appendChild(b);
      li.appendChild(left);
      const art = make('span', 'hab-art');
      art.setAttribute('aria-hidden', 'true');
      art.innerHTML = deco;
      li.appendChild(art);
      li.setAttribute('aria-label', label + ': ' + value + (suffix || ''));
      const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduce || !value) num.textContent = String(value);
      else {
        const t0 = performance.now();
        const tick = (t) => {
          const k = Math.min(1, (t - t0) / 700);
          num.textContent = String(Math.round(value * (1 - Math.pow(1 - k, 3))));
          if (k < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }
      return li;
    };
    const STAR5 = 'M16 5L19.29 12.47L27.41 13.29L21.33 18.73L23.05 26.71L16 22.6L8.95 26.71L10.67 18.73L4.59 13.29L12.71 12.47Z';
    const stars = Array.from({ length: Math.min(total, 8) }, (_, i) => '<svg class="hab-ms' + (i < done ? ' on' : '') + '" style="--i:' + i + '" viewBox="0 0 32 32"><path d="' + STAR5 + '"/></svg>').join('');
    const flower = '<svg class="hab-trophy" viewBox="0 0 64 64"><path class="hab-handles" d="M20 12H11V18C11 25 15 29 21 29M44 12H53V18C53 25 49 29 43 29"/><path d="M19 7H45V26C45 35 39 41 32 41C25 41 19 35 19 26Z"/><path d="M29 41H35V49H29Z"/><path d="M19 50H45V58H19Z"/><path class="hab-tstar" d="M32 14L34.4 19.6L40.5 20.2L35.9 24.2L37.3 30.2L32 27L26.7 30.2L28.1 24.2L23.5 20.2L29.6 19.6Z"/><path class="hab-shine" d="M53 4C53.6 8 55 9.4 59 10C55 10.6 53.6 12 53 16C52.4 12 51 10.6 47 10C51 9.4 52.4 8 53 4Z"/></svg>';
    // completion rate: of every habit that existed on each of the last 30 days, how many got done
    let possible = 0, got = 0;
    for (let i = 0; i < 30; i++) {
      const key = dayKey(addDays(new Date(), -i));
      S.habits.forEach((h) => {
        if (h.created_at.slice(0, 10) <= key || (h.days[key] || 0) > 0) { possible += 1; if ((h.days[key] || 0) >= h.target_count) got += 1; }
      });
    }
    const rate = possible ? Math.round((got / possible) * 100) : 0;
    const ring = '<svg class="hab-ring" viewBox="0 0 64 64"><circle class="hab-rtrack" cx="32" cy="32" r="25"/><circle class="hab-rfill" cx="32" cy="32" r="25" pathLength="100" style="--p:' + rate + '"/><path class="hab-rspark" d="M32 24C32.6 29 35 31.4 40 32C35 32.6 32.6 35 32 40C31.4 35 29 32.6 24 32C29 31.4 31.4 29 32 24Z"/></svg>';
    [tile('t1', 'Today', done, total ? ' / ' + total : '', '<span class="hab-mstars">' + stars + '</span>'), fire, tile('t3', 'Best streak', best, '', flower), tile('t4', 'Last 30 days', rate, '%', ring)].forEach((x) => ul.appendChild(x));
    return ul;
  }

  // navy card: today's count, then the list
  function listCard() {
    const c = figure('hab-list-card');
    const total = S.habits.length;
    const done = S.habits.filter((h) => h.done_today).length;
    const head = make('div', 'hab-head');
    const when = make('p', 'hab-k', new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' }));
    head.appendChild(when);
    const add = make('button', 'hab-mini');
    add.innerHTML = '<span class="hab-plus" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></span><span>New habit</span>';
    add.type = 'button';
    add.addEventListener('click', () => openDialog(null));
    head.appendChild(add);
    c.appendChild(head);
    const big = make('p', 'hab-big');
    big.appendChild(make('b', '', String(done)));
    big.appendChild(make('small', '', 'of ' + total));
    c.appendChild(big);
    const prog = make('div', 'hab-prog');
    const fill = make('i');
    prog.appendChild(fill);
    requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = (total ? (done / total) * 100 : 0) + '%'; }));
    c.appendChild(prog);
    if (!total) return emptyIn(c, 'No habits yet. Add the first one you want to keep up with.');
    const list = make('ul', 'hab-list');
    const groups = [...new Set(S.habits.map((h) => h.section || ''))];
    groups.forEach((g, gi) => {
      if (groups.length > 1) { const gl = make('li', 'hab-group g' + (gi % 3), g || 'Everything else'); list.appendChild(gl); }
      S.habits.filter((h) => (h.section || '') === g).forEach((h) => list.appendChild(row(h)));
    });
    c.appendChild(list);
    return c;
  }

  function row(h) {
    const idx = S.habits.indexOf(h);
    const li = make('li', 'hab-row' + (h.done_today ? ' done' : h.count_today > 0 ? ' part' : ''));
    li.style.setProperty('--hc', COLORS[idx % COLORS.length]);
    li.appendChild(make('i', 'hab-bullet'));
    const name = make('div', 'hab-name', h.name);
    if (h.target_count > 1 || h.kind !== 'check') name.appendChild(make('small', '', amount(h, h.count_today) + (h.kind === 'steps' ? '' : h.kind === 'check' ? '' : ' today')));
    li.appendChild(name);
    if (h.streak >= 2) li.appendChild(make('span', 'hab-streak', h.streak + ' days'));
    if (h.kind === 'time') li.appendChild(timerButton(h));
    const edit = make('button', 'hab-edit', 'Edit');
    edit.type = 'button';
    edit.addEventListener('click', () => openDialog(h));
    li.appendChild(edit);
    return li;
  }

  // navy card: the week, one row per habit
  function weekCard() {
    const c = figure('hab-week-card');
    c.appendChild(make('p', 'hab-k', 'This week'));
    if (!S.habits.length) return emptyIn(c, 'Your week fills in as you tick habits off.');
    const days = Array.from({ length: 7 }, (_, i) => addDays(new Date(), i - 6));
    const grid = make('div', 'hab-week');
    const head = make('div', 'hab-wrow');
    head.appendChild(make('span'));
    days.forEach((d) => head.appendChild(make('span', 'hab-dow' + (dayKey(d) === S.today ? ' now' : ''), d.toLocaleDateString(undefined, { weekday: 'narrow' }))));
    grid.appendChild(head);
    S.habits.forEach((h, idx) => {
      const r = make('div', 'hab-wrow');
      r.style.setProperty('--hc', COLORS[idx % COLORS.length]);
      r.appendChild(make('span', 'hab-wname', h.name));
      days.forEach((d) => {
        const key = dayKey(d);
        const cell = make('button', 'hab-cell ' + statusOf(h, key) + (key === S.today ? ' now' : ''));
        cell.type = 'button';
        cell.innerHTML = STAR_SVG;
        const n = h.days[key] || 0;
        cell.title = ago(d, amount(h, n).replace(' today', ''));
        cell.setAttribute('aria-label', h.name + ', ' + d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }) + ': ' + amount(h, n).replace(' today', '') + (h.kind === 'steps' ? '. Comes from Health.' : h.kind === 'time' ? '. Tracked with the timer.' : '. Tap to change.'));
        if (h.kind === 'steps' || h.kind === 'time') { cell.disabled = true; cell.classList.add('ro'); }
        else {
          if (n > 0 && n < h.target_count && h.target_count <= 9) cell.appendChild(make('span', 'hab-cn', n + '/' + h.target_count));
          cell.addEventListener('click', () => stepDay(h, key));
        }
        r.appendChild(cell);
      });
      grid.appendChild(r);
    });
    c.appendChild(grid);
    return c;
  }

  // eggshell card: the last 30 days, one square each
  function monthCard() {
    const c = figure('hab-month-card');
    c.appendChild(make('p', 'hab-k', 'Last 30 days'));
    if (!S.habits.length) return emptyIn(c, 'Nothing to show yet.');
    const grid = make('div', 'hab-month');
    for (let i = 29; i >= 0; i--) {
      const d = addDays(new Date(), -i);
      const key = dayKey(d);
      const live = S.habits.filter((h) => h.created_at.slice(0, 10) <= key || (h.days[key] || 0) > 0);
      const done = live.filter((h) => (h.days[key] || 0) >= h.target_count).length;
      const part = live.some((h) => (h.days[key] || 0) > 0);
      const ratio = live.length ? done / live.length : 0;
      const level = ratio >= 1 ? 'l3' : ratio >= 0.5 ? 'l2' : part || done ? 'l1' : '';
      const sq = make('div', 'hab-sq ' + level + (i === 0 ? ' now' : ''), String(d.getDate()));
      sq.title = ago(d, done + ' of ' + live.length + ' done');
      grid.appendChild(sq);
    }
    c.appendChild(grid);
    return c;
  }

  function render() {
    const board = make('div', 'identity hab-board');
    const g = make('div', 'hab-idgrid');
    const side = make('div', 'hab-side');
    side.append(weekCard(), monthCard());
    g.append(wordCard(), tags(), listCard(), side);
    board.appendChild(g);
    $('habGrid').replaceChildren(board);
  }


  // ---- timers for "time" habits: start, stop, and the minutes are added to the day it was started ----------------------------------------
  const TIMER_KEY = 'ignis.habits.timers';
  function timers() { try { return JSON.parse(localStorage.getItem(TIMER_KEY) || '{}') || {}; } catch (e) { return {}; } }
  function saveTimers(t) { try { localStorage.setItem(TIMER_KEY, JSON.stringify(t)); } catch (e) { /* private mode: the timer just will not survive a reload */ } }
  const clockText = (ms) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    return (h ? h + ':' + pad(m) : m) + ':' + pad(r);
  };
  function timerButton(h) {
    const started = timers()[h.id];
    const b = make('button', 'hab-timer' + (started ? ' on' : ''));
    b.type = 'button';
    b.dataset.id = h.id;
    b.setAttribute('aria-label', (started ? 'Stop timer for ' : 'Start timer for ') + h.name);
    b.innerHTML = '<span class="hab-tico" aria-hidden="true">' + (started ? '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>' : '<svg viewBox="0 0 24 24"><path d="M8 5l11 7-11 7Z"/></svg>') + '</span>';
    const t = make('span', 'hab-clock', started ? clockText(Date.now() - started) : 'Start');
    if (started) t.dataset.since = started;
    b.appendChild(t);
    b.addEventListener('click', () => toggleTimer(h));
    return b;
  }
  async function toggleTimer(h) {
    const all = timers();
    if (!all[h.id]) { all[h.id] = Date.now(); saveTimers(all); render(); return; }
    const since = all[h.id];
    const mins = Math.max(1, Math.round((Date.now() - since) / 60000));
    const day = dayKey(new Date(since));
    delete all[h.id];
    saveTimers(all);
    const total = (h.days[day] || 0) + mins;
    h.days[day] = total;
    if (day === S.today) { h.count_today = total; h.done_today = total >= h.target_count; }
    render();
    try {
      await api('/v1/habits/' + h.id + '/days/' + day, { method: 'PUT', body: { count: total } });
      toast('Added ' + clock(mins));
      await load();
    } catch (e) { toast(e.message); await load().catch(() => {}); }
  }
  // the running clocks tick once a second
  setInterval(() => {
    document.querySelectorAll('.hab-clock[data-since]').forEach((el) => { el.textContent = clockText(Date.now() - Number(el.dataset.since)); });
  }, 1000);

  // ---- ticking ----------------------------------------------------------------------------------------------------------------------------
  const step = (h) => stepDay(h, S.today);
  // tick a habit on any shown day: one more time, back to none once the daily target is reached
  async function stepDay(h, day) {
    const quick = kindOf(h).quick;
    if (!quick) return;
    const prev = h.days[day] || 0;
    const next = prev >= h.target_count ? 0 : Math.min(h.target_count, prev + quick);
    const apply = (n) => {
      if (n) h.days[day] = n; else delete h.days[day];
      if (day === S.today) { h.count_today = n; h.done_today = n >= h.target_count; }
    };
    apply(next);
    render();
    try {
      await api('/v1/habits/' + h.id + '/days/' + day, { method: 'PUT', body: { count: next } });
      await load();
    } catch (e) {
      apply(prev);
      render();
      toast(e.message);
    }
  }

  // ---- add / edit dialog ------------------------------------------------------------------------------------------------------------------
  // the big number, a short unit line, and (for small goals) a row of dots previewing the daily check-ins
  function showTarget(bump) {
    const K = KINDS[kind];
    const num = $('habTarget');
    num.textContent = kind === 'steps' ? target.toLocaleString() : target;
    $('habTargetLabel').textContent = K.goal;
    $('habUnitRow').hidden = kind !== 'count';
    $('habNote').textContent = kind === 'time' ? (target >= 60 ? '= ' + clock(target) + ' · tracked with a timer' : 'minutes · tracked with a timer') : kind === 'steps' ? 'filled in from your Health data' : kind === 'count' ? ($('habUnit').value.trim() || 'per day') : '';
    const dots = (kind === 'check' || kind === 'count') && target <= 12 ? target : 0;
    $('habDots').replaceChildren(...Array.from({ length: dots }, (_, i) => { const d = make('i'); d.style.setProperty('--i', i); return d; }));
    document.querySelectorAll('#habTypes button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === kind)));
    if (bump) { num.classList.remove('bump'); void num.offsetWidth; num.classList.add('bump'); }
  }
  let editing = null;
  let target = 1;
  let kind = 'check';
  let armed = 0;
  function openDialog(h) {
    editing = h;
    kind = h ? h.kind || 'check' : 'check';
    target = h ? h.target_count : KINDS.check.def;
    $('habDlgTitle').textContent = h ? 'Edit habit' : 'New habit';
    $('habName').value = h ? h.name : '';
    $('habSection').value = h && h.section ? h.section : '';
    $('habUnit').value = h && h.unit && h.kind === 'count' ? h.unit : '';
    showTarget(false);
    $('habErr').hidden = true;
    $('habSave').disabled = false;
    const del = $('habDelete');
    del.hidden = !h;
    del.classList.remove('sure');
    del.textContent = 'Delete this habit';
    $('habDialog').showModal();
    $('habName').focus();
  }

  async function save(event) {
    event.preventDefault();
    const name = $('habName').value.trim();
    const err = $('habErr');
    err.hidden = true;
    if (!name) { err.textContent = 'Give the habit a name.'; err.hidden = false; return; }
    $('habSave').disabled = true;
    const unit = kind === 'count' ? $('habUnit').value.trim() : kind === 'time' ? 'min' : kind === 'steps' ? 'steps' : '';
    const body = { name, section: $('habSection').value.trim() || null, kind, unit, target_count: target };
    try {
      if (editing) await api('/v1/habits/' + editing.id, { method: 'PATCH', body: { ...body, section: body.section || '' } });
      else await api('/v1/habits', { method: 'POST', body });
      $('habDialog').close();
      toast(editing ? 'Saved' : 'Habit added');
      await load();
    } catch (e) {
      err.textContent = e.message;
      err.hidden = false;
      $('habSave').disabled = false;
    }
  }

  async function remove() {
    const del = $('habDelete');
    if (!armed) {
      armed = setTimeout(() => { armed = 0; del.classList.remove('sure'); del.textContent = 'Delete this habit'; }, 4000);
      del.classList.add('sure');
      del.textContent = 'Sure? This also deletes its history';
      return;
    }
    clearTimeout(armed);
    armed = 0;
    try {
      await api('/v1/habits/' + editing.id, { method: 'DELETE' });
      $('habDialog').close();
      toast('Habit deleted');
      await load();
    } catch (e) { toast(e.message); }
  }


  // ---- stars trail the pointer across the page (same as the Meds page) ------------------------------------------------------------------
  function sparkTrail() {
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const STAR = 'M0,-1 C.15,-.3 .3,-.15 1,0 C.3,.15 .15,.3 0,1 C-.15,.3 -.3,.15 -1,0 C-.3,-.15 -.15,-.3 0,-1Z';
    const layer = make('div', 'hab-trail');
    document.body.appendChild(layer);
    const LIGHT = ['#f2b3da', '#12287f', '#fffdf6'];
    const DARK = ['#f2b3da', '#dde22b', '#efe7d4'];
    let last = 0, lx = -99, ly = -99;
    document.addEventListener('pointermove', (event) => {
      if (event.pointerType === 'touch') return;
      const now = performance.now();
      if (now - last < 55 || Math.hypot(event.clientX - lx, event.clientY - ly) < 18) return;
      const target = event.target;
      if (target.closest && target.closest('dialog, input, button')) return;
      last = now; lx = event.clientX; ly = event.clientY;
      const surface = target.closest ? target.closest('.hab-fig') : null;
      let dark = false;
      if (surface) {
        const m = getComputedStyle(surface).backgroundColor.match(/\d+(\.\d+)?/g);
        if (m) dark = (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]) < 110;
      }
      const colors = dark ? DARK : LIGHT;
      const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      s.setAttribute('viewBox', '-1 -1 2 2');
      s.setAttribute('class', 'hab-bs');
      s.innerHTML = '<path d="' + STAR + '"/>';
      const size = 12 + Math.random() * 16;
      s.style.cssText = 'left:' + event.clientX + 'px;top:' + event.clientY + 'px;width:' + size + 'px;height:' + size + 'px;color:' + colors[Math.floor(Math.random() * 3)] +
        ';--dx:' + (Math.random() * 40 - 20).toFixed(0) + 'px;--dy:' + (Math.random() * 30 - 8).toFixed(0) + 'px';
      s.addEventListener('animationend', () => s.remove());
      layer.appendChild(s);
    });
  }

  function init() {
    sparkTrail();
    $('habClose').addEventListener('click', () => $('habDialog').close());
    $('habDialog').addEventListener('click', (e) => { if (e.target === $('habDialog')) $('habDialog').close(); });
    $('habForm').addEventListener('submit', save);
    $('habDelete').addEventListener('click', remove);
    $('habTypes').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-k]');
      if (!b || b.dataset.k === kind) return;
      kind = b.dataset.k;
      target = KINDS[kind].def;
      showTarget(true);
    });
    $('habUnit').addEventListener('input', () => showTarget(false));
    $('habChips').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { $('habSection').value = b.textContent; $('habSection').focus(); } });
    $('habStep').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-d]');
      if (!b) return;
      const K = KINDS[kind];
      target = Math.max(K.min, Math.min(K.max, target + Number(b.dataset.d) * K.step));
      showTarget(true);
    });
    load().catch(() => {
      $('habGrid').hidden = true;
      $('habEmpty').textContent = 'Could not load your habits right now.';
      $('habEmpty').hidden = false;
    });
    // pick up a new day, and refresh now and then
    setInterval(() => { if (dayKey(new Date()) !== S.today) load().catch(() => {}); }, 60 * 1000);
    setInterval(() => { load().catch(() => {}); }, 10 * 60 * 1000);
  }

  init();
})();
