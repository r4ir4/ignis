// Habits page: a daily checklist, a week view and a 30-day view, backed by the shared ignis API.
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(2, '0');
  const dayKey = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const make = (tag, cls, text) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  };

  async function api(path, options) {
    const init = options ? { method: options.method, headers: { 'Content-Type': 'application/json' }, body: options.body ? JSON.stringify(options.body) : undefined } : undefined;
    const res = await fetch('api' + path, init);
    if (!res.ok) {
      let detail = '';
      try { const body = await res.json(); if (typeof body.detail === 'string') detail = body.detail; } catch (e) { /* not json */ }
      throw new Error(detail || 'Algo deu errado (' + res.status + ').');
    }
    return res.status === 204 ? null : res.json();
  }
  let toastTimer;
  function toast(text) {
    const el = $('toast');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2400);
  }

  const S = { habits: [], cats: [], today: dayKey(new Date()), day: '' };
  const dayDate = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const WINDOW = 60;   // days of history the page loads
  const STEPS_GOAL = 10000;   // the fixed daily steps habit
  const liveOn = (h, k) => h.created_at.slice(0, 10) <= k || (h.days[k] || 0) > 0;

  async function load() {
    const before = S.today;
    S.today = dayKey(new Date());
    // stay on the chosen day; follow the calendar if you were on today when midnight passed
    if (!S.day || S.day === before || S.day > S.today) S.day = S.today;
    const earliest = dayKey(addDays(dayDate(S.today), -(WINDOW - 1)));
    if (S.day < earliest) S.day = earliest;
    let data = await api('/v1/habits/overview?today=' + S.today + '&window=' + WINDOW);
    // the fixed 10,000-steps habit is not created in the New habit dialog any more: the page makes sure it exists (once)
    if (!data.habits.some((h) => h.kind === 'steps') && !S.stepsTried) {
      S.stepsTried = true;
      try {
        await api('/v1/habits', { method: 'POST', body: { name: STEPS_GOAL.toLocaleString('pt-BR') + ' steps', section: null, kind: 'steps', unit: 'steps', target_count: STEPS_GOAL } });
        data = await api('/v1/habits/overview?today=' + S.today + '&window=' + WINDOW);
      } catch (e) { /* the page works without it; it is tried again on the next visit */ }
    }
    S.habits = data.habits;
    try { S.cats = (await api('/v1/habits/categories')).categories; } catch (e) { /* the groups still show, in the order they appear */ }
    render();
  }

  const statusOf = (h, day) => { const c = h.days[day] || 0; return c >= h.target_count ? 'done' : c > 0 ? 'part' : ''; };

  // ---- identity-board style: periwinkle board, lime word card, tag pills, navy and eggshell cards ----------------------------------------
  const COLORS = ['#dde22b', '#efe7d4', '#f2b3da', '#ff7a4d', '#9fb0f0'];
  // the same five colors for the tick circles on the paper page: eggshell would vanish there, so it becomes navy (with a white tick)
  const PAPER = [{ f: '#dde22b', i: '#15000b' }, { f: '#12287f', i: '#ffffff' }, { f: '#f2b3da', i: '#15000b' }, { f: '#ff7a4d', i: '#15000b' }, { f: '#9fb0f0', i: '#15000b' }];
  const STAR_SVG = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16.00,5.00 L19.29,12.47 L27.41,13.29 L21.33,18.73 L23.05,26.71 L16.00,22.60 L8.95,26.71 L10.67,18.73 L4.59,13.29 L12.71,12.47Z"/></svg>';
  // the four ways to count a habit: how much one tap adds, and the limits of the daily goal in the dialog
  const KINDS = {
    check: { label: 'Check-in', goal: 'Vezes por dia', step: 1, min: 1, max: 999, def: 1, quick: 1 },
    count: { label: 'Contagem', goal: 'Meta por dia', step: 1, min: 1, max: 999, def: 8, quick: 1 },
    time: { label: 'Tempo', goal: 'Minutos por dia', step: 5, min: 5, max: 720, def: 30, quick: 0 },
    steps: { label: 'Passos', goal: 'Passos por dia', step: 500, min: 500, max: 100000, def: 8000, quick: 0 },
  };
  const kindOf = (h) => KINDS[h.kind] || KINDS.check;
  const clock = (m) => (m >= 60 ? Math.floor(m / 60) + 'h' + (m % 60 ? ' ' + (m % 60) + 'm' : '') : m + ' min');
  // an amount as the habit measures it: "3 / 8 glasses", "45 min / 1h", "4,200 / 8,000 steps"
  function amount(h, n) {
    if (h.kind === 'time') return clock(n) + ' / ' + clock(h.target_count);
    if (h.kind === 'steps') return n.toLocaleString('pt-BR') + ' / ' + h.target_count.toLocaleString('pt-BR') + ' passos';
    if (h.kind === 'count' || h.unit) return n + ' / ' + h.target_count + (h.unit ? ' ' + h.unit : '');
    return n + ' de ' + h.target_count + ' hoje';
  }
  const plural = (n, one, many) => (n === 1 ? one : many);
  const ago = (d, key) => d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }) + ' · ' + key;

  function figure(cls) { return make('figure', 'hab-fig ' + cls); }
  function emptyIn(c, text) { c.appendChild(make('p', 'hab-empty', text)); return c; }

  const relName = (k) => (k === S.today ? 'Hoje' : k === dayKey(addDays(dayDate(S.today), -1)) ? 'Ontem' : dayDate(k).toLocaleDateString('pt-BR', { weekday: 'long' }));
  function goDay(k) {
    const earliest = dayKey(addDays(dayDate(S.today), -(WINDOW - 1)));
    if (k > S.today || k < earliest) return;
    S.day = k;
    render();
  }

  // page heading in the Todo style: the title in the display face, one line of status, day arrows, a dashed rule underneath
  function pageHead() {
    const D = S.day, isToday = D === S.today;
    const live = S.habits.filter((h) => liveOn(h, D));
    const done = live.filter((h) => (h.days[D] || 0) >= h.target_count).length;
    const now = Math.max(0, ...S.habits.map((h) => h.streak));
    const head = make('header', 'hab-pagehead');
    head.innerHTML = '<svg class="h-tw hab-tw" style="--x:34%;--y:18%;--s:20px;--d:0s" viewBox="0 0 32 32" aria-hidden="true"><use href="#spark"/></svg>' +
      '<svg class="h-tw hab-tw hab-tw-p" style="--x:46%;--y:58%;--s:13px;--d:1.1s" viewBox="0 0 32 32" aria-hidden="true"><use href="#spark"/></svg>';
    const text = make('div');
    text.appendChild(make('h1', '', 'Hábitos'));
    const date = dayDate(D).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    text.appendChild(make('p', 'hab-pagesub', (D === dayKey(addDays(dayDate(S.today), -1)) ? 'Ontem · ' : '') + date + ' · ' + (live.length ? done + ' de ' + live.length + ' concluídos' : 'nada registrado') + (isToday && now >= 2 ? ' · ' + now + ' dias seguidos' : '')));
    head.appendChild(text);
    const nav = make('div', 'hab-nav');
    if (!isToday) { const t = make('button', 'hab-today', 'Hoje'); t.type = 'button'; t.addEventListener('click', () => goDay(S.today)); nav.appendChild(t); }
    const ARROW = (d) => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + (d < 0 ? 'm14.5 6-6 6 6 6' : 'm9.5 6 6 6-6 6') + '"/></svg>';
    const prev = make('button', 'hab-arrow'); prev.type = 'button'; prev.innerHTML = ARROW(-1); prev.setAttribute('aria-label', 'Dia anterior');
    const next = make('button', 'hab-arrow'); next.type = 'button'; next.innerHTML = ARROW(1); next.setAttribute('aria-label', 'Próximo dia');
    prev.disabled = D <= dayKey(addDays(dayDate(S.today), -(WINDOW - 1)));
    next.disabled = isToday;
    prev.addEventListener('click', () => goDay(dayKey(addDays(dayDate(D), -1))));
    next.addEventListener('click', () => goDay(dayKey(addDays(dayDate(D), 1))));
    nav.append(prev, next);
    const add = make('button', 'hab-new'); add.type = 'button'; add.innerHTML = '<span aria-hidden="true">+</span>Novo hábito'; add.addEventListener('click', () => openDialog(null));
    const cats = make('button', 'hab-hbtn'); cats.type = 'button'; cats.title = 'Gerenciar grupos'; cats.setAttribute('aria-label', 'Gerenciar grupos'); cats.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9-9-9zM7.500 7.500h.01"/></svg>'; cats.addEventListener('click', openCats);
    const right = make('div', 'hab-hright'); right.append(nav, cats, add);
    head.appendChild(right);
    return head;
  }

  // the New habit button now lives at the top of the right column, like Add task on the Todo page
  function addButton() {
    const wrap = make('div', 'hab-addwrap');
    const add = make('button', 'hab-mini');
    add.innerHTML = '<span class="hab-plus" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></span><span>Novo hábito</span>';
    add.type = 'button';
    add.addEventListener('click', () => openDialog(null));
    wrap.appendChild(add);
    return wrap;
  }

  // four pills with the headline numbers
  function tags() {
    const total = S.habits.length;
    const done = S.habits.filter((h) => h.done_today).length;
    const now = Math.max(0, ...S.habits.map((h) => h.streak));
    const best = Math.max(0, ...S.habits.map((h) => h.best_streak));
    const total30 = S.habits.reduce((n, h) => n + h.done_30, 0);
    const ul = make('ul', 'hab-tags');
    ul.setAttribute('aria-label', 'Resumo');
    const FLAME = 'M17 4C18 10 12 12 13 17C15 16 16 14 17 12C17 16 23 18 23 23C23 27 20 29 16 29C12 29 8 26 8 21C8 14 15 11 17 4Z';
    const FLAME_FRAMES = 'M17 4C18 10 12 12 13 17C15 16 16 14 17 12C17 16 23 18 23 23C23 27 20 29 16 29C12 29 8 26 8 21C8 14 15 11 17 4Z;M15 3C17 9 11 12 12 17C14 16 15 14 16 11C17 16 23 18 23 23C23 27 20 29 16 29C12 29 8 26 8 21C8 14 13 10 15 3Z;M17 4C18 10 12 12 13 17C15 16 16 14 17 12C17 16 23 18 23 23C23 27 20 29 16 29C12 29 8 26 8 21C8 14 15 11 17 4Z;M19 4C19 10 13 12 14 17C16 16 17 14 18 11C18 16 24 18 23 23C23 27 20 29 16 29C12 29 8 26 8 21C8 14 16 11 19 4Z;M17 2C17 9 12 12 13 17C15 15 16 13 17 10C17 15 23 18 23 23C23 27 20 29 16 29C12 29 8 26 8 21C8 14 15 9 17 2Z;M17 4C18 10 12 12 13 17C15 16 16 14 17 12C17 16 23 18 23 23C23 27 20 29 16 29C12 29 8 26 8 21C8 14 15 11 17 4Z';
    const lit = now > 0;
    const fire = make('li', 't2 hab-fire' + (lit ? ' lit' : ''));
    fire.innerHTML = '<svg class="hab-flame" viewBox="2 -2 28 36" aria-hidden="true"><circle class="hab-halo" cx="16" cy="21" r="14"/><path class="hab-fbody" d="' + FLAME + '">' + (lit ? '<animate attributeName="d" dur="2.4s" repeatCount="indefinite" calcMode="spline" keyTimes="0;.2;.4;.6;.8;1" keySplines=".45 0 .55 1;.45 0 .55 1;.45 0 .55 1;.45 0 .55 1;.45 0 .55 1" values="' + FLAME_FRAMES + '"/>' : '') + '</path><path class="hab-fcore" d="M16 19C16 22 13 23 13 25C13 27 14 28 16 28C18 28 19 27 19 25C19 23 17 22 16 19Z">' + (lit ? '<animate attributeName="fill" dur="1.2s" repeatCount="indefinite" values="#ffca26;#ff5e32;#ffca26"/>' : '') + '</path>' +
      (lit ? '<circle class="hab-ember" cx="10" cy="14" r="1" style="--dx:-4px;--t:2.1s;--d:0s"/><circle class="hab-ember" cx="22" cy="12" r="1.1" style="--dx:5px;--t:2.5s;--d:.7s"/><circle class="hab-ember" cx="16" cy="6" r=".9" style="--dx:2px;--t:1.9s;--d:1.2s"/><circle class="hab-ember e2" cx="25" cy="20" r=".8" style="--dx:4px;--t:2.3s;--d:.3s"/>' : '') + '</svg>';
    const txt = make('span', 'hab-ftxt');
    txt.appendChild(make('b', '', String(now)));
    fire.appendChild(txt);
    fire.setAttribute('aria-label', now + ' dias seguidos');
    fire.title = lit ? 'Sua maior sequência agora' : 'Marque hoje para começar uma sequência';
    // a tile with a small label, a giant counted-up numeral and a bit of motion on the right
    const tile = (cls, label, value, suffix, deco) => {
      const li = make('li', cls + ' hab-tile');
      const left = make('span', 'hab-tl');
      left.appendChild(make('small', '', label));
      const b = make('b', 'hab-num');
      const num = make('span', '', '0');
      b.appendChild(num);
      if (suffix) b.appendChild(make('em', '', suffix));
      left.appendChild(b);
      li.appendChild(left);
      const art = make('span', 'hab-art');
      art.setAttribute('aria-hidden', 'true');
      art.innerHTML = deco;
      li.appendChild(art);
      li.setAttribute('aria-label', label + ': ' + value + (suffix || ''));
      const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduce || !value) num.textContent = String(value);
      else {
        const t0 = performance.now();
        const tick = (t) => {
          const k = Math.min(1, (t - t0) / 700);
          num.textContent = String(Math.round(value * (1 - Math.pow(1 - k, 3))));
          if (k < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }
      return li;
    };
    const STAR5 = 'M16 5L19.29 12.47L27.41 13.29L21.33 18.73L23.05 26.71L16 22.6L8.95 26.71L10.67 18.73L4.59 13.29L12.71 12.47Z';
    const stars = Array.from({ length: Math.min(total, 8) }, (_, i) => '<svg class="hab-ms' + (i < done ? ' on' : '') + '" style="--i:' + i + '" viewBox="0 0 32 32"><path d="' + STAR5 + '"/></svg>').join('');
    const flower = '<svg class="hab-trophy" viewBox="0 0 64 64"><path class="hab-handles" d="M20 12H11V18C11 25 15 29 21 29M44 12H53V18C53 25 49 29 43 29"/><path d="M19 7H45V26C45 35 39 41 32 41C25 41 19 35 19 26Z"/><path d="M29 41H35V49H29Z"/><path d="M19 50H45V58H19Z"/><path class="hab-tstar" d="M32 14L34.4 19.6L40.5 20.2L35.9 24.2L37.3 30.2L32 27L26.7 30.2L28.1 24.2L23.5 20.2L29.6 19.6Z"/><path class="hab-shine" d="M53 4C53.6 8 55 9.4 59 10C55 10.6 53.6 12 53 16C52.4 12 51 10.6 47 10C51 9.4 52.4 8 53 4Z"/></svg>';
    // completion rate: of every habit that existed on each of the last 30 days, how many got done
    let possible = 0, got = 0;
    for (let i = 0; i < 30; i++) {
      const key = dayKey(addDays(new Date(), -i));
      S.habits.forEach((h) => {
        if (h.created_at.slice(0, 10) <= key || (h.days[key] || 0) > 0) { possible += 1; if ((h.days[key] || 0) >= h.target_count) got += 1; }
      });
    }
    const rate = possible ? Math.round((got / possible) * 100) : 0;
    const ring = '<svg class="hab-ring" viewBox="0 0 64 64"><circle class="hab-rtrack" cx="32" cy="32" r="25"/><circle class="hab-rfill" cx="32" cy="32" r="25" pathLength="100" style="--p:' + rate + '"/><path class="hab-rspark" d="M32 24C32.6 29 35 31.4 40 32C35 32.6 32.6 35 32 40C31.4 35 29 32.6 24 32C29 31.4 31.4 29 32 24Z"/></svg>';
    // ---- the four numbers, each with a small picture of itself ----
    const stat = (label, big, unit, art, sub) => {
      const li = make('li', 'hab-stat');
      const top = make('div', 'hab-stat-top');
      top.appendChild(make('small', '', label));
      const b = make('b', '', String(big));
      if (unit) b.appendChild(make('em', '', unit));
      top.appendChild(b);
      li.appendChild(top);
      if (art) li.appendChild(art);
      if (sub) li.appendChild(make('p', 'hab-stat-sub', sub));
      li.setAttribute('aria-label', label + ': ' + big + (unit || ''));
      return li;
    };
    // 1) today: one segment per habit, filled when done
    const seg = make('div', 'hab-seg');
    seg.setAttribute('aria-hidden', 'true');
    S.habits.slice(0, 16).forEach((h, i) => seg.appendChild(make('i', S.habits[i].done_today ? 'on' : '')));
    // 2) streak: how far the current run is toward your best
    const run = make('div', 'hab-run');
    run.setAttribute('aria-hidden', 'true');
    const fill = make('i');
    fill.style.width = (best ? Math.min(100, Math.round((now / best) * 100)) : 0) + '%';
    run.appendChild(fill);
    // 3) last 30 days: share of habits done on each day, oldest to newest
    const spark = make('div', 'hab-spark');
    spark.setAttribute('aria-hidden', 'true');
    for (let i = 29; i >= 0; i--) {
      const key = dayKey(addDays(new Date(), -i));
      let p = 0, g = 0;
      S.habits.forEach((h) => { if (h.created_at.slice(0, 10) <= key || (h.days[key] || 0) > 0) { p += 1; if ((h.days[key] || 0) >= h.target_count) g += 1; } });
      const bar = make('i', i === 0 ? 'now' : '');
      bar.style.setProperty('--h', p ? Math.max(0.06, g / p).toFixed(3) : '0.06');
      bar.title = dayDate(key).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }) + ': ' + g + ' de ' + p;
      spark.appendChild(bar);
    }
    const sparkWrap = make('div', 'hab-spark-wrap');
    sparkWrap.append(spark, make('p', 'hab-spark-axis', ''));
    sparkWrap.lastChild.innerHTML = '<span>há 30 dias</span><span>hoje</span>';
    ul.classList.add('hab-stats');
    ul.append(
      stat('Hoje', done, total ? ' / ' + total : '', seg, total ? (done === total ? 'Tudo feito hoje' : (total - done) + (total - done === 1 ? ' hábito falta' : ' hábitos faltam')) : ''),
      stat('Sequência', now, now === 1 ? ' dia' : ' dias', run, best ? 'Melhor: ' + best + (best === 1 ? ' dia' : ' dias') : 'Marque hoje para começar'),
      stat('Últimos 30 dias', rate, '%', sparkWrap, 'dos hábitos concluídos')
    );
    return ul;
  }

  // the chosen day's habits as a plain list on the page, each with a circle to tick
  function listCard() {
    const D = S.day;
    const c = figure('hab-list-card');
    const live = S.habits.filter((h) => liveOn(h, D));
    const total = live.length;
    if (!S.habits.length) return emptyIn(c, 'Nenhum hábito ainda. Adicione o primeiro que você quer manter.');
    if (!total) return emptyIn(c, 'Nada foi registrado neste dia.');
    const list = make('ul', 'hab-list');
    const known = S.cats.map((c) => c.label);
    const groupOf = (h) => (h.section && known.includes(h.section) ? h.section : h.section ? h.section : '');
    const groups = [...known.filter((l) => live.some((h) => groupOf(h) === l)), ...[...new Set(live.map(groupOf))].filter((l) => !known.includes(l))];
    // habits without a group go last
    if (groups.includes('')) { groups.splice(groups.indexOf(''), 1); groups.push(''); }
    groups.forEach((g, gi) => {
      if (groups.length > 1) { const items = live.filter((h) => groupOf(h) === g), dn = items.filter((h) => (h.days[D] || 0) >= h.target_count).length; const gl = make('li', 'hab-group g' + (gi % 3)); gl.append(make('span', '', g || 'Sem grupo'), make('small', '', dn + '/' + items.length)); list.appendChild(gl); }
      live.filter((h) => groupOf(h) === g).forEach((h) => list.appendChild(row(h, D)));
    });
    c.appendChild(list);
    return c;
  }

  function row(h, D) {
    const idx = S.habits.indexOf(h);
    const n = h.days[D] || 0;
    const st = n >= h.target_count ? 'done' : n > 0 ? 'part' : '';
    const isToday = D === S.today;
    const li = make('li', 'hab-row' + (st ? ' ' + st : ''));
    li.style.setProperty('--hc', COLORS[idx % COLORS.length]);
    li.style.setProperty('--hp', PAPER[idx % PAPER.length].f);
    li.style.setProperty('--hpi', PAPER[idx % PAPER.length].i);
    // habits with a goal above one (or counted in minutes/steps) get a progress ring; small goals also show "1/3" inside it
    const multi = h.target_count > 1 || h.kind === 'time' || h.kind === 'steps';
    const check = make('button', 'hab-check' + (multi ? ' multi' : ''));
    check.type = 'button';
    check.style.setProperty('--p', Math.min(100, (n / h.target_count) * 100));
    const showCount = multi && h.target_count >= 2 && h.target_count <= 9 && h.kind !== 'time' && h.kind !== 'steps';
    check.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5.5 12.5 4.2 4.2L18.5 8"/></svg>' + (showCount ? '<span class="hab-cnt">' + n + '/' + h.target_count + '</span>' : '');
    check.setAttribute('role', 'checkbox');
    check.setAttribute('aria-checked', String(st === 'done'));
    check.setAttribute('aria-label', (st === 'done' ? 'Desfazer: ' : 'Marcar: ') + h.name + ', ' + dayDate(D).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }) + (multi && st !== 'done' ? ' (' + amount(h, n).replace(' hoje', '') + ')' : ''));
    if (kindOf(h).quick) check.addEventListener('click', () => stepDay(h, D));
    else { check.disabled = true; check.title = h.kind === 'time' ? 'Os minutos são somados pelo cronômetro' : 'Preenchido automaticamente'; }
    li.appendChild(check);
    const name = make('div', 'hab-name', h.name);
    if (h.target_count > 1 || h.kind !== 'check') name.appendChild(make('small', '', amount(h, n).replace(' hoje', '') + (isToday && h.kind !== 'steps' && (h.kind !== 'check' || h.unit) ? ' hoje' : '')));
    li.appendChild(name);
    if (isToday && h.streak >= 2) li.appendChild(make('span', 'hab-streak', h.streak + ' dias'));
    if (isToday && h.kind === 'time') li.appendChild(timerButton(h));
    if (h.kind === 'steps') li.appendChild(make('span', 'hab-auto', 'Do seu relógio'));
    else {
      const edit = make('button', 'hab-edit'); edit.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16Z"/><path d="M13.500 6.500l4 4"/></svg>';
      edit.title = 'Editar ' + h.name; edit.setAttribute('aria-label', 'Editar ' + h.name);
      edit.type = 'button';
      edit.addEventListener('click', () => openDialog(h));
      li.appendChild(edit);
    }
    return li;
  }

  // navy card: the week, one row per habit
  function weekCard() {
    const c = figure('hab-week-card');
    c.appendChild(make('p', 'hab-k', 'Esta semana'));
    if (!S.habits.length) return emptyIn(c, 'Sua semana se preenche conforme você marca os hábitos.');
    const days = Array.from({ length: 7 }, (_, i) => addDays(new Date(), i - 6));
    const grid = make('div', 'hab-week');
    const head = make('div', 'hab-wrow');
    head.appendChild(make('span'));
    days.forEach((d) => head.appendChild(make('span', 'hab-dow' + (dayKey(d) === S.today ? ' now' : ''), d.toLocaleDateString('pt-BR', { weekday: 'narrow' }))));
    grid.appendChild(head);
    S.habits.forEach((h, idx) => {
      const r = make('div', 'hab-wrow');
      r.style.setProperty('--hc', COLORS[idx % COLORS.length]);
      r.appendChild(make('span', 'hab-wname', h.name));
      const doneDays = days.filter((d) => statusOf(h, dayKey(d)) === 'done').length;
      r.appendChild(make('span', 'hab-wtot', doneDays + '/7'));
      days.forEach((d) => {
        const key = dayKey(d);
        const cell = make('button', 'hab-cell ' + statusOf(h, key) + (key === S.today ? ' now' : ''));
        cell.type = 'button';
        cell.innerHTML = STAR_SVG;
        const n = h.days[key] || 0;
        cell.title = ago(d, amount(h, n).replace(' hoje', ''));
        cell.setAttribute('aria-label', h.name + ', ' + d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }) + ': ' + amount(h, n).replace(' hoje', '') + (h.kind === 'steps' ? '. Vem dos dados de saúde.' : h.kind === 'time' ? '. Registrado pelo cronômetro.' : ''));
        // this grid is only for looking back; ticking happens in the list on the left
        cell.disabled = true; cell.classList.add('ro');
        if (h.kind !== 'steps' && h.kind !== 'time' && n > 0 && n < h.target_count && h.target_count <= 9) cell.appendChild(make('span', 'hab-cn', n + '/' + h.target_count));
        r.appendChild(cell);
      });
      grid.appendChild(r);
    });
    c.appendChild(grid);
    return c;
  }

  // eggshell card: the last 30 days, one square each
  function monthCard() {
    const c = figure('hab-month-card');
    c.appendChild(make('p', 'hab-k', 'Últimos 30 dias'));
    if (!S.habits.length) return emptyIn(c, 'Nada para mostrar ainda.');
    const grid = make('div', 'hab-month');
    for (let i = 29; i >= 0; i--) {
      const d = addDays(new Date(), -i);
      const key = dayKey(d);
      const live = S.habits.filter((h) => h.created_at.slice(0, 10) <= key || (h.days[key] || 0) > 0);
      const done = live.filter((h) => (h.days[key] || 0) >= h.target_count).length;
      const part = live.some((h) => (h.days[key] || 0) > 0);
      const ratio = live.length ? done / live.length : 0;
      const level = ratio >= 1 ? 'l3' : ratio >= 0.5 ? 'l2' : part || done ? 'l1' : '';
      const sq = make('button', 'hab-sq ' + level + (i === 0 ? ' now' : '') + (key === S.day ? ' sel' : ''), String(d.getDate()));
      sq.type = 'button';
      sq.title = ago(d, done + ' de ' + live.length + ' concluídos');
      sq.setAttribute('aria-label', ago(d, done + ' de ' + live.length + ' concluídos') + '. Ver este dia');
      sq.addEventListener('click', () => goDay(key));
      grid.appendChild(sq);
    }
    c.appendChild(grid);
    return c;
  }

  function render() {
    const wrap = make('div', 'hab-wrap');
    const main = make('section', 'hab-main');
    const side = make('aside', 'hab-sidecol');
    main.append(pageHead(), listCard());
    side.append(tags(), weekCard(), monthCard());
    wrap.append(main, side);
    $('habGrid').replaceChildren(wrap);
  }


  // ---- timers for "time" habits: start, stop, and the minutes are added to the day it was started ----------------------------------------
  const TIMER_KEY = 'ignis.habits.timers';
  function timers() { try { return JSON.parse(localStorage.getItem(TIMER_KEY) || '{}') || {}; } catch (e) { return {}; } }
  function saveTimers(t) { try { localStorage.setItem(TIMER_KEY, JSON.stringify(t)); } catch (e) { /* private mode: the timer just will not survive a reload */ } }
  const clockText = (ms) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    return (h ? h + ':' + pad(m) : m) + ':' + pad(r);
  };
  function timerButton(h) {
    const started = timers()[h.id];
    const b = make('button', 'hab-timer' + (started ? ' on' : ''));
    b.type = 'button';
    b.dataset.id = h.id;
    b.setAttribute('aria-label', (started ? 'Parar cronômetro de ' : 'Iniciar cronômetro de ') + h.name);
    b.innerHTML = '<span class="hab-tico" aria-hidden="true">' + (started ? '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>' : '<svg viewBox="0 0 24 24"><path d="M8 5l11 7-11 7Z"/></svg>') + '</span>';
    const t = make('span', 'hab-clock', started ? clockText(Date.now() - started) : 'Iniciar');
    if (started) t.dataset.since = started;
    b.appendChild(t);
    b.addEventListener('click', () => toggleTimer(h));
    return b;
  }
  async function toggleTimer(h) {
    const all = timers();
    if (!all[h.id]) { all[h.id] = Date.now(); saveTimers(all); render(); return; }
    const since = all[h.id];
    const mins = Math.max(1, Math.round((Date.now() - since) / 60000));
    const day = dayKey(new Date(since));
    delete all[h.id];
    saveTimers(all);
    const total = (h.days[day] || 0) + mins;
    h.days[day] = total;
    if (day === S.today) { h.count_today = total; h.done_today = total >= h.target_count; }
    render();
    try {
      await api('/v1/habits/' + h.id + '/days/' + day, { method: 'PUT', body: { count: total } });
      toast('Adicionado: ' + clock(mins));
      await load();
    } catch (e) { toast(e.message); await load().catch(() => {}); }
  }
  // the running clocks tick once a second
  setInterval(() => {
    document.querySelectorAll('.hab-clock[data-since]').forEach((el) => { el.textContent = clockText(Date.now() - Number(el.dataset.since)); });
  }, 1000);

  // ---- ticking ----------------------------------------------------------------------------------------------------------------------------
  const step = (h) => stepDay(h, S.today);
  // tick a habit on any shown day: one more time, back to none once the daily target is reached
  async function stepDay(h, day) {
    const quick = kindOf(h).quick;
    if (!quick) return;
    const prev = h.days[day] || 0;
    const next = prev >= h.target_count ? 0 : Math.min(h.target_count, prev + quick);
    const apply = (n) => {
      if (n) h.days[day] = n; else delete h.days[day];
      if (day === S.today) { h.count_today = n; h.done_today = n >= h.target_count; }
    };
    apply(next);
    render();
    try {
      await api('/v1/habits/' + h.id + '/days/' + day, { method: 'PUT', body: { count: next } });
      await load();
    } catch (e) {
      apply(prev);
      render();
      toast(e.message);
    }
  }

  // ---- add / edit dialog ------------------------------------------------------------------------------------------------------------------
  // the big number, a short unit line, and (for small goals) a row of dots previewing the daily check-ins
  function showTarget(bump) {
    const K = KINDS[kind];
    const num = $('habTarget');
    num.textContent = kind === 'steps' ? target.toLocaleString('pt-BR') : target;
    $('habTargetLabel').textContent = K.goal;
    $('habUnitRow').hidden = kind !== 'check';
    $('habNote').textContent = kind === 'time' ? (target >= 60 ? '= ' + clock(target) + ' · registrado com cronômetro' : 'minutos · registrado com cronômetro') : kind === 'steps' ? 'preenchido pelos seus dados de saúde' : kind === 'check' ? $('habUnit').value.trim() : '';
    const dots = kind === 'check' && target <= 12 ? target : 0;
    $('habDots').replaceChildren(...Array.from({ length: dots }, (_, i) => { const d = make('i'); d.style.setProperty('--i', i); return d; }));
    document.querySelectorAll('#habTypes button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === kind)));
    if (bump) { num.classList.remove('bump'); void num.offsetWidth; num.classList.add('bump'); }
  }
  let editing = null;
  let target = 1;
  let kind = 'check';
  let armed = 0;
  function openDialog(h) {
    editing = h;
    kind = h ? (h.kind === 'count' ? 'check' : h.kind || 'check') : 'check';   // older Count habits open as the merged Check-in type
    target = h ? h.target_count : KINDS.check.def;
    $('habDlgTitle').textContent = h ? 'Editar hábito' : 'Novo hábito';
    $('habName').value = h ? h.name : '';
    fillGroups(h && h.section ? h.section : '');
    $('habUnit').value = h && h.unit && (h.kind === 'count' || h.kind === 'check') ? h.unit : '';
    showTarget(false);
    $('habErr').hidden = true;
    $('habSave').disabled = false;
    const del = $('habDelete');
    del.hidden = !h;
    del.classList.remove('sure');
    del.textContent = 'Apagar este hábito';
    $('habDialog').showModal();
    $('habName').focus();
  }


  // ---- the group manager: the only place where groups are created and removed ----
  function fillGroups(current) {
    const labels = S.cats.map((c) => c.label);
    if (current && !labels.includes(current)) labels.push(current);   // a group that only this habit still has
    $('habSection').replaceChildren(...[''].concat(labels).map((l) => { const o = make('option', '', l || 'Sem grupo'); o.value = l; return o; }));
    $('habSection').value = current || '';
  }
  const TRASH = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/></svg>';
  const catErr = (t) => { const e = $('habCatErr'); e.textContent = t || ''; e.hidden = !t; };
  function showCats() {
    const ul = $('habCatRows'); ul.replaceChildren();
    if (!S.cats.length) ul.appendChild(make('li', 'hab-cm-empty', 'Nenhum grupo ainda. Crie o primeiro acima.'));
    S.cats.forEach((c, i) => {
      const li = make('li', 'hab-cm-row'); li.draggable = true; li.dataset.key = c.key;
      const grip = make('span', 'hab-grip'); grip.setAttribute('aria-hidden', 'true'); grip.innerHTML = '<svg viewBox="0 0 24 24"><path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01"/></svg>';
      const name = make('button', 'hab-cm-name', c.label); name.type = 'button'; name.title = 'Renomear'; name.onclick = () => renameCat(c, li, name);
      const cnt = make('span', 'hab-cm-count', c.count + (c.count === 1 ? ' hábito' : ' hábitos'));
      const rm = make('button', 'hab-cm-rm'); rm.type = 'button'; rm.innerHTML = TRASH; rm.setAttribute('aria-label', 'Apagar ' + c.label); rm.title = 'Apagar'; rm.onclick = () => delCat(c);
      li.append(grip, name, cnt, rm); ul.appendChild(li);
      li.addEventListener('dragstart', (e) => { dragKey = c.key; li.classList.add('drag'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', c.key); } catch (x) { /* ok */ } });
      li.addEventListener('dragend', () => { dragKey = null; ul.querySelectorAll('.drag, .over').forEach((x) => x.classList.remove('drag', 'over')); });
      li.addEventListener('dragover', (e) => { if (dragKey && dragKey !== c.key) { e.preventDefault(); ul.querySelectorAll('.over').forEach((x) => x.classList.remove('over')); li.classList.add('over'); } });
      li.addEventListener('drop', (e) => { e.preventDefault(); if (!dragKey || dragKey === c.key) return; moveCat(S.cats.findIndex((x) => x.key === dragKey), i); });
    });
  }
  // the name turns into a field; Enter or leaving it saves, Escape cancels
  function renameCat(c, li, nameBtn) {
    li.draggable = false;
    const inp = make('input', 'hab-cm-edit'); inp.value = c.label; inp.maxLength = 40; inp.setAttribute('aria-label', 'Novo nome do grupo');
    nameBtn.replaceWith(inp); inp.focus(); inp.select();
    let done = false;
    const finish = async (keep) => {
      if (done) return; done = true;
      const v = inp.value.trim();
      if (keep && v && v !== c.label) {
        try { S.cats = (await api('/v1/habits/categories/' + encodeURIComponent(c.key), { method: 'PATCH', body: { label: v } })).categories; catErr(''); await load(); }
        catch (ex) { catErr(CAT_ERR[ex.message] || ex.message); }
      }
      showCats();
    };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); finish(true); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); } });
    inp.addEventListener('blur', () => finish(true));
  }
  let dragKey = null;
  // drag a group to a new place: save the order, and redraw the list and the page
  async function moveCat(from, to) {
    if (from < 0 || to < 0 || to >= S.cats.length || from === to) return;
    const prev = S.cats, next = prev.slice(); next.splice(to, 0, next.splice(from, 1)[0]);
    S.cats = next; showCats(); render();
    try { S.cats = (await api('/v1/habits/categories/order', { method: 'PUT', body: { keys: next.map((c) => c.key) } })).categories; showCats(); render(); }
    catch (ex) { S.cats = prev; showCats(); render(); catErr(ex.message); }
  }
  function openCats() { $('habCatNew').value = ''; catErr(''); showCats(); $('habCatDialog').showModal(); $('habCatNew').focus(); }
  const CAT_ERR = { 'that category already exists': 'Esse grupo já existe.', 'give the category a name': 'Dê um nome ao grupo.' };
  async function delCat(c) {
    const text = c.count ? 'Apagar "' + c.label + '"? ' + (c.count === 1 ? 'O hábito dele fica' : 'Os ' + c.count + ' hábitos dele ficam') + ' sem grupo.' : 'Apagar o grupo "' + c.label + '"?';
    if (!(await window.IgnisConfirm.ask({ title: 'Apagar grupo', text, ok: 'Apagar' }))) return;
    try { await api('/v1/habits/categories/' + encodeURIComponent(c.key), { method: 'DELETE' }); await load(); showCats(); toast('Grupo apagado'); }
    catch (ex) { catErr(ex.message); }
  }

  async function save(event) {
    event.preventDefault();
    const name = $('habName').value.trim();
    const err = $('habErr');
    err.hidden = true;
    if (!name) { err.textContent = 'Dê um nome ao hábito.'; err.hidden = false; return; }
    $('habSave').disabled = true;
    const unit = kind === 'check' ? $('habUnit').value.trim() : kind === 'time' ? 'min' : kind === 'steps' ? 'steps' : '';
    const body = { name, section: $('habSection').value || null, kind, unit, target_count: target };
    try {
      if (editing) await api('/v1/habits/' + editing.id, { method: 'PATCH', body: { ...body, section: body.section || '' } });
      else await api('/v1/habits', { method: 'POST', body });
      $('habDialog').close();
      toast(editing ? 'Salvo' : 'Hábito adicionado');
      await load();
    } catch (e) {
      err.textContent = e.message;
      err.hidden = false;
      $('habSave').disabled = false;
    }
  }

  // deleting asks first, in its own dialog
  function remove() {
    $('habDelText').textContent = 'Apagar "' + editing.name + '"? O histórico dele também será apagado e isso não pode ser desfeito.';
    $('habDelDialog').showModal();
    $('habDelCancel').focus();
  }
  async function confirmRemove() {
    const go = $('habDelGo');
    go.disabled = true;
    try {
      await api('/v1/habits/' + editing.id, { method: 'DELETE' });
      $('habDelDialog').close();
      $('habDialog').close();
      toast('Hábito apagado');
      await load();
    } catch (e) { $('habDelDialog').close(); toast(e.message); }
    finally { go.disabled = false; }
  }

  // ---- stars trail the pointer across the page (same as the Meds page) ------------------------------------------------------------------
  function sparkTrail() {
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const STAR = 'M0,-1 C.15,-.3 .3,-.15 1,0 C.3,.15 .15,.3 0,1 C-.15,.3 -.3,.15 -1,0 C-.3,-.15 -.15,-.3 0,-1Z';
    const layer = make('div', 'hab-trail');
    document.body.appendChild(layer);
    const LIGHT = ['#f2b3da', '#12287f', '#fffdf6'];
    const DARK = ['#f2b3da', '#dde22b', '#efe7d4'];
    let last = 0, lx = -99, ly = -99;
    document.addEventListener('pointermove', (event) => {
      if (event.pointerType === 'touch') return;
      const now = performance.now();
      if (now - last < 55 || Math.hypot(event.clientX - lx, event.clientY - ly) < 18) return;
      const target = event.target;
      if (target.closest && target.closest('dialog, input, button')) return;
      last = now; lx = event.clientX; ly = event.clientY;
      const surface = target.closest ? target.closest('.hab-fig') : null;
      let dark = false;
      if (surface) {
        const m = getComputedStyle(surface).backgroundColor.match(/\d+(\.\d+)?/g);
        if (m) dark = (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]) < 110;
      }
      const colors = dark ? DARK : LIGHT;
      const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      s.setAttribute('viewBox', '-1 -1 2 2');
      s.setAttribute('class', 'hab-bs');
      s.innerHTML = '<path d="' + STAR + '"/>';
      const size = 12 + Math.random() * 16;
      s.style.cssText = 'left:' + event.clientX + 'px;top:' + event.clientY + 'px;width:' + size + 'px;height:' + size + 'px;color:' + colors[Math.floor(Math.random() * 3)] +
        ';--dx:' + (Math.random() * 40 - 20).toFixed(0) + 'px;--dy:' + (Math.random() * 30 - 8).toFixed(0) + 'px';
      s.addEventListener('animationend', () => s.remove());
      layer.appendChild(s);
    });
  }

  function init() {
    sparkTrail();
    document.addEventListener('keydown', (e) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open]')) return;
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); goDay(dayKey(addDays(dayDate(S.day), -1))); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); goDay(dayKey(addDays(dayDate(S.day), 1))); }
    });
    $('habClose').addEventListener('click', () => $('habDialog').close());
    $('habDialog').addEventListener('click', (e) => { if (e.target === $('habDialog')) $('habDialog').close(); });
    $('habForm').addEventListener('submit', save);
    $('habDelete').addEventListener('click', remove);
    $('habDelGo').addEventListener('click', confirmRemove);
    $('habDelCancel').addEventListener('click', () => $('habDelDialog').close());
    $('habDelClose').addEventListener('click', () => $('habDelDialog').close());
    $('habDelDialog').addEventListener('click', (e) => { if (e.target === $('habDelDialog')) $('habDelDialog').close(); });
    $('habTypes').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-k]');
      if (!b || b.dataset.k === kind) return;
      kind = b.dataset.k;
      target = KINDS[kind].def;
      showTarget(true);
    });
    $('habUnit').addEventListener('input', () => showTarget(false));
    $('habCatClose').onclick = () => $('habCatDialog').close();
    $('habCatForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const label = $('habCatNew').value.trim(); if (!label) return;
      try { S.cats = (await api('/v1/habits/categories', { method: 'POST', body: { label } })).categories; $('habCatNew').value = ''; catErr(''); showCats(); render(); $('habCatNew').focus(); }
      catch (ex) { catErr(CAT_ERR[ex.message] || ex.message); }
    });
    $('habStep').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-d]');
      if (!b) return;
      const K = KINDS[kind];
      target = Math.max(K.min, Math.min(K.max, target + Number(b.dataset.d) * K.step));
      showTarget(true);
    });
    load().catch(() => {
      $('habGrid').hidden = true;
      $('habEmpty').textContent = 'Não foi possível carregar seus hábitos agora.';
      $('habEmpty').hidden = false;
    });
    // pick up a new day, and refresh now and then
    setInterval(() => { if (dayKey(new Date()) !== S.today) load().catch(() => {}); }, 60 * 1000);
    setInterval(() => { load().catch(() => {}); }, 10 * 60 * 1000);
  }

  init();
})();
