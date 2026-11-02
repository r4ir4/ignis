// Lithium overview: the latest blood level, how far into treatment you are, and the daily check-in you track.
(() => {
  'use strict';
  const Li = window.Li;
  if (!Li) return;
  const { make } = Li.M;
  const api = Li.M.api;
  const TZ = Li.M.TZ;
  const today = () => Li.dayKey(new Date());
  const last = (arr) => { for (let i = arr.length - 1; i >= 0; i--) if (arr[i].value != null) return arr[i].value; return null; };

  // grow the fill and move the dot in from zero so the bar feels alive
  const grow = (fill, dot, pct) => {
    fill.style.width = '0%';
    dot.style.left = '0%';
    requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = pct + '%'; dot.style.left = pct + '%'; }));
  };

  let stage = null;
  async function mount(panel) { stage = make('div', 'li-stage'); panel.appendChild(stage); }

  async function render() {
    const [labs, prog, sym] = await Promise.all([
      api('/v1/lithium/labs/summary'),
      api('/v1/lithium/progress?tz=' + TZ),
      api('/v1/lithium/symptoms/summary?to=' + today() + '&tz=' + TZ),
    ]);
    const cfg = Li.state.cfg;
    stage.replaceChildren();
    const grid = make('div', 'm-grid li-grid');
    stage.appendChild(grid);
    grid.appendChild(latestCard(labs.markers.find((m) => m.key === 'lithium'), cfg.settings.therapeutic_range));
    grid.appendChild(progressCard(prog));
    worksCards(sym, cfg).forEach((el) => grid.appendChild(el));
  }

  // ---- latest blood level -----------------------------------------------------------------------------------------------------------
  function latestCard(serum, range) {
    const lc = Li.card('Latest measurement', {
      cls: 'li-half',
      info: { paras: ["This is the number from your newest blood test, so it's a real count and not a guess."] },
    });
    const latest = serum.latest;
    if (latest) {
      const big = make('p', 'm-since');
      big.appendChild(make('b', '', Li.num(latest.value)));
      big.appendChild(make('small', '', latest.unit));
      lc.appendChild(big);
      lc.appendChild(make('p', 'h-when', 'collected ' + Li.shortDate(latest.collected_at) + ' · ' + Li.ago(latest.collected_at) + (latest.hours_since_dose != null ? ' · ' + Li.num(latest.hours_since_dose, 1) + ' h after the last dose' : '')));
      const hasRange = range.low != null && range.high != null;
      lc.appendChild(make('p', 'm-phase', hasRange ? (latest.value < range.low ? 'Below your target range' : latest.value > range.high ? 'Above your target range' : 'Inside your target range') : 'No target range set'));
      // the shaded band is the target range, the dot is this result
      const max = Math.max(1.5, hasRange ? range.high * 1.5 : 0, latest.value * 1.15);
      const pct = (v) => Math.min(100, (v / max) * 100);
      const scale = make('div', 'li-scale');
      scale.setAttribute('aria-hidden', 'true');
      const bar = make('div', 'li-scale-bar');
      if (hasRange) {
        const band = make('i', 'li-scale-band');
        band.style.left = pct(range.low) + '%';
        band.style.width = pct(range.high) - pct(range.low) + '%';
        bar.appendChild(band);
      }
      const fill = make('i', 'li-scale-fill');
      const dot = make('b', 'li-scale-dot');
      grow(fill, dot, pct(latest.value));
      bar.append(fill, dot);
      scale.appendChild(bar);
      const labels = make('div', 'li-scale-lbl');
      labels.append(make('span', '', '0'));
      if (hasRange) { const t = make('span', 'mid', 'target ' + Number(range.low).toFixed(1) + ' – ' + Number(range.high).toFixed(1)); t.style.left = (pct(range.low) + pct(range.high)) / 2 + '%'; labels.appendChild(t); }
      labels.append(make('span', '', Li.num(max, 1)));
      scale.appendChild(labels);
      lc.appendChild(scale);
      lc.appendChild(Li.note(serum.n + (serum.n === 1 ? ' blood test' : ' blood tests') + ' recorded in total.'));
    } else {
      lc.appendChild(Li.empty('No blood test recorded yet.'));
    }
    return lc;
  }

  // ---- how far into treatment ---------------------------------------------------------------------------------------------------------
  function progressCard(p) {
    const o = p.onset;
    const c = Li.card('Since you started', {
      cls: 'li-half',
      info: { paras: ['Lithium needs a few days to settle in your blood and a few weeks before it helps the most, so we count the days.'] },
    });
    const form = make('form', 'li-inline');
    const ts = Li.datePicker(p.start_day || '', { max: today() });
    const save = make('button', 'li-btn', 'Save');
    save.type = 'submit';
    form.append(ts, save);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api('/v1/lithium/settings/baseline', { method: 'PUT', body: { value: { treatment_start: ts.value ? new Date(ts.value + 'T00:00:00').toISOString() : null } } });
        Li.state.cfg = await api('/v1/lithium/config');
        Li.M.toast('Saved');
        Li.refresh();
      } catch (err) { Li.M.toast(err.message); }
    });
    const change = make('div', 'li-change');
    const toggle = make('button', 'li-change-btn', p.days_since == null ? 'Set the day you started' : 'Change start date');
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', 'false');
    const drawer = make('div', 'li-collapse');
    drawer.inert = true;
    const drawerIn = make('div', 'li-collapse-in');
    drawerIn.appendChild(form);
    drawer.appendChild(drawerIn);
    toggle.addEventListener('click', () => {
      const open = !drawer.classList.contains('open');
      drawer.classList.toggle('open', open);
      drawer.inert = !open;
      toggle.setAttribute('aria-expanded', String(open));
    });
    change.append(toggle, drawer);

    if (p.days_since == null) {
      c.appendChild(Li.empty('Tracking starts with your first logged lithium dose, or set the day you started.'));
      c.appendChild(change);
      return c;
    }
    const big = make('p', 'm-since');
    big.appendChild(make('b', '', String(p.days_since + 1)));
    big.appendChild(make('small', '', 'days'));
    c.appendChild(big);
    c.appendChild(make('p', 'h-when', 'since ' + Li.longDate(p.start_day + 'T12:00:00')));
    const d = p.days_since;
    const wk = (n) => n / 7;
    const days = (n) => n + (n === 1 ? ' day' : ' days');
    // two separate milestones: blood levels settling (day 5) is not the same as feeling the therapeutic effect (weeks 4-6)
    const stable = d >= o.steady_state_days ? 'Levels stable' : days(o.steady_state_days - d) + ' until stable';
    // once the therapeutic window is reached, say how long you have been on it instead of counting down
    const effect = d < o.fuller_effect_from_days ? days(o.fuller_effect_from_days - d) + ' until therapeutic effects'
      : 'You\u2019ve been taking it for ' + days(d + 1);
    const pills = make('div', 'li-pills');
    pills.appendChild(make('p', 'm-phase' + (d >= o.steady_state_days ? ' done' : ''), stable));
    pills.appendChild(make('p', 'm-phase' + (d >= o.fuller_effect_from_days ? ' done' : ''), effect));
    c.appendChild(pills);
    // from day 0 to week 8: the shaded band is the typical window for the fuller effect
    const MAX = 56;
    const pct = (day) => Math.min(100, (day / MAX) * 100);
    const scale = make('div', 'li-scale');
    scale.setAttribute('aria-hidden', 'true');
    const bar = make('div', 'li-scale-bar');
    const band = make('i', 'li-scale-band');
    band.style.left = pct(o.fuller_effect_from_days) + '%';
    band.style.width = pct(Math.min(MAX, o.fuller_effect_to_days)) - pct(o.fuller_effect_from_days) + '%';
    const fill = make('i', 'li-scale-fill');
    const dot = make('b', 'li-scale-dot');
    grow(fill, dot, pct(d));
    bar.append(band, fill, dot);
    scale.appendChild(bar);
    const labels = make('div', 'li-scale-lbl');
    labels.append(make('span', '', '0'));
    const st = make('span', 'mid', 'stable');
    st.style.left = pct(o.steady_state_days) + '%';
    labels.appendChild(st);
    const t = make('span', 'mid', 'therapeutic ' + o.fuller_effect_from_days / 7 + '–' + o.fuller_effect_to_days / 7);
    t.style.left = (pct(o.fuller_effect_from_days) + pct(Math.min(MAX, o.fuller_effect_to_days))) / 2 + '%';
    labels.appendChild(t);
    labels.append(make('span', '', 'week ' + MAX / 7));
    scale.appendChild(labels);
    c.appendChild(scale);
    c.appendChild(Li.note(p.doses_logged + ' doses logged · ' + p.days_with_dose + ' of ' + (d + 1) + ' days with a dose'));
    c.appendChild(change);
    return c;
  }

  // ---- the tracked measures -------------------------------------------------------------------------------------------------------------------
  // a header card, then one bento card per group (mood, thoughts, behavior) with a compact row for each measure
  function worksCards(sym, cfg) {
    const c = Li.card('How it works for you', {
      cls: 'li-wide li-works',
      info: { paras: ["Each day you tell us how you feel from 0 to 10, and the bars show how it's changing."] },
    });
    const todayDone = sym.metrics.some((m) => m.points.some((p) => p.day === today()));
    const head = make('div', 'li-works-head');
    head.appendChild(make('p', 'li-sub', sym.entries + 'You told us how you feel ' + sym.entries + (sym.entries === 1 ? ' time' : ' times') + ' · ' + (todayDone ? 'you did it today' : 'you have not told us about today yet')));
    const btn = make('button', 'li-btn', todayDone ? 'Update today' : 'Check in');
    btn.type = 'button';
    btn.addEventListener('click', () => openCheckin(cfg));
    head.appendChild(btn);
    c.appendChild(head);
    const groups = make('div', 'li-groups li-wide');
    [...new Set(cfg.symptoms.map((s) => s.group))].forEach((g, i) => {
      const card = make('article', 'h-card grain li-card li-g li-g' + (i % 2));
      card.appendChild(make('h2', '', g));
      const list = make('ul', 'li-mlist');
      sym.metrics.filter((m) => m.group === g).forEach((m) => list.appendChild(metricRow(m)));
      card.appendChild(list);
      groups.appendChild(card);
    });
    return [c, groups];
  }

  function metricRow(m) {
    const li = make('li', 'li-mrow');
    const top = make('div', 'li-mtop');
    top.appendChild(make('span', 'li-mname', m.label));
    const max = m.max || 10;
    const cur = last(m.ma7) != null ? last(m.ma7) : m.points.length ? m.points[m.points.length - 1].value : null;
    const bar = make('div', 'li-mbar');
    bar.setAttribute('aria-hidden', 'true');
    li.appendChild(top);
    if (cur == null) {
      top.appendChild(make('em', 'li-mnone', 'not tracked yet'));
      bar.appendChild(make('i'));
      li.appendChild(bar);
      return li;
    }
    top.appendChild(make('b', 'li-mval', Li.num(cur, 1)));
    const fill = make('i');
    fill.style.width = '0%';
    requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = Math.min(100, (cur / max) * 100) + '%'; }));
    bar.appendChild(fill);
    const base = m.baseline && m.baseline.mean != null ? m.baseline.mean : null;
    if (base != null) { const tick = make('u'); tick.style.left = Math.min(99, (base / max) * 100) + '%'; tick.title = 'at the start: ' + Li.num(base, 1); bar.appendChild(tick); }
    li.appendChild(bar);
    if (base != null) {
      const d = cur - base;
      li.appendChild(make('span', 'li-mdelta', Math.abs(d) < 0.05 * max ? '→ about the same as at the start' : (d > 0 ? '↑ ' : '↓ ') + Li.num(Math.abs(d), 1) + (d > 0 ? ' higher' : ' lower') + ' than the start'));
    }
    return li;
  }

  // ---- daily check-in ----------------------------------------------------------------------------------------------------------------------------
  let dialog = null;
  function openCheckin(cfg) {
    if (!dialog) dialog = buildDialog(cfg);
    dialog.reset(today());
    dialog.el.showModal();
  }

  function buildDialog(cfg) {
    const el = make('dialog', 'm-modal li-checkin');
    const form = make('form');
    form.method = 'dialog';
    form.noValidate = true;
    const header = make('header');
    header.appendChild(make('h2', '', 'Daily check-in'));
    const x = make('button', 'm-x');
    x.type = 'button';
    x.setAttribute('aria-label', 'Close');
    x.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    x.addEventListener('click', () => el.close());
    header.appendChild(x);
    form.appendChild(header);
    form.appendChild(make('p', 'li-sub', 'Score how today felt. Leave a measure alone to skip it: skipped ones are not saved.'));

    const dayRow = make('div', 'm-field');
    dayRow.appendChild(make('span', 'm-label', 'Day'));
    const day = make('input'); day.type = 'date'; day.max = today(); day.className = 'li-num wide';
    dayRow.appendChild(day);
    form.appendChild(dayRow);

    const fields = {};
    [...new Set(cfg.symptoms.map((s) => s.group))].forEach((g) => {
      form.appendChild(make('h3', 'li-grouphead', g));
      cfg.symptoms.filter((s) => s.group === g).forEach((s) => {
        const row = make('div', 'li-ci');
        const top = make('div', 'li-ci-top');
        top.appendChild(make('b', '', s.label));
        const out = make('output', '', '–');
        top.appendChild(out);
        row.appendChild(top);
        const inp = make('input');
        const max = s.max || 10;
        if (s.max) { inp.type = 'number'; inp.min = '0'; inp.max = String(max); inp.placeholder = s.unit; inp.className = 'li-num wide'; }
        else { inp.type = 'range'; inp.min = '0'; inp.max = '10'; inp.step = '1'; inp.value = '5'; }
        const state = { set: false };
        const set = (v) => { state.set = v != null && v !== ''; if (state.set) { inp.value = v; out.textContent = String(v); } else { out.textContent = '–'; if (!s.max) inp.value = '5'; else inp.value = ''; } row.classList.toggle('set', state.set); };
        inp.addEventListener('input', () => set(inp.value));
        const skip = make('button', 'li-skip', 'clear');
        skip.type = 'button';
        skip.addEventListener('click', () => set(null));
        top.appendChild(skip);
        row.appendChild(inp);
        row.appendChild(make('span', 'li-ci-ends', s.lo + (s.max ? '' : ' (0)') + ' ↔ ' + s.hi + (s.max ? '' : ' (10)')));
        form.appendChild(row);
        fields[s.key] = { set, get: () => (state.set ? Number(inp.value) : null) };
      });
    });
    const noteRow = make('div', 'm-field');
    noteRow.appendChild(make('span', 'm-label', 'Note (optional)'));
    const note = make('textarea'); note.rows = 3; note.maxLength = 2000; note.className = 'li-note-in'; note.placeholder = 'Anything that shaped the day: sleep, stress, a missed dose…';
    noteRow.appendChild(note);
    form.appendChild(noteRow);
    const err = make('p', 'm-err');
    err.hidden = true;
    form.appendChild(err);
    const save = make('button', 'm-save', 'Save check-in');
    save.type = 'submit';
    form.appendChild(save);
    el.appendChild(form);
    document.body.appendChild(el);
    el.addEventListener('click', (e) => { if (e.target === el) el.close(); });

    const load = async () => {
      Object.values(fields).forEach((f) => f.set(null));
      note.value = '';
      try {
        const rows = await api('/v1/lithium/symptoms?from=' + day.value + '&to=' + day.value);
        if (rows[0]) { Object.entries(rows[0].scores).forEach(([k, v]) => fields[k] && fields[k].set(v)); note.value = rows[0].note || ''; }
      } catch (e) { /* a blank form is fine */ }
    };
    day.addEventListener('change', () => { if (day.value) load(); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.hidden = true;
      const scores = {};
      Object.entries(fields).forEach(([k, f]) => { const v = f.get(); if (v != null && !Number.isNaN(v)) scores[k] = v; });
      if (!Object.keys(scores).length) { err.textContent = 'Score at least one measure.'; err.hidden = false; return; }
      if (!day.value) { err.textContent = 'Pick a day.'; err.hidden = false; return; }
      save.disabled = true;
      try {
        await api('/v1/lithium/symptoms/' + day.value, { method: 'PUT', body: { scores, note: note.value.trim() || null } });
        el.close();
        Li.M.toast('Check-in saved');
        Li.refresh();
      } catch (ex) { err.textContent = ex.message; err.hidden = false; } finally { save.disabled = false; }
    });
    return { el, reset: (d) => { day.value = d; load(); err.hidden = true; } };
  }

  Li.registerTab({ id: 'overview', label: 'Overview', mount, render, noRange: true });
})();
