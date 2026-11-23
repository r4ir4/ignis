// Sparkles: a field of twinkling stars on the title tiles, plus a glittering cursor trail and click bursts.
// Respects prefers-reduced-motion. Used by the Trips page (title tiles are any `.bd-word`).
(() => {
  'use strict';
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const NS = 'http://www.w3.org/2000/svg';
  const STAR = 'M0,-1 C.15,-.3 .3,-.15 1,0 C.3,.15 .15,.3 0,1 C-.15,.3 -.3,.15 -1,0 C-.3,-.15 -.15,-.3 0,-1Z';
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  // The Todo page (body.td-theme) uses its own palette: ink and flame orange.
  const TODO = document.body.classList.contains('td-theme');
  // The Bills page (body.bl-theme) is teal, mint and coral.
  const BILLS = document.body.classList.contains('bl-theme');
  const CLEAN = document.body.classList.contains('cl-theme'); // Cleaning: sky blue, lemon and coral
  const ON_LIGHT = ['#151210', '#ee5d1b', '#c9470f', '#f08a4b', '#151210'];
  const ON_DARK = ['#ee5d1b', '#f7e9d7', '#f4b58f', '#ee5d1b', '#f7e9d7'];
  const LIME = ON_LIGHT;

  function shape(color, size, dot) {
    const s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '-1 -1 2 2');
    s.innerHTML = dot ? '<circle r=".5"/>' : '<path d="' + STAR + '"/>';
    s.style.cssText = 'width:' + size + 'px;height:' + size + 'px;color:' + color;
    return s;
  }

  // ---- twinkles on every title tile ----
  function seed(tile) {
    if (tile.dataset.sparkled) return;
    tile.dataset.sparkled = '1';
    const lime = getComputedStyle(tile).backgroundColor.includes('221, 226, 43');
    const palette = lime ? LIME : ON_LIGHT;
    const count = tile.dataset.zone === 'right' ? 9 : 16;
    for (let i = 0; i < count; i++) {
      const s = shape(pick(palette), rand(9, 26), i % 5 === 4);
      s.setAttribute('class', 'bd-sp');
      s.style.setProperty('--x', (tile.dataset.zone === 'right' ? rand(72, 96) : rand(2, 96)).toFixed(1) + '%');
      s.style.setProperty('--y', rand(4, 90).toFixed(1) + '%');
      s.style.setProperty('--d', rand(0, 4).toFixed(2) + 's');
      s.style.setProperty('--t', rand(2.4, 4.4).toFixed(2) + 's');
      s.style.setProperty('--r', pick([45, 90, -45, 135]) + 'deg');
      tile.appendChild(s);
    }
  }
  const scan = () => document.querySelectorAll('.bd-word').forEach(seed);
  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
  scan();

  // ---- cursor trail and bursts ----
  const layer = document.createElement('div');
  layer.className = 'bd-trail';
  document.body.appendChild(layer);

  const luminance = (el) => {
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const m = getComputedStyle(n).backgroundColor.match(/[\d.]+/g);
      if (m && (m.length < 4 || parseFloat(m[3]) > 0.5)) return (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]);
    }
    return 255;
  };
  function puff(x, y, palette, o) {
    const dot = Math.random() < (o.dots || 0.3);
    const s = shape(pick(palette), dot ? rand(4, 9) : rand(o.min || 12, o.max || 28), dot);
    s.setAttribute('class', 'bd-bs');
    s.style.left = x + 'px'; s.style.top = y + 'px';
    s.style.setProperty('--dx', (o.dx != null ? o.dx : rand(-34, 34)).toFixed(0) + 'px');
    s.style.setProperty('--dy', (o.dy != null ? o.dy : rand(-14, 34)).toFixed(0) + 'px');
    s.style.setProperty('--rot', rand(-140, 140).toFixed(0) + 'deg');
    s.addEventListener('animationend', () => s.remove());
    layer.appendChild(s);
  }

  let last = 0, lx = -99, ly = -99;
  document.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch' || document.body.classList.contains('no-sparkle')) return;
    const now = performance.now();
    if (now - last < 28 || Math.hypot(e.clientX - lx, e.clientY - ly) < 9) return;
    const t = e.target;
    if (t.closest && t.closest('dialog, input, textarea, select, iframe')) return;
    last = now; lx = e.clientX; ly = e.clientY;
    const onTitle = t.closest && t.closest('.bd-word');
    const palette = onTitle ? LIME : luminance(t) < 110 ? ON_DARK : ON_LIGHT;
    puff(e.clientX, e.clientY, palette, onTitle ? { min: 16, max: 36, dots: 0.2 } : {});
    puff(e.clientX + rand(-10, 10), e.clientY + rand(-10, 10), palette, { min: 8, max: 18, dots: 0.5 });
    if (onTitle) for (let i = 0; i < 2; i++) puff(e.clientX + rand(-24, 24), e.clientY + rand(-24, 24), palette, { min: 10, max: 30, dx: rand(-60, 60), dy: rand(-60, 30) });
  });
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch' || document.body.classList.contains('no-sparkle') || (e.target.closest && e.target.closest('dialog, input, textarea, select, iframe'))) return;
    const palette = luminance(e.target) < 110 ? ON_DARK : ON_LIGHT;
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + rand(-0.2, 0.2), r = rand(36, 84);
      puff(e.clientX, e.clientY, palette, { min: 10, max: 26, dx: Math.cos(a) * r, dy: Math.sin(a) * r, dots: 0.35 });
    }
  });
})();
