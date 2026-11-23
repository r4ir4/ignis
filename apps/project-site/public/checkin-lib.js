// Shared helpers for the custom check-in pages (folders, form editor, filling in, records). Exposes window.CK.
(() => {
  'use strict';
  const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  const COLORS = ['#ff7fb0', '#ffb0bf', '#ffcde0', '#ffdcbc', '#ffb98a', '#ff8f98'];

  async function api(path, method, body) {
    const res = await fetch('api/v1/' + path, { method: method || 'GET', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
    if (res.status === 204) return null;
    let data = null; try { data = await res.json(); } catch (e) { /* no body */ }
    if (!res.ok) {
      let msg = data && typeof data.detail === 'string' ? data.detail : '';
      if (!msg && data && Array.isArray(data.detail)) msg = 'Há um campo inválido no formulário.';
      const err = new Error(msg || 'Erro ' + res.status); err.status = res.status; throw err;
    }
    return data;
  }

  const query = (name) => new URLSearchParams(location.search).get(name) || '';
  const pad = (n) => String(n).padStart(2, '0');
  const todayKey = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const dayLabel = (d) => { const [, m, dd] = d.split('-'); return dd + '/' + m; };

  const FILE = (color) => '<svg viewBox="0 0 260 200" aria-hidden="true" focusable="false" data-file="1"><rect class="ck-back" x="56" y="14" width="148" height="174" rx="16" fill="' + color + '"/>' +
    '<g class="ck-front"><path d="M56 30Q56 14 72 14H174L204 44V172Q204 188 188 188H72Q56 188 56 172Z" fill="' + color + '"/><path d="M174 14V36Q174 44 182 44H204Z" fill="#fff" opacity=".4"/>' +
    '<rect x="76" y="70" width="84" height="8" rx="4" fill="#fff" opacity=".7"/><rect x="76" y="94" width="108" height="8" rx="4" fill="#fff" opacity=".5"/><rect x="76" y="116" width="96" height="8" rx="4" fill="#fff" opacity=".5"/><rect x="76" y="138" width="66" height="8" rx="4" fill="#fff" opacity=".5"/></g></svg>';
  const FOLDER = (color) => '<svg viewBox="0 0 260 200" aria-hidden="true" focusable="false"><path class="ck-back" d="M14 36Q14 14 36 14H88Q99 14 108 21L124 33H224Q246 33 246 55V172Q246 188 230 188H30Q14 188 14 172Z" fill="' + color + '"/></svg>';
  const PLUS = '<svg viewBox="0 0 260 200" aria-hidden="true" focusable="false" data-file="1"><rect class="ck-newbox" x="56" y="14" width="148" height="174" rx="16"/><path class="ck-plus" d="M130 78V124M107 101H153"/></svg>';

  // a grid item: <li class="ck-item"> with a link styled as a folder / file / "new" tile, plus optional small links under it
  function tile(opts) {
    const li = mk('li', 'ck-item'); li.style.setProperty('--i', String(opts.i || 0));
    const a = mk(opts.button ? 'button' : 'a', 'ck-folder' + (opts.kind === 'folder' ? '' : ' ck-file') + (opts.kind === 'new' ? ' ck-new' : ''));
    if (opts.button) a.type = 'button'; else a.href = opts.href;
    if (opts.label) a.setAttribute('aria-label', opts.label);
    a.innerHTML = opts.kind === 'folder' ? FOLDER(opts.color) : opts.kind === 'new' ? PLUS : FILE(opts.color);
    a.appendChild(mk('span', 'ck-name', opts.name));
    if (opts.sub) a.appendChild(mk('small', 'ck-sub', opts.sub));
    li.appendChild(a);
    if (opts.links && opts.links.length) {
      const row = mk('div', 'ck-links');
      opts.links.forEach(([text, href]) => { const l = mk('a', 'ck-sublink', text); l.href = href; row.appendChild(l); });
      li.appendChild(row);
    }
    return { li, a };
  }


  // a small dialog to name a folder; resolves {name, color} or null when cancelled (the colour is no longer used by the pages, the API just wants a value)
  const DEFAULT_COLOR = '#ffb0bf';
  function folderDialog(opts) {
    return new Promise((resolve) => {
      const dlg = mk('dialog', 'ckd'); let settled = false;
      const form = mk('form', 'ckd-form'); form.method = 'dialog';
      const title = mk('h2', '', opts.title);
      const label = mk('label', 'ckd-label', 'Nome da pasta'); const input = mk('input'); input.type = 'text'; input.maxLength = 40; input.required = true; input.value = opts.name || ''; input.placeholder = 'Ex.: Estudos'; label.appendChild(input);
      const err = mk('p', 'ckd-err'); err.hidden = true;
      const acts = mk('div', 'ckd-acts'); const cancel = mk('button', 'ckd-ghost', 'Cancelar'); cancel.type = 'button'; const ok = mk('button', 'ckd-ok', opts.submit || 'Salvar'); ok.type = 'submit';
      acts.append(cancel, ok); form.append(title, label, err, acts); dlg.appendChild(form); document.body.appendChild(dlg);
      const finish = (v) => { if (settled) return; settled = true; dlg.close(); dlg.remove(); resolve(v); };
      cancel.addEventListener('click', () => finish(null)); dlg.addEventListener('cancel', (e) => { e.preventDefault(); finish(null); });
      dlg.addEventListener('click', (e) => { if (e.target === dlg) finish(null); });
      form.addEventListener('submit', (e) => { e.preventDefault(); const name = input.value.trim(); if (!name) { err.textContent = 'Dê um nome à pasta.'; err.hidden = false; return; } finish({ name, color: opts.color || DEFAULT_COLOR }); });
      dlg.showModal(); input.focus(); input.select();
    });
  }

  const folderHref = (f) => 'checkin-pasta?id=' + encodeURIComponent(f);


  const alertBadge = (done) => {
    const b = mk('span', 'ck-alert' + (done ? ' ck-done' : '')); b.setAttribute('aria-hidden', 'true');
    b.innerHTML = done ? '<b><svg viewBox="0 0 24 24"><path d="M5 12.500l4.500 4.500L19 7.500"/></svg></b>' : '<i></i><b>!</b>';
    return b;
  };
  // appends one file per form in the folder (with a "pending today" / "done" badge and links to the charts and the editor), then a "new form" tile. Returns the forms.
  async function renderForms(grid, folderId, start) {
    const forms = (await api('checkin-forms?folder=' + encodeURIComponent(folderId))).items;
    const today = todayKey();
    const done = await Promise.all(forms.map((f) => api('checkin-forms/' + f.id + '/responses/' + today).then(() => true).catch(() => false)));
    const first = start || 0;
    forms.forEach((f, i) => {
      const { li, a } = tile({ i: first + i, kind: 'file', href: 'checkin-preencher?id=' + f.id, name: f.name, color: COLORS[i % COLORS.length], label: 'Preencher ' + f.name,
        sub: plural(f.question_count, 'pergunta', 'perguntas') + (f.last_day ? ' · último em ' + dayLabel(f.last_day) : ''),
        links: [['Gráficos', 'checkin-registros?id=' + f.id], ['Editar', 'checkin-editor?id=' + f.id + '&folder=' + encodeURIComponent(folderId)]] });
      a.appendChild(alertBadge(done[i]));
      grid.appendChild(li);
    });
    grid.appendChild(tile({ i: first + forms.length, kind: 'new', href: 'checkin-editor?folder=' + encodeURIComponent(folderId), name: 'Novo formulário', label: 'Criar um novo formulário nesta pasta' }).li);
    return forms;
  }


  // an in-page dialog instead of the browser's confirm()/alert(), which some browsers (and the in-app preview) block silently.
  // ask({title, text, ok, cancel, danger}) resolves true when confirmed; with cancel: null it is just a notice.
  function ask(opts) {
    return new Promise((resolve) => {
      const dlg = mk('dialog', 'ckd'); let settled = false;
      const box = mk('div', 'ckd-form');
      box.append(mk('h2', '', opts.title), mk('p', 'ckd-text', opts.text || ''));
      const acts = mk('div', 'ckd-acts');
      const cancel = opts.cancel === null ? null : mk('button', 'ckd-ghost', opts.cancel || 'Cancelar'); if (cancel) cancel.type = 'button';
      const ok = mk('button', 'ckd-ok' + (opts.danger ? ' ckd-danger' : ''), opts.ok || 'OK'); ok.type = 'button';
      if (cancel) acts.appendChild(cancel); acts.appendChild(ok); box.appendChild(acts); dlg.appendChild(box); document.body.appendChild(dlg);
      const finish = (v) => { if (settled) return; settled = true; dlg.close(); dlg.remove(); resolve(v); };
      ok.addEventListener('click', () => finish(true)); if (cancel) cancel.addEventListener('click', () => finish(false));
      dlg.addEventListener('cancel', (e) => { e.preventDefault(); finish(false); });
      dlg.addEventListener('click', (e) => { if (e.target === dlg) finish(false); });
      dlg.showModal(); (cancel || ok).focus();
    });
  }
  const notice = (title, text) => ask({ title, text, cancel: null });

  // "remove" a form: it is archived, so it leaves the folder but the answers already given stay in the database
  async function removeForm(form) {
    if (!await ask({ title: 'Remover "' + form.name + '"?', text: 'Ele some da pasta, mas as respostas já dadas continuam guardadas.', ok: 'Remover', danger: true })) return;
    try { await api('checkin-forms/' + form.id, 'DELETE'); location.href = folderHref(form.folder); }
    catch (e) { notice('Não foi possível remover', e.message); }
  }

  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
  window.CK = { ask, notice, removeForm, renderForms, folderDialog, folderHref, mk, api, query, todayKey, dayLabel, COLORS, FILE, FOLDER, PLUS, tile, plural };
})();
