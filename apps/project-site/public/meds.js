// Meds page (Venvanse, Ritalina, Lithium): reads the dose log and the model from the shared backend, draws it, and lets you log a dose.
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const MIN = 60e3;
  const HOUR = 3600e3;
  const SLUG = 'vyvanse';
  const TZ = -new Date().getTimezoneOffset(); // minutes east of UTC, as the API wants it
  const PAGE = 10;

  const S = { overview: null, doses: [], curve: null, shown: PAGE };

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

  // ---- formatting ----------------------------------------------------------------------------------------------
  const dur = (minutes) => {
    const m = Math.round(minutes);
    if (m < 60) return m + 'm';
    return Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'm';
  };
  const clock = (date) => date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const dayName = (date) => date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  const minuteClock = (minute) => String(Math.floor(minute / 60)).padStart(2, '0') + ':' + String(minute % 60).padStart(2, '0');
  const agoText = (ms) => {
    const mins = Math.round(ms / MIN);
    if (mins < 2) return 'just now';
    if (mins < 60) return mins + ' min ago';
    if (mins < 36 * 60) return Math.floor(mins / 60) + ' h ago';
    const days = Math.floor(mins / 1440);
    return days + (days === 1 ? ' day ago' : ' days ago');
  };
  const sameDay = (a, b) => a.toDateString() === b.toDateString();
  const dayKey = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const SOURCES = { ios: 'iPhone', shortcut: 'Shortcut', watch: 'Watch', legacy: 'Imported', ignis: 'Ignis', web: 'Web' };
  const ENOUGH = { yes: 'Yes, enough', no_but_fine: 'Not enough, but fine', no_second_vyvanse: 'Not enough, took a second' };
  const EVENTS = { onset: 'kicked in', strongest: 'strongest', wearing_off: 'wearing off' };

  const make = (tag, cls, text) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  };
  const svgEl = (name, attrs, parent) => {
    const node = document.createElementNS('http://www.w3.org/2000/svg', name);
    Object.entries(attrs || {}).forEach(([k, v]) => node.setAttribute(k, v));
    if (parent) parent.appendChild(node);
    return node;
  };
  let toastTimer;
  function toast(text) {
    const el = $('toast');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
  }

  // ---- the usual timings, and where you are in them -------------------------------------------------------------
  const timing = (key, fallback) => {
    const t = S.overview && S.overview.timing[key];
    return t && t.n >= 5 ? t : { n: 0, median: fallback, p25: fallback * 0.85, p75: fallback * 1.15 };
  };
  function phaseFor(elapsedMin) {
    const on = timing('onset', 60);
    const st = timing('strongest', 140);
    const off = timing('wearing_off', 330);
    if (elapsedMin < on.p25) return 'Waiting for it to kick in';
    if (elapsedMin < st.p25) return 'Kicking in';
    if (elapsedMin <= st.p75) return 'Around its strongest';
    if (elapsedMin < off.p25) return 'Holding steady';
    if (elapsedMin <= off.p75) return 'Starting to wear off';
    if (elapsedMin < 14 * 60) return 'Mostly worn off';
    return 'Done for the day';
  }

  // ---- the banner -------------------------------------------------------------------------------------------------
  function banner() {
    const o = S.overview;
    const list = $('mPills');
    list.replaceChildren();
    const items = [];
    const last = o.last_dose;
    if (last) {
      const taken = new Date(last.taken_at);
      items.push([sameDay(taken, new Date()) ? 'Today' : 'Last dose', sameDay(taken, new Date()) ? clock(taken) + ' · ' + last.dose_mg + ' mg' : agoText(Date.now() - taken)]);
      if (!sameDay(taken, new Date())) items.push(['Not logged today', '', 'p-pink']);
    } else {
      items.push(['No doses yet', '', 'p-pink']);
    }
    if (o.timing.onset.n >= 5) items.push(['Kicks in', '~' + dur(o.timing.onset.median)]);
    if (o.streak > 1) items.push(['Streak', o.streak + ' days']);
    items.forEach(([name, value, cls], i) => {
      const li = make('li', cls || '');
      li.style.setProperty('--i', i);
      li.append(name + (value ? ' ' : ''));
      if (value) li.appendChild(make('b', '', value));
      list.appendChild(li);
    });
  }

  // ---- today ---------------------------------------------------------------------------------------------------
  function today() {
    const o = S.overview;
    const last = o.last_dose;
    const now = Date.now();
    const parts = $('mSince');
    parts.replaceChildren();
    const piece = (n, unit) => { parts.appendChild(make('b', '', String(n))); parts.appendChild(make('small', '', unit)); };
    const phase = $('mPhase');
    const quick = $('mQuick');
    const note = [];

    const level = S.curve && S.curve.points.length ? levelAt(now) : null;
    renderLevel(level);

    if (last && now - new Date(last.taken_at) < 36 * HOUR) {
      const minutes = Math.max(0, (now - new Date(last.taken_at)) / MIN);
      const h = Math.floor(minutes / 60);
      if (h > 0) piece(h, 'h');
      piece(String(Math.floor(minutes % 60)).padStart(h > 0 ? 2 : 1, '0'), 'm');
      $('wSince').textContent = 'since your ' + clock(new Date(last.taken_at)) + ' dose · ' + last.dose_mg + ' mg';
      phase.textContent = phaseFor(minutes);
      phase.hidden = false;
      quick.hidden = now - new Date(last.taken_at) > 24 * HOUR;
      const logged = new Map(((S.doses[0] && S.doses[0].id === last.id ? S.doses[0].events : []) || []).map((e) => [e.type, e]));
      quick.querySelectorAll('button').forEach((btn) => {
        const e = logged.get(btn.dataset.event);
        btn.classList.toggle('done', !!e);
        btn.textContent = e ? '✓ ' + EVENTS[btn.dataset.event] + ' ' + clock(new Date(e.occurred_at)) : { onset: 'It kicked in', strongest: 'At its strongest', wearing_off: 'Wearing off' }[btn.dataset.event];
      });
    } else if (last) {
      const days = Math.floor((now - new Date(last.taken_at)) / (24 * HOUR));
      piece(days, days === 1 ? 'day' : 'days');
      $('wSince').textContent = 'since the last dose you logged · ' + dayName(new Date(last.taken_at));
      phase.hidden = true;
      quick.hidden = true;
      note.push('Nothing logged today. Tap "Log a dose" to add it.');
    } else {
      piece('–', '');
      $('wSince').textContent = 'No doses logged yet.';
      phase.hidden = true;
      quick.hidden = true;
    }
    $('mLvlNote').textContent = note.join(' ');
  }

  function renderLevel(level) {
    const big = $('mLvl');
    big.replaceChildren();
    const band = $('mLvlBand');
    if (!level) { big.appendChild(make('b', '', '–')); band.hidden = true; $('mLvlSub').textContent = 'No level estimate yet.'; $('mMeter').hidden = true; return; }
    big.appendChild(make('b', '', String(Math.round(level.ng))));
    big.appendChild(make('small', '', S.curve.unit));
    const r = level.rel;
    band.textContent = r < 0.05 ? 'Almost none' : r < 0.35 ? 'Low' : r < 0.8 ? 'Moderate' : r <= 1.05 ? 'Around a ' + S.curve.reference_dose_mg + ' mg peak' : 'Above a ' + S.curve.reference_dose_mg + ' mg peak';
    band.hidden = false;
    $('mLvlSub').textContent = Math.round(r * 100) + '% of a ' + S.curve.reference_dose_mg + ' mg peak';
    const pct = Math.min(100, (r / 2) * 100);
    const meter = $('mMeter');
    meter.hidden = false;
    meter.querySelector('i').style.width = pct + '%';
    meter.querySelector('.m-scale-dot').style.left = pct + '%';
  }

  function levelAt(t) { return levelIn(S.curve, t); }
  function levelIn(data, t) {
    const pts = data.points;
    let best = pts[0];
    pts.forEach((p) => { if (Math.abs(new Date(p[0]) - t) < Math.abs(new Date(best[0]) - t)) best = p; });
    return { ng: best[1], rel: best[2] };
  }

  // ---- the curve ----------------------------------------------------------------------------------------------------
  let curveFresh = true;
  function drawCurve() { drawCurveInto($('mCurve'), S.curve, S.doses); }
  function drawCurveInto(wrap, data, doses) {
    if (!data) return;
    const fresh = wrap.id === 'mCurve' ? curveFresh : !wrap.dataset.drawn;
    const w = wrap.clientWidth - 28;
    const h = wrap.clientHeight - 26;
    if (w < 60 || h < 60) return;
    wrap.replaceChildren();
    const t0 = new Date(data.from).getTime();
    const t1 = new Date(data.to).getTime();
    const pts = data.points.map((p) => ({ t: new Date(p[0]).getTime(), ng: p[1], rel: p[2] }));
    const top = Math.max(1.1, ...pts.map((p) => p.rel)) * 1.05;
    const LEFT = 4;
    const BOTTOM = 22;
    const x = (t) => LEFT + ((t - t0) / (t1 - t0)) * (w - LEFT - 6);
    const y = (rel) => h - BOTTOM - (rel / top) * (h - BOTTOM - 10);
    const svg = svgEl('svg', { class: 'ha-svg' + (fresh ? ' fresh' : ''), width: w, height: h, viewBox: `0 0 ${w} ${h}` }, wrap);
    svg.style.margin = '0';

    // time ticks: every few hours for a day or so, at midnight (the weekday) for longer windows
    const long = t1 - t0 > 40 * HOUR;
    if (long) {
      const first = new Date(t0); first.setHours(24, 0, 0, 0);
      const weekly = t1 - t0 > 10 * 24 * HOUR; // for weeks-long windows label every seventh day with its date instead of every weekday
      for (let d = first, n = 0; d.getTime() <= t1; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1), n++) {
        const t = d.getTime();
        if (weekly && n % 7) continue;
        svgEl('line', { class: 'm-grid-line', x1: x(t), x2: x(t), y1: 4, y2: h - BOTTOM }, svg);
        svgEl('text', { class: 'm-axis', x: x(t), y: h - 6, 'text-anchor': 'middle' }, svg).textContent = weekly ? d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : d.toLocaleDateString(undefined, { weekday: 'short' });
      }
    } else {
      const step = (w < 560 ? 6 : 3) * HOUR;
      for (let t = Math.ceil(t0 / step) * step; t <= t1; t += step) {
        svgEl('line', { class: 'm-grid-line', x1: x(t), x2: x(t), y1: 4, y2: h - BOTTOM }, svg);
        svgEl('text', { class: 'm-axis', x: x(t), y: h - 6, 'text-anchor': 'middle' }, svg).textContent = new Date(t).toLocaleTimeString(undefined, { hour: 'numeric' });
      }
    }
    // the peak of one reference dose
    const gy = y(1);
    svgEl('line', { class: 'ha-goal', x1: 0, x2: w, y1: gy, y2: gy }, svg);
    svgEl('text', { class: 'ha-goal-text', x: 2, y: gy - 5 }, svg).textContent = data.reference_dose_mg + ' mg peak';

    const line = pts.map((p, i) => (i ? 'L' : 'M') + x(p.t).toFixed(1) + ' ' + y(p.rel).toFixed(1)).join('');
    svgEl('path', { class: 'ha-area', d: `${line}L${x(pts[pts.length - 1].t).toFixed(1)} ${h - BOTTOM}L${x(pts[0].t).toFixed(1)} ${h - BOTTOM}Z` }, svg);
    svgEl('path', { class: 'ha-path', d: line, pathLength: 1 }, svg);

    // now
    const now = Date.now();
    if (now >= t0 && now <= t1) {
      svgEl('line', { class: 'm-now', x1: x(now), x2: x(now), y1: 4, y2: h - BOTTOM }, svg);
      const here = levelIn(data, now);
      svgEl('circle', { class: 'ha-pulse', cx: x(now), cy: y(here.rel), r: 4.5 }, svg);
      svgEl('circle', { class: 'ha-last', cx: x(now), cy: y(here.rel), r: 4.5 }, svg);
      svgEl('text', { class: 'm-now-tag', x: Math.min(w - 26, Math.max(14, x(now))), y: 12, 'text-anchor': 'middle' }, svg).textContent = 'NOW';
    }
    // doses (a pink dot on the baseline) and the moments you marked (rings on the curve)
    doses.filter((d) => { const t = new Date(d.taken_at).getTime(); return t >= t0 && t <= t1; }).forEach((d) => {
      const tx = x(new Date(d.taken_at).getTime());
      svgEl('line', { class: 'm-dose-line', x1: tx, x2: tx, y1: y(0), y2: y(0) - 14 }, svg);
      svgEl('circle', { class: 'm-dose', cx: tx, cy: y(0), r: 6 }, svg);
      d.events.forEach((e) => {
        const et = new Date(e.occurred_at).getTime();
        if (et >= t0 && et <= t1) svgEl('circle', { class: 'm-ev', cx: x(et), cy: y(levelIn(data, et).rel), r: 4.5 }, svg);
      });
    });

    // hover / touch
    const guide = svgEl('line', { class: 'ha-guide', y1: 0, y2: h - BOTTOM }, svg);
    const dot = svgEl('circle', { class: 'ha-dot', r: 5 }, svg);
    const tip = make('div', 'ha-tip');
    wrap.appendChild(tip);
    let lastSpark = null;
    const show = (event) => {
      const px = event.clientX - svg.getBoundingClientRect().left;
      let best = pts[0];
      pts.forEach((p) => { if (Math.abs(x(p.t) - px) < Math.abs(x(best.t) - px)) best = p; });
      if (!svg.classList.contains('hover') || (lastSpark !== best && Math.abs(x(best.t) - x(lastSpark.t)) > 26)) { sparkAt(svg, x(best.t), y(best.rel)); lastSpark = best; }
      guide.setAttribute('x1', x(best.t));
      guide.setAttribute('x2', x(best.t));
      dot.setAttribute('cx', x(best.t));
      dot.setAttribute('cy', y(best.rel));
      svg.classList.add('hover');
      const when = new Date(best.t);
      tip.textContent = dayName(when) + ' ' + clock(when) + ' · about ' + best.ng.toFixed(data.decimals || 0) + ' ' + data.unit + ' · ' + Math.round(best.rel * 100) + '%';
      tip.classList.add('on');
      const half = tip.offsetWidth / 2;
      tip.style.left = Math.max(14, Math.min(w + 14 - 2 * half, x(best.t) + 14 - half)) + 'px';
      tip.style.top = Math.max(0, y(best.rel) - 32) + 'px';
    };
    svg.addEventListener('pointermove', show);
    svg.addEventListener('pointerdown', show);
    svg.addEventListener('pointerleave', () => { svg.classList.remove('hover'); tip.classList.remove('on'); lastSpark = null; });
    if (wrap.id === 'mCurve') curveFresh = false;
    wrap.dataset.drawn = '1';
  }

  // little four-point stars that pop out of a hovered point
  const STAR = 'M0,-1 C.15,-.3 .3,-.15 1,0 C.3,.15 .15,.3 0,1 C-.15,.3 -.3,.15 -1,0 C-.3,-.15 -.15,-.3 0,-1Z';
  function sparkAt(svg, cx, cy) {
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    for (let n = 0; n < 6; n++) {
      const ang = (Math.PI * 2 * n) / 6 + Math.random() * 0.8;
      const dist = 14 + Math.random() * 16;
      const holder = svgEl('g', { transform: 'translate(' + cx + ' ' + cy + ')' }, svg);
      const star = svgEl('path', { class: 'm-spark' + (n % 2 ? ' alt' : ''), d: STAR }, holder);
      star.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
      star.style.setProperty('--dy', Math.sin(ang) * dist + 'px');
      star.style.setProperty('--s', (3 + Math.random() * 3.5).toFixed(1));
      star.style.animationDelay = n * 30 + 'ms';
      star.addEventListener('animationend', () => holder.remove());
    }
  }

  // ---- stars trail the pointer across the whole page ---------------------------------------------------------------------
  function sparkTrail() {
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const layer = document.createElement('div');
    layer.className = 'm-trail';
    document.body.appendChild(layer);
    const LIGHT_BG = ['var(--pink)', 'var(--ultra)', '#fffdf6'];
    const DARK_BG = ['var(--pink)', 'var(--lime)', 'var(--eggshell)'];
    let last = 0, lx = -99, ly = -99;
    document.addEventListener('pointermove', (event) => {
      if (event.pointerType === 'touch') return;
      const now = performance.now();
      if (now - last < 55 || Math.hypot(event.clientX - lx, event.clientY - ly) < 18) return;
      const target = event.target;
      if (target.closest && target.closest('dialog, input, button, .ha-tip')) return;
      last = now; lx = event.clientX; ly = event.clientY;
      const surface = target.closest ? target.closest('.h-card, .m-banner') : null;
      let dark = false;
      if (surface) {
        const m = getComputedStyle(surface).backgroundColor.match(/\d+(\.\d+)?/g);
        if (m) dark = (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]) < 110;
      }
      const colors = dark ? DARK_BG : LIGHT_BG;
      const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      s.setAttribute('viewBox', '-1 -1 2 2');
      s.setAttribute('class', 'm-bs');
      s.innerHTML = '<path d="' + STAR + '"/>';
      const size = 12 + Math.random() * 16;
      s.style.cssText = 'left:' + event.clientX + 'px;top:' + event.clientY + 'px;width:' + size + 'px;height:' + size + 'px;color:' + colors[Math.floor(Math.random() * 3)] +
        ';--dx:' + (Math.random() * 40 - 20).toFixed(0) + 'px;--dy:' + (Math.random() * 30 - 8).toFixed(0) + 'px';
      s.addEventListener('animationend', () => s.remove());
      layer.appendChild(s);
    });
  }

  // ---- medication jump buttons ----------------------------------------------------------------------------------------
  let currentSec = SLUG;
  function jumpNav() {
    const links = [...document.querySelectorAll('.m-jump a')];
    const mark = (id) => { currentSec = id; links.forEach((a) => a.setAttribute('aria-current', String(a.dataset.sec === id))); };
    links.forEach((a) => a.addEventListener('click', (event) => {
      event.preventDefault();
      const target = document.getElementById(a.dataset.sec);
      if (!target) return;
      mark(a.dataset.sec);
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      try { history.replaceState(null, '', '#' + a.dataset.sec); } catch (e) { /* ignore */ }
    }));
    window.addEventListener('scroll', () => {
      let current = links[0].dataset.sec;
      links.forEach((a) => { const el = document.getElementById(a.dataset.sec); if (el && el.getBoundingClientRect().top < window.innerHeight * 0.4) current = a.dataset.sec; });
      mark(current);
    }, { passive: true });
  }

  // ---- Ritalina and Lithium: last dose, a few numbers, and the log -----------------------------------------------------------
  const OTHERS = ['ritalina', 'lithium', 'mounjaro', 'roacutan'];
  const X = {};
  async function loadOthers() {
    await Promise.all(OTHERS.map(async (slug) => {
      const [overview, doses] = await Promise.all([
        api('/v1/meds/' + slug + '/overview?tz=' + TZ),
        api('/v1/meds/' + slug + '/doses?limit=200'),
      ]);
      const [before, after] = overview.med.window_hours || [18, 14];
      const now = Date.now();
      const curve = await api('/v1/meds/' + slug + '/curve?from=' + encodeURIComponent(new Date(now - before * HOUR).toISOString()) +
        '&to=' + encodeURIComponent(new Date(now + after * HOUR).toISOString()) + '&step=' + (overview.med.step_minutes || 10)).catch(() => null);
      X[slug] = { overview, doses, curve, shown: X[slug] ? X[slug].shown : 6 };
      renderOther(slug);
    }));
  }
  function bigSince(ms) {
    const mins = Math.max(0, Math.floor(ms / MIN));
    if (mins < 60) return [String(mins), 'm', '', ''];
    const hours = Math.floor(mins / 60);
    if (hours < 48) return [String(hours), 'h', String(mins % 60), 'm'];
    return [String(Math.floor(hours / 24)), 'd', String(hours % 24), 'h'];
  }
  // the same level curve as Venvanse, for the medications that have a model
  function bandFor(r, data, buildsUp) {
    if (buildsUp && r > 1.05) return 'Built up from several doses';
    return r < 0.05 ? 'Almost none' : r < 0.35 ? 'Low' : r < 0.8 ? 'Moderate' : r <= 1.05 ? 'Around a ' + data.reference_dose_mg + ' mg peak' : 'Above a ' + data.reference_dose_mg + ' mg peak';
  }
  function curveCard(slug, st) {
    const data = st.curve;
    const o = st.overview;
    const card = make('article', 'h-card grain m-today m-xcurve');
    const long = (o.med.window_hours || [18])[0] > 40;
    const weeks = (o.med.window_hours || [18])[0] > 240;
    const h2 = make('h2', '', (weeks ? 'Level, last few weeks' : long ? 'Level, last few days' : o.med.name + ' today') + ' ');
    const info = make('button', 'h-info', 'i');
    info.type = 'button';
    info.setAttribute('aria-label', 'What is this curve?');
    info.setAttribute('aria-expanded', 'false');
    info.setAttribute('aria-controls', 'xp-' + slug);
    h2.appendChild(info);
    card.appendChild(h2);
    const pop = make('div', 'h-pop m-pop');
    pop.id = 'xp-' + slug;
    pop.setAttribute('role', 'tooltip');
    pop.appendChild(make('b', '', 'What is this curve?'));
    pop.appendChild(make('p', '', 'This line is a guess of how much ' + o.med.name + ' is in your body: it climbs after a dose, then slides down' + (long ? ', and a slow medicine like this one piles up over ' + (weeks ? 'weeks.' : 'days.') : '.')));
    card.appendChild(pop);
    const grid = make('div', 'm-today-grid');
    const left = make('div', 'm-today-left');
    const level = levelIn(data, Date.now());
    const big = make('p', 'm-since');
    big.appendChild(make('b', '', level.ng.toFixed(data.decimals || 0)));
    big.appendChild(make('small', '', data.unit));
    left.appendChild(big);
    left.appendChild(make('p', 'h-when', data.unit === 'mg' ? 'combined from your recent doses · estimated right now' : Math.round(level.rel * 100) + '% of a ' + data.reference_dose_mg + ' mg peak · estimated right now'));
    left.appendChild(make('p', 'm-phase', bandFor(level.rel, data, long)));
    const lastDose = o.last_dose;
    if (o.med.tracks_events && lastDose && Date.now() - new Date(lastDose.taken_at) < 24 * HOUR) {
      const logged = new Map(((st.doses[0] && st.doses[0].id === lastDose.id ? st.doses[0].events : []) || []).map((e) => [e.type, e]));
      const quick = make('div', 'm-quick');
      [['onset', 'It kicked in'], ['strongest', 'At its strongest'], ['wearing_off', 'Wearing off']].forEach(([type, label]) => {
        const e = logged.get(type);
        const btn = make('button', e ? 'done' : '', e ? '✓ ' + EVENTS[type] + ' ' + clock(new Date(e.occurred_at)) : label);
        btn.type = 'button';
        btn.addEventListener('click', async () => {
          try {
            await api('/v1/meds/doses/' + lastDose.id + '/events', { method: 'POST', body: { event_type: type } });
            toast('Saved');
            await loadOthers();
          } catch (err) { toast(err.message); }
        });
        quick.appendChild(btn);
      });
      left.appendChild(quick);
    }
    grid.appendChild(left);
    const chart = make('div', 'ha-line m-curve');
    chart.setAttribute('role', 'img');
    chart.setAttribute('aria-label', 'Estimated level of ' + o.med.name + ' over time');
    grid.appendChild(chart);
    card.appendChild(grid);
    wireInfo(info);
    requestAnimationFrame(() => {
      drawCurveInto(chart, data, st.doses);
      if (window.ResizeObserver) new ResizeObserver(() => drawCurveInto(chart, data, st.doses)).observe(chart);
    });
    return card;
  }

  function renderOther(slug) {
    if (slug === 'lithium') return; // the Lithium section has its own overview; only its dose data is kept for the log dialog
    const root = $('x-' + slug);
    const st = X[slug];
    const o = st.overview;
    root.replaceChildren();
    if (st.curve) root.appendChild(curveCard(slug, st));
    const last = make('article', 'h-card grain m-xlast');
    last.appendChild(make('h3', '', 'Last dose'));
    if (o.last_dose) {
      const taken = new Date(o.last_dose.taken_at);
      const [a, au, b, bu] = bigSince(Date.now() - taken);
      const big = make('div', 'm-since');
      big.appendChild(make('b', '', a));
      big.appendChild(make('small', '', au));
      if (b) { big.appendChild(make('b', '', b)); big.appendChild(make('small', '', bu)); }
      last.appendChild(big);
      last.appendChild(make('p', 'm-phase m-xpill', o.last_dose.dose_mg + ' mg · ' + dayName(taken) + ' · ' + clock(taken)));
      if (o.med.interval_days) {
        // weekly medicines: say when the next one is due
        const left = Math.ceil((taken.getTime() + o.med.interval_days * 24 * HOUR - Date.now()) / (24 * HOUR));
        last.appendChild(make('p', 'm-phase m-xpill', left > 1 ? 'Next dose in ' + left + ' days' : left === 1 ? 'Next dose tomorrow' : left === 0 ? 'Next dose is due today' : Math.abs(left) + (Math.abs(left) === 1 ? ' day' : ' days') + ' past the usual day'));
      }
    } else {
      last.appendChild(make('p', 'm-xsub', 'No doses logged yet.'));
    }
    const stats = make('ul', 'm-stats');
    [['Total logged', String(o.total_doses), 'doses'], ['Last 30 days', String(o.days_taken_30), 'days'], ['Streak', String(o.streak), o.streak === 1 ? 'day' : 'days']].forEach(([k, v, u]) => {
      const li = make('li', 'm-stat');
      li.appendChild(make('span', '', k));
      const bold = make('b', '', v);
      bold.appendChild(make('small', '', u));
      li.appendChild(bold);
      stats.appendChild(li);
    });
    if (!o.med.compact) last.appendChild(stats);
    // one small square per day for the last 14 days, filled where a dose was logged
    const byDay = new Map(o.days30.map((d) => [d.day, d.doses]));
    const strip = make('div', 'm-strip');
    strip.setAttribute('role', 'img');
    strip.setAttribute('aria-label', 'Which of the last 14 days you logged a dose');
    const pad = (n) => String(n).padStart(2, '0');
    const now = new Date();
    for (let i = 13; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const key = date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
      const n = (byDay.get(key) || []).length;
      const tile = make('div', 'm-tile' + (n ? ' on' : '') + (i === 0 ? ' now' : ''), String(date.getDate()));
      tile.style.setProperty('--i', 13 - i);
      tile.title = date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }) + (n ? ' · ' + n + (n === 1 ? ' dose' : ' doses') : ' · no dose');
      strip.appendChild(tile);
    }
    const stripBox = make('div', 'm-xstrip');
    stripBox.appendChild(make('h4', 'm-xlbl', 'Last 14 days'));
    stripBox.appendChild(strip);
    if (!o.med.compact) last.appendChild(stripBox);
    root.appendChild(last);

    if (o.med.compact) {
      // the totals live in their own card; no history list
      const tally = make('article', 'h-card grain m-xtally');
      tally.appendChild(make('h3', '', 'Your doses'));
      tally.appendChild(stats);
      tally.appendChild(stripBox);
      if (o.first_dose) tally.appendChild(make('p', 'm-xsub', 'since ' + new Date(o.first_dose).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })));
      root.appendChild(tally);
      if (!o.med.tracks_events) return;
    }

    if (o.med.tracks_events) {
      // the moments you mark replace the history list for these medications
      const card = make('article', 'h-card grain m-works' + (o.med.compact ? ' m-xwide' : ''));
      const h2 = make('h2', '', 'How it works for you ');
      const info = make('button', 'h-info', 'i');
      info.type = 'button';
      info.setAttribute('aria-label', 'Where do these times come from?');
      info.setAttribute('aria-expanded', 'false');
      info.setAttribute('aria-controls', 'wp-' + slug);
      h2.appendChild(info);
      card.appendChild(h2);
      const pop = make('div', 'h-pop m-pop');
      pop.id = 'wp-' + slug;
      pop.setAttribute('role', 'tooltip');
      pop.appendChild(make('b', '', 'Where do these come from?'));
      pop.appendChild(make('p', '', 'These are your own times: how long after a dose it started, was strongest, and faded away.'));
      card.appendChild(pop);
      const list = make('ul', 'm-works-list');
      worksList(list, o);
      card.appendChild(list);
      wireInfo(info);
      root.appendChild(card);
      return;
    }
    const hist = make('article', 'h-card grain m-xhist');
    hist.appendChild(make('h3', '', 'History'));
    const list = make('ul', 'm-hist');
    st.doses.slice(0, st.shown).forEach((d) => list.appendChild(doseRow(d)));
    if (!st.doses.length) list.appendChild(make('li', 'm-xsub', 'Nothing logged yet. Use Log a dose.'));
    hist.appendChild(list);
    if (st.shown < st.doses.length) {
      const more = make('button', 'm-more', 'Show older doses');
      more.type = 'button';
      more.addEventListener('click', () => { st.shown += 6; renderOther(slug); });
      hist.appendChild(more);
    }
    root.appendChild(hist);
  }
  async function reloadAll() { await Promise.all([load(), loadOthers()]); }

  // ---- how it works for you -------------------------------------------------------------------------------------------
  // how many doses you usually take in a day (for medications taken more than once a day)
  function dailyCountRow(o) {
    const counts = o.days30.map((d) => d.doses.length).sort((a, b) => a - b);
    const q = (p) => { const i = (counts.length - 1) * p; const lo = Math.floor(i); return counts[lo] + (counts[Math.min(lo + 1, counts.length - 1)] - counts[lo]) * (i - lo); };
    const li = make('li', 'm-w m-w-count');
    const left = make('div', 'm-w-l');
    left.appendChild(make('span', 'm-w-name', 'Doses per day'));
    const right = make('div', 'm-w-r');
    if (!counts.length) {
      right.appendChild(make('span', 'm-w-note', 'No doses logged in the last 30 days.'));
      li.append(left, right);
      return li;
    }
    const median = q(0.5), p25 = q(0.25), p75 = q(0.75);
    const max = Math.max(4, counts[counts.length - 1]);
    const val = make('b', 'm-w-val', Number.isInteger(median) ? String(median) : median.toFixed(1));
    left.append(val, make('small', 'm-w-after', 'on days you take it'));
    const range = make('span', 'm-w-range');
    range.setAttribute('aria-hidden', 'true');
    const seg = make('i');
    seg.style.left = (p25 / max) * 100 + '%';
    seg.style.width = Math.max(2.5, ((p75 - p25) / max) * 100) + '%';
    const mid = make('b');
    mid.style.left = (median / max) * 100 + '%';
    range.append(seg, mid);
    const ticks = make('div', 'm-w-ticks m-w-nums');
    ticks.setAttribute('aria-hidden', 'true');
    for (let n = 0; n <= max; n++) ticks.appendChild(make('span', '', String(n)));
    const pad = (n) => String(n).padStart(2, '0');
    const t = new Date();
    const key = t.getFullYear() + '-' + pad(t.getMonth() + 1) + '-' + pad(t.getDate());
    const today = (o.days30.find((d) => d.day === key) || { doses: [] }).doses.length;
    const lo = Math.round(p25), hi = Math.round(p75);
    const spread = lo === hi ? 'Most days: ' + lo + (lo === 1 ? ' dose' : ' doses') : 'Half of your days: ' + lo + ' to ' + hi + ' doses';
    right.append(range, ticks, make('span', 'm-w-note', spread + ' · today: ' + today + ' so far.'), make('span', 'm-w-n', 'from ' + counts.length + ' days with doses'));
    li.append(left, right);
    return li;
  }
  function works() { worksList($('mWorks'), S.overview); }
  function worksList(list, o) {
    list.replaceChildren();
    if (o.med.daily_doses) list.appendChild(dailyCountRow(o));
    const MAX = o.med.timeline_minutes || 540; // the track runs from the dose to nine hours after it (six for Ritalina)
    [['onset', 'Kicks in'], ['strongest', 'Strongest'], ['wearing_off', 'Wearing off']].forEach(([key, label]) => {
      const t = o.timing[key];
      const li = make('li', 'm-w');
      const left = make('div', 'm-w-l');
      left.appendChild(make('span', 'm-w-name', label));
      const right = make('div', 'm-w-r');
      if (!t.n) {
        right.appendChild(make('span', 'm-w-note', 'Not enough marks yet.'));
        li.append(left, right);
        list.appendChild(li);
        return;
      }
      const val = make('b', 'm-w-val', dur(t.median));
      left.append(val, make('small', 'm-w-after', 'after the dose'));
      const range = make('span', 'm-w-range');
      range.setAttribute('aria-hidden', 'true');
      const seg = make('i');
      // keep everything on the track even when a few marks were logged long after the dose
      const a = Math.min(97, (t.p25 / MAX) * 100);
      const bEnd = Math.min(100, (t.p75 / MAX) * 100);
      seg.style.left = a + '%';
      seg.style.width = Math.max(2.5, bEnd - a) + '%';
      const mid = make('b');
      mid.style.left = Math.min(98, (t.median / MAX) * 100) + '%';
      range.append(seg, mid);
      right.append(range, make('span', 'm-w-note', 'Half of your doses land between ' + dur(t.p25) + ' and ' + dur(t.p75) + '.'), make('span', 'm-w-n', 'from ' + t.n + ' doses'));
      li.append(left, right);
      list.appendChild(li);
    });
    const axis = make('li', 'm-w-axis');
    axis.setAttribute('aria-hidden', 'true');
    axis.appendChild(make('span', ''));
    const ticks = make('div', 'm-w-ticks');
    ['dose', MAX / 180 + 'h', MAX / 90 + 'h', MAX / 60 + 'h'].forEach((x) => ticks.appendChild(make('span', '', x)));
    axis.appendChild(ticks);
    list.appendChild(axis);
  }

  // ---- last 30 days -----------------------------------------------------------------------------------------------------
  let dotsFresh = true;
  function month() {
    const o = S.overview;
    set('vDays', o.days_taken_30);
    $('wDays').textContent = o.days_taken_30 ? 'days with a dose logged' : 'No doses logged in the last 30 days.';
    const stats = $('mMonthPills');
    stats.replaceChildren();
    const items = [];
    if (o.avg_first_dose_minute != null) items.push(['Usually', minuteClock(o.avg_first_dose_minute)]);
    items.push(['Streak', String(o.streak), o.streak === 1 ? 'day' : 'days']);
    items.push(['Total logged', String(o.total_doses), 'doses']);
    items.forEach(([name, value, unit], i) => {
      const li = make('li', 'm-stat');
      li.style.setProperty('--i', i);
      li.appendChild(make('span', '', name));
      const b = make('b', '', value);
      if (unit) b.appendChild(make('small', '', unit));
      li.appendChild(b);
      stats.appendChild(li);
    });
    tiles();
    drawDots();
  }

  // one square per day for the last 30 local days, oldest first
  function tiles() {
    const byDay = new Map(S.overview.days30.map((d) => [d.day, d.doses]));
    const root = $('mTiles');
    root.replaceChildren();
    const pad = (n) => String(n).padStart(2, '0');
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
      const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      const key = date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
      const doses = byDay.get(key) || [];
      const first = doses.length ? Math.min(...doses.map((x) => x.minute)) : null;
      const tile = make('div', 'm-tile' + (doses.length ? ' on' : '') + (i === 0 ? ' now' : ''));
      tile.style.setProperty('--i', 29 - i);
      tile.title = date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }) + (doses.length ? ' · ' + doses.map((x) => minuteClock(x.minute) + ' ' + x.mg + ' mg').join(', ') : ' · no dose');
      tile.appendChild(make('span', 'm-tile-d', String(date.getDate())));
      if (first != null) tile.appendChild(make('span', 'm-tile-t', minuteClock(first)));
      if (doses.length > 1) tile.appendChild(make('i', 'm-tile-x'));
      root.appendChild(tile);
    }
  }
  const set = (id, text) => { $(id).textContent = text; };

  function drawDots() {
    const wrap = $('mDots');
    const o = S.overview;
    if (!o) return;
    const w = wrap.clientWidth - 28;
    const h = wrap.clientHeight - 26;
    if (w < 60 || h < 60) return;
    wrap.replaceChildren();
    const days = o.days30;
    const minutes = days.flatMap((d) => d.doses.map((x) => x.minute));
    if (!minutes.length) return;
    const lo = Math.max(0, Math.floor((Math.min(...minutes) - 45) / 120) * 120);
    const hi = Math.min(1440, Math.ceil((Math.max(...minutes) + 45) / 120) * 120);
    const LEFT = 34;
    const x = (i) => LEFT + (i / 29) * (w - LEFT - 8);
    const y = (m) => 8 + ((m - lo) / (hi - lo || 1)) * (h - 24);
    const svg = svgEl('svg', { class: 'ha-svg' + (dotsFresh ? ' fresh' : ''), width: w, height: h, viewBox: `0 0 ${w} ${h}` }, wrap);
    svg.style.margin = '0';
    for (let m = lo; m <= hi; m += 120) {
      svgEl('line', { class: 'm-grid-line', x1: LEFT, x2: w, y1: y(m), y2: y(m) }, svg);
      svgEl('text', { class: 'm-axis', x: LEFT - 6, y: y(m) + 3.5, 'text-anchor': 'end' }, svg).textContent = minuteClock(m);
    }
    const today = new Date();
    const keyIndex = new Map();
    for (let i = 0; i < 30; i++) {
      const d = new Date(today.getTime() - (29 - i) * 24 * HOUR);
      keyIndex.set(dayKey(d), { i, d });
    }
    const all = [];
    days.forEach((day) => {
      const slot = keyIndex.get(day.day);
      if (!slot) return;
      day.doses.forEach((dose) => all.push({ cx: x(slot.i), cy: y(dose.minute), d: slot.d, minute: dose.minute, mg: dose.mg, today: slot.i === 29 }));
    });
    all.forEach((p, n) => {
      const c = svgEl('circle', { class: 'm-dot' + (p.today ? ' today' : ''), cx: p.cx, cy: p.cy, r: 5 }, svg);
      c.style.animationDelay = (n * 25) + 'ms';
    });
    // weekday letters under every seventh day
    for (let i = 7; i < 30; i += 7) {
      const slot = [...keyIndex.values()].find((s) => s.i === i);
      svgEl('text', { class: 'm-axis', x: x(i), y: h - 4, 'text-anchor': 'middle' }, svg).textContent = slot.d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    }
    const tip = make('div', 'ha-tip');
    wrap.appendChild(tip);
    const ring = svgEl('circle', { class: 'm-dot-ring', r: 9, opacity: 0 }, svg);
    let sparked = null;
    svg.addEventListener('pointermove', (event) => {
      const box = svg.getBoundingClientRect();
      const px = event.clientX - box.left;
      const py = event.clientY - box.top;
      let best = null;
      all.forEach((p) => { const dist = Math.hypot(p.cx - px, p.cy - py); if (!best || dist < best.dist) best = { p, dist }; });
      if (!best || best.dist > 28) { ring.setAttribute('opacity', 0); tip.classList.remove('on'); sparked = null; return; }
      ring.setAttribute('cx', best.p.cx);
      ring.setAttribute('cy', best.p.cy);
      if (sparked !== best.p) { sparked = best.p; sparkAt(svg, best.p.cx, best.p.cy); }
      ring.setAttribute('opacity', 1);
      tip.textContent = dayName(best.p.d) + ' · ' + minuteClock(best.p.minute) + ' · ' + best.p.mg + ' mg';
      tip.classList.add('on');
      const half = tip.offsetWidth / 2;
      tip.style.left = Math.max(14, Math.min(w + 14 - 2 * half, best.p.cx + 14 - half)) + 'px';
      tip.style.top = Math.max(0, best.p.cy - 32) + 'px';
    });
    svg.addEventListener('pointerleave', () => { ring.setAttribute('opacity', 0); tip.classList.remove('on'); sparked = null; });
    dotsFresh = false;
  }

  // ---- check-ins ---------------------------------------------------------------------------------------------------------
  function checkins() {
    const all = S.doses.flatMap((d) => d.checkins);
    const card = $('cCheckins');
    card.hidden = !all.length;
    if (!all.length) return;
    const list = $('mMeters');
    list.replaceChildren();
    [['task_initiation', 'Task initiation'], ['motivation', 'Motivation'], ['focus', 'Focus'], ['task_switching', 'Task switching']].forEach(([key, label]) => {
      const values = all.map((c) => c[key]).filter((v) => v != null);
      if (!values.length) return;
      const avg = values.reduce((s, v) => s + v, 0) / values.length;
      const li = make('li', 'bv-tile');
      li.appendChild(make('span', 'bv-name', label));
      const val = make('b', 'bv-val', avg.toFixed(1));
      val.appendChild(make('small', '', '/ 5'));
      li.appendChild(val);
      const meter = make('span', 'bv-meter');
      meter.setAttribute('aria-hidden', 'true');
      const fill = make('i');
      fill.style.setProperty('--w', (avg / 5) * 100 + '%');
      meter.appendChild(fill);
      li.appendChild(meter);
      list.appendChild(li);
    });
    const counts = new Map();
    all.forEach((c) => { if (c.was_enough) counts.set(c.was_enough, (counts.get(c.was_enough) || 0) + 1); });
    const pills = $('mEnough');
    pills.replaceChildren();
    [...counts.entries()].sort((a, b) => b[1] - a[1]).forEach(([key, n], i) => {
      const li = make('li');
      li.style.setProperty('--i', i);
      li.append((ENOUGH[key] || key.replace(/_/g, ' ')) + ' ');
      li.appendChild(make('b', '', '×' + n));
      pills.appendChild(li);
    });
  }

  // ---- history ---------------------------------------------------------------------------------------------------------
  function doseRow(d) {
    const taken = new Date(d.taken_at);
    const li = make('li', 'm-row');
    const when = make('div', 'm-row-when', dayName(taken) + ' · ' + clock(taken));
    when.appendChild(make('span', '', agoText(Date.now() - taken)));
    li.appendChild(when);
    const del = make('button', 'm-del', 'Delete');
    del.type = 'button';
    let armed = 0;
    del.addEventListener('click', async () => {
      if (!armed) {
        armed = setTimeout(() => { armed = 0; del.classList.remove('sure'); del.textContent = 'Delete'; }, 4000);
        del.classList.add('sure');
        del.textContent = 'Sure?';
        return;
      }
      clearTimeout(armed);
      try {
        await api('/v1/meds/doses/' + d.id, { method: 'DELETE' });
        toast('Dose deleted');
        await reloadAll();
      } catch (e) { toast(e.message); }
    });
    li.appendChild(del);
    const chips = make('div', 'm-row-chips');
    chips.appendChild(make('span', 'm-chip mg', d.dose_mg + ' mg'));
    if (d.food_state) chips.appendChild(make('span', 'm-chip src', d.food_state === 'fasted' ? 'fasted' : 'with food'));
    d.events.forEach((e) => {
      const minutes = (new Date(e.occurred_at) - taken) / MIN;
      chips.appendChild(make('span', 'm-chip ev', EVENTS[e.type] + ' +' + dur(minutes)));
    });
    if (d.checkins.length) chips.appendChild(make('span', 'm-chip ev', 'check-in'));
    chips.appendChild(make('span', 'm-chip src', SOURCES[d.source] || d.source));
    li.appendChild(chips);
    return li;
  }


  // ---- the "log a dose" dialog -----------------------------------------------------------------------------------------
  const localInput = (date) => {
    const pad = (n) => String(n).padStart(2, '0');
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + 'T' + pad(date.getHours()) + ':' + pad(date.getMinutes());
  };
  // custom calendar for "when": same look as the diary's (month grid, dots on days you logged), plus a time field
  const cal = { when: new Date(), month: new Date() };
  function setWhen(date, closeCal) {
    cal.when = date;
    $('logTime').value = localInput(date);
    $('whenText').textContent = dayName(date) + ' · ' + clock(date);
    if (closeCal) { $('logCal').hidden = true; $('whenBtn').setAttribute('aria-expanded', 'false'); }
    renderCal();
    renderTime();
  }
  function renderTime() {
    const now = new Date();
    const w = cal.when;
    const sameDay = w.getFullYear() === now.getFullYear() && w.getMonth() === now.getMonth() && w.getDate() === now.getDate();
    const pick = (hh, mm) => { const next = new Date(w); next.setHours(hh, mm, 0, 0); setWhen(next > now ? now : next); };
    const hours = [];
    for (let hh = 0; hh < 24; hh++) {
      const b = make('button', 'm-dayb' + (hh === w.getHours() ? ' sel' : ''), String(hh).padStart(2, '0'));
      b.type = 'button';
      b.disabled = sameDay && hh > now.getHours();
      b.setAttribute('aria-pressed', String(hh === w.getHours()));
      b.addEventListener('click', () => pick(hh, w.getMinutes()));
      hours.push(b);
    }
    $('hourGrid').replaceChildren(...hours);
    const mins = [];
    for (let mm = 0; mm < 60; mm += 5) {
      const on = mm === w.getMinutes();
      const b = make('button', 'm-dayb' + (on ? ' sel' : ''), String(mm).padStart(2, '0'));
      b.type = 'button';
      b.disabled = sameDay && (w.getHours() > now.getHours() || (w.getHours() === now.getHours() && mm > now.getMinutes()));
      b.setAttribute('aria-pressed', String(on));
      b.addEventListener('click', () => pick(w.getHours(), mm));
      mins.push(b);
    }
    $('minGrid').replaceChildren(...mins);
  }
  function loggedDays() {
    const src = logMed === SLUG ? S.doses : ((X[logMed] && X[logMed].doses) || []);
    return new Set(src.map((d) => { const t = new Date(d.taken_at); return t.getFullYear() + '-' + t.getMonth() + '-' + t.getDate(); }));
  }
  function renderCal() {
    const m = cal.month, y = m.getFullYear(), mo = m.getMonth();
    $('calTitle').textContent = m.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const lead = (new Date(y, mo, 1).getDay() + 6) % 7; // weeks start on Monday
    const total = new Date(y, mo + 1, 0).getDate();
    const logged = loggedDays();
    const now = new Date();
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push(make('span', 'm-pad'));
    for (let d = 1; d <= total; d++) {
      const date = new Date(y, mo, d);
      const key = y + '-' + mo + '-' + d;
      const isSel = cal.when.getFullYear() === y && cal.when.getMonth() === mo && cal.when.getDate() === d;
      const isToday = now.getFullYear() === y && now.getMonth() === mo && now.getDate() === d;
      const future = date > new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const b = make('button', 'm-dayb' + (logged.has(key) ? ' has' : '') + (isToday ? ' today' : '') + (isSel ? ' sel' : ''), String(d));
      b.type = 'button';
      b.disabled = future;
      b.setAttribute('aria-pressed', String(isSel));
      b.setAttribute('aria-label', date.toLocaleDateString(undefined, { day: 'numeric', month: 'long' }) + (logged.has(key) ? ', dose logged' : ''));
      b.addEventListener('click', () => {
        const next = new Date(cal.when);
        next.setFullYear(y, mo, d);
        if (next > new Date()) { const n = new Date(); next.setHours(n.getHours(), n.getMinutes()); }
        setWhen(next);
      });
      cells.push(b);
    }
    $('calGrid').replaceChildren(...cells);
    $('calNext').disabled = new Date(y, mo + 1, 1) > now;
  }
  function wireCalendar() {
    $('whenBtn').addEventListener('click', () => {
      const open = $('logCal').hidden;
      $('logCal').hidden = !open;
      $('whenBtn').setAttribute('aria-expanded', String(open));
      if (open) { cal.month = new Date(cal.when.getFullYear(), cal.when.getMonth(), 1); renderCal(); }
    });
    $('calPrev').addEventListener('click', () => { cal.month = new Date(cal.month.getFullYear(), cal.month.getMonth() - 1, 1); renderCal(); });
    $('calNext').addEventListener('click', () => { cal.month = new Date(cal.month.getFullYear(), cal.month.getMonth() + 1, 1); renderCal(); });
  }

  let chosen = { mg: 30, food: null };

  function radioChips(container, items, current, onPick) {
    container.replaceChildren();
    items.forEach(([value, label]) => {
      const btn = make('button', '', label);
      btn.type = 'button';
      btn.setAttribute('role', 'radio');
      btn.setAttribute('aria-checked', String(value === current));
      btn.addEventListener('click', () => {
        const again = btn.getAttribute('aria-checked') === 'true';
        const next = again && container.id === 'foodChips' ? null : value; // food can be unset again
        onPick(next);
        container.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-checked', String(items[i][0] === next)));
      });
      container.appendChild(btn);
    });
  }

  // the medication tabs in the log dialog: each medication has its own dose choices
  let logMed = SLUG;
  function pickLogMed(med) {
    logMed = med;
    document.querySelectorAll('#logTabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.med === med)));
    const o = med === SLUG ? S.overview : (X[med] && X[med].overview);
    const presets = ((o && o.med.presets) || []).slice();
    const last = o && o.last_dose && o.last_dose.dose_mg;
    chosen.mg = presets.includes(last) ? last : (med === SLUG ? (o && o.med.reference_dose_mg) || presets[0] : presets[0]);
    radioChips($('doseChips'), presets.map((n) => [n, String(n)]), chosen.mg, (v) => { chosen.mg = v; $('logBig').textContent = v; });
    $('logBig').textContent = chosen.mg;
    $('doseChips').parentElement.hidden = presets.length < 2; // a single dose needs no picker
    $('logErr').hidden = true;
    $('logSave').disabled = false;
    if ($('calGrid') && !$('logCal').hidden) renderCal();
  }
  function openLog() {
    chosen = { mg: null, food: null };
    radioChips($('foodChips'), [['fasted', 'Fasted'], ['fed', 'With food']], null, (v) => { chosen.food = v; });
    pickLogMed(OTHERS.includes(currentSec) ? currentSec : SLUG);
    $('logCal').hidden = true;
    $('whenBtn').setAttribute('aria-expanded', 'false');
    cal.month = new Date();
    setWhen(new Date());
    $('logDialog').showModal();
  }
  async function saveLog(event) {
    event.preventDefault();
    const err = $('logErr');
    err.hidden = true;
    const when = new Date($('logTime').value);
    if (Number.isNaN(when.getTime())) { err.textContent = 'Pick the time you took it.'; err.hidden = false; return; }
    if (when.getTime() > Date.now() + 5 * MIN) { err.textContent = 'That time is in the future.'; err.hidden = false; return; }
    const body = { dose_mg: chosen.mg };
    // "Now" is stamped by the server, so the log matches the moment you actually saved.
    if (Math.abs(Date.now() - when.getTime()) > 2 * MIN) body.taken_at = when.toISOString();
    if (chosen.food) body.food_state = chosen.food;
    $('logSave').disabled = true;
    try {
      await api('/v1/meds/' + logMed + '/doses', { method: 'POST', body });
      $('logDialog').close();
      toast('Dose logged');
      await reloadAll();
    } catch (e) {
      err.textContent = e.message;
      err.hidden = false;
      $('logSave').disabled = false;
    }
  }

  async function markEvent(type) {
    const last = S.overview && S.overview.last_dose;
    if (!last) return;
    try {
      await api('/v1/meds/doses/' + last.id + '/events', { method: 'POST', body: { event_type: type } });
      toast('Saved');
      await load();
    } catch (e) { toast(e.message); }
  }

  // ---- info buttons (hover previews, click pins, Escape / outside click closes) ------------------------------------------
  const infoClosers = new Set();
  function wireInfo(btn) {
    // the popup is looked up when it is needed: the card may not be in the page yet when this is called
    const getPop = () => document.getElementById(btn.getAttribute('aria-controls'));
    let pinned = false;
    const show = (open) => { const pop = getPop(); if (pop) pop.classList.toggle('on', open); btn.setAttribute('aria-expanded', String(open)); };
    btn.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') show(true); });
    btn.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !pinned) show(false); });
    btn.addEventListener('focus', () => { if (btn.matches(':focus-visible')) show(true); });
    btn.addEventListener('blur', () => { if (!pinned) show(false); });
    btn.addEventListener('click', () => { pinned = !pinned; show(pinned); });
    btn.addEventListener('keydown', (e) => { if (e.key === 'Escape') { pinned = false; show(false); btn.blur(); } });
    const closer = (e) => {
      if (!btn.isConnected) { infoClosers.delete(closer); return; }
      const pop = getPop();
      if (e.target === btn || (pop && pop.contains(e.target))) return;
      pinned = false;
      show(false);
    };
    infoClosers.add(closer);
  }
  document.addEventListener('pointerdown', (e) => infoClosers.forEach((fn) => fn(e)));
  function infoButtons() { document.querySelectorAll('.h-info').forEach(wireInfo); }

  // ---- loading ---------------------------------------------------------------------------------------------------------
  async function load() {
    const now = Date.now();
    const from = new Date(now - 18 * HOUR).toISOString();
    const to = new Date(now + 14 * HOUR).toISOString();
    const [overview, doses, curve] = await Promise.all([
      api('/v1/meds/' + SLUG + '/overview?tz=' + TZ),
      api('/v1/meds/' + SLUG + '/doses?limit=200'),
      api('/v1/meds/' + SLUG + '/curve?from=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(to) + '&step=10'),
    ]);
    S.overview = overview;
    S.doses = doses;
    S.curve = curve;
    curveFresh = true;
    dotsFresh = true;
    render();
  }

  function render() {
    banner();
    today();
    drawCurve();
    works();
    month();
    checkins();
  }

  async function init() {
    infoButtons();
    $('logOpen').addEventListener('click', () => { if (S.overview) openLog(); });
    $('logClose').addEventListener('click', () => $('logDialog').close());
    $('logNow').addEventListener('click', () => { cal.month = new Date(); setWhen(new Date(), true); });
    wireCalendar();
    $('logForm').addEventListener('submit', saveLog);
    $('mQuick').addEventListener('click', (e) => { const b = e.target.closest('button[data-event]'); if (b) markEvent(b.dataset.event); });
    $('logDialog').addEventListener('click', (e) => { if (e.target === $('logDialog')) $('logDialog').close(); });
    sparkTrail();
    $('logTabs').addEventListener('click', (e) => { const b = e.target.closest('button[data-med]'); if (b) pickLogMed(b.dataset.med); });
    jumpNav();
    if (window.ResizeObserver) {
      new ResizeObserver(() => { drawCurve(); drawDots(); }).observe($('mCurve'));
      new ResizeObserver(() => drawDots()).observe($('mDots'));
    }
    loadOthers().catch(() => {});
    try {
      await load();
    } catch (e) {
      $('mGrid').hidden = true;
      $('mEmpty').textContent = 'Could not load your medication data right now.';
      $('mEmpty').hidden = false;
      return;
    }
    // keep the clock honest, and refresh the curve every ten minutes
    setInterval(() => { if (S.overview) { today(); } }, 30 * 1000);
    setInterval(() => { reloadAll().catch(() => {}); }, 10 * 60 * 1000);
  }

  // shared helpers for the lithium monitoring scripts, which load after this file
  window.IgnisMeds = { api, make, svgEl, toast, wireInfo, dayName, clock, dur, TZ, HOUR, MIN, sparkAt };

  init();
})();
