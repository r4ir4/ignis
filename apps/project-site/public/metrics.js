// Metrics page: body weight, body fat and tape measurements, one value per metric per day, with a progress chart and optional goals, backed by the shared ignis API.
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
  const fmt = (n) => (Math.round(n * 10) / 10).toLocaleString(undefined, { maximumFractionDigits: 1 });
  const signed = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n));
  const short = (k) => parseDay(k).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const num = (v) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };

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
  const S = { data: null, sel: 'weight', range: 90 };
  const by = (k) => S.data.metrics.find((m) => m.key === k);
  const unitOf = (m) => (m.unit === '%' ? '%' : ' ' + m.unit);

  async function load() {
    S.data = await api('/v1/metrics/overview?day=' + todayKey());
    render();
  }

  const ICON = {
    scale: '<g class="mt-i-scale"><rect x="10" y="14" width="64" height="58" rx="16" fill="currentColor"/><path d="M26 34a16 16 0 0 1 32 0" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".85"/><path d="M42 34l6-8" stroke="#fff" stroke-width="4" stroke-linecap="round"/></g>',
    drop: '<g class="mt-i-drop"><path d="M42 10C54 28 66 38 66 52a24 24 0 0 1-48 0C18 38 30 28 42 10Z" fill="currentColor"/><path d="M30 54a12 12 0 0 0 10 12" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".7"/></g>',
    tape: '<g class="mt-i-tape"><circle cx="42" cy="42" r="30" fill="currentColor"/><circle cx="42" cy="42" r="12" fill="#fff" opacity=".85"/><path d="M42 12V4M42 72v8M12 42H4M72 42h8" stroke="currentColor" stroke-width="5" stroke-linecap="round"/></g>',
    cal: '<g class="mt-i-cal"><g fill="currentColor"><rect x="10" y="16" width="64" height="56" rx="10"/><rect x="22" y="6" width="8" height="18" rx="4"/><rect x="54" y="6" width="8" height="18" rx="4"/></g><g fill="#fff" opacity=".85"><circle cx="28" cy="40" r="4"/><circle cx="42" cy="40" r="4"/><circle cx="56" cy="40" r="4"/><circle cx="28" cy="56" r="4"/><circle cx="42" cy="56" r="4"/></g></g>',
  };

  function sel(key) { S.sel = key; renderChart(); renderCards(); }

  // ---- top: word card and four tiles --------------------------------------------------------------------------------------------------
  function tile(cls, key, label, value, unit, icon, sub) {
    const b = make('button', 'mt-tile ' + cls);
    b.type = 'button';
    const left = make('span', 'mt-tl');
    left.appendChild(make('small', '', label));
    const n = make('b', 'mt-num');
    n.textContent = value == null ? '–' : fmt(value);
    if (value != null && unit) n.appendChild(make('em', '', unit));
    left.appendChild(n);
    if (sub) left.appendChild(make('span', 'mt-sub', sub));
    const art = make('span', 'mt-art');
    art.innerHTML = '<svg viewBox="0 0 84 84" aria-hidden="true">' + ICON[icon] + '</svg>';
    b.append(left, art);
    if (key) b.addEventListener('click', () => { sel(key); $('mtChart').scrollIntoView({ behavior: 'smooth', block: 'center' }); });
    return b;
  }

  function renderTop() {
    const d = S.data;
    const top = $('mtTop');
    top.replaceChildren();
    const word = make('figure', 'mt-fig mt-word grain');
    word.innerHTML = '<p class="mt-wordt">Body<br>metrics</p><svg class="mt-tw" style="--x:88%;--y:12%;--s:22px;--d:0s" viewBox="0 0 32 32" aria-hidden="true"><use href="#spark"/></svg><svg class="mt-tw mt-tw-p" style="--x:76%;--y:68%;--s:16px;--d:1.1s" viewBox="0 0 32 32" aria-hidden="true"><use href="#spark"/></svg><svg class="mt-tw" style="--x:52%;--y:10%;--s:12px;--d:2s" viewBox="0 0 32 32" aria-hidden="true"><use href="#spark"/></svg>';
    const row = make('div', 'mt-wordrow');
    row.appendChild(make('small', '', d.days_logged ? d.days_logged + (d.days_logged === 1 ? ' day' : ' days') + ' logged' : 'Nothing logged yet'));
    const add = make('button', 'mt-mini');
    add.type = 'button';
    add.innerHTML = '<span class="mt-plus"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></span>Log measurements';
    add.addEventListener('click', () => openLog(todayKey()));
    row.appendChild(add);
    word.appendChild(row);

    const w = by('weight'), f = by('body_fat'), c = by('waist');
    const tiles = make('ul', 'mt-tiles');
    const li = (node) => { const x = make('li'); x.style.display = 'contents'; x.appendChild(node); tiles.appendChild(x); };
    const chg = (m) => (m.change_30 == null ? (m.latest ? 'last ' + short(m.latest.day) : 'not logged') : signed(m.change_30) + ' ' + m.unit + ' in 30 days');
    li(tile('t-w', 'weight', 'Weight', w.latest && w.latest.value, 'kg', 'scale', chg(w)));
    li(tile('t-f', 'body_fat', 'Body fat', f.latest && f.latest.value, '%', 'drop', chg(f)));
    li(tile('t-c', 'waist', 'Waist', c.latest && c.latest.value, 'cm', 'tape', chg(c)));
    const goalsSet = d.metrics.filter((m) => m.goal != null).length;
    li(tile('t-d', null, 'Days logged', d.days_logged, '', 'cal', goalsSet ? goalsSet + (goalsSet === 1 ? ' goal set' : ' goals set') : 'no goals yet'));
    top.append(word, tiles);
  }

  // ---- chart ----------------------------------------------------------------------------------------------------------------------------
  function renderChart() {
    const m = by(S.sel);
    const box = $('mtChart');
    box.replaceChildren();
    const head = make('div', 'mt-head');
    head.appendChild(make('p', 'mt-k', 'Progress'));
    const pills = make('div', 'mt-pills');
    pills.setAttribute('role', 'group');
    pills.setAttribute('aria-label', 'Metric');
    S.data.metrics.forEach((x) => {
      const b = make('button', '', x.label);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(x.key === S.sel));
      b.addEventListener('click', () => sel(x.key));
      pills.appendChild(b);
    });
    head.appendChild(pills);
    box.appendChild(head);

    const today = parseDay(todayKey());
    const from = S.range ? dayKey(addDays(today, -S.range + 1)) : '0000-00-00';
    const pts = m.points.filter((p) => p.day >= from);
    const big = make('div', 'mt-big');
    const v = make('div', 'mt-bigv');
    v.textContent = m.latest ? fmt(m.latest.value) : '–';
    if (m.latest) v.appendChild(make('em', '', m.unit));
    const badges = make('div', 'mt-badges');
    if (pts.length > 1) {
      const d = pts[pts.length - 1].value - pts[0].value;
      badges.appendChild(make('span', 'mt-badge', signed(d) + ' ' + m.unit + ' since ' + short(pts[0].day)));
    }
    if (m.goal != null && m.latest) {
      const left = m.goal - m.latest.value;
      badges.appendChild(make('span', 'mt-badge', Math.abs(left) < 0.05 ? 'Goal reached' : fmt(Math.abs(left)) + ' ' + m.unit + (left < 0 ? ' to lose' : ' to gain')));
    }
    const goalBtn = make('button', 'mt-badge', m.goal != null ? 'Goal ' + fmt(m.goal) + ' ' + m.unit + ' ✎' : '+ Set a goal');
    goalBtn.type = 'button';
    goalBtn.addEventListener('click', () => openGoal(m));
    badges.appendChild(goalBtn);
    big.append(v, badges);
    box.appendChild(big);

    const ranges = make('div', 'mt-pills');
    ranges.setAttribute('role', 'group');
    ranges.setAttribute('aria-label', 'Range');
    [[30, '30 days'], [90, '90 days'], [365, 'Year'], [0, 'All']].forEach(([r, label]) => {
      const b = make('button', '', label);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(S.range === r));
      b.addEventListener('click', () => { S.range = r; renderChart(); });
      ranges.appendChild(b);
    });
    box.appendChild(ranges);

    if (!pts.length) {
      box.appendChild(make('p', 'mt-empty', m.points.length ? 'No ' + m.label.toLowerCase() + ' entries in this range. Try a longer one.' : 'Nothing logged for ' + m.label.toLowerCase() + ' yet. Log your first measurement and the graph will draw itself.'));
      return;
    }
    const readout = make('p', 'mt-readout');
    readout.textContent = ' ';
    box.appendChild(readout);

    const W = 760, H = 270, L = 52, R = 18, T = 16, B = 32;
    let lo = Math.min(...pts.map((p) => p.value)), hi = Math.max(...pts.map((p) => p.value));
    if (m.goal != null) { lo = Math.min(lo, m.goal); hi = Math.max(hi, m.goal); }
    const padv = (hi - lo || Math.max(1, hi * 0.04)) * 0.18;
    lo -= padv; hi += padv;
    const t0 = parseDay(pts[0].day).getTime(), t1 = parseDay(pts[pts.length - 1].day).getTime();
    const x = (k) => (t1 === t0 ? (L + W - R) / 2 : L + ((parseDay(k).getTime() - t0) / (t1 - t0)) * (W - L - R));
    const y = (val) => T + (1 - (val - lo) / (hi - lo)) * (H - T - B);
    const line = pts.map((p, i) => (i ? 'L' : 'M') + x(p.day).toFixed(1) + ' ' + y(p.value).toFixed(1)).join(' ');
    const area = line + ' L' + x(pts[pts.length - 1].day).toFixed(1) + ' ' + (H - B) + ' L' + x(pts[0].day).toFixed(1) + ' ' + (H - B) + ' Z';
    let g = '<defs><linearGradient id="mtG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c1ff1a" stop-opacity=".35"/><stop offset="1" stop-color="#c1ff1a" stop-opacity="0"/></linearGradient></defs>';
    [0, 1, 2].forEach((i) => {
      const val = lo + ((hi - lo) * (i + 0.5)) / 3;
      g += '<line class="gd" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(val).toFixed(1) + '" y2="' + y(val).toFixed(1) + '"/><text x="' + (L - 8) + '" y="' + (y(val) + 4).toFixed(1) + '" text-anchor="end">' + fmt(val) + '</text>';
    });
    if (m.goal != null) g += '<line class="goal" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(m.goal).toFixed(1) + '" y2="' + y(m.goal).toFixed(1) + '"/><text class="gl" x="' + (W - R) + '" y="' + (y(m.goal) - 8).toFixed(1) + '" text-anchor="end">goal</text>';
    if (pts.length > 1) g += '<path class="ar" d="' + area + '"/><path class="ln" pathLength="1" d="' + line + '"/>';
    pts.forEach((p, i) => { g += '<circle class="pt' + (i === pts.length - 1 ? ' last' : '') + '" style="--i:' + Math.min(i, 30) + '" cx="' + x(p.day).toFixed(1) + '" cy="' + y(p.value).toFixed(1) + '" r="' + (i === pts.length - 1 ? 6 : 4.5) + '"/>'; });
    g += '<line class="guide" y1="' + T + '" y2="' + (H - B) + '"/><circle class="hov" r="8"/>';
    g += '<text x="' + L + '" y="' + (H - 8) + '">' + short(pts[0].day) + '</text>' + (pts.length > 1 ? '<text x="' + (W - R) + '" y="' + (H - 8) + '" text-anchor="end">' + short(pts[pts.length - 1].day) + '</text>' : '');
    const svg = make('div');
    svg.innerHTML = '<svg class="mt-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + m.label + ' over time">' + g + '</svg>';
    box.appendChild(svg);
    const el = svg.firstChild, guide = el.querySelector('.guide'), hov = el.querySelector('.hov');
    const last = pts[pts.length - 1];
    readout.textContent = short(last.day) + ' · ' + fmt(last.value) + ' ' + m.unit;
    function move(ev) {
      const r = el.getBoundingClientRect();
      const px = ((ev.clientX - r.left) / r.width) * W;
      let best = pts[0];
      pts.forEach((p) => { if (Math.abs(x(p.day) - px) < Math.abs(x(best.day) - px)) best = p; });
      guide.setAttribute('x1', x(best.day)); guide.setAttribute('x2', x(best.day)); guide.style.opacity = '.35';
      hov.setAttribute('cx', x(best.day)); hov.setAttribute('cy', y(best.value)); hov.style.opacity = '1';
      readout.textContent = short(best.day) + ' · ' + fmt(best.value) + ' ' + m.unit;
    }
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', () => { guide.style.opacity = '0'; hov.style.opacity = '0'; readout.textContent = short(last.day) + ' · ' + fmt(last.value) + ' ' + m.unit; });
  }

  // ---- measurement cards ------------------------------------------------------------------------------------------------------------------
  function spark(pts) {
    const p = pts.slice(-12);
    if (p.length < 2) return '';
    const lo = Math.min(...p.map((q) => q.value)), hi = Math.max(...p.map((q) => q.value));
    const X = (i) => 2 + (i * 96) / (p.length - 1), Y = (v) => (hi === lo ? 17 : 30 - ((v - lo) / (hi - lo)) * 26);
    return '<svg class="spark" viewBox="0 0 100 34" preserveAspectRatio="none" aria-hidden="true"><path d="' + p.map((q, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(q.value).toFixed(1)).join(' ') + '"/></svg>';
  }
  function renderCards() {
    const box = $('mtCards');
    box.replaceChildren();
    const first = !box.dataset.shown;
    S.data.metrics.forEach((m, i) => {
      const li = make('li');
      const b = make('button', 'mt-mc g' + (i % 5) + (m.latest ? '' : ' none'));
      b.type = 'button';
      b.style.setProperty('--i', i);
      if (!first) b.style.animation = 'none', b.style.opacity = '1', b.style.transform = 'none';
      b.setAttribute('aria-pressed', String(m.key === S.sel));
      b.appendChild(make('small', '', m.label));
      const v = make('b');
      v.textContent = m.latest ? fmt(m.latest.value) : '–';
      if (m.latest) v.appendChild(make('em', '', m.unit));
      b.appendChild(v);
      b.appendChild(make('span', 'mt-ch', m.latest ? (m.change_30 != null ? signed(m.change_30) + ' ' + m.unit + ' / 30 d' : short(m.latest.day)) : 'not logged'));
      b.insertAdjacentHTML('beforeend', spark(m.points));
      b.addEventListener('click', () => { sel(m.key); $('mtChart').scrollIntoView({ behavior: 'smooth', block: 'center' }); });
      li.appendChild(b);
      box.appendChild(li);
    });
    box.dataset.shown = '1';
  }

  // ---- history ----------------------------------------------------------------------------------------------------------------------------
  function renderHistory() {
    const box = $('mtHist');
    box.replaceChildren();
    if (!S.data.entries.length) { box.appendChild(make('li', 'mt-empty', 'No measurements yet. Tap “Log measurements” to add the first.')); return; }
    S.data.entries.forEach((e) => {
      const li = make('li');
      const b = make('button', 'mt-hrow');
      b.type = 'button';
      b.appendChild(make('span', 'mt-hd', parseDay(e.day).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })));
      const vals = make('span', 'mt-hv');
      S.data.metrics.filter((m) => e.values[m.key] != null).forEach((m) => {
        const s = make('span', '', m.label + ' ');
        s.appendChild(make('b', '', fmt(e.values[m.key]) + (m.unit === '%' ? '%' : '')));
        vals.appendChild(s);
      });
      b.appendChild(vals);
      b.insertAdjacentHTML('beforeend', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>');
      b.addEventListener('click', () => openLog(e.day));
      li.appendChild(b);
      box.appendChild(li);
    });
  }

  function render() {
    renderTop();
    renderChart();
    renderCards();
    renderHistory();
  }

  // ---- log dialog -------------------------------------------------------------------------------------------------------------------------
  let logDay = todayKey();
  let armed = 0;
  function fillFields(day) {
    const e = S.data.entries.find((x) => x.day === day);
    const vals = e ? e.values : {};
    // an entry older than the last 30 days is not in the list: fall back to the series
    S.data.metrics.forEach((m) => { if (!e) { const p = m.points.find((q) => q.day === day); if (p) vals[m.key] = p.value; } });
    const box = $('mtFields');
    box.replaceChildren();
    S.data.metrics.forEach((m) => {
      const lab = make('label', 'mt-f');
      const s = make('span', '', m.label + ' ');
      s.appendChild(make('i', '', '(' + m.unit + ')'));
      const inp = make('input');
      inp.type = 'number'; inp.inputMode = 'decimal'; inp.step = '0.1'; inp.min = '0'; inp.placeholder = '0'; inp.dataset.k = m.key;
      inp.value = vals[m.key] != null ? vals[m.key] : '';
      inp.dataset.was = inp.value;
      lab.append(s, inp);
      box.appendChild(lab);
    });
    $('mtLogDelete').hidden = !Object.keys(vals).length;
    $('mtLogTitle').textContent = Object.keys(vals).length ? 'Edit measurements' : 'Log measurements';
  }
  function setDay(day) {
    logDay = day;
    $('mtDay').value = day;
    const t = parseDay(todayKey());
    $('mtQuick').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(dayKey(addDays(t, -Number(b.dataset.v))) === day)));
    fillFields(day);
  }
  function openLog(day) {
    $('mtLogErr').hidden = true;
    $('mtLogSave').disabled = false;
    $('mtDay').max = todayKey();
    const del = $('mtLogDelete');
    del.classList.remove('sure');
    del.textContent = 'Delete this day';
    setDay(day);
    $('mtLogDialog').showModal();
    const first = [...$('mtFields').querySelectorAll('input')].find((i) => !i.value) || $('mtFields').querySelector('input');
    if (first) first.focus();
  }
  async function saveLog(event) {
    event.preventDefault();
    const err = $('mtLogErr');
    err.hidden = true;
    const values = {};
    for (const inp of $('mtFields').querySelectorAll('input')) {
      if (inp.value.trim() === '') { if (inp.dataset.was) values[inp.dataset.k] = null; continue; }
      const n = num(inp.value);
      if (n == null || n <= 0) { err.textContent = 'Check the numbers: they must be positive.'; err.hidden = false; inp.focus(); return; }
      values[inp.dataset.k] = n;
    }
    if (!Object.keys(values).length) { err.textContent = 'Fill in at least one measurement.'; err.hidden = false; return; }
    $('mtLogSave').disabled = true;
    try {
      await api('/v1/metrics/entries/' + logDay, { method: 'PUT', body: { values } });
      $('mtLogDialog').close();
      toast('Saved');
      await load();
    } catch (e) {
      err.textContent = e.message;
      err.hidden = false;
      $('mtLogSave').disabled = false;
    }
  }
  async function deleteDay() {
    const del = $('mtLogDelete');
    if (!armed) {
      armed = setTimeout(() => { armed = 0; del.classList.remove('sure'); del.textContent = 'Delete this day'; }, 4000);
      del.classList.add('sure');
      del.textContent = 'Sure? Tap again to delete';
      return;
    }
    clearTimeout(armed);
    armed = 0;
    try {
      await api('/v1/metrics/entries/' + logDay, { method: 'DELETE' });
      $('mtLogDialog').close();
      toast('Deleted');
      await load();
    } catch (e) { toast(e.message); }
  }

  // ---- goal dialog ------------------------------------------------------------------------------------------------------------------------
  let goalMetric = null;
  function openGoal(m) {
    goalMetric = m;
    $('mtGoalTitle').textContent = m.label + ' goal';
    $('mtGoalLabel').textContent = 'Target (' + m.unit + ')';
    $('mtGoalVal').value = m.goal != null ? m.goal : '';
    $('mtGoalErr').hidden = true;
    $('mtGoalSave').disabled = false;
    $('mtGoalDialog').showModal();
    $('mtGoalVal').focus();
  }
  async function saveGoal(event) {
    event.preventDefault();
    const err = $('mtGoalErr');
    err.hidden = true;
    const raw = $('mtGoalVal').value.trim();
    const n = raw === '' ? null : num(raw);
    if (raw !== '' && (n == null || n <= 0)) { err.textContent = 'Enter a positive number.'; err.hidden = false; return; }
    $('mtGoalSave').disabled = true;
    try {
      await api('/v1/metrics/goals/' + goalMetric.key, { method: 'PUT', body: { value: n } });
      $('mtGoalDialog').close();
      toast(n == null ? 'Goal removed' : 'Goal saved');
      await load();
    } catch (e) {
      err.textContent = e.message;
      err.hidden = false;
      $('mtGoalSave').disabled = false;
    }
  }

  function shell() {
    const grid = $('mtGrid');
    grid.innerHTML = '<div class="identity mt-board">'
      + '<div class="mt-idgrid" id="mtTop"></div>'
      + '<figure class="mt-fig mt-chartc" id="mtChart"></figure>'
      + '<figure class="mt-fig mt-cardsc"><div class="mt-head"><p class="mt-k">Measurements</p></div><ul class="mt-cards" id="mtCards"></ul></figure>'
      + '<figure class="mt-fig mt-histc"><div class="mt-head"><p class="mt-k">History</p></div><ul class="mt-hist" id="mtHist"></ul></figure>'
      + '</div>';
  }

  function init() {
    shell();
    $('mtLogClose').addEventListener('click', () => $('mtLogDialog').close());
    $('mtGoalClose').addEventListener('click', () => $('mtGoalDialog').close());
    ['mtLogDialog', 'mtGoalDialog'].forEach((id) => $(id).addEventListener('click', (e) => { if (e.target === $(id)) $(id).close(); }));
    $('mtLogForm').addEventListener('submit', saveLog);
    $('mtGoalForm').addEventListener('submit', saveGoal);
    $('mtLogDelete').addEventListener('click', deleteDay);
    $('mtQuick').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setDay(dayKey(addDays(parseDay(todayKey()), -Number(b.dataset.v)))); });
    $('mtDay').addEventListener('change', () => { if ($('mtDay').value) setDay($('mtDay').value); });
    load().catch(() => {
      const el = $('mtEmpty');
      el.textContent = 'Could not load your metrics. Reload to try again.';
      el.hidden = false;
    });
  }
  init();
})();
