// Goals page: personal goals with a category, a deadline and progress as a number, a checklist or just done, backed by the shared ignis API.
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(2, '0');
  const dayKey = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parseDay = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const make = (tag, cls, text) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  };
  const fmt = (n) => (Math.round(n * 10) / 10).toLocaleString(undefined, { maximumFractionDigits: 1 });
  const num = (v) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };

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
  // notifications: the shared toast cards (toast.js)
  const toast = (text, opts) => window.IgnisToast.show(text, opts);

  const todayKey = () => dayKey(new Date());
  const S = { data: null, cat: 'all', first: true };
  const CATS = { body: 'Corpo', mind: 'Mente', skills: 'Habilidades', life: 'Vida', money: 'Dinheiro' };
  const TICK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

  const ICON = {
    target: '<g class="gl-i-target"><circle cx="42" cy="42" r="32" fill="currentColor"/><circle cx="42" cy="42" r="21" fill="#fff" opacity=".9"/><circle cx="42" cy="42" r="10" fill="currentColor"/></g>',
    cup: '<g class="gl-i-cup"><path d="M22 12h40v22a20 20 0 0 1-40 0Z" fill="currentColor"/><path d="M22 18H10v6a12 12 0 0 0 12 12M62 18h12v6a12 12 0 0 1-12 12" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><rect x="36" y="52" width="12" height="12" fill="currentColor"/><rect x="26" y="64" width="32" height="8" rx="3" fill="currentColor"/></g>',
    clock: '<g class="gl-i-clock"><circle cx="42" cy="44" r="30" fill="currentColor"/><path d="M42 26v18l12 8" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M26 10l-8 8M58 10l8 8" stroke="currentColor" stroke-width="5" stroke-linecap="round"/></g>',
    ring: '<g class="gl-i-ring"><circle cx="42" cy="42" r="30" fill="none" stroke="currentColor" stroke-width="12" stroke-dasharray="40 20"/></g>',
  };

  async function load() {
    S.data = await api('/v1/goals/overview?day=' + todayKey());
    render();
  }
  const figure = (cls) => make('figure', 'fd-fig ' + cls);
  const CAT_COLOR = { body: 'var(--f-carrot)', mind: 'var(--f-kiwi)', skills: 'var(--f-sun)', life: 'var(--f-cream)', money: 'var(--f-tomato)' };

  // ---- heading -------------------------------------------------------------------------------------------------------------------------------------
  function pageHead() {
    const d = S.data;
    const head = make('header', 'fd-pagehead');
    head.innerHTML = '<svg class="h-tw fd-tw" style="--x:34%;--y:18%;--s:20px;--d:0s" viewBox="0 0 32 32" aria-hidden="true"><use href="#spark"/></svg>' +
      '<svg class="h-tw fd-tw fd-tw-p" style="--x:46%;--y:58%;--s:13px;--d:1.1s" viewBox="0 0 32 32" aria-hidden="true"><use href="#spark"/></svg>';
    const text = make('div');
    text.appendChild(make('h1', '', 'Goals'));
    const bits = [d.active ? d.active + (d.active === 1 ? ' meta' : ' metas') + ' em andamento' : 'nada em andamento ainda'];
    if (d.active) bits.push(fmt(d.avg_pct) + '% em média');
    if (d.overdue) bits.push(d.overdue + (d.overdue === 1 ? ' atrasada' : ' atrasadas'));
    text.appendChild(make('p', 'fd-pagesub', bits.join(' · ')));
    head.appendChild(text);
    return head;
  }

  // ---- right column: New goal, the numbers, what is due soon ---------------------------------------------------------------------------------------
  function addButton() {
    const wrap = make('div', 'fd-addwrap');
    const b = make('button', 'fd-mini');
    b.type = 'button'; b.id = 'gNew';
    b.innerHTML = '<span class="fd-plus" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></span><span>Nova meta</span>';
    b.addEventListener('click', () => openGoal(null));
    wrap.appendChild(b);
    return wrap;
  }
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
    li.setAttribute('aria-label', label + ': ' + fmt(value) + (unit || ''));
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
    const ul = make('ul', 'fd-tiles gp-tiles');
    ul.setAttribute('aria-label', 'Números das metas');
    ul.append(
      tile('t-cal', 'Em andamento', d.active, '', 'target', d.active ? fmt(d.avg_pct) + '% em média' : 'adicione a primeira'),
      tile('t-pro', 'Vencem logo', d.due_soon, '', 'clock', d.overdue ? d.overdue + (d.overdue === 1 ? ' atrasada' : ' atrasadas') : 'próximos 14 dias'),
      tile('t-carb', 'Concluídas no ano', d.done_year, '', 'cup', d.done + ' no total'),
      tile('t-fat', 'Média', d.avg_pct, '%', 'ring', 'das metas ativas'),
    );
    return ul;
  }
  function dueCard() {
    const list = S.data.goals.filter((g) => g.status === 'active' && g.days_left != null && g.days_left <= 14).sort((a, b) => a.days_left - b.days_left);
    const c = figure('fd-week-card gp-duecard');
    const head = make('div', 'fd-head');
    head.appendChild(make('p', 'fd-k', 'Vencem logo'));
    head.appendChild(make('span', 'fd-pillsm', String(list.length)));
    c.appendChild(head);
    if (!list.length) { c.appendChild(make('p', 'gp-none', 'Nada vence nas próximas duas semanas.')); return c; }
    const ul = make('ul', 'gp-dlist');
    list.forEach((g) => {
      const li = make('li', 'gp-drow' + (g.days_left <= 7 ? ' hot' : ''));
      li.appendChild(make('span', '', g.title));
      li.appendChild(make('b', '', dueLabel(g)[0]));
      ul.appendChild(li);
    });
    c.appendChild(ul);
    return c;
  }

  function dueLabel(g) {
    if (g.days_left == null) return null;
    if (g.days_left < 0) return [Math.abs(g.days_left) + (Math.abs(g.days_left) === 1 ? ' dia' : ' dias') + ' de atraso', true];
    if (g.days_left === 0) return ['vence hoje', true];
    if (g.days_left <= 7) return ['em ' + g.days_left + (g.days_left === 1 ? ' dia' : ' dias'), true];
    return ['até ' + parseDay(g.due).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: parseDay(g.due).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }), false];
  }

  async function patch(g, body, ok) {
    try {
      const res = await api('/v1/goals/' + g.id, { method: 'PATCH', body: { ...body, today: todayKey() } });
      await load();
      return res;
    } catch (e) { toast(e.message, { type: 'warn' }); }
  }

  // ---- the list: a row per goal with a progress bar ---------------------------------------------------------------------------------------------------
  function goalRow(g) {
    const done = g.status === 'done';
    const li = make('li', 'fd-row gp-row' + (done ? ' done' : ''));
    li.style.setProperty('--hc', CAT_COLOR[g.category] || 'var(--f-sun)');
    li.appendChild(make('i', 'fd-bullet'));
    const main = make('div', 'gp-main');
    const top = make('div', 'gp-top');
    top.appendChild(make('b', 'gp-title', g.title));
    top.appendChild(make('span', 'gp-cat', CATS[g.category]));
    const dl = !done && dueLabel(g);
    if (dl) top.appendChild(make('span', 'gp-due' + (dl[1] ? ' late' : ''), dl[0]));
    if (done) top.appendChild(make('span', 'gp-won', 'Concluída'));
    main.appendChild(top);
    if (g.note) main.appendChild(make('small', 'gp-note', g.note));

    const bar = make('div', 'gp-bar');
    const track = make('span', 'gp-track');
    const fill = make('i');
    fill.style.setProperty('--p', '0%');
    track.appendChild(fill);
    requestAnimationFrame(() => requestAnimationFrame(() => fill.style.setProperty('--p', g.pct + '%')));
    bar.append(track, make('b', 'gp-pct', Math.round(g.pct) + '%'));
    main.appendChild(bar);

    let sub;
    if (g.kind === 'number') sub = fmt(g.current) + ' / ' + fmt(g.target) + (g.unit ? ' ' + g.unit : '') + ' · ' + (g.pct >= 100 ? 'alvo atingido' : 'faltam ' + fmt(Math.max(0, g.target - g.current)) + (g.unit ? ' ' + g.unit : ''));
    else if (g.kind === 'steps') { const n = g.steps.filter((x) => x.done).length; sub = n + ' / ' + g.steps.length + ' etapas' + (g.steps.length && n === g.steps.length ? ' · todas feitas' : ''); }
    else sub = done ? 'meta atingida' : 'marque quando estiver feita';
    main.appendChild(make('small', 'gp-sub', sub));

    if (g.kind === 'steps' && g.steps.length) {
      const list = make('ul', 'gp-chk');
      g.steps.forEach((st, k) => {
        const row = make('li');
        const b = make('button', st.done ? 'on' : '');
        b.type = 'button';
        b.disabled = done;
        b.setAttribute('aria-pressed', String(st.done));
        b.innerHTML = '<span class="gp-box">' + TICK + '</span>';
        b.appendChild(make('span', '', st.text));
        b.addEventListener('click', () => patch(g, { steps: g.steps.map((x, j) => ({ text: x.text, done: j === k ? !x.done : x.done })) }));
        row.appendChild(b);
        list.appendChild(row);
      });
      main.appendChild(list);
    }
    li.appendChild(main);

    const acts = make('div', 'gp-acts');
    const edit = make('button', 'fd-edit', 'Editar');
    edit.type = 'button';
    edit.addEventListener('click', () => openGoal(g));
    if (done) {
      const re = make('button', 'fd-edit', 'Reabrir');
      re.type = 'button';
      re.addEventListener('click', async () => { await patch(g, { status: 'active' }); toast('Reaberta: ' + g.title, { undo: () => patch(g, { status: 'done' }) }); });
      acts.append(re, edit);
    } else {
      if (g.kind === 'number') {
        const step = g.target >= 100 ? Math.max(1, Math.round(g.target / 20)) : 1;
        const plus = make('button', 'fd-edit gp-go', '+' + fmt(step) + (g.unit ? ' ' + g.unit : ''));
        plus.type = 'button';
        plus.addEventListener('click', async () => {
          const was = g.current;
          const now = was + step;
          await patch(g, { current: now });
          toast(g.title, { sub: fmt(now) + ' / ' + fmt(g.target) + (g.unit ? ' ' + g.unit : ''), undo: () => patch(g, { current: was }) });
        });
        acts.appendChild(plus);
      }
      if (g.kind === 'simple' || g.pct >= 100) {
        const win = make('button', 'fd-edit gp-go', g.kind === 'simple' ? 'Concluir' : 'Concluir ✓');
        win.type = 'button';
        win.addEventListener('click', async () => { await patch(g, { status: 'done' }); toast('Meta concluída: ' + g.title, { type: 'win', sub: 'Muito bem!', undo: () => patch(g, { status: 'active' }) }); });
        acts.appendChild(win);
      }
      acts.appendChild(edit);
    }
    li.appendChild(acts);
    return li;
  }

  function listCard() {
    const c = figure('fd-log gp-log');
    const all = S.data.goals;
    if (all.length) {
      const tabs = make('div', 'gp-tabs');
      tabs.setAttribute('role', 'group'); tabs.setAttribute('aria-label', 'Area');
      [['all', 'Todas'], ...Object.entries(CATS)].forEach(([k, label]) => {
        const n = all.filter((g) => g.status === 'active' && (k === 'all' || g.category === k)).length;
        const b = make('button', 'gp-tab');
        b.type = 'button';
        b.setAttribute('aria-pressed', String(S.cat === k));
        b.innerHTML = '<span>' + label + '</span><b>' + n + '</b>';
        b.addEventListener('click', () => { S.cat = k; render(); });
        tabs.appendChild(b);
      });
      c.appendChild(tabs);
    }
    const inCat = (g) => S.cat === 'all' || g.category === S.cat;
    const active = all.filter((g) => g.status === 'active' && inCat(g));
    const done = all.filter((g) => g.status === 'done' && inCat(g));
    const list = make('ul', 'fd-list');
    list.appendChild(make('li', 'fd-group g5', 'Em andamento'));
    if (!active.length) list.appendChild(make('li', 'fd-empty', all.length ? 'Nada aqui nesta área.' : 'Nenhuma meta ainda. Toque em “Nova meta” para criar a primeira: algo a concluir, um número a atingir ou uma lista de etapas.'));
    active.forEach((g) => list.appendChild(goalRow(g)));
    if (done.length) {
      list.appendChild(make('li', 'fd-group g1', 'Concluídas'));
      done.forEach((g) => list.appendChild(goalRow(g)));
    }
    c.appendChild(list);
    return c;
  }

  function render() {
    const wrap = make('div', 'fd-wrap');
    const main = make('section', 'fd-main');
    const side = make('aside', 'fd-sidecol');
    main.append(pageHead(), listCard());
    side.append(addButton(), tiles(), dueCard());
    wrap.append(main, side);
    $('gGrid').replaceChildren(wrap);
  }

  // ---- dialog -----------------------------------------------------------------------------------------------------------------------------
  let editing = null;
  const D = { cat: 'life', kind: 'number', steps: [], armed: 0 };
  const press = (box, value) => box.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === value)));
  function setKind(k) {
    D.kind = k;
    press($('gKind'), k);
    $('gNumWrap').hidden = k !== 'number';
    $('gStepsWrap').hidden = k !== 'steps';
  }
  function drawSteps() {
    const box = $('gSteps');
    box.replaceChildren();
    D.steps.forEach((s, i) => {
      const row = make('div', 'gl-step' + (s.done ? ' on' : ''));
      const tick = make('button', 'gl-box');
      tick.type = 'button';
      tick.setAttribute('aria-label', 'Marcar etapa');
      tick.innerHTML = TICK;
      tick.addEventListener('click', () => { s.done = !s.done; drawSteps(); });
      const rm = make('button', '', '✕');
      rm.type = 'button';
      rm.setAttribute('aria-label', 'Remover etapa');
      rm.addEventListener('click', () => { D.steps.splice(i, 1); drawSteps(); });
      row.append(tick, make('span', '', s.text), rm);
      box.appendChild(row);
    });
  }
  function openGoal(g) {
    editing = g;
    $('gDlgTitle').textContent = g ? 'Editar meta' : 'Nova meta';
    $('gTitle').value = g ? g.title : '';
    D.cat = g ? g.category : 'life';
    press($('gCat'), D.cat);
    setKind(g ? g.kind : 'number');
    $('gCur').value = g && g.kind === 'number' ? g.current : '';
    $('gTarget').value = g && g.kind === 'number' ? g.target : '';
    $('gUnit').value = g && g.unit ? g.unit : '';
    D.steps = g ? g.steps.map((s) => ({ text: s.text, done: s.done })) : [];
    drawSteps();
    $('gStepNew').value = '';
    if (calAnim) { calAnim.cancel(); calAnim = null; }
    $('gCal').style.overflow = '';
    $('gCal').hidden = true;
    $('gWhenBtn').setAttribute('aria-expanded', 'false');
    cal.month = new Date();
    setDue(g && g.due ? parseDay(g.due) : null);
    $('gNote').value = g && g.note ? g.note : '';
    $('gErr').hidden = true;
    $('gSave').disabled = false;
    $('gDone').hidden = !g || g.status === 'done';
    const del = $('gDelete');
    del.hidden = !g;
    del.classList.remove('sure');
    del.textContent = 'Apagar esta meta';
    $('gDialog').showModal();
    $('gTitle').focus();
  }
  // calendar picker for the deadline (same month grid as the diary and meds dialogs; Monday first, past days disabled)
  const cal = { sel: null, month: new Date() };
  // the calendar slides open and closed (height + fade); with reduced motion it just switches
  let calAnim = null;
  function showCal(open) {
    const box = $('gCal');
    $('gWhenBtn').setAttribute('aria-expanded', String(open));
    if (calAnim) { calAnim.cancel(); calAnim = null; }
    const still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (open) {
      box.hidden = false;
      if (still || !box.animate) return;
      const h = box.scrollHeight;
      box.style.overflow = 'hidden';
      calAnim = box.animate([{ height: '0px', opacity: 0, transform: 'translateY(-6px)' }, { height: h + 'px', opacity: 1, transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.2, .8, .2, 1)' });
      calAnim.onfinish = () => { box.style.overflow = ''; calAnim = null; };
    } else {
      if (box.hidden) return;
      if (still || !box.animate) { box.hidden = true; return; }
      const h = box.getBoundingClientRect().height;
      box.style.overflow = 'hidden';
      calAnim = box.animate([{ height: h + 'px', opacity: 1, transform: 'none' }, { height: '0px', opacity: 0, transform: 'translateY(-6px)' }], { duration: 240, easing: 'cubic-bezier(.4, 0, .2, 1)', fill: 'forwards' });
      calAnim.closing = true;
      calAnim.onfinish = () => { box.hidden = true; box.style.overflow = ''; calAnim.cancel(); calAnim = null; };
    }
  }
  function setDue(date, closeCal) {
    cal.sel = date;
    $('gDue').value = date ? dayKey(date) : '';
    $('gWhenText').textContent = date ? date.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }) : 'Sem prazo';
    if (closeCal) showCal(false);
    if (date) cal.month = new Date(date.getFullYear(), date.getMonth(), 1);
    renderCal();
  }
  function renderCal() {
    const m = cal.month, y = m.getFullYear(), mo = m.getMonth();
    $('gCalTitle').textContent = m.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    const lead = (new Date(y, mo, 1).getDay() + 6) % 7;
    const total = new Date(y, mo + 1, 0).getDate();
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push(make('span', 'gl-pad'));
    for (let d = 1; d <= total; d++) {
      const date = new Date(y, mo, d);
      const isSel = cal.sel && cal.sel.getFullYear() === y && cal.sel.getMonth() === mo && cal.sel.getDate() === d;
      const isToday = date.getTime() === todayStart.getTime();
      const b = make('button', 'gl-dayb' + (isToday ? ' today' : '') + (isSel ? ' sel' : ''), String(d));
      b.type = 'button';
      b.disabled = date < todayStart;
      b.setAttribute('aria-pressed', String(!!isSel));
      b.setAttribute('aria-label', date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }));
      b.addEventListener('click', () => setDue(date, true));
      cells.push(b);
    }
    $('gCalGrid').replaceChildren(...cells);
    $('gCalPrev').disabled = new Date(y, mo, 1) <= new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);
  }
  function addStep() {
    const t = $('gStepNew').value.trim();
    if (!t) return;
    D.steps.push({ text: t, done: false });
    $('gStepNew').value = '';
    drawSteps();
    $('gStepNew').focus();
  }
  async function saveGoal(event) {
    event.preventDefault();
    const err = $('gErr');
    err.hidden = true;
    const title = $('gTitle').value.trim();
    if (!title) { err.textContent = 'Dê um nome à meta.'; err.hidden = false; return; }
    if (D.kind === 'steps' && $('gStepNew').value.trim()) addStep();
    const body = { title, category: D.cat, kind: D.kind, note: $('gNote').value.trim(), due: $('gDue').value || '', unit: $('gUnit').value.trim() };
    if (D.kind === 'number') {
      const target = num($('gTarget').value);
      if (!target || target <= 0) { err.textContent = 'Defina um alvo maior que zero.'; err.hidden = false; return; }
      body.target = target;
      body.current = num($('gCur').value) || 0;
    } else {
      body.unit = '';
      if (D.kind === 'steps') {
        if (!D.steps.length) { err.textContent = 'Adicione pelo menos uma etapa.'; err.hidden = false; return; }
        body.steps = D.steps;
      }
    }
    $('gSave').disabled = true;
    try {
      let saved;
      if (editing) saved = await api('/v1/goals/' + editing.id, { method: 'PATCH', body: { ...body, today: todayKey() } });
      else saved = await api('/v1/goals', { method: 'POST', body });
      $('gDialog').close();
      const wasEdit = !!editing;
      toast(wasEdit ? 'Meta salva' : 'Meta adicionada', { sub: title, undo: wasEdit ? null : () => api('/v1/goals/' + saved.id, { method: 'DELETE' }).then(load) });
      S.first = !wasEdit;
      await load();
    } catch (e) {
      err.textContent = e.message;
      err.hidden = false;
      $('gSave').disabled = false;
    }
  }
  async function deleteGoal() {
    if (!editing || !(await IgnisConfirm.ask({ title: 'Apagar meta', text: 'Apagar "' + editing.title + '"? Isso não pode ser desfeito.' }))) return;
    try {
      const gone = editing;
      await api('/v1/goals/' + gone.id, { method: 'DELETE' });
      $('gDialog').close();
      await load();
      toast('Meta apagada', { sub: gone.title, undo: async () => {
        await api('/v1/goals', { method: 'POST', body: { title: gone.title, category: gone.category, kind: gone.kind, note: gone.note || '', due: gone.due || '', unit: gone.unit || '', target: gone.kind === 'number' ? gone.target : undefined, current: gone.kind === 'number' ? gone.current : 0, steps: gone.kind === 'steps' ? gone.steps.map((x) => ({ text: x.text, done: x.done })) : [] } });
        await load();
      } });
    } catch (e) { toast(e.message, { type: 'warn' }); }
  }

  function init() {
    $('gClose').addEventListener('click', () => $('gDialog').close());
    $('gDialog').addEventListener('click', (e) => { if (e.target === $('gDialog')) $('gDialog').close(); });
    $('gForm').addEventListener('submit', saveGoal);
    $('gDelete').addEventListener('click', deleteGoal);
    $('gDone').addEventListener('click', async () => { if (!editing) return; const g = editing; $('gDialog').close(); await patch(g, { status: 'done' }); toast('Meta concluída: ' + g.title, { type: 'win', sub: 'Muito bem!', undo: () => patch(g, { status: 'active' }) }); });
    $('gCat').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { D.cat = b.dataset.v; press($('gCat'), D.cat); } });
    $('gKind').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setKind(b.dataset.v); });
    $('gWhenBtn').addEventListener('click', () => {
      const open = $('gCal').hidden || (calAnim && calAnim.closing);
      if (open) { cal.month = cal.sel ? new Date(cal.sel.getFullYear(), cal.sel.getMonth(), 1) : new Date(); renderCal(); }
      showCal(!!open);
    });
    $('gCalPrev').addEventListener('click', () => { cal.month = new Date(cal.month.getFullYear(), cal.month.getMonth() - 1, 1); renderCal(); });
    $('gCalNext').addEventListener('click', () => { cal.month = new Date(cal.month.getFullYear(), cal.month.getMonth() + 1, 1); renderCal(); });
    $('gQuick').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const t = new Date();
      let d = null;
      if (b.dataset.d === 'eoy') d = new Date(t.getFullYear(), 11, 31);
      else if (b.dataset.d !== '0') d = new Date(t.getFullYear(), t.getMonth(), t.getDate() + Number(b.dataset.d));
      setDue(d, true);
    });
    $('gStepAdd').addEventListener('click', addStep);
    $('gStepNew').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addStep(); } });
    load().catch(() => { const el = $('gEmpty'); el.textContent = 'Não foi possível carregar suas metas. Recarregue para tentar de novo.'; el.hidden = false; });
  }
  init();
})();
