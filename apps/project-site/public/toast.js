// Notifications for every page: a small card in the bottom right with an icon, a message, an optional Undo, a close button and a timer bar.
//   IgnisToast.show('Goal added', { sub: 'Run a 10k', type: 'ok' | 'win' | 'warn', undo: async () => { ... } })
(() => {
  'use strict';
  const ICON = {
    ok: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    win: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10v5a5 5 0 0 1-10 0Z"/><path d="M7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3M12 14v4M8.5 20h7"/></svg>',
    warn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7v6M12 17h.01"/></svg>',
  };
  const make = (tag, cls, text) => { const el = document.createElement(tag); if (cls) el.className = cls; if (text != null) el.textContent = text; return el; };
  function box() {
    let b = document.getElementById('toasts');
    if (!b) { b = make('div', 'ig-toasts'); b.id = 'toasts'; b.setAttribute('aria-live', 'polite'); document.body.appendChild(b); }
    b.classList.add('ig-toasts');
    return b;
  }
  function show(text, opts) {
    opts = opts || {};
    const holder = box();
    while (holder.children.length >= 3) holder.firstChild.remove();
    const type = opts.type || 'ok';
    const t = make('div', 'ig-toast ' + type);
    t.setAttribute('role', type === 'warn' ? 'alert' : 'status');
    const ico = make('span', 'ig-ticon');
    ico.innerHTML = ICON[type] || ICON.ok;
    const body = make('div', 'ig-tbody');
    body.appendChild(make('p', '', text));
    if (opts.sub) body.appendChild(make('small', '', opts.sub));
    t.append(ico, body);
    const close = () => { if (!t.isConnected) return; t.classList.add('out'); setTimeout(() => t.remove(), 220); };
    if (opts.undo) {
      const u = make('button', 'ig-tundo', 'Desfazer');
      u.type = 'button';
      u.addEventListener('click', async () => { close(); try { await opts.undo(); } catch (e) { show(e.message, { type: 'warn' }); } });
      t.appendChild(u);
    }
    const x = make('button', 'ig-tx');
    x.type = 'button';
    x.setAttribute('aria-label', 'Fechar');
    x.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    x.addEventListener('click', close);
    t.appendChild(x);
    const bar = make('i', 'ig-tbar');
    bar.style.animationDuration = (opts.undo ? 7000 : 4000) + 'ms';
    bar.addEventListener('animationend', close);
    t.appendChild(bar);
    holder.appendChild(t);
    return t;
  }
  window.IgnisToast = { show };
})();
