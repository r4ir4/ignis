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
    const [labs, prog] = await Promise.all([
      api('/v1/lithium/labs/summary'),
      api('/v1/lithium/progress?tz=' + TZ),
    ]);
    const cfg = Li.state.cfg;
    stage.replaceChildren();
    const grid = make('div', 'm-grid li-grid');
    stage.appendChild(grid);
    grid.appendChild(latestCard(labs.markers.find((m) => m.key === 'lithium'), cfg.settings.therapeutic_range));
    grid.appendChild(progressCard(prog));
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

  Li.registerTab({ id: 'overview', label: 'Overview', mount, render, noRange: true });
})();
