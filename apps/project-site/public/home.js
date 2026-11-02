// Fills the blue tile with the Venvanse and Ritalina level curves (as a share of one reference dose's peak). Keeps the dashes if the call fails.
(async () => {
  const svg = document.querySelector('#medCurve');
  if (!svg) return;
  try {
    const now = Date.now();
    const q = '?from=' + encodeURIComponent(new Date(now - 18 * 3600e3).toISOString()) + '&to=' + encodeURIComponent(new Date(now + 14 * 3600e3).toISOString()) + '&step=30';
    const [v, r] = await Promise.all(['vyvanse', 'ritalina'].map((m) => fetch('api/v1/meds/' + m + '/curve' + q).then((res) => (res.ok ? res.json() : null))));
    if (!v && !r) return;
    const W = 260, H = 96, PAD = 6;
    const t0 = now - 18 * 3600e3, t1 = now + 14 * 3600e3;
    const series = [[v, 'k-v', '#f4e11b'], [r, 'k-r', '#ff4fc3']].filter((s) => s[0] && s[0].points.length);
    const top = Math.max(1.15, ...series.flatMap(([d]) => d.points.map((p) => p[2]))) * 1.05;
    const x = (t) => ((t - t0) / (t1 - t0)) * W;
    const y = (rel) => H - PAD - (rel / top) * (H - 2 * PAD);
    const ns = 'http://www.w3.org/2000/svg';
    const add = (name, attrs) => { const n = document.createElementNS(ns, name); Object.entries(attrs).forEach(([k, val]) => n.setAttribute(k, val)); svg.appendChild(n); return n; };
    add('line', { x1: 0, x2: W, y1: y(1), y2: y(1), stroke: '#f4e11b', 'stroke-opacity': '.35', 'stroke-width': '1', 'stroke-dasharray': '3 4', 'vector-effect': 'non-scaling-stroke' });
    add('line', { x1: x(now), x2: x(now), y1: 0, y2: H, stroke: '#ffffff', 'stroke-opacity': '.7', 'stroke-width': '1.4', 'stroke-dasharray': '3 3', 'vector-effect': 'non-scaling-stroke' });
    series.forEach(([d, , color]) => {
      const line = d.points.map((p, i) => (i ? 'L' : 'M') + x(new Date(p[0]).getTime()).toFixed(1) + ' ' + y(p[2]).toFixed(1)).join('');
      add('path', { d: line, fill: 'none', stroke: color, 'stroke-width': '2.4', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke' });
    });
    const nowRel = (d) => { let best = d.points[0]; d.points.forEach((p) => { if (Math.abs(new Date(p[0]) - now) < Math.abs(new Date(best[0]) - now)) best = p; }); return best[2]; };
    if (v) document.querySelector('#medV').textContent = Math.round(nowRel(v) * 100) + '%';
    if (r) document.querySelector('#medR').textContent = Math.round(nowRel(r) * 100) + '%';
  } catch (e) {
    /* keep the placeholders */
  }
})();

// Fills the dark tile with the Mounjaro curve (combined mg expected in the body), the dose marks and when the next dose is due.
(async () => {
  const svg = document.querySelector('#mjCurve');
  if (!svg) return;
  try {
    const now = Date.now();
    const DAY = 864e5;
    const t0 = now - 21 * DAY, t1 = now + 7 * DAY;
    const q = '?from=' + encodeURIComponent(new Date(t0).toISOString()) + '&to=' + encodeURIComponent(new Date(t1).toISOString()) + '&step=60';
    const [curve, doses, overview] = await Promise.all([
      fetch('api/v1/meds/mounjaro/curve' + q).then((r) => (r.ok ? r.json() : null)),
      fetch('api/v1/meds/mounjaro/doses?limit=12').then((r) => (r.ok ? r.json() : [])),
      fetch('api/v1/meds/mounjaro/overview?tz=0').then((r) => (r.ok ? r.json() : null)),
    ]);
    if (!curve || !curve.points.length) return;
    // draw at the real pixel size so circles stay round
    const box = svg.getBoundingClientRect();
    const W = Math.round(box.width) || 260, H = Math.round(box.height) || 80, PAD = 10;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    const top = Math.max(0.5, ...curve.points.map((p) => p[1])) * 1.1;
    const x = (t) => ((t - t0) / (t1 - t0)) * W;
    const y = (mg) => H - PAD - (mg / top) * (H - PAD - 8);
    const ns = 'http://www.w3.org/2000/svg';
    const add = (name, attrs, parent) => { const n = document.createElementNS(ns, name); Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v)); (parent || svg).appendChild(n); return n; };
    const defs = add('defs', {});
    const grad = add('linearGradient', { id: 'mjg', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    add('stop', { offset: '0', 'stop-color': '#f4e11b', 'stop-opacity': '.38' }, grad);
    add('stop', { offset: '1', 'stop-color': '#f4e11b', 'stop-opacity': '0' }, grad);
    const pts = curve.points.map((p) => [x(new Date(p[0]).getTime()), y(p[1]), new Date(p[0]).getTime(), p[1]]);
    const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('');
    add('line', { x1: 0, x2: W, y1: H - PAD, y2: H - PAD, stroke: '#f4e11b', 'stroke-opacity': '.3', 'stroke-width': '1' });
    add('path', { d: line + 'L' + W + ' ' + (H - PAD) + 'L0 ' + (H - PAD) + 'Z', fill: 'url(#mjg)' });
    add('line', { x1: x(now), x2: x(now), y1: 4, y2: H - PAD, stroke: '#ffffff', 'stroke-opacity': '.55', 'stroke-width': '1.2', 'stroke-dasharray': '3 3' });
    add('path', { d: line, fill: 'none', stroke: '#f4e11b', 'stroke-width': '2.2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    // each injection sits on the line right after its jump
    const levelAt = (t) => { let b = pts[0]; pts.forEach((p) => { if (Math.abs(p[2] - t) < Math.abs(b[2] - t)) b = p; }); return b; };
    doses.forEach((d) => { const t = new Date(d.taken_at).getTime(); if (t >= t0 && t <= t1) { const p = levelAt(t + 3600e3); add('circle', { cx: p[0], cy: p[1], r: 3.6, fill: '#0035ad', stroke: '#f4e11b', 'stroke-width': '2' }); } });
    const here = levelAt(now);
    add('circle', { cx: here[0], cy: here[1], r: 5, fill: '#ff4fc3', stroke: '#ffffff', 'stroke-width': '2' });
    let best = curve.points[0];
    curve.points.forEach((p) => { if (Math.abs(new Date(p[0]) - now) < Math.abs(new Date(best[0]) - now)) best = p; });
    document.querySelector('#mjMg').textContent = best[1].toFixed(2);
    const last = overview && overview.last_dose;
    const every = overview && overview.med.interval_days;
    if (last && every) {
      const left = Math.ceil((new Date(last.taken_at).getTime() + every * DAY - now) / DAY);
      document.querySelector('#mjNext').textContent = left > 1 ? '· next dose in ' + left + ' days' : left === 1 ? '· next dose tomorrow' : left === 0 ? '· next dose today' : '· ' + Math.abs(left) + (Math.abs(left) === 1 ? ' day' : ' days') + ' past the usual day';
    }
  } catch (e) {
    /* keep the placeholders */
  }
})();

// Fills the pink hero panel with the newest diary entry. Keeps the placeholder if the call fails or the diary is empty.
(async () => {
  const text = document.querySelector('#latestText');
  const when = document.querySelector('#latestTime');
  try {
    const res = await fetch('api/v1/entries?limit=1');
    if (!res.ok) return;
    const [entry] = await res.json();
    if (!entry) return;
    const at = new Date(entry.created_at);
    text.textContent = entry.text;
    when.dateTime = at.toISOString();
    const mins = Math.max(0, Math.round((Date.now() - at) / 60000));
    const ago = mins < 1 ? 'just now' : mins < 60 ? mins + ' min ago' : mins < 1440 ? Math.floor(mins / 60) + ' h ago' : null;
    when.textContent = ago || at.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ', ' + at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    /* leave the placeholder */
  }
})();

// Fills the lime hero panel with the body battery estimate. Keeps "–" if it is not available.
(async () => {
  try {
    const res = await fetch('api/v1/health/battery?days=3');
    if (!res.ok) return;
    const b = await res.json();
    const est = b.latest && b.latest.now != null ? b.latest : null;
    const value = est && est.now;
    if (value == null) return;
    document.querySelector('#batteryLabel').textContent = 'Body battery · estimate';
    // One petal per 20 points; the lit ones bloom in turn.
    document.querySelectorAll('#batteryFlower .petal').forEach((petal, n) => petal.classList.toggle('on', value > n * 20 + 10));
    countUp(document.querySelector('#batteryValue'), value);
  } catch (e) {
    /* leave the placeholder */
  }
})();

// Counts a number up from 0 (straight to the end value when the visitor prefers less motion).
function countUp(el, to) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.textContent = to;
    return;
  }
  const started = performance.now();
  const frame = (now) => {
    const t = Math.min(1, (now - started) / 1300);
    el.textContent = Math.round(to * (1 - Math.pow(1 - t, 3)));
    if (t < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}


// ---- habits band: today's count, the list, running timers and the streak ----------------------------------------------------
(function habitsBand() {
  const $ = (id) => document.getElementById(id);
  if (!$('hbDone')) return;
  const pad = (n) => String(n).padStart(2, '0');
  const dayKey = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const make = (tag, cls, text) => { const el = document.createElement(tag); if (cls) el.className = cls; if (text != null) el.textContent = text; return el; };
  const TIMER_KEY = 'ignis.habits.timers'; // shared with the Habits page, so a timer started there keeps running here
  const timers = () => { try { return JSON.parse(localStorage.getItem(TIMER_KEY) || '{}') || {}; } catch (e) { return {}; } };
  const saveTimers = (t) => { try { localStorage.setItem(TIMER_KEY, JSON.stringify(t)); } catch (e) { /* not saved */ } };
  const clock = (sec) => { const s = Math.max(0, Math.floor(sec)); const h = Math.floor(s / 3600); return h ? h + ':' + pad(Math.floor((s % 3600) / 60)) + ':' + pad(s % 60) : Math.floor(s / 60) + ':' + pad(s % 60); };
  const mins = (m) => (m >= 60 ? Math.floor(m / 60) + 'h' + (m % 60 ? ' ' + (m % 60) + 'm' : '') : m + ' min');
  let habits = [];

  const FLAME = 'M17 4C18 10 12 12 13 17C15 16 16 14 17 12C17 16 23 18 23 23C23 27 20 29 16 29C12 29 8 26 8 21C8 14 15 11 17 4Z';
  const FRAMES = 'M17 4C18 10 12 12 13 17C15 16 16 14 17 12C17 16 23 18 23 23C23 27 20 29 16 29C12 29 8 26 8 21C8 14 15 11 17 4Z;M15 3C17 9 11 12 12 17C14 16 15 14 16 11C17 16 23 18 23 23C23 27 20 29 16 29C12 29 8 26 8 21C8 14 13 10 15 3Z;M17 4C18 10 12 12 13 17C15 16 16 14 17 12C17 16 23 18 23 23C23 27 20 29 16 29C12 29 8 26 8 21C8 14 15 11 17 4Z;M19 4C19 10 13 12 14 17C16 16 17 14 18 11C18 16 24 18 23 23C23 27 20 29 16 29C12 29 8 26 8 21C8 14 16 11 19 4Z;M17 2C17 9 12 12 13 17C15 15 16 13 17 10C17 15 23 18 23 23C23 27 20 29 16 29C12 29 8 26 8 21C8 14 15 9 17 2Z;M17 4C18 10 12 12 13 17C15 16 16 14 17 12C17 16 23 18 23 23C23 27 20 29 16 29C12 29 8 26 8 21C8 14 15 11 17 4Z';

  async function load() {
    const res = await fetch('api/v1/habits/overview?today=' + dayKey(new Date()) + '&window=14');
    if (!res.ok) throw new Error('habits');
    habits = (await res.json()).habits;
    render();
  }

  function render() {
    const total = habits.length;
    const done = habits.filter((h) => h.done_today).length;
    $('hbDone').textContent = String(done);
    $('hbTotal').textContent = total ? '/' + total : '';
    $('hbSaid').textContent = !total ? 'No habits yet' : done === total ? 'All done. Nice!' : done === 0 ? 'Nothing ticked yet' : (total - done) + ' to go';
    requestAnimationFrame(() => requestAnimationFrame(() => { $('hbFill').style.width = (total ? (done / total) * 100 : 0) + '%'; }));

    const list = $('hbList');
    list.replaceChildren();
    const plain = habits.filter((h) => h.kind !== 'time');
    plain.slice(0, 6).forEach((h) => {
      const li = make('li', h.done_today ? 'done' : '');
      li.appendChild(make('i'));
      li.appendChild(make('span', '', h.name));
      if (h.kind === 'steps') li.appendChild(make('small', '', h.count_today.toLocaleString() + ' steps'));
      else if (h.target_count > 1) li.appendChild(make('small', '', h.count_today + '/' + h.target_count));
      list.appendChild(li);
    });
    if (plain.length > 6) list.appendChild(make('li', 'more', '+ ' + (plain.length - 6) + ' more'));
    if (!plain.length) list.appendChild(make('li', 'more', total ? 'Only timers so far' : 'Add habits on the Habits page'));

    const tl = $('hbTimers');
    tl.replaceChildren();
    const running = timers();
    habits.filter((h) => h.kind === 'time').slice(0, 3).forEach((h) => {
      const since = running[h.id];
      const card = make('div', 'hb-t' + (since ? ' on' : ''));
      card.dataset.id = h.id;
      card.appendChild(make('span', 'hb-tn', h.name));
      const c = make('span', 'hb-clock', clock(h.count_today * 60 + (since ? (Date.now() - since) / 1000 : 0)));
      c.dataset.base = String(h.count_today * 60);
      if (since) c.dataset.since = String(since);
      card.appendChild(c);
      card.appendChild(make('span', 'hb-goal', 'of ' + mins(h.target_count) + ' today'));
      const b = make('button', 'hb-play');
      b.type = 'button';
      b.setAttribute('aria-label', (since ? 'Stop timer for ' : 'Start timer for ') + h.name);
      b.innerHTML = since ? '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>' : '<svg viewBox="0 0 24 24"><path d="M8 5l11 7-11 7Z"/></svg>';
      b.addEventListener('click', () => toggle(h));
      card.appendChild(b);
      const bar = make('div', 'hb-tp');
      const fill = make('i');
      fill.style.width = Math.min(100, ((h.count_today * 60 + (since ? (Date.now() - since) / 1000 : 0)) / (h.target_count * 60)) * 100) + '%';
      bar.appendChild(fill);
      card.appendChild(bar);
      tl.appendChild(card);
    });
    if (!tl.children.length) tl.appendChild(make('p', 'hb-empty', 'Add a time habit, like reading for an hour, and start its timer here.'));

    const now = Math.max(0, ...habits.map((h) => h.streak));
    const best = Math.max(0, ...habits.map((h) => h.best_streak));
    const lit = now > 0;
    $('hbFire').innerHTML = '<svg viewBox="2 -2 28 36" aria-hidden="true"><path fill="' + (lit ? '#1a0088' : 'rgba(45,10,87,.3)') + '" d="' + FLAME + '">' + (lit ? '<animate attributeName="d" dur="2.4s" repeatCount="indefinite" calcMode="spline" keyTimes="0;.2;.4;.6;.8;1" keySplines=".45 0 .55 1;.45 0 .55 1;.45 0 .55 1;.45 0 .55 1;.45 0 .55 1" values="' + FRAMES + '"/>' : '') + '</path><path fill="' + (lit ? '#ffca26' : 'rgba(45,10,87,.3)') + '" d="M16 19C16 22 13 23 13 25C13 27 14 28 16 28C18 28 19 27 19 25C19 23 17 22 16 19Z">' + (lit ? '<animate attributeName="fill" dur="1.2s" repeatCount="indefinite" values="#ffca26;#ff5e32;#ffca26"/>' : '') + '</path>' +
      (lit ? '<circle class="hb-ember" cx="10" cy="14" r="1" style="--dx:-4px;--t:2.1s;--d:0s"/><circle class="hb-ember" cx="22" cy="12" r="1.1" style="--dx:5px;--t:2.5s;--d:.7s"/><circle class="hb-ember" cx="16" cy="6" r=".9" style="--dx:2px;--t:1.9s;--d:1.2s"/>' : '') + '</svg>' +
      '<b class="hb-n">' + now + '</b><span class="hb-l">' + (now === 1 ? 'day streak' : 'day streak') + '</span><span class="hb-best">Best ' + best + (best === 1 ? ' day' : ' days') + '</span>';
  }

  async function toggle(h) {
    const all = timers();
    if (!all[h.id]) { all[h.id] = Date.now(); saveTimers(all); render(); return; }
    const since = all[h.id];
    const add = Math.max(1, Math.round((Date.now() - since) / 60000));
    const day = dayKey(new Date(since));
    delete all[h.id];
    saveTimers(all);
    const base = (h.days && h.days[day]) || 0;
    try {
      await fetch('api/v1/habits/' + h.id + '/days/' + day, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ count: base + add }) });
    } catch (e) { /* the reload below shows what was saved */ }
    load().catch(() => {});
  }

  // running clocks tick once a second
  setInterval(() => {
    document.querySelectorAll('.hb-t .hb-clock[data-since]').forEach((el) => {
      const sec = Number(el.dataset.base) + (Date.now() - Number(el.dataset.since)) / 1000;
      el.textContent = clock(sec);
      const card = el.closest('.hb-t');
      const goal = habits.find((x) => x.id === card.dataset.id);
      if (goal) card.querySelector('.hb-tp i').style.width = Math.min(100, (sec / (goal.target_count * 60)) * 100) + '%';
    });
  }, 1000);

  load().catch(() => {
    $('hbSaid').textContent = 'Could not load habits';
  });
  setInterval(() => { load().catch(() => {}); }, 5 * 60 * 1000);
})();


// ---- today's meals: a giant calorie count, a ring badge and four tag pills with little animated icons ----------------------------------
(async function todaysMeals() {
  const list = document.getElementById('hmList');
  if (!list) return;
  const pad = (n) => String(n).padStart(2, '0');
  const t = new Date();
  const day = t.getFullYear() + '-' + pad(t.getMonth() + 1) + '-' + pad(t.getDate());
  const F = 'currentColor';
  const ICONS = {
    breakfast: '<svg class="hm-ico" viewBox="0 0 48 48" aria-hidden="true"><g class="hm-sun" stroke="' + F + '" stroke-width="3" stroke-linecap="round"><path d="M24 4v6M24 38v6M4 24h6M38 24h6M9.9 9.9l4.2 4.2M33.9 33.9l4.2 4.2M9.9 38.1l4.2-4.2M33.9 14.1l4.2-4.2"/></g><circle cx="24" cy="24" r="9" fill="' + F + '"/></svg>',
    am_snack: '<svg class="hm-ico" viewBox="0 0 48 48" aria-hidden="true"><g class="hm-steam"><path d="M16 15c-3-3 3-5 0-9"/><path d="M25 15c-3-3 3-5 0-9"/></g><path d="M8 20h26v10a11 11 0 0 1-11 11h-4A11 11 0 0 1 8 30Z" fill="' + F + '"/><path d="M34 23h3a5 5 0 0 1 0 10h-3" fill="none" stroke="' + F + '" stroke-width="3.2" stroke-linecap="round"/></svg>',
    lunch: '<svg class="hm-ico" viewBox="0 0 48 48" aria-hidden="true"><g class="hm-steam"><path d="M17 20c-3-3 3-5 0-9"/><path d="M26 20c-3-3 3-5 0-9"/><path d="M35 20c-3-3 3-5 0-9"/></g><path d="M5 25h38c0 10-8 17-19 17S5 35 5 25Z" fill="' + F + '"/></svg>',
    pm_snack: '<svg class="hm-ico" viewBox="0 0 48 48" aria-hidden="true"><path d="M24 15c-5-5-17-3-17 11 0 11 8 18 12 18 3 0 3-1 5-1s2 1 5 1c4 0 12-7 12-18 0-14-12-16-17-11Z" fill="' + F + '"/><path class="hm-leaf" d="M25 14c0-5 3-9 9-10 0 6-3 9-9 10Z" fill="' + F + '"/></svg>',
    dinner: '<svg class="hm-ico" viewBox="0 0 48 48" aria-hidden="true"><path d="M30 6a18 18 0 1 0 12 28A15 15 0 0 1 30 6Z" fill="' + F + '"/><path class="hm-star" d="M38 8c.6 3 1.6 4 4.6 4.6-3 .6-4 1.6-4.6 4.6-.6-3-1.6-4-4.6-4.6 3-.6 4-1.6 4.6-4.6Z" fill="' + F + '"/></svg>',
    supper: '<svg class="hm-ico" viewBox="0 0 48 48" aria-hidden="true"><circle class="hm-cookie" cx="24" cy="25" r="17" fill="' + F + '"/><g fill="#12287f" opacity=".0"></g><circle cx="18" cy="19" r="2.6" fill="#efe7d4"/><circle cx="30" cy="22" r="2.6" fill="#efe7d4"/><circle cx="21" cy="31" r="2.6" fill="#efe7d4"/><circle cx="32" cy="32" r="2" fill="#efe7d4"/><path class="hm-star" d="M40 6c.5 2.6 1.4 3.5 4 4-2.6.5-3.5 1.4-4 4-.5-2.6-1.4-3.5-4-4 2.6-.5 3.5-1.4 4-4Z" fill="' + F + '"/></svg>',
  };
  const SLOTS = [['breakfast', 'Café da manhã', 'b'], ['am_snack', 'Lanche da manhã', 'a'], ['lunch', 'Almoço', 'l'], ['pm_snack', 'Lanche da tarde', 'p'], ['dinner', 'Jantar', 'd'], ['supper', 'Ceia', 's']];
  try {
    const res = await fetch('api/v1/food/overview?day=' + day + '&window=7');
    if (!res.ok) throw new Error('food');
    const data = await res.json();
    list.replaceChildren();
    SLOTS.forEach(([slot, label, cls], i) => {
      const meals = data.meals.filter((m) => m.slot === slot);
      const li = document.createElement('li');
      li.className = 'hm-tag ' + cls + (meals.length ? '' : ' empty');
      li.style.setProperty('--i', i);
      li.innerHTML = ICONS[slot];
      const text = document.createElement('span');
      text.className = 'hm-t';
      const small = document.createElement('small');
      const kcal = meals.reduce((n, m) => n + m.calories, 0);
      small.textContent = label;
      if (kcal) small.title = Math.round(kcal).toLocaleString() + ' kcal';
      const name = document.createElement('span');
      name.className = 'hm-name';
      name.textContent = meals.length ? meals.map((m) => m.name).join(', ') : 'Nothing yet';
      text.append(small, name);
      li.appendChild(text);
      list.appendChild(li);
    });
    const total = data.meals.reduce((n, m) => n + m.calories, 0);
    const goal = data.goals && data.goals.calories;
    const el = document.getElementById('hmKcal');
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || !total) el.textContent = Math.round(total).toLocaleString();
    else {
      const t0 = performance.now();
      const frame = (now) => { const k = Math.min(1, (now - t0) / 900); el.textContent = Math.round(total * (1 - Math.pow(1 - k, 3))).toLocaleString(); if (k < 1) requestAnimationFrame(frame); };
      requestAnimationFrame(frame);
    }
    document.getElementById('hmGoal').textContent = goal ? 'of ' + Math.round(goal).toLocaleString() + ' kcal goal' : 'set a goal on the food page';
    // protein, carbs, fat and fiber eaten so far against their goals (the yellow panel)
    const mx = document.getElementById('mxList');
    if (mx) {
      const sum = (k) => data.meals.reduce((n, m) => n + (m[k] || 0), 0);
      const G = data.goals || {};
      const B = '#0035ad';
      const ICON = {
        protein: '<svg class="mx-ico" viewBox="0 0 84 84" aria-hidden="true"><g class="mx-egg"><path d="M20 44C18 32 28 24 40 25C52 24 64 30 62 42C66 54 54 62 44 60C32 64 20 58 20 44Z" fill="none" stroke="' + B + '" stroke-width="5" stroke-linejoin="round"/><circle class="mx-yolk" cx="42" cy="43" r="10" fill="' + B + '"/></g></svg>',
        carbs: '<svg class="mx-ico" viewBox="0 0 84 84" aria-hidden="true"><g class="mx-bread"><path fill="' + B + '" d="M24 66V42C14 40 14 24 26 21C34 15 52 15 60 21C72 24 70 40 60 42V66Z"/><path d="M32 50H52M32 58H52" stroke="#f4e11b" stroke-width="4" stroke-linecap="round" fill="none"/></g></svg>',
        fat: '<svg class="mx-ico" viewBox="0 0 84 84" aria-hidden="true"><g class="mx-drop"><path fill="' + B + '" d="M42 14C42 14 22 38 22 52a20 20 0 0 0 40 0C62 38 42 14 42 14Z"/><path d="M33 52a9 9 0 0 0 7 9" fill="none" stroke="#f4e11b" stroke-width="4" stroke-linecap="round"/></g></svg>',
        fiber: '<svg class="mx-ico" viewBox="0 0 84 84" aria-hidden="true"><g class="mx-wheat" fill="' + B + '"><path d="M41 70V30" stroke="' + B + '" stroke-width="4" stroke-linecap="round" fill="none"/><ellipse cx="42" cy="24" rx="4.6" ry="8.5"/><ellipse cx="33" cy="36" rx="4.6" ry="8.5" transform="rotate(-32 33 36)"/><ellipse cx="50" cy="36" rx="4.6" ry="8.5" transform="rotate(32 50 36)"/><ellipse cx="33" cy="49" rx="4.6" ry="8.5" transform="rotate(-32 33 49)"/><ellipse cx="50" cy="49" rx="4.6" ry="8.5" transform="rotate(32 50 49)"/></g></svg>',
      };
      mx.replaceChildren();
      [['protein', 'Protein', 'protein_g'], ['carbs', 'Carbs', 'carbs_g'], ['fat', 'Fat', 'fat_g'], ['fiber', 'Fiber', 'fiber_g']].forEach(([key, label, field], i) => {
        const eaten = sum(field);
        const goalG = G[field];
        const li = document.createElement('li');
        li.className = 'mx' + (goalG && eaten > goalG * 1.1 ? ' over' : '');
        li.style.setProperty('--i', i);
        li.innerHTML = '<span class="mx-top"><small>' + label + '</small>' + ICON[key] + '</span>' +
          '<p class="mx-num">' + Math.round(eaten) + '<span>g</span></p>' +
          '<span class="mx-goal">' + (goalG ? 'of ' + Math.round(goalG) + ' g goal' : 'no goal yet') + '</span>' +
          '<span class="mx-bar"><i></i></span>';
        mx.appendChild(li);
        const pct = goalG ? Math.min(100, (eaten / goalG) * 100) : 0;
        requestAnimationFrame(() => requestAnimationFrame(() => { li.querySelector('.mx-bar i').style.width = pct + '%'; }));
      });
    }
    requestAnimationFrame(() => requestAnimationFrame(() => { document.getElementById('hmFill').style.width = (goal ? Math.min(100, (total / goal) * 100) : 0) + '%'; }));
  } catch (e) {
    document.getElementById('hmGoal').textContent = 'could not load';
  }
})();


// ---- reading stats in the identity board ---------------------------------------------------------------------------------------------------
(async function readingStats() {
  const root = document.getElementById('rdHome');
  if (!root) return;
  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(2, '0');
  const dk = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const today = dk(new Date());
  const fmt = (n) => Math.round(n).toLocaleString();
  try {
    const res = await fetch('api/v1/books/overview?day=' + today + '&window=14');
    if (!res.ok) throw new Error('books');
    const d = await res.json();
    const FLAME_SVG = '<svg viewBox="0 0 32 40" aria-hidden="true"><path class="rh-flame" fill="currentColor" d="M17 4C18 12 8 14 9 22C12 21 14 18 15 15C15 22 25 25 25 31C25 36 21 38 16 38C11 38 6 34 6 28C6 17 15 14 17 4Z"/><path fill="#ff9ccf" d="M16 26C16 30 12 31 12 33C12 35 13 36 16 36C19 36 20 35 20 33C20 31 17 30 16 26Z"/></svg>';
    const fire = $('rhFire');
    fire.className = 'rh-fire' + (d.streak ? ' lit' : '');
    fire.innerHTML = FLAME_SVG + '<b>' + d.streak + '</b><span>day streak</span>';
    // reading now
    const reading = d.books.filter((b) => b.status === 'reading');
    const now = $('rhNow');
    now.replaceChildren();
    const head = document.createElement('div');
    head.className = 'rh-head';
    head.innerHTML = '<span class="rh-k">Reading now</span>';
    now.appendChild(head);
    if (!reading.length) {
      const p = document.createElement('p');
      p.className = 'rh-empty';
      p.textContent = d.books.length ? 'Nothing in progress. Start one from your to-read shelf.' : 'No books yet. Add the one you are reading.';
      now.appendChild(p);
    } else {
      const b = reading[0];
      const cover = document.createElement('span');
      cover.className = 'rh-cover';
      cover.textContent = (b.title.trim()[0] || '?').toUpperCase();
      const pct = b.pages ? Math.min(100, Math.round((b.current_page / b.pages) * 100)) : 0;
      const row = document.createElement('div');
      row.className = 'rh-nowrow';
      row.appendChild(cover);
      if (b.pages) {
        const ring = document.createElement('span');
        ring.className = 'rh-ring';
        ring.innerHTML = '<svg viewBox="0 0 84 84" aria-hidden="true"><circle class="tr" cx="42" cy="42" r="36"/><circle class="fl" cx="42" cy="42" r="36" pathLength="100" style="--p:' + pct + '"/></svg><b>' + pct + '%</b>';
        row.appendChild(ring);
      }
      const mid = document.createElement('div');
      const t = document.createElement('p');
      t.className = 'rh-title';
      t.textContent = b.title;
      mid.appendChild(t);
      const meta = document.createElement('span');
      meta.className = 'rh-meta';
      meta.textContent = (b.pages ? 'Page ' + fmt(b.current_page) + ' of ' + fmt(b.pages) : fmt(b.current_page) + ' pages read');
      now.append(row, mid, meta);
    }

    // last 7 days
    const wk = $('rhWeek');
    const days = Array.from({ length: 7 }, (_, i) => { const x = new Date(); x.setDate(x.getDate() - (6 - i)); return x; });
    const vals = days.map((x) => d.days[dk(x)] || 0);
    const max = Math.max(20, ...vals);
    const W = 300, H = 150, padB = 24, top = 18, bw = 30;
    const gap = (W - bw * 7) / 6;
    let svg = '<div class="rh-head"><span class="rh-k">Last 7 days</span><span class="rh-pill">' + fmt(d.week_pages) + ' pages</span></div><svg class="rh-chart" viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="true">';
    svg += '<line class="rh-base" x1="0" x2="' + W + '" y1="' + (H - padB + 4) + '" y2="' + (H - padB + 4) + '"/>';
    days.forEach((x, i) => {
      const v = vals[i];
      const bx = i * (bw + gap);
      const bh = Math.max(v ? 6 : 3, (H - padB - top) * (v / max));
      svg += '<rect class="rh-barr' + (v ? '' : ' none') + (dk(x) === today ? ' now' : '') + '" style="--i:' + i + '" x="' + bx + '" y="' + (H - padB - bh) + '" width="' + bw + '" height="' + bh + '" rx="9"/>';
      svg += '<text class="rh-dow" x="' + (bx + bw / 2) + '" y="' + (H - 6) + '" text-anchor="middle">' + x.toLocaleDateString(undefined, { weekday: 'narrow' }) + '</text>';
    });
    wk.innerHTML = svg + '</svg>';
  } catch (e) {
  }
})();


// ---- planned workouts for the week ----------------------------------------------------------------------------------------------------------
(async function plannedWeek() {
  const list = document.getElementById('wpList');
  if (!list) return;
  const pad = (n) => String(n).padStart(2, '0');
  const dk = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const now = new Date();
  const NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const todayIdx = (now.getDay() + 6) % 7;
  try {
    const res = await fetch('api/v1/workouts/overview?day=' + dk(now));
    if (!res.ok) throw new Error('workouts');
    const d = await res.json();
    const logged = d.days || {};
    list.replaceChildren();
    NAMES.forEach((name, i) => {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - todayIdx + i);
      const plan = d.routines.filter((r) => (r.days || []).includes(i));
      const li = document.createElement('li');
      li.style.setProperty('--i', i);
      li.className = (plan.length ? 't' + (i % 4) + ' ' : 'rest ') + (i === todayIdx ? 'today ' : i < todayIdx ? 'past ' : '') + (logged[dk(date)] ? 'done' : '');
      const DB = '<svg viewBox="0 0 40 40" aria-hidden="true"><g class="wp-db" fill="currentColor"><rect x="2" y="13" width="7" height="14" rx="2"/><rect x="31" y="13" width="7" height="14" rx="2"/><rect x="9" y="17" width="22" height="6" rx="2"/></g></svg>';
      const ZZ = '<svg viewBox="0 0 40 40" aria-hidden="true"><g class="wp-zz" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M8 12h10l-10 10h10"/><path d="M24 22h8l-8 8h8"/></g></svg>';
      const num = document.createElement('span');
      num.className = 'wp-num';
      num.textContent = date.getDate();
      const n = document.createElement('span');
      n.className = 'wp-n';
      const dn = document.createElement('span');
      dn.className = 'wp-d';
      dn.textContent = name + (i === todayIdx ? ' · today' : '');
      const r = document.createElement('span');
      r.className = 'wp-r';
      if (plan.length) {
        r.textContent = plan.map((p) => p.name).join(' + ');
        const small = document.createElement('small');
        small.textContent = plan.reduce((acc, p) => acc + p.items.length, 0) + ' ex';
        r.appendChild(small);
      } else r.textContent = 'Rest day';
      n.append(dn, r);
      const ic = document.createElement('span');
      ic.className = 'wp-ic';
      ic.innerHTML = plan.length ? DB : ZZ;
      li.append(num, n, ic);
      list.appendChild(li);
    });
    if (!d.routines.some((r) => (r.days || []).length)) {
      const hint = document.createElement('p');
      hint.className = 'wp-hint';
      hint.textContent = 'Pick days on a routine to see your week here.';
      list.after(hint);
    }
  } catch (e) {
    list.textContent = 'Could not load';
  }
})();


// ---- workout progress: streak, best weight and the improvement graph ---------------------------------------------------------------------
(async function workoutProgress() {
  const root = document.getElementById('wkHome');
  if (!root) return;
  const stats = document.getElementById('wkhStats');
  const chart = document.getElementById('wkhChart');
  const pad = (n) => String(n).padStart(2, '0');
  const dk = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const now = new Date();
  const api = async (p) => { const r = await fetch('api' + p); if (!r.ok) throw new Error(p); return r.json(); };
  const fmt = (n) => (Math.round(n * 10) / 10).toLocaleString();
  try {
    const d = await api('/v1/workouts/overview?day=' + dk(now) + '&window=120');
    // weeks in a row (Monday to Sunday) with at least one finished workout; this week counts once it has one, else it is still open
    const mondayOf = (dt) => { const m = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() - ((dt.getDay() + 6) % 7)); return dk(m); };
    const weeks = new Set(Object.keys(d.days).map((k) => { const [y, m, dd] = k.split('-').map(Number); return mondayOf(new Date(y, m - 1, dd)); }));
    let cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
    if (!weeks.has(dk(cursor))) cursor.setDate(cursor.getDate() - 7);
    let streak = 0;
    while (weeks.has(dk(cursor))) { streak++; cursor.setDate(cursor.getDate() - 7); }
    const lifts = d.bests.filter((b) => b.kind === 'weight' && b.score > 0).sort((a, b) => b.sessions - a.sessions || b.score - a.score);
    const top = lifts[0];
    const FL = '<svg class="wkh-fl" viewBox="0 0 32 40" aria-hidden="true"><path fill="currentColor" d="M17 4C18 12 8 14 9 22C12 21 14 18 15 15C15 22 25 25 25 31C25 36 21 38 16 38C11 38 6 34 6 28C6 17 15 14 17 4Z"/><path fill="#ff9ccf" d="M16 26C16 30 12 31 12 33C12 35 13 36 16 36C19 36 20 35 20 33C20 31 17 30 16 26Z"/></svg>';
    const items = [
      ['wide', FL + '<span><b data-n="' + streak + '">0</b><small>' + (streak === 1 ? 'week' : 'weeks') + ' in a row</small></span>'],
      ['', '<b data-n="' + d.week_sessions + '">0</b><small>workouts this week</small>'],
      ['pink', '<b data-n="' + (top ? top.score : 0) + '">0</b><small>' + (top ? 'kg best · ' + top.name : 'kg best lift') + '</small>'],
    ];
    stats.replaceChildren();
    items.forEach(([cls, html], i) => {
      const li = document.createElement('li');
      li.className = cls;
      li.style.setProperty('--i', i);
      li.innerHTML = html;
      stats.appendChild(li);
      const b = li.querySelector('b');
      const val = Number(b.dataset.n);
      if (matchMedia('(prefers-reduced-motion: reduce)').matches || !val) b.textContent = fmt(val);
      else {
        const t0 = performance.now();
        const step = (t) => { const k = Math.min(1, (t - t0) / 900); b.textContent = fmt(val * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); };
        requestAnimationFrame(step);
      }
    });

    const draw = async (ex) => {
      const h = (await api('/v1/workouts/exercises/' + ex.exercise_id + '/history')).history.slice(-10);
      const pts = h.map((r) => r.weight);
      chart.querySelector('.wkh-ch-t').textContent = ex.name + ' · kg';
      const delta = pts.length > 1 ? pts[pts.length - 1] - pts[0] : 0;
      const dl = chart.querySelector('.wkh-delta');
      dl.hidden = pts.length < 2;
      dl.textContent = (delta >= 0 ? '+' : '') + fmt(delta) + ' kg';
      const W = 320, H = 150, L = 6, R = 6, T = 14, B = 26;
      const lo = Math.min(...pts), hi = Math.max(...pts), span = hi - lo || 1;
      const x = (i) => (pts.length === 1 ? W / 2 : L + (i * (W - L - R)) / (pts.length - 1));
      const y = (v) => T + (1 - (v - lo) / span) * (H - T - B) * (hi === lo ? 0.5 : 1) + (hi === lo ? (H - T - B) / 4 : 0);
      const line = pts.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join(' ');
      const area = line + ' L' + x(pts.length - 1).toFixed(1) + ' ' + (H - B) + ' L' + x(0).toFixed(1) + ' ' + (H - B) + ' Z';
      const dayLabel = (s) => { const [yy, mm, dd] = s.split('-').map(Number); return new Date(yy, mm - 1, dd).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }); };
      const svg = '<svg class="wkh-svg" viewBox="0 0 ' + W + ' ' + H + '" aria-label="' + ex.name + ' weight over time"><defs><linearGradient id="wkhG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4e11b" stop-opacity=".35"/><stop offset="1" stop-color="#c1ff1a" stop-opacity="0"/></linearGradient></defs>'
        + '<line class="gd" x1="' + L + '" x2="' + (W - R) + '" y1="' + (H - B) + '" y2="' + (H - B) + '"/>'
        + (pts.length > 1 ? '<path class="ar" d="' + area + '"/><path class="ln" pathLength="1" d="' + line + '"/>' : '')
        + pts.map((v, i) => '<circle class="pt' + (i === pts.length - 1 ? ' last' : '') + '" style="--i:' + i + '" cx="' + x(i).toFixed(1) + '" cy="' + y(v).toFixed(1) + '" r="' + (i === pts.length - 1 ? 6 : 4.5) + '"/>').join('')
        + '<text x="' + L + '" y="' + (H - 6) + '">' + dayLabel(h[0].day) + '</text><text x="' + (W - R) + '" y="' + (H - 6) + '" text-anchor="end">' + dayLabel(h[h.length - 1].day) + '</text></svg>';
      chart.querySelector('.wkh-svg')?.remove();
      chart.querySelector('.wkh-ch-head').insertAdjacentHTML('afterend', svg);
    };

    chart.replaceChildren();
    if (!top) {
      chart.innerHTML = '<p class="wkh-empty">Log a workout with weights and your progress will draw itself here.</p>';
      return;
    }
    chart.innerHTML = '<div class="wkh-ch-head"><p class="wkh-ch-t"></p><span class="wkh-delta"></span></div><div class="wkh-chips"></div>';
    const chips = chart.querySelector('.wkh-chips');
    lifts.slice(0, 3).forEach((ex, i) => {
      const bt = document.createElement('button');
      bt.type = 'button';
      bt.textContent = ex.name;
      bt.setAttribute('aria-pressed', String(i === 0));
      bt.addEventListener('click', async () => { chips.querySelectorAll('button').forEach((o) => o.setAttribute('aria-pressed', String(o === bt))); try { await draw(ex); } catch (e) {} });
      chips.appendChild(bt);
    });
    await draw(top);
  } catch (e) {
    stats.textContent = 'Could not load';
  }
})();


// ---- goals: the soonest and most advanced active goals ---------------------------------------------------------------------------------------
(async function homeGoals() {
  const grid = document.getElementById('ghGrid');
  if (!grid) return;
  const pad = (n) => String(n).padStart(2, '0');
  const now = new Date();
  const day = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
  const fmt = (n) => (Math.round(n * 10) / 10).toLocaleString(undefined, { maximumFractionDigits: 1 });
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const CATS = { body: 'Body', mind: 'Mind', skills: 'Skills', life: 'Life', money: 'Money' };
  const FLOWER = '<svg class="gh-flower" viewBox="0 0 64 64" aria-hidden="true"><use href="#flower"/></svg>';
  const SPARKS = [['8%', '52%', '14px', '0s'], ['86%', '14%', '18px', '1s']];
  let data;
  try {
    const res = await fetch('api/v1/goals/overview?day=' + day);
    if (!res.ok) throw new Error('goals');
    data = await res.json();
  } catch (e) {
    grid.replaceChildren(el('li', 'gh-card gh-empty in', 'Could not load goals'));
    return;
  }
  const active = data.goals.filter((g) => g.status === 'active')
    .sort((a, b) => (a.days_left == null) - (b.days_left == null) || (a.days_left ?? 0) - (b.days_left ?? 0) || b.pct - a.pct);
  const all = document.getElementById('ghAll');
  if (all && active.length > 6) all.textContent = 'All ' + active.length + ' goals \u2197';
  grid.replaceChildren();
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
  }, { threshold: 0.2 }) : null;
  const show = (li) => { if (io) io.observe(li); else li.classList.add('in'); };
  if (!active.length) {
    const li = el('li', 'gh-card gh-empty');
    li.innerHTML = FLOWER;
    li.append(el('p', 'gh-title', data.done ? 'All goals done. Set a new one?' : 'Set your first goal'), (() => { const a = el('a', 'gh-cta', 'Open goals'); a.href = 'goals'; return a; })());
    li.style.gap = '16px';
    grid.appendChild(li);
    show(li);
    return;
  }
  active.slice(0, 6).forEach((g, i) => {
    const li = el('li', 'gh-card c-' + g.category);
    li.style.setProperty('--n', i % 3);
    li.setAttribute('role', 'link');
    li.tabIndex = 0;
    li.onclick = () => { location.href = 'goals'; };
    li.onkeydown = (e) => { if (e.key === 'Enter') location.href = 'goals'; };
    li.insertAdjacentHTML('beforeend', FLOWER);
    SPARKS.forEach(([x, y, s, d]) => li.insertAdjacentHTML('beforeend', '<svg class="gh-tw" style="--x:' + x + ';--y:' + y + ';--s:' + s + ';--d:' + (parseFloat(d) + i * 0.4) + 's" viewBox="0 0 32 32" aria-hidden="true"><use href="#spark"/></svg>'));
    const top = el('div', 'gh-top');
    top.appendChild(el('span', 'gh-cat', CATS[g.category]));
    if (g.days_left != null) {
      const late = g.days_left <= 7;
      const label = g.days_left < 0 ? Math.abs(g.days_left) + (Math.abs(g.days_left) === 1 ? ' day' : ' days') + ' overdue' : g.days_left === 0 ? 'due today' : g.days_left <= 7 ? 'in ' + g.days_left + (g.days_left === 1 ? ' day' : ' days') : 'by ' + new Date(g.due + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
      top.appendChild(el('span', 'gh-due' + (late ? ' late' : ''), label));
    }
    li.appendChild(top);
    li.appendChild(el('h3', 'gh-title', g.title));
    const prog = el('div', 'gh-prog');
    const ring = el('div', 'gh-ring');
    ring.style.setProperty('--p', g.pct);
    ring.innerHTML = '<svg viewBox="0 0 100 100" aria-hidden="true"><circle class="tr" cx="50" cy="50" r="40"/><circle class="fl" cx="50" cy="50" r="40" pathLength="100"/></svg><b>' + Math.round(g.pct) + '%</b>';
    const of = el('div', 'gh-of');
    if (g.kind === 'number') {
      const s = el('strong', '', fmt(g.current));
      s.appendChild(el('em', '', '/ ' + fmt(g.target) + (g.unit ? ' ' + g.unit : '')));
      of.append(s, el('small', '', g.pct >= 100 ? 'target reached' : fmt(Math.max(0, g.target - g.current)) + (g.unit ? ' ' + g.unit : '') + ' to go'));
    } else if (g.kind === 'steps') {
      const done = g.steps.filter((x) => x.done).length;
      const s = el('strong', '', done + ' / ' + g.steps.length);
      s.appendChild(el('em', '', 'steps'));
      of.append(s, el('small', '', g.steps.length && done === g.steps.length ? 'all steps done' : (g.steps.length - done) + ' to go'));
    } else {
      of.append(el('strong', '', 'Open'), el('small', '', 'tick it off when done'));
    }
    prog.append(ring, of);
    li.appendChild(prog);
    grid.appendChild(li);
    show(li);
  });
})();
