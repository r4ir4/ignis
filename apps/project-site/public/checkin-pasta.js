// A check-in folder page: the forms you made in it, a tile to make a new one, and (for folders you created) rename / delete.
(() => {
  'use strict';
  const { api, query, renderForms, folderDialog } = CK;
  const $ = (x) => document.getElementById(x);
  const id = query('id');
  const grid = document.getElementById('ckGrid'), title = document.getElementById('ckTitle'), note = document.getElementById('ckNote');
  let folder = null;

  async function load() {
    if (!id) { note.textContent = 'Pasta não encontrada.'; return; }
    try {
      const list = await api('checkin-folders');
      const f = list.items.find((x) => x.id === id);
      if (!f) { note.textContent = 'Essa pasta não existe mais.'; title.textContent = 'Pasta'; return; }
      folder = f;
      title.textContent = folder.name; document.title = folder.name + ' · Check-in · Ignis';
      grid.replaceChildren();
      const forms = await renderForms(grid, id, 0);
      note.hidden = true;
      renderTools(forms.length);
    } catch (e) {
      note.hidden = false; note.textContent = 'Não foi possível carregar a pasta agora.';
    }
  }

  // the folder's own icons (top right): change its name, or delete it
  function renderTools(count) {
    $('ckIcons').hidden = false;
    $('ckRename').onclick = async () => {
      const r = await folderDialog({ title: 'Alterar nome da pasta', name: folder.name, color: folder.color });
      if (!r) return;
      try { folder = await api('checkin-folders/' + id, 'PATCH', r); title.textContent = folder.name; document.title = folder.name + ' · Check-in · Ignis'; }
      catch (e) { CK.notice('Não foi possível alterar a pasta', e.message); }
    };
    $('ckDelete').onclick = async () => {
      if (count) { CK.notice('A pasta ainda tem formulários', 'Remova os formulários dela antes de excluir a pasta.'); return; }
      if (!await CK.ask({ title: 'Excluir a pasta "' + folder.name + '"?', text: 'A pasta está vazia e será removida.', ok: 'Excluir', danger: true })) return;
      try { await api('checkin-folders/' + id, 'DELETE'); location.href = 'checkin'; } catch (e) { CK.notice('Não foi possível excluir', e.message); }
    };
  }
  load();
})();
