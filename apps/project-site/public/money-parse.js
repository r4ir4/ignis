// Reads the text of a Mercado Pago "Extrato de conta" PDF into transactions. It works on text items the PDF reader
// extracts ({ x, y, s } per fragment, y counted from the top of the page), so it runs in the browser and in Node.
// A row is anchored by its date; its description lines sit around the date, and a row that straddles a page break
// has its first lines at the bottom of one page and the rest, with the date, at the top of the next.
(function (root) {
  'use strict';
  const DATE = /^(\d{2})-(\d{2})-(\d{4})$/;
  const ID = /^\d{6,}$/;
  const MONEY = /^R\$\s*(-?)\s*([\d.]+),(\d{2})$/;
  const cents = (s) => { const m = MONEY.exec(s.trim()); return m ? (m[1] ? -1 : 1) * (parseInt(m[2].replace(/\./g, ''), 10) * 100 + parseInt(m[3], 10)) : null; };
  const brl = (s) => { const m = /R\$\s*(-?[\d.]+,\d{2})/.exec(s); return m ? cents('R$ ' + m[1]) : null; };

  function parseStatement(pages) {
    const rows = [], warnings = [];
    let carry = []; // description lines at the bottom of a page whose row continues on the next one
    let header = null;
    pages.forEach((pg, pi) => {
      const items = pg.items.filter((i) => i.s.trim()).map((i) => ({ x: i.x, y: i.y, s: i.s.trim() }));
      if (pi === 0) header = readHeader(items);
      const head = items.find((i) => i.s === 'Data' && i.x < 80);
      const top = head ? head.y + 6 : 0;
      const body = items.filter((i) => i.y > top && !/^\d+\/\d+$/.test(i.s));
      const anchors = body.filter((i) => i.x < 80 && DATE.test(i.s)).sort((a, b) => a.y - b.y);
      const used = new Set(anchors);
      const lines = body.filter((i) => !used.has(i) && i.x >= 80 && i.x < 190);
      const bucket = anchors.map(() => []), orphans = [];
      lines.forEach((l) => {
        let best = -1, d = 1e9;
        anchors.forEach((a, k) => { const dd = Math.abs(a.y - l.y); if (dd < d) { d = dd; best = k; } });
        if (best >= 0 && d <= 22) bucket[best].push(l); else orphans.push(l);
      });
      anchors.forEach((a, k) => {
        const near = (pred) => body.filter((i) => Math.abs(i.y - a.y) <= 8 && pred(i));
        const idItem = near((i) => i.x >= 190 && i.x < 285 && ID.test(i.s))[0];
        const amt = near((i) => i.x >= 285 && i.x < 355 && MONEY.test(i.s))[0];
        const bal = near((i) => i.x >= 355 && MONEY.test(i.s))[0];
        let desc = bucket[k].sort((p, q) => p.y - q.y).map((l) => l.s);
        if (k === 0 && carry.length) desc = carry.map((l) => l.s).concat(desc);
        if (k === 0) carry = [];
        if (!idItem || !amt || !bal) { warnings.push('Página ' + (pi + 1) + ': uma linha não pôde ser lida por completo.'); return; }
        const m = DATE.exec(a.s);
        rows.push({
          day: m[3] + '-' + m[2] + '-' + m[1], description: desc.join(' ').replace(/\s*##\s*$/, '').replace(/\s+/g, ' ').trim() || 'Transação',
          ref: idItem.s, amount_cents: cents(amt.s), balance_cents: cents(bal.s),
        });
      });
      // lines below the last row belong to a row that continues on the next page
      carry = anchors.length ? orphans.filter((o) => o.y > anchors[anchors.length - 1].y).sort((p, q) => p.y - q.y) : [];
    });
    // check: each balance follows from the previous one, and the totals match the statement summary
    let bad = 0, prev = header && header.start != null ? header.start : null;
    rows.forEach((r) => { if (prev != null && prev + r.amount_cents !== r.balance_cents) bad++; prev = r.balance_cents; });
    const inn = rows.filter((r) => r.amount_cents > 0).reduce((t, r) => t + r.amount_cents, 0);
    const out = rows.filter((r) => r.amount_cents < 0).reduce((t, r) => t + r.amount_cents, 0);
    const checks = {
      balanceChain: bad === 0,
      brokenLinks: bad,
      totals: !!header && header.in === inn && header.out === out,
      finalBalance: !!header && rows.length > 0 && header.final === rows[rows.length - 1].balance_cents,
    };
    rows.forEach((r) => { r.fingerprint = 'mp-' + r.ref + '-' + r.day.replace(/-/g, '') + '-' + r.amount_cents + '-' + r.balance_cents; });
    return { rows, header, checks, totals: { in: inn, out }, warnings };
  }

  function readHeader(items) {
    const text = items.filter((i) => i.y < 200).sort((a, b) => a.y - b.y || a.x - b.x).map((i) => i.s).join(' ');
    const get = (label) => { const m = new RegExp(label + ':?\\s*(R\\$\\s*-?[\\d.]+,\\d{2})').exec(text); return m ? brl(m[1]) : null; };
    const per = /Per[ií]odo:?\s*De\s*(\d{2})-(\d{2})-(\d{4})\s*al\s*(\d{2})-(\d{2})-(\d{4})/.exec(text);
    return {
      start: get('Saldo inicial'), final: get('Saldo final'), in: get('Entradas'), out: get('Sa[ií]das'),
      from: per ? per[3] + '-' + per[2] + '-' + per[1] : null, to: per ? per[6] + '-' + per[5] + '-' + per[4] : null,
    };
  }

  root.MoneyParse = { parseStatement };
  if (typeof module !== 'undefined') module.exports = { parseStatement };
})(typeof window !== 'undefined' ? window : globalThis);
