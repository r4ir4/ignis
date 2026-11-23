// Read page, laid out like the Food page: a heading, the reading list in the main column (reading now, then to read / finished / dropped),
// and on the right the add button, four number tiles and a chart of the pages read each day of a month. Backed by the shared ignis API.
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(2, '0');
  const dayKey = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parseDay = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
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
  const now0 = new Date();
  const S = { data: null, shelf: 'to_read', month: { y: now0.getFullYear(), m: now0.getMonth() }, mcache: {} };
  const SPINES = ['#f2b84b', '#b7c98b', '#d9653b', '#fbeedc'];
  const STAR = 'M16 3L19.7 11.6L29 12.4L21.9 18.5L24.1 27.6L16 22.7L7.9 27.6L10.1 18.5L3 12.4L12.3 11.6Z';
  const starSvg = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="' + STAR + '"/></svg>';

  async function load() {
    S.data = await api('/v1/books/overview?day=' + todayKey() + '&window=31');
    S.mcache = {};
    render();
  }

  const byStatus = (s) => S.data.books.filter((b) => b.status === s);
  const pct = (b) => (b.pages ? Math.min(100, Math.round((b.current_page / b.pages) * 100)) : 0);
  const spine = (b) => SPINES[Math.max(0, S.data.books.indexOf(b)) % SPINES.length];
  const figure = (cls) => make('figure', 'fd-fig ' + cls);

  // ---- heading, like Food and Todo ----------------------------------------------------------------------------------------------------------------
  function pageHead() {
    const d = S.data;
    const head = make('header', 'fd-pagehead');
    head.innerHTML = '<svg class="h-tw fd-tw" style="--x:34%;--y:18%;--s:20px;--d:0s" viewBox="0 0 32 32" aria-hidden="true"><use href="#spark"/></svg>' +
      '<svg class="h-tw fd-tw fd-tw-p" style="--x:46%;--y:58%;--s:13px;--d:1.1s" viewBox="0 0 32 32" aria-hidden="true"><use href="#spark"/></svg>';
    const text = make('div');
    text.appendChild(make('h1', '', 'Read'));
    const date = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
    const reading = byStatus('reading').length;
    text.appendChild(make('p', 'fd-pagesub', date + ' · ' + (d.today_pages ? fmt(d.today_pages) + (d.today_pages === 1 ? ' page' : ' pages') + ' today' : 'nothing read yet today') + (reading ? ' · ' + reading + ' reading' : '')));
    head.appendChild(text);
    return head;
  }

  // Add book: the text button with a plus, like Add task on the Todo page
  function addButton() {
    const wrap = make('div', 'fd-addwrap');
    const b = make('button', 'fd-mini');
    b.type = 'button'; b.id = 'rdAddOpen';
    b.innerHTML = '<span class="fd-plus" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></span><span>Add book</span>';
    b.addEventListener('click', () => openBook(null));
    wrap.appendChild(b);
    return wrap;
  }

  // ---- number tiles ---------------------------------------------------------------------------------------------------------------------------------
  const ICON = {
    book: '<g class="rd-i-book"><path d="M10 22C10 22 24 18 42 24V68C24 62 10 66 10 66Z" fill="currentColor"/><path d="M74 22C74 22 60 18 42 24V68C60 62 74 66 74 66Z" fill="currentColor" opacity=".65"/></g>',
    flame: '<g class="fd-i-flame"><path fill="currentColor" d="M42 18C45 32 31 35 33 48C37 46 39 42 42 38C42 47 54 50 54 59C54 67 48 70 42 70C35 70 29 65 29 57C29 41 40 35 42 18Z"/><path class="fd-i-core" d="M42 52C42 58 36 59 36 63C36 66 38 68 42 68C46 68 48 66 48 62C48 58 44 56 42 52Z"/></g>',
    stack: '<g class="rd-i-stack" fill="currentColor"><rect x="14" y="52" width="56" height="12" rx="3"/><rect x="20" y="38" width="50" height="12" rx="3" transform="rotate(-3 45 44)"/><rect x="16" y="24" width="52" height="12" rx="3" transform="rotate(2 42 30)"/></g>',
    mark: '<g class="rd-i-mark"><path d="M24 14H60V70L42 56L24 70Z" fill="currentColor"/><path d="M42 24l3 6.5 7 .8-5.2 4.8 1.4 7-6.2-3.6-6.2 3.6 1.4-7-5.2-4.8 7-.8Z" fill="#fffdf6" opacity=".85"/></g>',
  };
  function tile(cls, label, value, unit, icon, sub) {
    const li = make('li', 'fd-tile ' + cls);
    const left = make('span', 'fd-tl');
    left.appendChild(make('small', '', label));
    const b = make('b', 'fd-num');
    const n = make('span', '', '0');
    b.appendChild(n);
    if (unit) b.appendChild(make('em', '', unit));
    left.appendChild(b);
    left.appendChild(make('span', 'fd-goal', sub));
    li.appendChild(left);
    const art = make('span', 'fd-art');
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
    const ul = make('ul', 'fd-tiles');
    ul.setAttribute('aria-label', 'Reading numbers');
    ul.append(
      tile('t-cal', 'Pages today', d.today_pages, '', 'book', d.week_pages ? fmt(d.week_pages) + ' this week' : 'none this week'),
      tile('t-pro', 'Reading streak', d.streak, d.streak === 1 ? 'day' : 'days', 'flame', d.streak ? 'keep it going' : 'read today to start'),
      tile('t-carb', 'Pages this month', d.month_pages, '', 'stack', new Date().toLocaleDateString(undefined, { month: 'long' })),
      tile('t-fat', 'Finished this year', d.finished_year, d.finished_year === 1 ? 'book' : 'books', 'mark', String(new Date().getFullYear())),
    );
    return ul;
  }

  // ---- the list: reading now, then to read / finished / dropped -------------------------------------------------------------------------------
  // covers live on the server: GET api/v1/books/<id>/cover (?v= changes with every update, so the browser may keep it)
  const coverUrl = (b) => 'api/v1/books/' + b.id + '/cover?v=' + encodeURIComponent(b.updated_at || '');
  function fillCover(box, b, src) {
    box.replaceChildren();
    if (src || (b && b.has_cover)) {
      const img = make('img');
      img.alt = ''; img.decoding = 'async';
      img.src = src || coverUrl(b);
      box.appendChild(img);
      box.classList.add('has-img');
    } else {
      box.classList.remove('has-img');
      box.appendChild(make('b', '', (((b && b.title) || '').trim()[0] || '+').toUpperCase()));
    }
  }

  // checkpoints along the bar: page 10 first, then a step that grows with the book (25 / 50 / 100 / 250 pages), never crowding each other or the end
  function checkpoints(pages) {
    if (!pages || pages < 30) return [];
    const step = pages <= 150 ? 25 : pages <= 400 ? 50 : pages <= 1200 ? 100 : 250;
    const marks = [];
    let last = 0;
    const take = (m, first) => { if (m < pages && (first || (m - last) / pages >= 0.07) && (pages - m) / pages >= 0.06) { marks.push(m); last = m; } };
    take(10, true);   // the first stop is always page 10
    for (let m = step; m < pages; m += step) take(m);
    return marks;
  }

  // a book being read: a card with a cover, the progress and the actions
  function readingRow(b) {
    const li = make('li', 'rd-now');
    li.style.setProperty('--hc', spine(b));
    const cover = make('span', 'rd-cover');
    cover.setAttribute('aria-hidden', 'true');
    fillCover(cover, b);
    li.appendChild(cover);
    const body = make('div', 'rd-nbody');
    body.appendChild(make('p', 'rd-ntitle', b.title));
    if (b.author) body.appendChild(make('small', 'rd-nauthor', b.author));
    let barRow = null;
    if (b.pages) {
      const row = make('div', 'rd-nbar');
      barRow = row;
      const track = make('div', 'rd-track');
      const bar = make('span', 'rd-bar');
      const fill = make('i');
      bar.appendChild(fill);
      requestAnimationFrame(() => requestAnimationFrame(() => track.style.setProperty('--p', pct(b) + '%')));   // the fill, the flame and the bubble all slide to it together
      track.appendChild(bar);
      const marks = checkpoints(b.pages);
      marks.forEach((m) => {
        const ck = make('span', 'rd-ck' + (b.current_page >= m ? ' hit' : '') + (Math.abs(m - b.current_page) / b.pages < 0.04 ? ' under' : ''));   // the flame sits on a checkpoint it has just reached
        ck.style.left = (m / b.pages * 100) + '%';
        ck.title = 'Page ' + fmt(m) + (b.current_page >= m ? ' · reached' : '');
        const sp = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        sp.setAttribute('viewBox', '-2 -2 36 36');
        sp.innerHTML = '<path d="M16 0C17 10 22 15 32 16C22 17 17 22 16 32C15 22 10 17 0 16C10 15 15 10 16 0Z"/>';
        ck.appendChild(sp);
        ck.appendChild(make('em', '', String(m)));
        track.appendChild(ck);
      });
      const flame = make('span', 'rd-flame');
      flame.setAttribute('aria-hidden', 'true');
      flame.innerHTML = '<svg viewBox="24 14 34 60" preserveAspectRatio="xMidYMax meet">' + ICON.flame + '</svg>';
      track.appendChild(flame);
      track.appendChild(make('span', 'rd-here', 'p. ' + fmt(b.current_page)));
      const end = make('span', 'rd-ckend');
      end.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 21V3"/><path d="M6 4h12l-3 4.5 3 4.5H6Z"/></svg><em>' + fmt(b.pages) + '</em>';
      track.appendChild(end);
      row.append(track, make('b', 'rd-npct', pct(b) + '%'));
      const next = marks.find((m) => m > b.current_page);
      const left = Math.max(0, b.pages - b.current_page);
      body.appendChild(make('small', 'rd-nmeta', 'Page ' + fmt(b.current_page) + ' of ' + fmt(b.pages) + ' · ' + (next ? 'next stop ' + fmt(next) + ' (' + fmt(next - b.current_page) + ' to go)' : fmt(left) + (left === 1 ? ' page' : ' pages') + ' to the end')));
    } else {
      body.appendChild(make('small', 'rd-nmeta', fmt(b.current_page) + (b.current_page === 1 ? ' page' : ' pages') + ' read · add the total in Edit to see progress'));
    }
    li.appendChild(body);
    const acts = make('div', 'rd-nacts');
    acts.append(actBtn('Log pages', () => openLog(b), 'rd-go'), actBtn('Edit', () => openBook(b)));
    li.appendChild(acts);
    if (barRow) li.appendChild(barRow);   // the bar runs the full width of the card, under the cover and the title
    return li;
  }
  function bookRow(b, kind) {
    const li = make('li', 'fd-row rd-row');
    li.style.setProperty('--hc', spine(b));
    li.appendChild(make('i', 'fd-bullet'));
    const name = make('div', 'fd-name', b.title);
    const bits = [];
    if (b.author) bits.push(b.author);
    if (kind !== 'reading' && b.pages) bits.push(fmt(b.pages) + ' pages');
    if (kind === 'finished' && b.finished_on) bits.push('finished ' + parseDay(b.finished_on).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }));
    if (bits.length) name.appendChild(make('small', '', bits.join(' · ')));
    if (kind === 'reading') {
      if (b.pages) {
        const bar = make('span', 'rd-bar');
        const fill = make('i');
        bar.appendChild(fill);
        requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = pct(b) + '%'; }));
        name.appendChild(bar);
        name.appendChild(make('small', '', 'Page ' + fmt(b.current_page) + ' of ' + fmt(b.pages) + ' · ' + pct(b) + '%'));
      } else name.appendChild(make('small', '', fmt(b.current_page) + (b.current_page === 1 ? ' page' : ' pages') + ' read · add the total in Edit to see progress'));
    }
    if (kind === 'finished' && b.rating) { const r = make('span', 'rd-rate'); r.innerHTML = starSvg.repeat(b.rating); r.setAttribute('aria-label', b.rating + ' of 5'); name.appendChild(r); }
    li.appendChild(name);
    const acts = make('div', 'rd-acts');
    if (kind === 'reading') acts.appendChild(actBtn('Log pages', () => openLog(b), 'rd-go'));
    if (kind === 'to_read') acts.appendChild(actBtn('Start', () => startBook(b), 'rd-go'));
    acts.appendChild(actBtn('Edit', () => openBook(b)));
    li.appendChild(acts);
    return li;
  }
  function actBtn(label, fn, cls) {
    const b = make('button', 'fd-edit' + (cls ? ' ' + cls : ''), label);
    b.type = 'button';
    b.addEventListener('click', fn);
    return b;
  }
  function listCard() {
    const c = figure('fd-log rd-log');
    const list = make('ul', 'fd-list');
    const reading = byStatus('reading');
    if (reading.length) {
      list.appendChild(make('li', 'fd-group g5', 'Reading now'));
      reading.forEach((b) => list.appendChild(readingRow(b)));
    }
    const li = make('li', 'rd-tabsrow');
    const tabs = make('div', 'rd-tabs');
    tabs.setAttribute('role', 'group'); tabs.setAttribute('aria-label', 'Shelf');
    [['to_read', 'To read'], ['finished', 'Finished'], ['dropped', 'Dropped']].forEach(([k, label]) => {
      const b = make('button', 'rd-tab');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(S.shelf === k));
      b.innerHTML = '<span>' + label + '</span><b>' + byStatus(k).length + '</b>';
      b.addEventListener('click', () => { S.shelf = k; render(); });
      tabs.appendChild(b);
    });
    li.appendChild(tabs);
    list.appendChild(li);
    const books = byStatus(S.shelf);
    if (!books.length) list.appendChild(make('li', 'fd-empty', S.shelf === 'to_read' ? 'Your to-read list is empty. Add a book you want to read.' : S.shelf === 'finished' ? 'Books you finish show up here.' : 'Nothing dropped.'));
    else books.forEach((b) => list.appendChild(bookRow(b, S.shelf)));
    c.appendChild(list);
    return c;
  }

  // ---- the month chart: pages read each day, with arrows to other months ------------------------------------------------------------------------
  const monthKey = (m) => m.y + '-' + pad(m.m + 1);
  const isCurrentMonth = (m) => m.y === now0.getFullYear() && m.m === now0.getMonth();
  async function monthDays(m) {
    if (isCurrentMonth(m)) return S.data.days;
    const key = monthKey(m);
    if (!S.mcache[key]) {
      const end = new Date(m.y, m.m + 1, 0);
      const res = await api('/v1/books/overview?day=' + dayKey(end) + '&window=31');
      S.mcache[key] = res.days;
    }
    return S.mcache[key];
  }
  const ARROW = (d) => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + (d < 0 ? 'm14.5 6-6 6 6 6' : 'm9.5 6 6 6-6 6') + '"/></svg>';
  function monthCard() {
    const c = figure('fd-week-card rd-month');
    const m = S.month;
    const head = make('div', 'fd-head');
    head.appendChild(make('p', 'fd-k', new Date(m.y, m.m, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })));
    const nav = make('div', 'fd-pnav rd-mnav');
    const prev = make('button', 'fd-parrow'); prev.type = 'button'; prev.innerHTML = ARROW(-1); prev.setAttribute('aria-label', 'Previous month');
    const next = make('button', 'fd-parrow'); next.type = 'button'; next.innerHTML = ARROW(1); next.setAttribute('aria-label', 'Next month');
    next.disabled = isCurrentMonth(m);
    prev.addEventListener('click', () => { S.month = { y: m.m === 0 ? m.y - 1 : m.y, m: m.m === 0 ? 11 : m.m - 1 }; render(); });
    next.addEventListener('click', () => { S.month = { y: m.m === 11 ? m.y + 1 : m.y, m: m.m === 11 ? 0 : m.m + 1 }; render(); });
    nav.append(prev, next);
    head.appendChild(nav);
    c.appendChild(head);
    const holder = make('div', 'rd-chartwrap');
    c.appendChild(holder);
    const sub = make('p', 'fd-legend rd-sub');
    c.appendChild(sub);
    const pill = make('span', 'fd-pillsm', '…');
    head.insertBefore(pill, nav);
    const draw = (days) => {
      const n = new Date(m.y, m.m + 1, 0).getDate();
      const today = isCurrentMonth(m) ? now0.getDate() : (m.y > now0.getFullYear() || (m.y === now0.getFullYear() && m.m > now0.getMonth()) ? 0 : n);
      const vals = Array.from({ length: n }, (_, i) => days[m.y + '-' + pad(m.m + 1) + '-' + pad(i + 1)] || 0);
      const total = vals.reduce((a, b) => a + b, 0);
      const max = Math.max(20, ...vals);
      const best = Math.max(...vals);
      const W = 420, H = 200, padL = 4, padB = 26, top = 18;
      const slot = (W - padL * 2) / n, bw = Math.max(6, slot - 3.5);
      let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="fd-chart" role="img" aria-label="Pages read each day in ' + c.querySelector('.fd-k').textContent + '">';
      const done = Math.min(n, today);
      const avg = done ? total / done : 0;
      if (avg) {
        const ya = top + (H - padB - top) * (1 - avg / max);
        svg += '<line class="fd-goalline" x1="0" x2="' + W + '" y1="' + ya + '" y2="' + ya + '"/><text class="fd-goaltxt" x="' + (W - 2) + '" y="' + (ya - 5) + '" text-anchor="end">avg ' + Math.round(avg) + '</text>';
      }
      vals.forEach((v, i) => {
        const x = padL + i * slot + (slot - bw) / 2;
        const h = Math.max(v ? 4 : 3, (H - padB - top) * (v / max));
        const day = i + 1;
        const future = day > today;
        svg += '<rect class="fd-barr' + (v ? '' : ' none') + (future ? ' future' : '') + (isCurrentMonth(m) && day === today ? ' sel' : '') + '" x="' + x.toFixed(1) + '" y="' + (H - padB - h).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="3.5"><title>' +
          new Date(m.y, m.m, day).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }) + ' · ' + (v ? v + (v === 1 ? ' page' : ' pages') : 'nothing read') + '</title></rect>';
        if (v && v === best && best >= 5) svg += '<text class="rd-val" x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - padB - h - 5).toFixed(1) + '" text-anchor="middle">' + v + '</text>';
        if (day === 1 || day % 5 === 0 || day === n) svg += '<text class="fd-dow" x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - 7) + '" text-anchor="middle">' + day + '</text>';
      });
      holder.innerHTML = svg + '</svg>';
      pill.textContent = fmt(total) + (total === 1 ? ' page' : ' pages');
      sub.textContent = total ? 'Best day: ' + best + (best === 1 ? ' page' : ' pages') + ' · ' + Math.round(avg) + ' a day on average' : 'No pages logged this month.';
    };
    if (isCurrentMonth(m) || S.mcache[monthKey(m)]) { monthDays(m).then(draw); }
    else { holder.classList.add('loading'); monthDays(m).then((d) => { holder.classList.remove('loading'); draw(d); }).catch((e) => toast(e.message)); }
    return c;
  }

  function render() {
    const wrap = make('div', 'fd-wrap');
    const main = make('section', 'fd-main');
    const side = make('aside', 'fd-sidecol');
    main.append(pageHead(), listCard());
    side.append(addButton(), tiles(), monthCard());
    wrap.append(main, side);
    $('rdGrid').replaceChildren(wrap);
  }

  // ---- book dialog -----------------------------------------------------------------------------------------------------------------------------------
  let editing = null;
  let rating = 0;
  let armed = 0;
  let coverEdit = null;   // null: unchanged, a data URL: a new picture, 'remove': take it off
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
  const showNow = () => { $('rdNowWrap').hidden = $('rdStatus').value !== 'reading'; };

  function showCover(b) {
    const prev = $('rdCoverPreview');
    prev.style.setProperty('--hc', b ? spine(b) : SPINES[0]);
    if (coverEdit && coverEdit !== 'remove') fillCover(prev, b, coverEdit);
    else if (coverEdit === 'remove') fillCover(prev, { title: b ? b.title : '' }, null);
    else fillCover(prev, b || { title: '' }, null);
    const has = (coverEdit && coverEdit !== 'remove') || (!coverEdit && b && b.has_cover);
    $('rdCoverRemove').hidden = !has;
    $('rdCoverPick').textContent = has ? 'Change cover' : 'Upload cover';
  }
  // shrink the picture in the browser first: about 240 px wide, a JPEG of a few dozen KB
  function resizeCover(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const max = 360;
        const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        const ctx = cv.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        let q = 0.85, out = cv.toDataURL('image/jpeg', q);
        while (out.length > 380000 && q > 0.4) { q -= 0.1; out = cv.toDataURL('image/jpeg', q); }
        resolve(out);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file is not a picture the browser can read.')); };
      img.src = url;
    });
  }

  function openBook(b) {
    editing = b;
    rating = b && b.rating ? b.rating : 0;
    coverEdit = null;
    $('rdCoverFile').value = '';
    showCover(b);
    $('rdBookTitle').textContent = b ? 'Edit book' : 'Add book';
    $('rdTitle').value = b ? b.title : '';
    $('rdAuthor').value = b && b.author ? b.author : '';
    $('rdStatus').value = b ? b.status : (S.shelf === 'to_read' || S.shelf === 'finished' || S.shelf === 'dropped' ? 'to_read' : 'reading');
    $('rdPages').value = b && b.pages ? b.pages : '';
    $('rdNow').value = b && b.current_page ? b.current_page : '';
    $('rdNotes').value = b && b.notes ? b.notes : '';
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
    const status = $('rdStatus').value;
    const pages = int($('rdPages').value) || null;
    const body = { title, author: $('rdAuthor').value.trim(), status, current_page: status === 'reading' ? int($('rdNow').value) : (editing ? editing.current_page : 0), notes: $('rdNotes').value.trim(), rating: rating || null };
    if (pages) body.pages = pages;
    try {
      let saved;
      if (editing) saved = await api('/v1/books/' + editing.id, { method: 'PATCH', body: { ...body, today: todayKey() } });
      else saved = await api('/v1/books', { method: 'POST', body: { ...body, author: body.author || null, notes: body.notes || null } });
      if (coverEdit === 'remove') { if (editing && editing.has_cover) await api('/v1/books/' + saved.id + '/cover', { method: 'DELETE' }); }
      else if (coverEdit) await api('/v1/books/' + saved.id + '/cover', { method: 'PUT', body: { image: coverEdit } });
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

  // ---- log pages dialog -------------------------------------------------------------------------------------------------------------------------------
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
    const d = new Date(); d.setDate(d.getDate() - logAgo);
    try {
      const book = await api('/v1/books/' + logging.id + '/log', { method: 'POST', body: { day: dayKey(d), pages } });
      $('rdLogDialog').close();
      toast(book.status === 'finished' ? 'Finished ' + book.title + '!' : 'Added ' + pages + ' pages');
      await load();
    } catch (e) {
      err.textContent = e.message;
      err.hidden = false;
      $('rdLogSave').disabled = false;
    }
  }

  // ---- stars trail the pointer (same as the other pages) --------------------------------------------------------------------------------------
  function sparkTrail() {
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const SP = 'M0,-1 C.15,-.3 .3,-.15 1,0 C.3,.15 .15,.3 0,1 C-.15,.3 -.3,.15 -1,0 C-.3,-.15 -.15,-.3 0,-1Z';
    const layer = make('div', 'fd-trail');
    document.body.appendChild(layer);
    const LIGHT = ['#b83a2a', '#3a2418', '#fffdf6'];
    const DARK = ['#f2b84b', '#b7c98b', '#fbeedc'];
    let last = 0, lx = -99, ly = -99;
    document.addEventListener('pointermove', (event) => {
      if (event.pointerType === 'touch') return;
      const t = performance.now();
      if (t - last < 55 || Math.hypot(event.clientX - lx, event.clientY - ly) < 18) return;
      const target = event.target;
      if (target.closest && target.closest('dialog, input, button')) return;
      last = t; lx = event.clientX; ly = event.clientY;
      const surface = target.closest ? target.closest('.fd-fig') : null;
      let dark = false;
      if (surface) {
        const m = getComputedStyle(surface).backgroundColor.match(/\d+(\.\d+)?/g);
        if (m) dark = (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]) < 110;
      }
      const colors = dark ? DARK : LIGHT;
      const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      s.setAttribute('viewBox', '-1 -1 2 2');
      s.setAttribute('class', 'fd-bs');
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
    $('rdBookForm').addEventListener('submit', saveBook);
    $('rdLogForm').addEventListener('submit', saveLog);
    $('rdBookDelete').addEventListener('click', removeBook);
    $('rdStatus').addEventListener('change', showNow);
    $('rdCoverPick').addEventListener('click', () => $('rdCoverFile').click());
    $('rdCoverFile').addEventListener('change', async () => {
      const f = $('rdCoverFile').files[0];
      if (!f) return;
      try { coverEdit = await resizeCover(f); showCover(editing); } catch (e) { toast(e.message); }
    });
    $('rdCoverRemove').addEventListener('click', () => { coverEdit = 'remove'; $('rdCoverFile').value = ''; showCover(editing); });
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
