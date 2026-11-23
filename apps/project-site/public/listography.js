// Listography: any number of lists, each a checklist of short items. Meant for drafting things before they are goals
// (for example "stop eating sugar"). Everything lives on the Ignis server (/v1/lists).
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const make = (tag, cls, text) => { const el = document.createElement(tag); if (cls) el.className = cls; if (text != null) el.textContent = text; return el; };
  const toast = (text, opts) => { if (window.IgnisToast) window.IgnisToast.show(text, opts); };

  async function api(path, method, body) {
    const init = { method: method || 'GET', headers: {} };
    if (body) { init.body = JSON.stringify(body); init.headers['Content-Type'] = 'application/json'; }
    const res = await fetch('api/v1/lists' + path, init);
    if (!res.ok) {
      let detail = ''; try { const j = await res.json(); if (typeof j.detail === 'string') detail = j.detail; } catch (e) { /* not json */ }
      throw new Error(detail || 'Algo deu errado (' + res.status + ').');
    }
    return res.status === 204 ? null : res.json();
  }

  const S = { lists: [], sel: null, editing: false };
  const byId = (id) => S.lists.find((l) => l.id === id);
  const counts = (l) => ({ done: l.items.filter((i) => i.done).length, total: l.items.length });
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
  const replaceList = (l) => { const i = S.lists.findIndex((x) => x.id === l.id); if (i >= 0) S.lists[i] = l; else S.lists.push(l); };
  // links: an item's text can hold links, stored as [label](https://address). Select some text while writing and press Link.
  // an address may contain (balanced) parentheses, e.g. a product named "Mochila (preta)"
  const MD = /\[([^\]]*)\]\((https?:\/\/(?:[^()\s]|\([^()\s]*\))+)\)/gi;
  const plain = (s) => (s || '').replace(MD, '$1');
  const normUrl = (v) => { v = (v || '').trim(); if (!v) return ''; return /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : 'https://' + v; };
  const okUrl = (v) => { try { const u = new URL(v); return u.protocol === 'http:' || u.protocol === 'https:'; } catch (e) { return false; } };
  function renderInto(el, md) {   // text with links -> text nodes and <a>
    el.replaceChildren();
    let last = 0; md = md || '';
    for (const m of md.matchAll(MD)) {
      if (m.index > last) el.append(document.createTextNode(md.slice(last, m.index)));
      const a = document.createElement('a'); a.href = m[2]; a.textContent = m[1] || m[2]; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.title = m[2];
      el.append(a); last = m.index + m[0].length;
    }
    if (last < md.length) el.append(document.createTextNode(md.slice(last)));
  }
  function toMd(el) {
    let out = '';
    el.childNodes.forEach((n) => {
      if (n.nodeType === 3) out += n.nodeValue;
      else if (n.nodeName === 'A') out += '[' + n.textContent.replace(/[\[\]]/g, '') + '](' + n.getAttribute('href').replace(/\s/g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29') + ')';
      else if (n.nodeName === 'BR') out += ' ';
      else out += toMd(n);
    });
    return out;
  }
  // a one-line editor where selected text can become a link
  function linkEditor(md, o) {
    o = o || {};
    const wrap = make('div', 'ls-le');
    const ed = make('div', 'ls-input ls-ce'); ed.contentEditable = 'true'; ed.setAttribute('role', 'textbox'); ed.setAttribute('aria-label', o.label || 'Texto'); ed.dataset.placeholder = o.placeholder || '';
    renderInto(ed, md);
    const bar = make('div', 'ls-lbar'); bar.hidden = true;
    const url = make('input', 'ls-lurl'); url.type = 'text'; url.placeholder = 'Cole o link'; url.inputMode = 'url'; url.setAttribute('aria-label', 'Endereço do link');
    const ok = make('button', 'ls-lok', 'Link'); ok.type = 'button';
    const rm = make('button', 'ls-lrm', 'Remover'); rm.type = 'button'; rm.hidden = true;
    bar.append(url, ok, rm); wrap.append(ed, bar);
    let range = null;
    const inEd = (n) => n && ed.contains(n);
    const anchorOf = (n) => { while (n && n !== ed) { if (n.nodeName === 'A') return n; n = n.parentNode; } return null; };
    function showBar() {
      const sel = window.getSelection();
      if (!sel.rangeCount) return hide();
      const r = sel.getRangeAt(0);
      if (!inEd(r.startContainer) || !inEd(r.endContainer)) return hide();
      const a = anchorOf(r.startContainer);
      if (r.collapsed && !a) return hide();
      range = r.cloneRange();
      url.value = a ? a.getAttribute('href') : '';
      ok.textContent = a ? 'Atualizar' : 'Link'; rm.hidden = !a;
      bar.hidden = false;
      const box = (a ? a.getBoundingClientRect() : r.getBoundingClientRect()), wb = wrap.getBoundingClientRect();
      bar.style.top = (box.bottom - wb.top + 6) + 'px';
      bar.style.left = Math.max(0, Math.min(box.left - wb.left, wb.width - bar.offsetWidth)) + 'px';
    }
    function hide() { bar.hidden = true; range = null; }
    const onSel = () => { if (!wrap.isConnected) { document.removeEventListener('selectionchange', onSel); return; } if (bar.contains(document.activeElement)) return; showBar(); };
    document.addEventListener('selectionchange', onSel);
    function apply() {
      const v = normUrl(url.value);
      if (!range) return;
      if (!v) return remove();
      if (!okUrl(v)) { url.setCustomValidity('x'); url.classList.add('bad'); url.focus(); return; }
      url.classList.remove('bad');
      const a = anchorOf(range.startContainer);
      if (a) { a.setAttribute('href', v); a.title = v; }
      else {
        const link = document.createElement('a'); link.href = v; link.title = v; link.target = '_blank'; link.rel = 'noopener noreferrer';
        const frag = range.extractContents();
        link.append(frag); link.querySelectorAll('a').forEach((x) => x.replaceWith(...x.childNodes));
        range.insertNode(link);
      }
      ed.normalize(); hide(); ed.focus();
      const s = window.getSelection(); s.removeAllRanges();
      ed.dispatchEvent(new Event('input', { bubbles: true }));
    }
    function remove() {
      const a = range && anchorOf(range.startContainer);
      if (a) { a.replaceWith(...a.childNodes); ed.normalize(); }
      hide(); ed.focus(); ed.dispatchEvent(new Event('input', { bubbles: true }));
    }
    ok.addEventListener('mousedown', (e) => e.preventDefault());
    rm.addEventListener('mousedown', (e) => e.preventDefault());
    ok.onclick = apply; rm.onclick = remove;
    url.addEventListener('input', () => url.classList.remove('bad'));
    url.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); apply(); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); hide(); ed.focus(); } });
    ed.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('a')) e.preventDefault(); });
    ed.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); showBar(); if (!bar.hidden) url.focus(); return; }
      if (e.key === 'Enter') { e.preventDefault(); o.onEnter && o.onEnter(); }
      else if (e.key === 'Escape') { o.onEscape && o.onEscape(); }
    });
    ed.addEventListener('paste', (e) => {
      e.preventDefault();
      const t = ((e.clipboardData || window.clipboardData).getData('text') || '');
      const sel = window.getSelection();
      if (sel.rangeCount && !sel.getRangeAt(0).collapsed && /^\s*(https?:\/\/\S+|www\.\S+)\s*$/i.test(t)) { range = sel.getRangeAt(0).cloneRange(); url.value = t.trim(); apply(); return; }
      if (o.onPasteLines && /\r?\n/.test(t.trim())) { o.onPasteLines(t); return; }
      document.execCommand('insertText', false, t.replace(/\s*\r?\n\s*/g, ' '));
    });
    return { el: wrap, ed, value: () => toMd(ed).replace(/\s+/g, ' ').trim(), clear: () => { ed.replaceChildren(); }, focus: () => ed.focus(), setDisabled: (d) => { ed.contentEditable = d ? 'false' : 'true'; } };
  }
  const guard = async (fn) => { try { return await fn(); } catch (e) { toast(e.message, { type: 'warn' }); return null; } };

  async function load() {
    S.lists = (await api('')).lists;
    route();
  }

  function route() {
    const id = decodeURIComponent(location.hash.slice(1));
    S.sel = byId(id) ? id : null;
    S.editing = false;
    render();
  }
  window.addEventListener('hashchange', route);
  const open = (id) => { location.hash = id; };
  const close = () => { history.pushState('', document.title, location.pathname + location.search); route(); };

  function render() {
    const total = S.lists.reduce((n, l) => n + l.items.length, 0);
    $('lsSub').textContent = S.lists.length ? plural(S.lists.length, 'lista', 'listas') + ' · ' + plural(total, 'item', 'itens') : 'Rascunhe metas, ideias e planos antes de virarem algo.';
    $('lsEmpty').hidden = true;
    const detail = !!byId(S.sel);
    if (detail) {
      const bk = make('button', 'ls-hback'); bk.type = 'button'; bk.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>Todas as listas'; bk.onclick = close;
      $('lsSub').replaceChildren(bk);
    }
    $('lsCards').hidden = detail; $('lsDetail').hidden = !detail;
    document.title = detail ? byId(S.sel).title + ' · Ignis' : 'Listography · Ignis';
    if (detail) renderDetail(); else renderCards();
  }

  function renderCards() {
    const ul = $('lsCards'); ul.replaceChildren();
    S.lists.forEach((l) => {
      const c = counts(l);
      const li = make('li', 'ls-card-wrap');
      const b = make('button', 'ls-card'); b.type = 'button'; b.setAttribute('aria-label', 'Abrir a lista ' + l.title);
      b.appendChild(make('h3', '', l.title));
      if (l.note) b.appendChild(make('p', 'ls-cn', l.note));
      const pv = make('ul', 'ls-pv');
      l.items.slice(0, 4).forEach((it) => pv.appendChild(make('li', it.done ? 'done' : '', plain(it.text))));
      if (!l.items.length) pv.appendChild(make('li', 'none', 'Lista vazia'));
      else if (l.items.length > 4) pv.appendChild(make('li', 'more', '+' + (l.items.length - 4) + ' ' + (l.items.length - 4 === 1 ? 'item' : 'itens')));
      b.appendChild(pv);
      const foot = make('div', 'ls-cf');
      const bar = make('i'); const fill = make('b'); fill.style.width = (c.total ? Math.round((c.done / c.total) * 100) : 0) + '%'; bar.appendChild(fill);
      foot.append(bar, make('small', '', c.total ? c.done + '/' + c.total : '0 itens'));
      b.appendChild(foot);
      b.onclick = () => open(l.id);
      li.appendChild(b); ul.appendChild(li);
    });
    const nw = make('li', 'ls-card-wrap');
    const nb = make('button', 'ls-card ls-card-new'); nb.type = 'button'; nb.innerHTML = '<span aria-hidden="true">+</span><b>Nova lista</b>';
    nb.onclick = openNew; nw.appendChild(nb); ul.appendChild(nw);
  }

  function renderDetail() {
    const box = $('lsDetail'); box.replaceChildren();
    const l = byId(S.sel);
    const head = make('header', 'ls-dh');
    if (S.editing) {
      const t = make('input', 'ls-input ls-edit-title'); t.value = l.title; t.maxLength = 120; t.setAttribute('aria-label', 'Título da lista');
      const n = make('input', 'ls-input'); n.value = l.note || ''; n.maxLength = 1000; n.placeholder = 'Nota (opcional)'; n.setAttribute('aria-label', 'Nota da lista');
      const row = make('div', 'ls-dacts');
      const ok = make('button', 'ls-btn primary', 'Salvar'); ok.type = 'button';
      const no = make('button', 'ls-btn', 'Cancelar'); no.type = 'button';
      const save = async () => { if (!t.value.trim()) { t.focus(); return; } const r = await guard(() => api('/' + l.id, 'PATCH', { title: t.value.trim(), note: n.value.trim() })); if (r) { replaceList(r); S.editing = false; render(); } };
      ok.onclick = save; no.onclick = () => { S.editing = false; render(); };
      [t, n].forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } else if (e.key === 'Escape') { S.editing = false; render(); } }));
      head.append(t, n, row); row.append(ok, no);
      box.appendChild(head); setTimeout(() => t.focus(), 0);
    } else {
      const top = make('div', 'ls-dtop');
      const ttl = make('div', 'ls-dtl'); ttl.append(make('h2', 'ls-dt', l.title));
      top.appendChild(ttl);
      const acts = make('div', 'ls-dacts');
      const ed = make('button', 'ls-btn', 'Editar'); ed.type = 'button'; ed.onclick = () => { S.editing = true; render(); };
      const del = make('button', 'ls-btn danger', 'Apagar'); del.type = 'button'; del.onclick = () => askDelete(l);
      const bulk = make('button', 'ls-ib'); bulk.type = 'button'; bulk.setAttribute('aria-label', 'Adicionar vários itens de uma vez'); bulk.title = 'Adicionar vários itens de uma vez';
      bulk.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h11M4 12h8M4 18h8M17 14v6M14 17h6"/></svg>'; bulk.onclick = () => openBulk(l);
      acts.append(bulk, ed, del); top.appendChild(acts);
      head.appendChild(top);
      if (l.note) head.appendChild(make('p', 'ls-dn', l.note));
      box.appendChild(head);
    }

    const c = counts(l);
    const prog = make('div', 'ls-prog');
    prog.appendChild(make('span', '', c.total ? c.done + ' de ' + plural(c.total, 'item', 'itens') + ' feitos' : 'Nenhum item ainda'));
    const bar = make('i'); const fill = make('b'); fill.style.width = (c.total ? Math.round((c.done / c.total) * 100) : 0) + '%'; bar.appendChild(fill); prog.appendChild(bar);
    if (c.done) { const clr = make('button', 'ls-link', 'Limpar concluídos'); clr.type = 'button'; clr.onclick = () => clearDone(l); prog.appendChild(clr); }
    box.appendChild(prog);

    const ul = make('ul', 'ls-items');
    l.items.forEach((it) => ul.appendChild(itemRow(l, it)));
    box.appendChild(ul);

    const add = make('div', 'ls-add');
    const submitLines = async (lines) => {
      lines = lines.map((t) => t.trim()).filter(Boolean);
      if (!lines.length) return;
      ed.setDisabled(true);
      const r = await guard(() => api('/' + l.id + '/items', 'POST', { texts: lines }));
      if (r) { replaceList(r); render(); const n = document.querySelector('#lsAdd .ls-ce'); if (n) n.focus(); } else { ed.setDisabled(false); ed.focus(); }
    };
    const ed = linkEditor('', { label: 'Novo item', placeholder: 'Adicionar um item e apertar Enter… (selecione um trecho para colocar um link)', onEnter: () => submitLines([ed.value()]), onPasteLines: (t) => submitLines(t.split(/\r?\n/)) });
    ed.el.id = 'lsAdd';
    const btn = make('button', 'ls-btn primary', 'Adicionar'); btn.type = 'button';
    btn.onclick = () => submitLines([ed.value()]);
    add.append(ed.el, btn); box.appendChild(add);
  }

  const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  function itemRow(l, it) {
    const li = make('li', 'ls-item' + (it.done ? ' done' : ''));
    const ck = make('button', 'ls-check'); ck.type = 'button'; ck.innerHTML = CHECK; ck.setAttribute('aria-pressed', String(it.done)); ck.setAttribute('aria-label', (it.done ? 'Desmarcar: ' : 'Marcar como feito: ') + plain(it.text));
    ck.onclick = async () => {
      const was = it.done; it.done = !was; render();
      const r = await guard(() => api('/items/' + it.id, 'PATCH', { done: it.done }));
      if (!r) { it.done = was; render(); }
    };
    const tx = make('span', 'ls-text'); renderInto(tx, it.text); tx.tabIndex = 0; tx.title = 'Clique para editar';
    const edit = () => {
      let finished = false;
      const done = async (keep) => {
        if (finished) return; finished = true;
        const v = le.value();
        if (keep && v && v !== it.text) { const r = await guard(() => api('/items/' + it.id, 'PATCH', { text: v })); if (r) it.text = r.text; }
        render();
      };
      const le = linkEditor(it.text, { label: 'Editar item', onEnter: () => done(true), onEscape: () => done(false) });
      le.el.classList.add('ls-inline');
      tx.replaceWith(le.el); le.focus();
      const s = window.getSelection(); s.selectAllChildren(le.ed); s.collapseToEnd();
      le.el.addEventListener('focusout', (e) => { if (!e.relatedTarget || !le.el.contains(e.relatedTarget)) setTimeout(() => { if (!le.el.contains(document.activeElement)) done(true); }, 0); });
    };
    tx.onclick = (e) => { if (e.target.closest('a')) return; edit(); }; tx.onkeydown = (e) => { if (e.key === 'Enter') edit(); };
    const rm = make('button', 'ls-rm'); rm.type = 'button'; rm.setAttribute('aria-label', 'Remover: ' + plain(it.text)); rm.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    rm.onclick = async () => {
      const idx = l.items.indexOf(it); l.items.splice(idx, 1); render();
      const r = await guard(() => api('/items/' + it.id, 'DELETE'));
      if (r === null) { /* 204 returns null too */ }
      toast('Item removido', { sub: plain(it.text), undo: async () => { const back = await api('/' + l.id + '/items', 'POST', { texts: [it.text] }); replaceList(back); if (it.done) { const added = back.items[back.items.length - 1]; await api('/items/' + added.id, 'PATCH', { done: true }); added.done = true; } render(); } });
    };
    li.append(ck, tx, rm);
    return li;
  }

  async function clearDone(l) {
    const done = l.items.filter((i) => i.done);
    for (const it of done) { await guard(() => api('/items/' + it.id, 'DELETE')); }
    l.items = l.items.filter((i) => !i.done); render();
    toast(plural(done.length, 'item removido', 'itens removidos'), { sub: l.title });
  }

  // ---- new list dialog ----
  const dlg = $('lsDialog');
  function openNew() { $('lsTitle').value = ''; $('lsNote').value = ''; $('lsItems').value = ''; $('lsErr').hidden = true; dlg.showModal(); $('lsTitle').focus(); }
  $('lsNew').onclick = openNew;
  $('lsClose').onclick = () => dlg.close();
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  $('lsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = $('lsTitle').value.trim();
    if (!title) { $('lsErr').textContent = 'Dê um título à lista.'; $('lsErr').hidden = false; return; }
    const items = $('lsItems').value.split(/\r?\n/).map((t) => t.trim()).filter(Boolean);
    const r = await guard(() => api('', 'POST', { title, note: $('lsNote').value.trim(), items }));
    if (!r) return;
    replaceList(r); dlg.close(); open(r.id); toast('Lista criada', { sub: title });
  });

  // ---- add many items at once: one per line ----
  const bdlg = $('lsBulkDialog'); let bulkList = null;
  // a line may start with "1. ", "12) ", "- ", "* " or "• "; "2020 Election" and "9/11" are left alone
  const stripMark = (t) => t.replace(/^\s*(?:\d+[.)]\s+|[-*\u2022\u2013]\s+)/, '');
  const norm = (s) => plain(s).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  // the lines to add, and (when asked) the ones left out because they are already in the list or repeated in the paste
  function bulkPlan() {
    const strip = $('lsBulkStrip').checked, dedupe = $('lsBulkDedupe').checked;
    const lines = $('lsBulkText').value.split(/\r?\n/).map((t) => (strip ? stripMark(t) : t).trim()).filter(Boolean);
    if (!dedupe) return { add: lines, inList: [], repeated: [] };
    const seen = new Set((bulkList ? bulkList.items : []).map((i) => norm(i.text))), add = [], inList = [], repeated = [], pasted = new Set();
    lines.forEach((t) => {
      const k = norm(t);
      if (seen.has(k)) inList.push(t); else if (pasted.has(k)) repeated.push(t); else { add.push(t); pasted.add(k); }
    });
    return { add, inList, repeated };
  }
  function bulkCount() {
    const p = bulkPlan(), n = p.add.length, skipped = p.inList.length + p.repeated.length;
    $('lsBulkNew').textContent = String(n); $('lsBulkInList').textContent = String(p.inList.length); $('lsBulkRep').textContent = String(p.repeated.length);
    $('lsBulkGo').textContent = n ? 'Adicionar ' + plural(n, 'item', 'itens') : 'Adicionar itens';
    const box = $('lsBulkDupes'); box.hidden = !skipped;
    if (skipped) {
      $('lsBulkDupesSum').textContent = 'Ignorados (' + skipped + ')';
      const ul = $('lsBulkDupesList'); ul.replaceChildren();
      [...p.inList.map((t) => [t, 'já está na lista']), ...p.repeated.map((t) => [t, 'repetido'])].slice(0, 100).forEach(([t, why]) => { const li = make('li'); li.append(make('span', '', t), make('em', '', why)); ul.appendChild(li); });
      if (skipped > 100) ul.appendChild(make('li', 'more', '+' + (skipped - 100) + ' outros'));
    }
  }
  function openBulk(l) { bulkList = l; $('lsBulkText').value = ''; $('lsBulkErr').hidden = true; bulkCount(); bdlg.showModal(); $('lsBulkText').focus(); }
  $('lsBulkText').addEventListener('input', bulkCount); $('lsBulkStrip').addEventListener('change', bulkCount); $('lsBulkDedupe').addEventListener('change', bulkCount);
  $('lsBulkClose').onclick = () => bdlg.close();
  bdlg.addEventListener('click', (e) => { if (e.target === bdlg) bdlg.close(); });
  $('lsBulkForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const plan = bulkPlan(), lines = plan.add, l = bulkList;
    if (!lines.length) { $('lsBulkErr').textContent = plan.inList.length || plan.repeated.length ? 'Todos esses itens já estão na lista.' : 'Cole ou escreva pelo menos uma linha.'; $('lsBulkErr').hidden = false; return; }
    const go = $('lsBulkGo'); go.disabled = true; $('lsBulkErr').hidden = true;
    let last = null, done = 0;
    try {
      for (let i = 0; i < lines.length; i += 200) {   // the server takes up to 200 items per request
        const chunk = lines.slice(i, i + 200);
        go.textContent = 'Adicionando… ' + done + '/' + lines.length;
        last = await api('/' + l.id + '/items', 'POST', { texts: chunk }); done += chunk.length;
      }
      replaceList(last); bdlg.close(); render(); const sk = plan.inList.length + plan.repeated.length; toast(plural(done, 'item adicionado', 'itens adicionados'), { sub: l.title + (sk ? ' · ' + plural(sk, 'repetido ignorado', 'repetidos ignorados') : '') });
    } catch (ex) {
      if (last) { replaceList(last); render(); }
      $('lsBulkErr').textContent = (done ? done + ' de ' + lines.length + ' itens foram adicionados. ' : '') + ex.message; $('lsBulkErr').hidden = false;
    } finally { go.disabled = false; bulkCount(); }
  });

  // ---- delete dialog ----
  const ddlg = $('lsDelDialog'); let doomed = null;
  function askDelete(l) {
    doomed = l;
    $('lsDelText').textContent = l.items.length ? 'Apagar "' + l.title + '" e seus ' + plural(l.items.length, 'item', 'itens') + '? Isso não pode ser desfeito.' : 'Apagar a lista "' + l.title + '"?';
    ddlg.showModal(); $('lsDelCancel').focus();
  }
  $('lsDelClose').onclick = () => ddlg.close(); $('lsDelCancel').onclick = () => ddlg.close();
  ddlg.addEventListener('click', (e) => { if (e.target === ddlg) ddlg.close(); });
  $('lsDelGo').onclick = async () => {
    const l = doomed; if (!l) return; ddlg.close();
    await guard(() => api('/' + l.id, 'DELETE'));
    S.lists = S.lists.filter((x) => x.id !== l.id); close();
    toast('Lista apagada', { sub: l.title });
  };

  load().catch((e) => { $('lsSub').textContent = ''; $('lsEmpty').textContent = 'Não foi possível carregar as listas: ' + e.message; $('lsEmpty').hidden = false; $('lsGrid').hidden = true; });
})();
