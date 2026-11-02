// Health page: reads the wearable data (Whoop) from the shared backend and draws it.
(() => {
  const $ = (id) => document.getElementById(id);
  const HOUR = 3600e3;

  async function api(path) {
    const res = await fetch('api' + path);
    if (!res.ok) throw new Error(res.status);
    return res.json();
  }

  const hm = (min) => {
    const m = Math.round(min);
    return Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'm';
  };
  const ago = (iso) => {
    const mins = Math.max(0, Math.round((Date.now() - new Date(iso)) / 60000));
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + ' min ago';
    if (mins < 1440) return Math.floor(mins / 60) + ' h ago';
    const days = Math.floor(mins / 1440);
    return days + (days === 1 ? ' day ago' : ' days ago');
  };
  const dayLabel = (iso) =>
    new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  // A night is filed under the moment it began, so "last night" is anything from the past ~36 hours.
  const night = (iso) => (Date.now() - new Date(iso) < 36 * HOUR ? 'Last night' : dayLabel(iso));
  const today = (iso) => (Date.now() - new Date(iso) < 24 * HOUR ? 'Today so far' : dayLabel(iso));

  const val = (overview, metric) => overview.latest[metric];
  const set = (id, text) => { $(id).textContent = text; };

  function sparkline(svg, points, days) {
    svg.replaceChildren();
    points = points.filter((p) => Date.now() - new Date(p[0]) <= days * 24 * HOUR);
    if (points.length < 2) return;
    const NS = 'http://www.w3.org/2000/svg';
    const t1 = Date.now();
    const t0 = t1 - days * 24 * HOUR;
    const ys = points.map((p) => p[1]);
    const lo = Math.min(...ys);
    const hi = Math.max(...ys);
    const span = hi - lo || 1;
    const x = (iso) => 4 + ((new Date(iso) - t0) / (t1 - t0)) * 192;
    const y = (v) => 40 - ((v - lo) / span) * 32;
    const add = (cls, d) => {
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('class', cls);
      p.setAttribute('d', d);
      svg.appendChild(p);
    };
    add('base', `M4 44H196`);
    add('line', points.map((p, i) => (i ? 'L' : 'M') + x(p[0]).toFixed(1) + ' ' + y(p[1]).toFixed(1)).join(''));
    const last = points[points.length - 1];
    add('dot', `M${x(last[0]).toFixed(1)} ${y(last[1]).toFixed(1)}h0`);
  }

  // The at-a-glance pills in the banner.
  function pills(o, b) {
    const items = [];
    const rec = val(o, 'recovery_score');
    const slp = val(o, 'sleep_minutes');
    const str = val(o, 'strain');
    const hrv = val(o, 'hrv_ms');
    if (rec) items.push(['Recovery', Math.round(rec.value) + '%', 'p-lime']);
    if (slp) items.push(['Sleep', hm(slp.value), 'p-lime']);
    if (str) items.push(['Strain', str.value.toFixed(1), 'p-lime']);
    if (hrv) items.push(['HRV', Math.round(hrv.value) + ' ms', 'p-lime']);
    const g = b && b.garmin && b.garmin.latest;
    const est = b && b.latest && b.latest.now != null ? b.latest.now : null;
    const level = g && Date.now() - new Date(g.day) < 60 * HOUR ? g.now : est;
    if (level != null) items.push(['Battery', level + '%', 'p-pink']);
    const list = $('hPills');
    list.replaceChildren();
    items.forEach(([name, value, cls], i) => {
      const li = document.createElement('li');
      li.className = cls;
      li.style.setProperty('--i', i);
      li.append(name + ' ');
      const strong = document.createElement('b');
      strong.textContent = value;
      li.appendChild(strong);
      list.appendChild(li);
    });
  }

  function recovery(o, days) {
    const r = val(o, 'recovery_score');
    if (!r) return;
    set('vRecovery', Math.round(r.value));
    set('wRecovery', night(r.measured_at) + ' · ' + (r.value >= 67 ? 'Strong' : r.value >= 34 ? 'Moderate' : 'Low'));
    const bars = $('sRecovery');
    bars.replaceChildren();
    o.series.recovery_score.slice(-30).forEach(([, score], i) => {
      const pill = document.createElement('i');
      pill.style.setProperty('--h', Math.max(0, Math.min(100, score)) + '%');
      pill.style.setProperty('--i', i);
      bars.appendChild(pill);
    });
  }

  // The "Last 14 nights" card: the average as the big number, the chart, and the best and shortest night.
  function nightsCard(o) {
    const recent = o.series.sleep_minutes.slice(-14);
    if (recent.length < 2) return;
    $('cNights').hidden = false;
    const values = recent.map((r) => r[1]);
    const avg = Math.round(values.reduce((s, v) => s + v, 0) / values.length);
    set('vAvgH', Math.floor(avg / 60));
    set('vAvgM', String(avg % 60).padStart(2, '0'));
    $('uAvgM').hidden = false;

    // Hours above each bar, the weekday under it (the day you woke up).
    const nights = $('nights');
    nights.replaceChildren();
    recent.forEach(([stamp, minutes], i) => {
      const wake = new Date(new Date(stamp).getTime() + 12 * HOUR);
      const col = document.createElement('div');
      col.className = 'hs-n' + (i === recent.length - 1 ? ' today' : '');
      col.title = wake.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' }) + ': ' + hm(minutes);
      const hours = document.createElement('em');
      hours.textContent = (minutes / 60).toFixed(1);
      const track = document.createElement('div');
      track.className = 'hs-track';
      const bar = document.createElement('i');
      bar.className = 'hs-bar';
      bar.style.setProperty('--h', Math.min(100, (minutes / 540) * 100) + '%');
      bar.style.setProperty('--i', i);
      track.appendChild(bar);
      const day = document.createElement('span');
      day.textContent = wake.toLocaleDateString(undefined, { weekday: 'narrow' });
      col.append(hours, track, day);
      nights.appendChild(col);
    });

    const stats = $('nightStats');
    stats.replaceChildren();
    [['Best', hm(Math.max(...values)), 'p-lime'], ['Shortest', hm(Math.min(...values)), 'p-flame']].forEach(([name, value, cls], i) => {
      const li = document.createElement('li');
      li.className = cls;
      li.style.setProperty('--i', i);
      li.append(name + ' ');
      const strong = document.createElement('b');
      strong.textContent = value;
      li.appendChild(strong);
      stats.appendChild(li);
    });
    const goal = document.createElement('li');
    goal.className = 'p-goal';
    goal.style.setProperty('--i', 2);
    goal.textContent = 'Dashed line = 8 h';
    stats.appendChild(goal);
  }

  // Strain: the number, 21 capsules filled to it (the last, part-filled one in pink), and Whoop's four zones with yours lit.
  function strainCard(o) {
    const s = val(o, 'strain');
    if (!s) return;
    const v = s.value;
    set('vStrain', v.toFixed(1));
    set('wStrain', today(s.measured_at));
    const gauge = $('strainGauge');
    gauge.replaceChildren();
    for (let i = 0; i < 21; i++) {
      const cap = document.createElement('i');
      cap.style.setProperty('--p', Math.max(0, Math.min(1, v - i)).toFixed(2));
      cap.style.setProperty('--i', i);
      if (v > i && v < i + 1) cap.classList.add('now');
      gauge.appendChild(cap);
    }
    const zones = [['Light', '0–9', 0, 10], ['Moderate', '10–13', 10, 14], ['High', '14–17', 14, 18], ['All out', '18–21', 18, 22]];
    const list = $('strainZones');
    list.replaceChildren();
    zones.forEach(([name, range, lo, hi]) => {
      const li = document.createElement('li');
      li.textContent = name;
      const small = document.createElement('small');
      small.textContent = range;
      li.appendChild(small);
      if (v >= lo && v < hi) li.classList.add('on');
      list.appendChild(li);
    });
  }

  // The little "i" buttons. A mouse hover previews the explanation; a click (or a tap, or Enter) pins it open and a second
  // click closes it; keyboard focus shows it too. Escape, or pressing anywhere else, closes it.
  function infoButtons() {
    document.querySelectorAll('.h-info').forEach((btn) => {
      const pop = document.getElementById(btn.getAttribute('aria-controls'));
      if (!pop) return;
      let pinned = false;
      const show = (open) => { pop.classList.toggle('on', open); btn.setAttribute('aria-expanded', String(open)); };
      btn.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') show(true); });
      btn.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !pinned) show(false); });
      btn.addEventListener('focus', () => { if (btn.matches(':focus-visible')) show(true); });
      btn.addEventListener('blur', () => { if (!pinned) show(false); });
      btn.addEventListener('click', () => { pinned = !pinned; show(pinned); });
      btn.addEventListener('keydown', (e) => { if (e.key === 'Escape') { pinned = false; show(false); btn.blur(); } });
      document.addEventListener('pointerdown', (e) => {
        if (e.target === btn || pop.contains(e.target)) return;
        pinned = false;
        show(false);
      });
    });
  }

  function sleep(o) {
    const total = val(o, 'sleep_minutes');
    if (!total) return;
    const mins = Math.round(total.value);
    set('vSleepH', Math.floor(mins / 60));
    set('vSleepM', String(mins % 60).padStart(2, '0'));
    $('uSleepM').hidden = false;
    set('wSleep', night(total.measured_at));

    // Stages as rounded tiles, as wide as their share of the night.
    const stages = $('stages');
    stages.replaceChildren();
    const deep = val(o, 'deep_sleep_minutes');
    const rem = val(o, 'rem_sleep_minutes');
    if (deep && rem) {
      const light = Math.max(0, total.value - deep.value - rem.value);
      [['deep', 'Deep', deep.value], ['rem', 'REM', rem.value], ['light', 'Light', light]].forEach(([key, name, min], i) => {
        const li = document.createElement('li');
        li.className = 'st-' + key;
        li.style.setProperty('--g', Math.max(0.2, min / total.value).toFixed(3));
        li.style.setProperty('--i', i);
        const label = document.createElement('span');
        label.textContent = name;
        const share = document.createElement('i');
        share.textContent = Math.round((min / total.value) * 100) + '%';
        label.appendChild(share);
        const time = document.createElement('b');
        time.textContent = hm(min);
        li.append(label, time);
        stages.appendChild(li);
      });
    }

    nightsCard(o);
  }

  function simple(o, metric, valueId, whenId, sparkId, days, fmt, label) {
    const m = val(o, metric);
    if (!m) return;
    set(valueId, fmt(m.value));
    set(whenId, label(m.measured_at));
    if (sparkId) sparkline($(sparkId), o.series[metric], days);
  }

  // The "Vitals" card: four tiles, each with its own little visual. Tiles without a reading are hidden.
  function extras(o) {
    const card = $('cMore');
    let shown = 0;
    // fmt returns [number, unit]; the unit is drawn smaller next to the number.
    const tile = (id, metric, fmt, after) => {
      const m = val(o, metric);
      const li = $(id);
      li.hidden = !m;
      if (!m) return;
      shown++;
      const [number, unit] = fmt(m.value);
      const el = li.querySelector('.bv-val');
      el.textContent = number;
      if (unit) {
        const small = document.createElement('small');
        small.textContent = unit;
        el.appendChild(small);
      }
      if (after) after(m);
    };
    tile('tEff', 'sleep_efficiency', (v) => [Math.round(v), '%'], (m) => $('mEff').style.setProperty('--w', Math.min(100, m.value) + '%'));
    // Blood oxygen: the meter spans 90-100%, since that is where the readings that matter live.
    tile('tSpo2', 'spo2', (v) => [Math.round(v), '%'], (m) => $('mSpo2').style.setProperty('--w', Math.max(0, Math.min(100, (m.value - 90) * 10)) + '%'));
    // Breathing: the circle breathes in and out at your own rate.
    tile('tResp', 'respiratory_rate', (v) => [v.toFixed(1), '/min'], (m) => card.style.setProperty('--breath', (60 / Math.max(4, m.value)).toFixed(2) + 's'));
    tile('tWeight', 'weight_kg', (v) => [v.toFixed(1), 'kg'], (m) => set('wWeight', dayLabel(m.measured_at)));
    card.hidden = shown === 0;
  }

  function battery(b, days) {
    // Garmin's own number when the watch was worn in the last couple of days, else the Whoop estimate.
    const g = b.garmin && b.garmin.latest;
    const useGarmin = !!g && Date.now() - new Date(g.day) < 60 * HOUR;
    const est = b.latest && b.latest.now != null ? b.latest : null;
    if (!useGarmin && !est) return;

    $('cBattery').hidden = false;
    const value = useGarmin ? g.now : est.now;
    countUp($('vBattery'), value);
    document.querySelectorAll('#bFlower .petal').forEach((petal, n) => petal.classList.toggle('on', value > n * 20 + 10));

    const charged = useGarmin ? g.charged : est.charged;
    const drained = useGarmin ? g.drained : est.drained;
    const items = [[useGarmin ? 'Garmin · ' + (sameDay(g.day) ? 'today' : dayLabel(g.day)) : 'Whoop estimate', '', 'p-egg']];
    if (charged != null) items.push(['Charged', '+' + charged, 'p-lime']);
    if (drained != null) items.push(['Drained', '−' + drained, 'p-ultra']);
    if (useGarmin && est) items.push(['Whoop estimate', est.now + '%', 'p-ink']);
    const pillsEl = $('bPills');
    pillsEl.replaceChildren();
    items.forEach(([name, amount, cls], i) => {
      const li = document.createElement('li');
      li.className = cls;
      li.style.setProperty('--i', i);
      li.append(name);
      if (amount) {
        const strong = document.createElement('b');
        strong.textContent = amount;
        li.appendChild(strong);
      }
      pillsEl.appendChild(li);
    });

    // The last seven days, oldest to newest, on a 0-100 scale: one bar per day running from that day's low to its
    // high, with the two numbers printed at the ends of the bar. Days without a reading get a short grey dash.
    const key = (d) => d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
    const ranges = new Map();
    if (useGarmin) {
      b.garmin.days.forEach((d) => { if (d.high != null && d.low != null) ranges.set(key(new Date(d.day)), [d.low, d.high]); });
    } else {
      b.days.forEach((d) => { if (d.now != null) ranges.set(key(new Date(new Date(d.night).getTime() + 12 * HOUR)), [d.now, d.charged]); });
    }
    const make = (tag, cls, text) => {
      const el = document.createElement(tag);
      if (cls) el.className = cls;
      if (text != null) el.textContent = text;
      return el;
    };
    const wrap = $('bDays');
    wrap.replaceChildren();

    const axis = make('div', 'hb-axis');
    [100, 50, 0].forEach((v) => {
      const mark = make('i', '', v);
      mark.style.setProperty('--v', v);
      axis.appendChild(mark);
    });

    const body = make('div', 'hb-body');
    [100, 50, 0].forEach((v) => {
      const line = make('div', 'hb-line');
      line.style.setProperty('--v', v);
      body.appendChild(line);
    });
    const cols = make('div', 'hb-cols');
    for (let n = 6; n >= 0; n--) {
      const day = new Date(Date.now() - n * 24 * HOUR);
      const range = ranges.get(key(day));
      const col = make('div', 'hb-d' + (n === 0 ? ' today' : ''));
      col.title = day.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' }) + (range ? ': low ' + range[0] + '%, high ' + range[1] + '%' : ': no reading');
      const track = make('div', 'hb-track');
      if (range) {
        const bar = make('i', 'hb-bar');
        const hi = make('em', 'hb-hi', range[1]);
        const lo = make('em', 'hb-lo', range[0]);
        [bar, hi, lo].forEach((el) => { el.style.setProperty('--hi', range[1]); el.style.setProperty('--lo', range[0]); });
        bar.style.setProperty('--i', 6 - n);
        track.append(bar, hi, lo);
      } else {
        track.appendChild(make('i', 'hb-none'));
      }
      col.append(track, make('span', '', day.toLocaleDateString(undefined, { weekday: 'short' })));
      cols.appendChild(col);
    }
    body.appendChild(cols);
    wrap.append(axis, body);
  }

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

  const sameDay = (iso) => new Date(iso).toDateString() === new Date().toDateString();

  const dayKey = (d) => d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();

  // A reusable line chart: a line over a soft area that draws itself in, an optional dashed reference line and an optional
  // "typical range" band, a dot on the latest reading, and a hover / touch tooltip. A gap of more than three days breaks
  // the line instead of being drawn across. Options: points [[iso, value]], days, zero (start the scale at 0), goal
  // {value, label}, band {lo, hi}, format(point) -> tooltip text.
  function lineChart(wrap, opts) {
    wrap._lc = { opts, fresh: true };
    drawLine(wrap);
    if (window.ResizeObserver && !wrap._observed) {
      wrap._observed = true;
      new ResizeObserver(() => drawLine(wrap)).observe(wrap);
    }
  }

  function drawLine(wrap) {
    const state = wrap._lc;
    if (!state) return;
    const { points, days, zero, goal, band, format } = state.opts;
    const w = wrap.clientWidth - 28;
    const h = wrap.clientHeight - 26;
    if (w < 40 || h < 40) return;
    const NS = 'http://www.w3.org/2000/svg';
    const now = Date.now();
    const t0 = now - days * 24 * HOUR;
    const pts = points
      .map(([stamp, v]) => ({ t: Math.min(new Date(stamp).getTime(), now), v }))
      .filter((p) => p.t >= t0)
      .sort((x, y) => x.t - y.t);
    wrap.replaceChildren();
    if (!pts.length) return;
    const values = pts.map((p) => p.v).concat(goal ? [goal.value] : [], band ? [band.lo, band.hi] : []);
    const hi = Math.max(...values) * 1.06;
    const lo = zero ? 0 : Math.min(...values) * 0.94;
    const PAD = 6;
    const x = (t) => PAD + ((t - t0) / (now - t0)) * (w - 2 * PAD);
    const y = (v) => h - 4 - ((v - lo) / (hi - lo || 1)) * (h - 16);
    const el = (name, attrs, parent) => {
      const node = document.createElementNS(NS, name);
      Object.entries(attrs || {}).forEach(([k, v]) => node.setAttribute(k, v));
      if (parent) parent.appendChild(node);
      return node;
    };

    const svg = el('svg', { class: 'ha-svg' + (state.fresh ? ' fresh' : ''), width: w, height: h, viewBox: `0 0 ${w} ${h}` });
    svg.style.margin = '0';
    wrap.appendChild(svg);

    if (band) el('rect', { class: 'ha-band', x: 0, width: w, y: y(band.hi), height: Math.max(2, y(band.lo) - y(band.hi)), rx: 8 }, svg);
    if (goal) {
      const gy = y(goal.value);
      el('line', { class: 'ha-goal', x1: 0, x2: w, y1: gy, y2: gy }, svg);
      el('text', { class: 'ha-goal-text', x: 2, y: gy - 5 }, svg).textContent = goal.label;
    }

    // segments, broken at gaps
    const segs = [];
    pts.forEach((p, i) => {
      if (!i || p.t - pts[i - 1].t > 3.5 * 24 * HOUR) segs.push([p]);
      else segs[segs.length - 1].push(p);
    });
    segs.forEach((seg) => {
      if (seg.length < 2) {
        el('circle', { class: 'ha-lone', cx: x(seg[0].t), cy: y(seg[0].v), r: 2.6 }, svg);
        return;
      }
      const line = seg.map((p, i) => (i ? 'L' : 'M') + x(p.t).toFixed(1) + ' ' + y(p.v).toFixed(1)).join('');
      el('path', { class: 'ha-area', d: `${line}L${x(seg[seg.length - 1].t).toFixed(1)} ${h}L${x(seg[0].t).toFixed(1)} ${h}Z` }, svg);
      el('path', { class: 'ha-path', d: line, pathLength: 1 }, svg);
    });

    // the latest reading
    const last = pts[pts.length - 1];
    el('circle', { class: 'ha-pulse', cx: x(last.t), cy: y(last.v), r: 4.5 }, svg);
    el('circle', { class: 'ha-last', cx: x(last.t), cy: y(last.v), r: 4.5 }, svg);

    // hover / touch: a guide, a dot on the nearest reading, a tooltip
    const guide = el('line', { class: 'ha-guide', y1: 0, y2: h }, svg);
    const dot = el('circle', { class: 'ha-dot', r: 5 }, svg);
    const tip = document.createElement('div');
    tip.className = 'ha-tip';
    wrap.appendChild(tip);
    const show = (event) => {
      const box = svg.getBoundingClientRect();
      const px = event.clientX - box.left;
      let best = pts[0];
      pts.forEach((p) => { if (Math.abs(x(p.t) - px) < Math.abs(x(best.t) - px)) best = p; });
      const bx = x(best.t);
      guide.setAttribute('x1', bx);
      guide.setAttribute('x2', bx);
      dot.setAttribute('cx', bx);
      dot.setAttribute('cy', y(best.v));
      svg.classList.add('hover');
      tip.textContent = new Date(best.t).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) + ' · ' + format(best.v);
      tip.classList.add('on');
      const half = tip.offsetWidth / 2;
      tip.style.left = Math.max(14, Math.min(w + 14 - 2 * half, bx + 14 - half)) + 'px';
      tip.style.top = Math.max(0, y(best.v) - 30) + 'px';
    };
    const hide = () => { svg.classList.remove('hover'); tip.classList.remove('on'); };
    svg.addEventListener('pointermove', show);
    svg.addEventListener('pointerdown', show);
    svg.addEventListener('pointerleave', hide);
    state.fresh = false;
  }

  // The two "against your own normal" cards (HRV and resting heart rate): the number, how it compares with your
  // own average, and the last 30 nights with your typical range as a soft band.
  function trendCard(o, cfg) {
    const latest = val(o, cfg.metric);
    if (!latest) return;
    const series = o.series[cfg.metric].filter((p) => Date.now() - new Date(p[0]) <= 30 * 24 * HOUR);
    set(cfg.value, Math.round(latest.value));
    const values = series.map((p) => p[1]);
    const enough = values.length >= 5;
    const avg = enough ? values.reduce((s, v) => s + v, 0) / values.length : null;
    const sd = enough ? Math.sqrt(values.reduce((s, v) => s + (v - avg) ** 2, 0) / values.length) : null;
    const diff = enough ? Math.round(latest.value - avg) : null;
    set(cfg.when, night(latest.measured_at) + (enough ? ' · ' + (diff === 0 ? 'right at' : Math.abs(diff) + ' ' + cfg.unit + ' ' + (diff > 0 ? 'above' : 'below')) + ' your average' : ''));

    const pillsEl = $(cfg.pills);
    pillsEl.replaceChildren();
    if (enough) {
      [['Average', Math.round(avg) + ' ' + cfg.unit], ['Typical', Math.round(avg - sd) + '–' + Math.round(avg + sd)]].forEach(([name, value], i) => {
        const li = document.createElement('li');
        li.style.setProperty('--i', i);
        li.append(name + ' ');
        const strong = document.createElement('b');
        strong.textContent = value;
        li.appendChild(strong);
        pillsEl.appendChild(li);
      });
    }
    lineChart($(cfg.chart), {
      points: series,
      days: 30,
      goal: enough ? { value: avg, label: 'avg' } : null,
      band: enough ? { lo: avg - sd, hi: avg + sd } : null,
      format: (v) => Math.round(v) + ' ' + cfg.unit,
    });
  }

  const hrvCard = (o) => trendCard(o, { metric: 'hrv_ms', value: 'vHrv', when: 'wHrv', pills: 'hrvPills', chart: 'sHrv', unit: 'ms' });

  function rhrCard(o) {
    trendCard(o, { metric: 'resting_hr', value: 'vRhr', when: 'wRhr', pills: 'rhrPills', chart: 'sRhr', unit: 'bpm' });
    const latest = val(o, 'resting_hr');
    // The heart in the corner beats at your own resting rate.
    if (latest && latest.value > 30) $('cRhr').style.setProperty('--beat', (60 / latest.value).toFixed(2) + 's');
  }

  function activity(o, days) {
    const steps = val(o, 'steps');
    const kcal = val(o, 'active_calories');
    const ex = val(o, 'exercise_minutes');
    const vo2 = val(o, 'vo2max');
    if (!steps && !kcal && !ex && !vo2) return;
    $('cActivity').hidden = false;
    if (steps) {
      set('vSteps', Math.round(steps.value).toLocaleString());
      set('wSteps', sameDay(steps.measured_at) ? 'Today so far' : dayLabel(steps.measured_at));
      lineChart($('sSteps'), { points: o.series.steps, days: 45, zero: true, goal: { value: 10000, label: '10k' }, format: (v) => Math.round(v).toLocaleString() + ' steps' });
    }
    if (kcal) set('vKcal', Math.round(kcal.value) + ' kcal');
    if (ex) set('vEx', Math.round(ex.value) + ' min');
    if (vo2) set('vVo2', vo2.value.toFixed(1));
  }

  function workouts(list) {
    const ol = $('wkList');
    ol.replaceChildren();
    $('wkNone').hidden = list.length > 0;
    list.forEach((w) => {
      const mins = Math.round((new Date(w.ended_at) - new Date(w.started_at)) / 60000);
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.className = 'n';
      name.textContent = w.sport_name.replace(/\b\w/g, (c) => c.toUpperCase());
      const meta = document.createElement('span');
      meta.className = 'm';
      const bits = [dayLabel(w.started_at) + ', ' + new Date(w.started_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }), mins + ' min'];
      if (w.average_heart_rate) bits.push('avg ' + Math.round(w.average_heart_rate) + ' bpm');
      meta.textContent = bits.join(' · ');
      li.append(name, meta);
      if (w.strain != null) {
        const s = document.createElement('span');
        s.className = 's';
        s.textContent = w.strain.toFixed(1);
        const small = document.createElement('small');
        small.textContent = 'strain';
        s.appendChild(small);
        li.appendChild(s);
      }
      ol.appendChild(li);
    });
  }

  async function init() {
    const DAYS = 30;
    try {
      // The workouts list (GET /v1/health/workouts, workouts() above) is switched off for now.
      const [o, b] = await Promise.all([api('/v1/health/overview?days=90'), api('/v1/health/battery?days=' + DAYS).catch(() => null)]);
      if (!o.updated_at) {
        $('hGrid').hidden = true;
        $('hEmpty').hidden = false;
        return;
      }
      pills(o, b);
      if (b) battery(b, DAYS);
      recovery(o, DAYS);
      sleep(o);
      strainCard(o);
      hrvCard(o);
      rhrCard(o);
      extras(o);
      activity(o, DAYS);
    } catch (e) {
      set('hEmpty', 'Could not load health data right now.');
      $('hEmpty').hidden = false;
      $('hGrid').hidden = true;
    }
  }

  // The banner ribbon: the same phrase repeated along the loop, drifting by exactly one phrase so it never jumps.
  function ribbon() {
    const path = document.getElementById('ribbonText');
    if (!path) return;
    const phrase = 'HEALTH · RECOVERY · SLEEP · BODY BATTERY · STRAIN · ';
    path.textContent = phrase.repeat(10);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || !path.getComputedTextLength) return;
    const unit = path.getComputedTextLength() / 10;
    if (!unit) return;
    const move = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
    move.setAttribute('attributeName', 'startOffset');
    move.setAttribute('from', '0');
    move.setAttribute('to', String(-unit));
    move.setAttribute('dur', '28s');
    move.setAttribute('repeatCount', 'indefinite');
    path.appendChild(move);
  }

  ribbon();
  infoButtons();
  init();
})();
