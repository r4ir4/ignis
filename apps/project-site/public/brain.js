// Brain: decks of flashcards. Study them as flip cards (with a simple spaced-repetition schedule) or play them as a quiz with a
// timer, points and streaks, a bit like Kahoot. Everything lives on the Ignis server (/v1/brain).
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const make = (tag, cls, text) => { const el = document.createElement(tag); if (cls) el.className = cls; if (text != null) el.textContent = text; return el; };
  const toast = (text, opts) => { if (window.IgnisToast) window.IgnisToast.show(text, opts); };
  const pad = (n) => String(n).padStart(2, '0');
  const todayKey = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  async function api(path, method, body) {
    // everything takes today's date from the client, except the calls on a single card
    const noDay = /^\/cards\/[^/]+(\/review)?$/.test(path);
    const url = 'api/v1/brain' + path + (noDay ? '' : (path.includes('?') ? '&' : '?') + 'day=' + todayKey());
    const init = { method: method || 'GET', headers: {} };
    if (body) { init.body = JSON.stringify(body); init.headers['Content-Type'] = 'application/json'; }
    const res = await fetch(url, init);
    if (!res.ok) {
      let detail = ''; try { const j = await res.json(); if (typeof j.detail === 'string') detail = j.detail; } catch (e) { /* not json */ }
      throw new Error(detail || 'Algo deu errado (' + res.status + ').');
    }
    return res.status === 204 ? null : res.json();
  }
  const guard = async (fn) => { try { return await fn(); } catch (e) { toast(e.message, { type: 'warn' }); return null; } };

  const S = { decks: [], deck: null, editing: false, page: 0, q: '', deckId: null };
  const PAGE = 20;

  // ---- routing: #<deck id> opens a deck ----
  window.addEventListener('hashchange', route);
  const openDeck = (id) => { location.hash = id; };
  const closeDeck = () => { S.deckId = null; history.pushState('', document.title, location.pathname + location.search); route(); };
  async function loadDecks() { S.decks = (await api('')).decks; }
  async function route() {
    const id = decodeURIComponent(location.hash.slice(1));
    S.editing = false;
    if (id) {
      const d = await guard(() => api('/' + encodeURIComponent(id)));
      if (d) { S.deck = d; render(); return; }
      history.replaceState('', document.title, location.pathname + location.search);
    }
    S.deck = null; await loadDecks(); render();
  }

  // ---- decks grid ----
  function render() {
    const detail = !!S.deck;
    $('bnDecks').hidden = detail; $('bnDeck').hidden = !detail; $('bnEmpty').hidden = true;
    document.title = detail ? S.deck.title + ' · Ignis' : 'Brain · Ignis';
    if (detail) { renderDeck(); return; }
    const total = S.decks.reduce((n, d) => n + d.cards, 0), due = S.decks.reduce((n, d) => n + d.due, 0);
    $('bnSub').textContent = S.decks.length ? plural(S.decks.length, 'baralho', 'baralhos') + ' · ' + plural(total, 'cartão', 'cartões') + (due ? ' · ' + due + ' para revisar hoje' : '') : 'Crie baralhos de flashcards para estudar qualquer assunto.';
    const ul = $('bnDecks'); ul.replaceChildren();
    S.decks.forEach((d, i) => {
      const li = make('li', 'bn-dwrap'); li.style.setProperty('--i', Math.min(i, 12));
      const b = make('button', 'bn-dcard'); b.type = 'button'; b.setAttribute('aria-label', 'Abrir o baralho ' + d.title);
      b.appendChild(make('h3', '', d.title));
      if (d.note) b.appendChild(make('p', 'bn-dn', d.note));
      const stats = make('div', 'bn-dstats');
      stats.appendChild(make('span', 'bn-count', plural(d.cards, 'cartão', 'cartões')));
      if (d.cards) stats.appendChild(make('span', d.due ? 'bn-due' : 'bn-ok', d.due ? d.due + ' para revisar' : 'Em dia'));
      b.appendChild(stats);
      const bar = make('i', 'bn-bar'); const fill = make('b'); fill.style.width = (d.cards ? Math.round((d.learned / d.cards) * 100) : 0) + '%'; bar.appendChild(fill);
      const foot = make('div', 'bn-dfoot'); foot.append(bar, make('small', '', d.cards ? d.learned + '/' + d.cards + ' dominados' : 'vazio'));
      b.appendChild(foot);
      b.onclick = () => openDeck(d.id);
      li.appendChild(b); ul.appendChild(li);
    });
    const nw = make('li', 'bn-dwrap'); const nb = make('button', 'bn-dcard bn-dnew'); nb.type = 'button'; nb.innerHTML = '<span aria-hidden="true">+</span><b>Novo baralho</b>'; nb.onclick = openNew;
    nw.appendChild(nb); ul.appendChild(nw);
  }

  // ---- one deck ----
  const dueCards = (d) => d.items.filter((c) => !c.due || c.due <= todayKey());
  function renderDeck() {
    const d = S.deck, box = $('bnDeck'); box.replaceChildren();
    const bk = make('button', 'bn-hback'); bk.type = 'button'; bk.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>Todos os baralhos'; bk.onclick = closeDeck;
    $('bnSub').replaceChildren(bk);
    const top = make('div', 'bn-dtop');
    top.appendChild(make('h2', 'bn-dt', d.title));
    const acts = make('div', 'bn-dacts');
    const ed = make('button', 'bn-btn', 'Editar'); ed.type = 'button'; ed.onclick = () => openEdit(d);
    const del = make('button', 'bn-btn danger', 'Apagar'); del.type = 'button'; del.onclick = () => askDelete(d);
    acts.append(ed, del); top.appendChild(acts); box.appendChild(top);
    if (d.note) box.appendChild(make('p', 'bn-dnote', d.note));

    const due = dueCards(d).length;
    const stat = make('div', 'bn-strip');
    const learned = d.items.filter((c) => c.box >= 3).length;
    stat.append(make('span', '', plural(d.items.length, 'cartão', 'cartões')), make('span', due ? 'hot' : '', due ? due + ' para revisar hoje' : 'tudo em dia'), make('span', '', plural(learned, 'dominado', 'dominados')));
    if (d.best_score) stat.appendChild(make('span', '', 'recorde ' + d.best_score.toLocaleString('pt-BR') + ' pts'));
    box.appendChild(stat);

    const play = make('div', 'bn-play');
    const study = make('button', 'bn-big study'); study.type = 'button'; study.disabled = !d.items.length;
    study.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="8.5" width="13" height="11.5" rx="2"/><path d="M4 15.500V6a2 2 0 0 1 2-2h9"/></svg><span><b>Flashcards</b><small>' + (due ? due + ' para revisar hoje' : 'todos os cartões') + '</small></span>';
    study.onclick = () => startStudy(d, false);
    const quiz = make('button', 'bn-big quiz'); quiz.type = 'button'; quiz.disabled = d.items.length < 2;
    quiz.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg><span><b>Quiz</b><small>' + 'tempo, pontos e sequência' + '</small></span>';
    quiz.onclick = () => startQuiz(d);
    // each mode is a column: the big button and, under it, one line of context
    const colA = make('div', 'bn-pcol'), colB = make('div', 'bn-pcol');
    colA.appendChild(study); colB.appendChild(quiz);
    if (d.items.length && due && due < d.items.length) { const all = make('button', 'bn-link', 'Ver todos os ' + d.items.length + ' cartões'); all.type = 'button'; all.onclick = () => startStudy(d, true); colA.appendChild(all); }
    else colA.appendChild(make('p', 'bn-pnote', !d.items.length ? 'Adicione cartões para começar' : due ? 'Todos os cartões estão para revisar' : 'Nenhum cartão vencido hoje'));
    colB.appendChild(make('p', 'bn-pnote', d.items.length < 2 ? 'Precisa de pelo menos 2 cartões' : d.best_score ? 'Seu recorde: ' + d.best_score.toLocaleString('pt-BR') + ' pontos' : 'Ainda sem recorde: seja o primeiro!'));
    play.append(colA, colB);
    box.appendChild(play);

    // the cards: a header with the + that opens the "add cards" dialog, a search when there are many, and pages of 20
    const ch = make('div', 'bn-ch'); const ct = make('h3', '', 'Cartões'); ct.appendChild(make('small', '', String(d.items.length)));
    const plus = make('button', 'bn-ib'); plus.type = 'button'; plus.setAttribute('aria-label', 'Adicionar cartões'); plus.title = 'Adicionar cartões'; plus.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>'; plus.onclick = openAdd;
    ch.append(ct, plus); box.appendChild(ch);
    if (S.deckId !== d.id) { S.deckId = d.id; S.page = 0; S.q = ''; }
    const list = make('ul', 'bn-cards'), pager = make('div', 'bn-pager');
    if (d.items.length > 12) {
      const sb = make('div', 'bn-search'); const si = make('input', 'bn-input'); si.type = 'search'; si.placeholder = 'Buscar nos ' + d.items.length + ' cartões…'; si.value = S.q; si.autocomplete = 'off'; si.setAttribute('aria-label', 'Buscar cartões');
      si.addEventListener('input', () => { S.q = si.value; S.page = 0; fillList(d, list, pager); });
      sb.appendChild(si); box.appendChild(sb);
    }
    box.append(list, pager);
    fillList(d, list, pager);
  }

  function fillList(d, list, pager) {
    const q = S.q.trim().toLowerCase();
    const all = q ? d.items.filter((c) => c.front.toLowerCase().includes(q) || c.back.toLowerCase().includes(q)) : d.items;
    const pages = Math.max(1, Math.ceil(all.length / PAGE));
    S.page = Math.min(Math.max(S.page, 0), pages - 1);
    list.replaceChildren(); pager.replaceChildren();
    if (!d.items.length) list.appendChild(make('li', 'bn-none', 'Nenhum cartão ainda. Adicione o primeiro abaixo.'));
    else if (!all.length) list.appendChild(make('li', 'bn-none', 'Nenhum cartão encontrado para "' + S.q.trim() + '".'));
    all.slice(S.page * PAGE, (S.page + 1) * PAGE).forEach((c) => list.appendChild(cardRow(d, c)));
    pager.hidden = pages < 2;
    if (pages < 2) return;
    const go = (n) => { S.page = n; fillList(d, list, pager); list.scrollIntoView({ block: 'nearest' }); };
    const prev = make('button', 'bn-pg'); prev.type = 'button'; prev.innerHTML = '←'; prev.setAttribute('aria-label', 'Página anterior'); prev.disabled = S.page === 0; prev.onclick = () => go(S.page - 1);
    const next = make('button', 'bn-pg'); next.type = 'button'; next.innerHTML = '→'; next.setAttribute('aria-label', 'Próxima página'); next.disabled = S.page >= pages - 1; next.onclick = () => go(S.page + 1);
    const from = S.page * PAGE + 1, to = Math.min(all.length, (S.page + 1) * PAGE);
    pager.append(prev, make('span', '', 'Página ' + (S.page + 1) + ' de ' + pages + ' · ' + from + '–' + to + ' de ' + all.length), next);
  }
  function dots(box) { const s = make('span', 'bn-box'); s.title = box >= 3 ? 'Dominado' : box ? 'Aprendendo' : 'Novo'; for (let i = 0; i < 5; i++) s.appendChild(make('i', i < box ? 'on' : '')); return s; }
  function cardRow(d, c) {
    const li = make('li', 'bn-crow');
    const f = make('span', 'bn-cf', c.front), b = make('span', 'bn-cb', c.back);
    [f, b].forEach((x) => { x.tabIndex = 0; x.title = 'Clique para editar'; });
    const edit = () => {
      const wrap = make('div', 'bn-cedit');
      const fi = make('input', 'bn-input'); fi.value = c.front; fi.maxLength = 500; fi.setAttribute('aria-label', 'Frente');
      const bi = make('input', 'bn-input'); bi.value = c.back; bi.maxLength = 500; bi.setAttribute('aria-label', 'Verso');
      wrap.append(fi, bi); li.replaceChildren(wrap); fi.focus(); fi.select();
      let fin = false;
      const done = async (keep) => {
        if (fin) return; fin = true;
        const fv = fi.value.trim(), bv = bi.value.trim();
        if (keep && fv && bv && (fv !== c.front || bv !== c.back)) { const r = await guard(() => api('/cards/' + c.id, 'PATCH', { front: fv, back: bv })); if (r) Object.assign(c, { front: r.front, back: r.back }); }
        renderDeck();
      };
      [fi, bi].forEach((x) => x.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); done(true); } else if (e.key === 'Escape') done(false); }));
      wrap.addEventListener('focusout', (e) => { if (!wrap.contains(e.relatedTarget)) setTimeout(() => { if (!wrap.contains(document.activeElement)) done(true); }, 0); });
    };
    f.onclick = edit; b.onclick = edit; f.onkeydown = b.onkeydown = (e) => { if (e.key === 'Enter') edit(); };
    const rm = make('button', 'bn-rm'); rm.type = 'button'; rm.setAttribute('aria-label', 'Remover cartão'); rm.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    rm.onclick = async () => {
      const r = await guard(() => api('/cards/' + c.id, 'DELETE').then(() => true)); if (!r) return;
      const idx = d.items.indexOf(c); d.items.splice(idx, 1); renderDeck();
      toast('Cartão removido', { sub: c.front, undo: async () => { const back = await api('/' + d.id + '/cards', 'POST', { cards: [{ front: c.front, back: c.back }] }); S.deck = back; render(); } });
    };
    li.append(f, b, dots(c.box), rm);
    return li;
  }


  // ---- the guide: how it works, what "dominado" means, how points and records work, and your numbers ----
  const idlg = $('bnInfoDialog');
  let infoTab = 'geral';
  async function openInfo() {
    const body = $('bnInfoBody'); body.replaceChildren();
    const html = (tag, cls, h) => { const e = make(tag, cls); e.innerHTML = h; return e; };
    const panels = {};
    const TABS = [['geral', 'Como funciona'], ['dominado', 'Dominado'], ['pontos', 'Pontos e recorde'], ['atalhos', 'Atalhos'], ['numeros', 'Seus números']];
    const tabs = make('div', 'bn-itabs'); tabs.setAttribute('role', 'tablist');
    const show = (k) => { infoTab = k; tabs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.k === k))); Object.entries(panels).forEach(([id, el]) => { el.hidden = id !== k; }); body.scrollTop = 0; };
    TABS.forEach(([k, label]) => { const b = make('button', '', label); b.type = 'button'; b.dataset.k = k; b.setAttribute('role', 'tab'); b.onclick = () => show(k); tabs.appendChild(b); panels[k] = make('div', 'bn-ipanel'); panels[k].setAttribute('role', 'tabpanel'); });
    $('bnInfoTabs').replaceChildren(tabs);

    // 1. how it works
    const g = panels.geral;
    g.appendChild(html('p', 'bn-lead', 'Pense numa <b>caixa de cartinhas</b>. Cada cartinha tem uma <b>pergunta</b> na frente e a <b>resposta</b> atrás, como "Capital da França?" na frente e "Paris" atrás. Um <b>baralho</b> é uma pilha de cartinhas do mesmo assunto. O Brain ajuda você a <b>não esquecer</b> o que está nelas, e tem duas brincadeiras:'));
    const duo = make('div', 'bn-iduo');
    duo.appendChild(html('div', 'bn-icard', '<div class="bn-ich"><span class="n">1</span><h4>Flashcards</h4></div><p>Você vê a pergunta e <b>tenta lembrar a resposta de cabeça</b>. Depois vira a cartinha e confere.</p><ul><li>Lembrou? Aperte <b>Acertei</b>.</li><li>Esqueceu? Aperte <b>Errei</b>. Sem problema, é assim que o cérebro aprende!</li></ul>'));
    duo.appendChild(html('div', 'bn-icard', '<div class="bn-ich"><span class="n">2</span><h4>Quiz</h4></div><p>Um <b>joguinho</b>: aparece uma pergunta e quatro respostas coloridas. Escolha uma antes de o tempo acabar.</p><ul><li>Responder <b>rápido</b> dá mais pontos.</li><li>Acertar <b>várias seguidas</b> dá pontos extras.</li></ul>'));
    g.appendChild(duo);

    // 2. mastered
    const d = panels.dominado;
    d.appendChild(html('p', 'bn-lead', 'Imagine uma estante com <b>seis gavetas</b>. Toda cartinha começa na primeira, a de "Novo". Cada vez que você <b>acerta</b>, a cartinha <b>sobe uma gaveta</b> e fica mais tempo sem aparecer, porque você já está ficando craque nela.'));
    const boxes = make('ol', 'bn-iboxes');
    [['Novo', 'ainda não conhece, ou esqueceu', 'aparece hoje'], ['Caixa 1', 'acertou 1 vez', 'volta amanhã'], ['Caixa 2', 'acertou 2 seguidas', 'volta em 3 dias'],
      ['Caixa 3', 'acertou 3 seguidas', 'volta em 1 semana'], ['Caixa 4', 'acertou 4 seguidas', 'volta em 2 semanas'], ['Caixa 5', 'acertou 5 seguidas', 'volta em 1 mês']].forEach(([n, t, w], i) => {
      const li = make('li', i === 3 ? 'm' : ''); li.append(dots(i), make('b', '', n), make('span', '', t), make('em', '', w));
      if (i === 3) li.appendChild(make('mark', '', 'dominado'));
      boxes.appendChild(li);
    });
    d.appendChild(boxes);
    const notes = make('div', 'bn-inotes');
    notes.appendChild(html('div', '', '<h4>Errou?</h4><p>A cartinha <b>cai de volta</b> para a primeira gaveta. É só tentar de novo, ela volta a aparecer logo.</p>'));
    notes.appendChild(html('div', '', '<h4>Dominado</h4><p>A cartinha chegou na <b>Caixa 3</b>: você acertou 3 vezes seguidas. Os quadradinhos laranja ao lado de cada cartinha mostram a gaveta dela.</p>'));
    notes.appendChild(html('div', '', '<h4>Para revisar</h4><p>Quantas cartinhas estão "chamando" você hoje, porque já passou o tempo de olhar para elas de novo. Acertar no <b>quiz</b> também sobe a cartinha de gaveta.</p>'));
    d.appendChild(notes);

    // 3. points and record
    const p = panels.pontos;
    p.appendChild(html('p', 'bn-lead', 'No quiz, cada pergunta vale pontos. Veja como eles são contados:'));
    const stats = make('div', 'bn-istats');
    stats.appendChild(html('div', '', '<b>500 a 1000</b><h4>Resposta certa</h4><p>Responder rapidinho dá quase 1000. Demorar até o último segundo dá 500.</p>'));
    stats.appendChild(html('div', '', '<b>+50 a +250</b><h4>Bônus de sequência</h4><p>Acertou duas ou mais seguidas? +50 na segunda, +100 na terceira, até +250. O <b>×3</b> no canto mostra a sua fila.</p>'));
    stats.appendChild(html('div', '', '<b>0</b><h4>Errou ou acabou o tempo</h4><p>Sem pontos naquela pergunta, a fila de acertos recomeça e a cartinha volta para a primeira gaveta.</p>'));
    p.appendChild(stats);
    p.appendChild(html('div', 'bn-irec', '<h4>O que é o recorde?</h4><p>É a sua <b>maior pontuação</b> naquele baralho. Se você faz mais que ela, aparece <b>"Novo recorde!"</b> com confete. Se faz menos, o recorde fica como estava.</p><p class="dim">Dica: um quiz de 5 perguntas dá menos pontos que um de 20. Para comparar de verdade, jogue sempre do mesmo jeito.</p>'));

    // 4. shortcuts
    const s = panels.atalhos;
    s.appendChild(html('p', 'bn-lead', 'Dá para jogar sem encostar no mouse:'));
    const keys = make('div', 'bn-ikeys');
    keys.appendChild(html('div', '', '<h4>Flashcards</h4><dl><dt><kbd>espaço</kbd></dt><dd>vira a cartinha</dd><dt><kbd>←</kbd></dt><dd>errei</dd><dt><kbd>→</kbd></dt><dd>acertei</dd></dl>'));
    keys.appendChild(html('div', '', '<h4>Quiz</h4><dl><dt><kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>4</kbd></dt><dd>escolhe a resposta</dd><dt><kbd>Enter</kbd></dt><dd>próxima pergunta</dd></dl>'));
    keys.appendChild(html('div', '', '<h4>Em qualquer lugar</h4><dl><dt><kbd>Esc</kbd></dt><dd>sai da sessão</dd></dl>'));
    s.appendChild(keys);

    // 5. your numbers
    const mine = panels.numeros; mine.textContent = 'Carregando seus números…';
    TABS.forEach(([k]) => body.appendChild(panels[k]));
    show(infoTab); idlg.showModal();
    let decks = S.decks;
    try { decks = (await api('')).decks; S.decks = decks; } catch (e) { /* use what we had */ }
    mine.replaceChildren();
    if (!decks.length) { mine.textContent = 'Você ainda não tem baralhos.'; return; }
    const tot = decks.reduce((a, x) => ({ c: a.c + x.cards, l: a.l + x.learned, d: a.d + x.due }), { c: 0, l: 0, d: 0 });
    const big = make('div', 'bn-istats bn-itotal');
    [[tot.c, tot.c === 1 ? 'cartinha' : 'cartinhas'], [tot.l, (tot.l === 1 ? 'dominada' : 'dominadas') + (tot.c ? ' (' + Math.round(tot.l / tot.c * 100) + '%)' : '')], [tot.d, 'para revisar hoje']].forEach(([n, l]) => big.appendChild(html('div', '', '<b>' + n + '</b><h4>' + l + '</h4>')));
    mine.appendChild(big);
    const t = make('table', 'bn-itable');
    t.innerHTML = '<thead><tr><th>Baralho</th><th>Cartões</th><th>Dominados</th><th>Para revisar</th><th>Recorde</th></tr></thead>';
    const tb = make('tbody');
    decks.forEach((x) => { const tr = make('tr'); [x.title, x.cards, x.cards ? x.learned + ' (' + Math.round(x.learned / x.cards * 100) + '%)' : '—', x.due, x.best_score ? x.best_score.toLocaleString('pt-BR') : '—'].forEach((v, i) => { const td = make('td', '', String(v)); if (i === 3 && x.due) td.className = 'hot'; tr.appendChild(td); }); tb.appendChild(tr); });
    t.appendChild(tb); mine.appendChild(t);
  }
  $('bnInfo').onclick = openInfo; $('bnInfoClose').onclick = () => idlg.close();
  idlg.addEventListener('click', (e) => { if (e.target === idlg) idlg.close(); });

  // ---- new / edit deck ----
  const dlg = $('bnDialog');
  const setErr = (el, m) => { el.textContent = m || ''; el.hidden = !m; };
  function openNew() { S.editing = null; $('bnDlgTitle').textContent = 'Novo baralho'; $('bnTitle').value = ''; $('bnNote').value = ''; $('bnPaste').value = ''; $('bnPasteBox').hidden = false; setErr($('bnErr'), ''); dlg.showModal(); $('bnTitle').focus(); }
  function openEdit(d) { S.editing = d; $('bnDlgTitle').textContent = 'Editar baralho'; $('bnTitle').value = d.title; $('bnNote').value = d.note || ''; $('bnPasteBox').hidden = true; setErr($('bnErr'), ''); dlg.showModal(); $('bnTitle').focus(); }
  $('bnNew').onclick = openNew; $('bnClose').onclick = () => dlg.close();
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  // "front :: back" or "front<TAB>back" per line
  function parseCards(text) {
    const cards = []; let bad = 0;
    text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).forEach((l) => {
      const parts = l.includes('::') ? l.split('::') : l.split('\t');
      const f = (parts.shift() || '').trim(), b = parts.join(' :: ').trim();
      if (f && b) cards.push({ front: f.slice(0, 500), back: b.slice(0, 500) }); else bad++;
    });
    return { cards, bad };
  }
  $('bnForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = $('bnTitle').value.trim();
    if (!title) return setErr($('bnErr'), 'Dê um nome ao baralho.');
    try {
      if (S.editing) {
        const d = S.editing; const r = await api('/' + d.id, 'PATCH', { title, note: $('bnNote').value.trim() });
        Object.assign(S.deck, { title: r.title, note: r.note }); dlg.close(); render(); toast('Baralho salvo', { sub: title });
      } else {
        const { cards, bad } = parseCards($('bnPaste').value);
        if (bad) return setErr($('bnErr'), bad + (bad === 1 ? ' linha está' : ' linhas estão') + ' sem o "::" separando pergunta e resposta.');
        const r = await api('', 'POST', { title, note: $('bnNote').value.trim(), cards });
        dlg.close(); openDeck(r.id); toast('Baralho criado', { sub: title });
      }
    } catch (ex) { setErr($('bnErr'), ex.message); }
  });
  // ---- add cards: one by one, or many at once ----
  const adlg = $('bnAddDialog'); let addCount = 0;
  function setMode(m) {
    $('bnTabOne').setAttribute('aria-selected', String(m === 'one')); $('bnTabBulk').setAttribute('aria-selected', String(m === 'bulk'));
    $('bnOneForm').hidden = m !== 'one'; $('bnBulkForm').hidden = m !== 'bulk';
    (m === 'one' ? $('bnOneF') : $('bnBulk')).focus();
  }
  function openAdd() {
    addCount = 0; ['bnOneF', 'bnOneB', 'bnBulk'].forEach((id) => { $(id).value = ''; }); ['bnOneErr', 'bnBulkErr', 'bnOneOk'].forEach((id) => { $(id).hidden = true; });
    $('bnTabOne').setAttribute('aria-selected', 'true'); $('bnTabBulk').setAttribute('aria-selected', 'false'); $('bnOneForm').hidden = false; $('bnBulkForm').hidden = true;
    adlg.showModal(); $('bnOneF').focus();
  }
  $('bnTabOne').onclick = () => setMode('one'); $('bnTabBulk').onclick = () => setMode('bulk');
  $('bnAddClose').onclick = () => adlg.close(); $('bnOneDone').onclick = () => adlg.close();
  adlg.addEventListener('click', (e) => { if (e.target === adlg) adlg.close(); });
  async function pushCards(cards) {
    S.deck = await api('/' + S.deck.id + '/cards', 'POST', { cards });
    S.q = ''; S.page = Math.floor((S.deck.items.length - 1) / PAGE); render();
  }
  $('bnOneForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = $('bnOneF').value.trim(), b = $('bnOneB').value.trim();
    if (!f) { setErr($('bnOneErr'), 'Escreva a frente do cartão.'); $('bnOneF').focus(); return; }
    if (!b) { setErr($('bnOneErr'), 'Escreva o verso do cartão.'); $('bnOneB').focus(); return; }
    try {
      await pushCards([{ front: f, back: b }]);
      addCount++; setErr($('bnOneErr'), ''); $('bnOneF').value = ''; $('bnOneB').value = '';
      $('bnOneOk').textContent = plural(addCount, 'cartão adicionado', 'cartões adicionados') + '. Escreva o próximo ou clique em Concluir.'; $('bnOneOk').hidden = false; $('bnOneF').focus();
    } catch (ex) { setErr($('bnOneErr'), ex.message); }
  });
  $('bnOneB').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('bnOneForm').requestSubmit(); } });
  $('bnOneF').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if ($('bnOneF').value.trim()) $('bnOneB').focus(); } });
  $('bnBulkForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const { cards, bad } = parseCards($('bnBulk').value);
    if (!cards.length) return setErr($('bnBulkErr'), 'Nenhum cartão encontrado. Use "pergunta :: resposta" em cada linha.');
    if (bad) return setErr($('bnBulkErr'), bad + (bad === 1 ? ' linha está' : ' linhas estão') + ' sem o "::" separando pergunta e resposta.');
    try { await pushCards(cards); adlg.close(); toast(plural(cards.length, 'cartão adicionado', 'cartões adicionados')); }
    catch (ex) { setErr($('bnBulkErr'), ex.message); }
  });
  async function askDelete(d) {
    if (!(await IgnisConfirm.ask({ title: 'Apagar baralho', text: 'Apagar "' + d.title + '" e seus ' + plural(d.items.length, 'cartão', 'cartões') + '? Isso não pode ser desfeito.', ok: 'Apagar' }))) return;
    await guard(() => api('/' + d.id, 'DELETE')); closeDeck(); toast('Baralho apagado', { sub: d.title });
  }

  // =====================================================================================================================================
  // the stage: a full-screen dialog where studying and the quiz happen
  // =====================================================================================================================================
  const stage = $('bnStage');
  let timers = [], keyHandler = null;
  const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
  function clearStage() { timers.forEach(clearTimeout); timers = []; cancelAnimationFrame(S.raf); if (keyHandler) { document.removeEventListener('keydown', keyHandler); keyHandler = null; } }
  stage.tabIndex = -1;
  function openStage(build) { clearStage(); stage.replaceChildren(); build(stage); if (!stage.open) stage.showModal(); if (document.activeElement && document.activeElement !== stage) document.activeElement.blur(); stage.focus(); }
  stage.addEventListener('close', () => { clearStage(); stage.replaceChildren(); if (S.deck) route(); });
  stage.addEventListener('cancel', () => { clearStage(); });
  const XICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  function topbar(label, progress, extra) {
    const t = make('header', 'bn-stop');
    const x = make('button', 'bn-sx'); x.type = 'button'; x.innerHTML = XICON; x.setAttribute('aria-label', 'Sair'); x.title = 'Sair (Esc)'; x.onclick = () => stage.close();
    const mid = make('div', 'bn-smid'); mid.appendChild(make('span', 'bn-slabel', label));
    const bar = make('i', 'bn-sbar'); const fill = make('b'); fill.style.width = (progress * 100) + '%'; bar.appendChild(fill); mid.appendChild(bar);
    t.append(x, mid); if (extra) t.appendChild(extra);
    return { el: t, fill };
  }
  const review = (card, correct) => { api('/cards/' + card.id + '/review', 'POST', { correct, day: todayKey() }).then((r) => Object.assign(card, { box: r.box, due: r.due, seen: r.seen, right: r.right })).catch(() => { /* the session goes on */ }); };

  // ---- study: flip cards ----
  function startStudy(deck, all) {
    let pool = all ? deck.items : dueCards(deck); if (!pool.length) pool = deck.items;
    runStudy(deck, shuffle(pool), 'Flashcards');
  }
  function runStudy(deck, queue, label) {
    const R = { i: 0, right: [], wrong: [], flipped: false, busy: false };
    openStage((root) => {
      root.className = 'bn-stage study';
      const tb = topbar(label, 0, null); root.appendChild(tb.el);
      const body = make('div', 'bn-sbody'); root.appendChild(body);
      const count = make('p', 'bn-scount'); body.appendChild(count);
      const scene = make('div', 'bn-scene'); body.appendChild(scene);
      const foot = make('footer', 'bn-sfoot'); root.appendChild(foot);
      const wrongB = make('button', 'bn-ans wrong'); wrongB.type = 'button'; wrongB.innerHTML = '<span>←</span>Errei';
      const flipB = make('button', 'bn-ans flip'); flipB.type = 'button'; flipB.textContent = 'Virar';
      const rightB = make('button', 'bn-ans right'); rightB.type = 'button'; rightB.innerHTML = 'Acertei<span>→</span>';
      foot.append(wrongB, flipB, rightB);

      let cardEl = null, slotEl = null;
      function show() {
        const c = queue[R.i];
        R.flipped = false; R.busy = false;
        count.textContent = (R.i + 1) + ' de ' + queue.length;
        tb.fill.style.width = (R.i / queue.length * 100) + '%';
        scene.replaceChildren();
        slotEl = make('div', 'bn-slot enter'); cardEl = make('div', 'bn-card');
        const fr = make('div', 'bn-face front'); fr.append(make('small', '', 'Pergunta'), make('p', '', c.front), make('em', '', 'Clique ou aperte espaço para virar'));
        const bk = make('div', 'bn-face back'); bk.append(make('small', '', 'Resposta'), make('p', '', c.back));
        cardEl.append(fr, bk); slotEl.appendChild(cardEl); scene.appendChild(slotEl);
        cardEl.onclick = flip;
        wrongB.disabled = rightB.disabled = true; flipB.hidden = false;
      }
      function flip() { if (R.busy) return; R.flipped = !R.flipped; cardEl.classList.toggle('flipped', R.flipped); wrongB.disabled = rightB.disabled = !R.flipped; flipB.textContent = R.flipped ? 'Ver pergunta' : 'Virar'; }
      async function answer(ok) {
        if (R.busy || !R.flipped) return; R.busy = true;
        const c = queue[R.i]; (ok ? R.right : R.wrong).push(c); review(c, ok);
        slotEl.classList.add(ok ? 'out-right' : 'out-left');
        await sleep(420);
        R.i++;
        if (R.i >= queue.length) summary(); else show();
      }
      function summary() {
        tb.fill.style.width = '100%';
        if (keyHandler) { document.removeEventListener('keydown', keyHandler); keyHandler = null; }
        const total = queue.length, pct = Math.round(R.right.length / total * 100);
        body.replaceChildren(); foot.replaceChildren();
        const box = make('div', 'bn-sum');
        const ring = make('div', 'bn-ring'); ring.innerHTML = '<svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="52"/><circle class="v" cx="60" cy="60" r="52" stroke-dasharray="326.7" stroke-dashoffset="326.7"/></svg>';
        const num = make('b', '', '0%'); ring.appendChild(num); box.appendChild(ring);
        box.appendChild(make('h2', '', pct === 100 ? 'Perfeito!' : pct >= 70 ? 'Muito bem!' : pct >= 40 ? 'Está evoluindo' : 'Vale repassar'));
        box.appendChild(make('p', '', R.right.length + ' de ' + total + ' acertos' + (R.wrong.length ? ' · ' + R.wrong.length + ' para rever' : '')));
        const acts = make('div', 'bn-sacts');
        if (R.wrong.length) { const again = make('button', 'bn-ans right', 'Revisar os que errei'); again.type = 'button'; again.onclick = () => runStudy(deck, shuffle(R.wrong), 'Revisão'); acts.appendChild(again); }
        const q = make('button', 'bn-ans flip', 'Quiz'); q.type = 'button'; q.disabled = deck.items.length < 2; q.onclick = () => startQuiz(deck);
        const close = make('button', 'bn-ans flip', 'Fechar'); close.type = 'button'; close.onclick = () => stage.close();
        acts.append(q, close); box.appendChild(acts); body.appendChild(box);
        requestAnimationFrame(() => { ring.querySelector('.v').style.strokeDashoffset = String(326.7 * (1 - pct / 100)); });
        countUp(num, pct, 900, '%');
        if (pct >= 70) confetti(root);
      }
      wrongB.onclick = () => answer(false); rightB.onclick = () => answer(true); flipB.onclick = flip;
      keyHandler = (e) => {
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); }
        else if (e.key === 'ArrowLeft' || e.key === '1') answer(false);
        else if (e.key === 'ArrowRight' || e.key === '2') answer(true);
      };
      document.addEventListener('keydown', keyHandler);
      show();
    });
  }

  function countUp(el, to, ms, suffix) {
    const t0 = performance.now(), from = Number(el.dataset.v || 0); el.dataset.v = to;
    const step = (t) => { const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3); el.textContent = Math.round(from + (to - from) * e).toLocaleString('pt-BR') + (suffix || ''); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  function confetti(root) {
    const wrap = make('div', 'bn-confetti'); wrap.setAttribute('aria-hidden', 'true');
    const cols = ['#ee5d1b', '#f7e9d7', '#d9b382', '#c9470f'];
    for (let i = 0; i < 46; i++) { const p = make('i'); p.style.left = Math.random() * 100 + '%'; p.style.background = cols[i % cols.length]; p.style.animationDelay = Math.random() * 0.8 + 's'; p.style.animationDuration = 2.2 + Math.random() * 1.8 + 's'; p.style.setProperty('--r', (Math.random() * 720 - 360) + 'deg'); p.style.setProperty('--x', (Math.random() * 120 - 60) + 'px'); wrap.appendChild(p); }
    root.appendChild(wrap); later(() => wrap.remove(), 5200);
  }

  // ---- quiz: timer, points, streak ----
  const SHAPES = [
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 22 20H2z"/></svg>',
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 22 12 12 22 2 12z"/></svg>',
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/></svg>',
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18"/></svg>',
  ];
  function startQuiz(deck) {
    const cfg = { time: 20, count: Math.min(10, deck.items.length), dir: 'fb' };
    openStage((root) => {
      root.className = 'bn-stage quiz';
      const tb = topbar('Quiz · ' + deck.title, 0, null); root.appendChild(tb.el);
      const body = make('div', 'bn-sbody'); root.appendChild(body);
      const box = make('div', 'bn-setup'); body.appendChild(box);
      box.appendChild(make('p', 'bn-skicker', 'Quiz'));
      box.appendChild(make('h2', '', 'Pronto para jogar?'));
      box.appendChild(make('p', 'bn-sdeck', deck.title + ' · ' + plural(deck.items.length, 'cartão', 'cartões')));
      const panel = make('div', 'bn-spanel'); box.appendChild(panel);
      const group = (label, opts, key) => {
        const g = make('div', 'bn-srow'); g.appendChild(make('span', 'bn-olabel', label));
        const row = make('div', 'bn-orow');
        opts.forEach(([v, text]) => { const b = make('button', 'bn-chip', text); b.type = 'button'; b.setAttribute('aria-pressed', String(cfg[key] === v)); b.onclick = () => { cfg[key] = v; row.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); }; row.appendChild(b); });
        g.appendChild(row); panel.appendChild(g);
      };
      const n = deck.items.length;
      const counts = [...new Set([Math.min(5, n), Math.min(10, n), Math.min(20, n), n])].filter((x) => x >= 2).sort((a, b) => a - b);
      group('Perguntas', counts.map((c) => [c, c === n ? 'Todas (' + n + ')' : String(c)]), 'count');
      group('Tempo por pergunta', [[10, '10 s'], [20, '20 s'], [30, '30 s']], 'time');
      group('Perguntar', [['fb', 'Frente → verso'], ['bf', 'Verso → frente']], 'dir');
      const go = make('button', 'bn-start', 'Começar'); go.type = 'button'; box.appendChild(go);
      box.appendChild(make('p', 'bn-shint', 'Quanto mais rápido você responde, mais pontos ganha. Acertos seguidos dão bônus.'));
      go.onclick = () => countdown(deck, cfg, root);
      keyHandler = (e) => { if (e.key === 'Enter') { e.preventDefault(); go.click(); } };
      document.addEventListener('keydown', keyHandler);
    });
  }
  async function countdown(deck, cfg, root) {
    if (keyHandler) { document.removeEventListener('keydown', keyHandler); keyHandler = null; }
    const body = root.querySelector('.bn-sbody'); body.replaceChildren();
    const big = make('div', 'bn-cd'); body.appendChild(big);
    for (const t of ['3', '2', '1']) { big.replaceChildren(make('b', '', t)); await sleep(850); if (!stage.open) return; }
    runQuiz(deck, cfg);
  }
  function questions(deck, cfg) {
    const pick = shuffle(deck.items).slice(0, cfg.count);
    const side = (c, which) => (cfg.dir === 'fb' ? (which === 'q' ? c.front : c.back) : (which === 'q' ? c.back : c.front));
    return pick.map((c) => {
      const answer = side(c, 'a');
      const others = shuffle([...new Set(deck.items.filter((o) => o.id !== c.id).map((o) => side(o, 'a')).filter((t) => t !== answer))]).slice(0, 3);
      return { card: c, q: side(c, 'q'), answer, options: shuffle([answer, ...others]) };
    });
  }
  function runQuiz(deck, cfg) {
    const qs = questions(deck, cfg);
    const R = { i: 0, score: 0, streak: 0, best: 0, right: 0, locked: false, t0: 0 };
    openStage((root) => {
      root.className = 'bn-stage quiz play';
      const score = make('div', 'bn-score'); const sv = make('b', '', '0'); const streak = make('span', 'bn-streak'); score.append(streak, sv, make('small', '', 'pts'));
      const tb = topbar('Pergunta 1 de ' + qs.length, 0, score); root.appendChild(tb.el);
      const body = make('div', 'bn-sbody'); root.appendChild(body);
      let label = tb.el.querySelector('.bn-slabel');

      function ask() {
        const Q = qs[R.i]; R.locked = false; R.advanced = false;
        label.textContent = 'Pergunta ' + (R.i + 1) + ' de ' + qs.length; tb.fill.style.width = (R.i / qs.length * 100) + '%';
        body.replaceChildren();
        const qbox = make('div', 'bn-q enter'); qbox.appendChild(make('p', '', Q.q)); body.appendChild(qbox);
        const timer = make('i', 'bn-timer'); const tf = make('b'); timer.appendChild(tf); const tl = make('span', 'bn-tleft', String(cfg.time)); const trow = make('div', 'bn-trow'); trow.append(timer, tl); body.appendChild(trow);
        const grid = make('div', 'bn-tiles' + (Q.options.length < 4 ? ' few' : '')); body.appendChild(grid);
        const tiles = Q.options.map((opt, k) => {
          const b = make('button', 'bn-tile t' + k); b.type = 'button'; b.style.setProperty('--d', k * 70 + 'ms');
          b.appendChild(make('span', 'txt', opt)); b.appendChild(make('kbd', '', String(k + 1)));
          b.onclick = () => pickTile(k); grid.appendChild(b); return b;
        });
        const fb = make('div', 'bn-fb'); body.appendChild(fb);
        // timer bar shrinks over the question time
        tf.style.transition = 'none'; tf.style.width = '100%'; void tf.offsetWidth; tf.style.transition = 'width ' + cfg.time + 's linear'; tf.style.width = '0%';
        R.t0 = performance.now();
        const tick = () => { const left = Math.max(0, cfg.time - (performance.now() - R.t0) / 1000); tl.textContent = String(Math.ceil(left)); tl.classList.toggle('low', left <= 5); if (left <= 0) { if (!R.locked) pickTile(-1); return; } if (!R.locked) S.raf = requestAnimationFrame(tick); };
        cancelAnimationFrame(S.raf); S.raf = requestAnimationFrame(tick);

        function pickTile(k) {
          if (R.locked) return; R.locked = true; cancelAnimationFrame(S.raf);
          const elapsed = (performance.now() - R.t0) / 1000, ok = k >= 0 && Q.options[k] === Q.answer;
          const frozen = Math.max(0, 1 - elapsed / cfg.time) * 100; tf.style.transition = 'none'; tf.style.width = frozen + '%';
          let pts = 0;
          if (ok) { R.streak++; R.best = Math.max(R.best, R.streak); R.right++; pts = Math.round(1000 * (1 - Math.min(1, elapsed / cfg.time) / 2)) + Math.min(R.streak - 1, 5) * 50; R.score += pts; countUp(sv, R.score, 700); }
          else R.streak = 0;
          streak.textContent = R.streak >= 2 ? '×' + R.streak : ''; streak.classList.toggle('on', R.streak >= 2);
          review(Q.card, ok);
          tiles.forEach((t, j) => { t.disabled = true; const right = Q.options[j] === Q.answer; t.classList.add(right ? 'right' : j === k ? 'wrong' : 'dim'); });
          fb.className = 'bn-fb show ' + (ok ? 'ok' : 'no');
          fb.replaceChildren();
          const head = make('b', '', ok ? 'Correto!' : k < 0 ? 'Tempo esgotado' : 'Não foi dessa vez');
          fb.appendChild(head);
          if (ok) fb.appendChild(make('span', 'pts', '+' + pts));
          else fb.appendChild(make('span', '', 'Resposta: ' + Q.answer));
          const nx = make('button', 'bn-next', R.i + 1 >= qs.length ? 'Ver resultado' : 'Próxima'); nx.type = 'button'; nx.onclick = next; fb.appendChild(nx); nx.focus();
          later(() => { if (R.locked && stage.open) next(); }, 3800);
        }
        if (keyHandler) document.removeEventListener('keydown', keyHandler);
        keyHandler = (e) => {
          if (!R.locked && /^[1-4]$/.test(e.key) && Number(e.key) <= Q.options.length) pickTile(Number(e.key) - 1);
          else if (R.locked && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); next(); }
        };
        document.addEventListener('keydown', keyHandler);
      }
      function next() { if (R.advanced) return; R.advanced = true; timers.forEach(clearTimeout); timers = []; R.i++; if (R.i >= qs.length) results(); else ask(); }
      function results() {
        if (keyHandler) { document.removeEventListener('keydown', keyHandler); keyHandler = null; }
        tb.fill.style.width = '100%'; label.textContent = 'Resultado';
        body.replaceChildren();
        const pct = Math.round(R.right / qs.length * 100);
        const prevBest = deck.best_score, record = R.score > prevBest;
        api('/' + deck.id + '/score', 'POST', { score: R.score }).then((d) => { deck.best_score = d.best_score; }).catch(() => {});
        const box = make('div', 'bn-res');
        box.appendChild(make('p', 'bn-rk', record && R.score > 0 ? 'Novo recorde!' : pct >= 70 ? 'Muito bem!' : 'Fim de jogo'));
        const big = make('b', 'bn-bigscore', '0'); box.appendChild(big); box.appendChild(make('p', 'bn-pts', 'pontos'));
        const stats = make('ul', 'bn-rstats');
        [[R.right + '/' + qs.length, 'acertos'], [pct + '%', 'de precisão'], ['×' + R.best, 'maior sequência'], [record ? (prevBest ? prevBest.toLocaleString('pt-BR') : '—') : deck.best_score.toLocaleString('pt-BR'), record ? 'recorde anterior' : 'recorde']].forEach(([v, l]) => { const li = make('li'); li.append(make('b', '', v), make('small', '', l)); stats.appendChild(li); });
        box.appendChild(stats);
        const acts = make('div', 'bn-sacts');
        const again = make('button', 'bn-ans right', 'Jogar de novo'); again.type = 'button'; again.onclick = () => startQuiz(deck);
        const study = make('button', 'bn-ans flip', 'Flashcards'); study.type = 'button'; study.onclick = () => startStudy(deck, true);
        const close = make('button', 'bn-ans flip', 'Fechar'); close.type = 'button'; close.onclick = () => stage.close();
        acts.append(again, study, close); box.appendChild(acts); body.appendChild(box);
        countUp(big, R.score, 1200);
        if (pct >= 70 || record) confetti(root);
      }
      ask();
    });
  }

  route().catch((e) => { $('bnSub').textContent = ''; $('bnEmpty').textContent = 'Não foi possível carregar os baralhos: ' + e.message; $('bnEmpty').hidden = false; });
})();
