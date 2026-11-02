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

  const todayKey = () => dayKey(new Date());
  const S = { data: null, cat: 'all', first: true };
  const CATS = { body: 'Body', mind: 'Mind', skills: 'Skills', life: 'Life', money: 'Money' };
  const TICK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

  async function load() {
    S.data = await api('/v1/goals/overview?day=' + todayKey());
    render();
  }

  const ICON = {
    target: '<g class="gl-i-target"><circle cx="42" cy="42" r="32" fill="currentColor"/><circle cx="42" cy="42" r="21" fill="#fff" opacity=".9"/><circle cx="42" cy="42" r="10" fill="currentColor"/></g>',
    cup: '<g class="gl-i-cup"><path d="M22 12h40v22a20 20 0 0 1-40 0Z" fill="currentColor"/><path d="M22 18H10v6a12 12 0 0 0 12 12M62 18h12v6a12 12 0 0 1-12 12" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><rect x="36" y="52" width="12" height="12" fill="currentColor"/><rect x="26" y="64" width="32" height="8" rx="3" fill="currentColor"/></g>',
    clock: '<g class="gl-i-clock"><circle cx="42" cy="44" r="30" fill="currentColor"/><path d="M42 26v18l12 8" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M26 10l-8 8M58 10l8 8" stroke="currentColor" stroke-width="5" stroke-linecap="round"/></g>',
    ring: '<g class="gl-i-ring"><circle cx="42" cy="42" r="30" fill="none" stroke="currentColor" stroke-width="12" stroke-dasharray="40 20"/></g>',
  };
  function tile(cls, label, value, unit, icon, sub) {
    const li = make('li', 'gl-tile ' + cls);
    const left = make('span', 'gl-tl');
    left.appendChild(make('small', '', label));
    const n = make('b', 'gl-n');
    n.textContent = fmt(value);
    if (unit) n.appendChild(make('em', '', unit));
    left.appendChild(n);
    if (sub) left.appendChild(make('span', 'gl-sub', sub));
    const art = make('span', 'gl-art');
    art.innerHTML = '<svg viewBox="0 0 84 84" aria-hidden="true">' + ICON[icon] + '</svg>';
    li.append(left, art);
    return li;
  }

  function renderTop() {
    const d = S.data;
    const top = $('gTop');
    top.replaceChildren();
    const word = make('figure', 'gl-fig gl-word grain');
    word.innerHTML = '<p class="gl-wordt">Goals</p><svg class="gl-tw" style="--x:88%;--y:12%;--s:22px;--d:0s" viewBox="0 0 32 32" aria-hidden="true"><use href="#spark"/></svg><svg class="gl-tw gl-tw-p" style="--x:76%;--y:66%;--s:16px;--d:1.1s" viewBox="0 0 32 32" aria-hidden="true"><use href="#spark"/></svg><svg class="gl-tw" style="--x:52%;--y:10%;--s:12px;--d:2s" viewBox="0 0 32 32" aria-hidden="true"><use href="#spark"/></svg>';
    const row = make('div', 'gl-wordrow');
    row.appendChild(make('small', '', d.active ? d.active + (d.active === 1 ? ' goal' : ' goals') + ' in progress' : 'Nothing in progress yet'));
    const add = make('button', 'gl-mini');
    add.type = 'button';
    add.innerHTML = '<span class="gl-plus"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></span>New goal';
    add.addEventListener('click', () => openGoal(null));
    row.appendChild(add);
    word.appendChild(row);
    const tiles = make('ul', 'gl-tiles');
    tiles.append(
      tile('t-a', 'In progress', d.active, '', 'target', d.active ? fmt(d.avg_pct) + '% average' : 'add your first'),
      tile('t-d', 'Due soon', d.due_soon, '', 'clock', d.overdue ? d.overdue + ' overdue' : 'next 14 days'),
      tile('t-s', 'Done this year', d.done_year, '', 'cup', d.done + ' in total'),
      tile('t-p', 'Average', d.avg_pct, '%', 'ring', 'of active goals'),
    );
    top.append(word, tiles);
  }

  function dueLabel(g) {
    if (g.days_left == null) return null;
    if (g.days_left < 0) return [Math.abs(g.days_left) + (Math.abs(g.days_left) === 1 ? ' day' : ' days') + ' overdue', true];
    if (g.days_left === 0) return ['due today', true];
    if (g.days_left <= 7) return ['in ' + g.days_left + (g.days_left === 1 ? ' day' : ' days'), true];
    return ['by ' + parseDay(g.due).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: parseDay(g.due).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }), false];
  }

  async function patch(g, body) {
    try {
      await api('/v1/goals/' + g.id, { method: 'PATCH', body: { ...body, today: todayKey() } });
      await load();
    } catch (e) { toast(e.message); }
  }

  function card(g, i) {
    const li = make('li', 'gl-card c-' + g.category + (g.status === 'done' ? ' done' : ''));
    li.style.setProperty('--i', i);
    if (!S.first) { li.style.animation = 'none'; li.style.opacity = '1'; li.style.transform = 'none'; }
    const top = make('div', 'gl-ctop');
    top.appendChild(make('span', 'gl-cat', CATS[g.category]));
    if (g.status === 'done') top.insertAdjacentHTML('beforeend', '<svg class="gl-trophy" viewBox="0 0 84 84" aria-hidden="true">' + ICON.cup + '</svg>');
    else { const dl = dueLabel(g); if (dl) top.appendChild(make('span', 'gl-due' + (dl[1] ? ' late' : ''), dl[0])); }
    li.appendChild(top);
    li.appendChild(make('h3', 'gl-ct', g.title));
    if (g.note) li.appendChild(make('p', 'gl-cn', g.note));

    const prog = make('div', 'gl-prog');
    const ring = make('div', 'gl-ring');
    ring.style.setProperty('--p', g.pct);
    ring.innerHTML = '<svg viewBox="0 0 100 100" aria-hidden="true"><circle class="tr" cx="50" cy="50" r="40"/><circle class="fl" cx="50" cy="50" r="40" pathLength="100"/></svg><b>' + Math.round(g.pct) + '%</b>';
    const of = make('div', 'gl-of');
    if (g.kind === 'number') {
      const s = make('strong', '', fmt(g.current));
      s.appendChild(make('em', '', '/ ' + fmt(g.target) + (g.unit ? ' ' + g.unit : '')));
      of.append(s, make('small', '', g.pct >= 100 ? 'target reached' : fmt(Math.max(0, g.target - g.current)) + (g.unit ? ' ' + g.unit : '') + ' to go'));
    } else if (g.kind === 'steps') {
      const done = g.steps.filter((x) => x.done).length;
      const s = make('strong', '', done + ' / ' + g.steps.length);
      s.appendChild(make('em', '', 'steps'));
      of.append(s, make('small', '', g.steps.length && done === g.steps.length ? 'all steps done' : (g.steps.length - done) + ' to go'));
    } else {
      of.append(make('strong', '', g.status === 'done' ? 'Done' : 'Open'), make('small', '', g.status === 'done' ? 'goal reached' : 'tick it off when done'));
    }
    prog.append(ring, of);
    li.appendChild(prog);

    if (g.kind === 'steps' && g.steps.length && g.status !== 'done') {
      const list = make('ul', 'gl-chk');
      g.steps.slice(0, 5).forEach((st, k) => {
        const row = make('li');
        const b = make('button', st.done ? 'on' : '');
        b.type = 'button';
        b.setAttribute('aria-pressed', String(st.done));
        b.innerHTML = '<span class="gl-box">' + TICK + '</span>';
        b.appendChild(make('span', '', st.text));
        b.addEventListener('click', () => patch(g, { steps: g.steps.map((x, j) => ({ text: x.text, done: j === k ? !x.done : x.done })) }));
        row.appendChild(b);
        list.appendChild(row);
      });
      li.appendChild(list);
      if (g.steps.length > 5) li.appendChild(make('p', 'gl-more', '+' + (g.steps.length - 5) + ' more steps'));
    }

    const acts = make('div', 'gl-acts');
    if (g.status === 'done') {
      const re = make('button', 'gl-btn ghost', 'Reopen');
      re.type = 'button';
      re.addEventListener('click', () => patch(g, { status: 'active' }));
      acts.appendChild(re);
    } else {
      if (g.kind === 'number') {
        const step = g.target >= 100 ? Math.max(1, Math.round(g.target / 20)) : 1;
        const plus = make('button', 'gl-btn', '+' + fmt(step) + (g.unit ? ' ' + g.unit : ''));
        plus.type = 'button';
        plus.addEventListener('click', () => patch(g, { current: g.current + step }));
        acts.appendChild(plus);
      }
      if (g.kind === 'simple' || g.pct >= 100) {
        const win = make('button', 'gl-btn win', g.kind === 'simple' ? 'Mark done' : 'Complete ✓');
        win.type = 'button';
        win.addEventListener('click', () => { patch(g, { status: 'done' }); toast('Goal completed. Well done!'); });
        acts.appendChild(win);
      }
    }
    const edit = make('button', 'gl-btn ghost', 'Edit');
    edit.type = 'button';
    edit.addEventListener('click', () => openGoal(g));
    acts.appendChild(edit);
    li.appendChild(acts);
    return li;
  }

  function section(title, list, dark, emptyText) {
    const sec = make('figure', 'gl-fig gl-sec' + (dark ? ' dark' : ''));
    const head = make('div', 'gl-head');
    head.appendChild(make('p', 'gl-k', title));
    sec.appendChild(head);
    if (!list.length) { sec.appendChild(make('p', 'gl-empty', emptyText)); return [sec, head]; }
    const ul = make('ul', 'gl-cards');
    list.forEach((g, i) => ul.appendChild(card(g, i)));
    sec.appendChild(ul);
    return [sec, head];
  }

  function render() {
    renderTop();
    const box = $('gLists');
    box.replaceChildren();
    const all = S.data.goals;
    const hasAny = all.length > 0;
    const inCat = (g) => S.cat === 'all' || g.category === S.cat;
    const active = all.filter((g) => g.status === 'active' && inCat(g));
    const done = all.filter((g) => g.status === 'done' && inCat(g));
    const [secA, headA] = section('In progress', active, false, hasAny ? 'Nothing here for this area.' : 'No goals yet. Tap “New goal” to set your first one: something to finish, a number to reach or a list of steps.');
    if (hasAny) {
      const pills = make('div', 'gl-pills');
      pills.setAttribute('role', 'group');
      pills.setAttribute('aria-label', 'Area');
      [['all', 'All'], ...Object.entries(CATS)].forEach(([k, label]) => {
        const b = make('button', '', label);
        b.type = 'button';
        b.setAttribute('aria-pressed', String(S.cat === k));
        b.addEventListener('click', () => { S.cat = k; S.first = false; render(); });
        pills.appendChild(b);
      });
      headA.appendChild(pills);
    }
    box.appendChild(secA);
    if (done.length) box.appendChild(section('Completed', done, true, '')[0]);
    S.first = false;
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
      tick.setAttribute('aria-label', 'Toggle step');
      tick.innerHTML = TICK;
      tick.addEventListener('click', () => { s.done = !s.done; drawSteps(); });
      const rm = make('button', '', '✕');
      rm.type = 'button';
      rm.setAttribute('aria-label', 'Remove step');
      rm.addEventListener('click', () => { D.steps.splice(i, 1); drawSteps(); });
      row.append(tick, make('span', '', s.text), rm);
      box.appendChild(row);
    });
  }
  function openGoal(g) {
    editing = g;
    $('gDlgTitle').textContent = g ? 'Edit goal' : 'New goal';
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
    del.textContent = 'Delete this goal';
    $('gDialog').showModal();
    $('gTitle').focus();
  }
  // calendar picker for the deadline (same month grid as the diary and meds dialogs; Monday first, past days disabled)
  const cal = { sel: null, month: new Date() };
  function setDue(date, closeCal) {
    cal.sel = date;
    $('gDue').value = date ? dayKey(date) : '';
    $('gWhenText').textContent = date ? date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }) : 'No deadline';
    if (closeCal) { $('gCal').hidden = true; $('gWhenBtn').setAttribute('aria-expanded', 'false'); }
    if (date) cal.month = new Date(date.getFullYear(), date.getMonth(), 1);
    renderCal();
  }
  function renderCal() {
    const m = cal.month, y = m.getFullYear(), mo = m.getMonth();
    $('gCalTitle').textContent = m.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
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
      b.setAttribute('aria-label', date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }));
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
    if (!title) { err.textContent = 'Give the goal a name.'; err.hidden = false; return; }
    if (D.kind === 'steps' && $('gStepNew').value.trim()) addStep();
    const body = { title, category: D.cat, kind: D.kind, note: $('gNote').value.trim(), due: $('gDue').value || '', unit: $('gUnit').value.trim() };
    if (D.kind === 'number') {
      const target = num($('gTarget').value);
      if (!target || target <= 0) { err.textContent = 'Set a target above zero.'; err.hidden = false; return; }
      body.target = target;
      body.current = num($('gCur').value) || 0;
    } else {
      body.unit = '';
      if (D.kind === 'steps') {
        if (!D.steps.length) { err.textContent = 'Add at least one step.'; err.hidden = false; return; }
        body.steps = D.steps;
      }
    }
    $('gSave').disabled = true;
    try {
      if (editing) await api('/v1/goals/' + editing.id, { method: 'PATCH', body: { ...body, today: todayKey() } });
      else await api('/v1/goals', { method: 'POST', body });
      $('gDialog').close();
      toast(editing ? 'Saved' : 'Goal added');
      S.first = !editing;
      await load();
    } catch (e) {
      err.textContent = e.message;
      err.hidden = false;
      $('gSave').disabled = false;
    }
  }
  async function deleteGoal() {
    const del = $('gDelete');
    if (!D.armed) {
      D.armed = setTimeout(() => { D.armed = 0; del.classList.remove('sure'); del.textContent = 'Delete this goal'; }, 4000);
      del.classList.add('sure');
      del.textContent = 'Sure? Tap again to delete';
      return;
    }
    clearTimeout(D.armed);
    D.armed = 0;
    try {
      await api('/v1/goals/' + editing.id, { method: 'DELETE' });
      $('gDialog').close();
      toast('Deleted');
      await load();
    } catch (e) { toast(e.message); }
  }

  function init() {
    $('gGrid').innerHTML = '<div class="identity gl-board"><div class="gl-top" id="gTop"></div><div id="gLists" style="display:grid;gap:12px"></div></div>';
    $('gClose').addEventListener('click', () => $('gDialog').close());
    $('gDialog').addEventListener('click', (e) => { if (e.target === $('gDialog')) $('gDialog').close(); });
    $('gForm').addEventListener('submit', saveGoal);
    $('gDelete').addEventListener('click', deleteGoal);
    $('gDone').addEventListener('click', async () => { if (!editing) return; $('gDialog').close(); await patch(editing, { status: 'done' }); toast('Goal completed. Well done!'); });
    $('gCat').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { D.cat = b.dataset.v; press($('gCat'), D.cat); } });
    $('gKind').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setKind(b.dataset.v); });
    $('gWhenBtn').addEventListener('click', () => {
      const open = $('gCal').hidden;
      $('gCal').hidden = !open;
      $('gWhenBtn').setAttribute('aria-expanded', String(open));
      if (open) { cal.month = cal.sel ? new Date(cal.sel.getFullYear(), cal.sel.getMonth(), 1) : new Date(); renderCal(); }
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
    load().catch(() => { const el = $('gEmpty'); el.textContent = 'Could not load your goals. Reload to try again.'; el.hidden = false; });
  }
  init();
})();
