// Laboratory view: results against their own reference ranges and a baseline. Used for the Lithium tab and for the Roacutan section.
(() => {
  'use strict';
  const Li = window.Li;
  if (!Li) return;
  const { make } = Li.M;
  const api = Li.M.api;

  // opts: scope ('lithium' or 'roacutan'), serum (overlay serum lithium), allTime (ignore the period filter), meds (only these medication changes)
  Li.makeLabs = (opts = {}) => {
  const scope = opts.scope || 'lithium';
  const state = { marker: null, showDoses: true, showEvents: true, showSerum: !!opts.serum };
  let data = null;
  let stage = null;

  const FLAG = { low: 'Below reference', high: 'Above reference', ok: 'Within reference' };
  const medShort = (r) => r.med + (r.daily_mg != null ? ' ' + Math.round(r.daily_mg) : '');

  // one simple sentence per marker, for the tooltip
  const EXPLAIN = {
    lithium: 'Lithium is your medicine, and this test counts how much of it is floating in your blood right now.',
    creatinine: 'Creatinine is tiny leftover trash from your muscles that your kidneys clean away, so it shows how well your kidneys are cleaning.',
    egfr: 'This is a score for how good your kidneys are at cleaning your blood, and a bigger number means better cleaning.',
    urea: 'Urea is another bit of leftover trash that your kidneys wash out, so it helps check the cleaning too.',
    tsh: 'TSH is a message from your brain telling your thyroid, your body\u2019s little engine, how hard to work.',
    ft4: 'Free T4 is the energy juice your thyroid makes, and this checks how much is in your blood.',
    sodium: 'Sodium is the salt in your blood that helps keep the right amount of water in your body.',
    potassium: 'Potassium is a helper mineral that keeps your muscles and your heart working.',
    calcium: 'Calcium is the mineral that makes your bones and teeth strong and helps your muscles move.',
    tgo: 'TGO is a helper that lives inside your liver, and a high number can mean the liver is working too hard.',
    tgp: 'TGP is another liver helper, and doctors check it often because Roacutan can make the liver tired.',
    triglycerides: 'Triglycerides are fats floating in your blood, and Roacutan can make them go up.',
    cholesterol: 'Cholesterol is a waxy fat your body needs, and too much of it can clog your blood pipes.',
    hdl: 'HDL is the good cholesterol that sweeps extra fat out of your blood.',
    ldl: 'LDL is the bad cholesterol that can stick to the walls of your blood pipes.',
    glucose: 'Glucose is the sugar in your blood that gives you energy.',
    cpk: 'CPK is a helper inside your muscles, and a high number can mean your muscles worked very hard.',
  };

  async function mount(panel) { stage = make('div', 'li-stage'); panel.appendChild(stage); }

  async function render() {
    const [labs, regs, events] = await Promise.all([
      api('/v1/lithium/labs/summary?scope=' + scope + (opts.allTime ? '' : '&' + Li.q())),
      api('/v1/lithium/regimens' + (opts.meds ? '?med=' + opts.meds : '')),
      api('/v1/lithium/events' + (opts.allTime ? '' : '?' + Li.q())),
    ]);
    data = { labs, regs, events };
    if (!state.marker || !labs.markers.some((m) => m.key === state.marker)) {
      state.marker = (labs.markers.find((m) => m.key !== 'lithium' && m.n) || labs.markers.find((m) => m.key !== 'lithium')).key;
    }
    paint();
  }

  const nonSerum = () => data.labs.markers.filter((m) => m.key !== 'lithium');
  const refOf = (m) => { const r = m.results.slice().reverse().find((x) => x.ref_low != null || x.ref_high != null); return r ? { low: r.ref_low, high: r.ref_high } : null; };
  const toPts = (m) => m.results.map((r) => ({
    t: new Date(r.collected_at).getTime(), v: r.value, flag: r.flag === 'low' || r.flag === 'high',
    tip: Li.shortDate(r.collected_at) + ' · ' + Li.num(r.value) + ' ' + r.unit + (r.flag ? ' · ' + FLAG[r.flag].toLowerCase() : ''),
  }));

  function paint() {
    const markers = nonSerum();
    const sel = markers.find((m) => m.key === state.marker);
    stage.replaceChildren();
    const grid = make('div', 'm-grid li-grid');
    stage.appendChild(grid);

    // ---- picker: one slim card with the marker chips ---------------------------------------------------------------------------------------------
    const hc = Li.card(sel.label, {
      cls: 'li-wide li-labhead',
      info: { title: sel.label, paras: [EXPLAIN[sel.key]] },
    });
    const chipsRow = make('div');
    Li.chips(chipsRow, markers.map((m) => [m.key, m.label, m.n || null]), { selected: state.marker, onChange: (v) => { state.marker = v; paint(); } });
    hc.appendChild(chipsRow);
    grid.appendChild(hc);

    // ---- latest result: number, status, where it sits in the lab's range, and the change from baseline ------------------------------------------------
    const vc = Li.card('Latest result', { cls: 'li-half li-labvalue' });
    const ref = refOf(sel);
    if (sel.latest) {
      const big = make('p', 'm-since');
      big.appendChild(make('b', '', Li.num(sel.latest.value)));
      big.appendChild(make('small', '', Li.unit(sel.latest.unit)));
      vc.appendChild(big);
      vc.appendChild(make('p', 'h-when', Li.shortDate(sel.latest.collected_at) + ' · ' + Li.ago(sel.latest.collected_at) + (sel.latest.lab_name ? ' · ' + sel.latest.lab_name : '')));
      vc.appendChild(make('p', 'm-phase' + (sel.latest.flag && sel.latest.flag !== 'ok' ? ' li-pill warn' : ''), sel.latest.flag ? FLAG[sel.latest.flag] : 'No reference range recorded'));
      {
        // a scale that always has something to show: the lab's reference range (both, one or no limit), your baseline as a hollow ring, this result as the dot
        const v0 = sel.latest.value;
        const low = ref ? ref.low : null, high = ref ? ref.high : null;
        const base = sel.baseline ? sel.baseline.value : null;
        const pts0 = [v0, base, low, high].filter((x) => x != null);
        const lo0 = Math.min(...pts0), hi0 = Math.max(...pts0);
        const pad = (hi0 - lo0 || Math.abs(v0) * 0.2 || 1) * 0.35;
        const min = Math.max(0, lo0 - pad), max = hi0 + pad;
        const pct = (x) => Math.max(0, Math.min(100, ((x - min) / (max - min)) * 100));
        const scale = make('div', 'li-scale');
        scale.setAttribute('aria-hidden', 'true');
        const bar = make('div', 'li-scale-bar');
        if (low != null || high != null) {
          const band = make('i', 'li-scale-band');
          const from = low != null ? pct(low) : 0, to = high != null ? pct(high) : 100;
          band.style.left = from + '%';
          band.style.width = to - from + '%';
          bar.appendChild(band);
        }
        if (base != null) { const g = make('b', 'li-scale-base'); g.style.left = pct(base) + '%'; bar.appendChild(g); }
        const dot = make('b', 'li-scale-dot');
        dot.style.left = '0%';
        requestAnimationFrame(() => requestAnimationFrame(() => { dot.style.left = pct(v0) + '%'; }));
        bar.appendChild(dot);
        scale.appendChild(bar);
        const labels = make('div', 'li-scale-lbl');
        [low, high].forEach((x) => { if (x != null) { const s = make('span', 'mid', Li.num(x, 2)); s.style.left = pct(x) + '%'; labels.appendChild(s); } });
        scale.appendChild(labels);
        const caps = [];
        if (low != null && high != null) caps.push('dashed band: lab reference range');
        else if (low != null) caps.push('dashed band: ' + Li.num(low, 2) + ' or higher is the lab reference');
        else if (high != null) caps.push('dashed band: up to ' + Li.num(high, 2) + ' is the lab reference');
        if (base != null) caps.push('ring: your baseline');
        if (caps.length) scale.appendChild(make('p', 'li-scale-cap2', caps.join(' · ')));
        vc.appendChild(scale);
      }
      // change from baseline, as a badge in the top right corner
      const corner = make('div', 'li-corner');
      if (sel.baseline && sel.change) {
        corner.appendChild(make('b', '', sel.change.pct == null ? Li.signed(sel.change.abs, 2) : Li.signed(sel.change.pct, 1) + '%'));
        corner.appendChild(make('span', '', 'vs baseline ' + Li.num(sel.baseline.value) + ' ' + Li.unit(sel.baseline.unit)));
      } else if (sel.baseline) {
        corner.appendChild(make('b', '', Li.num(sel.baseline.value)));
        corner.appendChild(make('span', '', 'baseline · needs a later result'));
      } else {
        corner.appendChild(make('span', '', 'no baseline yet'));
      }
      vc.appendChild(corner);
    } else {
      vc.appendChild(Li.empty('No ' + sel.label + ' results recorded in this period.'));
    }
    grid.appendChild(vc);

    // ---- trend, with medication changes and events as markers --------------------------------------------------------------------------------------------
    const tc = Li.card('Trend', { cls: 'li-half li-labtrend' });
    const pts = toPts(sel);
    const serum = opts.serum ? data.labs.markers.find((m) => m.key === 'lithium') : null;
    const times = pts.map((p) => p.t).concat(serum ? serum.results.map((r) => new Date(r.collected_at).getTime()) : []);
    const [x0, x1] = opts.allTime ? [times.length ? Math.min(...times) - 3 * Li.DAY : Date.now() - 90 * Li.DAY, Math.max(Date.now(), ...times)] : Li.domain(times);
    const v = [];
    if (state.showDoses) data.regs.forEach((r) => { const t = new Date(r.started_at).getTime(); if (t >= x0 && t <= x1) v.push({ t, label: medShort(r), glyph: 'M' }); });
    if (state.showEvents) data.events.forEach((e) => { const t = new Date(e.occurred_at).getTime(); if (t >= x0 && t <= x1) v.push({ t, label: e.title, glyph: '!', cls: 'ev' }); });
    const ch = make('div');
    tc.appendChild(ch);
    Li.chart(ch, {
      height: 270, glyphs: true, xMin: x0, xMax: x1, unit: sel.latest ? Li.unit(sel.latest.unit) : '', emptyText: 'No results to chart in this period.',
      bands: ref && ref.low != null && ref.high != null ? [{ lo: ref.low, hi: ref.high, label: 'lab reference' }] : [],
      hlines: sel.baseline ? [{ y: sel.baseline.value, label: 'baseline' }] : [],
      vlines: v,
      series: [{ pts, kind: 'both', cls: 'a', gapMs: Li.state.cfg.settings.chart.gap_days * 2 * Li.DAY }],
    });
    const toggles = make('div');
    Li.chips(toggles, [['doses', 'Medication changes'], ['events', 'Events']].concat(serum ? [['serum', 'Serum lithium']] : []), {
      selected: [state.showDoses && 'doses', state.showEvents && 'events', state.showSerum && 'serum'].filter(Boolean), multi: true,
      onChange: (sel2) => { state.showDoses = sel2.includes('doses'); state.showEvents = sel2.includes('events'); state.showSerum = sel2.includes('serum'); paint(); },
    });
    toggles.classList.add('li-toggles');
    tc.appendChild(toggles);
    const key = make('p', 'li-key-row');
    [['\u25cf', 'a real result'], ['- -', 'your baseline'], ['\u25ad', 'lab reference range']].concat(state.showDoses ? [['M', 'medication change']] : [], state.showEvents ? [['!', 'event']] : []).forEach(([sym, text]) => { const s = make('span', '', ''); s.appendChild(make('b', '', sym)); s.appendChild(document.createTextNode(' ' + text)); key.appendChild(s); });
    tc.appendChild(key);
    grid.appendChild(tc);

    // ---- serum lithium over the same dates, as its own card -----------------------------------------------------------------------------------------------
    if (serum && state.showSerum) {
      const sc = Li.card('Serum lithium, same dates', { cls: 'li-wide', sub: 'mmol/L · to see how lithium levels and this test moved together' });
      const wrap = make('div');
      sc.appendChild(wrap);
      Li.chart(wrap, {
        height: 150, xMin: x0, xMax: x1, yMin: 0, unit: 'mmol/L', emptyText: 'No serum lithium results in this period.',
        bands: Li.state.cfg.settings.therapeutic_range.low != null ? [{ lo: Li.state.cfg.settings.therapeutic_range.low, hi: Li.state.cfg.settings.therapeutic_range.high }] : [],
        series: [{ pts: toPts(serum), kind: 'both', cls: 'b', gapMs: Li.state.cfg.settings.chart.gap_days * Li.DAY }],
      });
      grid.appendChild(sc);
    }

  }

  return { mount, render };
  };

  const lithiumLabs = Li.makeLabs({ scope: 'lithium', serum: true });
  Li.registerTab({ id: 'labs', label: 'Laboratory', mount: lithiumLabs.mount, render: lithiumLabs.render });
})();
