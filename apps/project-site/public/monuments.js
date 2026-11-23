// Line drawings of famous monuments for the stat tiles: <i class="bd-mon" data-mon="bigben|eiffel|christ|colosseum"></i>.
(() => {
  'use strict';
  const ARCH = (x, y) => 'M' + x + ' ' + y + 'v-6a3.5 3.5 0 0 1 7 0v6';
  const row = (y, from, to, step) => { let d = ''; for (let x = from; x <= to; x += step) d += ARCH(x, y); return d; };
  const M = {
    bigben: ['M50 3 L44 26 H56 Z', 'M40 26 H60 V32 H40 Z', 'M38 32 H62 V62 H38 Z', 'M59 47 a9 9 0 1 1 -18 0 a9 9 0 1 1 18 0', 'M50 47 V41 M50 47 L54 49', 'M38 32 V26 M62 32 V26', 'M42 62 H58 V96 H42 Z', 'M50 68 V78 M50 84 V90', 'M34 96 H66'],
    eiffel: ['M50 3 V15', 'M50 15 L41 50 L28 96', 'M50 15 L59 50 L72 96', 'M44 34 H56', 'M40 50 H60', 'M44 34 L59 50 M56 34 L41 50', 'M33 82 Q50 56 67 82', 'M24 96 H76', 'M35 70 H65'],
    christ: ['M56 12 a6 6 0 1 1 -12 0 a6 6 0 1 1 12 0', 'M44 21 H56 L58 62 H42 Z', 'M44 25 L8 31 V37 L44 35', 'M56 25 L92 31 V37 L56 35', 'M37 62 H63 V82 H37 Z', 'M4 96 L30 82 H70 L96 96', 'M47 40 V58 M53 40 V58'],
    colosseum: ['M5 60 Q5 32 50 32 Q95 32 95 60 V80 Q95 93 50 93 Q5 93 5 80 Z', 'M5 60 Q5 70 50 70 Q95 70 95 60', row(50, 15, 77, 12), row(82, 15, 77, 12), 'M18 32 Q50 24 82 32'],
  };
  const build = (el) => {
    const d = M[el.dataset.mon]; if (!d || el.firstChild) return;
    const NS = 'http://www.w3.org/2000/svg', s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '0 0 100 100'); s.setAttribute('aria-hidden', 'true');
    d.forEach((p, i) => { const e = document.createElementNS(NS, 'path'); e.setAttribute('d', p); e.setAttribute('pathLength', '1'); e.style.setProperty('--i', i); s.appendChild(e); });
    el.appendChild(s);
  };
  const scan = () => document.querySelectorAll('.bd-mon').forEach(build);
  scan(); new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
})();
