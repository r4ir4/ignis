// The Check-in home: every folder (all of them are stored, so all can be renamed or deleted) and a tile to make a new one.
(() => {
  'use strict';
  const { api, tile, folderDialog, folderHref, plural } = CK;
  const grid = document.querySelector('.ck-grid');
  if (!grid) return;

  async function init() {
    let folders = [], forms = [];
    try { folders = (await api('checkin-folders')).items; forms = (await api('checkin-forms')).items; }
    catch (e) { return; }
    const count = (id) => forms.filter((f) => f.folder === id).length;
    const label = (n) => (n ? plural(n, 'formulário', 'formulários') : '0 formulários ainda');
    grid.replaceChildren();
    folders.forEach((f, i) => grid.appendChild(tile({ i, kind: 'folder', href: folderHref(f.id), name: f.name, sub: label(count(f.id)), label: 'Abrir a pasta ' + f.name }).li));

    const { li, a } = tile({ i: folders.length, kind: 'new', button: true, name: 'Nova pasta', label: 'Criar uma nova pasta' });
    a.addEventListener('click', async () => {
      const r = await folderDialog({ title: 'Nova pasta', submit: 'Criar pasta' });
      if (!r) return;
      try { const f = await api('checkin-folders', 'POST', r); location.href = folderHref(f.id); }
      catch (e) { CK.notice('Não foi possível criar a pasta', e.message); }
    });
    grid.appendChild(li);
  }
  init();
})();
