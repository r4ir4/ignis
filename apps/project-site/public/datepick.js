// Replaces every <input type="date"> inside a dialog with a button that opens a small month grid (same look as the medication,
// metrics and goals dialogs). The original input stays (hidden) and keeps the value, so existing code that reads or sets
// input.value keeps working.
(() => {
  'use strict';
  const pad = (n) => String(n).padStart(2, '0');
  const key = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parse = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const NS = 'http://www.w3.org/2000/svg';

  function mount(input) {
    const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    const box = el('div', 'ig-dp');
    const btn = el('button', 'ig-dp-btn'); btn.type = 'button'; btn.setAttribute('aria-expanded', 'false');
    const txt = el('span');
    const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS(NS, 'path'); p.setAttribute('d', 'M6 9l6 6 6-6'); svg.appendChild(p);
    btn.append(txt, svg);
    const cal = el('div', 'ig-dp-cal'); cal.hidden = true;
    const head = el('header');
    const prev = el('button', 'ig-dp-nav', '‹'), next = el('button', 'ig-dp-nav', '›'), title = el('h3');
    prev.type = next.type = 'button'; prev.setAttribute('aria-label', 'Mês anterior'); next.setAttribute('aria-label', 'Próximo mês');
    head.append(prev, title, next);
    const dow = el('div', 'ig-dp-dow'); ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].forEach((x) => dow.appendChild(el('span', '', x))); dow.setAttribute('aria-hidden', 'true');
    const grid = el('div', 'ig-dp-days');
    cal.append(head, dow, grid);
    box.append(btn, cal);
    input.after(box);
    const read = () => desc.get.call(input);
    let month = new Date(), anim = null;
    const label = () => { const v = read(); txt.textContent = v ? parse(v).toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }) : 'Escolher data'; };
    const render = () => {
      const y = month.getFullYear(), mo = month.getMonth(), sel = read(), now = key(new Date());
      title.textContent = month.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
      const lead = (new Date(y, mo, 1).getDay() + 6) % 7, total = new Date(y, mo + 1, 0).getDate(), cells = [];
      for (let i = 0; i < lead; i++) cells.push(el('span'));
      for (let d = 1; d <= total; d++) {
        const k = y + '-' + pad(mo + 1) + '-' + pad(d);
        const b = el('button', 'ig-dp-day' + (k === sel ? ' sel' : '') + (k === now ? ' today' : ''), String(d));
        b.type = 'button'; b.setAttribute('aria-pressed', String(k === sel));
        b.onclick = () => { desc.set.call(input, k); input.dispatchEvent(new Event('change', { bubbles: true })); label(); show(false); };
        cells.push(b);
      }
      grid.replaceChildren(...cells);
    };
    function show(open) {
      btn.setAttribute('aria-expanded', String(open));
      if (anim) { anim.cancel(); anim = null; }
      const still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (open) {
        const v = read(); const base = v ? parse(v) : new Date(); month = new Date(base.getFullYear(), base.getMonth(), 1);
        render(); cal.hidden = false;
        if (still || !cal.animate) return;
        const h = cal.scrollHeight; cal.style.overflow = 'hidden';
        anim = cal.animate([{ height: '0px', opacity: 0, transform: 'translateY(-6px)' }, { height: h + 'px', opacity: 1, transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.2, .8, .2, 1)' });
        anim.onfinish = () => { cal.style.overflow = ''; anim = null; };
      } else {
        if (cal.hidden) return;
        if (still || !cal.animate) { cal.hidden = true; return; }
        const h = cal.getBoundingClientRect().height; cal.style.overflow = 'hidden';
        anim = cal.animate([{ height: h + 'px', opacity: 1, transform: 'none' }, { height: '0px', opacity: 0, transform: 'translateY(-6px)' }], { duration: 240, easing: 'cubic-bezier(.4, 0, .2, 1)', fill: 'forwards' });
        anim.closing = true;
        anim.onfinish = () => { cal.hidden = true; cal.style.overflow = ''; anim.cancel(); anim = null; };
      }
    }
    btn.onclick = () => show(cal.hidden || !!(anim && anim.closing));
    prev.onclick = () => { month = new Date(month.getFullYear(), month.getMonth() - 1, 1); render(); };
    next.onclick = () => { month = new Date(month.getFullYear(), month.getMonth() + 1, 1); render(); };
    // code that sets input.value (opening the dialog) refreshes the button and closes the grid
    Object.defineProperty(input, 'value', { get() { return read(); }, set(v) { desc.set.call(input, v); label(); if (anim) { anim.cancel(); anim = null; } cal.style.overflow = ''; cal.hidden = true; btn.setAttribute('aria-expanded', 'false'); } });
    input.type = 'hidden';
    label();
  }
  const run = () => document.querySelectorAll('dialog input[type="date"]').forEach(mount);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
})();
