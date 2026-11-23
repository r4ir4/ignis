// Fill in one of your own check-in forms, one question at a time (same flow as the Venvanse check-in). One response per form per day.
(() => {
  'use strict';
  const { mk, api, query, todayKey, folderHref } = CK;
  const $ = (id) => document.getElementById(id);
  const id = query('id');
  const GOOD = [['#ffd0d6', '#ff6b78'], ['#ffdcbc', '#ff9c60'], ['#fff1c9', '#f2b84b'], ['#e6f2dc', '#8fbf6f'], ['#d6efe3', '#4fae86']];
  const SOFT = [['#ffe3ec', '#ec5b92'], ['#ffdcbc', '#ff9c60'], ['#ffd0d6', '#ff6b78']];
  const ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
  const stage = $('cfStage');
  let form = null, Q = [], idx = -1, advance = null;
  const A = {};

  const filled = (q) => { const a = A[q.id]; return a !== undefined && a !== '' && (typeof a !== 'object' || !!a.v); };
  const answered = () => Q.filter(filled).length;
  const clock = (d) => d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  function go(to, dir) {
    clearTimeout(advance);
    idx = Math.max(-1, Math.min(Q.length, to));
    const intro = idx < 0;
    $('cfDay').hidden = !intro; $('cfStart').hidden = !intro; $('cfRecords').hidden = !intro; stage.hidden = intro;
    if (!intro) { renderStage(dir || 1); window.scrollTo({ top: Math.max(0, stage.getBoundingClientRect().top + window.scrollY - 90), behavior: 'smooth' }); }
  }
  const next = () => go(idx + 1, 1);
  const back = () => go(idx - 1, -1);
  function choose(q, value) {
    A[q.id] = value;
    stage.querySelectorAll('.cf-ans').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === String(value))));
    clearTimeout(advance); advance = setTimeout(next, 420);
  }
  function tile(q, v, big, label, color, noClick) {
    const b = mk('button', 'cf-ans'); b.type = 'button'; b.dataset.v = String(v); b.style.setProperty('--c', color[0]); b.style.setProperty('--s', color[1]);
    const cur = A[q.id]; b.setAttribute('aria-pressed', String(typeof cur === 'object' ? !!cur && cur.v === v : String(cur) === String(v)));
    b.appendChild(mk('b', '', big)); if (label) b.appendChild(mk('span', '', label));
    if (!noClick) b.addEventListener('click', () => choose(q, v));
    return b;
  }
  const continueBtn = () => { const b = mk('button', 'cf-save cf-go', 'Continuar'); b.type = 'button'; return b; };

  function answersFor(q) {
    const wrap = mk('div', 'cf-answers cf-k-' + q.type);
    if (q.type === 'choice') {
      q.options.forEach((label, v) => wrap.appendChild(tile(q, v, String.fromCharCode(65 + v), label, SOFT[v % SOFT.length])));
    } else if (q.type === 'scale') {
      if (q.max === 10) { wrap.classList.add('cf-k-ten'); for (let v = 0; v <= 10; v++) wrap.appendChild(tile(q, v, String(v), '', GOOD[Math.min(4, Math.floor(v / 2.5))])); }
      else { wrap.classList.add('cf-row', 'cf-k-adv'); [0, 1, 2, 3, 4].forEach((v) => wrap.appendChild(tile(q, v, String(v), '', GOOD[v]))); const box = mk('div', 'cf-intensity'); const ends = mk('div', 'cf-ends'); ends.append(mk('span', 'lo', 'Menos'), mk('span', 'hi', 'Mais')); box.append(wrap, ends); return box; }
    } else if (q.type === 'yesno') {
      wrap.classList.add('cf-row', 'cf-yn');
      const more = mk('div', 'cf-more'); const t = mk('input'); t.type = 'text'; t.maxLength = 200; t.placeholder = q.ask || ''; t.setAttribute('aria-label', q.ask || 'Detalhe');
      const ok = continueBtn(); more.append(t, ok);
      const cur = typeof A[q.id] === 'object' ? A[q.id] : null;
      more.hidden = !(q.ask && cur && cur.v === 'sim'); if (cur && cur.text) t.value = cur.text;
      [['sim', 'Sim', SOFT[0]], ['nao', 'Não', SOFT[1]]].forEach(([v, label, color]) => {
        const b = tile(q, v, label, '', color, true);
        b.onclick = () => {
          wrap.querySelectorAll('.cf-ans').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
          if (v === 'sim' && q.ask) { A[q.id] = { v, text: t.value }; more.hidden = false; t.focus(); } else { A[q.id] = { v, text: '' }; more.hidden = true; clearTimeout(advance); advance = setTimeout(next, 420); }
        };
        wrap.appendChild(b);
      });
      t.addEventListener('input', () => { A[q.id] = { v: 'sim', text: t.value }; });
      const done = () => { A[q.id] = { v: 'sim', text: t.value.trim() }; next(); };
      ok.addEventListener('click', done); t.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); done(); } });
      const box = mk('div', 'cf-ynbox'); box.append(wrap, more); return box;
    } else if (q.type === 'text' || q.type === 'number' || q.type === 'time') {
      const f = mk('div', q.type === 'text' ? 'cf-more' : 'cf-hours'); const i = mk('input');
      if (q.type === 'text') { i.type = 'text'; i.maxLength = 500; i.placeholder = 'Escreva aqui'; }
      if (q.type === 'number') { i.type = 'number'; i.step = 'any'; i.inputMode = 'decimal'; i.placeholder = '0'; }
      if (q.type === 'time') i.type = 'time';
      i.setAttribute('aria-label', q.text); if (A[q.id] !== undefined) i.value = A[q.id];
      const ok = continueBtn();
      const done = () => { if (i.value !== '') A[q.id] = i.value; else delete A[q.id]; next(); };
      ok.addEventListener('click', done); i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); done(); } });
      if (q.type === 'number') { const field = mk('div', 'cf-hfield'); field.append(i); if (q.unit) field.appendChild(mk('em', '', q.unit)); f.append(field, ok); } else f.append(i, ok);
      wrap.appendChild(f);
      if (A[q.id] === undefined) setTimeout(() => i.focus(), 350);
    }
    return wrap;
  }

  function renderStage(dir) {
    stage.replaceChildren(); stage.style.setProperty('--dir', dir);
    const box = mk('div', 'cf-slide');
    if (idx >= Q.length) { box.appendChild(endScreen()); stage.appendChild(box); return; }
    const q = Q[idx];
    const top = mk('div', 'cf-top');
    const b = mk('button', 'cf-back'); b.type = 'button'; b.innerHTML = ARROW; b.setAttribute('aria-label', 'Pergunta anterior'); b.addEventListener('click', back);
    top.append(b, mk('span', 'cf-sec', form.name), mk('span', 'cf-num', (idx + 1) + ' / ' + Q.length));
    const bar = mk('div', 'cf-bar'); bar.setAttribute('role', 'progressbar'); bar.setAttribute('aria-valuemin', '0'); bar.setAttribute('aria-valuemax', String(Q.length)); bar.setAttribute('aria-valuenow', String(idx));
    const fill = mk('i'); fill.style.width = (idx / Q.length * 100) + '%'; bar.appendChild(fill);
    requestAnimationFrame(() => { fill.style.width = ((idx + 1) / Q.length * 100) + '%'; });
    box.append(top, bar, mk('h2', 'cf-question', q.text), answersFor(q));
    const skip = mk('button', 'cf-skip', 'Pular esta'); skip.type = 'button'; skip.addEventListener('click', next); box.appendChild(skip);
    stage.appendChild(box);
  }

  function endScreen() {
    const w = mk('div', 'cf-end'); const n = answered();
    w.append(mk('div', 'cf-party', '✦'), mk('h2', 'cf-question', n === Q.length ? 'Pronto!' : 'Chegamos ao fim'), mk('p', 'cf-endsub', n + ' de ' + Q.length + ' perguntas respondidas.'));
    const acts = mk('div', 'cf-endacts');
    const save = mk('button', 'cf-save', 'Salvar'); save.type = 'button';
    const err = mk('p', 'cf-err'); err.hidden = true; err.setAttribute('role', 'alert');
    save.addEventListener('click', () => submit(save, err));
    const review = mk('button', 'cf-ghost', 'Revisar'); review.type = 'button'; review.addEventListener('click', () => go(0, -1));
    const prev = mk('button', 'cf-ghost', 'Voltar'); prev.type = 'button'; prev.addEventListener('click', back);
    acts.append(prev, review, save); w.append(acts, err); return w;
  }

  document.addEventListener('keydown', (e) => {
    if (idx < 0 || idx >= Q.length || e.metaKey || e.ctrlKey || e.altKey || (e.target.matches && e.target.matches('input, textarea'))) return;
    const q = Q[idx];
    if (e.key === 'ArrowLeft' || e.key === 'Backspace') { e.preventDefault(); back(); return; }
    if (q.type === 'scale' && /^\d$/.test(e.key) && +e.key <= q.max) choose(q, +e.key);
    if (q.type === 'choice' && /^[a-j]$/i.test(e.key)) { const b = stage.querySelectorAll('.cf-ans')[e.key.toLowerCase().charCodeAt(0) - 97]; if (b) b.click(); }
    if (q.type === 'yesno' && (e.key === 's' || e.key === 'n')) { const b = stage.querySelector('.cf-ans[data-v="' + (e.key === 's' ? 'sim' : 'nao') + '"]'); if (b) b.click(); }
  });

  function payload() {
    const answers = {};
    Q.forEach((q) => { if (filled(q)) answers[q.id] = A[q.id]; });
    return { day: todayKey(), answers };
  }
  async function submit(btn, err) {
    const body = payload();
    if (!Object.keys(body.answers).length) { err.textContent = 'Responda pelo menos uma pergunta antes de salvar.'; err.hidden = false; return; }
    btn.disabled = true; btn.textContent = 'Salvando...'; err.hidden = true;
    try { showDone(await api('checkin-forms/' + id + '/responses', 'POST', body)); }
    catch (e) {
      if (e.status === 409) { try { showDone(await api('checkin-forms/' + id + '/responses/' + todayKey())); return; } catch (e2) { /* fall through */ } }
      btn.disabled = false; btn.textContent = 'Salvar'; err.textContent = 'Não foi possível salvar: ' + e.message + '. Suas respostas continuam aqui, tente de novo.'; err.hidden = false;
    }
  }
  function showDone(row) {
    clearTimeout(advance); idx = -2;
    ['cfDay', 'cfStart', 'cfRecords', 'cfStage'].forEach((x) => { $(x).hidden = true; });
    const box = $('cfDone'); box.hidden = false; box.replaceChildren();
    const n = Object.keys(row.answers || {}).length; const at = row.created_at ? new Date(row.created_at) : null;
    const check = mk('div', 'cf-donemark'); check.setAttribute('aria-hidden', 'true'); check.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 12.500l4.500 4.500L19 7.500"/></svg>';
    box.append(check, mk('h2', 'cf-donetitle', 'Registro de hoje concluído'),
      mk('p', 'cf-donesub', (at ? 'Salvo às ' + clock(at) + ' · ' : '') + n + (n === 1 ? ' resposta' : ' respostas')),
      mk('p', 'cf-donenote', 'Só dá para enviar um registro por dia deste formulário. O próximo fica disponível amanhã.'));
    const acts = mk('div', 'cf-endacts');
    const charts = mk('a', 'cf-save', 'Ver gráficos'); charts.href = 'checkin-registros?id=' + id;
    const folder = mk('a', 'cf-ghost', 'Voltar à pasta'); folder.href = folderHref(form.folder);
    acts.append(folder, charts); box.appendChild(acts);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function init() {
    try { form = await api('checkin-forms/' + id); }
    catch (e) { $('cfLog').replaceChildren(mk('p', 'cf-empty', 'Não foi possível abrir este formulário.')); return; }
    Q = form.questions; document.title = form.name + ' · Ignis';
    $('cfTitle').textContent = form.name;
    $('cfBack').href = folderHref(form.folder);
    $('cfDate').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    $('cfLog').replaceChildren(...(form.description ? [mk('p', 'cf-empty', form.description)] : []));
    $('cfLead').textContent = Q.length + (Q.length === 1 ? ' pergunta' : ' perguntas') + ' · leva cerca de ' + Math.max(1, Math.round(Q.length * 0.2)) + (Math.max(1, Math.round(Q.length * 0.2)) === 1 ? ' minuto' : ' minutos');
    $('cfRecordsLink').href = 'checkin-registros?id=' + id; $('cfEditLink').href = 'checkin-editor?id=' + id + '&folder=' + encodeURIComponent(form.folder);
    $('cfGo').addEventListener('click', () => go(0, 1));
    $('cfDel').addEventListener('click', () => CK.removeForm(form));
    try { showDone(await api('checkin-forms/' + id + '/responses/' + todayKey())); return; } catch (e) { /* not filled in today */ }
    $('cfStart').hidden = false;
  }
  init();
})();
