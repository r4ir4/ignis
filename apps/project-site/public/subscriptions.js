// Subscriptions page, laid out like the Food, Read and Goals pages: a list of recurring payments with a bar for how far each billing cycle has run,
// and on the right the totals, a per-category breakdown and the New subscription button. Stored on the Ignis server (/v1/subscriptions).
// Anything saved earlier in this browser is uploaded once, then kept under a backup key.
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const KEY = 'ignis.subscriptions.v1';
  const CYCLES = { weekly: 'Semanal', monthly: 'Mensal', quarterly: 'Trimestral', yearly: 'Anual' };
  const PER_YEAR = { weekly: 52, monthly: 12, quarterly: 4, yearly: 1 };
  const CYCLE_NOUN = { weekly: 'semana', monthly: 'mês', quarterly: 'trimestre', yearly: 'ano' };
  const pad = (n) => String(n).padStart(2, '0');
  const dayKey = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parseDay = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const make = (tag, cls, text) => { const el = document.createElement(tag); if (cls) el.className = cls; if (text != null) el.textContent = text; return el; };
  const toast = (text, opts) => window.IgnisToast.show(text, opts);

  const S = { items: [], currency: 'BRL', filter: null, month: { y: new Date().getFullYear(), m: new Date().getMonth() }, editing: null, categories: [], cards: [], view: 'cat' };
  const SWATCHES = ['rose', 'lavender', 'apricot', 'cream', 'violet', 'mint', 'sky', 'sand'];
  const catOf = (key) => S.categories.find((c) => c.key === key);
  const catLabel = (key) => (catOf(key) || { label: 'Outros' }).label;
  const swatch = (name) => 'var(--sw-' + (SWATCHES.includes(name) ? name : 'sand') + ')';
  const catColor = (key) => swatch((catOf(key) || {}).color);
  const cardOf = (id) => S.cards.find((c) => c.id === id);
  const cardText = (c) => c.name + (c.last4 ? ' •• ' + c.last4 : '');

  async function api(path, method, body) {
    const init = { method: method || 'GET', headers: {} };
    if (body) { init.body = JSON.stringify(body); init.headers['Content-Type'] = 'application/json'; }
    const res = await fetch('api/v1/subscriptions' + path, init);
    if (!res.ok) {
      let detail = ''; try { const j = await res.json(); if (typeof j.detail === 'string') detail = j.detail; } catch (e) { /* not json */ }
      throw new Error(detail || 'Algo deu errado (' + res.status + ').');
    }
    return res.status === 204 ? null : res.json();
  }
  const fromServer = (r) => ({ id: r.id, name: r.name, amount: r.amount, cycle: r.cycle, cat: r.category, next: r.next_date, note: r.note || '', active: r.active, card: r.card_id || '', created: r.created_at || '' });
  const toServer = (r) => ({ name: r.name, amount: r.amount, cycle: r.cycle, category: r.cat, next_date: r.next, note: r.note, active: r.active, card_id: r.card || '' });
  async function load() {
    let data = await api('');
    // One-time upload of subscriptions that were saved in this browser before the server existed.
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (raw && Array.isArray(raw.items) && raw.items.length && !data.items.length) {
        for (const it of raw.items) await api('', 'POST', toServer(it));
        if (raw.currency) await api('/currency', 'PUT', { currency: raw.currency });
        localStorage.setItem(KEY + '.uploaded', localStorage.getItem(KEY)); localStorage.removeItem(KEY);
        data = await api('');
        toast('Movi ' + raw.items.length + ' assinaturas salvas para o servidor.');
      }
    } catch (e) { toast('Não foi possível mover os dados do navegador: ' + e.message, { type: 'warn' }); }
    S.items = data.items.map(fromServer); S.currency = data.currency || 'BRL'; S.categories = data.categories || []; S.cards = data.cards || [];
  }
  async function reload() { await load(); render(); }

  const money = (n) => { try { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: S.currency }).format(n); } catch (e) { return n.toFixed(2); } };
  const money0 = (n) => { try { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: S.currency, maximumFractionDigits: 0 }).format(n); } catch (e) { return String(Math.round(n)); } };

  // ---- dates: the next payment rolls forward past today --------------------------------------
  function addCycle(d, cycle, sign) {
    const n = new Date(d);
    const k = sign || 1;
    if (cycle === 'weekly') n.setDate(n.getDate() + 7 * k);
    else {
      const day = n.getDate();
      n.setDate(1);
      n.setMonth(n.getMonth() + k * (cycle === 'monthly' ? 1 : cycle === 'quarterly' ? 3 : 12));
      n.setDate(Math.min(day, new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate()));
    }
    return n;
  }
  function nextDue(s) {
    let d = parseDay(s.next);
    const today = parseDay(dayKey(new Date()));
    for (let i = 0; d < today && i < 1000; i++) d = addCycle(d, s.cycle);
    return d;
  }
  const today0 = () => parseDay(dayKey(new Date()));
  const daysUntil = (d) => Math.round((d - today0()) / 86400000);
  const monthly = (s) => (s.amount * PER_YEAR[s.cycle]) / 12;
  const whenText = (s, left, due) => {
    const date = due.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });
    return (left === 0 ? 'Vence hoje' : left === 1 ? 'Amanhã' : 'Em ' + left + ' dias') + ' · ' + date;
  };

  const figure = (cls) => make('figure', 'fd-fig ' + cls);

  // ---- payments by month: every payment date in the month, "Paid" once the date has passed -------------------------------------------------------------
  const dim = (y, m) => new Date(y, m + 1, 0).getDate();
  function occurrences(s, y, m) {
    const a = parseDay(s.next);
    const created = s.created ? parseDay(s.created.slice(0, 10)) : a;
    const first = a < created ? a : created;   // nothing is shown from before the subscription existed
    const out = [];
    if (s.cycle === 'weekly') {
      for (let d = new Date(y, m, 1); d.getMonth() === m; d.setDate(d.getDate() + 1)) if (d.getDay() === a.getDay()) out.push(new Date(d));
    } else if (s.cycle === 'monthly') out.push(new Date(y, m, Math.min(a.getDate(), dim(y, m))));
    else if (s.cycle === 'quarterly') { if ((((y * 12 + m) - (a.getFullYear() * 12 + a.getMonth())) % 3 + 3) % 3 === 0) out.push(new Date(y, m, Math.min(a.getDate(), dim(y, m)))); }
    else if (m === a.getMonth()) out.push(new Date(y, m, Math.min(a.getDate(), dim(y, m))));
    return out.filter((d) => d >= first);
  }
  const monthPayments = (y, m) => S.items.filter((s) => s.active).flatMap((s) => occurrences(s, y, m).map((d) => ({ s, d }))).sort((a, b) => (a.d - b.d) || a.s.name.localeCompare(b.s.name));
  const isNow = () => S.month.y === new Date().getFullYear() && S.month.m === new Date().getMonth();
  const monthName = () => new Date(S.month.y, S.month.m, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  function goMonth(delta) {
    const d = new Date(S.month.y, S.month.m + delta, 1);
    if (Math.abs((d.getFullYear() - new Date().getFullYear()) * 12 + d.getMonth() - new Date().getMonth()) > 24) return;
    S.month = { y: d.getFullYear(), m: d.getMonth() };
    render();
  }
  const matchesFilter = (s) => {
    const f = S.filter;
    if (!f) return true;
    if (f.kind === 'cat') return s.cat === f.key;
    return f.key === '_none' ? !(s.card && cardOf(s.card)) : s.card === f.key;
  };

  // ---- heading: the month, with arrows to go back and forward ----------------------------------------------------------------------------------------
  function pageHead() {
    const pays = monthPayments(S.month.y, S.month.m);
    const total = pays.reduce((t, p) => t + p.s.amount, 0);
    const paid = pays.filter((p) => daysUntil(p.d) < 0).reduce((t, p) => t + p.s.amount, 0);
    const head = make('header', 'fd-pagehead');
    head.innerHTML = '<svg class="h-tw fd-tw" style="--x:52%;--y:18%;--s:20px;--d:0s" viewBox="0 0 32 32" aria-hidden="true"><use href="#spark"/></svg>' +
      '<svg class="h-tw fd-tw fd-tw-p" style="--x:62%;--y:58%;--s:13px;--d:1.1s" viewBox="0 0 32 32" aria-hidden="true"><use href="#spark"/></svg>';
    const text = make('div');
    text.appendChild(make('h1', '', 'Subscriptions'));
    text.appendChild(make('p', 'fd-pagesub', monthName() + ' · ' + (pays.length ? money(total) + ' em ' + pays.length + (pays.length === 1 ? ' pagamento' : ' pagamentos') + (paid ? ' · ' + money(paid) + ' pagos' : '') : 'sem pagamentos')));
    head.appendChild(text);
    const nav = make('div', 'fd-pnav');
    if (!isNow()) { const b = make('button', 'fd-ptoday', 'Today'); b.type = 'button'; b.addEventListener('click', () => { const n = new Date(); S.month = { y: n.getFullYear(), m: n.getMonth() }; render(); }); nav.appendChild(b); }
    const ARROW = (n) => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + (n < 0 ? 'm14.5 6-6 6 6 6' : 'm9.5 6 6 6-6 6') + '"/></svg>';
    const prev = make('button', 'fd-parrow'); prev.type = 'button'; prev.innerHTML = ARROW(-1); prev.setAttribute('aria-label', 'Previous month');
    const next = make('button', 'fd-parrow'); next.type = 'button'; next.innerHTML = ARROW(1); next.setAttribute('aria-label', 'Next month');
    prev.addEventListener('click', () => goMonth(-1));
    next.addEventListener('click', () => goMonth(1));
    nav.append(prev, next);
    head.appendChild(nav);
    return head;
  }

  // ---- right column ----------------------------------------------------------------------------------------------------------------------------------------
  function addButton() {
    const wrap = make('div', 'fd-addwrap');
    const b = make('button', 'fd-mini');
    b.type = 'button'; b.id = 'sbAdd';
    b.innerHTML = '<span class="fd-plus" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></span><span>Nova assinatura</span>';
    b.addEventListener('click', () => openDialog(null));
    wrap.appendChild(b);
    const row = make('div', 'sp-manage');
    const mk = (id, label, count, fn) => {
      const m = make('button', 'fd-mini fd-alt');
      m.type = 'button'; m.id = id;
      m.innerHTML = '<span>' + label + '</span><b>' + count + '</b>';
      m.addEventListener('click', fn);
      return m;
    };
    row.append(mk('sbCatsOpen', 'Categorias', S.categories.length, openCats), mk('sbCardsOpen', 'Cartões', S.cards.length, openCards));
    wrap.appendChild(row);
    return wrap;
  }
  const ICON = {
    coin: '<g class="sp-i-coin"><circle cx="42" cy="42" r="30" fill="currentColor"/><path d="M42 24v36M34 32c1-3 4-4.500 8-4.500 5 0 8 2 8 5.500 0 7-16 3.500-16 11 0 3.500 3 5.500 8 5.500 4 0 7-1.500 8-4.500" fill="none" stroke="#fffdf6" stroke-width="4.500" stroke-linecap="round" opacity=".9"/></g>',
    cal: '<g class="sp-i-cal"><rect x="12" y="18" width="60" height="52" rx="8" fill="currentColor"/><rect x="12" y="18" width="60" height="16" rx="8" fill="#fffdf6" opacity=".35"/><path d="M28 10v14M56 10v14" stroke="currentColor" stroke-width="6" stroke-linecap="round"/><path d="M26 46h8M38 46h8M50 46h8M26 58h8M38 58h8" stroke="#fffdf6" stroke-width="5" stroke-linecap="round" opacity=".85"/></g>',
    bell: '<g class="sp-i-bell"><path d="M42 12c-12 0-19 9-19 21v12l-7 9h52l-7-9V33c0-12-7-21-19-21Z" fill="currentColor"/><path d="M34 62a8 8 0 0 0 16 0" fill="currentColor"/></g>',
    stack: '<g class="sp-i-stack" fill="currentColor"><rect x="14" y="52" width="56" height="12" rx="3"/><rect x="20" y="38" width="50" height="12" rx="3" transform="rotate(-3 45 44)"/><rect x="16" y="24" width="52" height="12" rx="3" transform="rotate(2 42 30)"/></g>',
  };
  function tile(cls, label, value, text, icon, sub, count) {
    const li = make('li', 'fd-tile ' + cls);
    const left = make('span', 'fd-tl');
    left.appendChild(make('small', '', label));
    const b = make('b', 'fd-num', text);
    left.appendChild(b);
    left.appendChild(make('span', 'fd-goal', sub));
    li.appendChild(left);
    const art = make('span', 'fd-art');
    art.setAttribute('aria-hidden', 'true');
    art.innerHTML = '<svg viewBox="0 0 84 84">' + ICON[icon] + '</svg>';
    li.appendChild(art);
    li.setAttribute('aria-label', label + ': ' + text);
    return li;
  }
  function tiles() {
    const active = S.items.filter((s) => s.active);
    const perMonth = active.reduce((t, s) => t + monthly(s), 0);
    const soon = active.filter((s) => daysUntil(nextDue(s)) <= 7).length;
    const ul = make('ul', 'fd-tiles sp-tiles');
    ul.setAttribute('aria-label', 'Totais das assinaturas');
    ul.append(
      tile('t-cal', 'Por mês', perMonth, money0(perMonth), 'coin', 'quanto custam'),
      tile('t-pro', 'Por ano', perMonth * 12, money0(perMonth * 12), 'cal', 'doze meses disso'),
      tile('t-carb', 'Vencem em 7 dias', soon, String(soon), 'bell', soon ? 'chegando' : 'nada por vir'),
      tile('t-fat', 'Ativas', active.length, String(active.length), 'stack', S.items.length - active.length ? (S.items.length - active.length) + ' pausadas' : 'todas rodando'),
    );
    return ul;
  }
  // per month, split by category or by the card that pays
  function breakdownCard() {
    const active = S.items.filter((s) => s.active);
    const by = {}, meta = {};
    active.forEach((s) => {
      const k = S.view === 'card' ? (s.card && cardOf(s.card) ? s.card : '_none') : s.cat;
      by[k] = (by[k] || 0) + monthly(s);
      if (!meta[k]) meta[k] = S.view === 'card' ? (k === '_none' ? { label: 'Sem cartão', color: 'var(--sw-sand)' } : { label: cardText(cardOf(k)), color: swatch(cardOf(k).color) }) : { label: catLabel(k), color: catColor(k) };
    });
    const rows = Object.entries(by).sort((a, b) => b[1] - a[1]);
    const max = rows.length ? rows[0][1] : 1;
    const total = rows.reduce((t, r) => t + r[1], 0) || 1;
    const c = figure('fd-week-card sp-break');
    const head = make('div', 'fd-head');
    head.appendChild(make('p', 'fd-k', 'Por mês'));
    const sw = make('div', 'sp-view');
    sw.setAttribute('role', 'group'); sw.setAttribute('aria-label', 'Agrupar por');
    [['cat', 'Categoria'], ['card', 'Cartão']].forEach(([k, label]) => {
      const b = make('button', '', label);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(S.view === k));
      b.addEventListener('click', () => { S.view = k; S.filter = null; render(); });
      sw.appendChild(b);
    });
    head.appendChild(sw);
    c.appendChild(head);
    const hint = make('div', 'sp-filterhint');
    if (S.filter) {
      hint.appendChild(make('span', '', 'Mostrando: ' + (S.filter.kind === 'cat' ? catLabel(S.filter.key) : S.filter.key === '_none' ? 'Sem cartão' : cardText(cardOf(S.filter.key) || { name: '' }))));
      const clear = make('button', '', 'Mostrar tudo'); clear.type = 'button';
      clear.addEventListener('click', () => { S.filter = null; render(); });
      hint.appendChild(clear);
    } else hint.appendChild(make('span', '', 'Clique em uma para filtrar a lista'));
    c.appendChild(hint);
    if (!rows.length) { c.appendChild(make('p', 'sp-none', 'Nada para mostrar ainda.')); return c; }
    const ul = make('ul', 'sp-bars');
    rows.forEach(([k, v]) => {
      const li = make('li', 'sp-bar');
      const isSel = S.filter && S.filter.kind === S.view && S.filter.key === k;
      li.classList.toggle('sel', !!isSel);
      li.tabIndex = 0; li.setAttribute('role', 'button'); li.setAttribute('aria-pressed', String(!!isSel));
      const pick = () => { S.filter = isSel ? null : { kind: S.view, key: k }; render(); };
      li.addEventListener('click', pick);
      li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
      const top = make('div');
      const dot = make('i', 'sp-dot'); dot.style.background = meta[k].color;
      top.append(dot, make('span', '', meta[k].label), make('em', '', money(v)), make('small', '', Math.round((v / total) * 100) + '%'));
      const track = make('span', 'sp-track'); const fill = make('i');
      fill.style.setProperty('--w', Math.round((v / max) * 100) + '%'); fill.style.background = meta[k].color;
      track.appendChild(fill);
      li.append(top, track);
      ul.appendChild(li);
    });
    c.appendChild(ul);
    return c;
  }

  // ---- the list ---------------------------------------------------------------------------------------------------------------------------------------------
  const PENCIL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9a2.800 2.800 0 0 0-4-4L4 16Z"/><path d="m13.500 6.500 4 4"/></svg>';
  const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.500l4.500 4.500L19 7.500"/></svg>';
  // one payment in the month (d), or a paused subscription (no date)
  function payRow(s, d) {
    const left = d ? daysUntil(d) : null;
    const paid = d && left < 0;
    const li = make('li', 'fd-row sp-row' + (s.active ? '' : ' off') + (paid ? ' paid' : ''));
    li.style.setProperty('--hc', catColor(s.cat));
    li.appendChild(make('i', 'fd-bullet'));
    const main = make('div', 'sp-main');
    main.appendChild(make('b', 'sp-name', s.name));
    if (s.note) main.appendChild(make('small', 'sp-note', s.note));
    if (d) main.appendChild(make('small', 'sp-when' + (!paid && left <= 3 ? ' soon' : ''), d.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' }) + (paid ? '' : left === 0 ? ' · hoje' : left === 1 ? ' · amanhã' : ' · em ' + left + ' dias')));
    li.appendChild(main);
    const side = make('div', 'sp-side');
    const badges = make('div', 'sp-badges');
    if (paid) { const p = make('span', 'sp-status'); p.innerHTML = CHECK + 'Pago'; badges.appendChild(p); }
    else if (d && left === 0) badges.appendChild(make('span', 'sp-status today', 'Hoje'));
    badges.appendChild(make('span', 'sp-cat', catLabel(s.cat)));
    const card = s.card && cardOf(s.card);
    if (card) {
      const chip = make('span', 'sp-card');
      const dot = make('i'); dot.style.background = swatch(card.color);
      chip.append(dot, document.createTextNode(cardText(card)));
      badges.appendChild(chip);
    }
    if (!s.active) badges.appendChild(make('span', 'sp-paused', 'Pausada'));
    side.appendChild(badges);
    const amt = make('div', 'sp-amt', money(s.amount));
    amt.appendChild(make('small', '', 'por ' + CYCLE_NOUN[s.cycle]));
    side.appendChild(amt);
    li.appendChild(side);
    const edit = make('button', 'sp-edit');
    edit.type = 'button';
    edit.innerHTML = PENCIL;
    edit.setAttribute('aria-label', 'Editar ' + s.name);
    edit.title = 'Editar';
    edit.addEventListener('click', () => openDialog(s));
    li.appendChild(edit);
    return li;
  }

  function listCard() {
    const c = figure('fd-log sp-log');
    const list = make('ul', 'fd-list');
    const pays = monthPayments(S.month.y, S.month.m).filter((p) => matchesFilter(p.s));
    pays.forEach((p) => list.appendChild(payRow(p.s, p.d)));
    const paused = S.items.filter((s) => !s.active && matchesFilter(s));
    if (!S.items.length) list.appendChild(make('li', 'fd-empty', 'Nenhuma assinatura ainda. Adicione o primeiro pagamento recorrente.'));
    else if (!pays.length && !paused.length) list.appendChild(make('li', 'fd-empty', S.filter ? 'Nada aqui para este filtro em ' + monthName() + '.' : 'Nenhum pagamento em ' + monthName() + '.'));
    paused.forEach((s) => list.appendChild(payRow(s, null)));
    c.appendChild(list);
    return c;
  }

  function render() {
    const wrap = make('div', 'fd-wrap');
    const main = make('section', 'fd-main');
    const side = make('aside', 'fd-sidecol');
    main.append(pageHead(), listCard());
    side.append(addButton(), tiles(), breakdownCard());
    wrap.append(main, side);
    $('sbGrid').replaceChildren(wrap);
  }

  // ---- dialog -----------------------------------------------------------------------------------------------------------------------------------------------
  const dlg = $('sbDialog');
  function openDialog(s) {
    S.editing = s || null;
    $('sbDlgTitle').textContent = s ? 'Editar assinatura' : 'Nova assinatura';
    $('sbName').value = s ? s.name : '';
    $('sbAmount').value = s ? s.amount : '';
    $('sbCycle').value = s ? s.cycle : 'monthly';
    fillSelects();
    $('sbCat').value = s ? s.cat : (catOf('other') ? 'other' : (S.categories[S.categories.length - 1] || {}).key);
    $('sbCard').value = s && s.card && cardOf(s.card) ? s.card : '';
    $('sbNext').value = s ? dayKey(nextDue(s)) : dayKey(new Date());
    $('sbNote').value = s ? s.note || '' : '';
    $('sbActive').checked = s ? s.active : true;
    $('sbDelete').hidden = !s;
    $('sbDelete').classList.remove('sure');
    $('sbDelete').textContent = 'Apagar esta assinatura';
    $('sbErr').hidden = true;
    try { $('sbSym').textContent = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: S.currency }).formatToParts(0).find((p) => p.type === 'currency').value; } catch (e) { $('sbSym').textContent = S.currency; }
    dlg.showModal();
    $('sbName').focus();
  }
  $('sbClose').onclick = () => dlg.close();
  $('sbForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('sbName').value.trim();
    const amount = parseFloat($('sbAmount').value.replace(',', '.'));
    const next = $('sbNext').value;
    const err = !name ? 'Dê um nome.' : !(amount >= 0) ? 'Informe quanto custa.' : !next ? 'Escolha a data do próximo pagamento.' : '';
    if (err) { $('sbErr').textContent = err; $('sbErr').hidden = false; return; }
    const rec = { name, amount, cycle: $('sbCycle').value, cat: $('sbCat').value, next, note: $('sbNote').value.trim(), active: $('sbActive').checked, card: $('sbCard').value };
    const old = S.editing;
    try {
      let saved;
      if (old) saved = await api('/' + old.id, 'PATCH', toServer(rec));
      else saved = await api('', 'POST', toServer(rec));
      dlg.close();
      await reload();
      if (old) toast('Subscription saved', { sub: name + ' · ' + money(amount) + ' per ' + CYCLE_NOUN[rec.cycle], undo: () => api('/' + old.id, 'PATCH', toServer(old)).then(reload) });
      else toast('Subscription added', { sub: name + ' · ' + money(amount) + ' per ' + CYCLE_NOUN[rec.cycle], undo: () => api('/' + saved.id, 'DELETE').then(reload) });
    } catch (ex) { $('sbErr').textContent = ex.message; $('sbErr').hidden = false; }
  });
  $('sbDelete').onclick = async () => {
    if (!S.editing) return;
    if (!(await IgnisConfirm.ask({ title: 'Apagar assinatura', text: 'Apagar "' + S.editing.name + '"? Isso não pode ser desfeito.' }))) return;
    const gone = S.editing;
    try {
      await api('/' + gone.id, 'DELETE');
      dlg.close();
      await reload();
      toast('Assinatura apagada', { sub: gone.name, undo: () => api('', 'POST', toServer(gone)).then(reload) });
    } catch (ex) { toast(ex.message, { type: 'warn' }); }
  };

  // ---- the subscription dialog's lists, and the Categories / Cards managers ----------------------------------------------------------------------------------
  function fillSelects() {
    $('sbCat').replaceChildren(...S.categories.map((c) => { const o = make('option', '', c.label); o.value = c.key; return o; }));
    const none = make('option', '', 'Sem cartão'); none.value = '';
    $('sbCard').replaceChildren(none, ...S.cards.map((c) => { const o = make('option', '', cardText(c)); o.value = c.id; return o; }));
  }
  function swatchPicker(box, state) {
    box.replaceChildren(...SWATCHES.map((name) => {
      const b = make('button', 'sb-sw');
      b.type = 'button'; b.dataset.v = name; b.style.background = swatch(name);
      b.setAttribute('aria-label', name); b.setAttribute('aria-pressed', String(state.color === name));
      b.addEventListener('click', () => { state.color = name; box.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.v === name))); if (state.onPick) state.onPick(name); });
      return b;
    }));
  }
  const newCat = { color: 'sand' }, newCard = { color: 'sand' };
  async function mcall(path, method, body) {
    try { const r = await api(path, method, body); await reload(); return r || {}; } catch (e) { toast(e.message, { type: 'warn' }); return null; }
  }
  // a swatch button that opens a small color row; picking one saves it
  function colorChip(current, onPick) {
    const wrap = make('span', 'sb-chipwrap');
    const b = make('button', 'sb-colorbtn'); b.type = 'button'; b.style.background = swatch(current); b.setAttribute('aria-label', 'Change color'); b.setAttribute('aria-expanded', 'false');
    const pop = make('span', 'sb-pop'); pop.hidden = true;
    SWATCHES.forEach((name) => {
      const x = make('button', 'sb-sw'); x.type = 'button'; x.style.background = swatch(name); x.setAttribute('aria-label', name); x.setAttribute('aria-pressed', String(name === current));
      x.addEventListener('click', () => { pop.hidden = true; b.setAttribute('aria-expanded', 'false'); if (name !== current) onPick(name); });
      pop.appendChild(x);
    });
    b.addEventListener('click', () => { const open = pop.hidden; document.querySelectorAll('.sb-pop').forEach((p) => { p.hidden = true; }); pop.hidden = !open; b.setAttribute('aria-expanded', String(open)); });
    wrap.append(b, pop);
    return wrap;
  }
  function renderCats() {
    const ul = $('sbCatList');
    ul.replaceChildren();
    S.categories.forEach((c) => {
      const li = make('li', 'sb-mrow');
      li.appendChild(colorChip(c.color, (name) => mcall('/categories/' + c.key, 'PATCH', { color: name }).then(renderCats)));
      const name = make('input', 'sb-minput sb-mname'); name.value = c.label; name.maxLength = 30; name.setAttribute('aria-label', 'Name of the category');
      name.addEventListener('change', async () => { const v = name.value.trim(); if (!v || v === c.label) { name.value = c.label; return; } const r = await mcall('/categories/' + c.key, 'PATCH', { label: v }); if (!r) name.value = c.label; renderCats(); });
      name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); name.blur(); } else if (e.key === 'Escape') { name.value = c.label; name.blur(); } });
      li.appendChild(name);
      li.appendChild(make('span', 'sb-uses', c.uses ? c.uses + (c.uses === 1 ? ' assinatura' : ' assinaturas') : ''));
      const del = make('button', 'sb-mbtn ghost', 'Remover'); del.type = 'button'; del.disabled = S.categories.length <= 1; del.title = S.categories.length <= 1 ? 'Mantenha pelo menos uma categoria' : '';
      del.addEventListener('click', () => askRemove({ kind: 'cat', item: c }));
      li.appendChild(del);
      ul.appendChild(li);
    });
  }
  function renderCards() {
    const ul = $('sbCardList');
    ul.replaceChildren();
    if (!S.cards.length) ul.appendChild(make('li', 'sb-mempty', 'Nenhum cartão ainda. Adicione os que você usa e escolha um em cada assinatura.'));
    S.cards.forEach((c) => {
      const li = make('li', 'sb-mrow');
      li.appendChild(colorChip(c.color, (name) => mcall('/cards/' + c.id, 'PATCH', { color: name }).then(renderCards)));
      const name = make('input', 'sb-minput sb-mname'); name.value = c.name; name.maxLength = 30; name.setAttribute('aria-label', 'Card name');
      name.addEventListener('change', async () => { const v = name.value.trim(); if (!v || v === c.name) { name.value = c.name; return; } const r = await mcall('/cards/' + c.id, 'PATCH', { name: v }); if (!r) name.value = c.name; renderCards(); });
      name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); name.blur(); } else if (e.key === 'Escape') { name.value = c.name; name.blur(); } });
      const last = make('input', 'sb-minput sb-last4'); last.value = c.last4 || ''; last.maxLength = 4; last.inputMode = 'numeric'; last.placeholder = '····'; last.setAttribute('aria-label', 'Últimos quatro dígitos');
      last.addEventListener('input', () => { last.value = last.value.replace(/\D/g, '').slice(0, 4); });
      last.addEventListener('change', async () => { if ((last.value || '') === (c.last4 || '')) return; if (last.value && last.value.length !== 4) { toast('Use exatamente quatro dígitos ou deixe vazio.', { type: 'warn' }); last.value = c.last4 || ''; return; } await mcall('/cards/' + c.id, 'PATCH', { last4: last.value }); renderCards(); });
      li.append(name, last, make('span', 'sb-uses', c.uses ? c.uses + (c.uses === 1 ? ' assinatura' : ' assinaturas') : ''));
      const del = make('button', 'sb-mbtn ghost', 'Remover'); del.type = 'button';
      del.addEventListener('click', () => askRemove({ kind: 'card', item: c }));
      li.appendChild(del);
      ul.appendChild(li);
    });
  }
  function openCats() { $('sbCatNew').value = ''; swatchPicker($('sbCatSw'), newCat); renderCats(); $('sbCatDialog').showModal(); }
  function openCards() { $('sbCardNew').value = ''; $('sbCardLast4').value = ''; swatchPicker($('sbCardSw'), newCard); renderCards(); $('sbCardDialog').showModal(); }
  $('sbCatClose').onclick = () => $('sbCatDialog').close();
  $('sbCardClose').onclick = () => $('sbCardDialog').close();
  $('sbCatForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = $('sbCatNew').value.trim();
    if (!v) return;
    const r = await mcall('/categories', 'POST', { label: v, color: newCat.color });
    if (r) { $('sbCatNew').value = ''; renderCats(); toast('Categoria adicionada', { sub: v }); }
    $('sbCatNew').focus();
  });
  $('sbCardForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = $('sbCardNew').value.trim(), last4 = $('sbCardLast4').value.trim();
    if (!v) return;
    if (last4 && last4.length !== 4) { toast('Use exatamente quatro dígitos ou deixe vazio.', { type: 'warn' }); return; }
    const r = await mcall('/cards', 'POST', { name: v, last4, color: newCard.color });
    if (r) { $('sbCardNew').value = ''; $('sbCardLast4').value = ''; $('sbCardDialog').close(); toast('Cartão adicionado', { sub: v + (last4 ? ' •• ' + last4 : '') }); return; }   // done: close the window
    $('sbCardNew').focus();
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('.sb-chipwrap')) document.querySelectorAll('.sb-pop').forEach((p) => { p.hidden = true; }); });

  // removing asks first; a category in use also asks where its subscriptions go
  let removing = null;
  function askRemove(r) {
    removing = r;
    const it = r.item;
    const sel = $('sbDelSel');
    sel.replaceChildren();
    if (r.kind === 'cat') {
      $('sbDelTitle').textContent = 'Remover categoria';
      $('sbDelText').textContent = it.uses ? it.uses + (it.uses === 1 ? ' assinatura está' : ' assinaturas estão') + ' em "' + it.label + '". Escolha para qual categoria elas vão antes de remover.' : 'Remover a categoria "' + it.label + '"? Isso não pode ser desfeito.';
      S.categories.filter((c) => c.key !== it.key).forEach((c) => { const o = make('option', '', c.label); o.value = c.key; sel.appendChild(o); });
      $('sbDelMoveWrap').hidden = !it.uses;
    } else {
      $('sbDelTitle').textContent = 'Remover cartão';
      $('sbDelText').textContent = it.uses ? it.uses + (it.uses === 1 ? ' assinatura usa' : ' assinaturas usam') + ' "' + cardText(it) + '". Elas ficarão sem cartão.' : 'Remover o cartão "' + cardText(it) + '"? Isso não pode ser desfeito.';
      $('sbDelMoveWrap').hidden = true;
    }
    $('sbDelGo').textContent = r.kind === 'cat' && it.uses ? 'Mover e remover' : 'Remover';
    $('sbDelDialog').showModal();
    $('sbDelCancel').focus();
  }
  $('sbDelClose').onclick = () => $('sbDelDialog').close();
  $('sbDelCancel').onclick = () => $('sbDelDialog').close();
  $('sbDelGo').onclick = async () => {
    const r = removing; if (!r) return;
    $('sbDelDialog').close();
    if (r.kind === 'cat') {
      const res = await mcall('/categories/' + r.item.key + (r.item.uses ? '?move_to=' + encodeURIComponent($('sbDelSel').value) : ''), 'DELETE');
      if (res) { toast('Categoria removida', { sub: r.item.label + (res.moved ? ' · ' + res.moved + (res.moved === 1 ? ' assinatura movida' : ' assinaturas movidas') : '') }); if (S.filter && S.filter.kind === 'cat' && S.filter.key === r.item.key) S.filter = null; render(); }
      renderCats();
    } else {
      const res = await mcall('/cards/' + r.item.id, 'DELETE');
      if (res) toast('Cartão removido', { sub: cardText(r.item) });
      renderCards();
    }
  };

  reload().catch((e) => { render(); $('sbEmpty').textContent = 'Não foi possível carregar as assinaturas: ' + e.message; $('sbEmpty').hidden = false; });
})();
