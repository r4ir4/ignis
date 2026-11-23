// Rotina: a weekly timetable in 30-minute blocks. Tap a block to tick it off; "Editar rotina" lets you change what each block says.
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const make = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  const MONTHS = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];
  const pad = (n) => String(n).padStart(2, '0');
  const dayKey = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parseDay = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const mondayOf = (d) => addDays(d, -((d.getDay() + 6) % 7));
  const thisMonday = () => dayKey(mondayOf(new Date()));
  const phone = window.matchMedia('(max-width: 760px)');
  const S = { week: thisMonday(), data: null, edit: false, cells: new Map(), done: new Set(), mday: (new Date().getDay() + 6) % 7 };
  let toastTimer = null;

  async function api(path, method, body) {
    const res = await fetch('api/v1/routine' + path, { method: method || 'GET', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
    let data = null; try { data = await res.json(); } catch (e) { /* no body */ }
    if (!res.ok) throw new Error(data && typeof data.detail === 'string' ? data.detail : 'Erro ' + res.status);
    return data;
  }
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }


  // consecutive blocks with the same text read as one tall block (and are ticked together); the text sits in its middle block
  const textAt = (wd, i) => { const s = S.data.slots; const c = i >= 0 && i < s.length ? S.cells.get(wd + '|' + s[i]) : null; return c ? c.text : null; };
  const runOf = (wd, i) => { const t = textAt(wd, i); let a = i, z = i; while (textAt(wd, a - 1) === t) a -= 1; while (textAt(wd, z + 1) === t) z += 1; return { start: a, end: z, idx: i - a, len: z - a + 1 }; };

  function index(data) {
    S.data = data;
    S.cells = new Map(data.cells.map((c) => [c.weekday + '|' + c.slot, c]));
    S.done = new Set(data.done.map((d) => d.day + '|' + d.slot));
  }
  async function load() { index(await api('/week/' + S.week)); render(); }

  const slotNow = () => { const n = new Date(); const m = n.getHours() * 60 + n.getMinutes(); const s = Math.floor(m / 30) * 30; return pad(Math.floor(s / 60)) + ':' + pad(s % 60); };

  function render() {
    const monday = parseDay(S.week), today = dayKey(new Date()), isThis = S.week === thisMonday();
    const end = addDays(monday, 6);
    $('rtSub').textContent = (isThis ? 'Esta semana' : 'Semana') + ' · ' + monday.getDate() + ' de ' + MONTHS[monday.getMonth()] + ' – ' + end.getDate() + ' de ' + MONTHS[end.getMonth()];
    $('rtToday').hidden = isThis;
    $('rtEdit').textContent = S.edit ? 'Pronto' : 'Editar rotina'; $('rtEdit').setAttribute('aria-pressed', String(S.edit));
    const grid = $('rtGrid'); grid.classList.toggle('editing', S.edit); grid.classList.toggle('rt-m', phone.matches); grid.replaceChildren();
    if (phone.matches) { renderPhone(grid, monday, today, isThis); return; }

    grid.appendChild(make('div', 'rt-corner'));
    for (let wd = 0; wd < 7; wd++) {
      const d = addDays(monday, wd), k = dayKey(d);
      const h = make('div', 'rt-dh' + (k === today ? ' today' : '')); h.setAttribute('role', 'columnheader');
      h.append(make('span', '', DAYS[wd]), make('b', '', String(d.getDate())));
      grid.appendChild(h);
    }
    const nowSlot = slotNow();
    let total = 0, done = 0;
    const slots = S.data.slots;
    slots.forEach((slot, i) => {
      const full = slot.endsWith(':00');
      grid.appendChild(make('div', 'rt-time' + (full ? ' hour' : '') + (isThis && slot === nowSlot ? ' now' : ''), slot));
      for (let wd = 0; wd < 7; wd++) {
        const k = dayKey(addDays(monday, wd)), cell = S.cells.get(wd + '|' + slot);
        const isDone = !!cell && S.done.has(k + '|' + slot);
        const run = cell ? runOf(wd, i) : null;
        const b = make('button', 'rt-cell' + (cell ? ' filled' : '') + (isDone ? ' done' : '') + (cell && cell.scope === 'week' ? ' once' : '') + (isThis && k === today && slot === nowSlot ? ' now' : '')
          + (run && run.idx > 0 ? ' up' : '') + (run && run.idx < run.len - 1 ? ' down' : ''));
        b.type = 'button'; b.dataset.wd = String(wd); b.dataset.slot = slot; b.dataset.day = k;
        if (cell) {
          total += 1; if (isDone) done += 1;
          if (run.idx === Math.floor((run.len - 1) / 2)) b.textContent = cell.text; else b.classList.add('quiet');
          b.title = slot + ' · ' + cell.text + (isDone ? ' · feito' : '');
          b.setAttribute('aria-label', cell.text + ', ' + slot + (isDone ? ', feito' : ''));
          b.setAttribute('aria-pressed', String(isDone));
        } else { b.setAttribute('aria-label', DAYS[wd] + ' ' + slot + ' vazio'); if (!S.edit) b.disabled = true; }
        grid.appendChild(b);
      }
    });

    const p = $('rtProgress'); p.replaceChildren();
    $('rtEmpty').hidden = total > 0 || S.edit;
    if (total) {
      const bar = make('div', 'rt-bar'); const fill = make('i'); fill.style.width = (done / total * 100) + '%'; bar.appendChild(fill);
      p.append(bar, make('span', '', done + ' de ' + total + ' feitos nesta semana'));
    }
  }


  // ---- the phone view: one day at a time, as an agenda instead of a seven-column table ---------------------------------------------------------------
  const addMinutes = (slot, n) => { const [h, m] = slot.split(':').map(Number); const t = h * 60 + m + n; return pad(Math.floor(t / 60)) + ':' + pad(t % 60); };
  function renderPhone(grid, monday, today, isThis) {
    const tabs = make('div', 'rt-dtabs'); tabs.setAttribute('role', 'tablist');
    let weekTotal = 0, weekDone = 0;
    for (let wd = 0; wd < 7; wd++) {
      const k = dayKey(addDays(monday, wd));
      S.data.slots.forEach((slot) => { if (S.cells.has(wd + '|' + slot)) { weekTotal += 1; if (S.done.has(k + '|' + slot)) weekDone += 1; } });
      const t = make('button', 'rt-dtab' + (k === today ? ' today' : '')); t.type = 'button'; t.setAttribute('role', 'tab'); t.setAttribute('aria-selected', String(wd === S.mday));
      t.append(make('span', '', DAYS[wd]), make('b', '', String(addDays(monday, wd).getDate())));
      t.addEventListener('click', () => { S.mday = wd; render(); });
      tabs.appendChild(t);
    }
    grid.appendChild(tabs);

    const wd = S.mday, k = dayKey(addDays(monday, wd)), slots = S.data.slots, nowSlot = slotNow();
    const list = make('div', 'rt-agenda');
    let i = 0, any = false;
    while (i < slots.length) {
      const slot = slots[i], cell = S.cells.get(wd + '|' + slot);
      if (!cell) {
        if (S.edit) { const row = make('div', 'rt-ai'); const b = make('button', 'rt-cell empty'); b.type = 'button'; b.dataset.wd = String(wd); b.dataset.slot = slot; b.dataset.day = k; b.textContent = '+'; b.setAttribute('aria-label', slot + ' vazio, adicionar'); row.append(make('span', 'rt-ait', slot), b); list.appendChild(row); }
        i += 1; continue;
      }
      // a run of neighbouring blocks with the same text is one item
      const run = runOf(wd, i), last = slots[run.end], keys = slots.slice(run.start, run.end + 1);
      const doneCount = keys.filter((s) => S.done.has(k + '|' + s)).length, isDone = doneCount === keys.length;
      any = true;
      const row = make('div', 'rt-ai');
      row.append(make('span', 'rt-ait', slot), (() => {
        const b = make('button', 'rt-cell filled' + (isDone ? ' done' : doneCount ? ' part' : '') + (cell.scope === 'week' ? ' once' : '') + (isThis && k === today && nowSlot >= slot && nowSlot <= last ? ' now' : ''));
        b.type = 'button'; b.dataset.wd = String(wd); b.dataset.slot = slot; b.dataset.day = k; b.style.setProperty('--n', String(Math.min(run.len, 6)));
        b.append(make('span', 'rt-aname', cell.text), make('small', '', slot + ' – ' + addMinutes(last, 30) + (keys.length > 1 ? ' · ' + keys.length * 30 + ' min' : '')));
        b.setAttribute('aria-label', cell.text + ', ' + slot + ' às ' + addMinutes(last, 30) + (isDone ? ', feito' : ''));
        b.setAttribute('aria-pressed', String(isDone));
        return b;
      })());
      list.appendChild(row);
      i = run.end + 1;
    }
    if (!any && !S.edit) list.appendChild(make('p', 'rt-none', 'Nada planejado para este dia.'));
    grid.appendChild(list);

    const p = $('rtProgress'); p.replaceChildren();
    $('rtEmpty').hidden = weekTotal > 0 || S.edit;
    if (weekTotal) {
      const bar = make('div', 'rt-bar'); const fill = make('i'); fill.style.width = (weekDone / weekTotal * 100) + '%'; bar.appendChild(fill);
      p.append(bar, make('span', '', weekDone + ' de ' + weekTotal + ' feitos nesta semana'));
    }
  }

  // ---- ticking and editing ---------------------------------------------------------------------------------------------------------------------------
  $('rtGrid').addEventListener('click', async (e) => {
    const b = e.target.closest('.rt-cell'); if (!b) return;
    const wd = +b.dataset.wd, slot = b.dataset.slot, day = b.dataset.day;
    if (S.edit) { openDialog(wd, slot); return; }
    // ticking one block ticks the whole joined block: if every block of it is done they are all cleared, otherwise they are all marked
    const run = runOf(wd, S.data.slots.indexOf(slot));
    const keys = []; for (let i = run.start; i <= run.end; i++) keys.push(S.data.slots[i]);
    const done = !keys.every((s) => S.done.has(day + '|' + s));
    const changed = keys.filter((s) => S.done.has(day + '|' + s) !== done);
    changed.forEach((s) => { if (done) S.done.add(day + '|' + s); else S.done.delete(day + '|' + s); });
    render();
    try { await Promise.all(changed.map((s) => api('/tick', 'PUT', { day, slot: s, done }))); }
    catch (err) { changed.forEach((s) => { if (done) S.done.delete(day + '|' + s); else S.done.add(day + '|' + s); }); render(); toast(err.message); }
  });

  const dlg = $('rtDialog');
  let editing = null, picked = new Set();
  function drawDays() {
    const box = $('rtDays'); box.replaceChildren();
    DAYS.forEach((name, wd) => {
      const b = make('button', 'rt-day', name); b.type = 'button'; b.setAttribute('aria-pressed', String(picked.has(wd)));
      b.addEventListener('click', () => { if (picked.has(wd)) picked.delete(wd); else picked.add(wd); drawDays(); });
      box.appendChild(b);
    });
  }
  function openDialog(wd, slot) {
    editing = { wd, slot }; picked = new Set([wd]);
    const cell = S.cells.get(wd + '|' + slot);
    $('rtTitle').textContent = DAYS[wd] + ' · ' + slot;
    $('rtText').value = cell ? cell.text : '';
    const to = $('rtTo'); to.replaceChildren();
    S.data.slots.filter((s) => s >= slot).forEach((s) => { const o = make('option', '', s); o.value = s; to.appendChild(o); });
    to.value = slot;
    dlg.querySelector('input[name="rtScope"][value="every"]').checked = true;
    $('rtClear').hidden = !cell; $('rtErr').hidden = true; drawDays();
    dlg.showModal(); $('rtText').focus(); $('rtText').select();
  }
  async function save(text) {
    if (!picked.size) { $('rtErr').textContent = 'Escolha pelo menos um dia.'; $('rtErr').hidden = false; return; }
    const scope = dlg.querySelector('input[name="rtScope"]:checked').value;
    $('rtSave').disabled = true;
    try {
      index(await api('/cell', 'PUT', { weekdays: [...picked], slot: editing.slot, to_slot: $('rtTo').value, text, scope, week_start: S.week }));
      dlg.close(); render(); toast(text ? 'Rotina atualizada' : 'Bloco limpo');
    } catch (err) { $('rtErr').textContent = err.message; $('rtErr').hidden = false; }
    finally { $('rtSave').disabled = false; }
  }
  $('rtForm').addEventListener('submit', (e) => { e.preventDefault(); save($('rtText').value.trim()); });
  $('rtClear').addEventListener('click', () => save(''));
  $('rtCancel').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });

  // ---- week navigation -------------------------------------------------------------------------------------------------------------------------------
  const go = (n) => { S.week = dayKey(addDays(parseDay(S.week), n * 7)); load().catch((e) => toast(e.message)); };
  $('rtPrev').addEventListener('click', () => go(-1));
  $('rtNext').addEventListener('click', () => go(1));
  $('rtToday').addEventListener('click', () => { S.week = thisMonday(); load().catch((e) => toast(e.message)); });
  $('rtEdit').addEventListener('click', () => { S.edit = !S.edit; render(); });

  phone.addEventListener('change', () => { if (S.data) render(); });
  load().catch(() => { $('rtSub').textContent = 'Não foi possível carregar a rotina agora.'; });
})();
