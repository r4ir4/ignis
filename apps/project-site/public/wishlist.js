// Wishlist page, laid out like the Subscriptions and Food pages: things you want, how much you want them and what they cost, with a "Got" tab
// for what you bought and how it turned out. On the right: Add, totals and a per-category breakdown that filters the list.
// Everything is stored on the Ignis server (/v1/wishlist); nothing is kept in the browser.
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(2, '0');
  const dayKey = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const make = (tag, cls, text) => { const el = document.createElement(tag); if (cls) el.className = cls; if (text != null) el.textContent = text; return el; };
  const toast = (text, opts) => window.IgnisToast.show(text, opts);

  const S = { items: [], tab: 'want', filter: null, page: 1, editing: null };
  const PAGE = 12;   // three rows of four

  async function api(path, method, body) {
    const init = { method: method || 'GET', headers: {} };
    if (body) { init.body = JSON.stringify(body); init.headers['Content-Type'] = 'application/json'; }
    const res = await fetch('api/v1/wishlist' + path, init);
    if (!res.ok) {
      let detail = ''; try { const j = await res.json(); if (typeof j.detail === 'string') detail = j.detail; } catch (e) { /* not json */ }
      throw new Error(detail || 'Algo deu errado (' + res.status + ').');
    }
    return res.status === 204 ? null : res.json();
  }
  const fromServer = (r) => ({ id: r.id, name: r.title, url: r.url || '', price: r.price, cur: r.currency || 'BRL', note: r.notes || '', longing: r.longing, cat: r.category || 'other', purpose: r.purpose || '',
    got: r.got_at || '', paid: r.purchase_price, paidCur: r.purchase_currency || r.currency || 'BRL', with: r.payment_source || '', verdict: r.verdict || '', created: r.created_at || '', updated: r.updated_at || '', pic: !!r.has_image, pics: r.pics || [] });
  async function reload() { const [a, c] = await Promise.all([api(''), api('/categories').catch(() => ({ categories: S.cats || [] }))]); S.cats = c.categories; S.items = a.items.map(fromServer); render(); }

  // ---- formatting ----------------------------------------------------------------------------------------------------------------------------------
  const money = (n, cur) => { try { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: cur || 'BRL' }).format(n); } catch (e) { return (cur || '') + ' ' + n.toFixed(2); } };
  const money0 = (n, cur) => { try { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: cur || 'BRL', maximumFractionDigits: 0 }).format(n); } catch (e) { return String(Math.round(n)); } };
  const parseMoney = (v) => {
    let t = String(v).trim().replace(/[^\d.,]/g, '');
    if (!t) return null;
    if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');   // 1.100 is eleven hundred, as written in Brazil
    else if (t.includes(',') && t.includes('.')) t = t.replace(/\./g, '').replace(',', '.');
    else if (t.includes(',')) t = t.replace(',', '.');
    const n = parseFloat(t);
    return n >= 0 ? Math.round(n * 100) / 100 : NaN;
  };
  const CAT_PT = { accesories: 'Acessórios', accessories: 'Acessórios', tech: 'Tecnologia', photography: 'Fotografia', shoes: 'Calçados', audio: 'Áudio', clothes: 'Roupas', home: 'Casa', other: 'Outros', books: 'Livros', games: 'Jogos', health: 'Saúde', sports: 'Esportes' };
  const catLabel = (k) => { const c = (S.cats || []).find((x) => x.key === k); return c ? c.label : (CAT_PT[k] || (k ? k.charAt(0).toUpperCase() + k.slice(1) : 'Outros')); };
  const cats = () => (S.cats && S.cats.length ? S.cats.map((c) => c.key) : [...new Set(S.items.map((i) => i.cat))].sort());
  const median = (list) => { const a = list.slice().sort((x, y) => x - y); if (!a.length) return null; const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
  function ageText(iso) {
    const days = Math.max(0, Math.floor((Date.now() - new Date(iso)) / 864e5));
    if (days < 1) return 'Adicionado hoje';
    if (days < 14) return 'Adicionado há ' + days + (days === 1 ? ' dia' : ' dias');
    if (days < 60) return 'Adicionado há ' + Math.floor(days / 7) + ' semanas';
    if (days < 730) return 'Adicionado há ' + Math.floor(days / 30) + ' meses';
    return 'Adicionado há ' + Math.floor(days / 365) + ' anos';
  }
  const dateText = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' }); };
  const safeUrl = (u) => /^https?:\/\//i.test(u) ? u : '';
  // totals only add up items in one currency, so a lone dollar item never gets mixed into the reais
  const totalIn = (items, cur, field) => items.filter((i) => (field === 'paid' ? i.paidCur : i.cur) === cur && (field === 'paid' ? i.paid : i.price) != null).reduce((t, i) => t + (field === 'paid' ? i.paid : i.price), 0);
  const mainCur = (items) => { const c = {}; items.forEach((i) => { c[i.cur] = (c[i.cur] || 0) + 1; }); return Object.keys(c).sort((a, b) => c[b] - c[a])[0] || 'BRL'; };

  // ---- a light gallery: pastel picture cards, only a name and a price on each; the rest opens on click ------------------------------------------------------
  const TINT = ['#ffe3ec', '#ffeadb', '#fff1c9', '#e6f2dc', '#e4eefb', '#f0e6fb', '#ffe0e0'];
  const STRONG = ['#ec5b92', '#ff9c60', '#f2b84b', '#8fbf6f', '#6aa0e0', '#a07be0', '#ff6b78'];
  const catIdx = (k) => Math.max(0, cats().indexOf(k)) % TINT.length;
  const visible = () => {
    const want = S.tab === 'want';
    let list = S.items.filter((i) => (want ? !i.got : !!i.got));
    if (S.filter) list = list.filter((i) => i.cat === S.filter);
    const price = (i) => (i.price == null ? -1 : i.price);
    if (!want) return list.sort((a, b) => b.got.localeCompare(a.got));
    return list.sort((a, b) => b.longing - a.longing || price(b) - price(a));
  };
  const PLUS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
  const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.500l4.500 4.500L19 7.500"/></svg>';

  const TAG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9-9-9zM7.5 7.5h.01"/></svg>';
  function hero() {
    const want = S.items.filter((i) => !i.got), got = S.items.filter((i) => i.got);
    const h = make('header', 'ck-hero wl-hero');
    const txt = make('div', 'wl-htxt');
    txt.appendChild(make('h1', '', 'Wishlist'));
    let sub = 'nada aqui ainda';
    if (S.items.length) {
      if (S.tab === 'want') { const cur = mainCur(want); sub = want.length + (want.length === 1 ? ' item' : ' itens') + (want.length ? ' · ' + money0(totalIn(want, cur), cur) : ''); }
      else { const cur = mainCur(got); sub = got.length + (got.length === 1 ? ' conquistado' : ' conquistados') + (got.length ? ' · ' + money0(totalIn(got, cur, 'paid'), cur) + ' gastos' : ''); }
    }
    txt.appendChild(make('p', 'wl-sub', sub));
    const btns = make('div', 'wl-hbtns');
    const cat = make('button', 'wl-hbtn'); cat.type = 'button'; cat.id = 'wlCats'; cat.innerHTML = TAG; cat.setAttribute('aria-label', 'Gerenciar categorias'); cat.title = 'Gerenciar categorias';
    cat.addEventListener('click', openCats);
    const add = make('button', 'wl-hbtn primary'); add.type = 'button'; add.id = 'wlAdd'; add.innerHTML = PLUS; add.setAttribute('aria-label', 'Adicionar item'); add.title = 'Adicionar item';
    add.addEventListener('click', () => openDialog(null));
    btns.append(cat, add);
    h.append(txt, btns);
    return h;
  }
  function bar() {
    const wrap = make('div', 'wl-controls');
    const top = make('div', 'wl-top');
    const tabs = make('div', 'wl-tabs'); tabs.setAttribute('role', 'group'); tabs.setAttribute('aria-label', 'Mostrar');
    [['want', 'Desejados', S.items.filter((i) => !i.got).length], ['got', 'Conquistados', S.items.filter((i) => i.got).length]].forEach(([k, label, n]) => {
      const b = make('button', 'wl-tab'); b.type = 'button'; b.setAttribute('aria-pressed', String(S.tab === k));
      b.append(document.createTextNode(label), make('b', '', String(n)));
      b.addEventListener('click', () => { S.tab = k; S.filter = null; S.page = 1; render(); });
      tabs.appendChild(b);
    });
    top.append(tabs);
    wrap.appendChild(top);
    const list = S.items.filter((i) => (S.tab === 'want' ? !i.got : !!i.got));
    const counts = {}; list.forEach((i) => { counts[i.cat] = (counts[i.cat] || 0) + 1; });
    const keys = Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b));
    if (keys.length > 1) {
      const pills = make('div', 'wl-pills'); pills.setAttribute('role', 'group'); pills.setAttribute('aria-label', 'Categoria');
      const one = (k, label) => {
        const b = make('button', 'wl-pill', label); b.type = 'button'; b.setAttribute('aria-pressed', String((S.filter || '') === k));
        if (k) b.style.setProperty('--pc', STRONG[catIdx(k)]);
        b.addEventListener('click', () => { S.filter = S.filter === k ? null : (k || null); S.page = 1; render(); });
        return b;
      };
      pills.appendChild(one('', 'Todas'));
      keys.forEach((k) => pills.appendChild(one(k, catLabel(k))));
      wrap.appendChild(pills);
    }
    return wrap;
  }
  // Centers the product in its tile: finds the non-background bounding box and nudges/scales the <img> so it sits in the middle.
  function centerPic(im) {
    try {
      const N = 100, c = document.createElement('canvas'); c.width = c.height = N;
      const x = c.getContext('2d', { willReadFrequently: true });
      const r = Math.min(N / im.naturalWidth, N / im.naturalHeight), w = im.naturalWidth * r, h = im.naturalHeight * r;
      x.fillStyle = '#fff'; x.fillRect(0, 0, N, N);
      x.drawImage(im, (N - w) / 2, (N - h) / 2, w, h);
      const d = x.getImageData(0, 0, N, N).data;
      const px = (i, j) => { const o = (j * N + i) * 4; return [d[o], d[o + 1], d[o + 2]]; };
      const ox = Math.round((N - w) / 2), oy = Math.round((N - h) / 2), ex = Math.round(ox + w) - 1, ey = Math.round(oy + h) - 1;
      const bg = [0, 1, 2].map((k) => [px(ox + 2, oy + 2), px(ex - 2, oy + 2), px(ox + 2, ey - 2), px(ex - 2, ey - 2)].map((a) => a[k]).sort((a, b) => a - b)[1]);
      // Rows/columns count as "product" only when a few pixels differ from the background, so specks and shadows don't stretch the box.
      const rows = new Array(N).fill(0), cols = new Array(N).fill(0);
      for (let j = oy; j <= ey; j++) for (let i = ox; i <= ex; i++) {
        const q = px(i, j);
        if (Math.abs(q[0] - bg[0]) + Math.abs(q[1] - bg[1]) + Math.abs(q[2] - bg[2]) > 24) { rows[j]++; cols[i]++; }
      }
      const first = (a) => a.findIndex((v) => v >= 2), last = (a) => a.length - 1 - [...a].reverse().findIndex((v) => v >= 2);
      let x0 = first(cols), x1 = last(cols), y0 = first(rows), y1 = last(rows);
      if (x0 < 0 || x1 < x0 || y0 < 0 || y1 < y0 || (x1 - x0) < N * 0.1 || (y1 - y0) < N * 0.1) return;
      x0 = Math.max(0, x0 - 2); y0 = Math.max(0, y0 - 2); x1 = Math.min(N - 1, x1 + 2); y1 = Math.min(N - 1, y1 + 2);
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
      // Zoom so the product fills ~86% of the tile (1.7x at most, shrunk to 0.8x if it is bigger), then center it.
      const s = Math.max(0.8, Math.min(1.7, (N * 0.86) / Math.max(bw, bh)));
      // Photos rarely have pure-white backgrounds; brighten so the background becomes white and the multiply blend makes the photo's edge invisible against the tile tint wherever it ends up.
      const avg = (bg[0] + bg[1] + bg[2]) / 3;
      if (avg > 200 && avg < 254) im.style.setProperty('--b', (255 / avg).toFixed(3));
      im.style.setProperty('--tx', ((N / 2 - (x0 + bw / 2)) * s) / N * 100 + '%');
      im.style.setProperty('--ty', ((N / 2 - (y0 + bh / 2)) * s) / N * 100 + '%');
      im.style.setProperty('--s', s.toFixed(3));
    } catch (e) { /* leave the picture as is */ }
  }
  function card(it, i) {
    const li = make('li', 'wl-item'); li.style.setProperty('--i', Math.min(i, 14));
    const b = make('button', 'wl-card'); b.type = 'button';
    b.setAttribute('aria-label', it.name + (it.price != null ? ', ' + money0(it.price, it.cur) : ''));
    const img = make('span', 'wl-img'); img.style.background = TINT[catIdx(it.cat)];
    if (it.pic) { const im = make('img'); im.alt = ''; im.loading = 'lazy'; im.addEventListener('load', () => centerPic(im)); im.src = 'api/v1/wishlist/' + it.id + '/image?v=' + encodeURIComponent(it.updated); img.appendChild(im); }
    else img.appendChild(make('i', '', (it.name || '?').trim().charAt(0).toUpperCase()));
    if (it.got) { const tick = make('em', 'wl-tick'); tick.innerHTML = CHECK; img.appendChild(tick); }
    b.append(img, make('span', 'wl-name', it.name));
    const p = it.got ? (it.paid != null ? money0(it.paid, it.paidCur) : it.price != null ? money0(it.price, it.cur) : '') : (it.price != null ? money0(it.price, it.cur) : 'Sem preço');
    b.appendChild(make('span', 'wl-price' + (p === 'Sem preço' ? ' none' : ''), p));
    b.addEventListener('click', () => openView(it));
    li.appendChild(b);
    return li;
  }
  function gallery() {
    const rows = visible();
    if (!S.items.length) return make('p', 'wl-empty', 'Nada na sua lista de desejos ainda. Adicione a primeira coisa que você quer.');
    if (!rows.length) return make('p', 'wl-empty', S.tab === 'want' ? 'Nada mais na lista de desejos.' : 'Nada marcado como conquistado ainda.');
    const pages = Math.max(1, Math.ceil(rows.length / PAGE));
    S.page = Math.min(Math.max(1, S.page), pages);
    const box = make('div', 'wl-gallery');
    const ul = make('ul', 'wl-grid'); ul.setAttribute('aria-label', S.tab === 'want' ? 'Desejados' : 'Conquistados');
    rows.slice((S.page - 1) * PAGE, S.page * PAGE).forEach((it, i) => ul.appendChild(card(it, i)));
    box.appendChild(ul);
    if (pages > 1) box.appendChild(pager(pages));
    return box;
  }
  const ARROW = (n) => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + (n < 0 ? 'm14.5 6-6 6 6 6' : 'm9.5 6 6 6-6 6') + '"/></svg>';
  function pager(pages) {
    const nav = make('nav', 'wl-pager'); nav.setAttribute('aria-label', 'Páginas');
    const go = (p) => { S.page = p; render(); const top = document.querySelector('.wl-controls'); if (top) top.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
    const arrow = (dir, label) => {
      const b = make('button', 'wl-pg wl-pg-arrow'); b.type = 'button'; b.innerHTML = ARROW(dir); b.setAttribute('aria-label', label);
      b.disabled = dir < 0 ? S.page <= 1 : S.page >= pages;
      b.addEventListener('click', () => go(S.page + dir));
      return b;
    };
    nav.appendChild(arrow(-1, 'Página anterior'));
    // every page when there are few, otherwise the first, the last and the ones around the current page
    const shown = [];
    for (let p = 1; p <= pages; p++) if (pages <= 7 || p === 1 || p === pages || Math.abs(p - S.page) <= 1) shown.push(p);
    shown.forEach((p, i) => {
      if (i && p - shown[i - 1] > 1) nav.appendChild(make('span', 'wl-gap', '…'));
      const b = make('button', 'wl-pg', String(p)); b.type = 'button';
      b.setAttribute('aria-label', 'Página ' + p); if (p === S.page) b.setAttribute('aria-current', 'page');
      b.addEventListener('click', () => go(p));
      nav.appendChild(b);
    });
    nav.appendChild(arrow(1, 'Próxima página'));
    return nav;
  }
  function render() {
    const wrap = make('div', 'wl-wrap');
    wrap.append(hero(), bar(), gallery());
    $('wlGrid').replaceChildren(wrap);
  }

  // ---- the item opened: a bigger picture, the details, and what you can do with it -----------------------------------------------------------------------------
  const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return u; } };
  const picUrls = (it) => [...(it.pic ? ['api/v1/wishlist/' + it.id + '/image?v=' + encodeURIComponent(it.updated)] : []), ...(it.pics || []).map((p) => 'api/v1/wishlist/' + it.id + '/pics/' + p)];
  const ICON = {
    chevL: '<path d="M15 5l-7 7 7 7"/>', chevR: '<path d="M9 5l7 7-7 7"/>', check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/>', link: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    back: '<path d="M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3"/>',
  };
  const icon = (name) => '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICON[name] + '</svg>';
  let activeCar = null;
  function carousel(urls, name, initial, tint) {
    const wrap = make('div', 'wl-car');
    const stage = make('div', 'wl-cstage'); stage.style.background = tint;
    if (!urls.length) { stage.appendChild(make('i', '', initial)); wrap.appendChild(stage); activeCar = null; return wrap; }
    const imgs = urls.map((u, k) => { const im = make('img', k ? '' : 'on'); im.alt = name + (urls.length > 1 ? ' · imagem ' + (k + 1) + ' de ' + urls.length : ''); im.src = u; im.draggable = false; stage.appendChild(im); return im; });
    wrap.appendChild(stage);
    if (urls.length < 2) { activeCar = null; return wrap; }
    let i = 0;
    const dots = make('div', 'wl-cdots');
    const dotEls = urls.map((u, k) => { const d = make('button', k ? '' : 'on'); d.type = 'button'; d.setAttribute('aria-label', 'Ir para a imagem ' + (k + 1)); d.onclick = () => go(k); dots.appendChild(d); return d; });
    const count = make('span', 'wl-ccount', '1 / ' + urls.length);
    function go(n) { i = (n + urls.length) % urls.length; imgs.forEach((im, k) => im.classList.toggle('on', k === i)); dotEls.forEach((d, k) => d.classList.toggle('on', k === i)); count.textContent = (i + 1) + ' / ' + urls.length; }
    const mk = (cls, ic, label, step) => { const b = make('button', 'wl-cnav ' + cls); b.type = 'button'; b.innerHTML = icon(ic); b.setAttribute('aria-label', label); b.title = label; b.onclick = () => go(i + step); return b; };
    stage.append(mk('prev', 'chevL', 'Imagem anterior', -1), mk('next', 'chevR', 'Próxima imagem', 1), count);
    wrap.appendChild(dots);
    let x0 = null;
    stage.addEventListener('pointerdown', (e) => { x0 = e.clientX; });
    stage.addEventListener('pointerup', (e) => { if (x0 != null && Math.abs(e.clientX - x0) > 40) go(i + (e.clientX < x0 ? 1 : -1)); x0 = null; });
    stage.addEventListener('pointercancel', () => { x0 = null; });
    activeCar = { go: (s) => go(i + s) };
    return wrap;
  }
  const vdlg = $('wlView');
  function openView(it) {
    const box = $('wlViewBody'); box.replaceChildren();
    const side = make('div', 'wl-vside'); side.appendChild(carousel(picUrls(it), it.name, (it.name || '?').trim().charAt(0).toUpperCase(), TINT[catIdx(it.cat)]));
    const main = make('div', 'wl-vmain');
    main.appendChild(make('p', 'wl-vcat', catLabel(it.cat) + (it.got ? ' · conquistado' : '')));
    main.appendChild(make('h2', 'wl-vname', it.name));
    main.appendChild(make('p', 'wl-vprice', (it.got && it.paid != null ? money(it.paid, it.paidCur) : it.price != null ? money(it.price, it.cur) : 'Sem preço')));
    const dl = make('dl', 'wl-vdl');
    const row = (label, value) => { const d = make('div', 'wl-vrow'); d.appendChild(make('dt', '', label)); const dd = make('dd'); if (value instanceof Node) dd.appendChild(value); else dd.textContent = value; d.appendChild(dd); dl.appendChild(d); };
    if (!it.got) {
      const p = make('span', 'wl-pips'); p.setAttribute('role', 'img'); p.setAttribute('aria-label', 'Vontade: ' + it.longing + ' de 10');
      for (let i = 1; i <= 10; i++) p.appendChild(make('i', i <= it.longing ? 'on' : ''));
      const w = make('span', 'wl-vwantrow'); w.append(p, make('b', '', it.longing + '/10'));
      row('Vontade', w);
    }
    if (it.purpose) row('Para quê', it.purpose);
    if (it.note) { const ul = make('ul', 'wl-vbul'); it.note.split(/\r?\n/).map((t) => t.trim()).filter(Boolean).forEach((t) => ul.appendChild(make('li', '', t))); row('Notas', ul); }
    if (it.got) {
      row('Conquistado', dateText(it.got) + (it.with ? ' com ' + it.with : ''));
      if (it.verdict) row('Depois da compra', it.verdict === 'happy' ? 'Satisfeito' : 'Arrependido');
      if (it.price != null && it.paid != null && it.paidCur === it.cur && Math.abs(it.paid - it.price) >= 0.5) row(it.paid < it.price ? 'Economizou' : 'Pagou a mais', money0(Math.abs(it.price - it.paid), it.cur));
    } else { const t = ageText(it.created).replace(/^Adicionado\s*/i, ''); row('Adicionado', t.charAt(0).toUpperCase() + t.slice(1)); }
    const href = safeUrl(it.url);
    if (href) {
      const a = make('a', 'wl-vlink', hostOf(href)); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer';
      row('Link', a);
    }
    main.appendChild(dl);
    const acts = make('div', 'wl-vacts');
    const ib = (cls, ic, label, fn) => { const b = make('button', 'wl-vbtn wl-ib ' + cls); b.type = 'button'; b.innerHTML = icon(ic); b.setAttribute('aria-label', label); b.title = label; b.onclick = fn; return b; };
    acts.append(
      ib('primary', it.got ? 'back' : 'check', it.got ? 'Voltar para a lista' : 'Consegui!', () => { vdlg.close(); if (it.got) backToWishlist(it); else openGot(it); }),
      ib('', 'edit', 'Editar', () => { vdlg.close(); openDialog(it); }));
    if (href) { const a = make('a', 'wl-vbtn wl-ib', ''); a.innerHTML = icon('link'); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.setAttribute('aria-label', 'Abrir link'); a.title = 'Abrir link'; acts.appendChild(a); }
    main.appendChild(acts);
    box.append(side, main);
    vdlg.showModal();
  }
  $('wlViewClose').addEventListener('click', () => vdlg.close());
  vdlg.addEventListener('click', (e) => { if (e.target === vdlg) vdlg.close(); });
  vdlg.addEventListener('keydown', (e) => { if (activeCar && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); activeCar.go(e.key === 'ArrowLeft' ? -1 : 1); } });
  vdlg.addEventListener('close', () => { activeCar = null; });

  // ---- category manager: the only place where categories are created and removed ----------------------------------------------------------------------
  const cdlg = $('wlCatDialog');
  const TRASH = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/></svg>';
  function showCats() {
    const ul = $('wlCatRows'); ul.replaceChildren();
    (S.cats || []).forEach((c) => {
      const li = make('li', 'wl-catrow');
      li.append(make('span', 'wl-catname', c.label), make('small', '', c.count + (c.count === 1 ? ' item' : ' itens')));
      if (c.key !== 'other') {
        const rm = make('button', 'wl-catrm'); rm.type = 'button'; rm.innerHTML = TRASH; rm.setAttribute('aria-label', 'Apagar ' + c.label); rm.title = 'Apagar';
        rm.onclick = () => delCat(c);
        li.appendChild(rm);
      } else li.appendChild(make('span', 'wl-catfix'));
      ul.appendChild(li);
    });
  }
  function openCats() { $('wlCatNew').value = ''; $('wlCatErr').hidden = true; showCats(); cdlg.showModal(); $('wlCatNew').focus(); }
  const PT_ERR = { 'that category already exists': 'Essa categoria já existe.', 'give the category a name': 'Dê um nome à categoria.' };
  $('wlCatClose').onclick = () => cdlg.close();
  cdlg.addEventListener('click', (e) => { if (e.target === cdlg) cdlg.close(); });
  $('wlCatForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const label = $('wlCatNew').value.trim(); if (!label) return;
    try { const r = await api('/categories', 'POST', { label }); S.cats = r.categories; $('wlCatNew').value = ''; $('wlCatErr').hidden = true; showCats(); render(); $('wlCatNew').focus(); }
    catch (ex) { $('wlCatErr').textContent = PT_ERR[ex.message] || ex.message; $('wlCatErr').hidden = false; }
  });
  async function delCat(c) {
    const text = c.count ? 'Apagar "' + c.label + '"? ' + (c.count === 1 ? 'O item dela vai' : 'Os ' + c.count + ' itens dela vão') + ' para "Outros".' : 'Apagar a categoria "' + c.label + '"?';
    if (!(await IgnisConfirm.ask({ title: 'Apagar categoria', text, ok: 'Apagar' }))) return;
    try {
      await api('/categories/' + encodeURIComponent(c.key), 'DELETE');
      if (S.filter === c.key) S.filter = null;
      await reload(); showCats();
      toast('Categoria apagada', { sub: c.label });
    } catch (ex) { $('wlCatErr').textContent = ex.message; $('wlCatErr').hidden = false; }
  }

  // ---- add / edit dialog -----------------------------------------------------------------------------------------------------------------------------
  const dlg = $('wlDialog');
  let imgs = [];   // the pictures shown in the editor: { kind: 'cover' | 'extra' | 'new', id, src, data }
  let removed = { cover: false, extras: [] };
  function showPics() {
    const box = $('wlThumbs'); box.replaceChildren();
    imgs.forEach((p, k) => {
      const t = make('figure', 'wl-th' + (k === 0 ? ' first' : ''));
      const im = make('img'); im.alt = ''; im.src = p.src; t.appendChild(im);
      if (k === 0) t.appendChild(make('span', 'wl-thc', 'Capa'));
      const x = make('button', 'wl-thx'); x.type = 'button'; x.setAttribute('aria-label', 'Remover imagem'); x.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
      x.onclick = () => { if (p.kind === 'cover') removed.cover = true; else if (p.kind === 'extra') removed.extras.push(p.id); imgs.splice(k, 1); showPics(); };
      t.appendChild(x); box.appendChild(t);
    });
    $('wlPicNone').hidden = imgs.length > 0;
  }
  $('wlLong').addEventListener('input', () => { $('wlLongOut').textContent = $('wlLong').value; $('wlLong').style.setProperty('--p', ($('wlLong').value * 10) + '%'); });
  // notes: short bullet points, added one at a time (like the items of a Listography list, without the checkboxes)
  let notes = [];
  function showNotes() {
    const ul = $('wlNList'); ul.replaceChildren();
    notes.forEach((t, i) => {
      const li = make('li', 'wl-nitem');
      const tx = make('span', 'wl-ntext', t); tx.tabIndex = 0; tx.title = 'Clique para editar';
      const edit = () => {
        const inp = make('input', 'bd-input wl-ninline'); inp.value = t; inp.maxLength = 300; inp.setAttribute('aria-label', 'Editar nota');
        tx.replaceWith(inp); inp.focus(); inp.select();
        let fin = false;
        const done = (keep) => { if (fin) return; fin = true; const v = inp.value.trim(); if (keep && v) notes[i] = v; else if (keep && !v) notes.splice(i, 1); showNotes(); };
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); done(true); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); } });
        inp.addEventListener('blur', () => done(true));
      };
      tx.onclick = edit; tx.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); edit(); } };
      const rm = make('button', 'wl-nrm'); rm.type = 'button'; rm.setAttribute('aria-label', 'Remover nota'); rm.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
      rm.onclick = () => { notes.splice(i, 1); showNotes(); };
      li.append(make('span', 'wl-nbul', '•'), tx, rm); ul.appendChild(li);
    });
  }
  function addNote() {
    const v = $('wlNoteAdd').value.trim(); if (!v) return;
    notes.push(v); $('wlNoteAdd').value = ''; showNotes(); $('wlNoteAdd').focus();
  }
  const collectNotes = () => { const pending = $('wlNoteAdd').value.trim(); return [...notes, ...(pending ? [pending] : [])].join('\n').slice(0, 2000); };
  $('wlNoteBtn').addEventListener('click', addNote);
  $('wlNoteAdd').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addNote(); } });
  function openDialog(it) {
    S.editing = it || null;
    removed = { cover: false, extras: [] };
    $('wlDlgTitle').textContent = it ? 'Editar item' : 'Adicionar à lista de desejos';
    $('wlName').value = it ? it.name : '';
    $('wlPrice').value = it && it.price != null ? String(it.price).replace('.', ',') : '';
    $('wlCur').value = it ? it.cur : mainCur(S.items);
    const opts = [...(S.cats || [])]; if (it && !opts.some((c) => c.key === it.cat)) opts.push({ key: it.cat, label: catLabel(it.cat) });
    $('wlCat').replaceChildren(...opts.map((c) => { const o = make('option', '', c.label); o.value = c.key; return o; }));
    $('wlCat').value = it ? it.cat : (S.filter && opts.some((c) => c.key === S.filter) ? S.filter : 'other');
    $('wlLong').value = it ? it.longing : 5; $('wlLong').dispatchEvent(new Event('input'));
    $('wlUrl').value = it ? it.url : '';
    notes = it && it.note ? it.note.split(/\r?\n/).map((t) => t.trim()).filter(Boolean) : [];
    $('wlNoteAdd').value = '';
    showNotes();
    imgs = it ? [...(it.pic ? [{ kind: 'cover', src: 'api/v1/wishlist/' + it.id + '/image?v=' + encodeURIComponent(it.updated) }] : []), ...(it.pics || []).map((p) => ({ kind: 'extra', id: p, src: 'api/v1/wishlist/' + it.id + '/pics/' + p }))] : [];
    showPics();
    $('wlPicFile').value = '';
    $('wlDelete').hidden = !it; $('wlDelete').classList.remove('sure'); $('wlDelete').textContent = 'Apagar este item';
    $('wlErr').hidden = true;
    dlg.showModal();
    $('wlName').focus();
  }
  $('wlClose').onclick = () => dlg.close();
  // the picture is resized in the browser first, so the server only ever stores a small JPEG
  function resize(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        const k = Math.min(1, 520 / Math.max(img.width, img.height)), c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
        const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        let q = 0.8, out = c.toDataURL('image/jpeg', q);
        while (out.length > 520000 && q > 0.4) { q -= 0.1; out = c.toDataURL('image/jpeg', q); }
        resolve(out);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Esse arquivo não pôde ser lido como imagem.')); };
      img.src = url;
    });
  }
  $('wlPicFile').addEventListener('change', async () => {
    const files = [...$('wlPicFile').files]; if (!files.length) return;
    $('wlErr').hidden = true;
    for (const f of files) {
      if (imgs.length >= 12) { $('wlErr').textContent = 'Um item pode ter até 12 imagens.'; $('wlErr').hidden = false; break; }
      try { const data = await resize(f); imgs.push({ kind: 'new', data, src: data }); showPics(); }
      catch (e) { $('wlErr').textContent = e.message; $('wlErr').hidden = false; }
    }
    $('wlPicFile').value = '';
  });

  const toServer = (r) => ({ title: r.name, url: r.url, price: r.price, currency: r.cur, notes: r.note, longing: r.longing, category: r.cat, purpose: r.purpose });
  $('wlForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('wlName').value.trim();
    const price = $('wlPrice').value.trim() ? parseMoney($('wlPrice').value) : null;
    const url = $('wlUrl').value.trim();
    const err = !name ? 'Dê um nome.' : Number.isNaN(price) ? 'O preço não é um número.' : url && !safeUrl(url) ? 'O link deve começar com http:// ou https://' : '';
    if (err) { $('wlErr').textContent = err; $('wlErr').hidden = false; return; }
    const rec = { name, url, price, cur: $('wlCur').value, note: collectNotes(), longing: +$('wlLong').value, cat: ($('wlCat').value.trim().toLowerCase() || 'other'), purpose: S.editing ? S.editing.purpose : '' };
    const old = S.editing;
    try {
      const saved = old ? await api('/' + old.id, 'PATCH', toServer(rec)) : await api('', 'POST', toServer(rec));
      if (old) {
        for (const pid of removed.extras) await api('/' + saved.id + '/pics/' + pid, 'DELETE');
        if (removed.cover && old.pic) await api('/' + saved.id + '/image', 'DELETE');
      }
      for (const p of imgs.filter((x) => x.kind === 'new')) await api('/' + saved.id + '/pics', 'POST', { image: p.data });
      dlg.close();
      await reload();
      if (old) toast('Salvo', { sub: name, undo: () => api('/' + old.id, 'PATCH', toServer(old)).then(reload) });
      else toast('Adicionado à lista de desejos', { sub: name + (price != null ? ' · ' + money(price, rec.cur) : ''), undo: () => api('/' + saved.id, 'DELETE').then(reload) });
    } catch (ex) { $('wlErr').textContent = ex.message; $('wlErr').hidden = false; }
  });
  $('wlDelete').onclick = async () => {
    const gone = S.editing;
    if (!gone) return;
    if (!(await IgnisConfirm.ask({ title: 'Apagar item', text: 'Apagar "' + gone.name + '" da lista de desejos?' }))) return;
    try {
      const images = [];
      for (const u of picUrls(gone)) { try { const blob = await (await fetch(u)).blob(); images.push(await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(blob); })); } catch (x) { /* that picture is lost */ } }
      await api('/' + gone.id, 'DELETE');
      dlg.close();
      await reload();
      toast('Apagado', { sub: gone.name, undo: async () => {
        const back = await api('', 'POST', toServer(gone));
        const extra = {}; if (gone.got) Object.assign(extra, { got_at: gone.got, purchase_price: gone.paid, purchase_currency: gone.paidCur, payment_source: gone.with, verdict: gone.verdict || null });
        if (Object.keys(extra).length) await api('/' + back.id, 'PATCH', extra);
        for (const image of images) await api('/' + back.id + '/pics', 'POST', { image });
        await reload();
      } });
    } catch (ex) { toast(ex.message, { type: 'warn' }); }
  };

  // ---- "Got it": what you paid and how it feels ----------------------------------------------------------------------------------------------------
  const gdlg = $('wlGotDialog');
  let gotItem = null, gotVerdict = '';
  const setVerdict = (v) => { gotVerdict = v; gdlg.querySelectorAll('.wl-verdict button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === v))); };
  gdlg.querySelectorAll('.wl-verdict button').forEach((b) => b.addEventListener('click', () => setVerdict(b.dataset.v)));
  function openGot(it) {
    gotItem = it;
    $('wlGotName').textContent = it.name;
    $('wlGotDate').value = dayKey(new Date());
    $('wlGotPaid').value = it.price != null ? String(it.price).replace('.', ',') : '';
    $('wlGotWith').value = '';
    setVerdict('');
    $('wlGotErr').hidden = true;
    gdlg.showModal();
    $('wlGotPaid').focus();
  }
  $('wlGotClose').onclick = () => gdlg.close();
  $('wlGotForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const it = gotItem, day = $('wlGotDate').value;
    const paid = $('wlGotPaid').value.trim() ? parseMoney($('wlGotPaid').value) : null;
    const err = !day ? 'Escolha o dia em que conseguiu.' : Number.isNaN(paid) ? 'O valor não é um número.' : '';
    if (err) { $('wlGotErr').textContent = err; $('wlGotErr').hidden = false; return; }
    try {
      await api('/' + it.id, 'PATCH', { got_at: day, purchase_price: paid, purchase_currency: it.cur, payment_source: $('wlGotWith').value.trim(), verdict: gotVerdict || null });
      gdlg.close();
      await reload();
      toast('Movido para Conquistados', { type: 'win', sub: it.name + (paid != null ? ' · ' + money(paid, it.cur) : ''), undo: () => api('/' + it.id, 'PATCH', { got_at: null }).then(reload) });
    } catch (ex) { $('wlGotErr').textContent = ex.message; $('wlGotErr').hidden = false; }
  });
  async function backToWishlist(it) {
    try {
      await api('/' + it.id, 'PATCH', { got_at: null });
      await reload();
      toast('De volta à lista de desejos', { sub: it.name, undo: () => api('/' + it.id, 'PATCH', { got_at: it.got, purchase_price: it.paid, purchase_currency: it.paidCur, payment_source: it.with, verdict: it.verdict || null }).then(reload) });
    } catch (ex) { toast(ex.message, { type: 'warn' }); }
  }

  reload().catch((e) => { render(); $('wlEmpty').textContent = 'Não foi possível carregar a lista de desejos: ' + e.message; $('wlEmpty').hidden = false; });
})();
