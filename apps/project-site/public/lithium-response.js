// Tab 3: psychiatric response and emotional stability, from structured daily symptom scores.
(() => {
  'use strict';
  const Li = window.Li;
  if (!Li) return;
  const { make } = Li.M;
  const api = Li.M.api;
  const TZ = Li.M.TZ;

  const state = { meds: true };
  let data = null;
  let stage = null;
  const CLS = ['a', 'b', 'c', 'd'];
  const at = (day) => new Date(day + 'T12:00:00').getTime();
  const maxOf = (m) => m.max || 10;
  const unitOf = (m) => (m.unit ? '' : '/10');

  async function mount(panel) { stage = make('div', 'li-stage'); panel.appendChild(stage); }

  async function render() {
    const cmp = '';
    const [sym, regs, labs] = await Promise.all([
      api('/v1/lithium/symptoms/summary?' + Li.dayq() + '&tz=' + TZ + cmp),
      api('/v1/lithium/regimens'),
      api('/v1/lithium/labs/summary?' + Li.q()),
    ]);
    data = { sym, regs, serum: labs.markers.find((m) => m.key === 'lithium') };
    paint();
  }

  const last = (arr) => { for (let i = arr.length - 1; i >= 0; i--) if (arr[i].value != null) return arr[i].value; return null; };
  const lineOf = (arr, norm) => arr.filter((p) => p.value != null).map((p) => ({ t: at(p.day), v: norm(p.value), tip: Li.shortDate(at(p.day)) + ' · ' + Li.num(p.value, 1) }));
  const rawOf = (m, norm) => m.points.map((p) => ({ t: at(p.day), v: norm(p.value), tip: Li.shortDate(at(p.day)) + ' · ' + Li.num(p.value, 1) + (m.unit ? '' : ' / 10') }));
  const regLines = (x0, x1) => data.regs.filter((r) => { const t = new Date(r.started_at).getTime(); return t >= x0 && t <= x1; }).map((r) => ({ t: new Date(r.started_at).getTime(), label: r.med + (r.daily_mg != null ? ' ' + Math.round(r.daily_mg) : '') }));

  function paint() {
    const sym = data.sym;
    stage.replaceChildren();
    const grid = make('div', 'm-grid li-grid');
    stage.appendChild(grid);

    // ---- overview: three bento stat cards ----------------------------------------------------------------------------------------------------
    const trio = make('div', 'li-trio li-wide');
    const stat = (title, cls, value, unit, line, info) => {
      const c = Li.card(title, { cls: 'li-g ' + cls + ' li-stat3', info });
      const big = make('p', 'm-since');
      big.appendChild(make('b', '', value));
      if (unit) big.appendChild(make('small', '', unit));
      c.appendChild(big);
      if (line) c.appendChild(make('p', 'h-when', line));
      trio.appendChild(c);
      return c;
    };
    const first = stat('Times you checked in', 'li-g0', String(sym.entries), sym.entries === 1 ? 'time' : 'times', 'you told us how you felt', { paras: ['Each day you tell us how you feel, and these cards show if it is changing.'] });
    stat('How you felt at the start', 'li-g1', String(sym.baseline_entries), sym.baseline_entries === 1 ? 'day' : 'days', 'you told us when you began');
    const startDay = sym.treatment_start ? new Date(sym.treatment_start + 'T12:00:00') : null;
    stat('The day you started', 'li-g0', startDay ? Li.shortDate(startDay) : '\u2013', '', startDay ? Li.ago(startDay) : 'not picked yet');
    grid.appendChild(trio);
    if (!sym.entries) first.appendChild(Li.note('No check-ins recorded in this period yet. Once there are some, trends, averages and comparisons appear below.'));

    if (!sym.entries) return;

    // ---- one bento card per measure: how it is now, how it compares with the starting values, and a quiet sparkline ---------------------------------
    sym.metrics.forEach((m) => {
      const c = Li.card(m.label, { cls: 'li-mini li-still' });
      if (m.n) {
        const max = m.max || 10;
        const ma7 = last(m.ma7);
        const big = make('p', 'li-minival');
        big.appendChild(make('b', '', Li.num(ma7, 1)));
        big.appendChild(make('small', '', m.unit ? 'now' : 'now · out of 10'));
        c.appendChild(big);
        const start = m.baseline && m.baseline.mean != null ? m.baseline.mean : null;
        let text = 'no start number yet';
        if (start != null) {
          const d = ma7 - start;
          text = Math.abs(d) < 0.05 * max ? 'Same as the start' : (d > 0 ? '\u2191 ' : '\u2193 ') + Li.num(Math.abs(d), 1) + (d > 0 ? ' higher' : ' lower') + ' than the start';
        }
        c.appendChild(make('p', 'm-phase', text));
        const sp = make('div', 'li-spark');
        c.appendChild(sp);
        c.appendChild(make('p', 'li-spark-cap', start != null ? 'The line is how you felt each day. The dotted line is where you began.' : 'The line is how you felt each day.'));
        const tt = m.points.map((p) => at(p.day));
        const [a0, a1] = Li.domain(tt);
        Li.chart(sp, {
          height: 88, bare: true, xMin: a0, xMax: a1, unit: '',
          hlines: start != null ? [{ y: start }] : [],
          series: [{ pts: lineOf(m.ma7, (v) => v), kind: 'line', cls: 'a', area: true, gapMs: 8 * Li.DAY, noHover: true }],
        });
      } else {
        c.appendChild(Li.empty('Nothing recorded yet.'));
      }
      grid.appendChild(c);
    });

  }

  Li.registerTab({ id: 'response', label: 'Trends', mount, render });
})();
