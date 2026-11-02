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
      document.getElementById('ckTitle').textContent = btn.dataset.name;
      document.getElementById('ckHint').textContent = btn.dataset.hint;
      // the same folder, drawn open with a sheet of paper peeking out
      const svg = btn.querySelector('svg:not(.ck-sp)').cloneNode(true);
      const front = svg.querySelector('.ck-front');
      const paper = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      paper.setAttribute('class', 'ck-paper');
      paper.setAttribute('x', '40'); paper.setAttribute('y', '22'); paper.setAttribute('width', '180'); paper.setAttribute('height', '110'); paper.setAttribute('rx', '10');
      paper.setAttribute('fill', '#fff'); paper.setAttribute('stroke', 'rgba(0,0,0,.08)');
      svg.insertBefore(paper, front);
      holder.replaceChildren(svg);
      dialog.showModal();
    });
  });
  document.getElementById('ckClose').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
})();
