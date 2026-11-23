// Phone menu. Built from the existing nav so labels and icons stay in one place.
// Shown only while the icon bar is hidden (see nav-menu.css).
(() => {
  'use strict';

  const nav = document.querySelector('nav.links');
  const slot = document.querySelector('.top-actions') || document.querySelector('.nav-right');
  if (!nav || !slot || document.querySelector('.pm-open')) return;

  const GROUPS = [
    { label: 'Today', keys: ['diary', 'todo', 'checkin', 'rotina'] },
    { label: 'Body', keys: ['health', 'meds', 'habits', 'food', 'workout', 'metrics'] },
    { label: 'Money', keys: ['subscriptions', 'money', 'bills'] },
    { label: 'Life', keys: ['read', 'goals', 'trips', 'cleaning', 'wishlist', 'backpack', 'brain', 'notes'] },
  ];

  const keyOf = (href) => (href || '').replace(/^\.\//, '').split(/[?#]/)[0].replace(/\.html$/, '').replace(/\/$/, '') || 'home';

  const here = (() => {
    let name = (location.pathname.split('/').pop() || 'index').replace(/\.html$/, '') || 'index';
    if (name === 'index') return 'home';
    if (name.startsWith('checkin')) return 'checkin';
    return name;
  })();

  const byKey = new Map();
  nav.querySelectorAll('a').forEach((a) => byKey.set(keyOf(a.getAttribute('href')), a));

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pm-open';
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-haspopup', 'dialog');
  btn.setAttribute('aria-controls', 'pmSheet');
  btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg><span>Menu</span>';

  const dialog = document.createElement('dialog');
  dialog.id = 'pmSheet';
  dialog.className = 'pm-dialog';
  dialog.setAttribute('aria-labelledby', 'pmTitle');
  dialog.setAttribute('data-no-backdrop-close', '');

  const sheet = document.createElement('div');
  sheet.className = 'pm-sheet';

  const head = document.createElement('div');
  head.className = 'pm-head';
  const title = document.createElement('p');
  title.id = 'pmTitle';
  title.className = 'pm-title';
  title.textContent = 'Menu';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'pm-close';
  closeBtn.textContent = 'Close';
  head.append(title, closeBtn);

  const scroller = document.createElement('div');
  scroller.className = 'pm-scroll';

  function linkItem(source, label, key, extra) {
    const a = document.createElement('a');
    a.className = 'pm-item' + (extra ? ' ' + extra : '');
    a.href = source.getAttribute('href');
    if (key === here) a.setAttribute('aria-current', 'page');
    const svg = source.querySelector('svg');
    if (svg) {
      const icon = svg.cloneNode(true);
      icon.setAttribute('aria-hidden', 'true');
      a.appendChild(icon);
    }
    a.appendChild(Object.assign(document.createElement('span'), { textContent: label }));
    return a;
  }

  const used = new Set();
  const home = document.createElement('a');
  home.className = 'pm-item pm-home';
  home.href = './';
  home.appendChild(Object.assign(document.createElement('span'), { textContent: 'Home' }));
  if (here === 'home') home.setAttribute('aria-current', 'page');

  GROUPS.forEach((group, index) => {
    const section = document.createElement('section');
    section.className = 'pm-group';
    const heading = document.createElement('h2');
    heading.textContent = group.label;
    const list = document.createElement('div');
    list.className = 'pm-list';
    if (index === 0) list.appendChild(home);
    group.keys.forEach((key) => {
      const source = byKey.get(key);
      if (!source) return;
      used.add(key);
      const label = source.getAttribute('aria-label') || source.getAttribute('data-tip') || key;
      list.appendChild(linkItem(source, label, key));
    });
    if (!list.children.length) return;
    section.append(heading, list);
    scroller.appendChild(section);
  });

  const rest = [...byKey.entries()].filter(([key]) => !used.has(key));
  const settings = document.querySelector('a.top-search');
  const section = document.createElement('section');
  section.className = 'pm-group';
  const heading = document.createElement('h2');
  heading.textContent = 'More';
  const list = document.createElement('div');
  list.className = 'pm-list';
  rest.forEach(([key, source]) => {
    const label = source.getAttribute('aria-label') || source.getAttribute('data-tip') || key;
    list.appendChild(linkItem(source, label, key));
  });
  if (settings) list.appendChild(linkItem(settings, settings.getAttribute('aria-label') || 'Settings', 'settings'));
  else {
    const a = document.createElement('a');
    a.className = 'pm-item';
    a.href = 'settings';
    if (here === 'settings') a.setAttribute('aria-current', 'page');
    a.appendChild(Object.assign(document.createElement('span'), { textContent: 'Settings' }));
    list.appendChild(a);
  }
  section.append(heading, list);
  scroller.appendChild(section);

  sheet.append(head, scroller);
  dialog.appendChild(sheet);

  function place() {
    const header = document.querySelector('header');
    const top = header ? Math.round(header.getBoundingClientRect().bottom) : 64;
    dialog.style.setProperty('--pm-top', Math.max(top, 0) + 'px');
  }
  function shut() {
    if (dialog.open) dialog.close();
  }
  function open() {
    place();
    dialog.showModal();
    btn.setAttribute('aria-expanded', 'true');
    const current = dialog.querySelector('[aria-current="page"]');
    (current || closeBtn).focus();
    if (current) current.scrollIntoView({ block: 'nearest' });
  }

  btn.addEventListener('click', () => (dialog.open ? shut() : open()));
  closeBtn.addEventListener('click', shut);
  dialog.addEventListener('click', (e) => { if (e.target === dialog) shut(); });
  dialog.addEventListener('close', () => {
    btn.setAttribute('aria-expanded', 'false');
    if (document.body.contains(btn)) btn.focus();
  });
  window.addEventListener('resize', () => {
    if (!dialog.open) return;
    if (getComputedStyle(nav).display !== 'none') shut();
    else place();
  });

  slot.prepend(btn);
  document.body.appendChild(dialog);
})();
