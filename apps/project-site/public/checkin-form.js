// Venvanse daily check-in, one question at a time: pick an answer and it moves on by itself (like a quiz). Shows today's dose from the Meds log (read only).
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const MIN = 60e3;
  const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const sameDay = (a, b) => startOf(a).getTime() === startOf(b).getTime();
  const clock = (d) => d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const span = (ms) => { const m = Math.round(ms / MIN); return m < 60 ? m + ' min' : Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'm'; };
  const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  // ---- the questionnaire ---------------------------------------------------------------------------------------------------------------------------------
  const RATE = ['Muito ruim', 'Ruim', 'Razoável', 'Bom', 'Muito bom'];
  // New short questionnaire. Numbers start at 46 so they never collide with the q1-q45 answers saved by the old long form.
  const SECTIONS = [
    { title: 'Check-in do dia', kind: 'choice', qs: [
      [46, 'Como avalio o foco hoje?', 'choice', RATE, true],
      [47, 'Quantas tarefas da lista eu concluí?', 'choice', ['Todas', 'A maior parte', 'Uma ou duas', 'Nenhuma']],
      [48, 'Eu comi antes de tomar o remédio?', 'choice', ['Sim', 'Não']],
      [49, 'Senti sono ao passar o efeito da primeira dose?', 'choice', ['Sim, e tive que dormir', 'Sim, mas não dormi', 'Não']],
      [50, 'Achei suficiente para o dia?', 'choice', ['Sim', 'Mais ou menos', 'Poderia ser melhor', 'Não']]] },
  ];

  const FLAT = [];
  SECTIONS.forEach((sec, si) => sec.qs.forEach((q) => FLAT.push({ n: q[0], text: q[1], kind: q[2] || sec.kind, ask: q[3], opts: Array.isArray(q[3]) ? q[3] : null, good: !!q[4], section: sec.title, note: sec.note, si })));
  let FLOW = FLAT.slice();   // the questions actually asked: those already answered from the Meds log are left out
  let TOTAL = FLOW.length;
  const A = {};          // answers by question number: '0'..'4', '0'..'10', hours, or {v:'sim'|'nao', text}
  const AUTO = {};       // questions answered for you: 'sleep' (Health data) or 'meds' (Meds log), until you change them
  let idx = -1;          // -1 intro, 0..TOTAL-1 a question, TOTAL the end screen
  // colours run from "bad" to "good" for the quality questions and the other way round for the side effects
  // soft pastel tiles in the Check-in colours: a tint for the tile and a stronger colour for its number and for when it is picked
  const GOOD = [['#ffd0d6', '#ff6b78'], ['#ffdcbc', '#ff9c60'], ['#fff1c9', '#f2b84b'], ['#e6f2dc', '#8fbf6f'], ['#d6efe3', '#4fae86']];
  const SOFT = [['#ffe3ec', '#ec5b92'], ['#ffdcbc', '#ff9c60'], ['#ffd0d6', '#ff6b78']];
  const colorFor = (kind, v) => (kind === 'adv' ? GOOD[4 - v] : GOOD[v]);
  const ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
  const filled = (n) => { const a = A[n]; return a !== undefined && a !== '' && (typeof a !== 'object' || !!a.v); };
  const answered = () => FLOW.filter((q) => filled(q.n)).length;

  function rebuildFlow() {
    const cur = idx >= 0 && idx < TOTAL ? FLOW[idx].n : null;
    FLOW = FLAT.filter((q) => AUTO[q.n] !== 'meds');
    TOTAL = FLOW.length;
    if (cur !== null) { const k = FLOW.findIndex((q) => q.n === cur); if (k >= 0) idx = k; }
  }

  const stage = $('cfStage');
  let advance = null;
  function go(to, dir) {
    clearTimeout(advance);
    idx = Math.max(-1, Math.min(TOTAL, to));
    const intro = idx < 0;
    $('cfDay').hidden = !intro; $('cfStart').hidden = !intro; $('cfRecords').hidden = !intro; stage.hidden = intro;
    if (!intro) { renderStage(dir || 1); }
    if (!intro) window.scrollTo({ top: Math.max(0, stage.getBoundingClientRect().top + window.scrollY - 90), behavior: 'smooth' });
  }
  const next = () => go(idx + 1, 1);
  const back = () => go(idx - 1, -1);
  function choose(q, value, text) {
    A[q.n] = value; delete AUTO[q.n];
    stage.querySelectorAll('.cf-ans').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === String(value))));
    clearTimeout(advance);
    advance = setTimeout(next, 420);
  }

  function renderStage(dir) {
    stage.replaceChildren();
    stage.style.setProperty('--dir', dir);
    const box = mk('div', 'cf-slide');
    if (idx >= TOTAL) { box.appendChild(endScreen()); stage.appendChild(box); return; }
    const q = FLOW[idx];
    // top row: back, section, counter, and a thin bar for how far along you are
    const top = mk('div', 'cf-top');
    const b = mk('button', 'cf-back'); b.type = 'button'; b.innerHTML = ARROW; b.setAttribute('aria-label', 'Pergunta anterior'); b.addEventListener('click', back);
    top.append(b, mk('span', 'cf-sec', q.section), mk('span', 'cf-num', (idx + 1) + ' / ' + TOTAL));
    const bar = mk('div', 'cf-bar'); bar.setAttribute('role', 'progressbar'); bar.setAttribute('aria-valuemin', '0'); bar.setAttribute('aria-valuemax', String(TOTAL)); bar.setAttribute('aria-valuenow', String(idx));
    const fill = mk('i'); fill.style.width = (idx / TOTAL * 100) + '%'; bar.appendChild(fill);
    requestAnimationFrame(() => { fill.style.width = ((idx + 1) / TOTAL * 100) + '%'; });
    box.append(top, bar, mk('h2', 'cf-question', q.text));
    if (q.note && q.kind !== 'adv') box.appendChild(mk('p', 'cf-hint', q.note));
    box.appendChild(answersFor(q));
    const skip = mk('button', 'cf-skip', 'Pular esta'); skip.type = 'button'; skip.addEventListener('click', next);
    box.appendChild(skip);
    stage.appendChild(box);
  }

  function answersFor(q) {
    const wrap = mk('div', 'cf-answers cf-k-' + q.kind);
    if (q.kind === 'eval') {
      LEVELS.forEach((label, v) => wrap.appendChild(tile(q, v, v + '', label, colorFor('eval', v))));
    } else if (q.kind === 'adv') {
      wrap.classList.add('cf-row');
      [0, 1, 2, 3, 4].forEach((v) => { const t = tile(q, v, v + '', '', colorFor('adv', v)); if (ADV[v]) t.setAttribute('aria-label', v + ', ' + ADV[v].toLowerCase()); wrap.appendChild(t); });
      // the two ends are named once under the row, instead of inside the first and last tile
      const ends = mk('div', 'cf-ends'); ends.setAttribute('aria-hidden', 'true');
      ends.append(mk('span', 'lo', ADV[0]), mk('span', 'hi', ADV[4]));
      const box = mk('div', 'cf-intensity'); box.append(wrap, ends); return box;
    } else if (q.kind === 'ten') {
      for (let v = 0; v <= 10; v++) wrap.appendChild(tile(q, v, v + '', '', GOOD[Math.min(4, Math.floor(v / 2.5))]));
    } else if (q.kind === 'choice') {
      q.opts.forEach((label, v) => wrap.appendChild(tile(q, v, String.fromCharCode(65 + v), label, q.good ? GOOD[v] : SOFT[v % SOFT.length])));
    } else if (q.kind === 'time') {
      const f = mk('div', 'cf-hours'); const i = mk('input'); i.type = 'time'; i.setAttribute('aria-label', 'Horário');
      if (A[q.n] !== undefined) i.value = A[q.n];
      const ok = mk('button', 'cf-save cf-go', 'Continuar'); ok.type = 'button';
      const done = () => { if (i.value) { if (A[q.n] !== i.value) delete AUTO[q.n]; A[q.n] = i.value; } else delete A[q.n]; next(); };
      ok.addEventListener('click', done); i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); done(); } });
      i.addEventListener('input', () => { const t = stage.querySelector('.cf-auto'); if (t) t.remove(); });
      f.append(i, ok); wrap.appendChild(f);
      if (A[q.n] === undefined) setTimeout(() => i.focus(), 350);
    } else if (q.kind === 'dose') {
      wrap.classList.add('cf-row');
      const list = presets.slice();
      if (A[q.n] !== undefined && !list.includes(+A[q.n])) list.push(+A[q.n]);
      list.sort((a, b) => a - b).forEach((mg, i) => wrap.appendChild(tile(q, String(mg), String(mg), 'mg', [SOFT[0], SOFT[1], SOFT[2], GOOD[2]][i % 4])));
    } else if (q.kind === 'second') {
      wrap.classList.add('cf-row', 'cf-yn');
      const cur = typeof A[q.n] === 'object' ? A[q.n] : {};
      const more = mk('div', 'cf-more cf-two');
      const mg = mk('input'); mg.type = 'number'; mg.min = '0'; mg.max = '200'; mg.step = '10'; mg.inputMode = 'numeric'; mg.placeholder = 'mg'; mg.setAttribute('aria-label', 'Dose em mg');
      const tm = mk('input'); tm.type = 'time'; tm.setAttribute('aria-label', 'Horário da segunda dose');
      const ok = mk('button', 'cf-save cf-go', 'Continuar'); ok.type = 'button';
      mg.value = cur.mg || ''; tm.value = cur.time || '';
      const row = mk('div', 'cf-pair'); row.append(mg, mk('em', '', 'mg às'), tm);
      more.append(row, ok); more.hidden = cur.v !== 'sim';
      const save = (v) => { A[q.n] = { v, mg: mg.value, time: tm.value }; delete AUTO[q.n]; const note = stage.querySelector('.cf-auto'); if (note) note.remove(); };
      [['sim', 'Sim', SOFT[0]], ['nao', 'Não', SOFT[1]]].forEach(([v, label, color]) => {
        const b = tile(q, v, label, '', color, true);
        b.onclick = () => {
          wrap.querySelectorAll('.cf-ans').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
          save(v);
          if (v === 'sim') { more.hidden = false; mg.focus(); } else { more.hidden = true; clearTimeout(advance); advance = setTimeout(next, 420); }
        };
        wrap.appendChild(b);
      });
      mg.addEventListener('input', () => save('sim')); tm.addEventListener('input', () => save('sim'));
      const done = () => { save('sim'); next(); };
      ok.addEventListener('click', done);
      const box = mk('div', 'cf-ynbox'); box.append(wrap, more); return box;
    } else if (q.kind === 'hours') {
      const f = mk('div', 'cf-hours'); const field = mk('div', 'cf-hfield'); const i = mk('input'); i.type = 'number'; i.min = '0'; i.max = '16'; i.step = '0.5'; i.inputMode = 'decimal'; i.placeholder = '0'; i.setAttribute('aria-label', 'Horas de sono');
      if (A[q.n] !== undefined) i.value = A[q.n];
      const ok = mk('button', 'cf-save cf-go', 'Continuar'); ok.type = 'button';
      const done = () => { if (i.value !== '') { A[q.n] = i.value; delete AUTO[q.n]; } else delete A[q.n]; next(); };
      ok.addEventListener('click', done); i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); done(); } });
      i.addEventListener('input', () => { const t = stage.querySelector('.cf-sleep-t'); if (t) t.textContent = 'Valor ajustado por você'; });
      field.append(i, mk('em', '', 'horas')); f.append(field, ok); wrap.appendChild(f);
      if (A[q.n] === undefined) setTimeout(() => i.focus(), 350);
    } else if (q.kind === 'yn') {
      wrap.classList.add('cf-row', 'cf-yn');
      const more = mk('div', 'cf-more'); const t = mk('input'); t.type = 'text'; t.maxLength = 200; t.placeholder = q.ask; t.setAttribute('aria-label', q.ask);
      const ok = mk('button', 'cf-save cf-go', 'Continuar'); ok.type = 'button'; more.append(t, ok);
      const cur = typeof A[q.n] === 'object' ? A[q.n] : null;
      more.hidden = !(cur && cur.v === 'sim'); if (cur && cur.text) t.value = cur.text;
      [['sim', 'Sim', SOFT[0]], ['nao', 'Não', SOFT[1]]].forEach(([v, label, color]) => {
        const b = tile(q, v, label, '', color, true);
        b.onclick = () => {
          wrap.querySelectorAll('.cf-ans').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
          if (v === 'sim') { A[q.n] = { v, text: t.value }; more.hidden = false; t.focus(); } else { A[q.n] = { v, text: '' }; more.hidden = true; clearTimeout(advance); advance = setTimeout(next, 420); }
        };
        wrap.appendChild(b);
      });
      t.addEventListener('input', () => { A[q.n] = { v: 'sim', text: t.value }; });
      const done = () => { A[q.n] = { v: 'sim', text: t.value.trim() }; next(); };
      ok.addEventListener('click', done); t.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); done(); } });
      const box = mk('div', 'cf-ynbox'); box.append(wrap, more); return box;
    }
    return wrap;
  }
  function tile(q, v, big, label, color, noClick) {
    const b = mk('button', 'cf-ans'); b.type = 'button'; b.dataset.v = String(v); b.style.setProperty('--c', color[0]); b.style.setProperty('--s', color[1]);
    b.setAttribute('aria-pressed', String(typeof A[q.n] === 'object' ? (A[q.n] && A[q.n].v === v) : String(A[q.n]) === String(v)));
    b.appendChild(mk('b', '', big));
    if (label) b.appendChild(mk('span', '', label));
    if (!noClick) b.addEventListener('click', () => choose(q, v));
    return b;
  }

  function endScreen() {
    const w = mk('div', 'cf-end');
    const n = answered();
    w.append(mk('div', 'cf-party', '✦'), mk('h2', 'cf-question', n === TOTAL ? 'Pronto!' : 'Chegamos ao fim'), mk('p', 'cf-endsub', n + ' de ' + TOTAL + ' perguntas respondidas.'));
    const acts = mk('div', 'cf-endacts');
    const save = mk('button', 'cf-save', 'Salvar check-in'); save.type = 'button';
    const err = mk('p', 'cf-err'); err.hidden = true; err.setAttribute('role', 'alert');
    save.addEventListener('click', () => submit(save, err));
    const review = mk('button', 'cf-ghost', 'Revisar'); review.type = 'button'; review.addEventListener('click', () => go(0, -1));
    const prev = mk('button', 'cf-ghost', 'Voltar'); prev.type = 'button'; prev.addEventListener('click', back);
    acts.append(prev, review, save); w.append(acts, err);
    return w;
  }

  document.addEventListener('keydown', (e) => {
    if (idx < 0 || idx >= TOTAL || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.matches && e.target.matches('input, textarea')) return;
    const q = FLOW[idx];
    if (e.key === 'ArrowLeft' || e.key === 'Backspace') { e.preventDefault(); back(); return; }
    if (/^\d$/.test(e.key)) {
      const v = +e.key;
      if ((q.kind === 'eval' || q.kind === 'adv') && v <= 4) choose(q, v);
      else if (q.kind === 'ten') choose(q, v);
    }
    if ((q.kind === 'choice') && /^[a-e]$/i.test(e.key)) { const b = stage.querySelectorAll('.cf-ans')[e.key.toLowerCase().charCodeAt(0) - 97]; if (b) b.click(); }
    if ((q.kind === 'yn' || q.kind === 'second') && (e.key === 's' || e.key === 'n')) { const b = stage.querySelector('.cf-ans[data-v="' + (e.key === 's' ? 'sim' : 'nao') + '"]'); if (b) b.click(); }
  });

  // ---- the day, with that day's doses taken from the Meds log (read only; nothing is registered here) -----------------------------------------------------
  const day = startOf(new Date());   // the form is only for today: past days cannot be filled in
  let doses = null;
  let presets = [20, 30, 50, 70];   // Venvanse doses offered on the Meds page
  function render() {
    $('cfDate').textContent = day.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const log = $('cfLog'); log.replaceChildren();
    if (doses === null) { log.appendChild(mk('p', 'cf-empty', 'Carregando o registro do Meds...')); return; }
    if (doses === false) { log.appendChild(mk('p', 'cf-empty', 'Não foi possível carregar o registro do Meds agora.')); return; }
    const list = doses.filter((d) => sameDay(new Date(d.taken_at), day)).sort((a, b) => new Date(a.taken_at) - new Date(b.taken_at));
    if (!list.length) { log.appendChild(mk('p', 'cf-empty', 'Nenhuma dose registrada hoje no Meds.')); return; }
    list.forEach((d, i) => {
      const taken = new Date(d.taken_at);
      const card = mk('div', 'cf-dose2');
      const head = mk('div', 'cf-dose2-head');
      head.append(mk('span', '', list.length > 1 ? (i + 1) + 'ª dose de hoje' : 'Dose de hoje'), mk('small', '', 'do Meds'));
      const big = mk('div', 'cf-dose2-big'); big.append(mk('strong', '', clock(taken)), mk('em', '', Math.round(d.dose_mg) + ' mg'));
      // the day of the dose as a timeline: onset, peak, wearing off, each with the time since the dose
      const tl = mk('ol', 'cf-tl');
      [['onset', 'Começou'], ['strongest', 'Pico'], ['wearing_off', 'Passou']].forEach(([type, label]) => {
        const ev = (d.events || []).find((e) => e.type === type);
        const li = mk('li', ev ? '' : 'off');
        li.append(mk('i'), mk('small', '', label), mk('b', '', ev ? clock(new Date(ev.occurred_at)) : '—'), mk('span', '', ev ? '+' + span(new Date(ev.occurred_at) - taken) : 'sem registro'));
        tl.appendChild(li);
      });
      card.append(head, big, tl); log.appendChild(card);
    });
  }


  // ---- saving: one finished check-in per day, kept on the server -----------------------------------------------------------------------------------------------
  const dayKey = () => day.getFullYear() + '-' + String(day.getMonth() + 1).padStart(2, '0') + '-' + String(day.getDate()).padStart(2, '0');
  function payload() {
    const answers = {};
    const keep = (n) => { const a = A[n]; if (a !== undefined && a !== '' && (typeof a !== 'object' || a.v)) answers['q' + n] = a; };
    FLAT.forEach((q) => keep(q.n));
    const auto = {}; Object.keys(AUTO).forEach((n) => { if (answers['q' + n] !== undefined) auto[n] = AUTO[n]; });
    return { day: dayKey(), answers, auto };
  }
  async function submit(btn, err) {
    const body = payload();
    if (!Object.keys(body.answers).length) { err.textContent = 'Responda pelo menos uma pergunta antes de salvar.'; err.hidden = false; return; }
    btn.disabled = true; btn.textContent = 'Salvando...'; err.hidden = true;
    try {
      const res = await fetch('api/v1/checkins/venvanse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.status === 409) { await loadStatus(); return; }          // someone (this page in another tab) already saved today's
      if (!res.ok) { let d = ''; try { d = (await res.json()).detail; } catch (e) { /* not json */ } throw new Error(typeof d === 'string' && d ? d : 'Erro ' + res.status); }
      showDone(await res.json());
    } catch (e) {
      btn.disabled = false; btn.textContent = 'Salvar check-in';
      err.textContent = 'Não foi possível salvar: ' + e.message + '. Suas respostas continuam aqui, tente de novo.'; err.hidden = false;
    }
  }
  function showDone(row) {
    clearTimeout(advance);
    idx = -2;
    ['cfDay', 'cfStart', 'cfRecords', 'cfStage'].forEach((id) => { $(id).hidden = true; });
    const box = $('cfDone'); box.hidden = false; box.replaceChildren();
    const n = Object.values(row.answers || {}).length;
    const at = row.created_at ? new Date(row.created_at) : null;
    const check = mk('div', 'cf-donemark'); check.setAttribute('aria-hidden', 'true');
    check.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 12.500l4.500 4.500L19 7.500"/></svg>';
    box.append(check, mk('h2', 'cf-donetitle', 'Check-in de hoje concluído'),
      mk('p', 'cf-donesub', (at ? 'Salvo às ' + clock(at) + ' · ' : '') + n + (n === 1 ? ' resposta' : ' respostas')),
      mk('p', 'cf-donenote', 'Só dá para enviar um check-in por dia. O próximo fica disponível amanhã.'));
    const back = mk('a', 'cf-save', 'Voltar para Meds'); back.href = 'checkin-meds';
    box.appendChild(back);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  // is today's check-in already there? then show it as done instead of the form
  async function loadStatus() {
    try {
      const res = await fetch('api/v1/checkins/venvanse/' + dayKey());
      if (res.ok) { const row = await res.json(); if (row && row.id) { showDone(row); return; } }
    } catch (e) { /* offline: just show the form */ }
    if (idx === -1) $('cfStart').hidden = false;
  }

  $('cfGo').addEventListener('click', () => go(0, 1));
  render();
  loadStatus();
  fetch('api/v1/meds/vyvanse/doses?limit=200').then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((rows) => { doses = rows; render(); }).catch(() => { doses = false; render(); });
  fetch('api/v1/meds').then((r) => (r.ok ? r.json() : null)).then((ms) => { const m = (ms || []).find((x) => x.slug === 'vyvanse'); if (m && Array.isArray(m.presets) && m.presets.length) presets = m.presets.map(Number); }).catch(() => { /* keep the defaults */ });
  // how many check-ins there are and when the last one was, under the start button
  fetch('api/v1/checkins/venvanse?limit=400').then((r) => (r.ok ? r.json() : null)).then((o) => {
    const items = (o && o.items) || [];
    if (!items.length) return;
    const [y, m, d] = items[0].day.split('-');
    $('cfLast').textContent = items.length + (items.length === 1 ? ' check-in' : ' check-ins') + ' até agora · último em ' + d + '/' + m;
  }).catch(() => { /* just no line */ });
})();
