// Cleaning page: a schedule of cleaning and organising routines (/v1/cleaning). Each occurrence is also a todo, tagged "cleaning".
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const make = (tag, cls, text) => { const el = document.createElement(tag); if (cls) el.className = cls; if (text != null) el.textContent = text; return el; };
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parse = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const mondayOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const DOW = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  const DOW_FULL = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo'];
  const short = (d) => d.toLocaleDateString('pt-BR', { month: 'short', day: 'numeric' });
  const ordinal = (n) => 'dia ' + n;

  const S = { week: mondayOf(new Date()), data: null, editing: null, wd: new Set() };
  const todayKey = () => iso(new Date());

  async function api(path, method, body) {
    const init = { method: method || 'GET', headers: {} };
    if (body) { init.body = JSON.stringify(body); init.headers['Content-Type'] = 'application/json'; }
    const res = await fetch('api/v1/cleaning' + path, init);
    if (!res.ok) {
      let detail = ''; try { const j = await res.json(); if (typeof j.detail === 'string') detail = j.detail; } catch (e) { /* not json */ }
      throw new Error(detail || 'Algo deu errado (' + res.status + ').');
    }
    return res.status === 204 ? null : res.json();
  }
  let toastTimer;
  function toast(text) { const el = $('toast'); el.textContent = text; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 3200); }

  function scheduleText(t) {
    if (t.kind === 'daily') return 'Todo dia';
    if (t.kind === 'weekly') {
      const n = t.weekdays.length;
      const names = t.weekdays.map((w) => (n > 2 ? DOW[w] : DOW_FULL[w])).join(' & ');
      return (n === 7 ? 'Todo dia' : n === 1 ? 'Uma vez por semana · ' : n === 2 ? 'Duas vezes por semana · ' : n + ' vezes por semana · ') + (n === 7 ? '' : names);
    }
    if (t.kind === 'monthly') {
      const n = t.month_days.length;
      return (n === 1 ? 'Uma vez por mês · ' : n === 2 ? 'Duas vezes por mês · ' : n + ' vezes por mês · ') + t.month_days.map(ordinal).join(' & ');
    }
    return 'Uma vez · ' + parse(t.on_date).toLocaleDateString('pt-BR', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  async function load() {
    S.data = await api('/overview?start=' + iso(S.week) + '&days=7');
    render();
  }

  function render() {
    const d = S.data, today = todayKey();
    const end = addDays(S.week, 6);
    const thisWeek = iso(S.week) === iso(mondayOf(new Date()));
    $('clRange').textContent = thisWeek ? 'Esta semana' : short(S.week) + ' – ' + short(end);
    $('clJump').hidden = thisWeek;
    // tiles
    const all = d.days.flatMap((x) => x.items), done = all.filter((i) => i.done);
    const day = d.days.find((x) => x.day === today);
    $('clToday').textContent = day ? day.items.filter((i) => i.done).length + '/' + day.items.length : '–';
    $('clTodayN').textContent = day ? (day.items.length && day.items.every((i) => i.done) ? 'Tudo feito' : day.items.length ? 'faltam ' + (day.items.length - day.items.filter((i) => i.done).length) : 'Nada hoje') : 'Fora desta semana';
    $('clWeek').textContent = done.length + '/' + all.length;
    $('clWeekN').textContent = all.length ? Math.round((done.length / all.length) * 100) + '% feito' : 'Nada agendado';
    const upcoming = d.days.filter((x) => x.day >= today).flatMap((x) => x.items.filter((i) => !i.done).map((i) => ({ ...i, day: x.day })))[0];
    $('clNext').textContent = upcoming ? upcoming.name : (all.length ? 'Tudo feito' : '–');
    $('clNextD').textContent = upcoming ? (upcoming.area ? upcoming.area + ' · ' : '') + (upcoming.day === today ? 'hoje' : short(parse(upcoming.day))) : '';
    $('clCount').textContent = String(d.tasks.length);
    $('clCountN').textContent = d.tasks.length === 1 ? 'rotina' : 'rotinas';

    // day cards
    const wrap = $('clDays'); wrap.replaceChildren();
    d.days.forEach((x, i) => {
      const date = parse(x.day), isNow = x.day === today, past = x.day < today;
      const card = make('section', 'cl-day' + (i % 2 ? ' egg' : '') + (isNow ? ' now' : '') + (past ? ' past' : ''));
      card.setAttribute('aria-label', DOW_FULL[i]);
      const head = make('div', 'cl-dh');
      const h = make('h3', '', DOW[i]); h.appendChild(make('small', '', short(date)));
      if (isNow) h.appendChild(make('span', 'cl-now', 'Hoje'));
      head.append(h, make('span', '', x.items.length ? x.items.filter((it) => it.done).length + '/' + x.items.length : ''));
      card.appendChild(head);
      if (!x.items.length) card.appendChild(make('p', 'cl-empty', 'Nada agendado.'));
      const ul = make('ul', 'cl-list');
      x.items.forEach((it) => ul.appendChild(row(it, x.day)));
      card.appendChild(ul);
      wrap.appendChild(card);
    });

    // routines
    $('clEmpty').hidden = d.tasks.length > 0;
    const rl = $('clRoutines'); rl.replaceChildren();
    d.tasks.forEach((t) => {
      const li = make('li', 'cl-ritem');
      const box = make('div'); box.appendChild(make('b', '', (t.area ? t.area + ': ' : '') + t.name)); box.appendChild(make('span', '', scheduleText(t)));
      const b = make('button', '', 'Editar'); b.type = 'button'; b.onclick = () => openDialog(t);
      li.append(box, b); rl.appendChild(li);
    });
    const areas = $('clAreas'); areas.replaceChildren();
    [...new Set(d.tasks.map((t) => t.area).filter(Boolean))].forEach((a) => { const o = make('option'); o.value = a; areas.appendChild(o); });
  }

  function row(it, day) {
    const li = make('li', 'cl-row' + (it.done ? ' done' : ''));
    const cb = make('input', 'cl-check'); cb.type = 'checkbox'; cb.checked = it.done; cb.setAttribute('aria-label', 'Done: ' + it.name);
    cb.onchange = () => setDone(it, day, cb.checked);
    const what = make('div', 'cl-what'); what.appendChild(make('b', '', it.name));
    if (it.area) what.appendChild(make('span', '', it.area));
    li.append(cb, what);
    return li;
  }

  async function setDone(it, day, done) {
    const was = it.done; it.done = done; render();
    try { await api('/tasks/' + it.task_id + '/days/' + day, 'PUT', { done, done_day: todayKey() }); }
    catch (e) { it.done = was; render(); toast(e.message); }
  }

  // add / edit dialog
  const dlg = $('clDialog');
  const syncKind = () => { const k = $('clKind').value; $('clWeekWrap').hidden = k !== 'weekly'; $('clMonthWrap').hidden = k !== 'monthly'; $('clOnceWrap').hidden = k !== 'once'; };
  function drawWeekdays() {
    const box = $('clWd'); box.replaceChildren();
    DOW.forEach((n, i) => {
      const b = make('button', '', n[0]); b.type = 'button'; b.title = DOW_FULL[i]; b.setAttribute('aria-label', DOW_FULL[i]); b.setAttribute('aria-pressed', String(S.wd.has(i)));
      b.onclick = () => { if (S.wd.has(i)) S.wd.delete(i); else S.wd.add(i); b.setAttribute('aria-pressed', String(S.wd.has(i))); };
      box.appendChild(b);
    });
  }
  function openDialog(t) {
    S.editing = t || null;
    $('clDlgTitle').textContent = t ? 'Editar rotina' : 'Adicionar rotina';
    $('clName').value = t ? t.name : ''; $('clArea').value = t ? t.area : ''; $('clKind').value = t ? t.kind : 'daily';
    S.wd = new Set(t ? t.weekdays : []); drawWeekdays();
    $('clMonthDays').value = t ? t.month_days.join(', ') : ''; $('clOn').value = t && t.on_date ? t.on_date : todayKey();
    syncKind(); $('clErr').hidden = true; $('clDelete').hidden = !t;
    dlg.showModal(); $('clName').focus();
  }
  const closeDialog = () => { if (dlg.open) dlg.close(); };
  $('clKind').onchange = syncKind;
  $('clAdd').onclick = () => openDialog(null);
  $('clClose').onclick = closeDialog;
  dlg.addEventListener('click', (e) => { if (e.target === dlg) closeDialog(); });
  $('clForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fail = (m) => { $('clErr').textContent = m; $('clErr').hidden = false; };
    const name = $('clName').value.trim(), area = $('clArea').value.trim(), kind = $('clKind').value;
    if (!name) return fail('Diga o que limpar ou organizar.');
    const body = { name, area, kind, weekdays: [], month_days: [], on_date: null };
    if (kind === 'weekly') { body.weekdays = [...S.wd].sort(); if (!body.weekdays.length) return fail('Escolha pelo menos um dia da semana.'); }
    if (kind === 'monthly') {
      const days = $('clMonthDays').value.split(/[^\d]+/).filter(Boolean).map(Number);
      if (!days.length || days.some((n) => n < 1 || n > 31)) return fail('Digite os dias do mês, como 1, 15.');
      body.month_days = [...new Set(days)].sort((a, b) => a - b);
    }
    if (kind === 'once') { body.on_date = $('clOn').value; if (!body.on_date) return fail('Escolha a data.'); }
    try {
      if (S.editing) await api('/tasks/' + S.editing.id, 'PATCH', body); else await api('/tasks', 'POST', body);
      const wasEditing = !!S.editing; closeDialog(); await load(); toast(wasEditing ? 'Salvo. Sua lista de tarefas foi atualizada.' : 'Rotina adicionada à sua lista de tarefas.');
    } catch (err) { fail(err.message); }
  });
  $('clDelete').onclick = async () => {
    if (!S.editing || !(await IgnisConfirm.ask({ title: 'Apagar rotina', text: 'Apagar "' + S.editing.name + '"? As tarefas em aberto são removidas; as concluídas ficam.' }))) return;
    try { await api('/tasks/' + S.editing.id, 'DELETE'); closeDialog(); await load(); toast('Routine deleted.'); } catch (err) { toast(err.message); }
  };

  // week navigation
  const fail = () => { $('clEmpty').hidden = false; $('clEmpty').textContent = 'Não foi possível carregar suas rotinas agora.'; };
  const go = (d) => { S.week = d; load().catch(fail); };
  $('clPrev').onclick = () => go(addDays(S.week, -7));
  $('clNextW').onclick = () => go(addDays(S.week, 7));
  $('clJump').onclick = () => go(mondayOf(new Date()));

  load().catch(fail);
})();
