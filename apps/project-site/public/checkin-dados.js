// Venvanse check-in records: every saved check-in, as numbers and small hand-drawn SVG charts. Read only.
// New questionnaire = q46..q50. Older check-ins (q1..q45, the long form) only feed the focus chart, as the average of the four attention questions (q1..q4).
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const NS = 'http://www.w3.org/2000/svg';
  const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const sv = (tag, attrs, text) => { const e = document.createElementNS(NS, tag); Object.entries(attrs || {}).forEach(([k, v]) => e.setAttribute(k, v)); if (text != null) e.textContent = text; return e; };
  const INK = '#151210', ORANGE = '#ee5d1b', MUTED = 'rgba(21,18,16,.55)', GRID = 'rgba(21,18,16,.12)';

  const FOCUS = ['Muito ruim', 'Ruim', 'Razoável', 'Bom', 'Muito bom'];
  const TASKS = ['Todas', 'A maior parte', 'Uma ou duas', 'Nenhuma'];
  const ATE = ['Sim', 'Não'];
  const SLEEPY = ['Sim, e dormi', 'Sim, mas não dormi', 'Não'];
  const ENOUGH = ['Sim', 'Mais ou menos', 'Poderia ser melhor', 'Não'];
  const GOODBAD = ['#3f8a63', '#9cc48c', '#f0b27a', ORANGE];   // first option best, last worst

  const num = (v) => (v === undefined || v === null || v === '' || isNaN(+v) ? null : +v);
  const dayLabel = (d) => { const [y, m, dd] = d.split('-'); return dd + '/' + m; };
  const dayLong = (d) => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' });
  const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
  const f1 = (n) => (n === null ? '–' : n.toFixed(1).replace('.', ','));

  function parse(row) {
    const a = row.answers || {};
    const r = { day: row.day, focus: num(a.q46), tasks: num(a.q47), ate: num(a.q48), sleepy: num(a.q49), enough: num(a.q50), legacy: false };
    r.done = r.tasks === null ? null : 3 - r.tasks;   // stored 0 = Todas ... 3 = Nenhuma; for the chart taller means more done
    if (r.focus === null) {
      const old = ['q1', 'q2', 'q3', 'q4'].map((k) => num(a[k])).filter((x) => x !== null);
      if (old.length) { r.focus = avg(old); r.legacy = true; }
    }
    return r;
  }

  // ---- charts -------------------------------------------------------------------------------------------------------------------------------------------
  let W = 640;                                  // drawing width in real pixels, measured in render() so text is never scaled
  const H = 230, R = 8, T = 14, B = 30;
  function frame(yMax, yLabels, n, rows, opts) {
    const longest = yLabels.reduce((m, l) => Math.max(m, String(l[1]).length), 1);
    const left = (opts && opts.left) || Math.round(longest * 6.8 + 16), h = (opts && opts.h) || H;
    const svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + h, width: W, height: h, class: 'cd-svg', role: 'img' });
    const y = (v) => T + (h - T - B) * (1 - v / yMax);
    yLabels.forEach(([v, label]) => {
      svg.appendChild(sv('line', { x1: left, x2: W - R, y1: y(v), y2: y(v), stroke: GRID, 'stroke-width': 1 }));
      svg.appendChild(sv('text', { x: left - 12, y: y(v) + 4, 'text-anchor': 'end', class: 'cd-tick' }, label));
    });
    const pad = 14;   // the first and last point sit a little inside the plot, so their dots are never clipped
    const x = (i) => (n === 1 ? (left + W - R) / 2 : left + pad + (W - left - R - pad * 2) * (i / (n - 1)));
    // date labels evenly spread, as many as fit with room between them, always including the first and the last
    const fit = Math.max(2, Math.floor((W - left) / 74)), step = Math.max(1, Math.ceil(n / fit));
    const idx = []; for (let i = 0; i < n; i += step) idx.push(i);
    if (idx[idx.length - 1] !== n - 1) { if (n - 1 - idx[idx.length - 1] < step * 0.6 && idx.length > 1) idx.pop(); idx.push(n - 1); }
    idx.forEach((i) => svg.appendChild(sv('text', { x: x(i), y: h - 8, 'text-anchor': 'middle', class: 'cd-tick' }, dayLabel(rows[i].day))));
    return { svg, x, y };
  }

  function lineChart(rows, key, yMax, yLabels, name) {
    const pts = rows.map((r, i) => ({ i, v: r[key], r })).filter((p) => p.v !== null);
    if (!pts.length) return mk('p', 'cd-empty', 'Sem dados ainda.');
    const { svg, x, y } = frame(yMax, yLabels, rows.length, rows, { left: 28 });
    const solid = pts.filter((p) => !p.r.legacy);
    if (pts.length > 1) svg.appendChild(sv('polyline', { points: pts.map((p) => x(p.i) + ',' + y(p.v)).join(' '), fill: 'none', stroke: ORANGE, 'stroke-width': 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    pts.forEach((p) => {
      const c = sv('circle', { cx: x(p.i), cy: y(p.v), r: 5, fill: p.r.legacy ? '#f7e9d7' : INK, stroke: p.r.legacy ? ORANGE : '#f7e9d7', 'stroke-width': 2 });
      c.appendChild(sv('title', {}, dayLong(p.r.day) + ' · ' + name + ': ' + f1(p.v) + (p.r.legacy ? ' (questionário antigo)' : '')));
      svg.appendChild(c);
    });
    const wrap = mk('div', 'cd-chart'); wrap.appendChild(svg);
    if (pts.length !== solid.length) wrap.appendChild(mk('p', 'cd-note', '○ Círculo vazio: check-in do questionário antigo (média das 4 perguntas de atenção).'));
    return wrap;
  }

  // one dot per check-in at the height of the answer given (best answer on top), joined by a thin line
  function levelChart(rows, key, order, names, colors) {
    const pts = rows.filter((r) => r[key] !== null && order.includes(r[key])).map((r) => ({ i: rows.indexOf(r), v: order.length - 1 - order.indexOf(r[key]), a: r[key], r }));
    if (!pts.length) return mk('p', 'cd-empty', 'Sem dados ainda.');
    const top = order.length - 1;
    const { svg, x, y } = frame(top, order.map((lvl, pos) => [top - pos, names[lvl]]), rows.length, rows, { h: order.length <= 2 ? 150 : 230 });
    if (pts.length > 1) svg.appendChild(sv('polyline', { points: pts.map((p) => x(p.i) + ',' + y(p.v)).join(' '), fill: 'none', stroke: 'rgba(21,18,16,.28)', 'stroke-width': 1.5, 'stroke-linejoin': 'round' }));
    pts.forEach((p) => {
      const c = sv('circle', { cx: x(p.i), cy: y(p.v), r: 7.5, fill: colors[p.a], stroke: '#f7e9d7', 'stroke-width': 2 });
      c.appendChild(sv('title', {}, dayLong(p.r.day) + ': ' + names[p.a]));
      svg.appendChild(c);
    });
    const wrap = mk('div', 'cd-chart'); wrap.appendChild(svg); return wrap;
  }

  // a stacked horizontal bar for a single multiple-choice question, with its legend
  function distribution(values, labels, colors) {
    const total = values.length;
    const box = mk('div', 'cd-dist');
    if (!total) { box.appendChild(mk('p', 'cd-empty', 'Sem dados ainda.')); return box; }
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

  // ---- page ---------------------------------------------------------------------------------------------------------------------------------------------
  let ROWS = null;
  function render(rows) {
    ROWS = rows;
    const root = $('cdBody'); root.replaceChildren();
    W = Math.max(260, root.clientWidth - 2 - (window.innerWidth <= 700 ? 32 : 52));   // card width minus its border and padding
    if (!rows.length) { root.appendChild(mk('p', 'cd-empty', 'Nenhum check-in salvo ainda. Faça o primeiro em Check-in.')); return; }
    const fresh = rows.filter((r) => !r.legacy && (r.tasks !== null || r.ate !== null || r.sleepy !== null || r.enough !== null || r.focus !== null));
    const focusVals = rows.map((r) => r.focus).filter((v) => v !== null);
    const done = fresh.map((r) => r.tasks).filter((v) => v !== null);
    const enoughYes = fresh.map((r) => r.enough).filter((v) => v !== null);

    // header line: how many check-ins and over which period
    const sub = document.querySelector('.cd-sub');
    if (sub) sub.textContent = 'Venvanse · ' + rows.length + (rows.length === 1 ? ' check-in' : ' check-ins') + ' · ' + dayLabel(rows[0].day) + (rows.length > 1 ? ' a ' + dayLabel(rows[rows.length - 1].day) : '');

    // summary tiles: four short numbers, every label at most two lines so the row stays even
    const tiles = mk('div', 'cd-tiles');
    const tile = (big, small, hint) => { const t = mk('div', 'cd-tile' + (big === '–' ? ' cd-nodata' : '')); t.append(mk('b', '', big), mk('small', '', small)); if (hint) t.title = hint; return t; };
    const pct = (n, d) => Math.round(n / d * 100) + '%';
    tiles.append(
      tile(String(rows.length), rows.length === 1 ? 'check-in' : 'check-ins'),
      tile(focusVals.length ? f1(avg(focusVals)) + ' / 4' : '–', 'foco médio', 'Média da nota de foco, de 0 a 4'),
      tile(done.length ? pct(done.filter((v) => v <= 1).length, done.length) : '–', 'tarefas em dia', 'Dias em que você concluiu todas ou a maior parte das tarefas da lista'),
      tile(enoughYes.length ? pct(enoughYes.filter((v) => v === 0).length, enoughYes.length) : '–', 'dias suficientes', 'Dias em que você achou o efeito suficiente para o dia'));
    root.appendChild(tiles);

    // one card per question: the answers over time, then how often each answer was given.
    // Questions with no answers yet are gathered into a single note instead of one empty card each.
    const FOCUSC = ['#ee5d1b', '#f0b27a', '#d8cf86', '#9cc48c', '#3f8a63'];
    const vals = (key) => fresh.map((r) => r[key]).filter((v) => v !== null);
    const QS = [
      ['Como avalio o foco hoje?', 'Nota de 0 (muito ruim) a 4 (muito bom).', 'focus', () => lineChart(rows, 'focus', 4, FOCUS.map((l, i) => [i, String(i)]), 'foco'), FOCUS, FOCUSC],
      ['Quantas tarefas da lista eu concluí?', 'Cada ponto é um dia; quanto mais alto, mais tarefas.', 'tasks', () => levelChart(rows, 'tasks', [0, 1, 2, 3], TASKS, GOODBAD), TASKS, GOODBAD],
      ['Eu comi antes de tomar o remédio?', 'Cada ponto é um dia.', 'ate', () => levelChart(rows, 'ate', [0, 1], ATE, [GOODBAD[0], GOODBAD[3]]), ATE, [GOODBAD[0], GOODBAD[3]]],
      ['Senti sono ao passar o efeito da primeira dose?', 'Cada ponto é um dia; no alto, sem sono.', 'sleepy', () => levelChart(rows, 'sleepy', [2, 1, 0], SLEEPY, [GOODBAD[3], GOODBAD[2], GOODBAD[0]]), SLEEPY, [GOODBAD[3], GOODBAD[2], GOODBAD[0]]],
      ['Achei suficiente para o dia?', 'Cada ponto é um dia; no alto, foi suficiente.', 'enough', () => levelChart(rows, 'enough', [0, 1, 2, 3], ENOUGH, GOODBAD), ENOUGH, GOODBAD]];
    const waiting = [];
    QS.forEach(([title, hint, key, chart, names, colors]) => {
      if (key !== 'focus' && !vals(key).length) { waiting.push(title); return; }
      const w = mk('div', 'cd-qbody'); w.appendChild(chart());
      if (vals(key).length) w.appendChild(distribution(vals(key), names, colors));
      root.appendChild(card(title, hint, w));
    });
    if (waiting.length) {
      const note = mk('div', 'cd-wait');
      note.appendChild(mk('p', '', 'Estas perguntas são do formulário novo e ainda não têm respostas. Os gráficos aparecem depois do próximo check-in.'));
      const ul = mk('ul'); waiting.forEach((t) => ul.appendChild(mk('li', '', t))); note.appendChild(ul);
      root.appendChild(card('Aguardando respostas', null, note));
    }

    // does eating first show up in focus?
    const ateF = fresh.filter((r) => r.ate === 0 && r.focus !== null).map((r) => r.focus);
    const skipF = fresh.filter((r) => r.ate === 1 && r.focus !== null).map((r) => r.focus);
    if (ateF.length && skipF.length) {
      const b = mk('div', 'cd-compare');
      [['Comeu antes', ateF], ['Não comeu antes', skipF]].forEach(([label, vals]) => {
        const item = mk('div', 'cd-cmp'); item.append(mk('b', '', f1(avg(vals))), mk('small', '', label + ' · foco médio · ' + vals.length + (vals.length === 1 ? ' dia' : ' dias')));
        b.appendChild(item);
      });
      root.appendChild(card('Comer antes muda o foco?', 'Média de foco nos dias em que você comeu antes ou não. Com poucos dias, isso é só um indício.', b));
    }

  }

  async function load() {
    try {
      const res = await fetch('api/v1/checkins/venvanse?limit=400');
      if (!res.ok) throw new Error(res.status);
      const items = (await res.json()).items || [];
      const full = await Promise.all(items.map((it) => fetch('api/v1/checkins/venvanse/' + it.day).then((r) => (r.ok ? r.json() : null)).catch(() => null)));
      const rows = full.filter(Boolean).map(parse).sort((a, b) => (a.day < b.day ? -1 : 1));
      render(rows);
    } catch (e) {
      $('cdBody').replaceChildren(mk('p', 'cd-empty', 'Não foi possível carregar os check-ins agora.'));
    }
  }
  load();
  let lastW = window.innerWidth;
  window.addEventListener('resize', () => { if (ROWS && Math.abs(window.innerWidth - lastW) > 20) { lastW = window.innerWidth; render(ROWS); } });
})();
