// Records and charts for one of your own check-in forms: one card per question, drawn from every response saved so far.
(() => {
  'use strict';
  const { mk, api, query, dayLabel, folderHref } = CK;
  const C = CkCharts;
  const $ = (id) => document.getElementById(id);
  const id = query('id');
  const f1 = (n) => (n === null ? '–' : (Math.round(n * 10) / 10).toString().replace('.', ','));
  const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
  const hhmm = (m) => { const t = Math.round(((m % 1440) + 1440) % 1440); return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); };
  const ramp = (i, n) => { const a = [240, 216, 184], b = [238, 93, 27], t = n <= 1 ? 1 : i / (n - 1); return 'rgb(' + a.map((x, k) => Math.round(x + (b[k] - x) * t)).join(',') + ')'; };
  let form = null, DATA = null;

  function valueOf(q, a) {
    if (a === undefined || a === null || a === '') return null;
    if (q.type === 'choice' || q.type === 'scale') return typeof a === 'number' ? a : null;
    if (q.type === 'yesno') return a.v === 'sim' ? 0 : a.v === 'nao' ? 1 : null;
    if (q.type === 'number') return isNaN(+a) ? null : +a;
    if (q.type === 'time') { const m = /^(\d\d):(\d\d)$/.exec(a); return m ? +m[1] * 60 + +m[2] : null; }
    return null;
  }

  function questionCard(q, rows) {
    const vals = rows.map((r) => r[q.id]).filter((v) => v !== null && v !== undefined);
    const body = mk('div', 'cd-qbody');
    if (q.type === 'text' || q.type === 'yesno') {
      // the written answers, newest first
      const texts = DATA.filter((r) => { const a = r.answers[q.id]; return q.type === 'text' ? typeof a === 'string' && a : a && a.text; }).slice(-12).reverse();
      if (q.type === 'yesno') { const names = ['Sim', 'Não'], colors = ['#3f8a63', '#ee5d1b']; body.append(C.levelChart(rows, q.id, names, colors), C.distribution(vals, names, colors)); }
      if (texts.length) {
        const ul = mk('ul', 'cd-notes');
        texts.forEach((r) => { const a = r.answers[q.id]; const li = mk('li'); li.append(mk('small', '', dayLabel(r.day)), document.createTextNode(typeof a === 'string' ? a : a.text)); ul.appendChild(li); });
        body.appendChild(ul);
      } else if (q.type === 'text') body.appendChild(mk('p', 'cd-empty', 'Sem respostas escritas ainda.'));
      return C.card(q.text, q.type === 'yesno' ? 'Cada ponto é um dia.' + (q.ask ? ' Abaixo, o que você escreveu em "' + q.ask + '".' : '') : 'Suas últimas respostas.', body);
    }
    if (!vals.length) return C.card(q.text, null, mk('p', 'cd-empty', 'Sem respostas ainda.'));
    if (q.type === 'choice') {
      const colors = q.options.map((_, i) => C.PALETTE[i % C.PALETTE.length]);
      body.append(C.levelChart(rows, q.id, q.options, colors), C.distribution(vals, q.options, colors));
      return C.card(q.text, 'Cada ponto é um dia; a primeira opção fica no topo.', body);
    }
    if (q.type === 'scale') {
      const ticks = q.max === 4 ? 5 : 3;
      body.appendChild(C.lineChart(rows, q.id, 0, q.max, ticks, (v) => String(Math.round(v)), q.text));
      if (q.max === 4) { const names = ['0', '1', '2', '3', '4'], colors = names.map((_, i) => ramp(i, 5)); body.appendChild(C.distribution(vals, names, colors)); }
      return C.card(q.text, 'Nota de 0 a ' + q.max + ' · média ' + f1(avg(vals)) + '.', body);
    }
    if (q.type === 'number') {
      const lo = Math.min(...vals), hi = Math.max(...vals), pad = (hi - lo) * 0.1 || 1;
      const unit = q.unit ? ' ' + q.unit : '';
      body.appendChild(C.lineChart(rows, q.id, lo - pad, hi + pad, 5, (v) => f1(v) + unit, q.text));
      return C.card(q.text, 'Média ' + f1(avg(vals)) + unit + ' · mínimo ' + f1(lo) + ' · máximo ' + f1(hi) + '.', body);
    }
    // time of day
    const lo = Math.min(...vals), hi = Math.max(...vals), pad = (hi - lo) * 0.1 || 30;
    body.appendChild(C.lineChart(rows, q.id, lo - pad, hi + pad, 5, hhmm, q.text));
    return C.card(q.text, 'Horário médio ' + hhmm(avg(vals)) + '.', body);
  }

  function render() {
    const root = $('cdBody'); root.replaceChildren();
    C.state.width = Math.max(260, root.clientWidth - 2 - (window.innerWidth <= 700 ? 32 : 52));
    const sub = $('cdSub');
    if (!DATA.length) { sub.textContent = form.name; root.appendChild(mk('p', 'cd-empty', 'Nenhum registro ainda. Preencha o formulário para ver os gráficos.')); return; }
    sub.textContent = form.name + ' · ' + DATA.length + (DATA.length === 1 ? ' registro' : ' registros') + ' · ' + dayLabel(DATA[0].day) + (DATA.length > 1 ? ' a ' + dayLabel(DATA[DATA.length - 1].day) : '');
    const rows = DATA.map((r) => { const o = { day: r.day }; form.questions.forEach((q) => { o[q.id] = valueOf(q, r.answers[q.id]); }); return o; });
    const tiles = mk('div', 'cd-tiles cd-tiles3');
    const tile = (big, small) => { const t = mk('div', 'cd-tile'); t.append(mk('b', '', big), mk('small', '', small)); return t; };
    tiles.append(tile(String(DATA.length), DATA.length === 1 ? 'registro' : 'registros'), tile(String(form.questions.length), form.questions.length === 1 ? 'pergunta' : 'perguntas'), tile(dayLabel(DATA[DATA.length - 1].day), 'último registro'));
    root.appendChild(tiles);
    form.questions.forEach((q) => root.appendChild(questionCard(q, rows)));
  }

  async function init() {
    try {
      form = await api('checkin-forms/' + id);
      DATA = (await api('checkin-forms/' + id + '/responses')).items;
      $('cdBack').href = folderHref(form.folder);
      $('cdFill').href = 'checkin-preencher?id=' + id; $('cdEdit').href = 'checkin-editor?id=' + id + '&folder=' + encodeURIComponent(form.folder);
      document.title = 'Registros de ' + form.name + ' · Ignis';
      $('cdDel').addEventListener('click', () => CK.removeForm(form));
      render();
      let lastW = window.innerWidth;
      window.addEventListener('resize', () => { if (Math.abs(window.innerWidth - lastW) > 20) { lastW = window.innerWidth; render(); } });
    } catch (e) { $('cdBody').replaceChildren(mk('p', 'cd-empty', 'Não foi possível carregar os registros agora.')); }
  }
  init();
})();
