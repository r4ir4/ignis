// Motion for the portfolio. Everything here is optional: without JavaScript or with reduced motion the page is fully visible and static.
(function () {
  'use strict';
  var $ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  document.getElementById('y').textContent = new Date().getFullYear();
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // top bar gets a background as soon as the page moves
  var bar = document.getElementById('topbar');
  function barState() { bar.classList.toggle('solid', scrollY > 24); }
  addEventListener('scroll', barState, { passive: true });
  barState();

  document.documentElement.classList.add('js');

  // project index: rows open and close
  $('.row').forEach(function (btn) {
    var li = btn.closest('.proj');
    btn.addEventListener('click', function () {
      var open = !li.classList.contains('open');
      li.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', String(open));
    });
  });

  // a screenshot follows the cursor over the project index (mouse only)
  var peek = document.getElementById('peek');
  if (!reduce && matchMedia('(hover: hover)').matches && peek) {
    var img = peek.querySelector('img'), tx = 0, ty = 0, x = 0, y = 0, raf = 0, on = false;
    function loop() {
      x += (tx - x) * 0.18; y += (ty - y) * 0.18;
      peek.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0) scale(' + (on ? 1 : 0.92) + ')';
      raf = (Math.abs(tx - x) > 0.3 || Math.abs(ty - y) > 0.3 || on) ? requestAnimationFrame(loop) : 0;
    }
    $('.proj').forEach(function (li) {
      var row = li.querySelector('.row');
      row.addEventListener('pointerenter', function (e) {
        if (li.classList.contains('open')) return;
        img.src = li.getAttribute('data-img');
        tx = x = e.clientX + 24; ty = y = e.clientY + 18; on = true; peek.classList.add('on');
        if (!raf) raf = requestAnimationFrame(loop);
      });
      row.addEventListener('pointermove', function (e) {
        tx = Math.min(e.clientX + 24, innerWidth - 324); ty = Math.min(e.clientY + 18, innerHeight - 160);
      });
      row.addEventListener('pointerleave', function () { on = false; peek.classList.remove('on'); });
      row.addEventListener('click', function () { on = false; peek.classList.remove('on'); });
    });
    addEventListener('scroll', function () { if (on) { on = false; peek.classList.remove('on'); } }, { passive: true });
  }

  if (reduce) return;
  document.documentElement.classList.add('motion');

  // elements rise in once, the first time they are on screen; numbers count up
  function count(el) {
    var end = parseFloat(el.getAttribute('data-count')), suf = el.getAttribute('data-suffix') || '', t0 = performance.now(), dur = 1400;
    (function tick(t) {
      var k = Math.min(1, (t - t0) / dur), v = Math.round(end * (1 - Math.pow(1 - k, 3)));
      el.textContent = v + (k === 1 ? suf : '');
      if (k < 1) requestAnimationFrame(tick);
    })(t0);
  }
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add('in'); io.unobserve(en.target);
        $('[data-count]', en.target).forEach(count);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    $('.rv').forEach(function (el) { io.observe(el); });
  } else {
    $('.rv').forEach(function (el) { el.classList.add('in'); });
  }

  // reading progress
  var progress = document.getElementById('progress'), ticking = false;
  function frame() {
    ticking = false;
    var h = document.documentElement.scrollHeight - innerHeight;
    progress.style.setProperty('--p', h > 0 ? Math.min(1, scrollY / h).toFixed(4) : 0);
  }
  addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(frame); } }, { passive: true });
  addEventListener('resize', frame);
  frame();
})();
