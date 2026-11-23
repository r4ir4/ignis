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
      throw new Error(detail || 'Algo deu errado (' + res.status + ').');
    }
    return res.status === 204 ? null : res.json();
  }

  // ---- formatting ----------------------------------------------------------------------------------------------
  const dur = (minutes) => {
    const m = Math.round(minutes);
    if (m < 60) return m + 'm';
    return Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'm';
  };
  const clock = (date) => date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const dayName = (date) => date.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' });
  const minuteClock = (minute) => String(Math.floor(minute / 60)).padStart(2, '0') + ':' + String(minute % 60).padStart(2, '0');
  const agoText = (ms) => {
    const mins = Math.round(ms / MIN);
    if (mins < 2) return 'agora há pouco';
    if (mins < 60) return 'há ' + mins + ' min';
    if (mins < 36 * 60) return 'há ' + Math.floor(mins / 60) + ' h';
    const days = Math.floor(mins / 1440);
    return 'há ' + days + (days === 1 ? ' dia' : ' dias');
  };
  const sameDay = (a, b) => a.toDateString() === b.toDateString();
  const dayKey = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const SOURCES = { ios: 'iPhone', shortcut: 'Shortcut', watch: 'Watch', legacy: 'Importado', ignis: 'Ignis', web: 'Web' };
  const ENOUGH = { yes: 'Sim, o suficiente', no_but_fine: 'Não o suficiente, mas ok', no_second_vyvanse: 'Não o suficiente, tomei uma segunda' };
  const EVENTS = { onset: 'começou a fazer efeito', strongest: 'no auge', wearing_off: 'passando o efeito' };

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
    if (elapsedMin < on.p25) return 'Esperando o efeito começar';
    if (elapsedMin < st.p25) return 'Começando a fazer efeito';
    if (elapsedMin <= st.p75) return 'Perto do auge';
    if (elapsedMin < off.p25) return 'Estável';
    if (elapsedMin <= off.p75) return 'Começando a passar';
    if (elapsedMin < 14 * 60) return 'Quase sem efeito';
    return 'Fim do dia';
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
      items.push([sameDay(taken, new Date()) ? 'Você tomou hoje às' : 'Última dose', sameDay(taken, new Date()) ? clock(taken) + ' · ' + last.dose_mg + ' mg' : agoText(Date.now() - taken)]);
      if (!sameDay(taken, new Date())) items.push(['Nenhuma dose hoje', '', 'p-pink']);
    } else {
      items.push(['Nenhuma dose registrada', '', 'p-pink']);
    }
    if (o.timing.onset.n >= 5) items.push(['O efeito costuma começar em', '~' + dur(o.timing.onset.median)]);
    if (o.streak > 1) items.push(['Você não pula uma dose há', o.streak + ' dias']);
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
      $('wSince').textContent = 'desde sua dose das ' + clock(new Date(last.taken_at)) + ' · ' + last.dose_mg + ' mg';
      phase.textContent = phaseFor(minutes);
      phase.hidden = false;
      quick.hidden = now - new Date(last.taken_at) > 24 * HOUR;
      const logged = new Map(((S.doses[0] && S.doses[0].id === last.id ? S.doses[0].events : []) || []).map((e) => [e.type, e]));
      quick.querySelectorAll('button[data-event]').forEach((btn) => {
        const e = logged.get(btn.dataset.event);
        btn.classList.toggle('done', !!e);
        btn.textContent = e ? '✓ ' + EVENTS[btn.dataset.event] + ' ' + clock(new Date(e.occurred_at)) : { onset: 'Começou a fazer efeito', strongest: 'No auge', wearing_off: 'Passando o efeito' }[btn.dataset.event];
      });
      const ed = $('mQuickEdit'); ed.hidden = !logged.size;
      ed.onclick = () => editTimes(S.doses[0], ['onset', 'strongest', 'wearing_off'].filter((t) => logged.has(t)).map((t) => logged.get(t)));
    } else if (last) {
      const days = Math.floor((now - new Date(last.taken_at)) / (24 * HOUR));
      piece(days, days === 1 ? 'dia' : 'dias');
      $('wSince').textContent = 'desde a última dose registrada · ' + dayName(new Date(last.taken_at));
      phase.hidden = true;
      quick.hidden = true;
      note.push('Nada registrado hoje. Toque em "Registrar dose" para adicionar.');
    } else {
      piece('–', '');
      $('wSince').textContent = 'Nenhuma dose registrada ainda.';
      phase.hidden = true;
      quick.hidden = true;
    }
    $('mLvlNote').textContent = note.join(' ');
  }

  function renderLevel(level) {
    const big = $('mLvl');
    big.replaceChildren();
    const band = $('mLvlBand');
    if (!level) { big.appendChild(make('b', '', '–')); band.hidden = true; $('mLvlSub').textContent = 'Ainda sem estimativa de nível.'; $('mMeter').hidden = true; return; }
    big.appendChild(make('b', '', String(Math.round(level.ng))));
    big.appendChild(make('small', '', S.curve.unit));
    const r = level.rel;
    band.textContent = r < 0.05 ? 'Quase nenhum' : r < 0.35 ? 'Baixo' : r < 0.8 ? 'Moderado' : r <= 1.05 ? 'Perto de um pico de ' + S.curve.reference_dose_mg + ' mg' : 'Acima de um pico de ' + S.curve.reference_dose_mg + ' mg';
    band.hidden = false;
    $('mLvlSub').textContent = Math.round(r * 100) + '% de um pico de ' + S.curve.reference_dose_mg + ' mg';
    const pct = Math.min(100, (r / 2) * 100);
    const meter = $('mMeter');
    meter.hidden = false;
    // keep the dot (18px + its 2px outer ring) fully inside the bar, even at 0 and 2x: its centre travels from 11px to 100% - 11px
    const at = 'calc(11px + (100% - 22px) * ' + (pct / 100).toFixed(4) + ')';
    meter.querySelector('i').style.width = at;
    meter.querySelector('.m-scale-dot').style.left = at;
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
        svgEl('text', { class: 'm-axis', x: x(t), y: h - 6, 'text-anchor': 'middle' }, svg).textContent = weekly ? d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }) : d.toLocaleDateString('pt-BR', { weekday: 'short' });
      }
    } else {
      const step = (w < 560 ? 6 : 3) * HOUR;
      for (let t = Math.ceil(t0 / step) * step; t <= t1; t += step) {
        svgEl('line', { class: 'm-grid-line', x1: x(t), x2: x(t), y1: 4, y2: h - BOTTOM }, svg);
        svgEl('text', { class: 'm-axis', x: x(t), y: h - 6, 'text-anchor': 'middle' }, svg).textContent = new Date(t).toLocaleTimeString('pt-BR', { hour: 'numeric' });
      }
    }
    // the peak of one reference dose
    const gy = y(1);
    svgEl('line', { class: 'ha-goal', x1: 0, x2: w, y1: gy, y2: gy }, svg);
    svgEl('text', { class: 'ha-goal-text', x: 2, y: gy - 5 }, svg).textContent = 'pico de ' + data.reference_dose_mg + ' mg';

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
      svgEl('text', { class: 'm-now-tag', x: Math.min(w - 26, Math.max(14, x(now))), y: 12, 'text-anchor': 'middle' }, svg).textContent = 'AGORA';
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
      tip.textContent = dayName(when) + ' ' + clock(when) + ' · cerca de ' + best.ng.toFixed(data.decimals || 0) + ' ' + data.unit + ' · ' + Math.round(best.rel * 100) + '%';
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
      links.forEach((a) => { const el = document.getElementById(a.dataset.sec); if (el && el.offsetParent && el.getBoundingClientRect().top < window.innerHeight * 0.4) current = a.dataset.sec; });
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
  // Weekly medicine: how many doses in a row landed within one interval (+2 days of slack) of the one before it,
  // counting back from the latest dose. If the latest one is already older than that, the streak is broken (0).
  function weeklyStreak(doses, intervalDays) {
    const limit = (intervalDays + 2) * 24 * HOUR;
    const times = doses.map((d) => new Date(d.taken_at).getTime()).sort((a, b) => b - a);
    if (!times.length || Date.now() - times[0] > limit) return 0;
    let n = 1;
    for (let i = 1; i < times.length; i++) { if (times[i - 1] - times[i] <= limit) n++; else break; }
    return n;
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
    if (buildsUp && r > 1.05) return 'Acumulado de várias doses';
    return r < 0.05 ? 'Quase nenhum' : r < 0.35 ? 'Baixo' : r < 0.8 ? 'Moderado' : r <= 1.05 ? 'Perto de um pico de ' + data.reference_dose_mg + ' mg' : 'Acima de um pico de ' + data.reference_dose_mg + ' mg';
  }
  function curveCard(slug, st) {
    const data = st.curve;
    const o = st.overview;
    const card = make('article', 'h-card grain m-today m-xcurve');
    const long = (o.med.window_hours || [18])[0] > 40;
    const weeks = (o.med.window_hours || [18])[0] > 240;
    const h2 = make('h2', '', (weeks ? 'Nível, últimas semanas' : long ? 'Nível, últimos dias' : o.med.name + ' hoje') + ' ');
    const info = make('button', 'h-info', 'i');
    info.type = 'button';
    info.setAttribute('aria-label', 'O que é esta curva?');
    info.setAttribute('aria-expanded', 'false');
    info.setAttribute('aria-controls', 'xp-' + slug);
    h2.appendChild(info);
    card.appendChild(h2);
    const pop = make('div', 'h-pop m-pop');
    pop.id = 'xp-' + slug;
    pop.setAttribute('role', 'tooltip');
    pop.appendChild(make('b', '', 'O que é esta curva?'));
    pop.appendChild(make('p', '', 'Esta linha é uma estimativa de quanto ' + o.med.name + ' há no seu corpo: sobe depois de uma dose e depois desce' + (long ? ', e um remédio lento como este se acumula ao longo de ' + (weeks ? 'semanas.' : 'dias.') : '.')));
    card.appendChild(pop);
    const grid = make('div', 'm-today-grid');
    const left = make('div', 'm-today-left');
    const level = levelIn(data, Date.now());
    const big = make('p', 'm-since');
    big.appendChild(make('b', '', level.ng.toFixed(data.decimals || 0)));
    big.appendChild(make('small', '', data.unit));
    left.appendChild(big);
    left.appendChild(make('p', 'h-when', data.unit === 'mg' ? 'combinado das suas doses recentes · estimado agora' : Math.round(level.rel * 100) + '% de um pico de ' + data.reference_dose_mg + ' mg · estimado agora'));
    left.appendChild(make('p', 'm-phase', bandFor(level.rel, data, long)));
    const lastDose = o.last_dose;
    if (o.med.tracks_events && lastDose && Date.now() - new Date(lastDose.taken_at) < 24 * HOUR) {
      const logged = new Map(((st.doses[0] && st.doses[0].id === lastDose.id ? st.doses[0].events : []) || []).map((e) => [e.type, e]));
      const quick = make('div', 'm-quick');
      [['onset', 'Começou a fazer efeito'], ['strongest', 'No auge'], ['wearing_off', 'Passando o efeito']].forEach(([type, label]) => {
        const e = logged.get(type);
        const btn = make('button', e ? 'done' : '', e ? '✓ ' + EVENTS[type] + ' ' + clock(new Date(e.occurred_at)) : label);
        btn.type = 'button';
        btn.addEventListener('click', async () => {
          try {
            await api('/v1/meds/doses/' + lastDose.id + '/events', { method: 'POST', body: { event_type: type } });
            toast('Salvo');
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
    chart.setAttribute('aria-label', 'Nível estimado de ' + o.med.name + ' ao longo do tempo');
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
    last.appendChild(make('h3', '', 'Última dose'));
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
        last.appendChild(make('p', 'm-phase m-xpill', left > 1 ? 'Próxima dose em ' + left + ' dias' : left === 1 ? 'Próxima dose amanhã' : left === 0 ? 'Próxima dose é hoje' : Math.abs(left) + (Math.abs(left) === 1 ? ' dia' : ' dias') + ' após o dia habitual'));
      }
    } else {
      last.appendChild(make('p', 'm-xsub', 'Nenhuma dose registrada ainda.'));
    }
    const stats = make('ul', 'm-stats');
    // A weekly medicine (Mounjaro) is not taken every day, so its streak counts weeks in a row, not days.
    const weekly = !!o.med.interval_days;
    const weeks = weekly ? weeklyStreak(st.doses, o.med.interval_days) : 0;
    const last30 = weekly ? st.doses.filter((d) => Date.now() - new Date(d.taken_at) <= 30 * 24 * HOUR).length : 0;
    (weekly
      ? [['Total registrado', String(o.total_doses), 'doses'], ['Últimos 30 dias', String(last30), last30 === 1 ? 'dose' : 'doses'], ['Sequência', String(weeks), weeks === 1 ? 'semana' : 'semanas']]
      : [['Total registrado', String(o.total_doses), 'doses'], ['Últimos 30 dias', String(o.days_taken_30), 'dias'], ['Sequência', String(o.streak), o.streak === 1 ? 'dia' : 'dias']]
    ).forEach(([k, v, u]) => {
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
    strip.setAttribute('aria-label', 'Em quais dos últimos 14 dias você registrou uma dose');
    const pad = (n) => String(n).padStart(2, '0');
    const now = new Date();
    for (let i = 13; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const key = date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
      const n = (byDay.get(key) || []).length;
      const tile = make('div', 'm-tile' + (n ? ' on' : '') + (i === 0 ? ' now' : ''), String(date.getDate()));
      tile.style.setProperty('--i', 13 - i);
      tile.title = date.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }) + (n ? ' · ' + n + (n === 1 ? ' dose' : ' doses') : ' · sem dose');
      strip.appendChild(tile);
    }
    const stripBox = make('div', 'm-xstrip');
    stripBox.appendChild(make('h4', 'm-xlbl', 'Últimos 14 dias'));
    stripBox.appendChild(strip);
    if (!o.med.compact) last.appendChild(stripBox);
    root.appendChild(last);

    if (o.med.compact) {
      // the totals live in their own card; no history list
      const tally = make('article', 'h-card grain m-xtally');
      tally.appendChild(make('h3', '', 'Suas doses'));
      tally.appendChild(stats);
      tally.appendChild(stripBox);
      if (o.first_dose) tally.appendChild(make('p', 'm-xsub', 'desde ' + new Date(o.first_dose).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })));
      root.appendChild(tally);
      if (!o.med.tracks_events) return;
    }

    if (o.med.tracks_events) {
      // the moments you mark replace the history list for these medications
      const card = make('article', 'h-card grain m-works' + (o.med.compact ? ' m-xwide' : ''));
      const h2 = make('h2', '', 'Como funciona para você ');
      const info = make('button', 'h-info', 'i');
      info.type = 'button';
      info.setAttribute('aria-label', 'De onde vêm estes horários?');
      info.setAttribute('aria-expanded', 'false');
      info.setAttribute('aria-controls', 'wp-' + slug);
      h2.appendChild(info);
      card.appendChild(h2);
      const pop = make('div', 'h-pop m-pop');
      pop.id = 'wp-' + slug;
      pop.setAttribute('role', 'tooltip');
      pop.appendChild(make('b', '', 'De onde vêm estes dados?'));
      pop.appendChild(make('p', '', 'Estes são os seus próprios tempos: quanto tempo depois da dose o efeito começou, foi mais forte e passou.'));
      card.appendChild(pop);
      const list = make('ul', 'm-works-list');
      worksList(list, o);
      card.appendChild(list);
      wireInfo(info);
      root.appendChild(card);
      return;
    }
    const hist = make('article', 'h-card grain m-xhist');
    hist.appendChild(make('h3', '', 'Histórico'));
    const list = make('ul', 'm-hist');
    st.doses.slice(0, st.shown).forEach((d) => list.appendChild(doseRow(d)));
    if (!st.doses.length) list.appendChild(make('li', 'm-xsub', 'Nada registrado ainda. Use Registrar dose.'));
    hist.appendChild(list);
    if (st.shown < st.doses.length) {
      const more = make('button', 'm-more', 'Mostrar doses mais antigas');
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
    left.appendChild(make('span', 'm-w-name', 'Doses por dia'));
    const right = make('div', 'm-w-r');
    if (!counts.length) {
      right.appendChild(make('span', 'm-w-note', 'Nenhuma dose registrada nos últimos 30 dias.'));
      li.append(left, right);
      return li;
    }
    const median = q(0.5), p25 = q(0.25), p75 = q(0.75);
    const max = Math.max(4, counts[counts.length - 1]);
    const val = make('b', 'm-w-val', Number.isInteger(median) ? String(median) : median.toFixed(1));
    left.append(val, make('small', 'm-w-after', 'nos dias em que você toma'));
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
    const spread = lo === hi ? 'Na maioria dos dias: ' + lo + (lo === 1 ? ' dose' : ' doses') : 'Metade dos seus dias: ' + lo + ' a ' + hi + ' doses';
    right.append(range, ticks, make('span', 'm-w-note', spread + ' · hoje: ' + today + ' até agora.'), make('span', 'm-w-n', 'de ' + counts.length + ' dias com doses'));
    li.append(left, right);
    return li;
  }
  function works() { worksList($('mWorks'), S.overview); }
  function worksList(list, o) {
    list.replaceChildren();
    if (o.med.daily_doses) list.appendChild(dailyCountRow(o));
    const MAX = o.med.timeline_minutes || 540; // the track runs from the dose to nine hours after it (six for Ritalina)
    const PHASES = [['onset', 'Começa a fazer efeito'], ['strongest', 'Auge'], ['wearing_off', 'Passa o efeito']];
    const pct = (min) => Math.max(0, Math.min(100, (min / MAX) * 100));

    // 1) one shared timeline after the dose, with the three moments numbered on it
    const tl = make('li', 'm-tl');
    tl.setAttribute('aria-hidden', 'true');
    const wrap = make('div', 'm-tl-wrap');
    const track = make('div', 'm-tl-track');
    wrap.appendChild(track);
    PHASES.forEach(([key, label], i) => {
      const t = o.timing[key];
      if (!t.n) return;
      const seg = make('i', 'm-tl-range');
      const a0 = pct(t.p25), b0 = pct(t.p75);
      seg.style.left = a0 + '%';
      seg.style.width = Math.max(1.2, b0 - a0) + '%';
      const dot = make('b', 'm-tl-dot', String(i + 1));
      dot.style.left = pct(t.median) + '%';
      const tag = make('span', 'm-tl-tag', dur(t.median));
      tag.style.left = pct(t.median) + '%';
      wrap.append(seg, dot, tag);
    });
    const ticks = make('div', 'm-tl-ticks');
    ['dose', MAX / 180 + 'h', MAX / 90 + 'h', MAX / 60 + 'h'].forEach((x) => ticks.appendChild(make('span', '', x)));
    wrap.appendChild(ticks);
    tl.appendChild(wrap);
    list.appendChild(tl);

    // 2) the same three moments as plain rows: what, typical time, the usual range, how many doses it is based on
    const head = make('li', 'm-tt m-tt-head');
    ['Momento', 'Costuma levar', 'Metade das doses', 'Base'].forEach((x) => head.appendChild(make('span', '', x)));
    list.appendChild(head);
    PHASES.forEach(([key, label], i) => {
      const t = o.timing[key];
      const row = make('li', 'm-tt');
      const name = make('span', 'm-tt-name');
      name.append(make('b', 'm-tt-n', String(i + 1)), document.createTextNode(label));
      row.appendChild(name);
      if (!t.n) {
        row.appendChild(make('span', 'm-tt-empty', 'Ainda sem marcações suficientes.'));
      } else {
        row.append(
          make('span', 'm-tt-val', dur(t.median) + ' após a dose'),
          make('span', '', 'entre ' + dur(t.p25) + ' e ' + dur(t.p75)),
          make('span', 'm-tt-n2', t.n + ' doses')
        );
      }
      list.appendChild(row);
    });
  }

  // ---- last 30 days -----------------------------------------------------------------------------------------------------
  let dotsFresh = true;
  function month() {
    const o = S.overview;
    set('vDays', o.days_taken_30);
    $('wDays').textContent = o.days_taken_30 ? 'dias com dose registrada' : 'Nenhuma dose registrada nos últimos 30 dias.';
    const stats = $('mMonthPills');
    stats.replaceChildren();
    const items = [];
    if (o.avg_first_dose_minute != null) items.push(['Normalmente', minuteClock(o.avg_first_dose_minute)]);
    items.push(['Sequência', String(o.streak), o.streak === 1 ? 'dia' : 'dias']);
    items.push(['Total registrado', String(o.total_doses), 'doses']);
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
    // A Monday-first calendar: weekday headers, blank cells before the first day, so each date sits under its weekday.
    ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].forEach((l) => root.appendChild(make('span', 'm-tdow', l)));
    const firstDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29);
    for (let p = 0; p < (firstDate.getDay() + 6) % 7; p++) root.appendChild(make('div', 'm-tile m-tile-pad'));
    for (let i = 29; i >= 0; i--) {
      const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      const key = date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
      const doses = byDay.get(key) || [];
      const first = doses.length ? Math.min(...doses.map((x) => x.minute)) : null;
      const tile = make('div', 'm-tile' + (doses.length ? ' on' : '') + (i === 0 ? ' now' : ''));
      tile.style.setProperty('--i', 29 - i);
      tile.title = date.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }) + (doses.length ? ' · ' + doses.map((x) => minuteClock(x.minute) + ' ' + x.mg + ' mg').join(', ') : ' · no dose');
      if (i === 29 || date.getDate() === 1) tile.dataset.m = date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
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
      svgEl('text', { class: 'm-axis', x: x(i), y: h - 4, 'text-anchor': 'middle' }, svg).textContent = slot.d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });
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

  // ---- history ---------------------------------------------------------------------------------------------------------
  function doseRow(d) {
    const taken = new Date(d.taken_at);
    const li = make('li', 'm-row');
    const when = make('div', 'm-row-when', dayName(taken) + ' · ' + clock(taken));
    when.appendChild(make('span', '', agoText(Date.now() - taken)));
    li.appendChild(when);
    const del = make('button', 'm-del', 'Apagar');
    del.type = 'button';
    del.addEventListener('click', async () => {
      if (!(await IgnisConfirm.ask({ title: 'Apagar dose', text: 'Apagar esta dose do registro? Isso não pode ser desfeito.' }))) return;
      try {
        await api('/v1/meds/doses/' + d.id, { method: 'DELETE' });
        toast('Dose apagada');
        await reloadAll();
      } catch (e) { toast(e.message); }
    });
    li.appendChild(del);
    const chips = make('div', 'm-row-chips');
    chips.appendChild(make('span', 'm-chip mg', d.dose_mg + ' mg'));
    if (d.food_state) chips.appendChild(make('span', 'm-chip src', d.food_state === 'fasted' ? 'em jejum' : 'com comida'));
    d.events.forEach((e) => {
      const minutes = (new Date(e.occurred_at) - taken) / MIN;
      const chip = make('button', 'm-chip ev m-evedit', EVENTS[e.type] + ' +' + dur(minutes));
      chip.type = 'button'; chip.title = 'Mudar o horário';
      chip.addEventListener('click', () => editTimes(d, [e], chips));
      chips.appendChild(chip);
    });
    if (d.checkins.length) chips.appendChild(make('span', 'm-chip ev', 'check-in'));
    chips.appendChild(make('span', 'm-chip src', SOURCES[d.source] || d.source));
    li.appendChild(chips);
    return li;
  }


  // tiny correction: tap a mark in the history, type the clock time, Enter saves, Esc cancels
  // "edit times": one small panel with a stepper per logged moment (hour and minute), saved together
  function editTimes(d, events, anchor) {
    if (document.getElementById('mTimeEd')) return;
    void anchor;
    const pad = (n) => String(n).padStart(2, '0');
    const taken = new Date(d.taken_at);
    const panel = make('dialog', 'm-modal m-timeed'); panel.id = 'mTimeEd'; panel.setAttribute('aria-labelledby', 'mTimeEdTitle');
    const head = make('header'); const title = make('h2', '', events.length > 1 ? 'Editar horários' : 'Editar horário'); title.id = 'mTimeEdTitle';
    const x = make('button', 'm-x'); x.type = 'button'; x.setAttribute('aria-label', 'Fechar');
    x.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    head.append(title, x); panel.appendChild(head);
    const list = make('div', 'm-te-list'); panel.appendChild(list);
    const rows = events.map((e) => {
      const at = new Date(e.occurred_at);
      const st = { h: at.getHours(), m: at.getMinutes(), h0: at.getHours(), m0: at.getMinutes() };
      const row = make('div', 'm-te-row');
      row.appendChild(make('span', 'm-te-lbl', EVENTS[e.type]));
      const seg = (key, max, step, label) => {
        const box = make('div', 'm-te-seg');
        const up = make('button', 'm-te-step', '▲'); up.type = 'button'; up.setAttribute('aria-label', 'Mais tarde: ' + label);
        const val = make('output', 'm-te-val');
        const dn = make('button', 'm-te-step', '▼'); dn.type = 'button'; dn.setAttribute('aria-label', 'Mais cedo: ' + label);
        const bump = (dir) => { st[key] = (st[key] + dir * step + max) % max; if (key === 'm' && dir > 0 && st.m === 0) {} paint(); };
        const paint = () => { val.textContent = pad(st[key]); row.classList.toggle('changed', st.h !== st.h0 || st.m !== st.m0); };
        up.onclick = () => bump(1); dn.onclick = () => bump(-1);
        box.tabIndex = 0; box.setAttribute('role', 'spinbutton'); box.setAttribute('aria-label', label);
        box.addEventListener('keydown', (k) => {
          if (k.key === 'ArrowUp') { k.preventDefault(); bump(1); }
          else if (k.key === 'ArrowDown') { k.preventDefault(); bump(-1); }
          else if (/^\d$/.test(k.key)) { k.preventDefault(); const v = +(String(st[key]).slice(-1) + k.key); if (v < max) { st[key] = v; paint(); } }
        });
        box.append(up, val, dn); paint();
        return box;
      };
      row.append(seg('h', 24, 1, 'hora'), make('span', 'm-te-colon', ':'), seg('m', 60, 5, 'minuto'));
      return { e, st, row };
    });
    rows.forEach((r) => list.appendChild(r.row));
    const actions = make('div', 'm-te-actions');
    const save = make('button', 'm-save', 'Salvar'); save.type = 'button';
    actions.append(save); panel.appendChild(actions);
    const close = () => { if (panel.open) panel.close(); };
    x.onclick = close;
    panel.addEventListener('close', () => { panel.remove(); today(); });
    panel.addEventListener('click', (ev) => { if (ev.target === panel) close(); });
    panel.addEventListener('keydown', (k) => { if (k.key === 'Enter' && !k.target.closest('button')) save.click(); });
    save.onclick = async () => {
      const changes = rows.filter((r) => r.st.h !== r.st.h0 || r.st.m !== r.st.m0);
      if (!changes.length) return close();
      save.disabled = true;
      try {
        for (const r of changes) {
          const t = new Date(taken); t.setHours(r.st.h, r.st.m, 0, 0);
          if (t < taken) t.setDate(t.getDate() + 1); // past midnight
          await api('/v1/meds/doses/' + d.id + '/events', { method: 'POST', body: { event_type: r.e.type, occurred_at: t.toISOString() } });
        }
        close(); toast('Salvo'); await reloadAll();
      } catch (err) { toast(err.message); save.disabled = false; }
    };
    document.body.appendChild(panel);
    panel.showModal();
    panel.querySelector('.m-te-seg').focus();
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
    $('calTitle').textContent = m.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
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
      b.setAttribute('aria-label', date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' }) + (logged.has(key) ? ', dose registrada' : ''));
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
    // The picker slides open and closed (height + fade). With reduced motion it just switches.
    const calBox = $('logCal');
    const still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    let calAnim = null;
    $('whenBtn').addEventListener('click', () => {
      const open = calBox.hidden || (calAnim && calAnim.closing);
      $('whenBtn').setAttribute('aria-expanded', String(open));
      if (calAnim) { calAnim.cancel(); calAnim = null; }
      if (open) {
        cal.month = new Date(cal.when.getFullYear(), cal.when.getMonth(), 1);
        renderCal();
        calBox.hidden = false;
        if (still || !calBox.animate) return;
        const h = calBox.scrollHeight;
        calBox.style.overflow = 'hidden';
        calAnim = calBox.animate([{ height: '0px', opacity: 0, transform: 'translateY(-6px)' }, { height: h + 'px', opacity: 1, transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.2, .8, .2, 1)' });
        calAnim.onfinish = () => { calBox.style.overflow = ''; calAnim = null; };
      } else {
        if (still || !calBox.animate) { calBox.hidden = true; return; }
        const h = calBox.getBoundingClientRect().height;
        calBox.style.overflow = 'hidden';
        calAnim = calBox.animate([{ height: h + 'px', opacity: 1, transform: 'none' }, { height: '0px', opacity: 0, transform: 'translateY(-6px)' }], { duration: 240, easing: 'cubic-bezier(.4, 0, .2, 1)', fill: 'forwards' });
        calAnim.closing = true;
        calAnim.onfinish = () => { calBox.hidden = true; calBox.style.overflow = ''; calAnim.cancel(); calAnim = null; };
      }
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
    radioChips($('foodChips'), [['fasted', 'Em jejum'], ['fed', 'Com comida']], null, (v) => { chosen.food = v; });
    pickLogMed(OTHERS.includes(currentSec) ? currentSec : SLUG);
    $('logCal').hidden = true;
    $('whenBtn').setAttribute('aria-expanded', 'false');
    cal.month = new Date();
    setWhen(new Date());
    $('logDialog').showModal();
    updateLogSummary();
  }
  // A one-line summary above Save so the left column reads as a finished sentence: "30 mg · Venvanse · today, 21:25".
  function updateLogSummary() {
    const dlg = $('logDialog');
    const save = $('logSave');
    if (!dlg || !save) return;
    let el = dlg.querySelector('.m-sum');
    if (!el) { el = document.createElement('p'); el.className = 'm-sum'; save.parentNode.insertBefore(el, save); }
    const t = new Date($('logTime').value);
    const tab = document.querySelector('#logTabs button[aria-selected="true"]');
    const day = Number.isNaN(t.getTime()) ? '' : (t.toDateString() === new Date().toDateString() ? 'hoje' : t.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }));
    const clock = Number.isNaN(t.getTime()) ? '' : t.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    el.textContent = [chosen.mg != null ? chosen.mg + ' mg' : '', tab ? tab.textContent : '', [day, clock].filter(Boolean).join(', ')].filter(Boolean).join(' · ');
  }
  async function saveLog(event) {
    event.preventDefault();
    const err = $('logErr');
    err.hidden = true;
    const when = new Date($('logTime').value);
    if (Number.isNaN(when.getTime())) { err.textContent = 'Escolha o horário em que você tomou.'; err.hidden = false; return; }
    if (when.getTime() > Date.now() + 5 * MIN) { err.textContent = 'Esse horário está no futuro.'; err.hidden = false; return; }
    const body = { dose_mg: chosen.mg };
    // "Now" is stamped by the server, so the log matches the moment you actually saved.
    if (Math.abs(Date.now() - when.getTime()) > 2 * MIN) body.taken_at = when.toISOString();
    if (chosen.food) body.food_state = chosen.food;
    $('logSave').disabled = true;
    try {
      await api('/v1/meds/' + logMed + '/doses', { method: 'POST', body });
      $('logDialog').close();
      toast('Dose registrada');
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
      toast('Salvo');
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
    $('logDialog').addEventListener('click', () => setTimeout(updateLogSummary, 0));
    $('logDialog').addEventListener('input', () => setTimeout(updateLogSummary, 0));
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
      $('mEmpty').textContent = 'Não foi possível carregar seus dados de medicação agora.';
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
