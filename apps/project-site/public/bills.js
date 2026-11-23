// Bills page: what you pay every month, grouped by week of the month, ticked off per month (/v1/bills).
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const make = (tag, cls, text) => { const el = document.createElement(tag); if (cls) el.className = cls; if (text != null) el.textContent = text; return el; };
  const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const money = (c) => fmt.format(c / 100);
  const pad = (n) => String(n).padStart(2, '0');
  const monthKey = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1);
  const daysIn = (key) => { const [y, m] = key.split('-').map(Number); return new Date(y, m, 0).getDate(); };
  // The spreadsheet's weeks: 1-8, 9-15, 16-22, 23-29, and a short fifth one for the 30th and 31st.
  const WEEKS = [[1, 8, 'Primeira semana'], [9, 15, 'Segunda semana'], [16, 22, 'Terceira semana'], [23, 29, 'Quarta semana'], [30, 31, 'Últimos dias']];

  const S = { month: monthKey(new Date()), bills: [], editing: null };

  async function api(path, method, body) {
    const init = { method: method || 'GET', headers: {} };
    if (body) { init.body = JSON.stringify(body); init.headers['Content-Type'] = 'application/json'; }
    const res = await fetch('api/v1/bills' + path, init);
    if (!res.ok) {
      let detail = ''; try { const j = await res.json(); if (typeof j.detail === 'string') detail = j.detail; } catch (e) { /* not json */ }
      throw new Error(detail || 'Algo deu errado (' + res.status + ').');
    }
    return res.status === 204 ? null : res.json();
  }
  let toastTimer;
  function toast(text) { const el = $('toast'); el.textContent = text; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 3200); }

  // "1.234,56" or "1234.56" -> cents; empty -> null; garbage -> undefined
  function parseCents(text) {
    const t = String(text).trim().replace(/[^\d.,]/g, '');
    if (!t) return null;
    let n = t;
    if (t.includes(',')) n = t.replace(/\./g, '').replace(',', '.');
    else if ((t.match(/\./g) || []).length > 1) n = t.replace(/\./g, '');
    const v = Number(n);
    return Number.isFinite(v) && v >= 0 ? Math.round(v * 100) : undefined;
  }
  const centsText = (c) => (c == null ? '' : (c / 100).toFixed(2).replace('.', ','));
  const amountOf = (b) => (b.month_amount_cents != null ? b.month_amount_cents : b.amount_cents);

  const monthLabel = (key) => { const [y, m] = key.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }); };
  const dueDate = (b) => { const [y, m] = S.month.split('-').map(Number); return new Date(y, m - 1, Math.min(b.due_day, daysIn(S.month))); };
  const dayLabel = (b) => dueDate(b).toLocaleDateString('pt-BR', { month: 'short', day: 'numeric' });
  const startOfToday = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };
  const dueState = (b) => { // 'late', 'today' or ''
    if (b.paid) return '';
    const d = dueDate(b), t = startOfToday();
    return d < t ? 'late' : d.getTime() === t.getTime() ? 'today' : '';
  };

  async function load() {
    const d = await api('/overview?month=' + S.month);
    S.bills = d.bills;
    render();
  }

  function renderSummary() {
    const sum = (list) => list.reduce((s, b) => s + (amountOf(b) || 0), 0);
    const paid = S.bills.filter((b) => b.paid), left = S.bills.filter((b) => !b.paid);
    const blank = (list) => list.filter((b) => amountOf(b) == null).length;
    const sub = (list) => list.length + (list.length === 1 ? ' conta' : ' contas') + (blank(list) ? ' · ' + blank(list) + ' sem valor' : '');
    $('blLeft').textContent = money(sum(left)); $('blLeftN').textContent = sub(left);
    $('blPaid').textContent = money(sum(paid)); $('blPaidN').textContent = sub(paid);
    $('blTotal').textContent = money(sum(S.bills)); $('blTotalN').textContent = sub(S.bills);
    const next = left.slice().sort((a, b) => a.due_day - b.due_day || a.name.localeCompare(b.name))[0];
    const upcoming = left.filter((b) => dueDate(b) >= startOfToday()).sort((a, b) => a.due_day - b.due_day)[0];
    const pick = upcoming || next;
    $('blNext').textContent = pick ? pick.name : (S.bills.length ? 'Tudo pago' : '–');
    $('blNextD').textContent = pick ? dayLabel(pick) + (dueState(pick) === 'late' ? ' · atrasada' : '') : (S.bills.length ? 'Muito bem' : '');
    $('blProgLabel').textContent = paid.length + ' de ' + S.bills.length + ' pagas';
    $('blProgFill').style.width = (S.bills.length ? (paid.length / S.bills.length) * 100 : 0) + '%';
  }

  function render() {
    $('blMonth').textContent = monthLabel(S.month);
    $('blToday').hidden = S.month === monthKey(new Date());
    $('blEmpty').hidden = S.bills.length > 0;
    renderSummary();
    const wrap = $('blWeeks'); wrap.replaceChildren();
    const t = new Date(), here = S.month === monthKey(t) ? t.getDate() : 0;
    const pastMonth = false; // earlier months stay in full colour so they are easy to review
    WEEKS.forEach(([from, to, name], wi) => {
      const list = S.bills.filter((b) => b.due_day >= from && b.due_day <= to);
      if (!list.length && wi === 4) return;
      const isNow = here >= from && here <= to;
      const past = pastMonth || (here > 0 && to < here);
      const card = make('section', 'bl-week' + (wi % 2 ? ' egg' : '') + (isNow ? ' now' : '') + (past ? ' past' : ''));
      card.setAttribute('aria-label', name);
      const head = make('div', 'bl-wh');
      const h = make('h3', '', name); h.appendChild(make('small', '', 'dia ' + from + (to > from ? '–' + to : '')));
      if (isNow) h.appendChild(make('span', 'bl-now', 'Hoje · ' + t.toLocaleDateString('pt-BR', { month: 'short', day: 'numeric' })));
      const known = list.filter((b) => amountOf(b) != null);
      const side = make('div', 'bl-wside');
      if (known.length) side.appendChild(make('b', 'bl-wtotal', money(known.reduce((s, b) => s + amountOf(b), 0))));
      side.appendChild(make('span', '', list.filter((b) => b.paid).length + '/' + list.length));
      head.append(h, side);
      card.appendChild(head);
      if (!list.length) card.appendChild(make('p', 'bl-none', 'Nada vence nesta semana.'));
      const ul = make('ul', 'bl-list');
      list.forEach((b) => ul.appendChild(row(b, isNow && b.due_day === here)));
      card.appendChild(ul);
      wrap.appendChild(card);
    });
  }

  function row(b, today) {
    const li = make('li', 'bl-row' + (b.paid ? ' paid' : '') + (today ? ' is-today' : ''));
    const cb = make('input', 'bl-check'); cb.type = 'checkbox'; cb.checked = b.paid; cb.setAttribute('aria-label', 'Paid: ' + b.name);
    cb.onchange = () => setPaid(b, cb.checked);
    const name = make('button', 'bl-name'); name.type = 'button'; name.title = 'Edit this bill';
    name.appendChild(make('b', '', b.name));
    const st = dueState(b);
    name.appendChild(make('span', st, st === 'late' ? 'Atrasada · venceu ' + dayLabel(b) : st === 'today' ? 'Vence hoje' : 'Vence ' + dayLabel(b)));
    name.onclick = () => openDialog(b);
    const amt = make('button', 'bl-amt' + (amountOf(b) == null ? ' empty' : ''), amountOf(b) == null ? 'informar valor' : money(amountOf(b)));
    amt.type = 'button'; amt.title = 'Quanto custou neste mês';
    amt.onclick = () => editAmount(b, amt);
    li.append(cb, name, amt);
    return li;
  }

  async function setPaid(b, paid) {
    const was = b.paid; b.paid = paid; render();
    try { await api('/' + b.id + '/months/' + S.month, 'PUT', { paid }); }
    catch (e) { b.paid = was; render(); toast(e.message); }
  }

  function editAmount(b, button) {
    const input = make('input', 'bl-amt-input'); input.inputMode = 'decimal'; input.value = centsText(amountOf(b)); input.placeholder = '0,00';
    input.setAttribute('aria-label', 'Valor de ' + b.name);
    button.replaceWith(input); input.focus(); input.select();
    let done = false;
    const finish = async (save) => {
      if (done) return; done = true;
      if (!save) { render(); return; }
      const cents = parseCents(input.value);
      if (cents === undefined) { toast('Isso não parece um valor.'); render(); return; }
      if (cents === amountOf(b)) { render(); return; }
      const before = b.month_amount_cents; b.month_amount_cents = cents; render();
      try { await api('/' + b.id + '/months/' + S.month, 'PUT', { amount_cents: cents }); }
      catch (e) { b.month_amount_cents = before; render(); toast(e.message); }
    };
    input.onkeydown = (e) => { if (e.key === 'Enter') finish(true); else if (e.key === 'Escape') finish(false); };
    input.onblur = () => finish(true);
  }

  // add / edit dialog
  const dlg = $('blDialog');
  function openDialog(b) {
    S.editing = b || null;
    $('blDlgTitle').textContent = b ? 'Editar conta' : 'Adicionar conta';
    $('blName').value = b ? b.name : ''; $('blDay').value = b ? b.due_day : ''; $('blAmount').value = b ? centsText(b.amount_cents) : '';
    $('blErr').hidden = true; $('blDelete').hidden = !b;
    dlg.showModal(); $('blName').focus();
  }
  const closeDialog = () => { if (dlg.open) dlg.close(); };
  $('blAdd').onclick = () => openDialog(null);
  $('blClose').onclick = closeDialog;
  dlg.addEventListener('click', (e) => { if (e.target === dlg) closeDialog(); });
  $('blForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('blName').value.trim(), day = Number($('blDay').value), cents = parseCents($('blAmount').value);
    const fail = (m) => { $('blErr').textContent = m; $('blErr').hidden = false; };
    if (!name) return fail('Dê um nome à conta.');
    if (!Number.isInteger(day) || day < 1 || day > 31) return fail('O dia de vencimento deve estar entre 1 e 31.');
    if (cents === undefined) return fail('Isso não parece um valor.');
    try {
      if (S.editing) await api('/' + S.editing.id, 'PATCH', { name, due_day: day, amount_cents: cents });
      else await api('', 'POST', { name, due_day: day, amount_cents: cents });
      closeDialog(); await load(); toast(S.editing ? 'Salvo.' : 'Conta adicionada.');
    } catch (err) { fail(err.message); }
  });
  $('blDelete').onclick = async () => {
    if (!S.editing || !(await IgnisConfirm.ask({ title: 'Apagar conta', text: 'Apagar "' + S.editing.name + '" e o histórico? Isso não pode ser desfeito.' }))) return;
    try { await api('/' + S.editing.id, 'DELETE'); closeDialog(); await load(); toast('Bill deleted.'); } catch (err) { toast(err.message); }
  };

  // month navigation
  const shift = (n) => { const [y, m] = S.month.split('-').map(Number); S.month = monthKey(new Date(y, m - 1 + n, 1)); load().catch(fail); };
  const fail = () => { $('blEmpty').hidden = false; $('blEmpty').textContent = 'Não foi possível carregar suas contas agora.'; };
  $('blPrev').onclick = () => shift(-1);
  $('blNextM').onclick = () => shift(1);
  $('blToday').onclick = () => { S.month = monthKey(new Date()); load().catch(fail); };

  load().catch(fail);
})();
