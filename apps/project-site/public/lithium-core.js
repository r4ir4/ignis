// Lithium monitoring: shared shell (tabs, date range, export), card and chart helpers. The four tabs register themselves.
(() => {
  'use strict';
  const M = window.IgnisMeds;
  if (!M) return;
  const { api, make, svgEl, wireInfo } = M;
  const DAY = 864e5;

  const Li = (window.Li = { M, DAY, tabs: [], state: { cfg: null, preset: '90', tab: 'levels', from: '', to: '' }, cache: {}, uid: 0 });
  Li.registerTab = (tab) => Li.tabs.push(tab);
  Li.ready = new Promise((resolve) => { Li._ready = resolve; });

  // ---- formatting ---------------------------------------------------------------------------------------------------
  const pad = (n) => String(n).padStart(2, '0');
  Li.dayKey = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  Li.shortDate = (t) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  Li.longDate = (t) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  Li.dateTime = (t) => Li.longDate(t) + ' · ' + new Date(t).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  Li.unit = (u) => String(u || '').replace('umol', '\u00b5mol').replace(/m2$/, 'm\u00b2');
  Li.num = (v, d = 2) => (v == null ? '–' : String(+Number(v).toFixed(d)));
  Li.signed = (v, d = 1) => (v == null ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(+Number(v).toFixed(d)));
  Li.ago = (t) => {
    const days = Math.floor((Date.now() - new Date(t)) / DAY);
    return days <= 0 ? 'today' : days === 1 ? 'yesterday' : days + ' days ago';
  };
  Li.q = (extra) => {
    const r = Li.range();
    const parts = [];
    if (r.from) parts.push('from=' + encodeURIComponent(r.from.toISOString()));
    parts.push('to=' + encodeURIComponent(r.to.toISOString()));
    return parts.join('&') + (extra ? '&' + extra : '');
  };
  Li.dayq = () => {
    const r = Li.range();
    return (r.from ? 'from=' + Li.dayKey(r.from) + '&' : '') + 'to=' + Li.dayKey(r.to);
  };

  // ---- date range ---------------------------------------------------------------------------------------------------
  Li.range = () => {
    const s = Li.state;
    const now = new Date();
    if (s.preset === 'all') return { from: null, to: now };
    if (s.preset === 'custom') {
      const from = s.from ? new Date(s.from + 'T00:00:00') : null;
      const to = s.to ? new Date(s.to + 'T23:59:59') : now;
      return { from, to };
    }
    return { from: new Date(now.getTime() - Number(s.preset) * DAY), to: now };
  };
  // x domain for charts: the chosen range, or the span of the data when the range is open-ended
  Li.domain = (times) => {
    const r = Li.range();
    const lo = r.from ? r.from.getTime() : times.length ? Math.min(...times) - 3 * DAY : r.to.getTime() - 90 * DAY;
    return [lo, Math.max(r.to.getTime(), times.length ? Math.max(...times) : 0)];
  };

  // ---- small builders -----------------------------------------------------------------------------------------------
  Li.el = make;
  Li.chips = (root, items, { selected, multi = false, onChange }) => {
    const sel = new Set(multi ? selected : [selected]);
    root.replaceChildren();
    root.classList.add('li-chips');
    items.forEach(([value, label, count]) => {
      const b = make('button', 'li-chip', label);
      b.type = 'button';
      if (count != null) b.appendChild(make('span', '', String(count)));
      b.setAttribute('aria-pressed', String(sel.has(value)));
      b.addEventListener('click', () => {
        if (multi) sel.has(value) ? sel.delete(value) : sel.add(value);
        else { sel.clear(); sel.add(value); }
        root.querySelectorAll('button').forEach((x, i) => x.setAttribute('aria-pressed', String(sel.has(items[i][0]))));
        onChange(multi ? [...sel] : value);
      });
      root.appendChild(b);
    });
  };
  // a date picker in the same design as the diary's calendar: month grid, Monday first, today ringed, future days off
  Li.datePicker = (initial, { max, onPick } = {}) => {
    const root = make('div', 'li-dp');
    const state = { value: initial || '', month: initial ? new Date(initial + 'T12:00:00') : new Date() };
    state.month = new Date(state.month.getFullYear(), state.month.getMonth(), 1);
    const btn = make('button', 'm-whenbtn li-dp-btn');
    btn.type = 'button';
    btn.setAttribute('aria-expanded', 'false');
    const label = make('span');
    btn.appendChild(label);
    btn.insertAdjacentHTML('beforeend', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>');
    const cal = make('div', 'm-cal li-dp-cal');
    const wrap = make('div', 'li-collapse');
    wrap.inert = true;
    const inner = make('div', 'li-collapse-in');
    inner.appendChild(cal);
    wrap.appendChild(inner);
    const head = make('header');
    const prev = make('button', 'm-calnav', '\u2039'); prev.type = 'button'; prev.setAttribute('aria-label', 'Previous month');
    const next = make('button', 'm-calnav', '\u203a'); next.type = 'button'; next.setAttribute('aria-label', 'Next month');
    const title = make('h3');
    head.append(prev, title, next);
    const dow = make('div', 'm-dow');
    ['M', 'T', 'W', 'T', 'F', 'S', 'S'].forEach((d) => dow.appendChild(make('span', '', d)));
    const grid = make('div', 'm-days');
    cal.append(head, dow, grid);
    root.append(btn, wrap);
    const maxDay = max || Li.dayKey(new Date());
    const paintLabel = () => { label.textContent = state.value ? new Date(state.value + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : 'Pick a date'; };
    const paint = () => {
      const y = state.month.getFullYear(), mo = state.month.getMonth();
      title.textContent = state.month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
      const lead = (new Date(y, mo, 1).getDay() + 6) % 7;
      const total = new Date(y, mo + 1, 0).getDate();
      const cells = [];
      for (let i = 0; i < lead; i++) cells.push(make('span', 'm-pad'));
      const todayKey = Li.dayKey(new Date());
      for (let d = 1; d <= total; d++) {
        const key = y + '-' + pad(mo + 1) + '-' + pad(d);
        const b = make('button', 'm-dayb' + (key === state.value ? ' sel' : '') + (key === todayKey ? ' today' : ''), String(d));
        b.type = 'button';
        b.disabled = key > maxDay;
        b.setAttribute('aria-pressed', String(key === state.value));
        b.setAttribute('aria-label', new Date(y, mo, d).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }));
        b.addEventListener('click', () => {
          state.value = key;
          paintLabel();
          wrap.classList.remove('open');
          wrap.inert = true;
          btn.setAttribute('aria-expanded', 'false');
          if (onPick) onPick(key);
        });
        cells.push(b);
      }
      grid.replaceChildren(...cells);
      next.disabled = Li.dayKey(new Date(y, mo + 1, 1)) > maxDay;
    };
    btn.addEventListener('click', () => {
      const open = !wrap.classList.contains('open');
      if (open) paint();
      wrap.classList.toggle('open', open);
      wrap.inert = !open;
      btn.setAttribute('aria-expanded', String(open));
    });
    prev.addEventListener('click', () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth() - 1, 1); paint(); });
    next.addEventListener('click', () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth() + 1, 1); paint(); });
    paintLabel();
    Object.defineProperty(root, 'value', { get: () => state.value });
    return root;
  };

  // a card with a title, an optional "i" tooltip and a body element
  Li.card = (title, { info, cls = '', sub } = {}) => {
    const el = make('article', 'h-card grain li-card ' + cls);
    const h2 = make('h2', '', title + (info ? ' ' : ''));
    if (info) {
      const id = 'li-pop-' + ++Li.uid;
      const btn = make('button', 'h-info', 'i');
      btn.type = 'button';
      btn.setAttribute('aria-label', 'About ' + title);
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('aria-controls', id);
      h2.appendChild(btn);
      el.appendChild(h2);
      const pop = make('div', 'h-pop m-pop');
      pop.id = id;
      pop.setAttribute('role', 'tooltip');
      pop.appendChild(make('b', '', info.title || title));
      info.paras.forEach((p) => pop.appendChild(make('p', '', p)));
      el.appendChild(pop);
      wireInfo(btn);
    } else {
      el.appendChild(h2);
    }
    if (sub) el.appendChild(make('p', 'li-sub', sub));
    return el;
  };
  Li.note = (text, cls = '') => make('p', 'li-note ' + cls, text);
  Li.empty = (text) => make('p', 'li-empty', text);
  Li.tag = (text, cls = '') => make('span', 'li-tag ' + cls, text);
  Li.source = (s) => ({ web: 'Web', ios: 'iPhone', manual: 'Manual', shortcut: 'Shortcut', watch: 'Watch' }[s] || s || 'Manual');

  // ---- chart ---------------------------------------------------------------------------------------------------------
  // spec: { height, xMin, xMax, yMin?, yMax?, yFmt?, unit?, bands:[{lo,hi,label}], hlines:[{y,label}], vlines:[{t,label}],
  //         series:[{pts:[{t,v,tip?}], kind:'dots'|'line'|'both', cls:'a'|'b'|'c'|'d', gapMs?, dash?}], emptyText }
  const niceStep = (span, n) => {
    const raw = span / n;
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  };
  const ro = window.ResizeObserver ? new ResizeObserver((entries) => entries.forEach((e) => e.target._redraw && e.target._redraw())) : null;
  Li.chart = (wrap, spec) => {
    wrap.classList.add('ha-line', 'li-chart');
    wrap.style.height = (spec.height || 200) + 'px';
    wrap._spec = spec;
    wrap._redraw = () => draw(wrap);
    if (ro) ro.observe(wrap);
    requestAnimationFrame(() => draw(wrap));
    return wrap;
  };
  function draw(wrap) {
    const spec = wrap._spec;
    const w = wrap.clientWidth - 28;
    const h = wrap.clientHeight - 26;
    if (!spec || w < 80 || h < 60) return;
    wrap.replaceChildren();
    const all = spec.series.flatMap((s) => s.pts);
    if (!all.length && !spec.showEmptyAxes) {
      wrap.appendChild(make('p', 'li-chart-empty', spec.emptyText || 'Nothing recorded in this period.'));
      return;
    }
    const values = all.map((p) => p.v).concat((spec.bands || []).flatMap((b) => [b.lo, b.hi])).concat((spec.hlines || []).map((l) => l.y)).filter((v) => v != null);
    let lo = spec.yMin != null ? spec.yMin : Math.min(...values);
    let hi = spec.yMax != null ? spec.yMax : Math.max(...values);
    if (!isFinite(lo) || !isFinite(hi)) { lo = 0; hi = 1; }
    if (hi === lo) { hi += 1; lo -= 1; }
    const padY = (hi - lo) * 0.1;
    if (spec.yMin == null) lo -= padY;
    if (spec.yMax == null) hi += padY;
    if (spec.yMin == null && lo < 0 && Math.min(...values) >= 0) lo = 0;
    const LEFT = spec.bare ? 6 : 42, BOTTOM = spec.bare ? 6 : 22, TOP = spec.glyphs ? 26 : spec.bare ? 8 : 12;
    const x = (t) => LEFT + ((t - spec.xMin) / (spec.xMax - spec.xMin || 1)) * (w - LEFT - 8);
    const y = (v) => h - BOTTOM - ((v - lo) / (hi - lo)) * (h - BOTTOM - TOP);
    const svg = svgEl('svg', { class: 'ha-svg', width: w, height: h, viewBox: `0 0 ${w} ${h}` }, wrap);
    svg.style.margin = '0';
    // y grid
    const step = niceStep(hi - lo, 4);
    if (!spec.bare) for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) {
      svgEl('line', { class: 'm-grid-line', x1: LEFT, x2: w, y1: y(v), y2: y(v) }, svg);
      svgEl('text', { class: 'm-axis', x: LEFT - 6, y: y(v) + 3.5, 'text-anchor': 'end' }, svg).textContent = (spec.yFmt || ((n) => +n.toFixed(2)))(+v.toFixed(6));
    }
    // x ticks, evenly spaced dates
    const n = Math.max(2, Math.min(7, Math.floor(w / 96)));
    if (!spec.bare) for (let i = 0; i <= n; i++) {
      const t = spec.xMin + ((spec.xMax - spec.xMin) * i) / n;
      svgEl('text', { class: 'm-axis', x: x(t), y: h - 6, 'text-anchor': i === 0 ? 'start' : i === n ? 'end' : 'middle' }, svg).textContent = (spec.xFmt || Li.shortDate)(t);
    }
    (spec.bands || []).forEach((b) => {
      svgEl('rect', { class: 'li-band', x: LEFT, y: y(b.hi), width: w - LEFT - 8, height: Math.max(1, y(b.lo) - y(b.hi)) }, svg);
      if (b.label) svgEl('text', { class: 'ha-goal-text', x: LEFT + 4, y: y(b.hi) + 11 }, svg).textContent = b.label;
    });
    (spec.hlines || []).forEach((l) => {
      svgEl('line', { class: 'ha-goal', x1: LEFT, x2: w, y1: y(l.y), y2: y(l.y) }, svg);
      if (l.label && !spec.bare) svgEl('text', { class: 'ha-goal-text', x: LEFT + 6, y: y(l.y) - 6 }, svg).textContent = l.label;
    });
    // markers: with glyphs on, each line gets a small round badge at the top (hover for what it is) instead of crowded text labels
    const lastLabel = [-999, -999, -999];
    const glyphHits = [];
    (spec.vlines || []).slice().sort((a, b) => a.t - b.t).forEach((v) => {
      if (v.t < spec.xMin || v.t > spec.xMax) return;
      const px = x(v.t);
      const line = svgEl('line', { class: 'li-vline' + (v.cls ? ' ' + v.cls : ''), x1: px, x2: px, y1: spec.glyphs ? TOP : TOP - 4, y2: h - BOTTOM }, svg);
      if (v.label) svgEl('title', {}, line).textContent = v.label + ' \u00b7 ' + Li.shortDate(v.t);
      if (spec.glyphs) {
        const g = svgEl('g', { class: 'li-glyph' + (v.cls ? ' ' + v.cls : ''), transform: `translate(${px} ${TOP - 9})` }, svg);
        svgEl('circle', { r: 9 }, g);
        svgEl('text', { y: 3.5, 'text-anchor': 'middle' }, g).textContent = v.glyph || '\u2022';
        glyphHits.push({ g, v, px });
        return;
      }
      const row = lastLabel.findIndex((l) => px - l > 96);
      if (v.label && row >= 0) {
        lastLabel[row] = px;
        svgEl('text', { class: 'li-vlabel', x: px + 4, y: TOP + 6 + row * 11 }, svg).textContent = v.label.length > 16 ? v.label.slice(0, 15) + '\u2026' : v.label;
      }
    });
    // series: lines break where two consecutive recordings are further apart than gapMs (no interpolation across gaps)
    spec.series.forEach((s) => {
      const pts = s.pts.slice().sort((a, b) => a.t - b.t).filter((p) => p.v != null);
      if (s.kind !== 'dots' && pts.length > 1) {
        let d = '';
        let seg = [];
        const flush = () => { if (s.area && seg.length > 1) svgEl('path', { class: 'li-area li-s-' + (s.cls || 'a'), d: 'M' + x(seg[0].t).toFixed(1) + ' ' + (h - BOTTOM) + seg.map((q) => 'L' + x(q.t).toFixed(1) + ' ' + y(q.v).toFixed(1)).join('') + 'L' + x(seg[seg.length - 1].t).toFixed(1) + ' ' + (h - BOTTOM) + 'Z' }, svg); seg = []; };
        pts.forEach((p, i) => {
          const broken = i === 0 || p.t - pts[i - 1].t > (s.gapMs || Infinity);
          if (broken) flush();
          seg.push(p);
          d += (broken ? 'M' : 'L') + x(p.t).toFixed(1) + ' ' + y(p.v).toFixed(1);
        });
        flush();
        svgEl('path', { class: 'li-line li-s-' + (s.cls || 'a') + (s.dash ? ' dash' : ''), d }, svg);
      }
      if (s.kind !== 'line') pts.forEach((p) => svgEl('circle', { class: 'li-dot li-s-' + (s.cls || 'a') + (p.flag ? ' flag' : ''), cx: x(p.t), cy: y(p.v), r: s.r || 4.5 }, svg));
    });
    // hover
    const ring = svgEl('circle', { class: 'ha-dot', r: 7 }, svg);
    const tip = make('div', 'ha-tip');
    wrap.appendChild(tip);
    glyphHits.forEach(({ g, v, px }) => {
      g.addEventListener('pointerenter', () => { tip.textContent = (v.label || '') + ' \u00b7 ' + Li.shortDate(v.t); tip.classList.add('on'); const half = tip.offsetWidth / 2; tip.style.left = Math.max(14, Math.min(w + 14 - 2 * half, px + 14 - half)) + 'px'; tip.style.top = '0px'; });
      g.addEventListener('pointerleave', () => tip.classList.remove('on'));
    });
    const hit = spec.series.flatMap((s) => (s.noHover ? [] : s.pts.filter((p) => p.v != null).map((p) => ({ p, s }))));
    const show = (event) => {
      const box = svg.getBoundingClientRect();
      const px = event.clientX - box.left, py = event.clientY - box.top;
      let best = null;
      hit.forEach((c) => { const dist = Math.hypot(x(c.p.t) - px, (y(c.p.v) - py) * 0.5); if (!best || dist < best.dist) best = { c, dist }; });
      if (!best || best.dist > 36) { svg.classList.remove('hover'); tip.classList.remove('on'); return; }
      const { p, s } = best.c;
      ring.setAttribute('cx', x(p.t));
      ring.setAttribute('cy', y(p.v));
      svg.classList.add('hover');
      tip.textContent = p.tip || (Li.longDate(p.t) + ' · ' + (spec.yFmt ? spec.yFmt(p.v) : +p.v.toFixed(2)) + (spec.unit ? ' ' + spec.unit : ''));
      tip.classList.add('on');
      const half = tip.offsetWidth / 2;
      tip.style.left = Math.max(14, Math.min(w + 14 - 2 * half, x(p.t) + 14 - half)) + 'px';
      tip.style.top = Math.max(0, y(p.v) - 34) + 'px';
    };
    svg.addEventListener('pointermove', show);
    svg.addEventListener('pointerdown', show);
    svg.addEventListener('pointerleave', () => { svg.classList.remove('hover'); tip.classList.remove('on'); });
    // a legend when there is more than one series
    const names = spec.series.filter((s) => s.label);
    if (names.length) {
      const lg = make('div', 'li-legend');
      names.forEach((s) => { const i = make('span', 'li-key li-s-' + (s.cls || 'a') + (s.dash ? ' dash' : ''), s.label); lg.appendChild(i); });
      wrap.appendChild(lg);
    }
  }

  // ---- shell ---------------------------------------------------------------------------------------------------------
  const PRESETS = [['30', '30 days'], ['90', '90 days'], ['180', '6 months'], ['365', '1 year'], ['all', 'All']];

  function shell(root) {
    root.replaceChildren();
    root.classList.add('li-root');

    const bar = make('div', 'li-bar');
    const range = make('div', 'li-range');
    bar.appendChild(range);
    Li.bar = bar;
    const tabs = make('div', 'li-tabs');
    tabs.setAttribute('role', 'tablist');
    root.appendChild(tabs);
    root.appendChild(bar);
    const panels = make('div', 'li-panels');
    root.appendChild(panels);

    const mounted = new Set();
    const render = () => {
      const tab = Li.tabs.find((t) => t.id === Li.state.tab) || Li.tabs[0];
      Li.tabs.forEach((t) => { t.panel.hidden = t !== tab; });
      bar.hidden = !!tab.noRange;
      tabs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab.id)));
      if (!mounted.has(tab.id)) { mounted.add(tab.id); tab.mount(tab.panel); }
      tab.render().catch((e) => { tab.panel.replaceChildren(Li.note('Could not load this view: ' + e.message)); });
    };
    Li.refresh = () => { mounted.forEach((id) => { const t = Li.tabs.find((x) => x.id === id); if (t) t.stale = true; }); render(); };
    Li.tabs.forEach((t) => {
      t.panel = make('div', 'li-panel');
      t.panel.id = 'li-panel-' + t.id;
      t.panel.setAttribute('role', 'tabpanel');
      panels.appendChild(t.panel);
      const b = make('button', '', t.label);
      b.type = 'button';
      b.dataset.tab = t.id;
      b.dataset.n = '0' + (Li.tabs.indexOf(t) + 1);
      b.setAttribute('role', 'tab');
      b.addEventListener('click', () => { Li.state.tab = t.id; render(); });
      tabs.appendChild(b);
    });
    const drawRange = () => {
      range.replaceChildren();
      range.appendChild(make('span', 'li-range-label', 'Period'));
      PRESETS.forEach(([key, label]) => {
        const b = make('button', 'li-chip', label);
        b.type = 'button';
        b.setAttribute('aria-pressed', String(Li.state.preset === key));
        b.addEventListener('click', () => { Li.state.preset = key; drawRange(); Li.refresh(); });
        range.appendChild(b);
      });
    };
    drawRange();
    render();
  }

  async function start() {
    const root = document.getElementById('li-root');
    if (!root) return;
    try {
      Li.state.cfg = await api('/v1/lithium/config');
      Li._ready(Li);
    } catch (e) {
      root.appendChild(Li.note('Lithium monitoring could not load right now.'));
      return;
    }
    shell(root);
  }
  // the tab files register first; start once all scripts have run
  if (document.readyState === 'complete') setTimeout(start, 0);
  else document.addEventListener('DOMContentLoaded', start);
})();
