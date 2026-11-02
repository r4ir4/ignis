// Roacutan section tabs, in the same style as Lithium: Overview (level, last dose, totals) and Laboratory (TGO, TGP and the other blood tests).
(() => {
  'use strict';
  const Li = window.Li;
  if (!Li) return;
  Li.ready.then(() => {
    const root = document.getElementById('ro-labs');
    const overview = document.getElementById('x-roacutan');
    if (!root || !overview) return;
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
    const labs = Li.makeLabs({ scope: 'roacutan', allTime: true, meds: 'roacutan' });
    root.classList.add('li-root');
    const tabs = el('div', 'li-tabs');
    tabs.setAttribute('role', 'tablist');
    const panels = el('div', 'li-panels');
    const p1 = el('div', 'li-panel');
    const p2 = el('div', 'li-panel');
    p1.appendChild(overview);
    p2.hidden = true;
    panels.append(p1, p2);
    root.append(tabs, panels);
    let mounted = false;
    const show = async (id) => {
      p1.hidden = id !== 'overview';
      p2.hidden = id !== 'labs';
      tabs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === id)));
      if (id === 'labs') {
        if (!mounted) { mounted = true; await labs.mount(p2); }
        try { await labs.render(); } catch (e) { p2.textContent = 'Could not load the blood tests right now.'; }
      }
    };
    [['overview', 'Overview'], ['labs', 'Laboratory']].forEach(([id, label], i) => {
      const b = el('button', '', label);
      b.type = 'button';
      b.dataset.tab = id;
      b.dataset.n = '0' + (i + 1);
      b.setAttribute('role', 'tab');
      b.addEventListener('click', () => show(id));
      tabs.appendChild(b);
    });
    show('overview');
  });
})();
