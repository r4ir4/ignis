// Check-in page: pastel folders that will hold forms. For now each one opens to a short "empty folder" note.
(() => {
  'use strict';
  const SP = 'M16 0C17 10 22 15 32 16C22 17 17 22 16 32C15 22 10 17 0 16C10 15 15 10 16 0Z';
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // little twinkling stars around every folder
  const SPOTS = [['8%', '10%', 18, 0], ['88%', '22%', 14, .9], ['80%', '58%', 20, 1.7], ['14%', '52%', 12, 2.4]];
  if (!reduce) {
    document.querySelectorAll('.ck-folder').forEach((btn, i) => {
      SPOTS.forEach(([x, y, s, d]) => {
        const star = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        star.setAttribute('viewBox', '0 0 32 32');
        star.setAttribute('class', 'ck-sp');
        star.setAttribute('aria-hidden', 'true');
        star.style.cssText = 'left:' + x + ';top:' + y + ';width:' + s + 'px;height:' + s + 'px;--d:' + (d + i * 0.35).toFixed(2) + 's';
        star.innerHTML = '<path d="' + SP + '"/>';
        btn.appendChild(star);
      });
    });

    // stars trail the pointer across the page (same as the other pages, in the folder colours)
    const STAR = 'M0,-1 C.15,-.3 .3,-.15 1,0 C.3,.15 .15,.3 0,1 C-.15,.3 -.3,.15 -1,0 C-.3,-.15 -.15,-.3 0,-1Z';
    const layer = document.createElement('div');
    layer.className = 'ck-trail';
    document.body.appendChild(layer);
    const COLORS = ['#ec5b92', '#ff97a9', '#ffb98a'];
    let last = 0, lx = -99, ly = -99;
    document.addEventListener('pointermove', (event) => {
      if (event.pointerType === 'touch') return;
      const now = performance.now();
      if (now - last < 55 || Math.hypot(event.clientX - lx, event.clientY - ly) < 18) return;
      if (event.target.closest && event.target.closest('dialog, input')) return;
      last = now; lx = event.clientX; ly = event.clientY;
      const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      s.setAttribute('viewBox', '-1 -1 2 2');
      s.setAttribute('class', 'ck-bs');
      s.innerHTML = '<path d="' + STAR + '"/>';
      const size = 12 + Math.random() * 16;
      s.style.cssText = 'left:' + event.clientX + 'px;top:' + event.clientY + 'px;width:' + size + 'px;height:' + size + 'px;color:' + COLORS[Math.floor(Math.random() * 3)] +
        ';--dx:' + (Math.random() * 40 - 20).toFixed(0) + 'px;--dy:' + (Math.random() * 30 - 8).toFixed(0) + 'px';
      s.addEventListener('animationend', () => s.remove());
      layer.appendChild(s);
    });
  }
  const dialog = document.getElementById('ckDialog');
  const holder = document.getElementById('ckOpen');
  document.querySelectorAll('.ck-folder').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.href) { location.href = btn.dataset.href; return; }
      document.getElementById('ckTitle').textContent = btn.dataset.name;
      document.getElementById('ckHint').textContent = btn.dataset.hint;
      // the same folder, drawn open with a sheet of paper peeking out
      const svg = btn.querySelector('svg:not(.ck-sp)').cloneNode(true);
      const front = svg.querySelector('.ck-front');
      if (svg.dataset.file) { holder.replaceChildren(svg); dialog.showModal(); return; }
      const paper = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      paper.setAttribute('class', 'ck-paper');
      paper.setAttribute('x', '40'); paper.setAttribute('y', '22'); paper.setAttribute('width', '180'); paper.setAttribute('height', '110'); paper.setAttribute('rx', '10');
      paper.setAttribute('fill', '#fff'); paper.setAttribute('stroke', 'rgba(0,0,0,.08)');
      svg.insertBefore(paper, front);
      holder.replaceChildren(svg);
      dialog.showModal();
    });
  });
  if (dialog) {
    document.getElementById('ckClose').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  }

  // daily forms: until today's check-in is filled in, the file shows a pulsing exclamation mark
  const now = new Date();
  const today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  const status = (btn, text, ok) => {
    let s = btn.querySelector('.ck-sub');
    if (!s) { s = document.createElement('small'); btn.appendChild(s); }
    s.className = 'ck-sub' + (ok ? ' ck-ok' : ''); s.textContent = text;
  };
  document.querySelectorAll('.ck-folder[data-daily]').forEach((btn) => {
    const mark = () => {
      const badge = document.createElement('span');
      badge.className = 'ck-alert';
      badge.setAttribute('aria-hidden', 'true');
      badge.innerHTML = '<i></i><b>!</b>';
      btn.appendChild(badge);
      status(btn, 'Falta o check-in de hoje', false);
      btn.setAttribute('aria-label', btn.getAttribute('aria-label') + ', o check-in de hoje ainda não foi preenchido');
    };
    const done = () => {
      const badge = document.createElement('span');
      badge.className = 'ck-alert ck-done';
      badge.setAttribute('aria-hidden', 'true');
      badge.innerHTML = '<b><svg viewBox="0 0 24 24"><path d="M5 12.500l4.500 4.500L19 7.500"/></svg></b>';
      btn.appendChild(badge);
      status(btn, 'Feito hoje', true);
      btn.setAttribute('aria-label', btn.getAttribute('aria-label') + ', o check-in de hoje está concluído');
    };
    fetch('api/v1/checkins/' + btn.dataset.daily + '/' + today)
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then((row) => { if (row && row.id) done(); else mark(); })
      .catch(mark);
  });
})();
