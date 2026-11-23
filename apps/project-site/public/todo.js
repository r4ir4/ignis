// Todo page. Stored on the Ignis server (/v1/todos).
// A task's day is its DUE date, not the day it gets done. Today lists every open task (overdue ones are marked late),
// a future day lists what is due then, and a completed task stays on the day it was completed.
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(2, '0');
  const dayKey = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parseDay = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (k, n) => { const d = parseDay(k); d.setDate(d.getDate() + n); return dayKey(d); };
  const make = (tag, cls, text) => { const el = document.createElement(tag); if (cls) el.className = cls; if (text != null) el.textContent = text; return el; };
  const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.500 4.500 4.500L19 7.500"/></svg>';
  const COLORS = ['#ffb199', '#a9c8ff', '#b9e4c9', '#ffe08a', '#d9c2ff', '#ffc2dc'];
  const TAG = /(^|\s)#([\p{L}\p{N}_-]+)/gu;

  const S = { todos: [], cats: [], today: dayKey(new Date()), day: dayKey(new Date()), cat: 'all', editing: null,  };

  async function api(path, method, body) {
    const init = { method: method || 'GET', headers: {} };
    if (body) { init.body = JSON.stringify(body); init.headers['Content-Type'] = 'application/json'; }
    const res = await fetch('api/v1/todos' + path, init);
    if (!res.ok) {
      let detail = ''; try { const j = await res.json(); if (typeof j.detail === 'string') detail = j.detail; } catch (e) { /* not json */ }
      throw new Error(detail || 'Algo deu errado (' + res.status + ').');
    }
    return res.status === 204 ? null : res.json();
  }
  async function load() { const d = await api(''); S.todos = d.todos; S.cats = d.categories; }
  // ---- notifications: a card that slides up, with an icon, a countdown line and an optional Undo ----
  const ICONS = {
    ok: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5.500 12.500 4.200 4.200L18.500 8"/></svg>',
    del: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M7.500 7l.8 11.500h7.400L16.500 7"/></svg>',
    err: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7v6M12 16.800v.2"/></svg>',
  };
  function toast(text, o) {
    o = o || {};
    const kind = o.kind || 'ok';
    const box = $('tdToasts');
    while (box.children.length >= 3) box.firstElementChild.remove();
    const el = make('div', 'td-toast ' + kind); el.setAttribute('role', kind === 'err' ? 'alert' : 'status');
    const ico = make('span', 'td-toast-ico'); ico.innerHTML = ICONS[kind] || ICONS.ok;
    const msg = make('p', 'td-toast-msg', text);
    el.append(ico, msg);
    const ms = o.undo ? 7000 : kind === 'err' ? 6000 : 3500;
    let timer, left = ms, started = 0;
    const close = () => { clearTimeout(timer); if (!el.isConnected || el.classList.contains('out')) return; el.classList.add('out'); setTimeout(() => el.remove(), 260); };
    if (o.undo) {
      const u = make('button', 'td-toast-act', 'Desfazer'); u.type = 'button';
      u.onclick = async () => { close(); try { await o.undo(); await load(); render(); toast('Restaurada.'); } catch (e) { toast(e.message, { kind: 'err' }); } };
      el.appendChild(u);
    }
    const x = make('button', 'td-toast-x'); x.type = 'button'; x.setAttribute('aria-label', 'Dismiss');
    x.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg>'; x.onclick = close; el.appendChild(x);
    const bar = make('i', 'td-toast-bar'); bar.style.animationDuration = ms + 'ms'; el.appendChild(bar);
    // hovering pauses the countdown
    const start = () => { started = performance.now(); timer = setTimeout(close, left); bar.style.animationPlayState = 'running'; };
    el.addEventListener('pointerenter', () => { clearTimeout(timer); left -= performance.now() - started; bar.style.animationPlayState = 'paused'; });
    el.addEventListener('pointerleave', start);
    box.appendChild(el); start();
    return el;
  }
  // `done` is a message, or { text, kind, undo }
  async function run(fn, done) {
    try { await fn(); await load(); render(); if (done) { const d = typeof done === 'string' ? { text: done } : done; toast(d.text, d); } return true; }
    catch (e) { toast(e.message, { kind: 'err' }); return false; }
  }

  // ---- which day a task shows on ----
  // Today shows every open task; a future day shows what is due that day; a past day shows what was finished then.
  // Cleaning tasks never roll over: each day has its own routine, so a missed one stays on its own day.
  const missedCleaning = (t) => !t.done && t.category === 'cleaning' && t.day < S.today;
  const onDay = (t, D) => (t.done ? t.done_day === D : missedCleaning(t) ? t.day === D : D === S.today || (D > S.today && t.day === D));
  const isLate = (t) => !t.done && t.day < S.today && t.category !== 'cleaning';
  const colorOf = (cat) => { let h = 0; for (const ch of cat) h = (h * 31 + ch.codePointAt(0)) >>> 0; return COLORS[h % COLORS.length]; };
  const dayLabel = (k, opts) => parseDay(k).toLocaleDateString('pt-BR', opts);

  function relName(k) {
    if (k === S.today) return 'Hoje';
    if (k === addDays(S.today, -1)) return 'Ontem';
    if (k === addDays(S.today, 1)) return 'Amanhã';
    return dayLabel(k, { weekday: 'long' });
  }

  // ---- the day summary card: count-up number, progress ring, one dot per task ----
  const REDUCED = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const RING = 2 * Math.PI * 18;
  const stat = { day: '', n: 0, total: -1, raf: 0 };
  function countTo(el, from, to) {
    cancelAnimationFrame(stat.raf);
    if (REDUCED || from === to) { el.textContent = String(to); return; }
    const t0 = performance.now(), dur = 650;
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = String(Math.round(from + (to - from) * e));
      if (p < 1) stat.raf = requestAnimationFrame(step);
    };
    stat.raf = requestAnimationFrame(step);
  }
  function renderStat(D, open, done, late) {
    const past = D < S.today, future = D > S.today, total = open + done;
    const shown = past ? done : open;
    $('tdStatK').textContent = relName(D);
    $('tdStatU').textContent = past ? (done === 1 ? 'tarefa concluída' : 'tarefas concluídas') : future ? (open === 1 ? 'tarefa prevista' : 'tarefas previstas') : total === 0 ? 'nada a fazer' : (open === 1 ? 'tarefa restante' : 'tarefas restantes');
    $('tdStatS').textContent = past ? (done ? 'Concluídas neste dia.' : 'Nada foi concluído.')
      : future ? (open ? 'Previstas para este dia.' : 'Nada previsto.')
      : total === 0 ? 'Dia livre.' : open === 0 ? 'Tudo feito. Muito bem.' : done + ' de ' + total + ' concluídas' + (late ? ' · ' + late + ' atrasadas' : '');
    const pct = past ? (done ? 1 : 0) : total ? done / total : 0;
    $('tdRing').style.strokeDasharray = String(RING);
    $('tdRing').style.strokeDashoffset = String(RING * (1 - pct));
    $('tdPct').textContent = Math.round(pct * 100) + '%';
    // number: count up from what was shown before (from zero when the day changes)
    const dayChanged = stat.day !== D;
    countTo($('tdStatN'), dayChanged ? 0 : stat.n, shown);
    // dots: filled ones first. Rebuild with a staggered pop on a new day or a new count; otherwise just recolour.
    const dots = $('tdDots'), cap = 30, count = Math.min(total, cap);
    if (dayChanged || stat.total !== total || dots.children.length !== count) {
      dots.replaceChildren();
      for (let i = 0; i < count; i++) { const d = make('i', 'td-dot'); d.style.setProperty('--i', i); dots.appendChild(d); }
      if (total > cap) dots.appendChild(make('em', 'td-dots-more', '+' + (total - cap)));
    }
    [...dots.querySelectorAll('.td-dot')].forEach((d, i) => d.classList.toggle('on', i < done));
    if (dayChanged || stat.total !== total) { dots.classList.remove('pop'); void dots.offsetWidth; dots.classList.add('pop'); }
    stat.day = D; stat.n = shown; stat.total = total;
  }

  function render() {
    const T = S.today, D = S.day;
    const dayTasks = S.todos.filter((t) => onDay(t, D));
    const open = dayTasks.filter((t) => !t.done), done = dayTasks.filter((t) => t.done);

    renderStat(D, open.length, done.length, open.filter(isLate).length);
    $('tdTitle').textContent = relName(D);
    $('tdSub').textContent = dayLabel(D, { weekday: 'long', day: 'numeric', month: 'long', year: D.slice(0, 4) === T.slice(0, 4) ? undefined : 'numeric' })
      + (open.length ? ' · ' + open.length + (open.length === 1 ? ' tarefa' : ' tarefas') : '');
    $('tdToday').hidden = D === T;
    document.title = (open.length ? '(' + open.length + ') ' : '') + 'Tarefas · Ignis';

    // categories column: every category in use, with how many tasks it has on this day
    const byCat = {}; dayTasks.forEach((t) => { if (t.category) byCat[t.category] = (byCat[t.category] || 0) + 1; });
    const cats = [...new Set([...S.cats, ...Object.keys(byCat)])].sort();
    if (S.cat !== 'all' && !cats.includes(S.cat)) S.cat = 'all';
    const nav = $('tdCats'); nav.replaceChildren(); $('tdCatsBox').hidden = cats.length < 1;
    [['all', 'Todas', dayTasks.length], ...cats.map((c) => [c, '#' + c, byCat[c] || 0])].forEach(([c, label, n]) => {
      const b = make('button', n ? '' : 'none'); b.type = 'button'; b.setAttribute('aria-pressed', String(S.cat === c));
      b.append(make('span', '', label), make('b', '', String(n)));
      b.onclick = () => { S.cat = c; render(); };
      if (c === 'all') { nav.appendChild(b); return; }
      // every real category gets a small x that takes it off all its tasks (the tasks stay)
      const row = make('div', 'td-catrow'); row.appendChild(b);
      const x = make('button', 'td-catx'); x.type = 'button'; x.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg>';
      x.setAttribute('aria-label', 'Remover categoria #' + c); x.title = 'Remover categoria';
      x.onclick = () => removeCategory(c); row.appendChild(x); nav.appendChild(row);
    });

    const keep = (t) => S.cat === 'all' || t.category === S.cat;
    const shownOpen = open.filter(keep), shownDone = done.filter(keep);
    const empty = $('tdEmpty');
    empty.hidden = shownOpen.length + shownDone.length > 0;
    $('tdEmptyText').textContent = D < T ? 'Nada foi concluído neste dia.' : D === T ? 'Nada pendente hoje.' : 'Nada previsto para este dia.';
    $('tdAdd').hidden = D < T;

    const row = (t) => {
      const li = make('li', 'td-row' + (t.done ? ' done' : ''));
      const check = make('button', 'td-check'); check.type = 'button'; check.innerHTML = CHECK;
      check.setAttribute('role', 'checkbox'); check.setAttribute('aria-checked', String(t.done)); check.setAttribute('aria-label', (t.done ? 'Mark not done: ' : 'Mark done: ') + t.title);
      check.onclick = () => toggle(t);
      const body = make('button', 'td-body'); body.type = 'button'; body.onclick = () => openDialog(t); body.title = 'Edit';
      body.appendChild(make('span', 'td-text', t.title));
      const meta = [];
      const dueText = dayLabel(t.day, { weekday: 'short', day: 'numeric', month: 'short' });
      if (isLate(t)) meta.push(make('span', 'td-carry', 'Atrasada · para ' + dueText));
      else if (missedCleaning(t)) meta.push(make('span', 'td-carry', 'Perdida'));
      else if (!t.done && t.day > T && D === T) meta.push(make('span', '', 'Para ' + dueText));
      else if (t.done && t.day !== t.done_day) meta.push(make('span', '', 'Para ' + dayLabel(t.day, { day: 'numeric', month: 'short' })));
      if (meta.length) { const m = make('span', 'td-meta'); meta.forEach((x) => m.appendChild(x)); body.appendChild(m); }
      li.append(check, body);
      if (t.category === 'cleaning') { const tag = make('span', 'td-tag cleaning'); tag.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15.5 3.5 11 12"/><path d="M8 11.5l5.5 2.5 2.5 6.5H5.5c.5-3 1.2-6 2.500-9Z"/></svg><span>cleaning</span>'; li.appendChild(tag); }
      else if (t.category) li.appendChild(make('span', 'td-tag', '#' + t.category));
      return li;
    };
    // open tasks first, finished ones at the bottom of the same list
    const list = $('tdList'); list.replaceChildren();
    [...shownOpen, ...shownDone].forEach((t) => list.appendChild(row(t)));
  }

  function removeCategory(c) {
    const ids = S.todos.filter((t) => t.category === c).map((t) => t.id);
    if (S.cat === c) S.cat = 'all';
    run(() => api('/categories/' + encodeURIComponent(c), 'DELETE'), {
      text: 'Categoria #' + c + ' removida' + (ids.length ? ' de ' + ids.length + (ids.length === 1 ? ' tarefa' : ' tarefas') : ''), kind: 'del',
      undo: () => Promise.all(ids.map((id) => api('/' + id, 'PATCH', { category: c }))),
    });
  }

  function select(k) { S.day = k; S.cat = 'all'; render(); }

  // ---- complete / reopen ----
  async function toggle(t) {
    const prev = { done: t.done, done_day: t.done_day };
    t.done = !t.done; t.done_day = t.done ? S.today : null; render();
    try {
      await api('/' + t.id, 'PATCH', t.done ? { done: true, done_day: S.today } : { done: false });
      if (t.done && S.day !== S.today) toast('Pronto. Ela está nas concluídas de hoje.');
    } catch (e) { Object.assign(t, prev); render(); toast(e.message, { kind: 'err' }); }
  }

  // ---- dialog ----
  const dlg = $('tdDialog');
  let catTouched = false, catVal = '';   // catVal is the chosen category; the dashed box only shows a brand new one
  const setCat = (v) => { catVal = cleanCat(v || ''); $('tdCat').value = catVal && !S.cats.includes(catVal) ? catVal : ''; };
  const parseTitle = (raw) => {
    const tags = []; const title = raw.replace(TAG, (m, sp, tag) => { tags.push(tag); return sp; }).replace(/\s{2,}/g, ' ').trim();
    return { title, tag: tags.length ? tags[tags.length - 1] : '' };
  };
  const cleanCat = (v) => v.trim().replace(/^#+/, '').toLowerCase().replace(/\s+/g, '-');
  function drawChips() {
    const box = $('tdChips'); box.replaceChildren(); const cur = catVal;
    S.cats.slice(0, 12).forEach((c) => {
      const b = make('button', '', '#' + c); b.type = 'button'; b.setAttribute('aria-pressed', String(cur === c));
      b.onclick = () => { setCat(cur === c ? '' : c); catTouched = true; drawChips(); }; box.appendChild(b);
    });
  }
  // day picker: quick chips, plus "Pick a date" which slides open the site's month-grid calendar (Monday first, past days off)
  const cal = { month: new Date(), open: false };
  const QUICK = () => [['Hoje', S.today], ['Amanhã', addDays(S.today, 1)], ['Próxima semana', addDays(S.today, 7)]];
  function setCal(open) {
    cal.open = open; const w = $('tdCalWrap'); w.classList.toggle('open', open); w.inert = !open; drawDays();
  }
  function setDay(k) {
    $('tdDay').value = k; const d = parseDay(k); cal.month = new Date(d.getFullYear(), d.getMonth(), 1);
    drawDays(); renderCal();
  }
  function drawDays() {
    const box = $('tdDays'); box.replaceChildren(); const cur = $('tdDay').value, quick = QUICK();
    quick.forEach(([label, k]) => {
      const b = make('button', '', label); b.type = 'button'; b.setAttribute('aria-pressed', String(cur === k));
      b.onclick = () => { setDay(k); setCal(false); }; box.appendChild(b);
    });
    const custom = !quick.some(([, k]) => k === cur);
    const other = make('button', 'td-other', custom && cur ? dayLabel(cur, { day: 'numeric', month: 'short' }) : 'Escolher data');
    other.type = 'button'; other.setAttribute('aria-pressed', String(custom)); other.setAttribute('aria-expanded', String(cal.open)); other.setAttribute('aria-controls', 'tdCalWrap');
    other.onclick = () => setCal(!cal.open); box.appendChild(other);
  }
  function renderCal() {
    const m = cal.month, y = m.getFullYear(), mo = m.getMonth(), sel = $('tdDay').value;
    $('tdCalTitle').textContent = m.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    const lead = (new Date(y, mo, 1).getDay() + 6) % 7, total = new Date(y, mo + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push(make('span', 'td-pad'));
    for (let d = 1; d <= total; d++) {
      const date = new Date(y, mo, d), k = dayKey(date);
      const b = make('button', 'td-dayb' + (k === S.today ? ' today' : '') + (k === sel ? ' sel' : ''), String(d)); b.type = 'button';
      b.disabled = k < S.today && k !== sel;
      b.setAttribute('aria-pressed', String(k === sel));
      b.setAttribute('aria-label', date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }));
      b.onclick = () => { setDay(k); setTimeout(() => setCal(false), 160); }; cells.push(b);
    }
    $('tdCalGrid').replaceChildren(...cells);
    const today = parseDay(S.today); $('tdCalPrev').disabled = new Date(y, mo, 1) <= new Date(today.getFullYear(), today.getMonth(), 1);
  }
  $('tdCalPrev').onclick = () => { cal.month = new Date(cal.month.getFullYear(), cal.month.getMonth() - 1, 1); renderCal(); };
  $('tdCalNext').onclick = () => { cal.month = new Date(cal.month.getFullYear(), cal.month.getMonth() + 1, 1); renderCal(); };
  function openDialog(t) {
    S.editing = t || null; catTouched = !!(t && t.category);
    $('tdDlgTitle').textContent = t ? 'Editar tarefa' : 'Nova tarefa';
    $('tdText').value = t ? t.title : '';
    setCat(t ? t.category || '' : '');
    $('tdDayF').hidden = !!(t && t.done);
    $('tdDelete').hidden = !t; $('tdErr').hidden = true;
    drawChips(); setDay(t ? t.day : (S.day >= S.today ? S.day : S.today)); setCal(false); dlg.showModal(); $('tdText').focus();
  }
  $('tdAdd').onclick = () => openDialog(null);
  $('tdClose').onclick = () => dlg.close();
  $('tdText').addEventListener('input', () => { if (!catTouched) { setCat(parseTitle($('tdText').value).tag); drawChips(); } });
  $('tdCat').addEventListener('input', () => { catTouched = true; catVal = cleanCat($('tdCat').value); drawChips(); });
  $('tdForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const { title, tag } = parseTitle($('tdText').value);
    const typed = catVal;
    const category = catTouched && typed ? typed : tag ? tag.toLowerCase() : typed;
    const day = $('tdDay').value;
    const err = !title ? 'Escreva o que precisa ser feito.' : !day ? 'Escolha um dia.' : '';
    if (err) { $('tdErr').textContent = err; $('tdErr').hidden = false; return; }
    const editing = S.editing;
    const body = editing ? { title, category, ...(editing.done ? {} : { day }) } : { title, category, day };
    run(() => (editing ? api('/' + editing.id, 'PATCH', body) : api('', 'POST', body)), editing ? 'Tarefa salva' : 'Tarefa adicionada').then((ok) => {
      if (!ok) return; dlg.close();
      if (!editing) select(S.today);
    });
  });
  $('tdDelete').onclick = () => {
    const t = S.editing; if (!t) return;
    run(() => api('/' + t.id, 'DELETE'), {
      text: 'Tarefa apagada', kind: 'del',
      undo: async () => {   // put the same task back, finished again if it was
        const back = await api('', 'POST', { title: t.title, category: t.category || '', day: t.day });
        if (t.done) await api('/' + back.id, 'PATCH', { done: true, done_day: t.done_day });
      },
    }).then((ok) => { if (ok) dlg.close(); });
  };

  // ---- moving between days ----
  $('tdPrev').onclick = () => select(addDays(S.day, -1));
  $('tdNext').onclick = () => select(addDays(S.day, 1));
  $('tdToday').onclick = () => select(S.today);
  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open]')) return;
    const tag = (e.target.tagName || '').toLowerCase(); if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); select(addDays(S.day, -1)); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); select(addDays(S.day, 1)); }
  });

  // When midnight passes while the page is open, today moves on and unfinished tasks roll over.
  function checkMidnight() {
    const now = dayKey(new Date()); if (now === S.today) return;
    const wasToday = S.day === S.today; S.today = now; if (wasToday) S.day = now; render();
  }
  setInterval(checkMidnight, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { checkMidnight(); load().then(render).catch(() => {}); } });

  load().then(render).catch((e) => { render(); $('tdEmpty').textContent = 'Não foi possível carregar as tarefas: ' + e.message; $('tdEmpty').hidden = false; });
})();
