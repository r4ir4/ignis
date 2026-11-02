// Food page: a meal log with calories and macros against daily goals, a 7-day chart and a 30-day view, backed by the shared ignis API.
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

  const SLOTS = [['breakfast', 'Café da manhã'], ['am_snack', 'Lanche da manhã'], ['lunch', 'Almoço'], ['pm_snack', 'Lanche da tarde'], ['dinner', 'Jantar'], ['supper', 'Ceia']];
  const SLOT_COLOR = { breakfast: '#ffca26', am_snack: '#f3e8cc', lunch: '#9abc04', pm_snack: '#f3e8cc', dinner: '#f86015', supper: '#ffca26' };
  const FEEL = { great: 'Great', ok: 'Okay', heavy: 'Heavy' };
  const todayKey = () => dayKey(new Date());
  const S = { day: todayKey(), data: null };

  async function load() {
    S.data = await api('/v1/food/overview?day=' + S.day + '&window=30');
    render();
  }

  const totals = (meals) => meals.reduce((t, m) => ({ calories: t.calories + m.calories, protein_g: t.protein_g + m.protein_g, carbs_g: t.carbs_g + m.carbs_g, fat_g: t.fat_g + m.fat_g, fiber_g: t.fiber_g + (m.fiber_g || 0) }), { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 });

  function figure(cls) { return make('figure', 'fd-fig ' + cls); }
  function emptyIn(c, text) { c.appendChild(make('p', 'fd-empty', text)); return c; }

  // ---- top row: the word card and four number tiles -----------------------------------------------------------------------------------------
  function wordCard() {
    const f = figure('fd-word grain');
    f.innerHTML = '<svg viewBox="0 0 600 200" aria-hidden="true"><g filter="url(#goo)"><text x="300" y="135" text-anchor="middle" transform="rotate(-4 300 100)" class="goo-word">food</text></g></svg>' +
      '<svg class="h-tw fd-tw" style="--x:5%;--y:14%;--s:20px;--d:0s" viewBox="0 0 32 32" aria-hidden="true"><use href="#spark"/></svg><svg class="h-tw fd-tw fd-tw-p" style="--x:90%;--y:70%;--s:22px;--d:.9s" viewBox="0 0 32 32" aria-hidden="true"><use href="#spark"/></svg><svg class="h-tw fd-tw" style="--x:89%;--y:12%;--s:12px;--d:1.7s" viewBox="0 0 32 32" aria-hidden="true"><use href="#spark"/></svg><svg class="h-tw fd-tw fd-tw-p" style="--x:6%;--y:72%;--s:14px;--d:2.3s" viewBox="0 0 32 32" aria-hidden="true"><use href="#spark"/></svg>';
    return f;
  }

  // little animated icons that sit inside each tile's progress ring (84 x 84 box)
  const ICON = {
    flame: '<g class="fd-i-flame"><path fill="currentColor" d="M42 18C45 32 31 35 33 48C37 46 39 42 42 38C42 47 54 50 54 59C54 67 48 70 42 70C35 70 29 65 29 57C29 41 40 35 42 18Z"/><path class="fd-i-core" d="M42 52C42 58 36 59 36 63C36 66 38 68 42 68C46 68 48 66 48 63C48 59 43 58 42 52Z"/></g>',
    egg: '<g class="fd-i-egg"><path d="M20 44C18 32 28 24 40 25C52 24 64 30 62 42C66 54 54 62 44 60C32 64 20 58 20 44Z" fill="#fffdf6" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><circle class="fd-i-yolk" cx="42" cy="43" r="9" fill="#ffca26"/><circle cx="39" cy="40" r="2.4" fill="#fff" opacity=".8"/></g>',
    bread: '<g class="fd-i-bread"><path fill="currentColor" d="M24 66V42C14 40 14 24 26 21C34 15 52 15 60 21C72 24 70 40 60 42V66Z"/><path d="M32 50H52M32 58H52" stroke="#19532b" stroke-width="3.4" stroke-linecap="round" fill="none" opacity=".55"/></g>',
    wheat: '<g class="fd-i-wheat" fill="currentColor"><path d="M41 70V30" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" fill="none"/><ellipse cx="42" cy="24" rx="4.2" ry="8"/><ellipse cx="33" cy="36" rx="4.2" ry="8" transform="rotate(-32 33 36)"/><ellipse cx="50" cy="36" rx="4.2" ry="8" transform="rotate(32 50 36)"/><ellipse cx="33" cy="49" rx="4.2" ry="8" transform="rotate(-32 33 49)"/><ellipse cx="50" cy="49" rx="4.2" ry="8" transform="rotate(32 50 49)"/><ellipse cx="34" cy="62" rx="3.8" ry="7" transform="rotate(-32 34 62)"/><ellipse cx="49" cy="62" rx="3.8" ry="7" transform="rotate(32 49 62)"/></g>',
    drop: '<g class="fd-i-drop"><path fill="currentColor" d="M42 14C42 14 22 38 22 52a20 20 0 0 0 40 0C62 38 42 14 42 14Z"/><path d="M33 52a9 9 0 0 0 7 9" fill="none" stroke="#fffdf6" stroke-width="3.4" stroke-linecap="round" opacity=".85"/></g>',
  };

  // a tile: label, a giant counted-up numeral, and a ring toward the goal with a small animated icon inside
  function tile(cls, label, value, unit, goal, icon) {
    const li = make('li', 'fd-tile ' + cls);
    const left = make('span', 'fd-tl');
    left.appendChild(make('small', '', label));
    const b = make('b', 'fd-num');
    const n = make('span', '', '0');
    b.appendChild(n);
    if (unit === 'g') b.appendChild(make('em', '', unit));
    left.appendChild(b);
    const over = goal && value > goal * 1.1;
    left.appendChild(make('span', 'fd-goal', goal ? 'of ' + fmt(goal) + (unit ? ' ' + unit : '') + (over ? ' · over' : '') : 'no goal yet'));
    li.appendChild(left);
    const pct = goal ? Math.min(100, (value / goal) * 100) : 0;
    const art = make('span', 'fd-art');
    art.setAttribute('aria-hidden', 'true');
    art.innerHTML = '<svg viewBox="0 0 84 84"><circle class="fd-rtrack" cx="42" cy="42" r="37"/><circle class="fd-rfill" cx="42" cy="42" r="37" pathLength="100" style="--p:' + pct + '"/>' + ICON[icon] + '</svg>';
    li.appendChild(art);
    li.setAttribute('aria-label', label + ': ' + fmt(value) + (unit ? ' ' + unit : '') + (goal ? ' of ' + fmt(goal) : ''));
    if (over) li.classList.add('over');
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !value) n.textContent = fmt(value);
    else {
      const t0 = performance.now();
      const tick = (t) => {
        const k = Math.min(1, (t - t0) / 700);
        n.textContent = fmt(value * (1 - Math.pow(1 - k, 3)));
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
    return li;
  }

  function tiles() {
    const t = totals(S.data.meals);
    const g = S.data.goals;
    const ul = make('ul', 'fd-tiles');
    ul.setAttribute('aria-label', 'Totals for the day');
    ul.append(
      tile('t-cal', 'Calories', t.calories, 'kcal', g.calories, 'flame'),
      tile('t-pro', 'Protein', t.protein_g, 'g', g.protein_g, 'egg'),
      tile('t-carb', 'Carbs', t.carbs_g, 'g', g.carbs_g, 'bread'),
      tile('t-fat', 'Fat', t.fat_g, 'g', g.fat_g, 'drop'),
      tile('t-fib', 'Fiber', t.fiber_g, 'g', g.fiber_g, 'wheat'),
    );
    return ul;
  }

  // ---- the day's log -----------------------------------------------------------------------------------------------------------------------
  function dayLabel() {
    if (S.day === todayKey()) return 'Today';
    if (S.day === dayKey(addDays(new Date(), -1))) return 'Yesterday';
    return parseDay(S.day).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
  }

  function logCard() {
    const c = figure('fd-log');
    const head = make('div', 'fd-head');
    const nav = make('div', 'fd-nav');
    const prev = make('button', 'fd-arrow');
    prev.type = 'button';
    prev.setAttribute('aria-label', 'Previous day');
    prev.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
    prev.addEventListener('click', () => goDay(-1));
    const next = make('button', 'fd-arrow');
    next.type = 'button';
    next.setAttribute('aria-label', 'Next day');
    next.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>';
    next.disabled = S.day >= todayKey();
    next.addEventListener('click', () => goDay(1));
    nav.append(prev, make('p', 'fd-k fd-when', dayLabel()), next);
    head.appendChild(nav);
    const add = make('button', 'fd-mini');
    add.type = 'button';
    add.innerHTML = '<span class="fd-plus" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></span><span>Add meal</span>';
    add.addEventListener('click', () => openMeal(null));
    head.appendChild(add);
    c.appendChild(head);

    const t = totals(S.data.meals);
    const big = make('p', 'fd-bigtotal');
    big.appendChild(make('b', '', fmt(t.calories)));
    big.appendChild(make('small', '', 'kcal'));
    c.appendChild(big);

    if (!S.data.meals.length) return emptyIn(c, 'Nothing logged for this day. Add what you ate.');
    const list = make('ul', 'fd-list');
    SLOTS.forEach(([slot, label], i) => {
      const meals = S.data.meals.filter((m) => m.slot === slot);
      if (!meals.length) return;
      list.appendChild(make('li', 'fd-group g' + (i % 6), label));
      meals.forEach((m) => list.appendChild(row(m)));
    });
    c.appendChild(list);
    const goals = make('button', 'fd-goals', 'Set daily goals');
    goals.type = 'button';
    goals.addEventListener('click', openGoals);
    c.appendChild(goals);
    return c;
  }

  function row(m) {
    const li = make('li', 'fd-row');
    li.style.setProperty('--hc', SLOT_COLOR[m.slot]);
    li.appendChild(make('i', 'fd-bullet'));
    const name = make('div', 'fd-name', m.name);
    const bits = [];
    if (m.calories) bits.push(fmt(m.calories) + ' kcal');
    if (m.protein_g) bits.push('P ' + Math.round(m.protein_g));
    if (m.carbs_g) bits.push('C ' + Math.round(m.carbs_g));
    if (m.fat_g) bits.push('F ' + Math.round(m.fat_g));
    if (m.fiber_g) bits.push('Fi ' + Math.round(m.fiber_g));
    if (bits.length) name.appendChild(make('small', '', bits.join(' · ')));
    if (m.notes) name.appendChild(make('small', 'fd-note', m.notes));
    li.appendChild(name);
    if (m.feel) li.appendChild(make('span', 'fd-feelpill f-' + m.feel, FEEL[m.feel]));
    const edit = make('button', 'fd-edit', 'Edit');
    edit.type = 'button';
    edit.addEventListener('click', () => openMeal(m));
    li.appendChild(edit);
    return li;
  }

  function goDay(n) {
    const d = addDays(parseDay(S.day), n);
    if (dayKey(d) > todayKey()) return;
    S.day = dayKey(d);
    load().catch((e) => toast(e.message));
  }

  // ---- last 7 days: bars against the goal line ----------------------------------------------------------------------------------------------
  function weekCard() {
    const c = figure('fd-week-card');
    const avg = S.data.week_avg_calories;
    const head = make('div', 'fd-head');
    head.appendChild(make('p', 'fd-k', 'Last 7 days'));
    if (avg) head.appendChild(make('span', 'fd-pillsm', 'avg ' + fmt(avg) + ' kcal'));
    c.appendChild(head);
    const days = Array.from({ length: 7 }, (_, i) => addDays(parseDay(S.day), i - 6));
    const vals = days.map((d) => (S.data.days[dayKey(d)] || {}).calories || 0);
    const goal = S.data.goals.calories || 0;
    const max = Math.max(goal * 1.15, ...vals, 100);
    const W = 420, H = 190, padL = 6, padB = 26, top = 14, bw = 34;
    const gap = (W - padL * 2 - bw * 7) / 6;
    const y = (v) => top + (H - padB - top) * (1 - v / max);
    let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="fd-chart" role="img" aria-label="Calories for the last seven days">';
    if (goal) svg += '<line class="fd-goalline" x1="0" x2="' + W + '" y1="' + y(goal) + '" y2="' + y(goal) + '"/><text class="fd-goaltxt" x="' + (W - 2) + '" y="' + (y(goal) - 5) + '" text-anchor="end">goal ' + fmt(goal) + '</text>';
    days.forEach((d, i) => {
      const x = padL + i * (bw + gap);
      const v = vals[i];
      const h = Math.max(v ? 4 : 3, (H - padB - top) * (v / max));
      const over = goal && v > goal * 1.1;
      svg += '<rect class="fd-barr' + (v ? '' : ' none') + (over ? ' over' : '') + (dayKey(d) === S.day ? ' sel' : '') + '" x="' + x + '" y="' + (H - padB - h) + '" width="' + bw + '" height="' + h + '" rx="9"><title>' + d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' }) + ': ' + (v ? fmt(v) + ' kcal' : 'nothing logged') + '</title></rect>';
      svg += '<text class="fd-dow" x="' + (x + bw / 2) + '" y="' + (H - 7) + '" text-anchor="middle">' + d.toLocaleDateString(undefined, { weekday: 'narrow' }) + '</text>';
    });
    c.insertAdjacentHTML('beforeend', svg + '</svg>');
    return c;
  }

  // ---- last 30 days: one square each, filled when something was logged ----------------------------------------------------------------------
  function monthCard() {
    const c = figure('fd-month-card');
    const head = make('div', 'fd-head');
    head.appendChild(make('p', 'fd-k', 'Last 30 days'));
    head.appendChild(make('span', 'fd-pillsm', S.data.logged_streak + (S.data.logged_streak === 1 ? ' day' : ' days') + ' in a row'));
    c.appendChild(head);
    const grid = make('div', 'fd-month');
    const goal = S.data.goals.calories || 0;
    for (let i = 29; i >= 0; i--) {
      const d = addDays(parseDay(S.day), -i);
      const key = dayKey(d);
      const info = S.data.days[key];
      let level = '';
      if (info && info.meals) level = goal && info.calories >= goal * 0.8 && info.calories <= goal * 1.1 ? 'l2' : 'l1';
      const sq = make('button', 'fd-sq ' + level + (key === S.day ? ' now' : ''), String(d.getDate()));
      sq.type = 'button';
      sq.title = d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }) + (info ? ' · ' + fmt(info.calories) + ' kcal' : ' · nothing logged');
      sq.addEventListener('click', () => { S.day = key; load().catch((e) => toast(e.message)); });
      grid.appendChild(sq);
    }
    c.appendChild(grid);
    c.appendChild(make('p', 'fd-legend', goal ? 'Green: within your calorie goal. Yellow: logged.' : 'Yellow: logged. Set a calorie goal to see which days hit it.'));
    return c;
  }

  function render() {
    const board = make('div', 'identity fd-board');
    const g = make('div', 'fd-idgrid');
    const side = make('div', 'fd-side');
    side.append(weekCard(), monthCard());
    g.append(wordCard(), tiles(), logCard(), side);
    board.appendChild(g);
    const foot = make('footer', 'fd-foot');
    const txt = make('p', 'fd-foottxt');
    txt.id = 'fdFootTxt';
    txt.textContent = footText();
    foot.appendChild(txt);
    const create = make('button', 'fd-mini fd-create');
    create.type = 'button';
    create.innerHTML = '<span class="fd-plus" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></span><span>Create food</span>';
    create.addEventListener('click', openFood);
    foot.appendChild(create);
    board.appendChild(foot);
    $('fdGrid').replaceChildren(board);
  }

  // ---- meal dialog ----------------------------------------------------------------------------------------------------------------------------
  let editing = null;
  let slot = 'breakfast';
  let feel = '';
  let armed = 0;
  const pressed = (box, value) => box.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === value)));
  function defaultSlot() { const h = new Date().getHours(); return h < 10 ? 'breakfast' : h < 12 ? 'am_snack' : h < 15 ? 'lunch' : h < 18 ? 'pm_snack' : h < 21 ? 'dinner' : 'supper'; }

  // ---- the food library on the right of the meal dialog: saved foods and recent meals, tap one to fill the form ------------------------------------
  const LIB = { saved: [], recent: [], tab: 'saved' };
  let keep = false;
  async function loadLib() {
    try {
      const data = await api('/v1/food/library');
      LIB.saved = data.saved;
      LIB.recent = data.recent;
    } catch (e) { /* the list just stays as it was */ }
    LIB.tab = LIB.saved.length || !LIB.recent.length ? 'saved' : 'recent';
    pressed($('fdLibTabs'), LIB.tab);
    renderLib();
  }
  const macroLine = (f) => [f.calories ? fmt(f.calories) + ' kcal' : '', f.protein_g ? 'P ' + Math.round(f.protein_g) : '', f.carbs_g ? 'C ' + Math.round(f.carbs_g) : '', f.fat_g ? 'F ' + Math.round(f.fat_g) : '', f.fiber_g ? 'Fi ' + Math.round(f.fiber_g) : ''].filter(Boolean).join(' · ');
  function renderLib() {
    const ul = $('fdLibList');
    const q = $('fdLibSearch').value.trim().toLowerCase();
    const items = LIB[LIB.tab].filter((f) => !q || f.name.toLowerCase().includes(q));
    ul.replaceChildren();
    if (!items.length) {
      ul.appendChild(make('li', 'fd-libempty', q ? 'Nothing matches.' : LIB.tab === 'saved' ? 'No saved foods yet. Turn on "Save to my foods" when you log a meal and it shows up here.' : 'Meals you log will show up here.'));
      return;
    }
    items.forEach((f) => {
      const li = make('li', 'fd-libitem');
      const pick = make('button', 'fd-pick');
      pick.type = 'button';
      pick.appendChild(make('span', 'fd-pn', f.name));
      pick.appendChild(make('small', '', macroLine(f) || 'No numbers'));
      pick.addEventListener('click', () => fillFrom(f, pick));
      li.appendChild(pick);
      if (LIB.tab === 'saved') {
        const del = make('button', 'fd-libdel');
        del.type = 'button';
        del.setAttribute('aria-label', 'Remove ' + f.name + ' from my foods');
        del.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
        del.addEventListener('click', async () => {
          try { await api('/v1/food/presets/' + f.id, { method: 'DELETE' }); LIB.saved = LIB.saved.filter((x) => x.id !== f.id); renderLib(); } catch (e) { toast(e.message); }
        });
        li.appendChild(del);
      }
      ul.appendChild(li);
    });
  }
  function fillFrom(f, btn) {
    $('fdName').value = f.name;
    $('fdCal').value = f.calories || '';
    $('fdP').value = f.protein_g ? Math.round(f.protein_g * 10) / 10 : '';
    $('fdC').value = f.carbs_g ? Math.round(f.carbs_g * 10) / 10 : '';
    $('fdF').value = f.fat_g ? Math.round(f.fat_g * 10) / 10 : '';
    $('fdFi').value = f.fiber_g ? Math.round(f.fiber_g * 10) / 10 : '';
    if (f.slot) { slot = f.slot; pressed($('fdSlots'), slot); }
    document.querySelectorAll('.fd-pick.on').forEach((b) => b.classList.remove('on'));
    btn.classList.add('on');
    ['fdName', 'fdCal', 'fdP', 'fdC', 'fdF', 'fdFi'].forEach((id) => { const el = $(id); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); });
  }
  function setKeep(on) { keep = on; $('fdKeep').setAttribute('aria-pressed', String(on)); }

  function openMeal(m) {
    editing = m;
    slot = m ? m.slot : defaultSlot();
    feel = m && m.feel ? m.feel : '';
    $('fdMealTitle').textContent = m ? 'Edit meal' : 'Add meal';
    $('fdName').value = m ? m.name : '';
    $('fdCal').value = m && m.calories ? m.calories : '';
    $('fdP').value = m && m.protein_g ? Math.round(m.protein_g * 10) / 10 : '';
    $('fdC').value = m && m.carbs_g ? Math.round(m.carbs_g * 10) / 10 : '';
    $('fdF').value = m && m.fat_g ? Math.round(m.fat_g * 10) / 10 : '';
    $('fdFi').value = m && m.fiber_g ? Math.round(m.fiber_g * 10) / 10 : '';
    $('fdNotes').value = m && m.notes ? m.notes : '';
    pressed($('fdSlots'), slot);
    pressed($('fdFeel'), feel);
    setKeep(false);
    $('fdLibSearch').value = '';
    loadLib();
    $('fdMealErr').hidden = true;
    $('fdMealSave').disabled = false;
    const del = $('fdMealDelete');
    del.hidden = !m;
    del.classList.remove('sure');
    del.textContent = 'Delete this meal';
    $('fdMealDialog').showModal();
    $('fdName').focus();
  }

  async function saveMeal(event) {
    event.preventDefault();
    const name = $('fdName').value.trim();
    const err = $('fdMealErr');
    err.hidden = true;
    if (!name) { err.textContent = 'Say what you ate.'; err.hidden = false; return; }
    $('fdMealSave').disabled = true;
    const body = { slot, name, calories: Math.round(num($('fdCal').value)), protein_g: num($('fdP').value), carbs_g: num($('fdC').value), fat_g: num($('fdF').value), fiber_g: num($('fdFi').value), notes: $('fdNotes').value.trim(), feel };
    try {
      if (editing) await api('/v1/food/meals/' + editing.id, { method: 'PATCH', body });
      else await api('/v1/food/meals', { method: 'POST', body: { ...body, day: S.day, notes: body.notes || null, feel: feel || null } });
      if (keep) { try { await api('/v1/food/presets', { method: 'POST', body: { name, slot, calories: body.calories, protein_g: body.protein_g, carbs_g: body.carbs_g, fat_g: body.fat_g, fiber_g: body.fiber_g } }); } catch (e) { /* the meal itself is saved */ } }
      $('fdMealDialog').close();
      toast(editing ? 'Saved' : keep ? 'Meal added and saved to my foods' : 'Meal added');
      if (keep) countSaved();
      await load();
    } catch (e) {
      err.textContent = e.message;
      err.hidden = false;
      $('fdMealSave').disabled = false;
    }
  }

  async function removeMeal() {
    const del = $('fdMealDelete');
    if (!armed) {
      armed = setTimeout(() => { armed = 0; del.classList.remove('sure'); del.textContent = 'Delete this meal'; }, 4000);
      del.classList.add('sure');
      del.textContent = 'Sure? Tap again to delete';
      return;
    }
    clearTimeout(armed);
    armed = 0;
    try {
      await api('/v1/food/meals/' + editing.id, { method: 'DELETE' });
      $('fdMealDialog').close();
      toast('Meal deleted');
      await load();
    } catch (e) { toast(e.message); }
  }

  // ---- footer: create a food (or a whole meal) to reuse later ----------------------------------------------------------------------------------
  let savedCount = null;
  const footText = () => (savedCount == null ? 'Create foods and meals once, then pick them whenever you add a meal.' : savedCount === 0 ? 'No foods saved yet. Create the ones you eat often, then pick them whenever you add a meal.' : savedCount + (savedCount === 1 ? ' food' : ' foods') + ' saved. Pick them whenever you add a meal.');
  async function countSaved() {
    try { savedCount = (await api('/v1/food/library')).saved.length; } catch (e) { return; }
    const el = $('fdFootTxt');
    if (el) el.textContent = footText();
  }
  let foodSlot = '';
  function openFood() {
    foodSlot = '';
    pressed($('fdFoodSlots'), foodSlot);
    ['fdFoodName', 'fdFoodCal', 'fdFoodP', 'fdFoodC', 'fdFoodF', 'fdFoodFi'].forEach((id) => { $(id).value = ''; });
    $('fdFoodErr').hidden = true;
    $('fdFoodSave').disabled = false;
    $('fdFoodDialog').showModal();
    $('fdFoodName').focus();
  }
  async function saveFood(event) {
    event.preventDefault();
    const name = $('fdFoodName').value.trim();
    const err = $('fdFoodErr');
    err.hidden = true;
    if (!name) { err.textContent = 'Give the food a name.'; err.hidden = false; return; }
    $('fdFoodSave').disabled = true;
    try {
      await api('/v1/food/presets', { method: 'POST', body: { name, slot: foodSlot || null, calories: Math.round(num($('fdFoodCal').value)), protein_g: num($('fdFoodP').value), carbs_g: num($('fdFoodC').value), fat_g: num($('fdFoodF').value), fiber_g: num($('fdFoodFi').value) } });
      $('fdFoodDialog').close();
      toast('Saved to my foods');
      countSaved();
    } catch (e) {
      err.textContent = e.message;
      err.hidden = false;
      $('fdFoodSave').disabled = false;
    }
  }

  // ---- goals dialog ---------------------------------------------------------------------------------------------------------------------------
  function openGoals() {
    const g = S.data.goals;
    $('fdGCal').value = g.calories || '';
    $('fdGP').value = g.protein_g || '';
    $('fdGC').value = g.carbs_g || '';
    $('fdGF').value = g.fat_g || '';
    $('fdGFi').value = g.fiber_g || '';
    $('fdGoalErr').hidden = true;
    $('fdGoalSave').disabled = false;
    $('fdGoalDialog').showModal();
    $('fdGCal').focus();
  }

  async function saveGoals(event) {
    event.preventDefault();
    $('fdGoalSave').disabled = true;
    const val = (id, whole) => { const n = num($('' + id).value); return n ? (whole ? Math.round(n) : n) : null; };
    try {
      await api('/v1/food/goals', { method: 'PUT', body: { calories: val('fdGCal', true), protein_g: val('fdGP'), carbs_g: val('fdGC'), fat_g: val('fdGF'), fiber_g: val('fdGFi') } });
      $('fdGoalDialog').close();
      toast('Goals saved');
      await load();
    } catch (e) {
      $('fdGoalErr').textContent = e.message;
      $('fdGoalErr').hidden = false;
      $('fdGoalSave').disabled = false;
    }
  }

  // ---- stars trail the pointer (same as the other pages) ---------------------------------------------------------------------------------------
  function sparkTrail() {
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const STAR = 'M0,-1 C.15,-.3 .3,-.15 1,0 C.3,.15 .15,.3 0,1 C-.15,.3 -.3,.15 -1,0 C-.3,-.15 -.15,-.3 0,-1Z';
    const layer = make('div', 'fd-trail');
    document.body.appendChild(layer);
    const LIGHT = ['#d42518', '#19532b', '#fffdf6'];
    const DARK = ['#ffca26', '#9abc04', '#f3e8cc'];
    let last = 0, lx = -99, ly = -99;
    document.addEventListener('pointermove', (event) => {
      if (event.pointerType === 'touch') return;
      const now = performance.now();
      if (now - last < 55 || Math.hypot(event.clientX - lx, event.clientY - ly) < 18) return;
      const target = event.target;
      if (target.closest && target.closest('dialog, input, button')) return;
      last = now; lx = event.clientX; ly = event.clientY;
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
    $('fdMealClose').addEventListener('click', () => $('fdMealDialog').close());
    $('fdGoalClose').addEventListener('click', () => $('fdGoalDialog').close());
    $('fdFoodClose').addEventListener('click', () => $('fdFoodDialog').close());
    $('fdFoodForm').addEventListener('submit', saveFood);
    $('fdFoodSlots').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { foodSlot = foodSlot === b.dataset.v ? '' : b.dataset.v; pressed($('fdFoodSlots'), foodSlot); } });
    countSaved();
    ['fdMealDialog', 'fdGoalDialog', 'fdFoodDialog'].forEach((id) => $(id).addEventListener('click', (e) => { if (e.target === $(id)) $(id).close(); }));
    $('fdMealForm').addEventListener('submit', saveMeal);
    $('fdGoalForm').addEventListener('submit', saveGoals);
    $('fdMealDelete').addEventListener('click', removeMeal);
    $('fdSlots').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { slot = b.dataset.v; pressed($('fdSlots'), slot); } });
    $('fdKeep').addEventListener('click', () => setKeep(!keep));
    $('fdLibTabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { LIB.tab = b.dataset.v; pressed($('fdLibTabs'), LIB.tab); renderLib(); } });
    $('fdLibSearch').addEventListener('input', renderLib);
    $('fdFeel').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { feel = feel === b.dataset.v ? '' : b.dataset.v; pressed($('fdFeel'), feel); } });
    load().catch(() => {
      $('fdGrid').hidden = true;
      $('fdEmpty').textContent = 'Could not load your food log right now.';
      $('fdEmpty').hidden = false;
    });
    // a new day: jump back to today if the page was left open on yesterday's today
    let lastToday = todayKey();
    setInterval(() => { const t = todayKey(); if (t !== lastToday) { if (S.day === lastToday) S.day = t; lastToday = t; load().catch(() => {}); } }, 60 * 1000);
  }

  init();
})();
