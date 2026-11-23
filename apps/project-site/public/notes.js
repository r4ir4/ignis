// Notes: free-form documents in a block editor (Tiptap, bundled in vendor/tiptap/tiptap.js).
// The overview is a grid of cards like Listography; a note opens as a page (#id) and saves itself while you write.
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const make = (tag, cls, text) => { const el = document.createElement(tag); if (cls) el.className = cls; if (text != null) el.textContent = text; return el; };
  const toast = (text, opts) => { if (window.IgnisToast) window.IgnisToast.show(text, opts); };
  const T = window.IgnisTiptap;

  async function api(path, method, body, keepalive) {
    const init = { method: method || 'GET', headers: {}, keepalive: !!keepalive };
    if (body) { init.body = JSON.stringify(body); init.headers['Content-Type'] = 'application/json'; }
    const res = await fetch('api/v1/notes' + path, init);
    if (!res.ok) {
      let detail = ''; try { const j = await res.json(); if (typeof j.detail === 'string') detail = j.detail; } catch (e) { /* not json */ }
      throw new Error(detail || 'Algo deu errado (' + res.status + ').');
    }
    return res.status === 204 ? null : res.json();
  }
  const guard = async (fn) => { try { return await fn(); } catch (e) { toast(e.message, { type: 'warn' }); return null; } };
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

  const S = { notes: [], sel: null, q: '' };
  const byId = (id) => S.notes.find((n) => n.id === id);
  const replace = (n) => { const card = { id: n.id, title: n.title, preview: n.preview, pinned: n.pinned, created_at: n.created_at, updated_at: n.updated_at }; const i = S.notes.findIndex((x) => x.id === n.id); if (i >= 0) S.notes[i] = card; else S.notes.push(card); sortNotes(); };
  const sortNotes = () => S.notes.sort((a, b) => (a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0));

  const when = (iso) => {
    const d = new Date(iso); if (isNaN(d)) return '';
    const mins = Math.round((Date.now() - d) / 60000);
    if (mins < 1) return 'agora';
    if (mins < 60) return 'há ' + mins + ' min';
    if (mins < 60 * 24 && new Date().getDate() === d.getDate()) return 'hoje, ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }).replace('.', '');
  };

  // ---------- overview ----------
  function route() {
    const id = decodeURIComponent(location.hash.slice(1));
    if (id && byId(id)) openNote(id); else { if (editor) leaveEditor(); S.sel = null; render(); }
  }
  window.addEventListener('hashchange', route);
  const goto = (id) => { location.hash = id; };
  const goBack = () => { history.pushState('', document.title, location.pathname + location.search); route(); };

  function render() {
    const doc = !!S.sel;
    $('ntCards').hidden = doc; $('ntDoc').hidden = !doc; $('ntSearchWrap').hidden = doc; $('ntNew').hidden = doc;
    $('ntEmpty').hidden = true;
    $('ntHead').hidden = doc;
    if (doc) return;
    document.title = 'Notes · Ignis';
    $('ntSub').textContent = S.notes.length ? plural(S.notes.length, 'nota', 'notas') : 'Escreva livremente: ideias, planos, rascunhos.';
    renderCards();
  }

  function renderCards() {
    const ul = $('ntCards'); ul.replaceChildren();
    const q = S.q.trim().toLowerCase();
    const list = q ? S.notes.filter((n) => (n.title + ' ' + n.preview).toLowerCase().includes(q)) : S.notes;
    list.forEach((n) => {
      const li = make('li', 'nt-card-wrap');
      const b = make('button', 'nt-card'); b.type = 'button'; b.setAttribute('aria-label', 'Abrir a nota ' + (n.title || 'sem título'));
      const h = make('h3', n.title ? '' : 'untitled', n.title || 'Sem título');
      b.appendChild(h);
      b.appendChild(make('p', 'nt-pv' + (n.preview ? '' : ' none'), n.preview || 'Nota vazia'));
      b.appendChild(make('small', 'nt-when', when(n.updated_at)));
      b.onclick = () => goto(n.id);
      li.appendChild(b); ul.appendChild(li);
    });
    if (!q) {
      const nw = make('li', 'nt-card-wrap');
      const nb = make('button', 'nt-card nt-card-new'); nb.type = 'button'; nb.innerHTML = '<span aria-hidden="true">+</span><b>Nova nota</b>';
      nb.onclick = newNote; nw.appendChild(nb); ul.appendChild(nw);
    } else if (!list.length) {
      $('ntEmpty').textContent = 'Nenhuma nota com "' + S.q.trim() + '".'; $('ntEmpty').hidden = false;
    }
  }
  $('ntBack').onclick = goBack;
  $('ntSearch').addEventListener('input', (e) => { S.q = e.target.value; renderCards(); });

  async function newNote() {
    const n = await guard(() => api('', 'POST', {}));
    if (!n) return;
    replace(n); S.fresh = n.id; goto(n.id);
  }
  $('ntNew').onclick = newNote;

  // ---------- the editor ----------
  let editor = null, saved = null, timer = null, chain = Promise.resolve(), dirty = false;
  const titleEl = $('ntTitle');

  const COMMANDS = [
    { label: 'Texto', hint: 'Parágrafo normal', k: 'texto paragrafo p', icon: 'T', run: (c) => c.setParagraph() },
    { label: 'Título 1', hint: 'Título grande', k: 'titulo h1 heading 1', icon: 'H1', run: (c) => c.setHeading({ level: 1 }) },
    { label: 'Título 2', hint: 'Título médio', k: 'titulo h2 heading 2', icon: 'H2', run: (c) => c.setHeading({ level: 2 }) },
    { label: 'Título 3', hint: 'Título pequeno', k: 'titulo h3 heading 3', icon: 'H3', run: (c) => c.setHeading({ level: 3 }) },
    { label: 'Lista', hint: 'Com marcadores', k: 'lista bullet marcadores ul', icon: '•', run: (c) => c.toggleBulletList() },
    { label: 'Lista numerada', hint: '1. 2. 3.', k: 'lista numerada ordenada ol', icon: '1.', run: (c) => c.toggleOrderedList() },
    { label: 'Tarefas', hint: 'Lista com caixas de marcar', k: 'tarefas todo checklist caixa', icon: '☐', run: (c) => c.toggleTaskList() },
    { label: 'Citação', hint: 'Destaque um trecho', k: 'citacao quote', icon: '”', run: (c) => c.toggleBlockquote() },
    { label: 'Código', hint: 'Bloco de código', k: 'codigo code', icon: '</>', run: (c) => c.toggleCodeBlock() },
    { label: 'Divisor', hint: 'Linha separadora', k: 'divisor linha hr separador', icon: '—', run: (c) => c.setHorizontalRule() },
  ];
  const fold = (s) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();

  // "/" opens a menu of blocks to insert
  const Slash = T.Extension.create({
    name: 'slashMenu',
    addProseMirrorPlugins() {
      const menu = $('ntSlash');
      let items = [], index = 0, current = null;
      const draw = () => {
        menu.replaceChildren();
        if (!items.length) { menu.appendChild(make('p', 'nt-sl-none', 'Nada encontrado')); return; }
        items.forEach((it, i) => {
          const b = make('button', 'nt-sl-item' + (i === index ? ' on' : '')); b.type = 'button'; b.setAttribute('role', 'option');
          b.append(make('span', 'nt-sl-ic', it.icon), (() => { const d = make('span', 'nt-sl-tx'); d.append(make('b', '', it.label), make('small', '', it.hint)); return d; })());
          b.onmousedown = (e) => { e.preventDefault(); current.command(it); };
          b.onmousemove = () => { if (index !== i) { index = i; menu.querySelectorAll('.nt-sl-item').forEach((x, j) => x.classList.toggle('on', j === i)); } };
          menu.appendChild(b);
        });
        const on = menu.querySelector('.on'); if (on) on.scrollIntoView({ block: 'nearest' });
      };
      const place = () => {
        const r = current && current.clientRect && current.clientRect();
        if (!r) return;
        const h = menu.offsetHeight, w = menu.offsetWidth;
        const below = r.bottom + 6 + h < window.innerHeight || r.top - 6 - h < 0;
        menu.style.top = (below ? r.bottom + 6 : r.top - 6 - h) + 'px';
        menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px';
      };
      return [T.Suggestion({
        editor: this.editor, char: '/',
        items: ({ query }) => { const q = fold(query.trim()); return COMMANDS.filter((c) => !q || fold(c.label + ' ' + c.k).includes(q)); },
        command: ({ editor: ed, range, props }) => { props.run(ed.chain().focus().deleteRange(range)).run(); },
        render: () => ({
          onStart(p) { current = p; items = p.items; index = 0; menu.hidden = false; draw(); place(); },
          onUpdate(p) { current = p; items = p.items; index = Math.min(index, Math.max(0, items.length - 1)); draw(); place(); },
          onKeyDown({ event }) {
            if (event.key === 'Escape') { menu.hidden = true; return true; }
            if (!items.length) return false;
            if (event.key === 'ArrowDown') { index = (index + 1) % items.length; draw(); return true; }
            if (event.key === 'ArrowUp') { index = (index - 1 + items.length) % items.length; draw(); return true; }
            if (event.key === 'Enter' || event.key === 'Tab') { current.command(items[index]); return true; }
            return false;
          },
          onExit() { menu.hidden = true; current = null; },
        }),
      })];
    },
  });

  function makeEditor(content) {
    return new T.Editor({
      element: $('ntEditor'),
      extensions: [
        T.StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank', title: 'Ctrl/Cmd + clique para abrir' } } }),
        T.Highlight,
        T.TaskList,
        T.TaskItem.configure({ nested: true, onReadOnlyChecked: () => true }),
        T.Placeholder.configure({ placeholder: ({ node }) => (node.type.name === 'heading' ? 'Título' : "Escreva algo, ou aperte '/' para ver os blocos…") }),
        Slash,
      ],
      content,
      autofocus: false,
      editorProps: {
        attributes: { class: 'nt-prose', spellcheck: 'true', 'aria-label': 'Texto da nota' },
        handleClick: (view, pos, ev) => { const a = ev.target.closest && ev.target.closest('a'); if (a && (ev.metaKey || ev.ctrlKey || !editor.isEditable)) { window.open(a.href, '_blank', 'noopener,noreferrer'); return true; } return false; },
      },
      onUpdate: () => queueSave(),
      onSelectionUpdate: () => updateBubble(),
      onBlur: () => setTimeout(() => { if (!bubble.contains(document.activeElement)) hideBubble(); }, 0),
    });
  }

  function openNote(id) {
    if (S.sel === id && editor) return;
    if (editor) leaveEditor();
    S.sel = id; render();
    const card = byId(id);
    document.title = (card.title || 'Sem título') + ' · Ignis';
    $('ntDoc').classList.add('loading'); titleEl.value = ''; status('');
    guard(() => api('/' + id)).then((n) => {
      if (S.sel !== id) return;
      if (!n) { goBack(); return; }
      let content = ''; try { content = n.body ? JSON.parse(n.body) : ''; } catch (e) { content = ''; }
      titleEl.value = n.title; meta(n.updated_at); saved = { title: n.title, body: n.body, pinned: n.pinned };
      editor = makeEditor(content);
      $('ntDoc').classList.remove('loading');
      status('Salvo');
      const fresh = S.fresh === id; S.fresh = null;
      setEditing(fresh || (!n.title && !n.body), fresh);
    });
  }

  // reading is the default; the pencil switches the page to editing
  function setEditing(on, focusTitle) {
    if (!editor) return;
    editor.setEditable(on); titleEl.readOnly = !on;
    $('ntPrint').hidden = on;
    $('ntDoc').classList.toggle('reading', !on); document.body.classList.toggle('no-sparkle', on);
    const b = $('ntEdit'); b.setAttribute('aria-pressed', String(on)); b.title = on ? 'Concluir edição' : 'Editar'; b.setAttribute('aria-label', b.title);
    if (!on) { hideBubble(); $('ntSlash').hidden = true; }
    else if (focusTitle) titleEl.focus(); else editor.commands.focus('end');
  }
  // printing is only offered while reading; the page is printed as it is (bold, italic, highlight...)
  // print: the browser's own print screen (same as Ctrl/Cmd+P). The note is copied to a print-only sheet right before printing.
  function fillPrint() {
    const el = $('ntPrintRoot'); el.replaceChildren();
    if (!editor || S.sel === null) return;
    el.appendChild(make('h1', 'nt-p-title', titleEl.value.trim() || 'Sem título'));
    el.appendChild(make('p', 'nt-p-meta', $('ntMeta').textContent));
    const body = make('div', 'nt-prose'); body.innerHTML = editor.getHTML();
    body.querySelectorAll('input').forEach((i) => { i.disabled = true; });
    body.querySelectorAll('label > span').forEach((s) => s.remove());
    el.appendChild(body);
  }
  window.addEventListener('beforeprint', fillPrint);
  $('ntPrint').onclick = () => { if (editor && !editor.isEditable) window.print(); };
  $('ntEdit').onclick = () => { if (editor) setEditing(!editor.isEditable); };
  const meta = (iso) => { $('ntMeta').textContent = iso ? 'Editada ' + when(iso) : ''; };
  const status = (t) => { $('ntStatus').textContent = t; };
  const isEmpty = () => !titleEl.value.trim() && editor && editor.isEmpty;

  function queueSave() { dirty = true; status('Editando…'); clearTimeout(timer); timer = setTimeout(save, 700); }
  titleEl.addEventListener('input', () => { if (editor) queueSave(); });
  titleEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' && editor && editor.isEditable) { e.preventDefault(); editor.commands.focus('start'); } });

  // saves are sent one after another so an older one never lands after a newer one
  function save(keepalive) {
    clearTimeout(timer);
    if (!editor || !dirty || !S.sel) return chain;
    const id = S.sel, title = titleEl.value.trim(), body = JSON.stringify(editor.getJSON());
    const preview = editor.getText({ blockSeparator: ' ' }).replace(/\s+/g, ' ').trim().slice(0, 300);
    dirty = false; status('Salvando…');
    chain = chain.then(async () => {
      try {
        const n = await api('/' + id, 'PATCH', { title, body, preview }, keepalive);
        replace(n); saved = { title: n.title, body: n.body, pinned: n.pinned }; if (S.sel === id) meta(n.updated_at);
        if (S.sel === id && !dirty) status('Salvo');
      } catch (e) { dirty = true; if (S.sel === id) status('Não foi possível salvar'); toast(e.message, { type: 'warn' }); }
    });
    return chain;
  }

  // closing the note: finish saving; a note left completely empty is dropped
  function leaveEditor() {
    const id = S.sel, empty = isEmpty(), ed = editor;
    hideBubble(); $('ntSlash').hidden = true; document.body.classList.remove('no-sparkle');
    const done = empty ? Promise.resolve() : save();
    editor = null; saved = null; S.sel = null;
    ed.destroy();
    if (empty) { S.notes = S.notes.filter((n) => n.id !== id); chain = chain.then(() => api('/' + id, 'DELETE').catch(() => null)); }
    return done;
  }
  window.addEventListener('pagehide', () => { if (editor && dirty) save(true); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && editor && dirty) save(true); });

  $('ntDel').onclick = async () => {
    if (!editor) return;
    const id = S.sel, title = titleEl.value.trim();
    const ok = await window.IgnisConfirm.ask({ title: 'Apagar nota', text: 'Apagar ' + (title ? '"' + title + '"' : 'esta nota') + '? Isso não pode ser desfeito.' });
    if (!ok || S.sel !== id) return;
    dirty = false; clearTimeout(timer);
    const ed = editor; editor = null; ed.destroy(); hideBubble(); S.sel = null; document.body.classList.remove('no-sparkle');
    await chain; await guard(() => api('/' + id, 'DELETE'));
    S.notes = S.notes.filter((n) => n.id !== id);
    history.pushState('', document.title, location.pathname + location.search); route();
    toast('Nota apagada', { sub: title || 'Sem título' });
  };

  // ---------- floating toolbar over a selection ----------
  const bubble = $('ntBubble');
  const ICON = {
    bold: '<b>B</b>', italic: '<i>I</i>', underline: '<u>U</u>', strike: '<s>S</s>',
    code: '<svg viewBox="0 0 24 24"><path d="M8.500 7 4 12l4.500 5M15.500 7 20 12l-4.500 5"/></svg>',
    highlight: '<svg viewBox="0 0 24 24"><path d="M5 19h14M8 15l7-9 3 2.300-7 9H8Z"/></svg>',
    link: '<svg viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.700 0l3-3a4 4 0 0 0-5.700-5.700L12 6.300M14 10a4 4 0 0 0-5.700 0l-3 3a4 4 0 0 0 5.700 5.700L12 17.700"/></svg>',
  };
  const BTNS = [['bold', 'Negrito', (c) => c.toggleBold()], ['italic', 'Itálico', (c) => c.toggleItalic()], ['underline', 'Sublinhado', (c) => c.toggleUnderline()],
    ['strike', 'Riscado', (c) => c.toggleStrike()], ['code', 'Código', (c) => c.toggleCode()], ['highlight', 'Destaque', (c) => c.toggleHighlight()]];
  let linkMode = false;

  function drawBubble() {
    bubble.replaceChildren();
    if (linkMode) {
      const url = make('input', 'nt-lurl'); url.type = 'text'; url.placeholder = 'Cole o link e aperte Enter'; url.inputMode = 'url'; url.setAttribute('aria-label', 'Endereço do link');
      url.value = editor.getAttributes('link').href || '';
      const apply = () => {
        let v = url.value.trim();
        if (!v) editor.chain().focus().extendMarkRange('link').unsetLink().run();
        else {
          if (!/^[a-z][a-z0-9+.-]*:/i.test(v)) v = 'https://' + v;
          let ok = false; try { const u = new URL(v); ok = u.protocol === 'http:' || u.protocol === 'https:'; } catch (e) { /* bad */ }
          if (!ok) { url.classList.add('bad'); return; }
          editor.chain().focus().extendMarkRange('link').setLink({ href: v }).run();
        }
        linkMode = false; drawBubble(); updateBubble();
      };
      url.addEventListener('input', () => url.classList.remove('bad'));
      url.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); apply(); }
        else if (e.key === 'Escape') { e.preventDefault(); linkMode = false; drawBubble(); editor.commands.focus(); updateBubble(); }
      });
      bubble.appendChild(url);
      if (editor.isActive('link')) { const rm = make('button', 'nt-bb', 'Remover'); rm.type = 'button'; rm.onmousedown = (e) => e.preventDefault(); rm.onclick = () => { url.value = ''; apply(); }; bubble.appendChild(rm); }
      setTimeout(() => url.focus(), 0);
      return;
    }
    BTNS.forEach(([name, label, run]) => {
      const b = make('button', 'nt-bb'); b.type = 'button'; b.title = label; b.setAttribute('aria-label', label); b.innerHTML = ICON[name];
      b.classList.toggle('on', editor.isActive(name));
      b.onmousedown = (e) => e.preventDefault();
      b.onclick = () => { run(editor.chain().focus()).run(); drawBubble(); };
      bubble.appendChild(b);
    });
    const l = make('button', 'nt-bb'); l.type = 'button'; l.title = 'Link (Ctrl/Cmd + K)'; l.setAttribute('aria-label', 'Link'); l.innerHTML = ICON.link; l.classList.toggle('on', editor.isActive('link'));
    l.onmousedown = (e) => e.preventDefault(); l.onclick = () => { linkMode = true; drawBubble(); };
    bubble.appendChild(l);
  }
  function hideBubble() { bubble.hidden = true; linkMode = false; }
  function updateBubble() {
    if (!editor) return hideBubble();
    const { from, to, empty } = editor.state.selection;
    if (empty || editor.isActive('codeBlock') || !editor.isFocused && !bubble.contains(document.activeElement)) { if (!bubble.contains(document.activeElement)) hideBubble(); return; }
    if (!linkMode) drawBubble();
    bubble.hidden = false;
    const a = editor.view.coordsAtPos(from), b = editor.view.coordsAtPos(to);
    const w = bubble.offsetWidth, h = bubble.offsetHeight;
    const cx = (Math.min(a.left, b.left) + Math.max(a.right, b.right)) / 2;
    let top = Math.min(a.top, b.top) - h - 8; if (top < 8) top = Math.max(a.bottom, b.bottom) + 8;
    bubble.style.top = top + 'px'; bubble.style.left = Math.max(8, Math.min(cx - w / 2, window.innerWidth - w - 8)) + 'px';
  }
  document.addEventListener('keydown', (e) => {
    if (!editor || !editor.isFocused || !(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'k') return;
    e.preventDefault(); if (editor.state.selection.empty) return;
    linkMode = true; bubble.hidden = false; drawBubble(); updateBubble();
  });
  window.addEventListener('scroll', () => { if (editor && !bubble.hidden) updateBubble(); }, { passive: true });

  // ---------- start ----------
  (async () => {
    try { S.notes = (await api('')).notes; }
    catch (e) { $('ntSub').textContent = ''; $('ntEmpty').textContent = 'Não foi possível carregar as notas: ' + e.message; $('ntEmpty').hidden = false; $('ntCards').hidden = true; return; }
    route();
  })();
})();
