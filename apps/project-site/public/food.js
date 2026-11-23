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
  const fmt = (n) => Math.round(n).toLocaleString('pt-BR');
  const num = (v) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : 0; };

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
    toastTimer = setTimeout(() => { el.hidden = true; }, 2400);
  }

  // the meal divisions: [key, label] in the order the server keeps them (these six are only the start-up default until the first load)
  let SLOTS = [['breakfast', 'Café da manhã', '07:30'], ['am_snack', 'Lanche da manhã', '10:00'], ['lunch', 'Almoço', '12:30'], ['pm_snack', 'Lanche da tarde', '15:30'], ['dinner', 'Jantar', '19:30'], ['supper', 'Ceia', '22:00']];
  const SLOT_COLORS = { breakfast: '#f2b84b', am_snack: '#fbeedc', lunch: '#b7c98b', pm_snack: '#fbeedc', dinner: '#d9653b', supper: '#f2b84b' };
  const SLOT_CYCLE = ['#f2b84b', '#b7c98b', '#d9653b', '#fbeedc'];
  const slotColor = (key) => SLOT_COLORS[key] || SLOT_CYCLE[Math.max(0, SLOTS.findIndex((s) => s[0] === key)) % SLOT_CYCLE.length];
  const FEEL = { great: 'Ótimo', ok: 'Ok', heavy: 'Pesado' };
  const todayKey = () => dayKey(new Date());
  const S = { day: todayKey(), data: null, mode: 'day', plan: null };

  async function load() {
    S.data = await api('/v1/food/overview?day=' + S.day + '&window=30');
    if (S.data.slots && S.data.slots.length) SLOTS = S.data.slots.map((s) => [s.key, s.label, s.time || '']);
    render();
  }

  const totals = (meals) => meals.reduce((t, m) => ({ calories: t.calories + m.calories, protein_g: t.protein_g + m.protein_g, carbs_g: t.carbs_g + m.carbs_g, fat_g: t.fat_g + m.fat_g, fiber_g: t.fiber_g + (m.fiber_g || 0) }), { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 });

  function figure(cls) { return make('figure', 'fd-fig ' + cls); }
  function emptyIn(c, text) { c.appendChild(make('p', 'fd-empty', text)); return c; }

  // ---- heading in the Todo style: the title in the display face, a status line, day arrows, a dashed rule ------------------------------------
  function goTo(key) {
    if (key > todayKey()) return;
    S.day = key;
    load().catch((e) => toast(e.message));
  }
  function pageHead() {
    const isToday = S.day === todayKey();
    const t = totals(S.data.meals);
    const head = make('header', 'fd-pagehead');
    head.innerHTML = '<svg class="h-tw fd-tw" style="--x:34%;--y:18%;--s:20px;--d:0s" viewBox="0 0 32 32" aria-hidden="true"><use href="#spark"/></svg>' +
      '<svg class="h-tw fd-tw fd-tw-p" style="--x:46%;--y:58%;--s:13px;--d:1.1s" viewBox="0 0 32 32" aria-hidden="true"><use href="#spark"/></svg>';
    const text = make('div');
    text.appendChild(make('h1', '', 'Food'));
    const date = parseDay(S.day).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    const n = S.data.meals.length;
    text.appendChild(make('p', 'fd-pagesub', (S.day === dayKey(addDays(new Date(), -1)) ? 'Ontem · ' : '') + date + ' · ' + (n ? fmt(t.calories) + ' kcal · ' + n + (n === 1 ? ' refeição' : ' refeições') : 'nada registrado')));
    head.appendChild(text);
    const nav = make('div', 'fd-pnav');
    nav.appendChild(viewTabs());
    if (!isToday) { const b = make('button', 'fd-ptoday', 'Hoje'); b.type = 'button'; b.addEventListener('click', () => goTo(todayKey())); nav.appendChild(b); }
    const ARROW = (d) => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + (d < 0 ? 'm14.5 6-6 6 6 6' : 'm9.5 6 6 6-6 6') + '"/></svg>';
    const prev = make('button', 'fd-parrow'); prev.type = 'button'; prev.innerHTML = ARROW(-1); prev.setAttribute('aria-label', 'Dia anterior');
    const next = make('button', 'fd-parrow'); next.type = 'button'; next.innerHTML = ARROW(1); next.setAttribute('aria-label', 'Próximo dia');
    next.disabled = isToday;
    prev.addEventListener('click', () => goTo(dayKey(addDays(parseDay(S.day), -1))));
    next.addEventListener('click', () => goTo(dayKey(addDays(parseDay(S.day), 1))));
    nav.append(prev, next);
    head.appendChild(nav);
    return head;
  }
  // Add meal now sits at the top of the right column, like Add task on the Todo page
  // ---- tooltip for the icon buttons: one element on the page itself, so nothing can cover it ---------------------------------------------------------
  let tipEl = null;
  function showTip(btn) {
    if (!tipEl) { tipEl = make('div', 'fd-tip'); tipEl.setAttribute('role', 'tooltip'); document.body.appendChild(tipEl); }
    tipEl.textContent = btn.dataset.tip;
    tipEl.classList.add('on');
    const r = btn.getBoundingClientRect(), t = tipEl.getBoundingClientRect();
    const left = Math.max(8, Math.min(innerWidth - t.width - 8, r.left + r.width / 2 - t.width / 2));
    const below = r.bottom + 10 + t.height < innerHeight - 8;
    tipEl.style.left = left + 'px';
    tipEl.style.top = (below ? r.bottom + 10 : r.top - 10 - t.height) + 'px';
  }
  const hideTip = () => { if (tipEl) tipEl.classList.remove('on'); };

  function addButton() {
    const wrap = make('div', 'fd-addwrap');
    const icon = (cls, id, tip, svg, count) => {
      const b = make('button', 'fd-ib ' + cls);
      b.type = 'button';
      if (id) b.id = id;
      b.setAttribute('aria-label', tip);
      b.dataset.tip = tip;
      b.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') showTip(b); });
      b.addEventListener('pointerleave', hideTip);
      b.addEventListener('focus', () => { if (b.matches(':focus-visible')) showTip(b); });
      b.addEventListener('blur', hideTip);
      b.addEventListener('click', hideTip);
      b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + svg + '</svg>' + (count != null ? '<b class="fd-count">' + count + '</b>' : '');
      return b;
    };
    const add = icon('primary', 'fdAddOpen', 'Adicionar refeição', '<path d="M12 5v14M5 12h14"/>');
    add.addEventListener('click', () => openMeal(null));
    // saved foods: a bookmark; meal divisions: stacked sections
    const foods = icon('', 'fdFoodsOpen', 'Meus alimentos', '<path d="M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1Z"/>', savedCount == null ? '' : savedCount);
    foods.addEventListener('click', openFoods);
    const rc = icon('', 'fdRecipesOpen', 'Receitas', '<path d="M5 11h14v2a6 6 0 0 1-6 6h-2a6 6 0 0 1-6-6v-2Z"/><path d="M9 11V9a3 3 0 0 1 3-3 3 3 0 0 1 3 3v2M12 3v1"/>', S.recipes ? S.recipes.length : '');
    rc.addEventListener('click', openRecipes);
    const dv = icon('', 'fdDivOpen', 'Divisões das refeições', '<rect x="4" y="4" width="16" height="4.5" rx="1.5"/><rect x="4" y="10" width="16" height="4.5" rx="1.5"/><rect x="4" y="16" width="16" height="4.5" rx="1.5"/>', divs().length);
    dv.addEventListener('click', openDivs);
    // daily goals: a target
    const gl = icon('', 'fdGoalsOpen', 'Metas diárias', '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.3"/><circle cx="12" cy="12" r=".8"/>');
    gl.addEventListener('click', openGoals);
    wrap.append(add, foods, rc, dv, gl);
    return wrap;
  }

  const ICON = {
    flame: '<g class="fd-i-flame"><path fill="currentColor" d="M42 18C45 32 31 35 33 48C37 46 39 42 42 38C42 47 54 50 54 59C54 67 48 70 42 70C35 70 29 65 29 57C29 41 40 35 42 18Z"/><path class="fd-i-core" d="M42 52C42 58 36 59 36 63C36 66 38 68 42 68C46 68 48 66 48 63C48 59 43 58 42 52Z"/></g>',
    egg: '<g class="fd-i-egg"><path d="M20 44C18 32 28 24 40 25C52 24 64 30 62 42C66 54 54 62 44 60C32 64 20 58 20 44Z" fill="#fffdf6" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><circle class="fd-i-yolk" cx="42" cy="43" r="9" fill="#f2b84b"/><circle cx="39" cy="40" r="2.4" fill="#fff" opacity=".8"/></g>',
    bread: '<g class="fd-i-bread"><path fill="currentColor" d="M24 66V42C14 40 14 24 26 21C34 15 52 15 60 21C72 24 70 40 60 42V66Z"/><path d="M32 50H52M32 58H52" stroke="#3a2418" stroke-width="3.4" stroke-linecap="round" fill="none" opacity=".55"/></g>',
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
    left.appendChild(make('span', 'fd-goal', goal ? 'de ' + fmt(goal) + (unit ? ' ' + unit : '') + (over ? ' · acima' : '') : 'sem meta ainda'));
    li.appendChild(left);
    const pct = goal ? Math.min(100, (value / goal) * 100) : 0;
    li.style.setProperty('--p', pct);
    const art = make('span', 'fd-art');
    art.setAttribute('aria-hidden', 'true');
    art.innerHTML = '<svg viewBox="0 0 84 84"><circle class="fd-rtrack" cx="42" cy="42" r="37"/><circle class="fd-rfill" cx="42" cy="42" r="37" pathLength="100" style="--p:' + pct + '"/>' + ICON[icon] + '</svg>';
    li.appendChild(art);
    li.setAttribute('aria-label', label + ': ' + fmt(value) + (unit ? ' ' + unit : '') + (goal ? ' de ' + fmt(goal) : ''));
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
    ul.setAttribute('aria-label', 'Totais do dia');
    ul.append(
      tile('t-cal', 'Calorias', t.calories, 'kcal', g.calories, 'flame'),
      tile('t-pro', 'Proteína', t.protein_g, 'g', g.protein_g, 'egg'),
      tile('t-carb', 'Carboidratos', t.carbs_g, 'g', g.carbs_g, 'bread'),
      tile('t-fat', 'Gordura', t.fat_g, 'g', g.fat_g, 'drop'),
      tile('t-fib', 'Fibra', t.fiber_g, 'g', g.fiber_g, 'wheat'),
    );
    return ul;
  }

  // ---- the day's log -----------------------------------------------------------------------------------------------------------------------
  function logCard() {
    const c = figure('fd-log');
    if (!S.data.meals.length) emptyIn(c, 'Nada registrado neste dia. Adicione o que você comeu.');
    else {
      const list = make('ul', 'fd-list');
      SLOTS.forEach(([slot, label, at], i) => {
        const meals = S.data.meals.filter((m) => m.slot === slot);
        if (!meals.length) return;
        list.appendChild(make('li', 'fd-group g' + (i % 6), label + (at ? ' · ' + at : '')));
        meals.forEach((m) => list.appendChild(row(m)));
      });
      c.appendChild(list);
    }
    return c;
  }

  function row(m) {
    const li = make('li', 'fd-row');
    li.style.setProperty('--hc', slotColor(m.slot));
    li.appendChild(make('i', 'fd-bullet'));
    const name = make('div', 'fd-name', m.name);
    const bits = [];
    if (m.grams) bits.push(fmt(m.grams) + ' g');
    if (m.calories) bits.push(fmt(m.calories) + ' kcal');
    if (m.protein_g) bits.push('P ' + Math.round(m.protein_g));
    if (m.carbs_g) bits.push('C ' + Math.round(m.carbs_g));
    if (m.fat_g) bits.push('G ' + Math.round(m.fat_g));
    if (m.fiber_g) bits.push('Fi ' + Math.round(m.fiber_g));
    if (bits.length) name.appendChild(make('small', '', bits.join(' · ')));
    if (m.notes) name.appendChild(make('small', 'fd-note', m.notes));
    li.appendChild(name);
    if (m.feel) li.appendChild(make('span', 'fd-feelpill f-' + m.feel, FEEL[m.feel]));
    const edit = make('button', 'fd-edit', 'Editar');
    edit.type = 'button';
    edit.addEventListener('click', () => openMeal(m));
    li.appendChild(edit);
    return li;
  }

  // ---- last 7 days: bars against the goal line ----------------------------------------------------------------------------------------------
  function weekCard() {
    const c = figure('fd-week-card');
    const avg = S.data.week_avg_calories;
    const head = make('div', 'fd-head');
    head.appendChild(make('p', 'fd-k', 'Últimos 7 dias'));
    if (avg) head.appendChild(make('span', 'fd-pillsm', 'média ' + fmt(avg) + ' kcal'));
    c.appendChild(head);
    const days = Array.from({ length: 7 }, (_, i) => addDays(parseDay(S.day), i - 6));
    const vals = days.map((d) => (S.data.days[dayKey(d)] || {}).calories || 0);
    const goal = S.data.goals.calories || 0;
    const max = Math.max(goal * 1.15, ...vals, 100);
    const W = 420, H = 190, padL = 6, padB = 26, top = 14, bw = 34;
    const gap = (W - padL * 2 - bw * 7) / 6;
    const y = (v) => top + (H - padB - top) * (1 - v / max);
    let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="fd-chart" role="img" aria-label="Calorias dos últimos sete dias">';
    if (goal) svg += '<line class="fd-goalline" x1="0" x2="' + W + '" y1="' + y(goal) + '" y2="' + y(goal) + '"/><text class="fd-goaltxt" x="' + (W - 2) + '" y="' + (y(goal) - 5) + '" text-anchor="end">meta ' + fmt(goal) + '</text>';
    days.forEach((d, i) => {
      const x = padL + i * (bw + gap);
      const v = vals[i];
      const h = Math.max(v ? 4 : 3, (H - padB - top) * (v / max));
      const over = goal && v > goal * 1.1;
      svg += '<rect class="fd-barr' + (v ? '' : ' none') + (over ? ' over' : '') + (dayKey(d) === S.day ? ' sel' : '') + '" x="' + x + '" y="' + (H - padB - h) + '" width="' + bw + '" height="' + h + '" rx="9"><title>' + d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'short' }) + ': ' + (v ? fmt(v) + ' kcal' : 'nada registrado') + '</title></rect>';
      svg += '<text class="fd-dow" x="' + (x + bw / 2) + '" y="' + (H - 7) + '" text-anchor="middle">' + d.toLocaleDateString('pt-BR', { weekday: 'narrow' }) + '</text>';
    });
    c.insertAdjacentHTML('beforeend', svg + '</svg>');
    return c;
  }

  // ---- last 30 days: one square each, filled when something was logged ----------------------------------------------------------------------
  function monthCard() {
    const c = figure('fd-month-card');
    const head = make('div', 'fd-head');
    head.appendChild(make('p', 'fd-k', 'Últimos 30 dias'));
    head.appendChild(make('span', 'fd-pillsm', S.data.logged_streak + (S.data.logged_streak === 1 ? ' dia' : ' dias') + ' seguidos'));
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
      sq.title = d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }) + (info ? ' · ' + fmt(info.calories) + ' kcal' : ' · nada registrado');
      sq.addEventListener('click', () => { S.day = key; load().catch((e) => toast(e.message)); });
      grid.appendChild(sq);
    }
    c.appendChild(grid);
    c.appendChild(make('p', 'fd-legend', goal ? 'Preto: dentro da sua meta de calorias. Laranja: registrado.' : 'Laranja: registrado. Defina uma meta de calorias para ver quais dias a atingiram.'));
    return c;
  }

  // ---- the weekly plan: a template of what to eat on each weekday, one cell per meal division ---------------------------------------------------
  function viewTabs() {
    const box = make('div', 'fd-views'); box.setAttribute('role', 'group'); box.setAttribute('aria-label', 'Visualização');
    [['day', 'Dia'], ['week', 'Plano semanal']].forEach(([k, label]) => {
      const b = make('button', '', label); b.type = 'button'; b.setAttribute('aria-pressed', String(S.mode === k));
      b.addEventListener('click', () => setMode(k));
      box.appendChild(b);
    });
    return box;
  }
  async function setMode(k) {
    if (S.mode === k) return;
    S.mode = k;
    if (k === 'week' && !S.plan) { try { S.plan = (await api('/v1/food/plan')).plan; } catch (e) { S.mode = 'day'; toast(e.message); return; } }
    // the old view fades and drops away, then the new one rises in (skipped for reduced motion)
    const cur = $('fdGrid').firstElementChild;
    if (cur && !matchMedia('(prefers-reduced-motion: reduce)').matches) { cur.classList.add('fd-leave'); await new Promise((r) => setTimeout(r, 170)); S.swap = true; }
    render();
  }
  const weekdayNames = () => Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString('pt-BR', { weekday: 'long' }).replace(/-feira$/i, ''));
  const planEntry = (wd, key) => (S.plan[wd] || {})[key] || null;
  // saves one cell (an empty text clears it); throws if the server refuses
  async function savePlan(wd, key, body) {
    const text = (body.text || '').replace(/\s+/g, ' ').trim();
    const sent = text ? { text, calories: body.calories || 0, protein_g: body.protein_g || 0, carbs_g: body.carbs_g || 0, fat_g: body.fat_g || 0, fiber_g: body.fiber_g || 0 } : { text: '' };
    await api('/v1/food/plan/' + wd + '/' + key, { method: 'PUT', body: sent });
    S.plan[wd] = S.plan[wd] || {};
    if (text) S.plan[wd][key] = { text, calories: sent.calories, protein_g: sent.protein_g, carbs_g: sent.carbs_g, fat_g: sent.fat_g, fiber_g: sent.fiber_g }; else delete S.plan[wd][key];
    render();
  }
  async function logPlanned(key, e) {
    try { await api('/v1/food/meals', { method: 'POST', body: { day: todayKey(), slot: key, name: e.text.slice(0, 120), calories: e.calories || 0, protein_g: e.protein_g || 0, carbs_g: e.carbs_g || 0, fat_g: e.fat_g || 0, fiber_g: e.fiber_g || 0 } }); toast('Added to today\u2019s log.'); load().catch(() => {}); }
    catch (err) { toast(err.message); }
  }
  // a plan cell opens the same Add meal dialog, set to the cell's weekday and meal division
  function openPlanCell(wd, key) {
    openMeal(null);
    const e = planEntry(wd, key) || {};
    planTarget = { wd, key };
    slot = key;
    $('fdSlots').value = key; $('fdSlots').disabled = true;
    $('fdMealTitle').textContent = 'Plano \u00b7 ' + weekdayNames()[wd];
    document.querySelector('label[for="fdName"]').textContent = 'O que você vai comer';
    $('fdName').value = e.text || '';
    $('fdCal').value = e.calories || '';
    $('fdP').value = e.protein_g ? Math.round(e.protein_g * 10) / 10 : '';
    $('fdC').value = e.carbs_g ? Math.round(e.carbs_g * 10) / 10 : '';
    $('fdF').value = e.fat_g ? Math.round(e.fat_g * 10) / 10 : '';
    $('fdFi').value = e.fiber_g ? Math.round(e.fiber_g * 10) / 10 : '';
    $('fdMealSave').firstElementChild.textContent = 'Salvar no plano';
    const del = $('fdMealDelete'); del.hidden = !e.text; del.textContent = 'Limpar esta célula';
    renderStaged();
    $('fdName').focus();
  }
  function planCard() {
    const card = make('section', 'fd-card fd-plancard');
    const scroll = make('div', 'fd-pscroll');
    const grid = make('div', 'fd-pgrid');
    const todayWd = (new Date().getDay() + 6) % 7;
    grid.appendChild(make('div', 'fd-pcorner'));
    weekdayNames().forEach((n, i) => grid.appendChild(make('div', 'fd-pday' + (i === todayWd ? ' now' : ''), n)));
    SLOTS.forEach(([key, label, time]) => {
      const head = make('div', 'fd-pslot'); head.appendChild(make('b', '', label)); if (time) head.appendChild(make('small', '', time));
      grid.appendChild(head);
      for (let wd = 0; wd < 7; wd++) {
        const e = planEntry(wd, key), text = e ? e.text : '';
        const cell = make('div', 'fd-pcellwrap' + (wd === todayWd ? ' now' : '')); cell.style.setProperty('--i', String(wd + SLOTS.findIndex((s) => s[0] === key)));
        const b = make('button', 'fd-pcell' + (text ? '' : ' empty')); b.type = 'button';
        if (text) { b.appendChild(make('span', 'fd-ptext', text)); if (e.calories) b.appendChild(make('small', 'fd-pkcal', fmt(e.calories) + ' kcal')); } else b.textContent = '+';
        b.setAttribute('aria-label', (text ? 'Editar ' : 'Planejar ') + label + ', ' + weekdayNames()[wd]);
        b.addEventListener('click', () => openPlanCell(wd, key));
        cell.appendChild(b);
        if (text && wd === todayWd) {
          const log = make('button', 'fd-plog', '+ Registrar'); log.type = 'button'; log.title = 'Adicionar ao registro de hoje';
          log.addEventListener('click', () => logPlanned(key, e));
          cell.appendChild(log);
        }
        grid.appendChild(cell);
      }
    });
    // a total per day, once any planned meal has calories
    const dayKcal = Array.from({ length: 7 }, (_, wd) => SLOTS.reduce((t, s) => t + ((planEntry(wd, s[0]) || {}).calories || 0), 0));
    if (dayKcal.some((k) => k > 0)) {
      grid.appendChild(make('div', 'fd-pslot fd-ptotal', 'Total'));
      dayKcal.forEach((k, wd) => grid.appendChild(make('div', 'fd-pdaysum' + (wd === todayWd ? ' now' : ''), k ? fmt(k) + ' kcal' : '')));
    }
    scroll.appendChild(grid); card.appendChild(scroll);
    return card;
  }
  function renderPlan() {
    const wrap = make('div', 'fd-wrap fd-planwrap');
    const head = make('header', 'fd-pagehead');
    const text = make('div'); text.appendChild(make('h1', '', 'Food'));
    text.appendChild(make('p', 'fd-pagesub', 'Plano semanal · repete toda semana'));
    head.appendChild(text);
    const nav = make('div', 'fd-pnav'); nav.appendChild(viewTabs()); head.appendChild(nav);
    wrap.append(head, planCard());
    if (S.swap) { wrap.classList.add('fd-swap'); S.swap = false; }
    $('fdGrid').replaceChildren(wrap);
  }

  function render() {
    if (S.mode === 'week' && S.plan) { renderPlan(); return; }
    const wrap = make('div', 'fd-wrap');
    const main = make('section', 'fd-main');
    const side = make('aside', 'fd-sidecol');
    main.append(pageHead(), logCard());
    side.append(addButton(), tiles(), weekCard(), monthCard());
    wrap.append(main, side);
    if (S.swap) { wrap.classList.add('fd-swap'); S.swap = false; }
    $('fdGrid').replaceChildren(wrap);
  }



  // ---- recipes: ingredients come from My foods or TACO; the totals follow the amounts; a recipe can be logged as a meal -----------------------------------
  const MACROS = ['calories', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g'];
  const gramsOfUnit = (ing, name) => (name === 'g' || ing.portion ? 1 : ((ing.units || []).find((u) => u.name === name) || { grams: 1 }).grams);
  const ingFactor = (ing) => ing.qty * gramsOfUnit(ing, ing.unit);
  const ingTotals = (ing) => { const k = ingFactor(ing); const o = {}; MACROS.forEach((m) => { o[m] = (ing.per[m] || 0) * k; }); return o; };
  const sumIngs = (list) => list.reduce((t, ing) => { const x = ingTotals(ing); MACROS.forEach((m) => { t[m] += x[m]; }); return t; }, { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 });
  const perServing = (r) => { const t = sumIngs(r.ingredients); const n = r.servings > 0 ? r.servings : 1; MACROS.forEach((m) => { t[m] /= n; }); return t; };
  const macroBits = (t) => [fmt(t.calories) + ' kcal', 'P ' + r1(t.protein_g), 'C ' + r1(t.carbs_g), 'G ' + r1(t.fat_g), 'Fi ' + r1(t.fiber_g)].join(' · ');
  const servLabel = (n) => fmt1(n) + (n === 1 ? ' porção' : ' porções');
  const fmt1 = (n) => (Math.round(n * 100) / 100).toLocaleString('pt-BR');

  // "Receitas": an icon in the page's toolbar opens a list like My foods, with Usar, Editar and Apagar
  async function loadRecipes() {
    try { S.recipes = (await api('/v1/food/recipes')).recipes; updateRecipesButton(); } catch (e) { /* the list stays as it was */ }
  }
  function updateRecipesButton() { const c = document.querySelector('#fdRecipesOpen .fd-count'); if (c) c.textContent = S.recipes ? String(S.recipes.length) : ''; }
  function renderRecipesList() {
    const ul = $('fdRecipesList');
    const q = $('fdRecipesSearch').value.trim().toLowerCase();
    const items = (S.recipes || []).filter((r) => !q || r.name.toLowerCase().includes(q));
    ul.replaceChildren();
    if (!items.length) { ul.appendChild(make('li', 'fd-libempty', q ? 'Nada encontrado.' : 'Nenhuma receita ainda. Toque em Nova receita e escolha ingredientes dos seus alimentos.')); return; }
    items.forEach((r) => {
      const ps = perServing(r);
      const li = make('li', 'fd-foodrow');
      const txt = make('div', 'fd-foodtxt');
      txt.append(make('b', '', r.name), make('small', '', fmt(ps.calories) + ' kcal · P ' + r1(ps.protein_g) + ' · C ' + r1(ps.carbs_g) + ' · G ' + r1(ps.fat_g) + ' · Fi ' + r1(ps.fiber_g) + ' · por porção'), make('small', '', r.ingredients.length + (r.ingredients.length === 1 ? ' ingrediente' : ' ingredientes') + ' · rende ' + servLabel(r.servings)));
      li.appendChild(txt);
      const acts = make('div', 'fd-foodacts');
      const use = make('button', 'fd-fa use', 'Usar'); use.type = 'button'; use.title = 'Adicionar como refeição'; use.disabled = !r.ingredients.length;
      use.addEventListener('click', () => { $('fdRecipesDialog').close(); openUse(r); });
      const edit = make('button', 'fd-fa', 'Editar'); edit.type = 'button';
      edit.addEventListener('click', () => openRecipe(r));
      const del = make('button', 'fd-fa del', 'Apagar'); del.type = 'button';
      del.addEventListener('click', async () => {
        if (!(await IgnisConfirm.ask({ title: 'Apagar receita', text: 'Apagar "' + r.name + '"? As refeições já registradas continuam no seu histórico.', ok: 'Apagar' }))) return;
        try { await api('/v1/food/recipes/' + r.id, { method: 'DELETE' }); S.recipes = S.recipes.filter((x) => x.id !== r.id); updateRecipesButton(); renderRecipesList(); toast('Receita apagada'); }
        catch (e) { toast(e.message); }
      });
      acts.append(use, edit, del); li.appendChild(acts); ul.appendChild(li);
    });
  }
  async function openRecipes() {
    $('fdRecipesSearch').value = '';
    renderRecipesList();
    $('fdRecipesDialog').showModal();
    await loadRecipes();
    renderRecipesList();
  }

  // the editor
  let recEditing = null, recIngs = [], recMode = 'mine';
  function recTotals() {
    const serv = num($('fdRecServ').value) || 1;
    const t = sumIngs(recIngs);
    const box = $('fdRecTotals'); box.replaceChildren();
    if (!recIngs.length) return;
    const a = make('div', 'fd-rt'); a.append(make('small', '', 'Receita toda'), make('b', '', macroBits(t)));
    const ps = {}; MACROS.forEach((m) => { ps[m] = t[m] / serv; });
    const b = make('div', 'fd-rt main'); b.append(make('small', '', 'Por porção (' + servLabel(serv) + ')'), make('b', '', macroBits(ps)));
    box.append(a, b);
  }
  function recRows() {
    const ul = $('fdRecIngs'); ul.replaceChildren();
    $('fdRecNone').hidden = recIngs.length > 0;
    recIngs.forEach((ing, i) => {
      const li = make('li', 'fd-ing');
      li.appendChild(make('span', 'fd-ingname', ing.name));
      const qty = make('input', 'fd-input fd-ingqty'); qty.type = 'number'; qty.inputMode = 'decimal'; qty.min = '0'; qty.step = 'any'; qty.value = ing.qty; qty.setAttribute('aria-label', 'Quantidade de ' + ing.name);
      const unit = make('select', 'fd-input fd-divsel fd-ingunit'); unit.setAttribute('aria-label', 'Unidade');
      const names = ing.portion ? ['porção'] : ['g', ...(ing.units || []).map((u) => u.name)];
      names.forEach((n) => { const o = make('option', '', n); o.value = n; unit.appendChild(o); });
      unit.value = ing.unit; unit.disabled = names.length < 2;
      const kc = make('span', 'fd-ingkcal', '');
      const paint = () => { kc.textContent = fmt(ingTotals(ing).calories) + ' kcal'; };
      qty.addEventListener('input', () => { ing.qty = num(qty.value); paint(); recTotals(); });
      unit.addEventListener('change', () => {   // keep the same weight when the unit changes
        const grams = ing.qty * gramsOfUnit(ing, ing.unit);
        ing.unit = unit.value; ing.qty = r2(grams / gramsOfUnit(ing, ing.unit)); qty.value = ing.qty; paint(); recTotals();
      });
      const rm = make('button', 'fd-strm'); rm.type = 'button'; rm.setAttribute('aria-label', 'Tirar ' + ing.name);
      rm.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
      rm.addEventListener('click', () => { recIngs.splice(i, 1); recRows(); recTotals(); });
      paint();
      li.append(qty, unit, kc, rm); ul.appendChild(li);
    });
  }
  function addIngredient(f) {
    const per = {}; const base = f.base_g > 0 ? f.base_g : 0;
    MACROS.forEach((m) => { per[m] = (f[m] || 0) / (base || 1); });
    const ing = { name: f.name, qty: base || 1, unit: base ? 'g' : 'porção', per, portion: !base, units: (f.units || []).map((u) => ({ name: u.name, grams: u.grams })) };
    const di = ing.units.find((u) => u.name === f.default_unit);
    if (base && di) { ing.unit = di.name; ing.qty = r2(base / di.grams); }
    recIngs.push(ing); recRows(); recTotals();
    const last = $('fdRecIngs').lastElementChild; if (last) { last.scrollIntoView({ block: 'nearest' }); last.querySelector('input').focus(); }
  }
  function recSuggest() {
    const ul = $('fdRecSuggest'); ul.replaceChildren();
    const words = ($('fdRecSearch').value || '').toLowerCase().split(/\s+/).filter(Boolean);
    let items;
    if (recMode === 'taco') {
      if (TACO === null) { $('fdRecCount').textContent = ''; ul.appendChild(make('li', 'fd-sgempty', 'Carregando…')); return; }
      items = TACO.filter((f) => words.every((w) => f.name.toLowerCase().includes(w) || f.category.toLowerCase().includes(w)));
    } else items = LIB.saved.filter((f) => words.every((w) => f.name.toLowerCase().includes(w)));
    $('fdRecCount').textContent = items.length ? String(items.length) : '';
    if (!items.length) { ul.appendChild(make('li', 'fd-sgempty', recMode === 'taco' ? 'Nenhum alimento encontrado.' : words.length ? 'Nenhum alimento encontrado.' : 'Você ainda não tem alimentos salvos. Use a aba Tabela TACO ou crie alimentos em Meus alimentos.')); return; }
    items.slice(0, 60).forEach((f) => {
      const li = make('li'); const b = make('button', 'fd-sg'); b.type = 'button';
      b.append(make('span', 'fd-sgn', f.name), make('small', '', macroLine(f) || 'Sem números'));
      b.addEventListener('click', () => addIngredient(f));
      li.appendChild(b); ul.appendChild(li);
    });
  }
  function setRecMode(mode) {
    recMode = mode;
    $('fdRecTabMine').setAttribute('aria-selected', String(mode === 'mine'));
    $('fdRecTabTaco').setAttribute('aria-selected', String(mode === 'taco'));
    if (mode === 'taco') loadTaco().then(recSuggest);
    recSuggest();
  }
  function openRecipe(r) {
    recEditing = r || null;
    recIngs = r ? r.ingredients.map((i) => JSON.parse(JSON.stringify(i))) : [];
    $('fdRecTitle').textContent = r ? 'Editar receita' : 'Nova receita';
    $('fdRecName').value = r ? r.name : '';
    $('fdRecServ').value = r ? r.servings : 1;
    $('fdRecNotes').value = r && r.notes ? r.notes : '';
    $('fdRecSearch').value = '';
    $('fdRecErr').hidden = true; $('fdRecSave').disabled = false;
    $('fdRecDelete').hidden = !r;
    recRows(); recTotals(); setRecMode('mine');
    loadLib().then(recSuggest);
    $('fdRecDialog').showModal();
    $('fdRecName').focus();
  }
  async function saveRecipe(event) {
    event.preventDefault();
    const err = $('fdRecErr'); err.hidden = true;
    const name = $('fdRecName').value.trim();
    if (!name) { err.textContent = 'Dê um nome à receita.'; err.hidden = false; return; }
    if (!recIngs.length) { err.textContent = 'Adicione pelo menos um ingrediente.'; err.hidden = false; return; }
    if (recIngs.some((i) => !(i.qty > 0))) { err.textContent = 'Todos os ingredientes precisam de uma quantidade.'; err.hidden = false; return; }
    const body = { name, servings: num($('fdRecServ').value) || 1, notes: $('fdRecNotes').value.trim() || null, ingredients: recIngs };
    $('fdRecSave').disabled = true;
    try {
      const saved = await api('/v1/food/recipes' + (recEditing ? '/' + recEditing.id : ''), { method: recEditing ? 'PUT' : 'POST', body });
      S.recipes = S.recipes.filter((x) => x.id !== saved.id).concat(saved).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
      $('fdRecDialog').close(); toast('Receita salva'); updateRecipesButton(); renderRecipesList(); renderSuggest();
    } catch (e) { err.textContent = e.message; err.hidden = false; $('fdRecSave').disabled = false; }
  }
  async function removeRecipe() {
    if (!recEditing) return;
    if (!(await IgnisConfirm.ask({ title: 'Apagar receita', text: 'Apagar "' + recEditing.name + '"? As refeições já registradas continuam no seu histórico.', ok: 'Apagar' }))) return;
    try { await api('/v1/food/recipes/' + recEditing.id, { method: 'DELETE' }); S.recipes = S.recipes.filter((x) => x.id !== recEditing.id); $('fdRecDialog').close(); toast('Receita apagada'); updateRecipesButton(); renderRecipesList(); }
    catch (e) { toast(e.message); }
  }

  // logging a recipe as a meal: how many servings, and in which meal division
  let useRecipe = null;
  function useSum() {
    const q = num($('fdUseQty').value);
    const ps = perServing(useRecipe);
    const t = {}; MACROS.forEach((m) => { t[m] = ps[m] * q; });
    $('fdUseSum').textContent = q ? macroBits(t) : 'Informe quantas porções você comeu.';
    return t;
  }
  function openUse(r) {
    useRecipe = r;
    $('fdUseName').textContent = r.name;
    $('fdUseQty').value = 1;
    $('fdUseSlot').replaceChildren(...SLOTS.map(([key, label]) => { const o = make('option', '', label); o.value = key; return o; }));
    $('fdUseSlot').value = defaultSlot();
    $('fdUseErr').hidden = true; $('fdUseSave').disabled = false;
    useSum();
    $('fdUseDialog').showModal();
  }
  async function saveUse(event) {
    event.preventDefault();
    const err = $('fdUseErr'); err.hidden = true;
    const q = num($('fdUseQty').value);
    if (!q) { err.textContent = 'Informe quantas porções você comeu.'; err.hidden = false; return; }
    const t = useSum();
    const name = (q === 1 ? useRecipe.name : useRecipe.name + ' (' + servLabel(q) + ')').slice(0, 120);
    $('fdUseSave').disabled = true;
    try {
      await api('/v1/food/meals', { method: 'POST', body: { day: S.day, slot: $('fdUseSlot').value, name, calories: Math.round(t.calories), protein_g: r1(t.protein_g), carbs_g: r1(t.carbs_g), fat_g: r1(t.fat_g), fiber_g: r1(t.fiber_g) } });
      $('fdUseDialog').close();
      toast('Adicionada em ' + parseDay(S.day).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' }));
      await load();
    } catch (e) { err.textContent = e.message; err.hidden = false; $('fdUseSave').disabled = false; }
  }

  // ---- meal dialog ----------------------------------------------------------------------------------------------------------------------------
  let editing = null;
  let planTarget = null;   // set while the meal dialog is editing a weekly-plan cell instead of the log
  let slot = 'breakfast';
  let armed = 0;
  const pressed = (box, value) => box.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === value)));
  function defaultSlot() {
    const timed = SLOTS.filter((s) => s[2]);
    if (timed.length) {
      const now = new Date(); const mins = now.getHours() * 60 + now.getMinutes();
      const at = (s) => { const [h, m] = s[2].split(':').map(Number); return h * 60 + m; };
      const started = timed.filter((s) => at(s) <= mins).sort((a, b) => at(b) - at(a));
      return (started[0] || timed.sort((a, b) => at(a) - at(b))[0])[0];
    }
    const h = new Date().getHours();
    const key = h < 10 ? 'breakfast' : h < 12 ? 'am_snack' : h < 15 ? 'lunch' : h < 18 ? 'pm_snack' : h < 21 ? 'dinner' : 'supper';
    return SLOTS.some((s) => s[0] === key) ? key : SLOTS[0][0];
  }
  // the division chips in the meal and food dialogs follow the live list
  function fillSlotChips(box, selected) {
    box.replaceChildren(...SLOTS.map(([key, label]) => { const b = make('button', '', label); b.type = 'button'; b.dataset.v = key; b.setAttribute('aria-pressed', String(key === selected)); return b; }));
  }

  // ---- saved foods: quick suggestions in the meal dialog, and the My foods manager ---------------------------------------------------------------
  const LIB = { saved: [], recent: [] };
  let keep = false;
  let savedCount = null;
  async function loadLib() {
    try {
      const data = await api('/v1/food/library');
      LIB.saved = data.saved;
      LIB.recent = data.recent;
      savedCount = LIB.saved.length;
      updateFoodsButton();
      renderSuggest();
    } catch (e) { /* the lists just stay as they were */ }
  }
  function updateFoodsButton() { const c = document.querySelector('#fdFoodsOpen .fd-count'); if (c) c.textContent = savedCount == null ? '' : String(savedCount); }
  const macroLine = (f) => [f.base_g ? 'por ' + fmt(f.base_g) + ' g' : '', f.calories ? fmt(f.calories) + ' kcal' : '', f.protein_g ? 'P ' + Math.round(f.protein_g) : '', f.carbs_g ? 'C ' + Math.round(f.carbs_g) : '', f.fat_g ? 'G ' + Math.round(f.fat_g) : '', f.fiber_g ? 'Fi ' + Math.round(f.fiber_g) : ''].filter(Boolean).join(' · ');
  const slotLabel = (s) => (SLOTS.find((x) => x[0] === s) || [])[1] || '';

  // "My foods": a searchable list in the right column of the dialog; clicking one fills the form
  let pickMode = 'mine';   // 'mine' or 'taco'
  const TACO_PAGE = 30;
  let tacoPage = 0;
  let TACO = null;         // the TACO reference foods, loaded the first time the tab opens
  async function loadTaco() {
    if (TACO) return;
    try { TACO = (await api('/v1/food/taco')).foods; } catch (e) { TACO = []; }
    renderSuggest();
  }
  function setPickMode(mode) {
    pickMode = mode; tacoPage = 0;
    $('fdTabMine').setAttribute('aria-selected', String(mode === 'mine'));
    $('fdTabTaco').setAttribute('aria-selected', String(mode === 'taco'));
    $('fdTabRec').setAttribute('aria-selected', String(mode === 'recipes'));
    $('fdPickSearch').placeholder = mode === 'taco' ? 'Buscar na TACO (ex.: arroz cozido)…' : mode === 'recipes' ? 'Buscar receitas…' : 'Buscar alimentos…';
    if (mode === 'taco') loadTaco();
    if (mode === 'recipes' && !S.recipes) loadRecipes().then(renderSuggest);
    renderSuggest();
  }
  function renderTaco() {
    const ul = $('fdSuggest');
    const words = ($('fdPickSearch').value || '').toLowerCase().split(/\s+/).filter(Boolean);
    ul.replaceChildren();
    if (TACO === null) { $('fdPickCount').textContent = ''; ul.appendChild(make('li', 'fd-sgempty', 'Carregando…')); return; }
    const all = TACO.filter((f) => words.every((w) => f.name.toLowerCase().includes(w) || f.category.toLowerCase().includes(w)));
    $('fdPickCount').textContent = String(all.length);
    if (!all.length) { ul.appendChild(make('li', 'fd-sgempty', 'Nenhum alimento encontrado.')); return; }
    const pages = Math.max(1, Math.ceil(all.length / TACO_PAGE));
    tacoPage = Math.min(Math.max(tacoPage, 0), pages - 1);
    all.slice(tacoPage * TACO_PAGE, (tacoPage + 1) * TACO_PAGE).forEach((f) => {
      const li = make('li');
      const b = make('button', 'fd-sg'); b.type = 'button';
      b.append(make('span', 'fd-sgn', f.name), make('small', '', macroLine(f) + ' · ' + f.category));
      b.addEventListener('click', () => fillFrom(f));
      li.appendChild(b); ul.appendChild(li);
    });
    ul.scrollTop = 0;
    $('fdPager').hidden = pages < 2;
    $('fdPgInfo').textContent = (tacoPage + 1) + ' / ' + pages;
    $('fdPgPrev').disabled = tacoPage === 0;
    $('fdPgNext').disabled = tacoPage >= pages - 1;
  }
  // recipes in the meal dialog: one tap fills the name and the numbers of one serving
  function renderRecipePick() {
    const ul = $('fdSuggest');
    const words = ($('fdPickSearch').value || '').toLowerCase().split(/\s+/).filter(Boolean);
    ul.replaceChildren();
    if (!S.recipes) { $('fdPickCount').textContent = ''; ul.appendChild(make('li', 'fd-sgempty', 'Carregando…')); return; }
    const items = S.recipes.filter((r) => words.every((w) => r.name.toLowerCase().includes(w)));
    $('fdPickCount').textContent = items.length ? String(items.length) : '';
    if (!items.length) { ul.appendChild(make('li', 'fd-sgempty', words.length ? 'Nenhuma receita encontrada.' : 'Você ainda não tem receitas. Crie uma no ícone de receitas da página.')); }
    items.forEach((r) => {
      const ps = perServing(r);
      const li = make('li'); const b = make('button', 'fd-sg'); b.type = 'button';
      b.append(make('span', 'fd-sgn', r.name), make('small', '', macroBits(ps) + ' · por porção'));
      b.addEventListener('click', () => { fillFrom({ name: r.name, calories: Math.round(ps.calories), protein_g: ps.protein_g, carbs_g: ps.carbs_g, fat_g: ps.fat_g, fiber_g: ps.fiber_g }); toast('Números de 1 porção'); });
      li.appendChild(b); ul.appendChild(li);
    });
    const nb = make('li'); const add = make('button', 'fd-sg'); add.type = 'button';
    add.append(make('span', 'fd-sgn', '+ Nova receita'), make('small', '', 'Montar uma receita com seus alimentos'));
    add.addEventListener('click', () => openRecipe(null));
    nb.appendChild(add); ul.appendChild(nb);
  }
  function renderSuggest() {
    const ul = $('fdSuggest');
    $('fdPick').hidden = !!editing;
    $('fdMealDialog').classList.toggle('has-pick', !editing);
    $('fdPager').hidden = true;
    if (pickMode === 'taco') { renderTaco(); return; }
    if (pickMode === 'recipes') { renderRecipePick(); return; }
    const q = ($('fdPickSearch').value || '').trim().toLowerCase();
    const seen = new Set();
    const items = [];
    [...LIB.saved, ...LIB.recent].forEach((f) => { const key = f.name.toLowerCase(); if (seen.has(key) || (q && !key.includes(q))) return; seen.add(key); items.push(f); });
    ul.replaceChildren();
    const savedNames = new Set(LIB.saved.map((f) => f.name.toLowerCase()));
    $('fdPickCount').textContent = items.length ? String(items.length) : '';
    if (!items.length) { ul.appendChild(make('li', 'fd-sgempty', q ? 'Nenhum alimento encontrado.' : 'Você ainda não tem alimentos salvos. Salve um com a estrela ao registrar uma refeição.')); return; }
    items.forEach((f) => {
      const li = make('li');
      const b = make('button', 'fd-sg');
      b.type = 'button';
      const top = make('span', 'fd-sgn', f.name);
      if (savedNames.has(f.name.toLowerCase())) top.appendChild(make('i', 'fd-sgtag', 'salvo'));
      b.append(top, make('small', '', macroLine(f) || 'Sem números'));
      b.addEventListener('click', () => fillFrom(f));
      li.appendChild(b);
      ul.appendChild(li);
    });
  }
  // grams: a saved food that knows how many grams its numbers are for scales them when you change the quantity
  let scale = null;   // { g, calories, protein_g, carbs_g, fat_g, fiber_g }: the numbers for g grams
  let units = [];     // household measures of the food being logged: [{ name: 'fatia', grams: 25 }]
  let defaultUnit = '';  // name of the unit this food opens with
  let unitNow = 'g';  // the unit the quantity field is showing: 'g' or an index into units
  const unitGrams = (u) => (u === 'g' ? 1 : (units[Number(u)] || { grams: 1 }).grams);
  const gramsNow = () => num($('fdGrams').value) * unitGrams($('fdUnit').value);
  const r2 = (n) => Math.round(n * 100) / 100;
  function setUnits(list) {
    units = (list || []).filter((u) => u && u.name && u.grams > 0);
    const sel = $('fdUnit');
    sel.replaceChildren(make('option', '', 'g'), ...units.map((u, i) => { const o = make('option', '', u.name); o.value = String(i); return o; }));
    sel.options[0].value = 'g';
    sel.value = 'g'; unitNow = 'g';
    sel.hidden = !units.length;
    sel.parentElement.classList.toggle('has-unit', units.length > 0);
  }
  const r1 = (n) => Math.round(n * 10) / 10;
  function setScale(src, grams, hint) {
    scale = src && grams > 0 ? { g: grams, calories: src.calories || 0, protein_g: src.protein_g || 0, carbs_g: src.carbs_g || 0, fat_g: src.fat_g || 0, fiber_g: src.fiber_g || 0 } : null;
    const el = $('fdGramsHint');
    el.hidden = !scale;
    el.textContent = scale ? hint || ('Os números estão calculados para ' + fmt(scale.g) + ' g. Mude a quantidade e eles se ajustam.') : '';
  }
  function applyGrams() {
    const g = gramsNow();
    if (!scale || !g) return;
    const k = g / scale.g;
    $('fdCal').value = scale.calories ? Math.round(scale.calories * k) : '';
    [['fdP', 'protein_g'], ['fdC', 'carbs_g'], ['fdF', 'fat_g'], ['fdFi', 'fiber_g']].forEach(([id, key]) => { $(id).value = scale[key] ? r1(scale[key] * k) : ''; });
    ['fdCal', 'fdP', 'fdC', 'fdF', 'fdFi'].forEach((id) => { const el = $(id); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); });
  }
  function fillFrom(f) {
    $('fdName').value = f.name;
    $('fdCal').value = f.calories || '';
    $('fdP').value = f.protein_g ? Math.round(f.protein_g * 10) / 10 : '';
    $('fdC').value = f.carbs_g ? Math.round(f.carbs_g * 10) / 10 : '';
    $('fdF').value = f.fat_g ? Math.round(f.fat_g * 10) / 10 : '';
    $('fdFi').value = f.fiber_g ? Math.round(f.fiber_g * 10) / 10 : '';
    if (f.slot) { slot = f.slot; $('fdSlots').value = slot; }
    setUnits(f.units);
    defaultUnit = f.default_unit || '';
    if (f.base_g > 0) {
      const di = units.findIndex((u) => u.name === f.default_unit);
      if (di >= 0) { $('fdUnit').value = String(di); unitNow = String(di); $('fdGrams').value = Math.round((f.base_g / units[di].grams) * 100) / 100; }
      else $('fdGrams').value = f.base_g;
      setScale(f, f.base_g);
    } else { $('fdGrams').value = ''; setScale(null); }
    ['fdName', 'fdCal', 'fdP', 'fdC', 'fdF', 'fdFi'].forEach((id) => { const el = $(id); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); });
  }
  function setKeep(on) { keep = on; $('fdKeep').setAttribute('aria-pressed', String(on)); }

  // ---- the My foods manager: every saved food, with Use, Edit and Delete ----------------------------------------------------------------------
  function renderFoods() {
    const ul = $('fdFoodsList');
    const q = $('fdFoodsSearch').value.trim().toLowerCase();
    const items = LIB.saved.filter((f) => !q || f.name.toLowerCase().includes(q));
    ul.replaceChildren();
    if (!items.length) { ul.appendChild(make('li', 'fd-libempty', q ? 'Nada encontrado.' : 'Nenhum alimento salvo ainda. Toque em Novo alimento para criar os que você come sempre.')); return; }
    items.forEach((f) => {
      const li = make('li', 'fd-foodrow');
      const txt = make('div', 'fd-foodtxt');
      txt.append(make('b', '', f.name), make('small', '', macroLine(f) || 'Sem números'));
      li.appendChild(txt);
      if (f.slot) li.appendChild(make('span', 'fd-foodslot', slotLabel(f.slot)));
      const acts = make('div', 'fd-foodacts');
      const use = make('button', 'fd-fa use', 'Usar'); use.type = 'button'; use.title = 'Adicionar como refeição';
      use.addEventListener('click', () => { $('fdFoodsDialog').close(); openMeal(null); fillFrom(f); });
      const edit = make('button', 'fd-fa', 'Editar'); edit.type = 'button';
      edit.addEventListener('click', () => openFood(f));
      const del = make('button', 'fd-fa del', 'Apagar'); del.type = 'button';
      del.addEventListener('click', async () => {
        if (!(await IgnisConfirm.ask({ title: 'Remover alimento', text: 'Remover "' + f.name + '" dos meus alimentos?', ok: 'Remover' }))) return;
        try {
          await api('/v1/food/presets/' + f.id, { method: 'DELETE' });
          LIB.saved = LIB.saved.filter((x) => x.id !== f.id);
          savedCount = LIB.saved.length; updateFoodsButton(); renderFoods();
          toast('Removido dos meus alimentos');
        } catch (e) { toast(e.message); }
      });
      acts.append(use, edit, del);
      li.appendChild(acts);
      ul.appendChild(li);
    });
  }
  async function openFoods() {
    $('fdFoodsSearch').value = '';
    renderFoods();
    $('fdFoodsDialog').showModal();
    await loadLib();
    renderFoods();
  }

  // a meal can hold several foods: the ones already put together wait here until the meal is saved
  let staged = [];
  function readItem() {
    const name = $('fdName').value.trim();
    if (!name) return null;
    return { name, calories: Math.round(num($('fdCal').value)), protein_g: num($('fdP').value), carbs_g: num($('fdC').value), fat_g: num($('fdF').value), fiber_g: num($('fdFi').value), grams: r2(gramsNow()) || 0,
      keep, units: units.map((u) => ({ name: u.name, grams: u.grams })), default_unit: defaultUnit || '' };
  }
  function renderStaged() {
    const can = !editing && !planTarget;
    $('fdAddMore').hidden = !can;
    $('fdStaged').hidden = !can || !staged.length;
    const ul = $('fdStList'); ul.replaceChildren();
    staged.forEach((it, i) => {
      const li = make('li', 'fd-stitem');
      const txt = make('span', 'fd-sttxt', it.name + (it.grams ? ' \u00b7 ' + fmt(it.grams) + ' g' : ''));
      const kc = make('span', 'fd-stkcal', fmt(it.calories) + ' kcal');
      const rm = make('button', 'fd-strm'); rm.type = 'button'; rm.setAttribute('aria-label', 'Tirar ' + it.name);
      rm.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
      rm.addEventListener('click', () => { staged.splice(i, 1); renderStaged(); });
      li.append(txt, kc, rm); ul.appendChild(li);
    });
    const sum = (k) => staged.reduce((a, it) => a + (it[k] || 0), 0);
    $('fdStTotal').textContent = staged.length > 1 ? 'Total · ' + fmt(sum('calories')) + ' kcal · P ' + r1(sum('protein_g')) + ' · C ' + r1(sum('carbs_g')) + ' · G ' + r1(sum('fat_g')) : '';
  }
  function addAnother() {
    const err = $('fdMealErr'); err.hidden = true;
    const it = readItem();
    if (!it) { err.textContent = 'Diga o que você comeu antes de adicionar outro alimento.'; err.hidden = false; return; }
    staged.push(it);
    ['fdName', 'fdCal', 'fdP', 'fdC', 'fdF', 'fdFi', 'fdGrams'].forEach((id) => { $(id).value = ''; });
    setUnits([]); defaultUnit = ''; setScale(null); setKeep(false);
    renderStaged();
    $('fdName').focus();
  }

  function openMeal(m) {
    editing = m;
    staged = [];
    planTarget = null;
    $('fdSlots').disabled = false;
    $('fdMealSave').firstElementChild.textContent = 'Salvar refeição';
    document.querySelector('label[for="fdName"]').textContent = 'O que você comeu';
    slot = m ? m.slot : defaultSlot();
    $('fdMealTitle').textContent = m ? 'Editar refeição' : 'Adicionar refeição';
    $('fdName').value = m ? m.name : '';
    $('fdCal').value = m && m.calories ? m.calories : '';
    $('fdP').value = m && m.protein_g ? Math.round(m.protein_g * 10) / 10 : '';
    $('fdC').value = m && m.carbs_g ? Math.round(m.carbs_g * 10) / 10 : '';
    $('fdF').value = m && m.fat_g ? Math.round(m.fat_g * 10) / 10 : '';
    $('fdFi').value = m && m.fiber_g ? Math.round(m.fiber_g * 10) / 10 : '';
    const pre = (m && LIB.saved.find((x) => x.name.toLowerCase() === m.name.toLowerCase())) || {};
    setUnits(pre.units);
    defaultUnit = pre.default_unit || '';
    $('fdGrams').value = m && m.grams ? m.grams : '';
    setScale(m && m.grams ? m : null, m && m.grams, 'Os números são para ' + (m && m.grams ? fmt(m.grams) : '') + ' g. Mude a quantidade e eles se ajustam.');
    $('fdSlots').replaceChildren(...SLOTS.map(([key, label]) => { const o = make('option', '', label); o.value = key; return o; }));
    $('fdSlots').value = slot;
    setKeep(false);
    $('fdPickSearch').value = '';
    renderSuggest();
    loadLib();
    $('fdMealErr').hidden = true;
    $('fdMealSave').disabled = false;
    const del = $('fdMealDelete');
    del.hidden = !m;
    del.classList.remove('sure');
    del.textContent = 'Apagar esta refeição';
    renderStaged();
    $('fdMealDialog').showModal();
    $('fdName').focus();
  }

  async function saveMeal(event) {
    event.preventDefault();
    const name = $('fdName').value.trim();
    const err = $('fdMealErr');
    err.hidden = true;
    if (!name && !(staged.length && !editing && !planTarget)) { err.textContent = 'Diga o que você comeu.'; err.hidden = false; return; }
    if (planTarget) {
      $('fdMealSave').disabled = true;
      const t = planTarget;
      try {
        await savePlan(t.wd, t.key, { text: name, calories: Math.round(num($('fdCal').value)), protein_g: num($('fdP').value), carbs_g: num($('fdC').value), fat_g: num($('fdF').value), fiber_g: num($('fdFi').value) });
        if (keep) { try { await api('/v1/food/presets', { method: 'POST', body: { name, slot: t.key, calories: Math.round(num($('fdCal').value)), protein_g: num($('fdP').value), carbs_g: num($('fdC').value), fat_g: num($('fdF').value), fiber_g: num($('fdFi').value) } }); loadLib(); } catch (e) { /* the plan itself is saved */ } }
        $('fdMealDialog').close();
        toast('Salvo no plano');
      } catch (e) { err.textContent = e.message; err.hidden = false; $('fdMealSave').disabled = false; }
      return;
    }
    $('fdMealSave').disabled = true;
    if (!editing) {
      const items = [...staged]; const last = readItem(); if (last) items.push(last);
      let done = 0, kept = 0;
      try {
        for (const it of items) {
          await api('/v1/food/meals', { method: 'POST', body: { slot, name: it.name, calories: it.calories, protein_g: it.protein_g, carbs_g: it.carbs_g, fat_g: it.fat_g, fiber_g: it.fiber_g, grams: it.grams, day: S.day } });
          done++; staged.shift();
          if (it.keep) { try { await api('/v1/food/presets', { method: 'POST', body: { name: it.name, slot, calories: it.calories, protein_g: it.protein_g, carbs_g: it.carbs_g, fat_g: it.fat_g, fiber_g: it.fiber_g, base_g: it.grams || null, units: it.units, default_unit: it.default_unit } }); kept++; } catch (e) { /* the meal itself is saved */ } }
        }
        $('fdMealDialog').close();
        toast(items.length > 1 ? items.length + ' alimentos adicionados' : kept ? 'Refeição adicionada e salva nos meus alimentos' : 'Refeição adicionada');
        if (kept) loadLib();
        await load();
      } catch (e) {
        err.textContent = (done ? done + ' de ' + items.length + ' foram salvos. ' : '') + e.message;
        err.hidden = false;
        $('fdMealSave').disabled = false;
        if (done) { renderStaged(); await load(); }
      }
      return;
    }
    const body = { slot, name, calories: Math.round(num($('fdCal').value)), protein_g: num($('fdP').value), carbs_g: num($('fdC').value), fat_g: num($('fdF').value), fiber_g: num($('fdFi').value), grams: r2(gramsNow()) || 0 };
    try {
      await api('/v1/food/meals/' + editing.id, { method: 'PATCH', body });
      $('fdMealDialog').close();
      toast('Salvo');
      await load();
    } catch (e) {
      err.textContent = e.message;
      err.hidden = false;
      $('fdMealSave').disabled = false;
    }
  }

  async function removeMeal() {
    const what = planTarget ? 'Limpar esta célula do plano?' : 'Apagar esta refeição? Isso não pode ser desfeito.';
    if (!(await IgnisConfirm.ask({ title: planTarget ? 'Limpar célula' : 'Apagar refeição', text: what, ok: planTarget ? 'Limpar' : 'Apagar' }))) return;
    if (planTarget) {
      try { await savePlan(planTarget.wd, planTarget.key, { text: '' }); $('fdMealDialog').close(); toast('Célula limpa'); } catch (e) { toast(e.message); }
      return;
    }
    try {
      await api('/v1/food/meals/' + editing.id, { method: 'DELETE' });
      $('fdMealDialog').close();
      toast('Refeição apagada');
      await load();
    } catch (e) { toast(e.message); }
  }

  // ---- create or edit a saved food (opened from My foods) -------------------------------------------------------------------------------------
  let foodSlot = '';
  let editingFood = null;
  function openFood(f) {
    editingFood = f || null;
    foodSlot = f && f.slot ? f.slot : '';
    $('fdFoodTitle').textContent = f ? 'Editar alimento' : 'Criar alimento';
    $('fdFoodSave').firstElementChild.textContent = f ? 'Salvar alterações' : 'Salvar nos meus alimentos';
    const v = (n) => (n ? Math.round(n * 10) / 10 : '');
    $('fdFoodName').value = f ? f.name : '';
    $('fdFoodCal').value = f && f.calories ? f.calories : '';
    $('fdFoodP').value = f ? v(f.protein_g) : '';
    $('fdFoodC').value = f ? v(f.carbs_g) : '';
    $('fdFoodF').value = f ? v(f.fat_g) : '';
    $('fdFoodFi').value = f ? v(f.fiber_g) : '';
    $('fdFoodBase').value = f && f.base_g ? f.base_g : '';
    $('fdFoodUnits').replaceChildren();
    document.querySelector('.fd-srv0 input[type=radio]').checked = true;
    ((f && f.units) || []).forEach((u) => addUnitRow(u.name, f.base_g > 0 ? Math.round((f.base_g / u.grams) * 1000) / 1000 : '', f.default_unit && f.default_unit === u.name));
    $('fdFoodErr').hidden = true;
    $('fdFoodSave').disabled = false;
    $('fdFoodDialog').showModal();
    $('fdFoodName').focus();
  }
  // serving sizes: the first row is always grams; each extra row says how many of some measure equal that amount (100 g = 4 fatias)
  function addUnitRow(name, amount, isDefault) {
    const row = make('label', 'fd-srv');
    const radio = make('input'); radio.type = 'radio'; radio.name = 'fdFoodDef'; radio.setAttribute('aria-label', 'Usar como padrão'); radio.checked = !!isDefault;
    const a = make('input', 'fd-input fd-srv-amt'); a.type = 'number'; a.inputMode = 'decimal'; a.min = '0'; a.step = 'any'; a.placeholder = '1'; a.value = amount || ''; a.setAttribute('aria-label', 'Quantidade dessa medida');
    const n = make('input', 'fd-input fd-srv-nm'); n.maxLength = 30; n.placeholder = 'Nome (fatia, colher, pote…)'; n.value = name || ''; n.setAttribute('aria-label', 'Nome da medida');
    const rm = make('button', 'fd-unit-rm'); rm.type = 'button'; rm.setAttribute('aria-label', 'Remover tamanho de porção'); rm.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/></svg>';
    rm.onclick = (e) => { e.preventDefault(); const was = radio.checked; row.remove(); if (was) document.querySelector('.fd-srv0 input[type=radio]').checked = true; };
    row.append(radio, a, n, rm);
    $('fdFoodUnits').appendChild(row);
    return n;
  }
  // returns { units: [{ name, grams }], default_unit } from the rows; grams of one measure = base grams / amount
  function readUnits() {
    const base = num($('fdFoodBase').value);
    const rows = [...$('fdFoodUnits').children];
    const out = []; let def = '';
    rows.forEach((r) => {
      const name = r.querySelector('.fd-srv-nm').value.trim(), amount = num(r.querySelector('.fd-srv-amt').value);
      if (!name || !(amount > 0) || !(base > 0)) return;
      out.push({ name, grams: Math.round((base / amount) * 1e6) / 1e6 });
      if (r.querySelector('input[type=radio]').checked) def = name;
    });
    return { units: out, default_unit: def };
  }
  async function saveFood(event) {
    event.preventDefault();
    const name = $('fdFoodName').value.trim();
    const err = $('fdFoodErr');
    err.hidden = true;
    if (!name) { err.textContent = 'Dê um nome ao alimento.'; err.hidden = false; return; }
    const sv = readUnits();
    const hasExtra = [...$('fdFoodUnits').children].some((r) => r.querySelector('.fd-srv-nm').value.trim());
    if (hasExtra && !(num($('fdFoodBase').value) > 0)) { err.textContent = 'Informe quantos gramas tem a primeira linha para as conversões funcionarem.'; err.hidden = false; return; }
    $('fdFoodSave').disabled = true;
    const body = { name, slot: foodSlot || null, calories: Math.round(num($('fdFoodCal').value)), protein_g: num($('fdFoodP').value), carbs_g: num($('fdFoodC').value), fat_g: num($('fdFoodF').value), fiber_g: num($('fdFoodFi').value) , base_g: num($('fdFoodBase').value) || null , units: sv.units, default_unit: sv.default_unit };
    try {
      await api('/v1/food/presets', { method: 'POST', body });   // the server updates a food that already has this name
      // renamed: the new name was just created, so remove the old one
      if (editingFood && editingFood.name.toLowerCase() !== name.toLowerCase()) await api('/v1/food/presets/' + editingFood.id, { method: 'DELETE' });
      $('fdFoodDialog').close();
      toast(editingFood ? 'Alimento atualizado' : 'Salvo nos meus alimentos');
      await loadLib();
      renderFoods();
    } catch (e) {
      err.textContent = e.message;
      err.hidden = false;
      $('fdFoodSave').disabled = false;
    }
  }

  // ---- a time picker in the page's own style: an hour grid and a minutes grid in a small panel (replaces the browser's time field) -----------------
  const TP = { el: null, trigger: null, start: '', h: null, m: null, commit: null };
  const CLOCK = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>';
  const two = (n) => String(n).padStart(2, '0');
  function tpBuild() {
    const el = make('div', 'fd-tp');
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Escolher horário'); el.hidden = true;
    el.appendChild(make('p', 'fd-tp-time', '--:--'));
    el.appendChild(make('span', 'fd-tp-k', 'Hora'));
    const hours = make('div', 'fd-tp-grid h');
    for (let h = 0; h < 24; h++) { const b = make('button', 'fd-tp-b', two(h)); b.type = 'button'; b.dataset.h = h; hours.appendChild(b); }
    el.appendChild(hours);
    el.appendChild(make('span', 'fd-tp-k', 'Minutos'));
    const mins = make('div', 'fd-tp-grid m');
    for (let m = 0; m < 60; m += 5) { const b = make('button', 'fd-tp-b', two(m)); b.type = 'button'; b.dataset.m = m; mins.appendChild(b); }
    el.appendChild(mins);
    const foot = make('div', 'fd-tp-foot');
    const clear = make('button', 'fd-fa', 'Limpar'); clear.type = 'button';
    const done = make('button', 'fd-fa use', 'Pronto'); done.type = 'button';
    foot.append(clear, done);
    el.appendChild(foot);
    hours.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; TP.h = Number(b.dataset.h); if (TP.m == null) TP.m = 0; tpPaint(); });
    mins.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; TP.m = Number(b.dataset.m); if (TP.h == null) TP.h = 12; tpPaint(); });
    clear.addEventListener('click', () => { TP.h = TP.m = null; tpClose(); });
    done.addEventListener('click', () => tpClose());
    el.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); tpClose(true); } });
    return el;
  }
  const tpValue = () => (TP.h == null ? '' : two(TP.h) + ':' + two(TP.m == null ? 0 : TP.m));
  function tpPaint() {
    const el = TP.el;
    el.querySelector('.fd-tp-time').textContent = tpValue() || '--:--';
    el.querySelectorAll('[data-h]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.h) === TP.h)));
    el.querySelectorAll('[data-m]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.m) === TP.m)));
  }
  function tpPlace() {
    const r = TP.trigger.getBoundingClientRect(), p = TP.el.getBoundingClientRect();
    const left = Math.max(8, Math.min(innerWidth - p.width - 8, r.right - p.width));
    const below = r.bottom + 8 + p.height <= innerHeight - 8;
    TP.el.style.left = left + 'px';
    const top = below ? r.bottom + 8 : r.top - 8 - p.height;
    TP.el.style.top = Math.max(8, Math.min(innerHeight - p.height - 8, top)) + 'px';
  }
  function tpOutside(e) { if (TP.el && !TP.el.hidden && !TP.el.contains(e.target) && !TP.trigger.contains(e.target)) tpClose(); }
  function tpOpen(trigger, value, commit) {
    if (TP.el && !TP.el.hidden) tpClose();
    const host = trigger.closest('dialog') || document.body;
    if (!TP.el) TP.el = tpBuild();
    if (TP.el.parentElement !== host) host.appendChild(TP.el);   // inside the open dialog, so it shares the dialog's layer
    TP.trigger = trigger; TP.commit = commit; TP.start = value || '';
    const [h, m] = value ? value.split(':').map(Number) : [null, null];
    TP.h = h; TP.m = m;
    tpPaint();
    TP.el.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    tpPlace();
    const sel = TP.el.querySelector('[data-h][aria-pressed="true"]') || TP.el.querySelector('[data-h]');
    sel.focus({ preventScroll: true });
    setTimeout(() => document.addEventListener('pointerdown', tpOutside, true), 0);
  }
  function tpClose(discard) {
    if (!TP.el || TP.el.hidden) return;
    const v = discard ? TP.start : tpValue();
    TP.el.hidden = true;
    document.removeEventListener('pointerdown', tpOutside, true);
    TP.trigger.setAttribute('aria-expanded', 'false');
    const t = TP.trigger, commit = TP.commit;
    t.focus({ preventScroll: true });
    if (v !== TP.start && commit) commit(v);
  }
  // a field that shows a time (or --:--) and opens the picker; `onCommit` gets "HH:MM" or "" when the picker closes with a change
  function timeField(value, label, onCommit) {
    const b = make('button', 'fd-tf');
    b.type = 'button';
    b.setAttribute('aria-haspopup', 'dialog'); b.setAttribute('aria-expanded', 'false');
    const set = (v) => { b.dataset.v = v || ''; b.innerHTML = '<span>' + (v || '--:--') + '</span>' + CLOCK; b.classList.toggle('empty', !v); b.setAttribute('aria-label', label + ': ' + (v || 'não definido')); b.title = label; };
    set(value);
    b.addEventListener('click', () => tpOpen(b, b.dataset.v, (v) => { set(v); if (onCommit) onCommit(v); }));
    return { el: b, get: () => b.dataset.v || '', set };
  }

  // ---- meal divisions: add, rename, put in order, delete ----------------------------------------------------------------------------------------
  const divs = () => (S.data && S.data.slots) || [];
  async function divCall(path, method, body) {
    try {
      const data = await api('/v1/food/slots' + path, { method, body });
      await load();
      renderDivs();
      return data;
    } catch (e) { toast(e.message); renderDivs(); return null; }
  }
  // drag a division by its grip to reorder: the row follows the pointer and drops into place, then the new position is saved
  function dragDiv(e, row, ul, d) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    const from = [...ul.children].indexOf(row);
    let to = from;
    row.classList.add('dragging');
    document.body.classList.add('fd-dragging');
    const move = (ev) => {
      const others = [...ul.children].filter((r) => r !== row);
      let idx = others.findIndex((r) => { const b = r.getBoundingClientRect(); return ev.clientY < b.top + b.height / 2; });
      if (idx === -1) idx = others.length;
      const ref = others[idx] || null;
      if (ref !== row.nextElementSibling) ul.insertBefore(row, ref);
      to = [...ul.children].indexOf(row);
    };
    const end = async () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end);
      row.classList.remove('dragging'); document.body.classList.remove('fd-dragging');
      if (to !== from) await divCall('/' + d.key, 'PATCH', { position: to });
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end);
  }
  function renderDivs() {
    const ul = $('fdDivList');
    const list = divs();
    ul.replaceChildren();
    list.forEach((d, i) => {
      const li = make('li', 'fd-divrow');
      const name = make('input', 'fd-divname');
      name.value = d.label; name.maxLength = 40; name.setAttribute('aria-label', 'Nome da divisão');
      const save = () => { const v = name.value.trim(); if (!v || v === d.label) { name.value = d.label; return; } divCall('/' + d.key, 'PATCH', { label: v }); };
      name.addEventListener('change', save);
      name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); name.blur(); } else if (e.key === 'Escape') { name.value = d.label; name.blur(); } });
      const at = timeField(d.time || '', 'Horário habitual de ' + d.label, (v) => divCall('/' + d.key, 'PATCH', { time: v })).el;
      const info = make('span', 'fd-divuses', d.uses ? d.uses + (d.uses === 1 ? ' uso' : ' usos') : '');
      const grip = make('button', 'fd-grip'); grip.type = 'button';
      grip.setAttribute('aria-label', 'Arrastar para reorganizar ' + d.label); grip.title = 'Arraste para reorganizar';
      grip.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>';
      grip.addEventListener('keydown', (e) => {   // keyboard: arrows move the focused division
        if ((e.key === 'ArrowUp' && i > 0) || (e.key === 'ArrowDown' && i < list.length - 1)) { e.preventDefault(); divCall('/' + d.key, 'PATCH', { position: i + (e.key === 'ArrowUp' ? -1 : 1) }).then(() => { const g = ul.children[i + (e.key === 'ArrowUp' ? -1 : 1)]; if (g) g.querySelector('.fd-grip').focus(); }); }
      });
      grip.addEventListener('pointerdown', (e) => dragDiv(e, li, ul, d));
      const acts = make('div', 'fd-divacts');
      const del = make('button', 'fd-fa del fd-trash'); del.type = 'button'; del.disabled = list.length <= 1;
      del.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/></svg>';
      del.setAttribute('aria-label', 'Apagar divisão');
      del.title = list.length <= 1 ? 'Mantenha pelo menos uma divisão' : 'Apagar';
      del.addEventListener('click', () => askDelete(d, list));
      acts.append(del);
      li.append(grip, name, at, info, acts);
      ul.appendChild(li);
    });
  }
  // deleting a division: a small dialog asks first; when meals use it, it also asks which division takes them over
  let delTarget = null;
  function askDelete(d, list) {
    delTarget = d;
    const others = list.filter((x) => x.key !== d.key);
    $('fdDelText').textContent = d.uses
      ? d.uses + (d.uses === 1 ? ' refeição ou alimento salvo usa' : ' refeições e alimentos salvos usam') + ' "' + d.label + '". Escolha para onde vão antes de apagar.'
      : 'Apagar "' + d.label + '"? Isso não pode ser desfeito.';
    const sel = $('fdDelSel'); sel.replaceChildren();
    others.forEach((o) => { const opt = make('option', '', o.label); opt.value = o.key; sel.appendChild(opt); });
    $('fdDelMoveWrap').hidden = !d.uses;
    $('fdDelGo').textContent = d.uses ? 'Mover e apagar' : 'Apagar';
    $('fdDelDialog').showModal();
    $('fdDelCancel').focus();
  }
  async function confirmDelete() {
    const d = delTarget; if (!d) return;
    $('fdDelDialog').close();
    const r = await divCall('/' + d.key + (d.uses ? '?move_to=' + encodeURIComponent($('fdDelSel').value) : ''), 'DELETE');
    if (r) toast(d.uses ? 'Movidos ' + r.moved + ' e divisão apagada' : 'Divisão apagada');
  }
  const newTime = timeField('', 'Horário habitual (opcional)');
  function openDivs() {
    $('fdDivNew').value = ''; newTime.set('');
    renderDivs();
    $('fdDivDialog').showModal();
  }
  async function addDiv(event) {
    event.preventDefault();
    const v = $('fdDivNew').value.trim();
    if (!v) return;
    const r = await divCall('', 'POST', { label: v, time: newTime.get() || null });
    if (r) { $('fdDivNew').value = ''; newTime.set(''); toast('Division added'); }
    $('fdDivNew').focus();
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
      toast('Metas salvas');
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
    const LIGHT = ['#b83a2a', '#3a2418', '#fffdf6'];
    const DARK = ['#f2b84b', '#b7c98b', '#fbeedc'];
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
    document.addEventListener('keydown', (e) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open]')) return;
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(dayKey(addDays(parseDay(S.day), -1))); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); goTo(dayKey(addDays(parseDay(S.day), 1))); }
    });
    sparkTrail();
    $('fdRecipesClose').addEventListener('click', () => $('fdRecipesDialog').close());
    $('fdRecipesNew').addEventListener('click', () => openRecipe(null));
    $('fdRecipesSearch').addEventListener('input', renderRecipesList);
    loadRecipes();
    $('fdRecForm').addEventListener('submit', saveRecipe);
    $('fdRecClose').addEventListener('click', () => $('fdRecDialog').close());
    $('fdRecDelete').addEventListener('click', removeRecipe);
    $('fdRecServ').addEventListener('input', recTotals);
    $('fdRecSearch').addEventListener('input', recSuggest);
    $('fdRecTabMine').addEventListener('click', () => setRecMode('mine'));
    $('fdRecTabTaco').addEventListener('click', () => setRecMode('taco'));
    $('fdUseForm').addEventListener('submit', saveUse);
    $('fdUseClose').addEventListener('click', () => $('fdUseDialog').close());
    $('fdUseQty').addEventListener('input', useSum);
    $('fdMealClose').addEventListener('click', () => $('fdMealDialog').close());
    $('fdGoalClose').addEventListener('click', () => $('fdGoalDialog').close());
    $('fdFoodClose').addEventListener('click', () => $('fdFoodDialog').close());
    $('fdFoodForm').addEventListener('submit', saveFood);
    loadLib();
    ['fdRecipesDialog', 'fdRecDialog', 'fdUseDialog', 'fdMealDialog', 'fdGoalDialog', 'fdFoodDialog', 'fdFoodsDialog', 'fdDivDialog', 'fdDelDialog'].forEach((id) => $(id).addEventListener('click', (e) => { if (e.target === $(id)) $(id).close(); }));
    $('fdMealForm').addEventListener('submit', saveMeal);
    $('fdGoalForm').addEventListener('submit', saveGoals);
    $('fdMealDelete').addEventListener('click', removeMeal);
    $('fdSlots').addEventListener('change', () => { slot = $('fdSlots').value; });
    $('fdKeep').addEventListener('click', () => setKeep(!keep));
    $('fdDivTimeHost').replaceWith(newTime.el);
    $('fdDivDialog').addEventListener('cancel', (e) => { if (TP.el && !TP.el.hidden) { e.preventDefault(); tpClose(true); } });
    $('fdDivDialog').addEventListener('close', () => tpClose());
    $('fdDivClose').addEventListener('click', () => $('fdDivDialog').close());
    $('fdDelClose').addEventListener('click', () => $('fdDelDialog').close());
    $('fdDelCancel').addEventListener('click', () => $('fdDelDialog').close());
    $('fdDelGo').addEventListener('click', confirmDelete);
    $('fdDivForm').addEventListener('submit', addDiv);
    $('fdFoodsClose').addEventListener('click', () => $('fdFoodsDialog').close());
    $('fdFoodsNew').addEventListener('click', () => openFood(null));
    $('fdFoodsSearch').addEventListener('input', renderFoods);
    $('fdPickSearch').addEventListener('input', () => { tacoPage = 0; renderSuggest(); });
    $('fdPgPrev').addEventListener('click', () => { tacoPage--; renderSuggest(); });
    $('fdPgNext').addEventListener('click', () => { tacoPage++; renderSuggest(); });
    $('fdAddMore').addEventListener('click', addAnother);
    $('fdTabMine').addEventListener('click', () => setPickMode('mine'));
    $('fdTabTaco').addEventListener('click', () => setPickMode('taco'));
    $('fdTabRec').addEventListener('click', () => setPickMode('recipes'));
    $('fdFoodUnitAdd').addEventListener('click', () => addUnitRow('', '').focus());
    $('fdGrams').addEventListener('input', applyGrams);
    $('fdUnit').addEventListener('change', () => {
      const qty = num($('fdGrams').value);
      if (qty) $('fdGrams').value = r2((qty * unitGrams(unitNow)) / unitGrams($('fdUnit').value));
      unitNow = $('fdUnit').value;
    });
    // typing the numbers by hand ends the automatic scaling for this meal
    ['fdCal', 'fdP', 'fdC', 'fdF', 'fdFi'].forEach((id) => $(id).addEventListener('input', () => { if (scale) setScale(null); }));
    load().catch(() => {
      $('fdGrid').hidden = true;
      $('fdEmpty').textContent = 'Não foi possível carregar seu registro de comida agora.';
      $('fdEmpty').hidden = false;
    });
    // a new day: jump back to today if the page was left open on yesterday's today
    let lastToday = todayKey();
    setInterval(() => { const t = todayKey(); if (t !== lastToday) { if (S.day === lastToday) S.day = t; lastToday = t; load().catch(() => {}); } }, 60 * 1000);
  }

  init();
})();
