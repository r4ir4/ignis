// Backpack: things that run out, and when to buy more. The stock now, the day it runs out and the day to restock are worked out from the
// last count and how fast you use it (/v1/backpack). Buying more or recounting starts a new count.
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const make = (tag, cls, text) => { const el = document.createElement(tag); if (cls) el.className = cls; if (text != null) el.textContent = text; return el; };
  const toast = (text, opts) => { if (window.IgnisToast) window.IgnisToast.show(text, opts); };

  async function api(path, method, body) {
    const init = { method: method || 'GET', headers: {} };
    if (body) { init.body = JSON.stringify(body); init.headers['Content-Type'] = 'application/json'; }
    const res = await fetch('api/v1/backpack' + path, init);
    if (!res.ok) {
      let detail = ''; try { const j = await res.json(); if (typeof j.detail === 'string') detail = j.detail; } catch (e) { /* not json */ }
      throw new Error(detail || 'Algo deu errado (' + res.status + ').');
    }
    return res.status === 204 ? null : res.json();
  }

  const S = { items: [], cats: [], group: '', editing: null, act: null };
  const catLabel = (k) => { const c = S.cats.find((x) => x.key === k); return c ? c.label : ''; };
  const pad = (n) => String(n).padStart(2, '0');
  const dayKey = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const todayKey = () => dayKey(new Date());
  const parseDay = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const daysBetween = (a, b) => Math.round((parseDay(b) - parseDay(a)) / 864e5);
  const addDays = (k, n) => { const d = parseDay(k); d.setDate(d.getDate() + Math.round(n)); return dayKey(d); };
  const num = (v) => { const t = String(v == null ? '' : v).trim().replace(',', '.'); if (t === '') return null; const n = Number(t); return Number.isFinite(n) ? n : NaN; };
  const fmtN = (n) => { const r = Math.round(n * 10) / 10; return r.toLocaleString('pt-BR', { maximumFractionDigits: 1 }); };
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

  const PERIOD = { day: { days: 1, one: 'dia', many: 'dias', each: 'dia' }, week: { days: 7, one: 'semana', many: 'semanas', each: 'semana' }, month: { days: 30.4375, one: 'mês', many: 'meses', each: 'mês' }, year: { days: 365.25, one: 'ano', many: 'anos', each: 'ano' } };
  const ratePerDay = (it) => (it.use_qty > 0 ? it.use_qty / (it.use_every * PERIOD[it.use_period].days) : 0);
  const leftNow = (it, today) => Math.max(0, it.quantity - Math.max(0, daysBetween(it.counted_at, today)) * ratePerDay(it));

  // how long a number of days is, in words
  function span(days) {
    days = Math.max(0, Math.round(days));
    if (days < 14) return plural(days, 'dia', 'dias');
    if (days < 70) return plural(Math.round(days / 7), 'semana', 'semanas');
    if (days < 540) return plural(Math.round(days / 30.4375), 'mês', 'meses');
    return plural(Math.round(days / 365.25 * 10) / 10, 'ano', 'anos');
  }
  const shortDate = (k) => parseDay(k).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }).replace('.', '');
  function useText(it) {
    if (!(it.use_qty > 0)) return 'Sem ritmo fixo';
    const p = PERIOD[it.use_period];
    return fmtN(it.use_qty) + ' a cada ' + (it.use_every === 1 ? p.each : it.use_every + ' ' + p.many);
  }

  // status of one item today: how much is left, when it runs out, when to buy
  function status(it, today) {
    const left = leftNow(it, today), rate = ratePerDay(it);
    const out = { left, rate, level: 'ok', buyIn: null, endsIn: null };
    if (rate > 0) {
      out.endsIn = left / rate;
      out.buyIn = (left - it.reorder_at) / rate;      // days until it falls to the restock level
      out.level = out.buyIn <= 0 ? 'buy' : out.buyIn <= 14 ? 'soon' : 'ok';
    } else out.level = left <= it.reorder_at ? 'buy' : 'ok';
    return out;
  }
  const RANK = { buy: 0, soon: 1, ok: 2 };

  async function load() { const [a, c] = await Promise.all([api(''), api('/categories')]); S.items = a.items; S.cats = c.categories; render(); }

  function render() {
    const today = todayKey();
    const rows = S.items.map((it) => ({ it, st: status(it, today) }));
    const buy = rows.filter((r) => r.st.level === 'buy').length, soon = rows.filter((r) => r.st.level === 'soon').length;
    $('bpSub').textContent = rows.length ? plural(rows.length, 'item', 'itens') + (buy ? ' · ' + buy + ' para repor agora' : '') + (soon ? ' · ' + plural(soon, 'em breve', 'em breve') : '') : 'Controle o que acaba e quando comprar de novo.';
    $('bpEmpty').hidden = true;
    // group filter
    const groups = S.cats.filter((c) => S.items.some((i) => i.group === c.key)).map((c) => c.key);
    if (S.group && !groups.includes(S.group)) S.group = '';
    const pills = $('bpPills'); pills.replaceChildren(); pills.hidden = groups.length < 1;
    [['', 'Todos'], ...groups.map((g) => [g, catLabel(g)])].forEach(([k, label]) => {
      const b = make('button', 'bp-pill', label); b.type = 'button'; b.setAttribute('aria-pressed', String(S.group === k));
      b.onclick = () => { S.group = k; render(); }; pills.appendChild(b);
    });
    const list = $('bpList'); list.replaceChildren();
    const shown = rows.filter((r) => !S.group || r.it.group === S.group)
      .sort((a, b) => RANK[a.st.level] - RANK[b.st.level] || (a.st.buyIn ?? 1e9) - (b.st.buyIn ?? 1e9) || a.it.name.localeCompare(b.it.name));
    if (!rows.length) {
      const li = make('li', 'bp-blank');
      li.append(make('p', 'bp-blank-t', 'Nada na mochila ainda'), make('p', 'bp-blank-s', 'Cadastre o que você usa e acaba, como canetas, café ou lâminas, com quanto tem e quanto usa. A página avisa quando for hora de comprar.'));
      list.appendChild(li); return;
    }
    shown.forEach((r) => list.appendChild(row(r.it, r.st, today)));
  }

  const ICON = {
    cart: '<path d="M3 4h2.5l2 11h10l2-8H7M10 20h.01M17 20h.01"/>',
    recount: '<path d="M20 12a8 8 0 1 1-2.6-5.9M20 4v4.5h-4.5"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/>',
  };
  const icon = (n) => '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICON[n] + '</svg>';

  function row(it, st, today) {
    const li = make('li', 'bp-row ' + st.level);
    const main = make('div', 'bp-main');
    const top = make('div', 'bp-top');
    top.appendChild(make('h3', 'bp-name', it.name));
    if (it.group && catLabel(it.group)) top.appendChild(make('span', 'bp-grp', catLabel(it.group)));
    main.appendChild(top);
    main.appendChild(make('p', 'bp-usel', useText(it) + (it.note ? ' · ' + it.note : '')));
    li.appendChild(main);

    const stock = make('div', 'bp-stock');
    stock.append(make('b', '', fmtN(st.left)), make('small', '', it.unit || (st.left === 1 ? 'unidade' : 'unidades')));
    li.appendChild(stock);

    const mid = make('div', 'bp-mid');
    const bar = make('i', 'bp-bar'); const fill = make('b'); const cap = Math.max(it.quantity, it.reorder_at, 0.0001);
    fill.style.width = Math.max(0, Math.min(100, (st.left / cap) * 100)) + '%'; bar.appendChild(fill);
    const mark = make('u'); mark.style.left = Math.min(100, (it.reorder_at / cap) * 100) + '%'; bar.appendChild(mark);
    mid.appendChild(bar);
    let line1, line2 = '';
    if (st.level === 'buy') { line1 = 'Hora de comprar'; line2 = st.rate > 0 ? (st.endsIn <= 0 ? 'acabou' : 'acaba em ' + span(st.endsIn) + ' · ' + shortDate(addDays(today, st.endsIn))) : 'restam ' + fmtN(st.left); }
    else if (st.rate > 0) { line1 = 'Comprar até ' + shortDate(addDays(today, st.buyIn)); line2 = 'em ' + span(st.buyIn) + ' · acaba em ' + span(st.endsIn); }
    else { line1 = 'Em dia'; line2 = 'sem ritmo de uso'; }
    mid.append(make('p', 'bp-line1', line1), make('p', 'bp-line2', line2));
    li.appendChild(mid);

    const acts = make('div', 'bp-acts');
    const ib = (ic, label, fn, cls) => { const b = make('button', 'bp-ib ' + (cls || '')); b.type = 'button'; b.innerHTML = icon(ic); b.setAttribute('aria-label', label + ': ' + it.name); b.title = label; b.onclick = fn; return b; };
    acts.append(ib('cart', 'Comprei', () => openAct(it, 'buy'), st.level === 'buy' ? 'hot' : ''), ib('recount', 'Recontar o estoque', () => openAct(it, 'count')), ib('edit', 'Editar', () => openForm(it)));
    li.appendChild(acts);
    return li;
  }

  // ---- add / edit ----
  const dlg = $('bpDialog');
  const setErr = (el, msg) => { el.textContent = msg || ''; el.hidden = !msg; };
  function openForm(it) {
    S.editing = it || null;
    $('bpDlgTitle').textContent = it ? 'Editar item' : 'Novo item';
    const today = todayKey();
    $('bpName').value = it ? it.name : ''; $('bpUnit').value = it ? it.unit : '';
    $('bpQty').value = it ? fmtN(leftNow(it, today)).replace(/\./g, '') : '';
    $('bpReorder').value = it ? String(it.reorder_at).replace('.', ',') : '1';
    $('bpUseQty').value = it && it.use_qty > 0 ? String(it.use_qty).replace('.', ',') : '';
    $('bpUseEvery').value = it ? it.use_every : 1; $('bpUsePeriod').value = it ? it.use_period : 'week';
    $('bpNote').value = it ? it.note : '';
    $('bpGroup').replaceChildren(...[{ key: '', label: 'Sem categoria' }, ...S.cats].map((c) => { const o = make('option', '', c.label); o.value = c.key; return o; }));
    $('bpGroup').value = it ? it.group : (S.cats.some((c) => c.key === S.group) ? S.group : '');
    updatePreview();
    $('bpDelete').hidden = !it; setErr($('bpErr'), '');
    dlg.showModal(); $('bpName').focus();
  }
  $('bpAdd').onclick = () => openForm(null);
  $('bpClose').onclick = () => dlg.close();
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  $('bpForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('bpName').value.trim();
    const qty = num($('bpQty').value), reorder = num($('bpReorder').value), use = num($('bpUseQty').value), every = num($('bpUseEvery').value);
    const err = !name ? 'Dê um nome ao item.' : (qty == null || Number.isNaN(qty) || qty < 0) ? 'Diga quanto você tem agora (pode ser 0).' : (Number.isNaN(reorder) || (reorder != null && reorder < 0)) ? 'Em “Comprar quando restar”, use um número.'
      : (Number.isNaN(use) || (use != null && use < 0)) ? 'Em “Quanto uso”, use um número.' : (use > 0 && !(every >= 1)) ? 'O intervalo de uso precisa ser 1 ou mais.' : '';
    if (err) return setErr($('bpErr'), err);
    const today = todayKey();
    const rate = { use_qty: use || 0, use_every: Math.round(every || 1), use_period: $('bpUsePeriod').value };
    try {
      if (S.editing) {
        const it = S.editing;
        const changedRate = rate.use_qty !== it.use_qty || (rate.use_qty > 0 && (rate.use_every !== it.use_every || rate.use_period !== it.use_period));
        let r = await api('/' + it.id, 'PATCH', { name, group: $('bpGroup').value, unit: $('bpUnit').value.trim(), reorder_at: reorder == null ? 1 : reorder, note: $('bpNote').value.trim(), ...(changedRate ? { ...rate, day: today } : {}) });
        if (Math.abs(qty - leftNow(r, today)) > 0.05) r = await api('/' + it.id + '/count', 'POST', { quantity: qty, day: today });
      } else {
        await api('', 'POST', { name, group: $('bpGroup').value, unit: $('bpUnit').value.trim(), quantity: qty, day: today, reorder_at: reorder == null ? 1 : reorder, note: $('bpNote').value.trim(), ...rate });
      }
      dlg.close(); await load(); toast(S.editing ? 'Salvo' : 'Item adicionado', { sub: name });
    } catch (ex) { setErr($('bpErr'), ex.message); }
  });
  $('bpDelete').onclick = async () => {
    const it = S.editing; if (!it) return;
    if (!(await IgnisConfirm.ask({ title: 'Apagar item', text: 'Apagar "' + it.name + '" da mochila?', ok: 'Apagar' }))) return;
    try { await api('/' + it.id, 'DELETE'); dlg.close(); await load(); toast('Item apagado', { sub: it.name }); } catch (ex) { setErr($('bpErr'), ex.message); }
  };

  // a live line under the stock and use fields: how long the stock lasts and when to buy
  function updatePreview() {
    const el = $('bpPreview'), qty = num($('bpQty').value), re = num($('bpReorder').value), use = num($('bpUseQty').value), every = num($('bpUseEvery').value) || 1, per = $('bpUsePeriod').value;
    el.replaceChildren();
    if (qty == null || Number.isNaN(qty)) { el.textContent = 'Preencha quanto você tem para ver quanto tempo dura.'; return; }
    if (!(use > 0)) { el.textContent = 'Sem ritmo de uso, o aviso aparece só quando o estoque chegar a ' + fmtN(re == null || Number.isNaN(re) ? 1 : re) + '.'; return; }
    const rate = use / (every * PERIOD[per].days), level = re == null || Number.isNaN(re) ? 1 : re;
    const ends = qty / rate, buy = (qty - level) / rate;
    const a = make('b', '', 'Dura ' + span(ends)); const t = todayKey();
    el.append(a, document.createTextNode(buy <= 0 ? ' · já está na hora de comprar' : ' · comprar até ' + shortDate(addDays(t, buy)) + ' (em ' + span(buy) + ')'));
  }
  ['bpQty', 'bpReorder', 'bpUseQty', 'bpUseEvery', 'bpUsePeriod'].forEach((id) => $(id).addEventListener('input', updatePreview));

  // ---- the category manager: the only place where categories are created and removed ----
  const cdlg = $('bpCatDialog');
  const TRASH = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/></svg>';
  function showCats() {
    const ul = $('bpCatRows'); ul.replaceChildren();
    if (!S.cats.length) ul.appendChild(make('li', 'bp-catempty', 'Nenhuma categoria ainda. Crie a primeira abaixo.'));
    S.cats.forEach((c) => {
      const li = make('li', 'bp-catrow');
      li.append(make('span', 'bp-catname', c.label), make('small', '', c.count + (c.count === 1 ? ' item' : ' itens')));
      const rm = make('button', 'bp-catrm'); rm.type = 'button'; rm.innerHTML = TRASH; rm.setAttribute('aria-label', 'Apagar ' + c.label); rm.title = 'Apagar'; rm.onclick = () => delCat(c);
      li.appendChild(rm); ul.appendChild(li);
    });
  }
  function openCats() { $('bpCatNew').value = ''; setErr($('bpCatErr'), ''); showCats(); cdlg.showModal(); $('bpCatNew').focus(); }
  $('bpCats').onclick = openCats;
  $('bpCatClose').onclick = () => cdlg.close();
  cdlg.addEventListener('click', (e) => { if (e.target === cdlg) cdlg.close(); });
  const PT_ERR = { 'that category already exists': 'Essa categoria já existe.', 'give the category a name': 'Dê um nome à categoria.' };
  $('bpCatForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const label = $('bpCatNew').value.trim(); if (!label) return;
    try { const r = await api('/categories', 'POST', { label }); S.cats = r.categories; $('bpCatNew').value = ''; setErr($('bpCatErr'), ''); showCats(); render(); $('bpCatNew').focus(); }
    catch (ex) { setErr($('bpCatErr'), PT_ERR[ex.message] || ex.message); }
  });
  async function delCat(c) {
    const text = c.count ? 'Apagar "' + c.label + '"? ' + (c.count === 1 ? 'O item dela fica' : 'Os ' + c.count + ' itens dela ficam') + ' sem categoria.' : 'Apagar a categoria "' + c.label + '"?';
    if (!(await IgnisConfirm.ask({ title: 'Apagar categoria', text, ok: 'Apagar' }))) return;
    try { await api('/categories/' + encodeURIComponent(c.key), 'DELETE'); if (S.group === c.key) S.group = ''; await load(); showCats(); toast('Categoria apagada', { sub: c.label }); }
    catch (ex) { setErr($('bpCatErr'), ex.message); }
  }

  // ---- bought more / recount ----
  const adlg = $('bpActDialog');
  function openAct(it, kind) {
    S.act = { it, kind };
    const left = leftNow(it, todayKey()), u = it.unit || 'unidades';
    $('bpActTitle').textContent = kind === 'buy' ? 'Comprei mais' : 'Recontar o estoque';
    $('bpActLabel').textContent = kind === 'buy' ? 'Quantos ' + (it.unit ? it.unit : 'unidades') + ' você comprou?' : 'Quanto você tem agora?';
    $('bpActHint').textContent = it.name + ' · restam ' + fmtN(left) + ' ' + u + ' (pelo ritmo de uso)';
    $('bpActVal').value = kind === 'buy' ? '' : fmtN(left).replace(/\./g, '');
    $('bpActSave').textContent = kind === 'buy' ? 'Somar ao estoque' : 'Salvar contagem';
    setErr($('bpActErr'), ''); adlg.showModal(); $('bpActVal').focus(); $('bpActVal').select();
  }
  $('bpActClose').onclick = () => adlg.close();
  adlg.addEventListener('click', (e) => { if (e.target === adlg) adlg.close(); });
  $('bpActForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const { it, kind } = S.act; const v = num($('bpActVal').value);
    if (v == null || Number.isNaN(v) || v < 0 || (kind === 'buy' && v <= 0)) return setErr($('bpActErr'), kind === 'buy' ? 'Diga quantos você comprou (mais que zero).' : 'Diga quanto você tem agora (pode ser 0).');
    try {
      await api('/' + it.id + (kind === 'buy' ? '/buy' : '/count'), 'POST', kind === 'buy' ? { amount: v, day: todayKey() } : { quantity: v, day: todayKey() });
      adlg.close(); await load(); toast(kind === 'buy' ? 'Estoque atualizado' : 'Contagem salva', { sub: it.name });
    } catch (ex) { setErr($('bpActErr'), ex.message); }
  });

  load().catch((e) => { $('bpSub').textContent = ''; $('bpEmpty').textContent = 'Não foi possível carregar a mochila: ' + e.message; $('bpEmpty').hidden = false; });
})();
