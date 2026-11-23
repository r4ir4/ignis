// Home header ("Hoje") and the four summary numbers. The numbers are copied from the blocks that load their own data (tasks, medication
// levels, meals, bills), so this file only reads the page and never fetches anything itself.
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const now = new Date();
  const left = Math.max(0, Math.ceil((new Date(now.getFullYear() + 1, 0, 1) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000));
  const weekday = now.toLocaleDateString('pt-BR', { weekday: 'long' });
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  $('hmTitle').textContent = cap(weekday);
  $('hmSub').textContent = now.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }) + ' · faltam ' + left + (left === 1 ? ' dia' : ' dias') + ' para o ano acabar';
  const txt = (id) => { const e = $(id); return e ? e.textContent.trim() : ''; };
  const set = (id, v) => { const e = $(id); if (e && e.textContent !== v) e.textContent = v; };
  function sync() {
    set('stTasks', txt('tkNum') || '–'); set('stTasksN', txt('tkGoal') || txt('tkUnit'));
    const v = txt('medV'), r = txt('medR');
    set('stLevel', v && v !== '–' ? v : '–'); set('stLevelN', v && v !== '–' ? 'Venvanse' + (r && r !== '–' ? ' · Ritalina ' + r : '') : '');
    const kcal = txt('hmKcal'); set('stKcal', kcal || '–'); set('stKcalN', txt('hmGoal'));
    const b = document.querySelector('#glBills b'), s = document.querySelector('#glBills small');
    set('stBills', b ? b.textContent.trim() : '–'); set('stBillsN', s ? s.textContent.trim() : '');
  }
  sync();
  const watch = ['tkNum', 'tkGoal', 'tkUnit', 'medV', 'medR', 'hmKcal', 'hmGoal', 'glBills'].map($).filter(Boolean);
  const mo = new MutationObserver(sync);
  watch.forEach((e) => mo.observe(e, { childList: true, characterData: true, subtree: true }));
  setInterval(sync, 2000);
})();
