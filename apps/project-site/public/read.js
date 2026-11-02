// Read page: the books shelf (reading now, to read, finished, dropped), a pages-per-day log and a week chart, backed by the shared ignis API.
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(2, '0');
  const dayKey = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parseDay = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const make = (tag, cls, text) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  };
  const fmt = (n) => Math.round(n).toLocaleString();
  const int = (v) => { const n = parseInt(String(v), 10); return Number.isFinite(n) && n > 0 ? n : 0; };

  async function api(path, options) {
    const init = options ? { method: options.method, headers: { 'Content-Type': 'application/json' }, body: options.body ? JSON.stringify(options.body) : undefined } : undefined;
    const res = await fetch('api' + path, init);
    if (!res.ok) {
      let detail = '';
      try { const body = await res.json(); if (typeof body.detail === 'string') detail = body.detail; } catch (e) { /* not json */ }
      throw new Error(detail || 'Something went wrong (' + res.status + ').');
    }
    return res.status === 204 ? null : res.json();
  }
  let toastTimer;
  function toast(text) {
    const el = $('toast');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2400);
  }

  const todayKey = () => dayKey(new Date());
  const S = { data: null, shelf: 'to_read', sel: null };
  const SPINES = ['#b6f35a', '#c4b5ff', '#ff8fd0', '#ff7a4d'];
  const STATUS = { reading: 'Reading', to_read: 'To read', finished: 'Finished', dropped: 'Dropped' };
  const STAR = 'M16 3L19.7 11.6L29 12.4L21.9 18.5L24.1 27.6L16 22.7L7.9 27.6L10.1 18.5L3 12.4L12.3 11.6Z';
  const starSvg = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="' + STAR + '"/></svg>';

  async function load() {
    S.data = await api('/v1/books/overview?day=' + todayKey() + '&window=30');
    render();
  }

  const byStatus = (s) => S.data.books.filter((b) => b.status === s);
  const pct = (b) => (b.pages ? Math.min(100, Math.round((b.current_page / b.pages) * 100)) : 0);
  const spine = (b) => SPINES[S.data.books.indexOf(b) % SPINES.length];

  function figure(cls) { return make('figure', 'rd-fig ' + cls); }
  function emptyIn(c, text) { c.appendChild(make('p', 'rd-empty', text)); return c; }

  // ---- top row -----------------------------------------------------------------------------------------------------------------------------
  function wordCard() {
    const f = figure('rd-word grain');
    f.innerHTML = '<svg viewBox="0 0 600 200" aria-hidden="true"><g filter="url(#goo)"><text x="300" y="135" text-anchor="middle" transform="rotate(-4 300 100)" class="goo-word">read</text></g></svg>' +
      '<svg class="rd-tw" style="--x:5%;--y:14%;--s:20px;--d:0s" viewBox="0 0 32 32" aria-hidden="true"><use href="#spark"/></svg><svg class="rd-tw rd-tw-p" style="--x:90%;--y:70%;--s:22px;--d:.9s" viewBox="0 0 32 32" aria-hidden="true"><use href="#spark"/></svg><svg class="rd-tw" style="--x:89%;--y:12%;--s:12px;--d:1.7s" viewBox="0 0 32 32" aria-hidden="true"><use href="#spark"/></svg><svg class="rd-tw rd-tw-p" style="--x:6%;--y:72%;--s:14px;--d:2.3s" viewBox="0 0 32 32" aria-hidden="true"><use href="#spark"/></svg>';
    return f;
  }

  const ICON = {
    book: '<g class="rd-i-book"><path d="M10 22C10 22 24 18 42 24V68C24 62 10 66 10 66Z" fill="currentColor"/><path class="rd-i-page" d="M74 22C74 22 60 18 42 24V68C60 62 74 66 74 66Z" fill="currentColor" opacity=".7"/><path d="M42 24V68" stroke="#fff" stroke-width="2.5" opacity=".6"/></g>',
    flame: '<g class="rd-i-flame"><path fill="currentColor" d="M42 18C45 32 31 35 33 48C37 46 39 42 42 38C42 47 54 50 54 59C54 67 48 70 42 70C35 70 29 65 29 57C29 41 40 35 42 18Z"/><path class="rd-i-core" d="M42 52C42 58 36 59 36 63C36 66 38 68 42 68C46 68 48 66 48 63C48 59 43 58 42 52Z"/></g>',
    stack: '<g class="rd-i-stack" fill="currentColor"><rect x="14" y="52" width="56" height="12" rx="3"/><rect x="20" y="38" width="50" height="12" rx="3" transform="rotate(-3 45 44)"/><rect x="16" y="24" width="52" height="12" rx="3" transform="rotate(2 42 30)"/></g>',
    mark: '<g class="rd-i-mark"><path d="M24 14H60V70L42 56L24 70Z" fill="currentColor"/><path d="M42 24l3 6.5 7 .8-5.2 4.8 1.4 7-6.2-3.6-6.2 3.6 1.4-7-5.2-4.8 7-.8Z" fill="#fff" opacity=".85"/></g>',
  };

  function tile(cls, label, value, unit, icon, sub) {
    const li = make('li', 'rd-tile ' + cls);
    const left = make('span', 'rd-tl');
    left.appendChild(make('small', '', label));
    const b = make('b', 'rd-num');
    const n = make('span', '', '0');
    b.appendChild(n);
    if (unit) b.appendChild(make('em', '', unit));
    left.appendChild(b);
    if (sub) left.appendChild(make('span', 'rd-sub', sub));
    li.appendChild(left);
    const art = make('span', 'rd-art');
    art.setAttribute('aria-hidden', 'true');
    art.innerHTML = '<svg viewBox="0 0 84 84">' + ICON[icon] + '</svg>';
    li.appendChild(art);
    li.setAttribute('aria-label', label + ': ' + fmt(value) + (unit ? ' ' + unit : ''));
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !value) n.textContent = fmt(value);
    else {
      const t0 = performance.now();
      const tick = (t) => { const k = Math.min(1, (t - t0) / 700); n.textContent = fmt(value * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    }
    return li;
  }

  function tiles() {
    const d = S.data;
    const ul = make('ul', 'rd-tiles');
    ul.setAttribute('aria-label', 'Reading numbers');
    ul.append(
      tile('t-today', 'Pages today', d.today_pages, '', 'book', d.week_pages ? fmt(d.week_pages) + ' this week' : 'none this week'),
      tile('t-streak', 'Reading streak', d.streak, d.streak === 1 ? 'day' : 'days', 'flame', d.streak ? 'keep it going' : 'read today to start'),
      tile('t-month', 'Pages this month', d.month_pages, '', 'stack', ''),
      tile('t-year', 'Finished this year', d.finished_year, d.finished_year === 1 ? 'book' : 'books', 'mark', ''),
    );
    return ul;
  }

  // ---- reading now ---------------------------------------------------------------------------------------------------------------------------
  function readingCard() {
    const c = figure('rd-now');
    const head = make('div', 'rd-head');
    head.appendChild(make('p', 'rd-k', 'Reading now'));
    const add = make('button', 'rd-mini');
    add.type = 'button';
    add.innerHTML = '<span class="rd-plus" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></span><span>Add book</span>';
    add.addEventListener('click', () => openBook(null));
    head.appendChild(add);
    c.appendChild(head);
    const books = byStatus('reading');
    if (!books.length) return emptyIn(c, S.data.books.length ? 'Nothing in progress. Start one from your to-read shelf.' : 'No books yet. Add the one you are reading.');
    const list = make('ul', 'rd-list');
    books.forEach((b) => list.appendChild(readingRow(b)));
    c.appendChild(list);
    return c;
  }

  function readingRow(b) {
    const li = make('li', 'rd-row');
    li.style.setProperty('--sp', spine(b));
    const cover = make('span', 'rd-cover');
    cover.setAttribute('aria-hidden', 'true');
    cover.appendChild(make('b', '', (b.title.trim()[0] || '?').toUpperCase()));
    li.appendChild(cover);
    const body = make('div', 'rd-body');
    body.appendChild(make('p', 'rd-title', b.title));
    if (b.author) body.appendChild(make('small', 'rd-author', b.author));
    if (b.pages) {
      const bar = make('span', 'rd-bar');
      const fill = make('i');
      bar.appendChild(fill);
      requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = pct(b) + '%'; }));
      body.appendChild(bar);
      body.appendChild(make('small', 'rd-meta', 'Page ' + fmt(b.current_page) + ' of ' + fmt(b.pages) + ' · ' + pct(b) + '%'));
    } else {
      // no total yet: show the pages read so far instead of an empty bar
      const read = make('p', 'rd-read');
      read.appendChild(make('b', '', fmt(b.current_page)));
      read.appendChild(make('span', '', b.current_page === 1 ? 'page read' : 'pages read'));
      body.appendChild(read);
      body.appendChild(make('small', 'rd-meta', 'Add the total pages in Edit to see progress'));
    }
    li.appendChild(body);
    const acts = make('div', 'rd-acts');
    const log = make('button', 'rd-log', 'Log pages');
    log.type = 'button';
    log.addEventListener('click', () => openLog(b));
    const edit = make('button', 'rd-edit', 'Edit');
    edit.type = 'button';
    edit.addEventListener('click', () => openBook(b));
    acts.append(log, edit);
    li.appendChild(acts);
    return li;
  }

  // ---- shelf: three tabs, a row of standing book spines on a plank, and the selected book's details --------------------------------------------
  const TAB_ICON = {
    to_read: '<svg viewBox="0 0 48 48" aria-hidden="true"><g class="rd-t-stack" fill="currentColor"><rect x="7" y="30" width="34" height="8" rx="2"/><rect x="10" y="20" width="30" height="8" rx="2" transform="rotate(-3 25 24)"/><rect x="8" y="10" width="31" height="8" rx="2" transform="rotate(2 24 14)"/></g></svg>',
    finished: '<svg viewBox="0 0 48 48" aria-hidden="true"><g class="rd-t-mark"><path d="M14 6H34V42L24 34L14 42Z" fill="currentColor"/><path d="M24 14l2 4.2 4.6.5-3.4 3.1.9 4.6L24 24l-4.1 2.4.9-4.6-3.4-3.1 4.6-.5Z" fill="#fff" opacity=".85"/></g></svg>',
    dropped: '<svg viewBox="0 0 48 48" aria-hidden="true"><g class="rd-t-drop"><path d="M12 12H36V40H12Z" fill="currentColor"/><path d="M12 12L24 22L36 12" fill="none" stroke="#fff" stroke-width="2.6" opacity=".6"/></g></svg>',
  };
  const hash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };

  function shelfCard() {
    const c = figure('rd-shelf');
    const head = make('div', 'rd-head');
    head.appendChild(make('p', 'rd-k', 'Shelf'));
    c.appendChild(head);

    const tabs = make('div', 'rd-tabs3');
    tabs.setAttribute('role', 'group');
    tabs.setAttribute('aria-label', 'Shelf');
    [['to_read', 'To read', 'a'], ['finished', 'Finished', 'b'], ['dropped', 'Dropped', 'c']].forEach(([k, label, cls]) => {
      const b = make('button', 'rd-tab ' + cls);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(S.shelf === k));
      b.innerHTML = TAB_ICON[k] + '<span class="rd-tn">' + byStatus(k).length + '</span><small>' + label + '</small>';
      b.addEventListener('click', () => { S.shelf = k; S.sel = null; render(); });
      tabs.appendChild(b);
    });
    c.appendChild(tabs);

    const books = byStatus(S.shelf);
    if (!books.length) {
      c.appendChild(make('p', 'rd-empty', S.shelf === 'to_read' ? 'Your to-read shelf is empty.' : S.shelf === 'finished' ? 'Books you finish show up here.' : 'Nothing dropped.'));
      return c;
    }
    const sel = books.find((x) => x.id === S.sel) || books[0];

    const wrap = make('div', 'rd-shelfwrap');
    const row = make('div', 'rd-books');
    books.forEach((b, i) => {
      const h = hash(b.id || b.title);
      const sp = make('button', 'rd-spine' + (b.id === sel.id ? ' on' : ''));
      sp.type = 'button';
      sp.style.cssText = '--sp:' + spine(b) + ';--h:' + (116 + (h % 5) * 12) + 'px;--w:' + (36 + ((h >> 3) % 3) * 6) + 'px;--i:' + i + ';--t:' + (((h >> 5) % 5) - 2) + 'deg';
      sp.setAttribute('aria-label', b.title + (b.author ? ' by ' + b.author : ''));
      sp.title = b.title;
      sp.appendChild(make('span', 'rd-sband'));
      sp.appendChild(make('span', 'rd-stitle', b.title));
      if (b.status === 'finished' && b.rating) sp.appendChild(make('span', 'rd-sstar', '★'.repeat(Math.min(b.rating, 5) > 3 ? 1 : 0) || ''));
      sp.addEventListener('click', () => { S.sel = b.id; render(); });
      row.appendChild(sp);
    });
    wrap.appendChild(row);
    wrap.appendChild(make('div', 'rd-plank'));
    c.appendChild(wrap);

    const d = make('div', 'rd-detail');
    d.style.setProperty('--sp', spine(sel));
    const text = make('div', 'rd-dtext');
    text.appendChild(make('p', 'rd-dtitle', sel.title));
    if (sel.author) text.appendChild(make('small', 'rd-dauthor', sel.author));
    const pills = make('div', 'rd-dpills');
    if (sel.pages) pills.appendChild(make('span', '', fmt(sel.pages) + ' pages'));
    if (sel.finished_on) pills.appendChild(make('span', '', 'finished ' + parseDay(sel.finished_on).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })));
    if (sel.status === 'dropped') pills.appendChild(make('span', '', 'dropped'));
    if (pills.children.length) text.appendChild(pills);
    if (sel.rating) { const r = make('span', 'rd-rate'); r.innerHTML = starSvg.repeat(sel.rating); r.setAttribute('aria-label', sel.rating + ' of 5'); text.appendChild(r); }
    d.appendChild(text);
    const acts = make('div', 'rd-dacts');
    if (S.shelf === 'to_read') {
      const start = make('button', 'rd-log', 'Start');
      start.type = 'button';
      start.addEventListener('click', () => startBook(sel));
      acts.appendChild(start);
    }
    const edit = make('button', 'rd-edit', 'Edit');
    edit.type = 'button';
    edit.addEventListener('click', () => openBook(sel));
    acts.appendChild(edit);
    d.appendChild(acts);
    c.appendChild(d);
    return c;
  }

  function weekCard() {
    const c = figure('rd-week-card');
    const head = make('div', 'rd-head');
    head.appendChild(make('p', 'rd-k', 'Last 7 days'));
    head.appendChild(make('span', 'rd-pillsm', fmt(S.data.week_pages) + ' pages'));
    c.appendChild(head);
    const days = Array.from({ length: 7 }, (_, i) => addDays(new Date(), i - 6));
    const vals = days.map((d) => S.data.days[dayKey(d)] || 0);
    const max = Math.max(20, ...vals);
    const W = 900, H = 160, padB = 28, top = 20, bw = 74;
    const gap = (W - bw * 7) / 6;
    let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="rd-chart" role="img" aria-label="Pages read in the last seven days">';
    days.forEach((d, i) => {
      const x = i * (bw + gap);
      const v = vals[i];
      const h = Math.max(v ? 6 : 3, (H - padB - top) * (v / max));
      svg += '<rect class="rd-barr' + (v ? '' : ' none') + (dayKey(d) === todayKey() ? ' now' : '') + '" x="' + x + '" y="' + (H - padB - h) + '" width="' + bw + '" height="' + h + '" rx="14"><title>' + d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' }) + ': ' + v + ' pages</title></rect>';
      if (v) svg += '<text class="rd-val" x="' + (x + bw / 2) + '" y="' + (H - padB - h - 5) + '" text-anchor="middle">' + v + '</text>';
      svg += '<text class="rd-dow" x="' + (x + bw / 2) + '" y="' + (H - 7) + '" text-anchor="middle">' + d.toLocaleDateString(undefined, { weekday: 'narrow' }) + '</text>';
    });
    c.insertAdjacentHTML('beforeend', svg + '</svg>');
    return c;
  }

  function render() {
    const board = make('div', 'identity rd-board');
    const g = make('div', 'rd-idgrid');
    g.append(wordCard(), tiles(), readingCard(), shelfCard(), weekCard());
    board.appendChild(g);
    $('rdGrid').replaceChildren(board);
  }

  // ---- book dialog -------------------------------------------------------------------------------------------------------------------------------
  let editing = null;
  let status = 'reading';
  let rating = 0;
  let armed = 0;
  const pressed = (box, value) => box.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === value)));
  function drawStars() {
    const box = $('rdStars');
    box.replaceChildren();
    for (let i = 1; i <= 5; i++) {
      const b = make('button', i <= rating ? 'on' : '');
      b.type = 'button';
      b.innerHTML = starSvg;
      b.setAttribute('aria-label', i + (i === 1 ? ' star' : ' stars'));
      b.addEventListener('click', () => { rating = rating === i ? 0 : i; drawStars(); });
      box.appendChild(b);
    }
  }
  const showNow = () => { $('rdNowWrap').hidden = status !== 'reading'; };

  function openBook(b) {
    editing = b;
    status = b ? b.status : 'reading';
    rating = b && b.rating ? b.rating : 0;
    $('rdBookTitle').textContent = b ? 'Edit book' : 'Add book';
    $('rdTitle').value = b ? b.title : '';
    $('rdAuthor').value = b && b.author ? b.author : '';
    $('rdPages').value = b && b.pages ? b.pages : '';
    $('rdNow').value = b && b.current_page ? b.current_page : '';
    $('rdNotes').value = b && b.notes ? b.notes : '';
    pressed($('rdStatus'), status);
    showNow();
    drawStars();
    $('rdBookErr').hidden = true;
    $('rdBookSave').disabled = false;
    const del = $('rdBookDelete');
    del.hidden = !b;
    del.classList.remove('sure');
    del.textContent = 'Delete this book';
    $('rdBookDialog').showModal();
    $('rdTitle').focus();
  }

  async function saveBook(event) {
    event.preventDefault();
    const title = $('rdTitle').value.trim();
    const err = $('rdBookErr');
    err.hidden = true;
    if (!title) { err.textContent = 'Give the book a title.'; err.hidden = false; return; }
    $('rdBookSave').disabled = true;
    const pages = int($('rdPages').value) || null;
    const body = { title, author: $('rdAuthor').value.trim(), status, current_page: status === 'reading' ? int($('rdNow').value) : (editing ? editing.current_page : 0), notes: $('rdNotes').value.trim(), rating: rating || (editing ? 0 : null) };
    if (pages) body.pages = pages;
    try {
      if (editing) await api('/v1/books/' + editing.id, { method: 'PATCH', body: { ...body, today: todayKey() } });
      else await api('/v1/books', { method: 'POST', body: { ...body, author: body.author || null, notes: body.notes || null, rating: rating || null } });
      $('rdBookDialog').close();
      toast(editing ? 'Saved' : 'Book added');
      await load();
    } catch (e) {
      err.textContent = e.message;
      err.hidden = false;
      $('rdBookSave').disabled = false;
    }
  }

  async function removeBook() {
    const del = $('rdBookDelete');
    if (!armed) {
      armed = setTimeout(() => { armed = 0; del.classList.remove('sure'); del.textContent = 'Delete this book'; }, 4000);
      del.classList.add('sure');
      del.textContent = 'Sure? This also deletes its reading log';
      return;
    }
    clearTimeout(armed);
    armed = 0;
    try {
      await api('/v1/books/' + editing.id, { method: 'DELETE' });
      $('rdBookDialog').close();
      toast('Book deleted');
      await load();
    } catch (e) { toast(e.message); }
  }

  async function startBook(b) {
    try { await api('/v1/books/' + b.id, { method: 'PATCH', body: { status: 'reading', today: todayKey() } }); toast('Started ' + b.title); await load(); } catch (e) { toast(e.message); }
  }

  // ---- log pages dialog ----------------------------------------------------------------------------------------------------------------------------
  let logging = null;
  let logAgo = 0;
  function openLog(b) {
    logging = b;
    logAgo = 0;
    $('rdLogBook').textContent = b.title;
    $('rdLogPages').value = '';
    pressed($('rdLogDay'), '0');
    $('rdLogErr').hidden = true;
    $('rdLogSave').disabled = false;
    $('rdLogDialog').showModal();
    $('rdLogPages').focus();
  }
  async function saveLog(event) {
    event.preventDefault();
    const pages = int($('rdLogPages').value);
    const err = $('rdLogErr');
    err.hidden = true;
    if (!pages) { err.textContent = 'How many pages did you read?'; err.hidden = false; return; }
    $('rdLogSave').disabled = true;
    try {
      const book = await api('/v1/books/' + logging.id + '/log', { method: 'POST', body: { day: dayKey(addDays(new Date(), -logAgo)), pages } });
      $('rdLogDialog').close();
      toast(book.status === 'finished' ? 'Finished ' + book.title + '!' : 'Added ' + pages + ' pages');
      await load();
    } catch (e) {
      err.textContent = e.message;
      err.hidden = false;
      $('rdLogSave').disabled = false;
    }
  }

  // ---- stars trail the pointer (same as the other pages) ---------------------------------------------------------------------------------------
  function sparkTrail() {
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const SP = 'M0,-1 C.15,-.3 .3,-.15 1,0 C.3,.15 .15,.3 0,1 C-.15,.3 -.3,.15 -1,0 C-.3,-.15 -.15,-.3 0,-1Z';
    const layer = make('div', 'rd-trail');
    document.body.appendChild(layer);
    const LIGHT = ['#ff8fd0', '#1b0a63', '#fffdf6'];
    const DARK = ['#ff8fd0', '#b6f35a', '#f4efff'];
    let last = 0, lx = -99, ly = -99;
    document.addEventListener('pointermove', (event) => {
      if (event.pointerType === 'touch') return;
      const now = performance.now();
      if (now - last < 55 || Math.hypot(event.clientX - lx, event.clientY - ly) < 18) return;
      const target = event.target;
      if (target.closest && target.closest('dialog, input, button')) return;
      last = now; lx = event.clientX; ly = event.clientY;
      const surface = target.closest ? target.closest('.rd-fig') : null;
      let dark = false;
      if (surface) {
        const m = getComputedStyle(surface).backgroundColor.match(/\d+(\.\d+)?/g);
        if (m) dark = (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]) < 110;
      }
      const colors = dark ? DARK : LIGHT;
      const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      s.setAttribute('viewBox', '-1 -1 2 2');
      s.setAttribute('class', 'rd-bs');
      s.innerHTML = '<path d="' + SP + '"/>';
      const size = 12 + Math.random() * 16;
      s.style.cssText = 'left:' + event.clientX + 'px;top:' + event.clientY + 'px;width:' + size + 'px;height:' + size + 'px;color:' + colors[Math.floor(Math.random() * 3)] +
        ';--dx:' + (Math.random() * 40 - 20).toFixed(0) + 'px;--dy:' + (Math.random() * 30 - 8).toFixed(0) + 'px';
      s.addEventListener('animationend', () => s.remove());
      layer.appendChild(s);
    });
  }

  function init() {
    sparkTrail();
    $('rdBookClose').addEventListener('click', () => $('rdBookDialog').close());
    $('rdLogClose').addEventListener('click', () => $('rdLogDialog').close());
    ['rdBookDialog', 'rdLogDialog'].forEach((id) => $(id).addEventListener('click', (e) => { if (e.target === $(id)) $(id).close(); }));
    $('rdBookForm').addEventListener('submit', saveBook);
    $('rdLogForm').addEventListener('submit', saveLog);
    $('rdBookDelete').addEventListener('click', removeBook);
    $('rdStatus').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { status = b.dataset.v; pressed($('rdStatus'), status); showNow(); } });
    $('rdLogDay').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { logAgo = Number(b.dataset.v); pressed($('rdLogDay'), b.dataset.v); } });
    $('rdLogChips').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { $('rdLogPages').value = int($('rdLogPages').value) + Number(b.dataset.n); } });
    load().catch(() => {
      $('rdGrid').hidden = true;
      $('rdEmpty').textContent = 'Could not load your books right now.';
      $('rdEmpty').hidden = false;
    });
    let lastToday = todayKey();
    setInterval(() => { const t = todayKey(); if (t !== lastToday) { lastToday = t; load().catch(() => {}); } }, 60 * 1000);
  }

  init();
})();
