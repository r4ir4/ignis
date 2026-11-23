// Trips page: plan trips, count down to them, keep photos, day-by-day plans and places to see with Google Maps.
// Everything is stored on the Ignis server (/v1/trips); photos are resized here and kept as files next to the database.
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(2, '0');
  const dayKey = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parseDay = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const today = () => parseDay(dayKey(new Date()));
  const diff = (a, b) => Math.round((a - b) / 86400000);
  const make = (tag, cls, text) => { const el = document.createElement(tag); if (cls) el.className = cls; if (text != null) el.textContent = text; return el; };
  const fmtDate = (k, o) => parseDay(k).toLocaleDateString('pt-BR', o || { day: 'numeric', month: 'short', year: 'numeric' });
  const photoSrc = (id) => 'api/v1/trips/photos/' + id;

  const S = { trips: [], openId: null, day: 0, pf: 'all', tab: null };
  let toastTimer;
  function toast(text) { const el = $('toast'); el.textContent = text; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 2600); }

  async function api(path, method, body, raw) {
    const init = { method: method || 'GET', headers: {} };
    if (raw) { init.body = raw; init.headers['Content-Type'] = 'image/jpeg'; }
    else if (body) { init.body = JSON.stringify(body); init.headers['Content-Type'] = 'application/json'; }
    const res = await fetch('api/v1/trips' + path, init);
    if (!res.ok) {
      let detail = ''; try { const j = await res.json(); if (typeof j.detail === 'string') detail = j.detail; } catch (e) { /* not json */ }
      throw new Error(detail || 'Algo deu errado (' + res.status + ').');
    }
    return res.status === 204 ? null : res.json();
  }
  // Run a server change, refresh from the server and redraw. A failure shows a message and keeps what is on screen.
  async function act(fn) { try { await fn(); await refresh(); } catch (e) { toast(e.message); } }
  async function refresh() { S.trips = (await api('')).trips; route(); tick(); }

  const mapsLink = (q) => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
  const mapsEmbed = (q) => 'https://www.google.com/maps?q=' + encodeURIComponent(q) + '&output=embed';
  const byId = (id) => S.trips.find((t) => t.id === id);
  const hasDates = (t) => !!(t.start_date && t.end_date);   // a trip with no dates is only being planned
  const tripDays = (t) => { if (!hasDates(t)) return []; const out = []; const e = parseDay(t.end_date); for (let d = parseDay(t.start_date), i = 0; d <= e && i < 120; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1), i++) out.push(dayKey(d)); return out; };

  function countdown(t) {
    if (!hasDates(t)) return { n: '—', label: 'sem data', cls: 'plan' };
    const t0 = today(), a = parseDay(t.start_date), b = parseDay(t.end_date);
    const until = diff(a, t0);
    if (until > 0) return { n: until, label: until === 1 ? 'dia para ir' : 'dias para ir', cls: 'soon' };
    if (diff(b, t0) >= 0) return { n: diff(t0, a) + 1, label: 'de ' + (diff(b, a) + 1) + ' · em viagem', cls: 'now' };
    return { n: diff(t0, b), label: 'dias atrás', cls: 'past' };
  }
  const shortRange = (t) => {
    if (!hasDates(t)) return 'sem datas ainda';
    const a = parseDay(t.start_date), b = parseDay(t.end_date), m = { month: 'short' };
    if (t.start_date === t.end_date) return a.getDate() + ' ' + a.toLocaleDateString('pt-BR', m) + ' ' + a.getFullYear();
    const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
    return sameMonth ? a.getDate() + '–' + b.getDate() + ' ' + b.toLocaleDateString('pt-BR', m) + ' ' + b.getFullYear()
      : a.getDate() + ' ' + a.toLocaleDateString('pt-BR', m) + ' – ' + b.getDate() + ' ' + b.toLocaleDateString('pt-BR', m) + ' ' + b.getFullYear();
  };
  const range = (t) => !hasDates(t) ? 'Sem datas ainda' : fmtDate(t.start_date) + (t.end_date !== t.start_date ? ' – ' + fmtDate(t.end_date) : '');

  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
  // a short phrase for how far away (or how long ago) a trip is
  function span(days) {
    days = Math.abs(days);
    if (days < 14) return plural(days, 'dia', 'dias');
    if (days < 70) return plural(Math.round(days / 7), 'semana', 'semanas');
    if (days < 540) return plural(Math.round(days / 30.4375), 'mês', 'meses');
    return plural(Math.round(days / 365.25 * 10) / 10, 'ano', 'anos');
  }
  const status = (t) => {
    if (!hasDates(t)) return { cls: 'plan', text: 'planejando' };
    const t0 = today(), a = parseDay(t.start_date), b = parseDay(t.end_date), until = diff(a, t0);
    if (until > 0) return { cls: 'soon', text: 'em ' + span(until) };
    if (diff(b, t0) >= 0) return { cls: 'now', text: 'em viagem · dia ' + (diff(t0, a) + 1) + ' de ' + (diff(b, a) + 1) };
    return { cls: 'past', text: 'há ' + span(diff(t0, b)) };
  };
  const isPast = (t) => hasDates(t) && diff(parseDay(t.end_date), today()) < 0;

  function renderList() {
    $('trList').hidden = false; $('trDetail').hidden = true; $('trAdd').hidden = false;
    const upcoming = S.trips.filter((t) => hasDates(t) && !isPast(t)).sort((a, b) => a.start_date.localeCompare(b.start_date));
    const planning = S.trips.filter((t) => !hasDates(t)).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    const past = S.trips.filter(isPast).sort((a, b) => b.start_date.localeCompare(a.start_date));
    const seen = S.trips.reduce((n, t) => n + t.places.filter((p) => p.done).length, 0);
    $('tpSub').textContent = S.trips.length ? plural(S.trips.length, 'viagem', 'viagens') + (upcoming.length ? ' · ' + upcoming.length + ' com data' : '') + (planning.length ? ' · ' + planning.length + ' em planejamento' : '') + (seen ? ' · ' + plural(seen, 'lugar visto', 'lugares vistos') : '') : 'Planeje suas viagens, guarde as fotos e conte os dias.';
    $('trEmpty').textContent = 'Nenhuma viagem ainda. Planeje a primeira e a contagem regressiva começa.'; $('trEmpty').hidden = S.trips.length > 0;

    // the next trip (or the one in progress), highlighted
    const nxt = upcoming[0];
    $('trNextBox').hidden = !nxt || S.tab !== 'up';
    S.live = nxt ? { kind: 'list', trip: nxt } : null;
    if (nxt) {
      const c = countdown(nxt);
      $('trNext').textContent = c.cls === 'now' ? String(c.n) : String(c.n);
      $('trNextL').textContent = c.cls === 'now' ? 'dia da viagem' : c.n === 1 ? 'dia para ir' : 'dias para ir';
      $('trNextName').textContent = nxt.name;
      $('trNextMeta').textContent = (nxt.destination ? nxt.destination + ' · ' : '') + range(nxt);
      $('trNextOpen').onclick = () => { location.hash = nxt.id; };
    } else { $('trProg').hidden = true; $('trLive').textContent = ''; }

    // tabs: upcoming / still planning / past
    const have = { up: upcoming.length, plan: planning.length, past: past.length };
    if (S.tab == null || !have[S.tab]) S.tab = have.up ? 'up' : have.plan ? 'plan' : have.past ? 'past' : 'up';
    const tabs = $('trTabs'); tabs.replaceChildren(); tabs.hidden = !S.trips.length;
    [['up', 'Próximas', upcoming.length], ['plan', 'Planejando', planning.length], ['past', 'Passadas', past.length]].forEach(([k, label, n]) => {
      if (k === 'plan' && !n && S.tab !== 'plan') return;
      const b = make('button', 'tp-tab'); b.type = 'button'; b.setAttribute('aria-pressed', String(S.tab === k)); b.append(document.createTextNode(label), make('b', '', String(n)));
      b.onclick = () => { S.tab = k; renderList(); }; tabs.appendChild(b);
    });
    const list = $('trCards'); list.replaceChildren();
    const shown = S.tab === 'up' ? upcoming.slice(1) : S.tab === 'plan' ? planning : past;   // the next trip is already in the highlight above
    if (S.trips.length && !shown.length && !(S.tab === 'up' && nxt)) list.appendChild(make('li', 'tp-none wide', S.tab === 'up' ? 'Nenhuma viagem com data. Use o + para planejar uma.' : S.tab === 'plan' ? 'Nenhuma viagem em planejamento.' : 'Nenhuma viagem passada ainda.'));
    shown.forEach((t, i) => {
      const st = status(t);
      const li = make('li', 'tp-card ' + st.cls); li.style.setProperty('--i', Math.min(i, 12));
      li.tabIndex = 0; li.setAttribute('role', 'link');
      const open = () => { location.hash = t.id; };
      li.onclick = open; li.onkeydown = (e) => { if (e.key === 'Enter') open(); };
      const cover = make('div', 'tp-cover');
      const pic = t.cover || t.photos[0];
      if (pic) cover.style.backgroundImage = 'url(' + photoSrc(pic) + ')'; else cover.appendChild(make('i', '', (t.destination || t.name).trim().charAt(0).toUpperCase()));
      cover.appendChild(make('span', 'tp-badge', st.text));
      const body = make('div', 'tp-cbody');
      body.append(make('h3', '', t.name), make('p', 'tp-cmeta', (t.destination ? t.destination + ' · ' : '') + shortRange(t)));
      const facts = [];
      const placesN = t.places.length; if (placesN) facts.push(t.places.filter((p) => p.done).length + '/' + placesN + ' lugares');
      if (t.photos.length) facts.push(plural(t.photos.length, 'foto', 'fotos'));
      const tn = (t.todos || []).length; if (tn) facts.push((t.todos || []).filter((x) => x.done).length + '/' + tn + ' pendências');
      if (hasDates(t)) facts.push(plural(tripDays(t).length, 'dia', 'dias'));
      body.appendChild(make('p', 'tp-cfacts', facts.join(' · ')));
      li.append(cover, body); list.appendChild(li);
    });
  }

  function renderDetail(t) {
    $('trList').hidden = true; $('trDetail').hidden = false; $('trAdd').hidden = true;   // planning another trip is a list action
    const c = countdown(t), st = status(t);
    // under the page title: the way back
    const bk = make('button', 'tp-hback'); bk.type = 'button'; bk.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>Todas as viagens'; bk.onclick = () => { history.pushState('', document.title, location.pathname + location.search); route(); tick(); };
    $('tpSub').replaceChildren(bk);
    const pic = t.cover || t.photos[0], ban = $('trdBanner');
    ban.hidden = !pic; ban.style.backgroundImage = pic ? 'url(' + photoSrc(pic) + ')' : '';
    $('trdName').textContent = t.name;
    const chips = $('trdMeta'); chips.replaceChildren();
    if (t.destination) chips.appendChild(make('span', '', t.destination));
    chips.appendChild(make('span', '', range(t)));
    chips.appendChild(make('span', 'st ' + st.cls, st.text));
    $('trdN').textContent = String(c.n); $('trdL').textContent = c.cls === 'plan' ? 'sem data definida' : c.cls === 'now' ? 'dia da viagem' : c.cls === 'past' ? 'dias desde a volta' : c.n === 1 ? 'dia para ir' : 'dias para ir';
    $('trdCd').className = 'tp-strip ' + c.cls;
    S.live = c.cls === 'past' || c.cls === 'plan' ? null : { kind: 'detail', trip: t }; if (!S.live) { $('trdProg').hidden = true; $('trdLive').textContent = ''; }
    const dated = hasDates(t), todos = t.todos || [];
    // a trip without dates shows how many to-dos are done where the days would be
    $('trdDays').textContent = dated ? String(tripDays(t).length) : todos.filter((x) => x.done).length + '/' + todos.length;
    $('trdDaysL').textContent = dated ? 'dias de viagem' : 'pendências feitas';
    $('trdPhotoN').textContent = String(t.photos.length);
    $('trdSeen').textContent = t.places.filter((p) => p.done).length + '/' + t.places.length;
    const nl = $('trdNotes'); nl.replaceChildren();
    const lines = (t.note || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    lines.forEach((x) => nl.appendChild(make('li', '', x))); nl.hidden = !lines.length;
    nl.classList.toggle('one', lines.length === 1);
    if (t.destination) showMap(t.destination, t.destination, false); else $('trdMapWrap').hidden = true;
    renderDays(t); renderTodos(t); renderPlaces(t); renderPhotos(t);
  }
  function showMap(q, label, scroll) {
    const f = $('trdMap'), url = mapsEmbed(q);
    if (f.getAttribute('src') !== url) f.src = url;
    $('trdMapWrap').hidden = false; $('trdMapLink').href = mapsLink(q); $('trdMapLabel').textContent = label || q;
    if (scroll) $('trdMapWrap').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function renderDays(t) {
    const days = tripDays(t), dated = days.length > 0;
    // no dates: the day plan has nothing to show, so the to-dos take the main column
    $('trdUndated').hidden = dated; $('trdPlanSec').hidden = !dated;
    const todosSec = $('trdTodosSec'), cols = $('trdCols'), side = $('trdSide');
    if (dated) { if (todosSec.parentNode !== side) side.insertBefore(todosSec, side.firstChild); }
    else if (todosSec.parentNode !== cols) cols.insertBefore(todosSec, cols.firstChild);
    if (!dated) { $('trdItems').replaceChildren(); $('trdNoItems').hidden = true; return; }
    if (S.day >= days.length) S.day = 0;
    const tabs = $('trdTabs'); tabs.replaceChildren();
    days.forEach((k, i) => {
      const n = t.items.filter((x) => x.day === k).length;
      const b = make('button', 'tp-day'); b.type = 'button'; b.title = fmtDate(k);
      b.append(make('b', '', 'Dia ' + (i + 1)), make('small', '', fmtDate(k, { day: 'numeric', month: 'short' }).replace('.', '')));
      if (n) b.appendChild(make('em', '', String(n)));
      b.setAttribute('aria-pressed', String(i === S.day)); b.onclick = () => { S.day = i; renderDays(t); };
      tabs.appendChild(b);
    });
    const k = days[S.day];
    const wk = fmtDate(k, { weekday: 'long', day: 'numeric', month: 'long' });
    $('trdDayDate').textContent = wk.charAt(0).toUpperCase() + wk.slice(1);
    const items = t.items.filter((x) => x.day === k).sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
    const ul = $('trdItems'); ul.replaceChildren(); $('trdNoItems').hidden = items.length > 0;
    items.forEach((it) => {
      const li = make('li', 'tp-item'); li.append(make('span', 'tp-time', it.time || '—'));
      const mid = make('span', 'tp-itext'); mid.appendChild(make('b', '', it.text));
      if (it.address) { const a = make('a', '', it.address); a.href = mapsLink(it.address); a.target = '_blank'; a.rel = 'noopener'; mid.appendChild(a); }
      const x = make('button', 'tp-x'); x.type = 'button'; x.setAttribute('aria-label', 'Remover'); x.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>'; x.onclick = () => act(() => api('/items/' + it.id, 'DELETE'));
      li.append(mid, x); ul.appendChild(li);
    });
  }

  // the checklist of things to sort out before going
  function renderTodos(t) {
    const todos = t.todos || [], ul = $('trdTodos'); ul.replaceChildren();
    $('trdTodoCount').textContent = todos.length ? todos.filter((x) => x.done).length + '/' + todos.length : '';
    $('trdNoTodos').hidden = todos.length > 0;
    todos.forEach((x) => {
      const li = make('li', 'tp-todo' + (x.done ? ' done' : ''));
      const chk = make('button', 'tp-check'); chk.type = 'button'; chk.setAttribute('aria-pressed', String(x.done)); chk.setAttribute('aria-label', (x.done ? 'Desmarcar: ' : 'Marcar como feito: ') + x.text);
      chk.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'; chk.onclick = () => act(() => api('/todos/' + x.id, 'PATCH', { done: !x.done }));
      const tx = make('span', 'tp-ttext', x.text); tx.tabIndex = 0; tx.title = 'Clique para editar';
      const edit = () => {
        const inp = make('input', 'tp-tinput'); inp.value = x.text; inp.maxLength = 300; inp.setAttribute('aria-label', 'Editar pendência');
        tx.replaceWith(inp); inp.focus(); inp.select();
        let fin = false;
        const done = (keep) => { if (fin) return; fin = true; const v = inp.value.trim(); if (keep && v && v !== x.text) act(() => api('/todos/' + x.id, 'PATCH', { text: v })); else renderTodos(t); };
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); done(true); } else if (e.key === 'Escape') done(false); });
        inp.addEventListener('blur', () => done(true));
      };
      tx.onclick = edit; tx.onkeydown = (e) => { if (e.key === 'Enter') edit(); };
      const rm = make('button', 'tp-x'); rm.type = 'button'; rm.setAttribute('aria-label', 'Remover'); rm.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>'; rm.onclick = () => act(() => api('/todos/' + x.id, 'DELETE'));
      li.append(chk, tx, rm); ul.appendChild(li);
    });
  }
  async function addTodo() {
    const t = byId(S.openId), v = $('trdTodoNew').value; if (!t) return;
    const texts = v.split(/\r?\n/).map((x) => x.trim()).filter(Boolean); if (!texts.length) return;
    $('trdTodoNew').value = '';
    await act(() => api('/' + t.id + '/todos', 'POST', { texts }));
    $('trdTodoNew').focus();
  }
  $('trdTodoBtn').onclick = addTodo;
  $('trdTodoNew').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addTodo(); } });
  $('trdTodoNew').addEventListener('paste', (e) => { const tx = (e.clipboardData || window.clipboardData).getData('text'); if (/\r?\n/.test(tx.trim())) { e.preventDefault(); $('trdTodoNew').value = tx; addTodo(); } });
  $('trdSetDates').onclick = () => openTripDialog(byId(S.openId));

  function renderPlaces(t) {
    const ul = $('trdPlaces'); ul.replaceChildren(); $('trdNoPlaces').hidden = t.places.length > 0;
    $('trdPlaceCount').textContent = t.places.length ? t.places.filter((p) => p.done).length + '/' + t.places.length : '';
    t.places.forEach((p) => {
      const li = make('li', 'tp-place' + (p.done ? ' done' : ''));
      const chk = make('button', 'tp-check'); chk.type = 'button'; chk.setAttribute('aria-pressed', String(p.done)); chk.setAttribute('aria-label', (p.done ? 'Desmarcar: ' : 'Marcar como visto: ') + p.name);
      chk.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'; chk.onclick = () => act(() => api('/places/' + p.id, 'PATCH', { done: !p.done }));
      const mid = make('span', 'tp-itext'); mid.appendChild(make('b', '', p.name));
      if (p.address) mid.appendChild(make('em', '', p.address));
      if (p.note) mid.appendChild(make('em', '', p.note));
      const map = make('button', 'tp-x map'); map.type = 'button'; map.title = 'Ver no mapa'; map.setAttribute('aria-label', 'Ver no mapa: ' + p.name);
      map.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6.500-5.600-6.500-11a6.500 6.500 0 0 1 13 0c0 5.400-6.500 11-6.500 11zM12 12.500h.01"/></svg>'; map.onclick = () => showMap(p.address || p.name + (t.destination ? ', ' + t.destination : ''), p.name, true);
      const x = make('button', 'tp-x'); x.type = 'button'; x.setAttribute('aria-label', 'Remover'); x.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>'; x.onclick = () => act(() => api('/places/' + p.id, 'DELETE'));
      li.append(chk, mid, map, x); ul.appendChild(li);
    });
  }

  function renderPhotos(t) {
    const meta = {}; (t.photo_meta || []).forEach((m) => { meta[m.id] = m; });
    const days = tripDays(t), dayNo = (k) => days.indexOf(k) + 1;
    const label = (m) => [m.day && dayNo(m.day) > 0 ? 'Dia ' + dayNo(m.day) : '', m.topic || ''].filter(Boolean).join(' · ');
    $('trdDriveLink').hidden = !t.drive_url; if (t.drive_url) $('trdDriveLink').href = t.drive_url;
    // filter pills: All, each day that has photos, each topic
    const usedDays = days.filter((k) => t.photos.some((id) => (meta[id] || {}).day === k));
    const topics = [...new Set(t.photos.map((id) => (meta[id] || {}).topic).filter(Boolean))].sort();
    const keys = ['all', ...usedDays.map((k) => 'd:' + k), ...topics.map((x) => 't:' + x)];
    if (!keys.includes(S.pf)) S.pf = 'all';
    const bar = $('trdPhotoFilter'); bar.replaceChildren(); bar.hidden = keys.length < 2;
    keys.forEach((k) => {
      const text = k === 'all' ? 'Todas' : k.startsWith('d:') ? 'Dia ' + dayNo(k.slice(2)) : k.slice(2);
      const b = make('button', 'tp-pill', text); b.type = 'button'; b.setAttribute('aria-pressed', String(S.pf === k));
      b.onclick = () => { S.pf = k; renderPhotos(t); }; bar.appendChild(b);
    });
    const shown = t.photos.filter((id) => { const m = meta[id] || {}; return S.pf === 'all' || (S.pf.startsWith('d:') ? m.day === S.pf.slice(2) : m.topic === S.pf.slice(2)); });
    const g = $('trdPhotos'); g.replaceChildren(); $('trdNoPhotos').hidden = t.photos.length > 0;
    shown.forEach((id) => {
      const m = meta[id] || {};
      const fig = make('figure', 'tr-photo');
      const img = make('img'); img.src = photoSrc(id); img.alt = m.caption || ''; img.loading = 'lazy';
      img.onclick = () => {
        $('trLbImg').src = photoSrc(id);
        const info = [label(m), m.caption].filter(Boolean).join(' — '); $('trLbInfo').textContent = info; $('trLbInfo').hidden = !info;
        $('trLbDrive').hidden = !m.drive_url; if (m.drive_url) $('trLbDrive').href = m.drive_url;
        $('trLb').showModal();
      };
      const star = make('button', 'tr-star' + (t.cover === id ? ' on' : ''), '★'); star.type = 'button'; star.title = 'Usar como capa'; star.onclick = () => act(() => api('/' + t.id, 'PATCH', { cover: id }));
      const del = make('button', 'tr-pdel', ''); del.type = 'button'; del.setAttribute('aria-label', 'Apagar foto');
      del.onclick = async () => { if (await IgnisConfirm.ask({ title: 'Apagar foto', text: 'Apagar esta foto? Isso não pode ser desfeito.' })) act(() => api('/photos/' + id, 'DELETE')); };
      fig.append(img, star, del);
      const tag = label(m); if (tag) fig.appendChild(make('figcaption', 'tr-ptag', tag));
      g.appendChild(fig);
    });
  }

  // Resize to at most 1600px and keep lowering the quality until it is under 900 KB (the proxy accepts 1 MB bodies).
  function shrink(file) {
    return new Promise((res, rej) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = async () => {
        URL.revokeObjectURL(url);
        const k = Math.min(1, 1600 / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        for (const q of [0.85, 0.7, 0.55, 0.4]) {
          const b = await new Promise((r) => c.toBlob(r, 'image/jpeg', q));
          if (b && b.size < 900000) return res(b);
        }
        rej(new Error('grande demais'));
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('não é uma imagem')); };
      img.src = url;
    });
  }

  // ---- forms ----
  const dlg = $('trDialog'); let editing = null;
  // dates: one button that opens a month grid; the first click sets the first day, the second the last day
  const R = { start: '', end: '', phase: 'start', month: new Date() };
  let calAnim = null;
  function setRange(s, e) {
    R.start = s || ''; R.end = e || s || '';
    $('trStart').value = R.start; $('trEnd').value = R.end;
    const f = (k) => fmtDate(k, { day: 'numeric', month: 'short', year: 'numeric' });
    $('trWhenText').textContent = !R.start ? 'Escolha as datas' : R.end && R.end !== R.start ? f(R.start) + '  →  ' + f(R.end) : f(R.start);
    $('trCalHint').textContent = R.phase === 'end' ? 'Agora escolha o último dia.' : 'Escolha o primeiro dia.';
  }
  function renderRangeCal() {
    const y = R.month.getFullYear(), mo = R.month.getMonth();
    $('trCalTitle').textContent = R.month.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    const lead = (new Date(y, mo, 1).getDay() + 6) % 7, total = new Date(y, mo + 1, 0).getDate(), now = dayKey(new Date());
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push(make('span', 'tr-pad'));
    for (let d = 1; d <= total; d++) {
      const key = y + '-' + pad(mo + 1) + '-' + pad(d);
      const edge = key === R.start || key === R.end, inside = R.start && R.end && key > R.start && key < R.end;
      const b = make('button', 'tr-dayb' + (edge ? ' sel' : '') + (inside ? ' in' : '') + (key === now ? ' today' : ''), String(d));
      b.type = 'button'; b.setAttribute('aria-pressed', String(edge));
      b.onclick = () => {
        if (R.phase === 'start' || key < R.start) { R.phase = 'end'; setRange(key, key); }
        else { R.phase = 'start'; setRange(R.start, key); showRangeCal(false); }
        renderRangeCal();
      };
      cells.push(b);
    }
    $('trCalGrid').replaceChildren(...cells);
  }
  function showRangeCal(open) {
    const box = $('trCal');
    $('trWhenBtn').setAttribute('aria-expanded', String(open)); $('trCalHint').hidden = !open;
    if (calAnim) { calAnim.cancel(); calAnim = null; }
    const still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (open) {
      R.phase = 'start'; setRange(R.start, R.end);
      const base = R.start ? parseDay(R.start) : new Date(); R.month = new Date(base.getFullYear(), base.getMonth(), 1);
      renderRangeCal(); box.hidden = false;
      if (still || !box.animate) return;
      const h = box.scrollHeight; box.style.overflow = 'hidden';
      calAnim = box.animate([{ height: '0px', opacity: 0, transform: 'translateY(-6px)' }, { height: h + 'px', opacity: 1, transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.2, .8, .2, 1)' });
      calAnim.onfinish = () => { box.style.overflow = ''; calAnim = null; };
    } else {
      if (box.hidden) return;
      if (still || !box.animate) { box.hidden = true; return; }
      const h = box.getBoundingClientRect().height; box.style.overflow = 'hidden';
      calAnim = box.animate([{ height: h + 'px', opacity: 1, transform: 'none' }, { height: '0px', opacity: 0, transform: 'translateY(-6px)' }], { duration: 240, easing: 'cubic-bezier(.4, 0, .2, 1)', fill: 'forwards' });
      calAnim.closing = true;
      calAnim.onfinish = () => { box.hidden = true; box.style.overflow = ''; calAnim.cancel(); calAnim = null; };
    }
  }
  $('trWhenBtn').onclick = () => showRangeCal($('trCal').hidden || !!(calAnim && calAnim.closing));
  $('trCalPrev').onclick = () => { R.month = new Date(R.month.getFullYear(), R.month.getMonth() - 1, 1); renderRangeCal(); };
  $('trCalNext').onclick = () => { R.month = new Date(R.month.getFullYear(), R.month.getMonth() + 1, 1); renderRangeCal(); };
  // notes: short bullet points, added one at a time
  let notes = [];
  function showNotes() {
    const ul = $('trNList'); ul.replaceChildren();
    notes.forEach((t, i) => {
      const li = make('li', 'tp-nitem');
      const tx = make('span', 'tp-ntext', t); tx.tabIndex = 0; tx.title = 'Clique para editar';
      const edit = () => {
        const inp = make('input', 'bd-input tp-ninline'); inp.value = t; inp.maxLength = 300; inp.setAttribute('aria-label', 'Editar nota');
        tx.replaceWith(inp); inp.focus(); inp.select();
        let fin = false;
        const done = (keep) => { if (fin) return; fin = true; const v = inp.value.trim(); if (keep && v) notes[i] = v; else if (keep && !v) notes.splice(i, 1); showNotes(); };
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); done(true); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); } });
        inp.addEventListener('blur', () => done(true));
      };
      tx.onclick = edit; tx.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); edit(); } };
      const rm = make('button', 'tp-nrm'); rm.type = 'button'; rm.setAttribute('aria-label', 'Remover nota'); rm.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
      rm.onclick = () => { notes.splice(i, 1); showNotes(); };
      li.append(make('span', 'tp-nbul', '•'), tx, rm); ul.appendChild(li);
    });
  }
  function addNote() { const v = $('trNoteAdd').value.trim(); if (!v) return; notes.push(v); $('trNoteAdd').value = ''; showNotes(); $('trNoteAdd').focus(); }
  const collectNotes = () => { const pending = $('trNoteAdd').value.trim(); return [...notes, ...(pending ? [pending] : [])].join('\n').slice(0, 2000); };
  $('trNoteBtn').onclick = addNote;
  $('trNoteAdd').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addNote(); } });
  // the cover: an image chosen here is saved as one of the trip's photos and marked as its cover
  const cv = { file: null, url: '', removed: false };
  function showCover(src) {
    $('trCvImg').hidden = !src; $('trCvNone').hidden = !!src;
    if (src) $('trCvImg').src = src; else $('trCvImg').removeAttribute('src');
    $('trCvClear').hidden = !src;
  }
  $('trCvFile').addEventListener('change', () => {
    const f = $('trCvFile').files[0]; if (!f) return;
    if (cv.url) URL.revokeObjectURL(cv.url);
    cv.file = f; cv.url = URL.createObjectURL(f); cv.removed = false; showCover(cv.url); $('trErr').hidden = true;
  });
  $('trCvClear').onclick = () => {
    if (cv.url) { URL.revokeObjectURL(cv.url); cv.url = ''; }
    const had = editing && editing.cover;
    if (cv.file && had) { cv.file = null; showCover(photoSrc(editing.cover)); }   // back to the current cover
    else { cv.file = null; cv.removed = !!had; showCover(''); }
    $('trCvFile').value = '';
  };
  // "just planning": no dates yet, so the date picker is hidden
  function setPlanning(on) {
    $('trPlanning').checked = on;
    $('trWhenBtn').hidden = on; if (on) { $('trCal').hidden = true; $('trCalHint').hidden = true; $('trWhenBtn').setAttribute('aria-expanded', 'false'); }
  }
  $('trPlanning').addEventListener('change', () => setPlanning($('trPlanning').checked));
  function openTripDialog(t) {
    editing = t || null;
    if (cv.url) URL.revokeObjectURL(cv.url);
    cv.file = null; cv.url = ''; cv.removed = false; $('trCvFile').value = '';
    showCover(t && t.cover ? photoSrc(t.cover) : '');
    $('trDlgTitle').textContent = t ? 'Editar viagem' : 'Nova viagem';
    $('trName').value = t ? t.name : ''; $('trDest').value = t ? t.destination || '' : '';
    R.phase = 'start'; setRange(t ? t.start_date : '', t ? t.end_date : ''); $('trCalHint').hidden = true; setPlanning(!!t && !hasDates(t));
    if (calAnim) { calAnim.cancel(); calAnim = null; } $('trCal').style.overflow = ''; $('trCal').hidden = true; $('trWhenBtn').setAttribute('aria-expanded', 'false');
    notes = t && t.note ? t.note.split(/\r?\n/).map((x) => x.trim()).filter(Boolean) : []; $('trNoteAdd').value = ''; showNotes();
    $('trDelete').hidden = !t; $('trErr').hidden = true; dlg.showModal(); $('trName').focus();
  }
  $('trAdd').onclick = () => openTripDialog(null);
  $('trClose').onclick = () => dlg.close();
  $('trForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const planning = $('trPlanning').checked, name = $('trName').value.trim(), start = planning ? '' : $('trStart').value, end = planning ? '' : ($('trEnd').value || start);
    const err = !name ? 'Dê um nome à viagem.' : !planning && !start ? 'Escolha as datas, ou marque "ainda só planejando".' : end < start ? 'O último dia é antes do primeiro.' : '';
    if (err) { $('trErr').textContent = err; $('trErr').hidden = false; return; }
    const body = { name, destination: $('trDest').value.trim(), start_date: start, end_date: end, note: collectNotes() };
    try {
      const saved = editing ? await api('/' + editing.id, 'PATCH', body) : await api('', 'POST', body);
      if (cv.file) {
        try { const up = await api('/' + saved.id + '/photos', 'POST', null, await shrink(cv.file)); await api('/' + saved.id, 'PATCH', { cover: up.id }); }
        catch (x2) { toast('A viagem foi salva, mas a capa não pôde ser enviada: ' + x2.message); }
      } else if (cv.removed && editing) await api('/' + saved.id, 'PATCH', { cover: '' });
      dlg.close(); await refresh(); if (!editing) location.hash = saved.id;
    } catch (x) { $('trErr').textContent = x.message; $('trErr').hidden = false; }
  });
  $('trDelete').onclick = async () => {
    if (!editing || !(await IgnisConfirm.ask({ title: 'Apagar viagem', text: 'Apagar "' + editing.name + '" e suas fotos? Isso não pode ser desfeito.' }))) return;
    try { await api('/' + editing.id, 'DELETE'); dlg.close(); location.hash = ''; await refresh(); } catch (x) { toast(x.message); }
  };
  $('trdEdit').onclick = () => openTripDialog(byId(S.openId));
  $('trLbClose').onclick = () => $('trLb').close();
  // A click anywhere that is not the photo, caption or buttons (the backdrop or the dialog's empty area) closes it.
  $('trLb').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });

  // "Add to this day" and "Add place" open small modals, like "Plan a trip".
  const dayDlg = $('trdDayDialog'), placeDlg = $('trdPlaceDialog');
  $('trdDayAdd').onclick = () => {
    const t = byId(S.openId), k = tripDays(t)[S.day];
    $('trdDayDlgSub').textContent = 'Dia ' + (S.day + 1) + ' · ' + fmtDate(k, { weekday: 'long', day: 'numeric', month: 'long' });
    ['trdDayTime', 'trdDayText', 'trdDayAddr'].forEach((id) => { $(id).value = ''; }); $('trdDayErr').hidden = true;
    dayDlg.showModal(); $('trdDayText').focus();
  };
  $('trdPlaceAdd').onclick = () => { ['trdPlaceName', 'trdPlaceAddr'].forEach((id) => { $(id).value = ''; }); $('trdPlaceErr').hidden = true; placeDlg.showModal(); $('trdPlaceName').focus(); };
  $('trdDayClose').onclick = () => dayDlg.close(); $('trdPlaceClose').onclick = () => placeDlg.close();
  $('trdDayForm').addEventListener('submit', async (e) => {
    e.preventDefault(); const t = byId(S.openId), text = $('trdDayText').value.trim();
    if (!text) { $('trdDayErr').textContent = 'Diga o que você vai fazer.'; $('trdDayErr').hidden = false; return; }
    const body = { day: tripDays(t)[S.day], time: $('trdDayTime').value || null, text, address: $('trdDayAddr').value.trim() };
    try { await api('/' + t.id + '/items', 'POST', body); dayDlg.close(); await refresh(); } catch (x) { $('trdDayErr').textContent = x.message; $('trdDayErr').hidden = false; }
  });
  $('trdPlaceForm').addEventListener('submit', async (e) => {
    e.preventDefault(); const t = byId(S.openId), name = $('trdPlaceName').value.trim();
    if (!name) { $('trdPlaceErr').textContent = 'Dê um nome ao lugar.'; $('trdPlaceErr').hidden = false; return; }
    try { await api('/' + t.id + '/places', 'POST', { name, address: $('trdPlaceAddr').value.trim() }); placeDlg.close(); await refresh(); } catch (x) { $('trdPlaceErr').textContent = x.message; $('trdPlaceErr').hidden = false; }
  });
  $('trdUpload').addEventListener('change', async (e) => {
    const t = byId(S.openId); const files = [...e.target.files]; e.target.value = ''; if (!t || !files.length) return;
    let ok = 0;
    for (const f of files) {
      try { await api('/' + t.id + '/photos', 'POST', null, await shrink(f)); ok++; } catch (err) { toast('Não foi possível adicionar ' + f.name + ': ' + err.message); }
    }
    if (ok) toast(ok + (ok === 1 ? ' foto salva.' : ' fotos salvas.'));
    try { await refresh(); } catch (err) { toast(err.message); }
  });

  // Live countdown (days, hours, minutes, seconds) and a progress bar from the day the trip was planned to its first day.
  function tick() {
    const L = S.live; if (!L) return;
    const t = L.trip, pre = L.kind === 'list' ? 'tr' : 'trd';
    const live = $(pre === 'tr' ? 'trLive' : 'trdLive'), prog = $(pre === 'tr' ? 'trProg' : 'trdProg');
    const now = Date.now(), start = parseDay(t.start_date).getTime(), end = parseDay(t.end_date).getTime() + 864e5;
    let p;
    if (now < start) {
      const ms = start - now, d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, m = Math.floor(ms / 6e4) % 60, s = Math.floor(ms / 1e3) % 60;
      live.textContent = d + 'd ' + pad(h) + 'h ' + pad(m) + 'm ' + pad(s) + 's';
      const created = Date.parse(t.created_at); p = Math.min(1, Math.max(0.02, (now - created) / Math.max(1, start - created)));
    } else if (now < end) { live.textContent = 'Em viagem agora'; p = (now - start) / (end - start); }
    else { live.textContent = ''; p = 1; }
    prog.hidden = false; prog.title = Math.round(p * 100) + '% da espera';
    prog.firstChild.style.setProperty('--p', (p * 100).toFixed(1) + '%');
  }
  setInterval(tick, 1000);

  function route() {
    const id = decodeURIComponent(location.hash.slice(1)); const t = id && byId(id);
    if (t) { if (S.openId !== t.id) S.day = 0; S.openId = t.id; document.title = t.name + ' · Ignis'; renderDetail(t); }
    else { S.openId = null; document.title = 'Trips · Ignis'; renderList(); }
  }
  window.addEventListener('hashchange', () => { route(); tick(); });
  refresh().catch((e) => { $('tpSub').textContent = ''; $('trEmpty').textContent = 'Não foi possível carregar as viagens: ' + e.message; $('trEmpty').hidden = false; });
})();
