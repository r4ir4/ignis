// Small hand-drawn SVG charts for the check-in records pages. Exposes window.CkCharts. Charts are drawn at real pixel width (set CkCharts.width first).
(() => {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const sv = (tag, attrs, text) => { const e = document.createElementNS(NS, tag); Object.entries(attrs || {}).forEach(([k, v]) => e.setAttribute(k, v)); if (text != null) e.textContent = text; return e; };
  const INK = '#151210', ORANGE = '#ee5d1b', GRID = 'rgba(21,18,16,.12)';
  const H = 230, R = 8, T = 14, B = 30;
  const dayLabel = (d) => { const [, m, dd] = d.split('-'); return dd + '/' + m; };
  const dayLong = (d) => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' });
  const state = { width: 640 };
  // the palette for answers that have no good/bad order (custom choice questions): first option on top
  const PALETTE = ['#3f8a63', '#9cc48c', '#d8cf86', '#f0b27a', '#ee5d1b', '#b04a2a', '#7a6a8a', '#5a7a9a', '#8a8a8a', '#c9a0a0'];

  function frame(yMax, yLabels, n, rows, opts) {
    const W = state.width;
    const longest = yLabels.reduce((m, l) => Math.max(m, String(l[1]).length), 1);
    const left = (opts && opts.left) || Math.round(longest * 6.8 + 16), h = (opts && opts.h) || H;
    const svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + h, width: W, height: h, class: 'cd-svg', role: 'img' });
    const y = (v) => T + (h - T - B) * (1 - v / yMax);
    yLabels.forEach(([v, label]) => {
      svg.appendChild(sv('line', { x1: left, x2: W - R, y1: y(v), y2: y(v), stroke: GRID, 'stroke-width': 1 }));
      svg.appendChild(sv('text', { x: left - 12, y: y(v) + 4, 'text-anchor': 'end', class: 'cd-tick' }, label));
    });
    const pad = 14;
    const x = (i) => (n === 1 ? (left + W - R) / 2 : left + pad + (W - left - R - pad * 2) * (i / (n - 1)));
    const fit = Math.max(2, Math.floor((W - left) / 74)), step = Math.max(1, Math.ceil(n / fit));
    const idx = []; for (let i = 0; i < n; i += step) idx.push(i);
    if (idx[idx.length - 1] !== n - 1) { if (n - 1 - idx[idx.length - 1] < step * 0.6 && idx.length > 1) idx.pop(); idx.push(n - 1); }
    idx.forEach((i) => svg.appendChild(sv('text', { x: x(i), y: h - 8, 'text-anchor': 'middle', class: 'cd-tick' }, dayLabel(rows[i].day))));
    return { svg, x, y };
  }

  // numeric values over time: yMin..yMax with `ticks` grid lines; fmt turns a value into the label / tooltip text
  function lineChart(rows, key, yMin, yMax, ticks, fmt, name) {
    const pts = rows.map((r, i) => ({ i, v: r[key], r })).filter((p) => p.v !== null && p.v !== undefined);
    if (!pts.length) return mk('p', 'cd-empty', 'Sem dados ainda.');
    const span = yMax - yMin || 1;
    const labels = []; for (let k = 0; k < ticks; k++) { const v = yMin + span * k / (ticks - 1); labels.push([(v - yMin) / span * span, fmt(v)]); }
    const { svg, x, y } = frame(span, labels.map(([v, l]) => [v, l]), rows.length, rows);
    const Y = (v) => y(v - yMin);
    if (pts.length > 1) svg.appendChild(sv('polyline', { points: pts.map((p) => x(p.i) + ',' + Y(p.v)).join(' '), fill: 'none', stroke: ORANGE, 'stroke-width': 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    pts.forEach((p) => {
      const c = sv('circle', { cx: x(p.i), cy: Y(p.v), r: 5, fill: INK, stroke: '#f7e9d7', 'stroke-width': 2 });
      c.appendChild(sv('title', {}, dayLong(p.r.day) + ' · ' + name + ': ' + fmt(p.v)));
      svg.appendChild(c);
    });
    const wrap = mk('div', 'cd-chart'); wrap.appendChild(svg); return wrap;
  }

  // one dot per answer at the height of the option chosen (first option on top), joined by a thin line
  function levelChart(rows, key, names, colors) {
    const order = names.map((_, i) => i);
    const pts = rows.filter((r) => r[key] !== null && r[key] !== undefined && order.includes(r[key])).map((r) => ({ i: rows.indexOf(r), v: order.length - 1 - r[key], a: r[key], r }));
    if (!pts.length) return mk('p', 'cd-empty', 'Sem dados ainda.');
    const top = order.length - 1;
    const { svg, x, y } = frame(top, order.map((lvl, pos) => [top - pos, names[lvl]]), rows.length, rows, { h: order.length <= 2 ? 150 : Math.min(300, 70 + order.length * 40) });
    if (pts.length > 1) svg.appendChild(sv('polyline', { points: pts.map((p) => x(p.i) + ',' + y(p.v)).join(' '), fill: 'none', stroke: 'rgba(21,18,16,.28)', 'stroke-width': 1.5, 'stroke-linejoin': 'round' }));
    pts.forEach((p) => {
      const c = sv('circle', { cx: x(p.i), cy: y(p.v), r: 7.5, fill: colors[p.a], stroke: '#f7e9d7', 'stroke-width': 2 });
      c.appendChild(sv('title', {}, dayLong(p.r.day) + ': ' + names[p.a]));
      svg.appendChild(c);
    });
    const wrap = mk('div', 'cd-chart'); wrap.appendChild(svg); return wrap;
  }

  // a stacked horizontal bar for one question, with its legend; values are option indexes
  function distribution(values, labels, colors) {
    const total = values.length;
    const box = mk('div', 'cd-dist');
    if (!total) return box;
    const counts = labels.map((_, i) => values.filter((v) => v === i).length);
    const bar = mk('div', 'cd-stack'); bar.setAttribute('role', 'img'); bar.setAttribute('aria-label', labels.map((l, i) => l + ' ' + counts[i]).join(', '));
    counts.forEach((c, i) => { if (!c) return; const s = mk('i'); s.style.flex = String(c); s.style.background = colors[i]; s.title = labels[i] + ': ' + c; bar.appendChild(s); });
    const legend = mk('ul', 'cd-legend');
    counts.forEach((c, i) => { const li = mk('li'); const dot = mk('i'); dot.style.background = colors[i]; li.append(dot, mk('span', '', labels[i]), mk('b', '', c + ' · ' + Math.round(c / total * 100) + '%')); legend.appendChild(li); });
    box.append(bar, legend);
    return box;
  }

  function card(title, sub, body) {
    const c = mk('section', 'cd-card'); c.appendChild(mk('h2', '', title)); if (sub) c.appendChild(mk('p', 'cd-cardsub', sub)); c.appendChild(body); return c;
  }

  window.CkCharts = { state, lineChart, levelChart, distribution, card, PALETTE, dayLabel, dayLong };
})();
