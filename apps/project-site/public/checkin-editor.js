// Form editor: a name, a description and a list of questions of six types. Saves to the API; existing answers keep working because question ids never change.
(() => {
  'use strict';
  const { mk, api, query, folderHref } = CK;
  const $ = (id) => document.getElementById(id);
  const TYPES = [['choice', 'Escolha única'], ['scale', 'Escala numérica'], ['yesno', 'Sim ou não'], ['number', 'Número'], ['time', 'Horário'], ['text', 'Texto livre']];
  const formId = query('id');
  const state = { folder: query('folder') || '', name: '', description: '', questions: [] };
  let seq = 0;

  const nextId = () => { seq += 1; while (state.questions.some((q) => q.id === 'q' + seq)) seq += 1; return 'q' + seq; };
  const blank = (type) => {
    const q = { id: nextId(), type: type || 'scale', text: '' };
    if (q.type === 'choice') q.optionsText = 'Sim\nMais ou menos\nNão';
    if (q.type === 'scale') q.max = 4;
    return q;
  };
  const err = $('edErr');
  const showErr = (m) => { err.textContent = m; err.hidden = !m; };

  function field(label, input, hint) {
    const l = mk('label', 'ed-field'); l.appendChild(mk('span', '', label)); l.appendChild(input); if (hint) l.appendChild(mk('small', '', hint)); return l;
  }
  function textInput(value, ph, max, onInput) {
    const i = mk('input'); i.type = 'text'; i.value = value || ''; i.placeholder = ph || ''; i.maxLength = max || 200; i.addEventListener('input', () => onInput(i.value)); return i;
  }

  function renderQuestions() {
    const list = $('edList'); list.replaceChildren();
    state.questions.forEach((q, i) => {
      const card = mk('li', 'ed-q');
      const head = mk('div', 'ed-qhead');
      head.appendChild(mk('b', '', String(i + 1)));
      const sel = mk('select'); TYPES.forEach(([v, l]) => { const o = mk('option', '', l); o.value = v; if (v === q.type) o.selected = true; sel.appendChild(o); });
      sel.setAttribute('aria-label', 'Tipo da pergunta ' + (i + 1));
      sel.addEventListener('change', () => { q.type = sel.value; if (q.type === 'choice' && !q.optionsText) q.optionsText = 'Sim\nNão'; if (q.type === 'scale' && !q.max) q.max = 4; renderQuestions(); });
      const tools = mk('div', 'ed-qtools');
      const btn = (label, aria, fn, disabled) => { const b = mk('button', 'ed-icon', label); b.type = 'button'; b.setAttribute('aria-label', aria); b.disabled = !!disabled; b.addEventListener('click', fn); return b; };
      tools.append(
        btn('↑', 'Subir pergunta', () => { state.questions.splice(i - 1, 0, state.questions.splice(i, 1)[0]); renderQuestions(); }, i === 0),
        btn('↓', 'Descer pergunta', () => { state.questions.splice(i + 1, 0, state.questions.splice(i, 1)[0]); renderQuestions(); }, i === state.questions.length - 1),
        btn('✕', 'Remover pergunta', () => { state.questions.splice(i, 1); renderQuestions(); }, false));
      head.append(sel, tools);
      card.append(head, field('Pergunta', textInput(q.text, 'Ex.: Como foi meu foco hoje?', 200, (v) => { q.text = v; })));

      if (q.type === 'choice') {
        const ta = mk('textarea'); ta.rows = 4; ta.value = q.optionsText || ''; ta.placeholder = 'Uma opção por linha'; ta.addEventListener('input', () => { q.optionsText = ta.value; });
        card.appendChild(field('Opções', ta, 'Uma por linha, de 2 a 10. A primeira fica no topo dos gráficos.'));
      } else if (q.type === 'scale') {
        const s = mk('select'); [[4, '0 a 4'], [10, '0 a 10']].forEach(([v, l]) => { const o = mk('option', '', l); o.value = String(v); if (+q.max === v) o.selected = true; s.appendChild(o); });
        s.addEventListener('change', () => { q.max = +s.value; });
        card.appendChild(field('Escala', s));
      } else if (q.type === 'yesno') {
        card.appendChild(field('Detalhe quando for "Sim" (opcional)', textInput(q.ask, 'Ex.: Qual?', 60, (v) => { q.ask = v; })));
      } else if (q.type === 'number') {
        card.appendChild(field('Unidade (opcional)', textInput(q.unit, 'Ex.: horas, mg, copos', 12, (v) => { q.unit = v; })));
      }
      list.appendChild(card);
    });
    $('edEmpty').hidden = state.questions.length > 0;
  }

  function payload() {
    const questions = state.questions.map((q) => {
      const o = { id: q.id, type: q.type, text: q.text.trim() };
      if (q.type === 'choice') o.options = (q.optionsText || '').split('\n').map((x) => x.trim()).filter(Boolean);
      if (q.type === 'scale') o.max = +q.max || 4;
      if (q.type === 'yesno' && (q.ask || '').trim()) o.ask = q.ask.trim();
      if (q.type === 'number' && (q.unit || '').trim()) o.unit = q.unit.trim();
      return o;
    });
    return { folder: state.folder, name: state.name.trim(), description: state.description.trim(), questions };
  }
  function validate(p) {
    if (!p.name) return 'Dê um nome ao formulário.';
    if (!p.questions.length) return 'Adicione pelo menos uma pergunta.';
    for (let i = 0; i < p.questions.length; i++) {
      const q = p.questions[i];
      if (!q.text) return 'A pergunta ' + (i + 1) + ' está sem texto.';
      if (q.type === 'choice' && (q.options.length < 2 || q.options.length > 10)) return 'A pergunta ' + (i + 1) + ' precisa de 2 a 10 opções.';
    }
    return '';
  }

  async function save() {
    const p = payload(), problem = validate(p);
    if (problem) { showErr(problem); return; }
    showErr(''); const btn = $('edSave'); btn.disabled = true; btn.textContent = 'Salvando...';
    try {
      if (formId) await api('checkin-forms/' + formId, 'PUT', p); else await api('checkin-forms', 'POST', p);
      location.href = folderHref(state.folder);
    } catch (e) { btn.disabled = false; btn.textContent = 'Salvar formulário'; showErr('Não foi possível salvar: ' + e.message); }
  }

  async function init() {
    $('edAdd').addEventListener('click', () => { state.questions.push(blank('scale')); renderQuestions(); const items = $('edList').children; items[items.length - 1].querySelector('input').focus(); });
    $('edSave').addEventListener('click', save);
    $('edName').addEventListener('input', (e) => { state.name = e.target.value; });
    $('edDesc').addEventListener('input', (e) => { state.description = e.target.value; });
    if (formId) {
      try {
        const f = await api('checkin-forms/' + formId);
        state.folder = f.folder; state.name = f.name; state.description = f.description;
        state.questions = f.questions.map((q) => Object.assign({}, q, { optionsText: (q.options || []).join('\n') }));
        $('edName').value = f.name; $('edDesc').value = f.description; $('edTitle').textContent = 'Editar formulário';
        $('edArchive').hidden = false;
        $('edArchive').addEventListener('click', async () => {
          if (!await CK.ask({ title: 'Arquivar "' + f.name + '"?', text: 'Ele some da pasta, mas as respostas já dadas continuam guardadas.', ok: 'Arquivar', danger: true })) return;
          try { await api('checkin-forms/' + formId, 'DELETE'); location.href = folderHref(state.folder); } catch (e) { showErr(e.message); }
        });
      } catch (e) { showErr('Não foi possível abrir o formulário.'); $('edSave').disabled = true; return; }
    } else {
      $('edTitle').textContent = 'Novo formulário';
      if (!state.folder) { showErr('Abra o editor a partir de uma pasta.'); $('edSave').disabled = true; }
      state.questions.push(blank('scale'));
    }
    $('edBack').href = folderHref(state.folder || 'meds');
    renderQuestions();
  }
  init();
})();
