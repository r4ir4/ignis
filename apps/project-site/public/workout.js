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
      throw new Error(detail || 'Algo deu errado (' + res.status + ').');
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
  const S = { data: null, day: todayKey(), sessions: [], details: {}, tab: 'day', editing: null, virt: {}, made: {}, chain: Promise.resolve(), plan: { weeks: {}, goals: [] }, planWeek: null, edit: false, wstate: null, view: location.hash === '#exercises' ? 'exercises' : 'plan' };   // details: the exercises and sets of each workout of the day   // opened: workouts of the day whose exercises are showing
  const MUSCLE = { chest: 'Peito', back: 'Costas', legs: 'Pernas', shoulders: 'Ombros', arms: 'Braços', core: 'Abdômen', cardio: 'Cardio', full: 'Corpo inteiro' };
  const COLORS = ['var(--f-sun)', 'var(--f-kiwi)', 'var(--f-carrot)', 'var(--f-cream)', 'var(--f-sun)'];

  async function load() {
    const wk = S.planWeek || mondayKey(new Date());
    const [data, plan, wstate] = await Promise.all([api('/v1/workouts/overview?day=' + todayKey() + '&window=30'), api('/v1/workouts/plan'), api('/v1/workouts/plan/week/' + wk)]);
    S.data = data; S.plan = plan; S.wstate = wstate;
    S.virt = {}; S.made = {};
    render();
  }

  const figure = (cls) => make('figure', 'wk-fig ' + cls);
  const emptyIn = (c, text) => { c.appendChild(make('p', 'wk-empty', text)); return c; };
  const ago = (k) => {
    if (!k) return 'ainda não';
    const n = Math.round((parseDay(todayKey()) - parseDay(k)) / 86400000);
    return n <= 0 ? 'hoje' : n === 1 ? 'ontem' : n < 14 ? 'há ' + n + ' dias' : parseDay(k).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });
  };

  // ---- page: heading, a tabbed list (workouts of the day / exercises) in the main column; actions, numbers, a 30-day calendar and bests on the right ----
  const PALETTE = ['var(--f-sun)', 'var(--f-kiwi)', 'var(--f-carrot)', 'var(--f-cream)'];
  const WEEKDAY = (d) => (d.getDay() + 6) % 7;   // Monday = 0, as the routines store it
  const KIND = { weight: 'carga × reps', reps: 'reps com o peso do corpo', time: 'por tempo' };

  const MAX_AHEAD = 14;   // you can look two weeks ahead, to see what is planned
  async function loadDay() {
    const r = await api('/v1/workouts/day/' + S.day);
    S.sessions = r.sessions;
    // the exercises and sets of each workout of the day are shown right in the list
    const full = await Promise.all(r.sessions.map((s) => api('/v1/workouts/sessions/' + s.id)));
    S.details = {};
    full.forEach((f) => { S.details[f.id] = f; });
  }
  function goTo(key) {
    if (key > dayKey(addDays(new Date(), MAX_AHEAD))) return;
    S.day = key;
    loadDay().then(render).catch((e) => toast(e.message));
  }

  function pageHead() {
    const isToday = S.day === todayKey();
    const head = make('header', 'fd-pagehead');
    head.innerHTML = '<svg class="h-tw fd-tw" style="--x:34%;--y:18%;--s:20px;--d:0s" viewBox="0 0 32 32" aria-hidden="true"><use href="#spark"/></svg>' +
      '<svg class="h-tw fd-tw fd-tw-p" style="--x:46%;--y:58%;--s:13px;--d:1.1s" viewBox="0 0 32 32" aria-hidden="true"><use href="#spark"/></svg>';
    const text = make('div');
    text.appendChild(make('h1', '', 'Workout'));
    const d = parseDay(S.day);
    const done = S.sessions.filter((s) => s.finished_at);
    const sets = done.reduce((t, s) => t + (s.sets_done || 0), 0);
    const planned = plannedFor(d);
    let line = d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    if (S.day === dayKey(addDays(new Date(), -1))) line = 'Ontem · ' + line;
    if (S.day === dayKey(addDays(new Date(), 1))) line = 'Amanhã · ' + line;
    line += ' · ' + (done.length ? done.length + (done.length === 1 ? ' treino' : ' treinos') + ' · ' + sets + (sets === 1 ? ' série' : ' séries')
      : planned.length || planWorkout(S.day) ? 'planejado: ' + planned.map((r) => r.name).concat(planWorkout(S.day) ? [planWorkout(S.day).name] : []).join(', ') : S.sessions.length ? 'em andamento' : 'dia de descanso');
    text.appendChild(make('p', 'fd-pagesub', line));
    head.appendChild(text);
    const nav = make('div', 'fd-pnav');
    if (!isToday) { const b = make('button', 'fd-ptoday', 'Hoje'); b.type = 'button'; b.addEventListener('click', () => goTo(todayKey())); nav.appendChild(b); }
    const ARROW = (n) => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + (n < 0 ? 'm14.5 6-6 6 6 6' : 'm9.5 6 6 6-6 6') + '"/></svg>';
    const prev = make('button', 'fd-parrow'); prev.type = 'button'; prev.innerHTML = ARROW(-1); prev.setAttribute('aria-label', 'Dia anterior');
    const next = make('button', 'fd-parrow'); next.type = 'button'; next.innerHTML = ARROW(1); next.setAttribute('aria-label', 'Próximo dia');
    next.disabled = S.day >= dayKey(addDays(new Date(), MAX_AHEAD));
    prev.addEventListener('click', () => goTo(dayKey(addDays(d, -1))));
    next.addEventListener('click', () => goTo(dayKey(addDays(d, 1))));
    nav.append(prev, next);
    head.appendChild(nav);
    return head;
  }

  // ---- right column: actions -------------------------------------------------------------------------------------------------------------------------
  function actions() {
    const wrap = make('div', 'fd-addwrap wp-actions');
    const routine = make('button', 'fd-mini');
    routine.type = 'button'; routine.id = 'wkNewRoutine';
    routine.innerHTML = '<span class="fd-plus" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></span><span>Nova rotina</span>';
    routine.addEventListener('click', () => openRoutine(null));
    wrap.appendChild(routine);
    return wrap;
  }

  // ---- number tiles ----------------------------------------------------------------------------------------------------------------------------------
  const ICON = {
    dumbbell: '<g class="wp-i-db" fill="currentColor"><rect x="5" y="31" width="10" height="22" rx="3"/><rect x="15" y="23" width="10" height="38" rx="3"/><rect x="59" y="23" width="10" height="38" rx="3"/><rect x="69" y="31" width="10" height="22" rx="3"/><rect x="25" y="38" width="34" height="8" rx="3"/></g>',
    bars: '<g class="wp-i-bars" fill="currentColor"><rect x="14" y="46" width="14" height="24" rx="3"/><rect x="35" y="30" width="14" height="40" rx="3"/><rect x="56" y="14" width="14" height="56" rx="3"/></g>',
    flame: '<g class="fd-i-flame"><path fill="currentColor" d="M42 18C45 32 31 35 33 48C37 46 39 42 42 38C42 47 54 50 54 59C54 67 48 70 42 70C35 70 29 65 29 57C29 41 40 35 42 18Z"/><path class="fd-i-core" d="M42 52C42 58 36 59 36 63C36 66 38 68 42 68C46 68 48 66 48 62C48 58 44 56 42 52Z"/></g>',
    cup: '<g class="wp-i-cup"><path d="M26 14H58V34C58 46 50 52 42 52C34 52 26 46 26 34Z" fill="currentColor"/><path d="M26 20H14C14 32 18 38 28 40M58 20H70C70 32 66 38 56 40" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><rect x="38" y="52" width="8" height="12" fill="currentColor"/><rect x="28" y="64" width="28" height="8" rx="3" fill="currentColor"/></g>',
  };
  function tile(cls, label, value, unit, icon, sub) {
    const li = make('li', 'fd-tile ' + cls);
    const left = make('span', 'fd-tl');
    left.appendChild(make('small', '', label));
    const b = make('b', 'fd-num');
    const n = make('span', '', '0');
    b.appendChild(n);
    if (unit) b.appendChild(make('em', '', unit));
    left.appendChild(b);
    left.appendChild(make('span', 'fd-goal', sub));
    li.appendChild(left);
    const art = make('span', 'fd-art');
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
  // one calm card with the four numbers instead of four big tiles
  function tiles() {
    const d = S.data;
    const c = figure('fd-week-card wp-stats');
    const ul = make('ul', 'wp-statlist');
    ul.setAttribute('aria-label', 'Números de treino');
    [[d.week_sessions, d.week_sessions === 1 ? 'treino nesta semana' : 'treinos nesta semana'], [fmt(d.week_volume) + ' kg', 'levantados nesta semana'],
     [d.month_sessions, d.month_sessions === 1 ? 'treino em 30 dias' : 'treinos em 30 dias'], [d.prs, d.prs === 1 ? 'novo recorde' : 'novos recordes']].forEach(([v, l]) => {
      const li = make('li'); li.append(make('b', '', String(v)), make('span', '', l)); ul.appendChild(li);
    });
    c.appendChild(ul);
    return c;
  }

  // ---- the list --------------------------------------------------------------------------------------------------------------------------------------
  const group = (label, i) => make('li', 'fd-group g' + i, label);
  const setText = (g, s) => (g.kind === 'time' ? (s.seconds >= 120 && s.seconds % 60 === 0 ? s.seconds / 60 + ' min' : s.seconds + ' s') : g.kind === 'reps' ? String(s.reps) : kg(s.weight) + ' × ' + s.reps);

  function rowShell(color, title, bits, acts) {
    const li = make('li', 'fd-row wp-row');
    li.style.setProperty('--hc', color);
    li.appendChild(make('i', 'fd-bullet'));
    const name = make('div', 'fd-name', title);
    bits.filter(Boolean).forEach((t) => name.appendChild(make('small', '', t)));
    li.appendChild(name);
    const box = make('div', 'wp-acts');
    acts.forEach((a) => box.appendChild(a));
    li.appendChild(box);
    return li;
  }
  // a small status tag after the workout's name: Done, In progress, Planned, Not done
  function tagRow(li, text, cls) {
    const n = li.querySelector('.fd-name');
    n.insertBefore(make('i', 'wp-tag ' + cls, text), n.querySelector('small'));
    return li;
  }
  const actBtn = (label, fn, cls) => { const b = make('button', 'fd-edit' + (cls ? ' ' + cls : ''), label); b.type = 'button'; b.addEventListener('click', fn); return b; };

  // ---- the day's workouts: a grid you tick as you train, and Edit to change reps or weight ------------------------------------------------------------
  const plannedFor = (d) => (S.sessions.length ? [] : S.data.routines.filter((r) => (r.days || []).includes(WEEKDAY(d))));   // once a workout is logged for the day, it replaces the plan
  const wid = (w) => (w.session ? w.session.id : w.plan ? 'plan' : 'r:' + w.routine.id);
  const virtKey = (w) => (w.routine ? w.routine.id : 'plan:' + S.day);

  // ---- the training plan: the sets of the week the day falls in, ready to tick like a routine ----
  const mondayKey = (d) => dayKey(addDays(d, -WEEKDAY(d)));
  const SHORT = (k) => parseDay(k).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });
  const planItems = (weekKey, wd) => {
    const w = S.plan.weeks;
    return [...(w[''] || []).map((i) => ({ ...i, every: true })), ...(w[weekKey] || [])].filter((it) => it.days.includes(wd)).sort((a, b) => a.sort - b.sort);
  };
  function planWorkout(key) {
    if (S.sessions.some((x) => /^Plan · /.test(x.name))) return null;   // once it is saved it is a normal workout of the day
    const d = parseDay(key), wk = mondayKey(d);
    const items = planItems(wk, WEEKDAY(d));
    if (!items.length) return null;
    const groups = S.virt['plan:' + key] || items.map((it) => ({
      exercise_id: it.exercise_id, name: it.name, kind: it.kind, variant: it.variant,
      sets: it.sets.map((x) => ({ reps: x.reps, weight: it.weight, seconds: x.seconds, done: false })),
    }));
    return { plan: true, name: 'Plan · week of ' + SHORT(wk), groups };
  }

  function dayWorkouts() {
    const out = S.sessions.map((s) => ({ session: s, name: s.name, groups: (S.details[s.id] || { groups: [] }).groups }));
    plannedFor(parseDay(S.day)).forEach((r) => out.push({ routine: r, name: r.name, groups: S.virt[r.id] || r.items.map((it) => ({
      exercise_id: it.exercise_id, name: it.exercise_name, kind: it.kind,
      sets: Array.from({ length: it.sets }, () => ({ reps: it.reps, weight: it.weight, seconds: it.seconds, done: false })),
    })) }));
    const pw = planWorkout(S.day);
    if (pw) out.push(pw);
    return out;
  }
  const countSets = (groups) => { let total = 0, done = 0, volume = 0; groups.forEach((g) => g.sets.forEach((s) => { total++; if (s.done) { done++; volume += (s.weight || 0) * (s.reps || 0); } })); return { total, done, volume }; };

  // saving: ticking a set or changing a number creates the workout the first time, replaces its sets, and finishes it when every set is ticked
  async function persist(w, groups, refresh) {
    const routineId = w.routine && w.routine.id;
    const made = w.plan ? 'plan:' + S.day : routineId;
    let id = w.session && w.session.id;
    if (!id && w.plan) id = (S.sessions.find((s) => /^Plan · /.test(s.name)) || {}).id || S.made[made];
    else if (!id && routineId) id = (S.sessions.find((s) => s.routine_id === routineId) || {}).id || S.made[routineId];
    if (!id) {
      const s = await api('/v1/workouts/sessions', { method: 'POST', body: w.plan ? { day: S.day, name: w.name } : { day: S.day, routine_id: routineId } });
      id = s.id;
      S.made[made] = id;
      if (S.editing === wid(w)) S.editing = id;
    }
    const sets = [];
    groups.forEach((g) => g.sets.forEach((s) => sets.push({ exercise_id: g.exercise_id, reps: s.reps || 0, weight: s.weight || 0, seconds: s.seconds || 0, done: !!s.done, variant: g.variant || '' })));
    await api('/v1/workouts/sessions/' + id + '/sets', { method: 'PUT', body: { sets } });
    const c = countSets(groups);
    const finished = c.total > 0 && c.done === c.total;
    const was = w.session ? !!w.session.finished_at : false;
    if (finished !== was) await api('/v1/workouts/sessions/' + id, { method: 'PATCH', body: { finish: finished } });
    if (refresh) await load();
  }
  function save(w, groups, refresh) {
    S.chain = S.chain.then(() => persist(w, groups, refresh)).catch((e) => { toast(e.message); return load().catch(() => {}); });
    return S.chain;
  }

  const tagFor = (w) => {
    const c = countSets(w.groups);
    if (w.session && w.session.finished_at) return ['Feito', 'done'];
    if (c.done) return [c.done + '/' + c.total + ' séries', 'live'];
    return S.day < todayKey() ? ['Não feito', 'late'] : ['Planejado', 'plan'];
  };

  function numField(value, step, label, apply) {
    const i = make('input', 'wp-in');
    i.type = 'number'; i.inputMode = step < 1 ? 'decimal' : 'numeric'; i.min = '0'; i.step = String(step);
    i.value = value ? String(value) : '';
    i.placeholder = '0';
    i.setAttribute('aria-label', label);
    i.addEventListener('change', () => apply(Math.max(0, parseFloat(String(i.value).replace(',', '.')) || 0)));
    i.addEventListener('focus', () => i.select());
    return i;
  }
  function cellFor(w, g, s, gi, si) {
    const editing = S.editing === wid(w);
    if (editing) {
      const box = make('span', 'wp-gc wp-cellin');
      const change = () => save(w, w.groups, false);
      if (g.kind === 'weight') {
        box.append(numField(s.weight, 0.5, g.name + ', set ' + (si + 1) + ' weight', (v) => { s.weight = v; change(); }), make('i', '', '×'), numField(s.reps, 1, g.name + ', set ' + (si + 1) + ' reps', (v) => { s.reps = Math.round(v); change(); }));
      } else if (g.kind === 'reps') box.append(numField(s.reps, 1, g.name + ', set ' + (si + 1) + ' reps', (v) => { s.reps = Math.round(v); change(); }));
      else box.append(numField(s.seconds, 1, g.name + ', set ' + (si + 1) + ' seconds', (v) => { s.seconds = Math.round(v); change(); }), make('i', '', 's'));
      return box;
    }
    const b = make('button', 'wp-gc wp-cell' + (s.done ? ' done' : ''), setText(g, s));
    b.type = 'button';
    b.setAttribute('aria-pressed', String(!!s.done));
    b.title = (s.done ? 'Desmarcar ' : 'Marcar ') + g.name + ', set ' + (si + 1);
    b.addEventListener('click', () => {
      s.done = !s.done;
      if ((w.routine || w.plan) && !w.session) S.virt[virtKey(w)] = w.groups;   // keep the ticks on screen until the saved workout comes back
      save(w, w.groups, true);
      render();
    });
    return b;
  }
  function workoutGrid(w) {
    const li = make('li', 'wp-detail' + (w.session ? '' : ' planned'));
    if (!w.groups.length) { li.appendChild(make('p', 'wp-none', w.session ? 'Nenhum exercício neste treino ainda. Abra para adicionar.' : 'Nenhum exercício nesta rotina ainda. Edite para adicionar.')); return li; }
    const n = Math.max(1, ...w.groups.map((g) => g.sets.length));
    const wrap = make('div', 'wp-gridwrap');
    const grid = make('div', 'wp-grid' + (S.editing === wid(w) ? ' editing' : ''));
    grid.style.setProperty('--n', n);
    const head = make('div', 'wp-gr wp-gh');
    head.appendChild(make('span', '', 'Exercício'));
    for (let i = 1; i <= n; i++) head.appendChild(make('span', 'wp-gc', 'Série ' + i));
    grid.appendChild(head);
    w.groups.forEach((g, gi) => {
      const row = make('div', 'wp-gr');
      const nm = make('b', 'wp-gn', g.name);
      if (g.variant) nm.appendChild(make('small', '', g.variant));
      row.appendChild(nm);
      for (let i = 0; i < n; i++) row.appendChild(g.sets[i] ? cellFor(w, g, g.sets[i], gi, i) : make('span', 'wp-gc wp-none-cell'));
      grid.appendChild(row);
    });
    wrap.appendChild(grid);
    li.appendChild(wrap);
    return li;
  }
  function workoutRow(w, i) {
    const c = countSets(w.groups);
    const [tag, cls] = tagFor(w);
    const bits = [w.groups.length + (w.groups.length === 1 ? ' exercise' : ' exercises') + ' · ' + c.done + '/' + c.total + ' séries' + (c.volume ? ' · ' + fmt(c.volume) + ' kg' : '')];
    const editing = S.editing === wid(w);
    const acts = [];
    const edit = actBtn(editing ? 'Pronto' : 'Editar', () => {
      const was = S.editing === wid(w);
      S.editing = was ? null : wid(w);
      if (was) load().catch((e) => toast(e.message)); else render();
    }, editing ? 'wp-go' : '');
    acts.push(edit);
    if (w.session) acts.push(actBtn('Details', () => openSession(w.session.id)));
    const li = rowShell(PALETTE[i % PALETTE.length], w.name, bits, acts);
    li.classList.add('wp-head');
    tagRow(li, tag, cls);
    return li;
  }

  // the selected day: each workout with its grid
  function dayList() {
    const list = make('ul', 'fd-list');
    const works = dayWorkouts();
    works.forEach((w, i) => { list.appendChild(workoutRow(w, i)); list.appendChild(workoutGrid(w)); });
    if (!works.length) list.appendChild(make('li', 'fd-empty', S.day > todayKey() ? 'Nada planejado para este dia.' : 'Dia de descanso. Nada planejado nem registrado. Adicione uma rotina a este dia pelo cartão Rotinas.'));
    return list;
  }

  function bestScore(b) {
    if (b.kind === 'weight') return kg(b.weight) + ' kg × ' + b.reps;
    if (b.kind === 'reps') return b.reps + ' reps';
    return b.seconds + ' s';
  }
  function exerciseList() {
    const list = make('ul', 'fd-list');
    const head = make('li', 'wp-exhead');
    const hint = make('span', 'wp-exhint', S.data.exercises.length + (S.data.exercises.length === 1 ? ' exercício' : ' exercícios'));
    const add = make('button', 'fd-mini');
    add.type = 'button';
    add.innerHTML = '<span class="fd-plus" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></span><span>Novo exercício</span>';
    add.addEventListener('click', () => openExercise(() => load().catch((e) => toast(e.message))));
    head.append(hint, add);
    list.appendChild(head);
    if (!S.data.exercises.length) { list.appendChild(make('li', 'fd-empty', 'Nenhum exercício ainda. Adicione os que você treina.')); return list; }
    const best = {};
    S.data.bests.forEach((b) => { best[b.exercise_id] = b; });
    Object.keys(MUSCLE).forEach((m, gi) => {
      const items = S.data.exercises.filter((e) => e.muscle === m);
      if (!items.length) return;
      list.appendChild(group(MUSCLE[m], [5, 1, 2, 3, 4, 5, 1, 2][gi % 8]));
      items.forEach((e, i) => {
        const b = best[e.id];
        const bits = [KIND[e.kind] || '', b ? 'Melhor ' + bestScore(b) + ' · ' + b.sessions + (b.sessions === 1 ? ' treino' : ' treinos') + ' · ' + ago(b.last_day) : 'ainda não feito'];
        const acts = [];
        if (window.WkArt && WkArt.has(e.name)) acts.push(actBtn('Como', () => openHow(e.name)));
        list.appendChild(rowShell(PALETTE[(i + gi) % PALETTE.length], e.name, bits, acts));
      });
    });
    return list;
  }

  // ---- Plan tab: one week at a time, exercises down, Monday to Sunday across ----
  const DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  const schemeText = (it) => {
    const only = it.sets.length === 1 ? it.sets[0] : null;
    if (only && it.kind === 'time' && only.seconds >= 120 && only.seconds % 60 === 0) return only.seconds / 60 + ' min';
    if (only && it.kind === 'reps' && only.reps === 1) return '✓';
    return it.scheme.replace(/x/g, '×').replace(/;/g, ' +');
  };
  const planWeekKeys = () => Object.keys(S.plan.weeks).filter(Boolean).sort();
  const isDone = (key, it) => {
    const e = S.wstate && S.wstate.days[key] && S.wstate.days[key].items[it.exercise_id + '|' + (it.variant || '')];
    return !!(e && e.total && e.done === e.total);
  };
  async function tickCell(key, it, done) {
    const days = S.wstate.days;
    const before = days[key] ? JSON.parse(JSON.stringify(days[key])) : null;
    if (!days[key]) days[key] = { id: null, items: {} };
    days[key].items[it.exercise_id + '|' + (it.variant || '')] = { done: done ? it.sets.length : 0, total: it.sets.length };
    render();
    try { S.wstate = await api('/v1/workouts/plan/tick', { method: 'PUT', body: { day: key, exercise_id: it.exercise_id, variant: it.variant || '', done } }); }
    catch (e) { days[key] = before || { id: null, items: {} }; toast(e.message); }
    render();
  }
  function weekHead(wk) {
    const keys = planWeekKeys(), thisWk = mondayKey(new Date());
    const head = make('header', 'wp-top');
    const text = make('div');
    text.appendChild(make('h1', '', 'Workout'));
    const idx = keys.indexOf(wk);
    const name = wk === thisWk ? 'Esta semana' : wk === dayKey(addDays(parseDay(thisWk), 7)) ? 'Próxima semana' : wk === dayKey(addDays(parseDay(thisWk), -7)) ? 'Semana passada' : idx >= 0 ? 'Semana ' + (idx + 1) : 'Sem plano';
    text.appendChild(make('p', 'fd-pagesub', name + ' · ' + SHORT(wk) + ' – ' + SHORT(dayKey(addDays(parseDay(wk), 6)))));
    const tabs = make('div', 'wp-views');
    [['plan', 'Plano'], ['exercises', 'Exercícios']].forEach(([k, label]) => {
      const a = make('a', 'wp-view', label); a.href = k === 'plan' ? '#' : '#exercises'; a.setAttribute('aria-current', String(S.view === k));
      a.addEventListener('click', (e) => { e.preventDefault(); history.replaceState(null, '', k === 'plan' ? location.pathname : '#exercises'); S.view = k; render(); });
      tabs.appendChild(a);
    });
    if (S.view === 'exercises') {
      text.lastChild.textContent = S.data.exercises.length + (S.data.exercises.length === 1 ? ' exercício' : ' exercícios');
      text.appendChild(tabs);
      head.appendChild(text);
      return head;
    }
    const nav = make('div', 'fd-pnav');
    const go = (n) => { S.planWeek = dayKey(addDays(parseDay(wk), n * 7)); load().catch((e) => toast(e.message)); };
    const arrow = (n, label, off) => { const b = make('button', 'fd-parrow'); b.type = 'button'; b.setAttribute('aria-label', label); b.disabled = off; b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + (n < 0 ? 'm14.5 6-6 6 6 6' : 'm9.5 6 6 6-6 6') + '"/></svg>'; b.addEventListener('click', () => go(n)); return b; };
    if (wk !== thisWk) { const t = make('button', 'fd-ptoday', 'Esta semana'); t.type = 'button'; t.addEventListener('click', () => { S.planWeek = null; load().catch((e) => toast(e.message)); }); nav.appendChild(t); }
    nav.append(arrow(-1, 'Previous week', keys.length && wk <= keys[0]), arrow(1, 'Next week', keys.length && wk >= keys[keys.length - 1]));
    const ed = make('button', 'wp-editbtn', S.edit ? 'Pronto' : 'Editar plano'); ed.type = 'button'; ed.setAttribute('aria-pressed', String(S.edit));
    ed.addEventListener('click', () => { S.edit = !S.edit; render(); });
    nav.appendChild(ed);
    text.appendChild(tabs);
    head.append(text, nav);
    return head;
  }
  function weekGrid(wk) {
    const box = make('section', 'wp-week');
    const rows = [];
    for (let wd = 0; wd < 7; wd++) planItems(wk, wd).forEach((it) => {
      const k = it.exercise_id + '|' + it.variant + '|' + it.weight;
      let r = rows.find((x) => x.k === k);
      if (!r) { r = { k, it, its: [] }; rows.push(r); }
      r.its[wd] = it;
    });
    rows.sort((a, b) => a.it.sort - b.it.sort);
    if (!rows.length && !S.edit) { box.appendChild(make('p', 'wp-none', 'Nada planejado para esta semana.')); return box; }
    const shown = [0, 1, 2, 3, 4, 5, 6].filter((wd) => S.edit || rows.some((r) => r.its[wd]));
    const today = todayKey();
    let total = 0, did = 0;
    const wrap = make('div', 'wp-gridwrap'), grid = make('div', 'wp-pgrid wp-wk');
    grid.style.setProperty('--cols', shown.length);
    const head = make('div', 'wp-pr wp-ph');
    head.appendChild(make('span', ''));
    shown.forEach((wd) => {
      const key = dayKey(addDays(parseDay(wk), wd));
      const h = make('div', 'wp-pd' + (key === today ? ' now' : ''));
      h.append(make('b', '', DAYS[wd]), make('small', '', String(parseDay(key).getDate())));
      head.appendChild(h);
    });
    grid.appendChild(head);
    rows.forEach((r) => {
      const row = make('div', 'wp-pr');
      const nm = make('b', 'wp-gn', r.it.name);
      const label = [r.it.variant, r.it.kind === 'weight' && r.it.weight ? kg(r.it.weight) + ' kg' : ''].filter(Boolean).join(' · ');
      if (label) nm.appendChild(make('small', '', label));
      row.appendChild(nm);
      shown.forEach((wd) => {
        const it = r.its[wd], key = dayKey(addDays(parseDay(wk), wd));
        if (!it) {
          if (!S.edit) { row.appendChild(make('span', 'wp-pc blank')); return; }
          const c = make('button', 'wp-pc wp-add', '+'); c.type = 'button'; c.title = 'Adicionar ' + r.it.name + ' em ' + DAYS[wd];
          c.addEventListener('click', () => openPlanEdit(wk, null, wd, r)); row.appendChild(c); return;
        }
        total++;
        const done = isDone(key, it); if (done) did++;
        const c = make('button', 'wp-pc wp-tick' + (done ? ' done' : '') + (key > today && !S.edit ? ' future' : ''), schemeText(it));
        c.type = 'button';
        if (S.edit) { c.title = 'Editar ' + it.name; c.addEventListener('click', () => openPlanEdit(wk, it, wd, r)); }
        else if (key > today) { c.disabled = true; c.title = 'Ainda não'; }
        else { c.setAttribute('aria-pressed', String(done)); c.title = (done ? 'Desmarcar ' : 'Marcar ') + it.name; c.addEventListener('click', () => tickCell(key, it, !done)); }
        row.appendChild(c);
      });
      grid.appendChild(row);
    });
    wrap.appendChild(grid); box.appendChild(wrap);
    const foot = make('div', 'wp-foot');
    if (S.edit) {
      const add = make('button', 'fd-mini wp-padd'); add.type = 'button';
      add.innerHTML = '<span class="fd-plus" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></span><span>Adicionar exercício</span>';
      add.addEventListener('click', () => openPlanEdit(wk, null, 0, null));
      foot.appendChild(add);
      foot.appendChild(make('p', 'wp-phint2', 'Toque em um número para alterá-lo.'));
    } else if (total) {
      const bar = make('div', 'wp-bar'); const fill = make('i'); fill.style.width = Math.round((did / total) * 100) + '%'; bar.appendChild(fill);
      foot.append(bar, make('p', 'wp-phint2', did + ' de ' + total + ' feitos nesta semana'));
    }
    box.appendChild(foot);
    return box;
  }

  // ---- editing the plan: a cell opens the same kind of dialog as the rest of the page ----
  const PE = { wk: '', orig: null, ex: null, every: false, scope: 'week', row: null };
  const pDays = () => [...$('wkPDays').querySelectorAll('button[aria-pressed="true"]')].map((b) => Number(b.dataset.d));
  function openPlanEdit(wk, it, wd, row) {
    const exists = !!it;
    PE.wk = wk; PE.row = row; PE.scope = 'week';
    PE.orig = exists ? { scheme: it.scheme, weight: it.weight, variant: it.variant } : null;
    PE.every = !!(it && it.every);
    PE.ex = it ? { id: it.exercise_id, name: it.name } : row ? { id: row.it.exercise_id, name: row.it.name } : null;
    $('wkPlanTitle').textContent = exists ? 'Editar plano' : 'Adicionar ao plano';
    $('wkPName').textContent = PE.ex ? PE.ex.name : '';
    $('wkPName').hidden = !PE.ex;
    $('wkPPick').hidden = !!PE.ex;
    if (!PE.ex) { fillSelect($('wkPSel')); resetSel($('wkPSel')); }
    const base = it || (row ? { ...row.it, scheme: '' } : { scheme: '', weight: 0, variant: '' });
    $('wkPScheme').value = base.scheme || '';
    $('wkPWeight').value = base.weight ? String(base.weight) : '';
    $('wkPVariant').value = base.variant || '';
    let on = [];
    if (exists) { for (let d = 0; d < 7; d++) { const o = row.its[d]; if (o && o.scheme === it.scheme && o.weight === it.weight && o.variant === it.variant) on.push(d); } }
    else on = row ? [wd] : [0, 1, 2, 3, 4];
    $('wkPDays').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(on.includes(Number(b.dataset.d)))));
    $('wkPScopeBox').hidden = PE.every;
    pressed($('wkPScope'), 'week'); $('wkPScopeNote').hidden = true;
    $('wkPErr').hidden = true; $('wkPSave').disabled = false;
    const del = $('wkPDelete'); del.hidden = !exists; del.classList.remove('sure'); del.textContent = 'Remover do plano';
    $('wkPlanDialog').showModal();
    $('wkPScheme').focus();
  }
  async function savePlanEdit(event, remove) {
    if (event) event.preventDefault();
    const fail = (m) => { $('wkPErr').textContent = m; $('wkPErr').hidden = false; };
    const exId = PE.ex ? PE.ex.id : selValue($('wkPSel'));
    if (!exId) return fail('Escolha um exercício primeiro.');
    const days = pDays();
    if (!days.length) return fail('Escolha pelo menos um dia.');
    const body = { week_start: PE.every ? '' : PE.wk, days, exercise_id: exId, orig: PE.orig, scheme: $('wkPScheme').value, weight: num($('wkPWeight').value), variant: $('wkPVariant').value.trim(), scope: PE.scope, remove: !!remove };
    $('wkPSave').disabled = true;
    try {
      S.plan = await api('/v1/workouts/plan/edit', { method: 'POST', body });
      Object.keys(S.virt).filter((k) => k.startsWith('plan:')).forEach((k) => delete S.virt[k]);
      $('wkPlanDialog').close();
      render();
      toast(remove ? 'Removido do plano' : 'Plano atualizado');
    } catch (e) { fail(e.message); $('wkPSave').disabled = false; }
  }

  function goalsCard() {
    const c = make('details', 'wp-goals');
    const done = S.plan.goals.filter((g) => g.done_on).length;
    const head = make('summary', 'wp-ghead');
    head.append(make('span', '', 'Metas para 2027'), make('b', '', done + '/' + S.plan.goals.length));
    c.appendChild(head);
    if (S.goalsOpen) c.open = true;
    c.addEventListener('toggle', () => { S.goalsOpen = c.open; });
    if (!S.plan.goals.length) { c.appendChild(make('p', 'wp-none', 'Nenhuma meta ainda.')); return c; }
    const ul = make('ul', 'wp-glist');
    S.plan.goals.forEach((g) => {
      const li = make('li', 'wp-goal' + (g.done_on ? ' done' : ''));
      const b = make('button', 'wp-gcheck'); b.type = 'button'; b.setAttribute('aria-pressed', String(!!g.done_on)); b.setAttribute('aria-label', (g.done_on ? 'Desmarcar: ' : 'Marcar: ') + g.text);
      b.addEventListener('click', async () => {
        const was = g.done_on; g.done_on = was ? null : todayKey(); render();
        try { await api('/v1/workouts/goals/' + g.id, { method: 'PATCH', body: { done: !was, done_on: todayKey() } }); }
        catch (e) { g.done_on = was; render(); toast(e.message); }
      });
      const t = make('span', '', g.text);
      li.append(b, t);
      if (g.done_on) li.appendChild(make('small', '', SHORT(g.done_on)));
      ul.appendChild(li);
    });
    c.appendChild(ul);
    return c;
  }

  function listCard() {
    const c = figure('fd-log wp-log');
    const tabs = make('div', 'wp-tabs');
    tabs.setAttribute('role', 'group'); tabs.setAttribute('aria-label', 'Visualização');
    [['day', 'Treinos'], ['plan', 'Plano'], ['exercises', 'Exercícios']].forEach(([k, label]) => {
      const b = make('button', 'wp-tab');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(S.tab === k));
      b.innerHTML = '<span>' + label + '</span>' + (k === 'plan' ? '' : '<b>' + (k === 'day' ? S.sessions.length : S.data.exercises.length) + '</b>');
      b.addEventListener('click', () => { S.tab = k; render(); });
      tabs.appendChild(b);
    });
    c.appendChild(tabs);
    c.appendChild(S.tab === 'day' ? dayList() : S.tab === 'plan' ? planList() : exerciseList());
    return c;
  }

  // ---- 30 days (click a day to see it) and personal bests ---------------------------------------------------------------------------------------------
  function monthCard() {
    const c = figure('fd-month-card');
    const head = make('div', 'fd-head');
    head.appendChild(make('p', 'fd-k', 'Últimos 30 dias'));
    head.appendChild(make('span', 'fd-pillsm', S.data.month_sessions + (S.data.month_sessions === 1 ? ' treino' : ' treinos')));
    c.appendChild(head);
    const grid = make('div', 'fd-month');
    for (let i = 29; i >= 0; i--) {
      const d = addDays(new Date(), -i);
      const key = dayKey(d);
      const n = S.data.days[key] || 0;
      const sq = make('button', 'fd-sq ' + (n ? 'l' + Math.min(n, 2) : '') + (key === S.day ? ' now' : ''), String(d.getDate()));
      sq.type = 'button';
      sq.title = d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }) + ' · ' + (n ? n + (n === 1 ? ' treino' : ' treinos') : 'dia de descanso');
      sq.addEventListener('click', () => { S.tab = 'day'; goTo(key); });
      grid.appendChild(sq);
    }
    c.appendChild(grid);
    c.appendChild(make('p', 'fd-legend', 'Clique em um dia para ver os treinos. Laranja: um treino. Preto: dois ou mais.'));
    return c;
  }
  // every routine, with a way to edit it or start it on the day you are looking at
  // put a routine on the day being looked at (its sets show up ready to tick)
  function addRoutineToDay(r) {
    if (S.sessions.some((s) => s.routine_id === r.id)) { toast(r.name + ' já está neste dia.'); return; }
    const groups = r.items.map((it) => ({ exercise_id: it.exercise_id, name: it.exercise_name, kind: it.kind, sets: Array.from({ length: it.sets }, () => ({ reps: it.reps, weight: it.weight, seconds: it.seconds, done: false })) }));
    save({ routine: r }, groups, true).then(() => toast(r.name + ' adicionada a este dia'));
  }
  function routinesCard() {
    const c = figure('fd-week-card wp-routines');
    const head = make('div', 'fd-head');
    head.appendChild(make('p', 'fd-k', 'Rotinas'));
    head.appendChild(make('span', 'fd-pillsm', String(S.data.routines.length)));
    c.appendChild(head);
    if (!S.data.routines.length) { c.appendChild(make('p', 'wp-none', 'Nenhuma rotina ainda. Crie uma em Nova rotina.')); return c; }
    const ul = make('ul', 'wp-rlist');
    S.data.routines.forEach((r) => {
      const li = make('li', 'wp-rrow');
      const t = make('div', 'wp-rt');
      t.appendChild(make('b', '', r.name));
      t.appendChild(make('small', '', r.items.length + (r.items.length === 1 ? ' exercício' : ' exercícios') + ((r.days || []).length ? ' · ' + r.days.map((d) => ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'][d]).join(' ') : '')));
      li.appendChild(t);
      li.append(actBtn('Editar', () => openRoutine(r)), actBtn('Adicionar ao dia', () => addRoutineToDay(r), 'wp-go'));
      ul.appendChild(li);
    });
    c.appendChild(ul);
    return c;
  }
  function bestsCard() {
    const c = figure('fd-week-card wp-bests');
    const head = make('div', 'fd-head');
    head.appendChild(make('p', 'fd-k', 'Melhores marcas'));
    c.appendChild(head);
    if (!S.data.bests.length) { c.appendChild(make('p', 'wp-none', 'Sua melhor série de cada exercício aparece aqui quando você concluir um treino.')); return c; }
    const ul = make('ul', 'wp-blist');
    S.data.bests.slice(0, 6).forEach((b) => {
      const li = make('li', 'wp-best');
      li.appendChild(make('span', '', b.name));
      li.appendChild(make('b', '', bestScore(b)));
      ul.appendChild(li);
    });
    c.appendChild(ul);
    return c;
  }

  // ---- one exercise: how it looks, what it is, and how the plan progresses ----
  const ABOUT = [
    [/push[ -]?up|flex[aã]o/i, 'Peito, ombros e tríceps. O plano sobe a escada: flexão na parede, inclinada, com joelhos, negativa e normal, depois acrescenta um colete com peso.'],
    [/plank|prancha/i, 'Abdômen e ombros. Os tempos ficam mais longos, depois você levanta uma perna e então acrescenta um colete com peso.'],
    [/squat|agachamento/i, 'Quadríceps e glúteos. Primeiro mais repetições, depois mais carga.'],
    [/row|remada/i, 'Costas e bíceps. A carga sobe um pouco de cada vez.'],
    [/pull[ -]?up|chin[ -]?up|barra/i, 'Costas e braços. As barras invertidas criam a força; a barra fixa chega no fim do plano.'],
    [/esteira|treadmill/i, 'Cardio leve para se mexer todo dia. Mantenha um ritmo em que ainda consiga conversar.'],
    [/alongamento|stretch/i, 'Mantém o corpo solto entre os dias de treino.'],
  ];
  const TIPS = [
    [/esteira|treadmill/i, ['Comece num ritmo lento de aquecimento.', 'Fique ereto, com os braços relaxados.', 'Desacelere nos últimos minutos.']],
    [/alongamento|stretch/i, ['Segure cada alongamento por cerca de 30 segundos.', 'Respire devagar e não faça balanço.', 'Alongue até sentir tensão, nunca dor.']],
  ];
  const firstMatch = (list, name) => { const m = list.find(([re]) => re.test(name)); return m ? m[1] : null; };
  const itemTotal = (it) => it.sets.reduce((t, x) => t + (it.kind === 'time' ? x.seconds : it.kind === 'weight' ? x.reps * (it.weight || 1) : x.reps), 0);
  const totalLabel = (kind) => (kind === 'time' ? 'Total de segundos por dia' : kind === 'weight' ? 'Total de kg movidos por dia' : 'Total de reps por dia');
  function progressionOf(ex) {
    const every = (S.plan.weeks[''] || []).filter((i) => i.exercise_id === ex.id);
    const weeks = Object.keys(S.plan.weeks).filter(Boolean).sort().map((wk) => ({ wk, items: S.plan.weeks[wk].filter((i) => i.exercise_id === ex.id) })).filter((w) => w.items.length);
    return { every, weeks };
  }
  function openInfo(ex) {
    const name = ex.name;
    $('wkInfoTitle').textContent = name;
    if (howArt) { howArt.stop(); howArt = null; }
    const artBox = $('wkInfoArt');
    howArt = window.WkArt && WkArt.has(name) ? WkArt.mount(artBox, name) : null;
    artBox.hidden = !howArt;
    const about = firstMatch(ABOUT, name);
    $('wkInfoAbout').textContent = [MUSCLE[ex.muscle], KIND[ex.kind]].filter(Boolean).join(' · ') + (about ? '. ' + about : '');
    const tips = howArt ? howArt.tips : firstMatch(TIPS, name);
    $('wkInfoTipsBox').hidden = !tips;
    if (tips) $('wkInfoTips').replaceChildren(...tips.map((t, i) => { const li = make('li', '', t); li.style.setProperty('--i', i); return li; }));
    // progression
    const box = $('wkInfoProg'); box.replaceChildren();
    const { every, weeks } = progressionOf(ex);
    if (every.length && !weeks.length) {
      box.append(make('span', 'wk-label', 'Plano'), make('p', 'wk-iabout', every.map((i) => schemeText(i) + ' em ' + i.days.map((d) => DAYS[d]).join(', ')).join(' · ') + ', toda semana.'));
    } else if (weeks.length) {
      // the types, in the order the plan uses them
      const types = [];
      weeks.forEach((w) => w.items.forEach((i) => { const t = [i.variant, i.kind === 'weight' && i.weight ? kg(i.weight) + ' kg' : ''].filter(Boolean).join(' · '); if (t && !types.includes(t)) types.push(t); }));
      if (types.length) {
        box.appendChild(make('span', 'wk-label', 'Variações e cargas, em ordem'));
        const chips = make('div', 'wk-ichips');
        chips.style.setProperty('--n', Math.max(types.length - 1, 1));
        types.forEach((t, i) => { const c = make('span', 'wk-ichip', t); c.style.setProperty('--i', i); chips.appendChild(c); });
        box.appendChild(chips);
      }
      // a bar per week: total work per day
      const kind = weeks[0].items[0].kind;
      const vals = weeks.map((w) => Math.max(...w.items.map(itemTotal)));
      const top = Math.max(...vals, 1), thisWk = mondayKey(new Date());
      box.appendChild(make('span', 'wk-label wk-itop', totalLabel(kind)));
      const bars = make('div', 'wk-ibars');
      weeks.forEach((w, i) => { const b = make('i', w.wk === thisWk ? 'now' : w.wk < thisWk ? 'past' : ''); b.style.height = Math.max(6, Math.round((vals[i] / top) * 100)) + '%'; b.style.setProperty('--i', i); b.title = 'Semana de ' + SHORT(w.wk) + ' · ' + vals[i]; bars.appendChild(b); });
      box.appendChild(bars);
      box.appendChild(make('span', 'wk-label wk-itop', 'Semana a semana'));
      const tbl = make('div', 'wk-itable');
      weeks.forEach((w, wi) => {
        const row = make('div', 'wk-irow' + (w.wk === thisWk ? ' now' : '')); row.style.setProperty('--i', Math.min(wi, 14));
        const what = make('div', 'wk-isch'); [...new Set(w.items.map((i) => schemeText(i)))].forEach((t) => what.appendChild(make('span', '', t)));
        const extra = [...new Set(w.items.map((i) => [i.variant, i.kind === 'weight' && i.weight ? kg(i.weight) + ' kg' : ''].filter(Boolean).join(' · ')).filter(Boolean))].join(' / ');
        row.append(make('span', '', SHORT(w.wk)), what, make('small', '', extra));
        tbl.appendChild(row);
      });
      box.appendChild(tbl);
    } else box.appendChild(make('p', 'wk-iabout', 'Ainda não está no seu plano. Adicione em Editar plano.'));
    $('wkInfoEdit').onclick = () => { $('wkInfoDialog').close(); openExercise(() => render(), ex); };
    $('wkInfoDialog').showModal();
    const cur = box.querySelector('.wk-irow.now'); if (cur) cur.scrollIntoView({ block: 'nearest' });
  }

  function exercisesPage() {
    const box = make('section', 'wp-week wp-exs');
    const top = make('div', 'wp-exbar');
    top.appendChild(make('p', 'wp-phint2', 'Tudo o que você treina. Crie exercícios aqui e depois coloque no seu plano.'));
    const add = make('button', 'fd-mini'); add.type = 'button';
    add.innerHTML = '<span class="fd-plus" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></span><span>Novo exercício</span>';
    add.addEventListener('click', () => openExercise(() => render()));
    top.appendChild(add);
    box.appendChild(top);
    if (!S.data.exercises.length) { box.appendChild(make('p', 'wp-none', 'Nenhum exercício ainda.')); return box; }
    const inPlan = new Set(Object.values(S.plan.weeks).flat().map((i) => i.exercise_id));
    const best = {}; S.data.bests.forEach((b) => { best[b.exercise_id] = b; });
    let gi = 0;
    Object.keys(MUSCLE).forEach((m) => {
      const list = S.data.exercises.filter((e) => e.muscle === m);
      if (!list.length) return;
      const g = gi++;
      const h = make('h3', 'wp-exgroup'); h.style.setProperty('--gc', 'var(--gc' + (g % 5) + ')');
      h.append(make('i', 'wp-exdot'), make('span', '', MUSCLE[m]), make('em', '', String(list.length)));
      box.appendChild(h);
      const ul = make('ul', 'wp-exgrid');
      list.forEach((e, k) => {
        const li = make('li', 'wp-excard'); li.style.setProperty('--gc', 'var(--gc' + (g % 5) + ')'); li.style.setProperty('--i', k);
        const t = make('button', 'wp-exopen'); t.type = 'button'; t.addEventListener('click', () => openInfo(e));
        const art = make('span', 'wp-exart');
        if (!(window.WkArt && WkArt.has(e.name) && WkArt.frame(art, e.name, 0.85))) art.appendChild(make('b', '', e.name.slice(0, 1)));
        t.appendChild(art);
        const body = make('span', 'wp-exbody');
        body.appendChild(make('span', 'wp-exname', e.name));
        const chips = make('span', 'wp-exchips');
        [KIND[e.kind] || '', inPlan.has(e.id) ? 'no seu plano' : '', best[e.id] ? 'melhor ' + bestScore(best[e.id]) : ''].filter(Boolean)
          .forEach((x, n) => chips.appendChild(make('small', n === 1 ? 'on' : '', x)));
        body.appendChild(chips);
        t.appendChild(body);
        const edit = make('button', 'wp-exedit', 'Editar'); edit.type = 'button';
        edit.addEventListener('click', () => openExercise(() => render(), e));
        li.append(t, edit); ul.appendChild(li);
      });
      box.appendChild(ul);
    });
    return box;
  }

  function render() {
    const wk = S.planWeek || mondayKey(new Date());
    if (S.view === 'exercises') { const p = make('div', 'wp-page'); p.append(weekHead(wk), exercisesPage()); $('wkGrid').replaceChildren(p); return; }
    const page = make('div', 'wp-page');
    page.append(weekHead(wk), weekGrid(wk), goalsCard());
    $('wkGrid').replaceChildren(page);
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
    search.type = 'search'; search.placeholder = 'Buscar exercícios…'; search.autocomplete = 'off'; search.setAttribute('aria-label', 'Buscar exercícios');
    const list = make('ul', 'wk-ddlist');
    list.setAttribute('role', 'listbox');
    panel.append(search, list);
    root.append(btn, panel);

    const exs = () => S.data.exercises;
    const placeholder = () => (exs().length ? 'Escolha um exercício…' : 'Nenhum exercício ainda: crie um');
    const shown = () => { const q = search.value.trim().toLowerCase(); return exs().filter((e) => !q || e.name.toLowerCase().includes(q)); };

    function draw() {
      list.replaceChildren();
      const items = shown();
      dd.items = items;
      if (!items.length) { list.appendChild(make('li', 'wk-ddempty', exs().length ? 'Nada encontrado.' : 'Crie seu primeiro exercício no botão Novo exercício.')); return; }
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
          li.appendChild(make('small', '', e.kind === 'weight' ? 'kg × reps' : e.kind === 'reps' ? 'reps' : 'tempo'));
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
  let exEditing = null;
  function openExercise(done, ex) {
    exDone = done;
    exEditing = ex || null;
    exMuscle = ex ? ex.muscle : 'chest';
    exKind = ex ? ex.kind : 'weight';
    $('wkExTitle').textContent = ex ? 'Editar exercício' : 'Novo exercício';
    const del = $('wkExDelete'); del.hidden = !ex; del.classList.remove('sure'); del.textContent = 'Apagar este exercício';
    $('wkExName').value = ex ? ex.name : '';
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
    if (!name) { err.textContent = 'Dê um nome ao exercício.'; err.hidden = false; return; }
    $('wkExSave').disabled = true;
    try {
      const ex = exEditing
        ? await api('/v1/workouts/exercises/' + exEditing.id, { method: 'PATCH', body: { name, muscle: exMuscle, kind: exKind } })
        : await api('/v1/workouts/exercises', { method: 'POST', body: { name, muscle: exMuscle, kind: exKind } });
      const have = exById(ex.id);
      if (!have) S.data.exercises.push(ex); else Object.assign(have, ex);
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

  async function startSession(routineId, day) {
    try {
      const s = await api('/v1/workouts/sessions', { method: 'POST', body: { day: day || todayKey(), routine_id: routineId } });
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
    $('wkSFinish').firstChild.textContent = s.finished_at ? 'Salvar alterações' : 'Concluir treino';
    fillSelect($('wkAddSel'));
    renderSession();
    clearInterval(W.tick);
    const timer = $('wkTimer');
    const update = () => {
      if (s.finished_at) { timer.textContent = parseDay(s.day).toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' }); return; }
      const sec = Math.max(0, Math.floor((Date.now() - new Date(s.started_at).getTime()) / 1000));
      timer.textContent = (sec >= 3600 ? Math.floor(sec / 3600) + ':' : '') + pad(Math.floor((sec % 3600) / 60)) + ':' + pad(sec % 60);
    };
    update();
    W.tick = setInterval(update, 1000);
    $('wkSessionDialog').showModal();
  }

  const setUnit = (g) => (g.kind === 'time' ? 'seg' : g.kind === 'reps' ? 'reps' : 'kg × reps');
  const lastText = (g) => (g.last && g.last.length ? 'Última vez: ' + g.last.map((s) => (g.kind === 'weight' ? kg(s.weight) + '×' + s.reps : g.kind === 'reps' ? s.reps + ' reps' : s.seconds + 's')).join(', ') : 'Primeira vez. Defina seus números.');

  function renderSession() {
    const body = $('wkSBody');
    body.replaceChildren();
    const s = W.session;
    if (!s.groups.length) body.appendChild(make('p', 'wk-empty', 'Treino vazio. Escolha um exercício abaixo para adicionar as primeiras séries.'));
    s.groups.forEach((g, gi) => {
      const card = make('section', 'wk-ex');
      card.style.setProperty('--hc', COLORS[gi % COLORS.length]);
      const head = make('div', 'wk-exhead');
      if (window.WkArt && WkArt.has(g.name)) {
        const th = make('button', 'wk-thumb');
        th.type = 'button';
        th.setAttribute('aria-label', 'Como fazer ' + g.name);
        const box = make('span', 'wk-thumbbox');
        th.appendChild(box);
        th.appendChild(make('small', '', 'Como fazer'));
        WkArt.mount(box, g.name);
        th.addEventListener('click', () => openHow(g.name));
        head.appendChild(th);
      }
      const t = make('div', 'wk-ext');
      t.appendChild(make('p', 'wk-exn', g.name));
      t.appendChild(make('small', '', lastText(g)));
      head.appendChild(t);
      const rm = make('button', 'wk-link', 'Remover');
      rm.type = 'button';
      rm.addEventListener('click', () => { s.groups.splice(gi, 1); changed(); renderSession(); });
      head.appendChild(rm);
      card.appendChild(head);
      const done = g.sets.filter((x) => x.done).length;
      card.appendChild(make('p', 'wk-prog', done + ' de ' + g.sets.length + ' séries feitas'));
      const rows = make('div', 'wk-sets');
      const labels = make('div', 'wk-setrow wk-setlabels');
      labels.append(make('span', '', 'Série'), make('span', '', g.kind === 'time' ? '' : g.kind === 'weight' ? 'kg' : ''), make('span', '', g.kind === 'time' ? 'Segundos' : 'Reps'), make('span', ''), make('span', ''));
      rows.appendChild(labels);
      g.sets.forEach((st, si) => {
        const row = make('div', 'wk-setrow' + (st.done ? ' done' : ''));
        row.appendChild(make('span', 'wk-setno', String(si + 1)));
        const w = make('input', 'wk-num-in');
        w.type = 'number'; w.inputMode = 'decimal'; w.min = '0'; w.step = '0.5'; w.value = st.weight ? kg(st.weight) : ''; w.placeholder = '0';
        w.setAttribute('aria-label', g.name + ' série ' + (si + 1) + ' carga em quilos');
        w.addEventListener('input', () => { st.weight = num(w.value); changed(); });
        if (g.kind !== 'weight') w.style.visibility = 'hidden';
        const r = make('input', 'wk-num-in');
        r.type = 'number'; r.inputMode = 'numeric'; r.min = '0'; r.value = (g.kind === 'time' ? st.seconds : st.reps) || ''; r.placeholder = '0';
        r.setAttribute('aria-label', g.name + ' série ' + (si + 1) + (g.kind === 'time' ? ' segundos' : ' reps'));
        r.addEventListener('input', () => { if (g.kind === 'time') st.seconds = Math.round(num(r.value)); else st.reps = Math.round(num(r.value)); changed(); });
        const ok = make('button', 'wk-check');
        ok.type = 'button';
        ok.setAttribute('aria-pressed', String(st.done));
        ok.setAttribute('aria-label', 'Série ' + (si + 1) + ' feita');
        ok.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.5 6.6 19.5l1.2-6L3.3 9.3l6.1-.7Z"/></svg>';
        ok.addEventListener('click', () => { st.done = !st.done; changed(); renderSession(); });
        const del = make('button', 'wk-xs');
        del.type = 'button';
        del.setAttribute('aria-label', 'Remover série ' + (si + 1));
        del.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
        del.addEventListener('click', () => { g.sets.splice(si, 1); if (!g.sets.length) s.groups.splice(gi, 1); changed(); renderSession(); });
        row.append(w, r, ok, del);
        rows.appendChild(row);
      });
      card.appendChild(rows);
      const more = make('button', 'wk-chipbtn wk-addset', '+ Série');
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
    const sets = W.session.groups.flatMap((g) => g.sets.map((x) => ({ exercise_id: g.exercise_id, reps: x.reps || 0, weight: x.weight || 0, seconds: x.seconds || 0, done: !!x.done, variant: g.variant || '' })));
    try { await api('/v1/workouts/sessions/' + W.session.id + '/sets', { method: 'PUT', body: { sets } }); } catch (e) { W.dirty = true; toast(e.message); }
  }

  function addExerciseToSession(ex) {
    const s = W.session;
    if (s.groups.some((g) => g.exercise_id === ex.id)) { toast(ex.name + ' já está neste treino.'); return; }
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
      await api('/v1/workouts/sessions/' + s.id, { method: 'PATCH', body: { name: $('wkSName').value.trim() || 'Treino', notes: $('wkSNotes').value.trim(), finish: true } });
      const sets = s.groups.reduce((n, g) => n + g.sets.filter((x) => x.done).length, 0);
      clearInterval(W.tick);
      $('wkSessionDialog').close();
      W.session = null;
      toast(s.finished_at ? 'Salvo' : 'Treino concluído. ' + sets + (sets === 1 ? ' série registrada.' : ' séries registradas.'));
      await load();
    } catch (e) {
      err.textContent = e.message;
      err.hidden = false;
      $('wkSFinish').disabled = false;
    }
  }
  let sArmed = 0;
  async function deleteSession() {
    if (!(await IgnisConfirm.ask({ title: 'Apagar treino', text: 'Apagar este treino registrado? Isso não pode ser desfeito.' }))) return;
    try {
      clearTimeout(W.saveTimer);
      W.dirty = false;
      await api('/v1/workouts/sessions/' + W.session.id, { method: 'DELETE' });
      clearInterval(W.tick);
      $('wkSessionDialog').close();
      W.session = null;
      toast('Treino apagado');
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
    $('wkRoutineTitle').textContent = r ? 'Editar rotina' : 'Nova rotina';
    $('wkRName').value = r ? r.name : '';
    const planned = new Set(r ? r.days || [] : []);
    $('wkRDays').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(planned.has(Number(b.dataset.d)))));
    $('wkRErr').hidden = true;
    $('wkRSave').disabled = false;
    const del = $('wkRDelete');
    del.hidden = !r;
    del.classList.remove('sure');
    del.textContent = 'Apagar esta rotina';
    fillSelect($('wkRSel'));
    drawItems();
    $('wkRoutineDialog').showModal();
    $('wkRName').focus();
  }
  function drawItems() {
    const box = $('wkRItems');
    box.replaceChildren();
    if (!items.length) box.appendChild(make('p', 'wk-empty wk-empty-in', 'Nenhum exercício ainda. Adicione abaixo.'));
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
      row.appendChild(mk('Séries', it.sets, (v) => { it.sets = Math.max(1, Math.round(v)); }));
      if (ex.kind === 'time') row.appendChild(mk('Seg', it.seconds, (v) => { it.seconds = Math.round(v); }));
      else {
        row.appendChild(mk('Reps', it.reps, (v) => { it.reps = Math.round(v); }));
        if (ex.kind === 'weight') row.appendChild(mk('kg', it.weight, (v) => { it.weight = v; }, '0.5'));
      }
      const up = make('button', 'wk-xs');
      up.type = 'button'; up.setAttribute('aria-label', 'Subir'); up.disabled = i === 0;
      up.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>';
      up.addEventListener('click', () => { [items[i - 1], items[i]] = [items[i], items[i - 1]]; drawItems(); });
      const rm = make('button', 'wk-xs');
      rm.type = 'button'; rm.setAttribute('aria-label', 'Remover ' + ex.name);
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
    if (!name) { err.textContent = 'Dê um nome à rotina.'; err.hidden = false; return; }
    $('wkRSave').disabled = true;
    const days = [...$('wkRDays').querySelectorAll('button[aria-pressed="true"]')].map((b) => Number(b.dataset.d));
    const body = { name, days, items };
    try {
      if (editingRoutine) await api('/v1/workouts/routines/' + editingRoutine.id, { method: 'PUT', body });
      else await api('/v1/workouts/routines', { method: 'POST', body });
      $('wkRoutineDialog').close();
      toast(editingRoutine ? 'Salvo' : 'Rotina adicionada');
      await load();
    } catch (e) {
      err.textContent = e.message;
      err.hidden = false;
      $('wkRSave').disabled = false;
    }
  }
  async function deleteRoutine() {
    if (!(await IgnisConfirm.ask({ title: 'Apagar rotina', text: 'Apagar esta rotina? Os treinos já registrados continuam.' }))) return;
    try {
      await api('/v1/workouts/routines/' + editingRoutine.id, { method: 'DELETE' });
      $('wkRoutineDialog').close();
      toast('Rotina apagada');
      await load();
    } catch (e) { toast(e.message); }
  }

  // ---- stars trail the pointer (same as the other pages) ---------------------------------------------------------------------------------------
  function sparkTrail() {
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const SP = 'M0,-1 C.15,-.3 .3,-.15 1,0 C.3,.15 .15,.3 0,1 C-.15,.3 -.3,.15 -1,0 C-.3,-.15 -.15,-.3 0,-1Z';
    const layer = make('div', 'fd-trail');
    document.body.appendChild(layer);
    const LIGHT = ['#a23a6b', '#2d1b3d', '#ffffff'];
    const DARK = ['#ffb38a', '#cdb4f6', '#fff1e8'];
    let last = 0, lx = -99, ly = -99;
    document.addEventListener('pointermove', (event) => {
      if (event.pointerType === 'touch') return;
      const t = performance.now();
      if (t - last < 55 || Math.hypot(event.clientX - lx, event.clientY - ly) < 18) return;
      const target = event.target;
      if (target.closest && target.closest('dialog, input, button')) return;
      last = t; lx = event.clientX; ly = event.clientY;
      const surface = target.closest ? target.closest('.fd-fig') : null;
      let dark = false;
      if (surface) {
        const m = getComputedStyle(surface).backgroundColor.match(/\d+(\.\d+)?/g);
        if (m) dark = (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]) < 110;
      }
      const colors = dark ? DARK : LIGHT;
      const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      s.setAttribute('viewBox', '-1 -1 2 2');
      s.setAttribute('class', 'fd-bs');
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
    $('wkInfoClose').addEventListener('click', () => $('wkInfoDialog').close());
    $('wkInfoDialog').addEventListener('click', (e) => { if (e.target === $('wkInfoDialog')) $('wkInfoDialog').close(); });
    $('wkInfoDialog').addEventListener('close', () => { if (howArt) { howArt.stop(); howArt = null; } });
    $('wkExDelete').addEventListener('click', async () => {
      const del = $('wkExDelete');
      if (!(await IgnisConfirm.ask({ title: 'Apagar exercício', text: 'Apagar este exercício? Isso não pode ser desfeito.' }))) return;
      try {
        await api('/v1/workouts/exercises/' + exEditing.id, { method: 'DELETE' });
        S.data.exercises = S.data.exercises.filter((e) => e.id !== exEditing.id);
        $('wkExDialog').close(); render(); toast('Exercício apagado');
      } catch (e) { $('wkExErr').textContent = e.message; $('wkExErr').hidden = false; del.classList.remove('sure'); del.textContent = 'Apagar este exercício'; }
    });
    window.addEventListener('hashchange', () => { S.view = location.hash === '#exercises' ? 'exercises' : 'plan'; render(); });
    ['wkRoutineDialog', 'wkExDialog'].forEach((id) => $(id).addEventListener('click', (e) => { if (e.target === $(id)) $(id).close(); }));
    $('wkSessionForm').addEventListener('submit', finishSession);
    $('wkSDelete').addEventListener('click', deleteSession);
    $('wkSName').addEventListener('change', async () => { if (W.session) { try { await api('/v1/workouts/sessions/' + W.session.id, { method: 'PATCH', body: { name: $('wkSName').value.trim() || 'Treino' } }); } catch (e) { toast(e.message); } } });
    $('wkSNotes').addEventListener('change', async () => { if (W.session) { try { await api('/v1/workouts/sessions/' + W.session.id, { method: 'PATCH', body: { notes: $('wkSNotes').value.trim() } }); } catch (e) { toast(e.message); } } });
    $('wkAddBtn').addEventListener('click', () => { const ex = exById(selValue($('wkAddSel'))); if (!ex) { toast('Escolha um exercício primeiro.'); return; } addExerciseToSession(ex); resetSel($('wkAddSel')); });
    $('wkNewEx').addEventListener('click', () => openExercise((ex) => { fillSelect($('wkAddSel')); addExerciseToSession(ex); }));
    $('wkRoutineForm').addEventListener('submit', saveRoutine);
    $('wkPlanForm').addEventListener('submit', (e) => savePlanEdit(e, false));
    $('wkPlanClose').addEventListener('click', () => $('wkPlanDialog').close());
    $('wkPlanDialog').addEventListener('click', (e) => { if (e.target === $('wkPlanDialog')) $('wkPlanDialog').close(); });
    $('wkPDays').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true')); });
    $('wkPScope').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { PE.scope = b.dataset.v; pressed($('wkPScope'), PE.scope); $('wkPScopeNote').hidden = PE.scope !== 'onwards'; } });
    $('wkPDelete').addEventListener('click', async () => {
      if (!(await IgnisConfirm.ask({ title: 'Remover do plano', text: 'Remover este exercício do plano?', ok: 'Remover' }))) return;
      savePlanEdit(null, true);
    });
    $('wkRDays').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true')); });
    $('wkRDelete').addEventListener('click', deleteRoutine);
    $('wkRAdd').addEventListener('click', () => { const ex = exById(selValue($('wkRSel'))); if (!ex) { toast('Escolha um exercício primeiro.'); return; } addRoutineExercise(ex); resetSel($('wkRSel')); });
    $('wkRNewEx').addEventListener('click', () => openExercise((ex) => addRoutineExercise(ex)));
    $('wkExForm').addEventListener('submit', saveExercise);
    $('wkExMuscle').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { exMuscle = b.dataset.v; pressed($('wkExMuscle'), exMuscle); } });
    $('wkExKind').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { exKind = b.dataset.v; pressed($('wkExKind'), exKind); } });
    load().catch(() => {
      $('wkGrid').hidden = true;
      $('wkEmpty').textContent = 'Não foi possível carregar seus treinos agora.';
      $('wkEmpty').hidden = false;
    });
  }

  init();
})();
