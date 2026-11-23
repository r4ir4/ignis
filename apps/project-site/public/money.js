// Money page: transactions imported from a Mercado Pago PDF statement, stored on the Ignis server (/v1/money).
// The PDF is read in the browser (pdf.js, self-hosted under vendor/); only the transactions are sent to the server.
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const make = (tag, cls, text) => { const el = document.createElement(tag); if (cls) el.className = cls; if (text != null) el.textContent = text; return el; };
  const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const fmt0 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  const money = (c) => fmt.format(c / 100), money0 = (c) => fmt0.format(c / 100);
  const parseDay = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const monthName = (k, long) => parseDay(k + '-01').toLocaleDateString('pt-BR', { month: long ? 'long' : 'short', year: 'numeric' });
  const PAGE = 15;

  // Categories. "Reserve" and "Own transfer" move money around and are left out of in / out totals.
  const CATS = { income: 'Renda', interest: 'Rendimentos', food: 'Alimentação', bills: 'Contas', card: 'Fatura do cartão', pay: 'Pagamentos', pix: 'Pix enviado', reserve: 'Reserva', transfer: 'Transferência própria', other: 'Outros' };
  const SKIP = new Set(['reserve', 'transfer']);
  const COLOR = { income: 'var(--b-lime)', interest: 'var(--b-sky)', food: 'var(--b-pink)', bills: 'var(--b-peri)', card: 'var(--b-orange)', pay: '#b79bf7', pix: '#ffa94d', reserve: '#8a5aa8', transfer: '#c9a9bd', other: '#d9c4d2' };
  const EXTRA = ['#6b3fa0', '#ff7a9c', '#f0c14a', '#9b6bd1', '#e65f9a', '#c9a9bd', '#ffa94d', '#b79bf7'];
  const norm = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const label = (c) => CATS[c] || c;
  const color = (c) => { if (COLOR[c]) return COLOR[c]; let h = 0; for (const ch of c) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return EXTRA[h % EXTRA.length]; };
  function builtin(t) {
    const d = t.description;
    if (/reserva|reservado/i.test(d)) return 'reserve';
    if (/^rendimentos/i.test(d)) return 'interest';
    if (t.amount_cents > 0) return 'income';
    if (/fatura/i.test(d)) return 'card';
    if (/ifood|restaurante|lanchonete|padaria|pizza|burger|mercado|supermercado/i.test(d)) return 'food';
    if (/claro|vivo\b|tim\b|oi\b|enel|energia|internet|agua|água|condom|rede nordeste|net\s/i.test(d)) return 'bills';
    if (/^pix enviado/i.test(d)) return 'pix';
    if (/^pagamento/i.test(d)) return 'pay';
    return 'other';
  }
  // A transaction's category: what you set on it, else the longest matching rule, else a built-in guess.
  function ruleFor(t) {
    const d = norm(t.description); let best = null;
    S.rules.forEach((r) => { const m = norm(r.match); if (m && d.includes(m) && (!best || m.length > norm(best.match).length)) best = r; });
    return best;
  }
  const catOf = (t) => t.category || (ruleFor(t) || {}).category || builtin(t);
  const allCats = () => [...new Set([...Object.keys(CATS), ...S.rules.map((r) => r.category), ...S.all.map((t) => t.category).filter(Boolean)])];

  const S = { all: [], rules: [], months: [], month: null, filter: 'all', page: 0, parsed: null, editRule: null };

  async function api(path, method, body) {
    const init = { method: method || 'GET', headers: {} };
    if (body) { init.body = JSON.stringify(body); init.headers['Content-Type'] = 'application/json'; }
    const res = await fetch('api/v1/money' + path, init);
    if (!res.ok) {
      let detail = ''; try { const j = await res.json(); if (typeof j.detail === 'string') detail = j.detail; } catch (e) { /* not json */ }
      throw new Error(detail || 'Algo deu errado (' + res.status + ').');
    }
    return res.status === 204 ? null : res.json();
  }
  let toastTimer;
  function toast(text) { const el = $('toast'); el.textContent = text; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 3200); }

  async function load() {
    const d = await api('?limit=5000');
    S.all = d.transactions; S.months = d.months; try { S.rules = (await api('/rules')).rules; S.rulesOk = true; } catch (e) { S.rules = []; S.rulesOk = false; }
    if (!S.month || !S.months.includes(S.month)) S.month = S.months[0] || null;
  }
  const inMonth = (m) => S.all.filter((t) => t.day.startsWith(m));
  function totals(list) {
    let inn = 0, out = 0, res = 0;
    list.forEach((t) => { const c = catOf(t); if (c === 'reserve') res += -t.amount_cents; else if (!SKIP.has(c)) { if (t.amount_cents > 0) inn += t.amount_cents; else out += -t.amount_cents; } });
    return { inn, out, res };
  }

  function render() {
    const has = S.all.length > 0;
    $('mnEmpty').hidden = has;
    const month = S.month ? inMonth(S.month) : [];
    const tt = totals(month);
    $('mnIn').textContent = money0(tt.inn); $('mnOut').textContent = money0(tt.out); $('mnNet').textContent = money0(tt.inn - tt.out); $('mnRes').textContent = money0(tt.res);
    $('mnTitle').textContent = S.month ? monthName(S.month, true) : 'Transações';

    const mp = $('mnMonths'); mp.replaceChildren(); mp.hidden = S.months.length < 2;
    S.months.forEach((m) => { const b = make('button', '', monthName(m)); b.type = 'button'; b.setAttribute('aria-pressed', String(m === S.month)); b.onclick = () => { S.month = m; S.page = 0; render(); }; mp.appendChild(b); });
    const fp = $('mnFilter'); fp.replaceChildren(); fp.hidden = !has;
    [['all', 'Todas'], ['in', 'Entradas'], ['out', 'Saídas']].forEach(([k, l]) => { const b = make('button', '', l); b.type = 'button'; b.setAttribute('aria-pressed', String(S.filter === k)); b.onclick = () => { S.filter = k; S.page = 0; render(); }; fp.appendChild(b); });

    const rows = month.filter((t) => S.filter === 'all' || (S.filter === 'in' ? t.amount_cents > 0 : t.amount_cents < 0));
    const list = $('mnList'); list.replaceChildren();
    const pages = Math.max(1, Math.ceil(rows.length / PAGE));
    if (S.page > pages - 1) S.page = pages - 1;
    rows.slice(S.page * PAGE, S.page * PAGE + PAGE).forEach((t, i) => {
      const c = catOf(t);
      const li = make('li', 'bd-row mn-row'); li.style.setProperty('--i', Math.min(i, 12)); li.style.setProperty('--dot', color(c));
      const name = make('div', 'bd-rname'); name.appendChild(make('b', '', t.description));
      name.appendChild(make('span', '', parseDay(t.day).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })));
      const amt = make('div', 'bd-amt' + (t.amount_cents > 0 ? ' in' : ''), (t.amount_cents > 0 ? '+' : '') + money(t.amount_cents));
      const rule = t.category ? null : ruleFor(t);
      if (rule && rule.recurring) name.lastChild.textContent += ' · mensal';
      const sel = make('select', 'mn-cat'); sel.setAttribute('aria-label', 'Category');
      allCats().forEach((k) => { const o = make('option', '', label(k)); o.value = k; sel.appendChild(o); });
      const nr = make('option', '', '＋ Criar uma regra a partir disso…'); nr.value = '__rule'; sel.appendChild(nr);
      sel.value = c;
      sel.onchange = async () => {
        if (sel.value === '__rule') { sel.value = c; openRule(null, t); return; }
        try { await api('/' + t.id, 'PATCH', { category: sel.value }); t.category = sel.value; render(); } catch (e) { toast(e.message); sel.value = c; }
      };
      li.append(make('span', 'bd-dot'), name, amt, sel); list.appendChild(li);
    });
    const pg = $('mnPager'); pg.replaceChildren(); pg.hidden = pages < 2;
    if (pages > 1) {
      const go = (p) => { S.page = Math.max(0, Math.min(pages - 1, p)); render(); $('mnList').scrollIntoView({ block: 'start', behavior: 'smooth' }); };
      const btn = (text, p, opts = {}) => { const b = make('button', opts.cur ? 'on' : '', text); b.type = 'button'; b.disabled = !!opts.off; if (opts.cur) b.setAttribute('aria-current', 'page'); if (opts.aria) b.setAttribute('aria-label', opts.aria); b.onclick = () => go(p); return b; };
      pg.appendChild(btn('‹', S.page - 1, { off: S.page === 0, aria: 'Página anterior' }));
      const nums = [...new Set([0, S.page - 1, S.page, S.page + 1, pages - 1])].filter((n) => n >= 0 && n < pages).sort((x, y) => x - y);
      nums.forEach((n, k) => { if (k && n - nums[k - 1] > 1) pg.appendChild(make('span', 'gap', '…')); pg.appendChild(btn(String(n + 1), n, { cur: n === S.page })); });
      pg.appendChild(btn('›', S.page + 1, { off: S.page === pages - 1, aria: 'Próxima página' }));
      pg.appendChild(make('small', '', (S.page * PAGE + 1) + '–' + Math.min(rows.length, (S.page + 1) * PAGE) + ' de ' + rows.length));
    }

    // where the money went (this month's spending)
    const by = {}; month.forEach((t) => { const c = catOf(t); if (t.amount_cents < 0 && !SKIP.has(c)) by[c] = (by[c] || 0) - t.amount_cents; });
    const ent = Object.entries(by).sort((a, b) => b[1] - a[1]), max = ent.length ? ent[0][1] : 1, sum = ent.reduce((s, e) => s + e[1], 0) || 1;
    $('mnBreakEmpty').hidden = ent.length > 0;
    $('mnTotal').textContent = ent.length ? money(sum) + ' gastos' : '';
    const bars = $('mnBreak'); bars.replaceChildren();
    ent.forEach(([c, v]) => {
      const li = make('li', 'bd-bar'); const top = make('div'); top.append(document.createTextNode(label(c)), make('em', '', money(v)), make('small', '', Math.round((v / sum) * 100) + '%'));
      const track = make('span'); const fill = make('i'); fill.style.setProperty('--w', Math.round((v / max) * 100) + '%'); fill.style.setProperty('--c', color(c));
      track.appendChild(fill); li.append(top, track); bars.appendChild(li);
    });
    const bm = $('mnByMonth'); bm.replaceChildren();
    renderRules();
    $('mnRuleAdd').hidden = !S.rulesOk; if (!S.rulesOk) { $('mnRulesEmpty').hidden = false; $('mnRulesEmpty').textContent = 'As regras precisam de uma atualização do servidor que ainda não foi instalada.'; }
    S.months.forEach((m) => { const t = totals(inMonth(m)); const li = make('li'); li.append(make('b', '', monthName(m, true)), make('span', 'i', '+' + money0(t.inn)), make('span', 'o', '−' + money0(t.out))); bm.appendChild(li); });
  }

  // ---- rules ----
  function renderRules() {
    const ul = $('mnRules'); ul.replaceChildren(); $('mnRulesEmpty').hidden = S.rules.length > 0;
    S.rules.forEach((r) => {
      const n = S.all.filter((t) => !t.category && ruleFor(t) === r).length;
      const li = make('li'); const txt = make('div'); txt.append(make('b', '', r.match), make('span', '', '→ ' + label(r.category) + (r.recurring ? ' · mensal' : '') + ' · ' + n + (n === 1 ? ' ocorrência' : ' ocorrências')));
      const ed = make('button', 'mn-edit', 'Editar'); ed.type = 'button'; ed.onclick = () => openRule(r);
      li.append(txt, ed); ul.appendChild(li);
    });
  }
  const ruleDlg = $('mnRuleDialog');
  const cleanMatch = (d) => d.replace(/^(pix enviado|pix recebido|pagamento com pix|pagamento de|pagamento)\s+/i, '').replace(/\s*\d{4,}.*$/, '').trim();
  function ruleHint() {
    const m = norm($('mnRuleMatch').value.trim());
    const n = m.length >= 2 ? S.all.filter((t) => norm(t.description).includes(m)).length : 0;
    $('mnRuleHint').textContent = m.length < 2 ? 'Digite parte da descrição, por exemplo um nome ou uma loja.' : 'Encontra ' + n + (n === 1 ? ' transação salva.' : ' transações salvas.');
  }
  function openRule(rule, tx) {
    S.editRule = rule || null;
    $('mnRuleTitle').textContent = rule ? 'Editar regra' : 'Nova regra';
    $('mnRuleMatch').value = rule ? rule.match : tx ? cleanMatch(tx.description) : '';
    $('mnRuleCat').value = rule ? label(rule.category) : '';
    $('mnRuleRec').checked = rule ? rule.recurring : false;
    $('mnRuleDelete').hidden = !rule; $('mnRuleErr').hidden = true;
    const dl = $('mnRuleCats'); dl.replaceChildren(); allCats().forEach((k) => { const o = make('option'); o.value = label(k); dl.appendChild(o); });
    ruleHint(); ruleDlg.showModal(); $(rule || tx ? 'mnRuleCat' : 'mnRuleMatch').focus();
  }
  $('mnRuleAdd').onclick = () => openRule(null);
  $('mnRuleClose').onclick = () => ruleDlg.close();
  $('mnRuleMatch').addEventListener('input', ruleHint);
  const keyFor = (text) => { const t = text.trim(), hit = Object.keys(CATS).find((k) => norm(CATS[k]) === norm(t)); return hit || t; };
  $('mnRuleForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const match = $('mnRuleMatch').value.trim(), cat = keyFor($('mnRuleCat').value);
    const m = match.length < 2 ? 'Digite pelo menos duas letras.' : !cat ? 'Escolha ou digite uma categoria.' : '';
    if (m) { $('mnRuleErr').textContent = m; $('mnRuleErr').hidden = false; return; }
    try {
      const body = { match, category: cat, recurring: $('mnRuleRec').checked };
      if (S.editRule) await api('/rules/' + S.editRule.id, 'PATCH', body); else await api('/rules', 'POST', body);
      ruleDlg.close(); await load(); render(); toast('Regra salva.');
    } catch (ex) { $('mnRuleErr').textContent = ex.message; $('mnRuleErr').hidden = false; }
  });
  $('mnRuleDelete').onclick = async () => {
    if (!S.editRule || !(await IgnisConfirm.ask({ title: 'Apagar regra', text: 'Apagar esta regra? As transações voltam à categoria automática.' }))) return;
    try { await api('/rules/' + S.editRule.id, 'DELETE'); ruleDlg.close(); await load(); render(); toast('Rule deleted.'); } catch (ex) { toast(ex.message); }
  };

  // ---- import ----
  const dlg = $('mnDialog');
  const err = (m) => { $('mnErr').textContent = m; $('mnErr').hidden = !m; };
  function resetDialog() { S.parsed = null; err(''); $('mnStep1').hidden = false; $('mnStep2').hidden = true; $('mnSave').hidden = true; $('mnBack').hidden = true; $('mnFile').value = ''; $('mnDrop').classList.remove('over'); }
  $('mnImport').onclick = () => { resetDialog(); dlg.showModal(); };
  $('mnClose').onclick = () => dlg.close();
  $('mnBack').onclick = resetDialog;

  let pdfReady;
  function loadPdfjs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    return pdfReady || (pdfReady = new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = 'vendor/pdfjs-3.11.174/pdf.min.js';
      s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs-3.11.174/pdf.worker.min.js'; res(window.pdfjsLib); };
      s.onerror = () => rej(new Error('Não foi possível carregar o leitor de PDF.')); document.head.appendChild(s);
    }));
  }
  async function readPdf(file) {
    const lib = await loadPdfjs();
    const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const pages = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const p = await doc.getPage(n), vp = p.getViewport({ scale: 1 }), tc = await p.getTextContent();
      pages.push({ items: tc.items.filter((i) => 'str' in i).map((i) => ({ x: i.transform[4], y: vp.height - i.transform[5], s: i.str })) });
    }
    return MoneyParse.parseStatement(pages);
  }
  async function handleFile(file) {
    err('');
    if (!file) return;
    if (!/pdf$/i.test(file.name) && file.type !== 'application/pdf') { err('Este não é um arquivo PDF.'); return; }
    $('mnDrop').querySelector('b').textContent = 'Reading…';
    try {
      const r = await readPdf(file);
      if (!r.rows.length) throw new Error('Nenhuma transação encontrada. Este é um PDF de “Extrato de conta” do Mercado Pago?');
      S.parsed = r; showPreview(r);
    } catch (e) { err(e.message || 'Não foi possível ler esse arquivo.'); }
    $('mnDrop').querySelector('b').textContent = 'Choose the PDF';
  }
  function showPreview(r) {
    $('mnStep1').hidden = true; $('mnStep2').hidden = false; $('mnSave').hidden = false; $('mnBack').hidden = false;
    $('mnSave').textContent = 'Salvar ' + r.rows.length + ' transações';
    const sum = $('mnSum'); sum.replaceChildren();
    [['Transações', String(r.rows.length)], ['Entradas', money(r.totals.in)], ['Saídas', money(-r.totals.out)]].forEach(([l, v]) => { const d = make('div'); d.append(make('small', '', l), make('b', '', v)); sum.appendChild(d); });
    const ok = r.checks.balanceChain && r.checks.totals && r.checks.finalBalance && !r.warnings.length;
    const c = $('mnCheck'); c.className = 'mn-check ' + (ok ? 'ok' : 'warn');
    c.textContent = ok ? '✓ Todos os saldos e os totais do extrato batem, então nada ficou de fora.'
      : '⚠ Algo não bate (' + (r.checks.brokenLinks ? r.checks.brokenLinks + ' saldos não conferem. ' : '') + (r.warnings[0] || 'Os totais diferem do resumo do extrato.') + ') Confira a lista antes de salvar.';
    const pv = $('mnPrev'); pv.replaceChildren();
    r.rows.slice(0, 40).forEach((t) => { const li = make('li'); li.append(make('span', 'd', t.day.slice(8) + '/' + t.day.slice(5, 7)), make('span', 't', t.description), make('span', 'a', money(t.amount_cents))); pv.appendChild(li); });
    if (r.rows.length > 40) pv.appendChild(make('li', '', '…e mais ' + (r.rows.length - 40))).style.color = 'inherit';
  }
  $('mnFile').onchange = (e) => handleFile(e.target.files[0]);
  const drop = $('mnDrop');
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => handleFile(e.dataTransfer.files[0]));
  $('mnForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!S.parsed) return;
    const btn = $('mnSave'); btn.disabled = true; err('');
    try {
      let added = 0, skipped = 0;
      const items = S.parsed.rows.map((t) => ({ day: t.day, description: t.description.slice(0, 300), amount_cents: t.amount_cents, balance_cents: t.balance_cents, ref: t.ref, fingerprint: t.fingerprint }));
      for (let i = 0; i < items.length; i += 400) { const r = await api('/import', 'POST', { source: 'mercadopago', items: items.slice(i, i + 400) }); added += r.added; skipped += r.skipped; }
      dlg.close(); await load(); if (S.parsed.header && S.parsed.header.to) S.month = S.parsed.header.to.slice(0, 7); render();
      toast('Salvei ' + added + ' transações' + (skipped ? ' (' + skipped + ' já existiam)' : '') + '.');
    } catch (ex) { err(ex.message); } finally { btn.disabled = false; }
  });

  load().then(render).catch((e) => { render(); $('mnEmpty').textContent = 'Não foi possível carregar: ' + e.message; $('mnEmpty').hidden = false; });
})();
