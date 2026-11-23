// A confirmation dialog for deleting things, shared by every page: IgnisConfirm.ask({ title, text, ok }) resolves true when
// the person confirms and false when they cancel, close it or click outside. Replaces "tap again to delete" and confirm().
(() => {
  'use strict';
  let dlg = null;
  function build() {
    dlg = document.createElement('dialog');
    dlg.className = 'ig-confirm';
    dlg.setAttribute('aria-labelledby', 'igConfirmTitle');
    dlg.setAttribute('lang', 'pt-BR');
    dlg.innerHTML = '<form method="dialog" novalidate><header><h2 id="igConfirmTitle"></h2><button type="button" class="ig-confirm-x" aria-label="Fechar"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></header>'
      + '<p class="ig-confirm-text"></p><div class="ig-confirm-acts"><button type="button" class="ig-confirm-cancel">Cancelar</button><button type="button" class="ig-confirm-ok">Apagar</button></div></form>';
    document.body.appendChild(dlg);
  }
  function ask(opts) {
    opts = opts || {};
    if (!dlg) build();
    dlg.querySelector('#igConfirmTitle').textContent = opts.title || 'Apagar';
    dlg.querySelector('.ig-confirm-text').textContent = opts.text || 'Isso não pode ser desfeito.';
    const ok = dlg.querySelector('.ig-confirm-ok'), cancel = dlg.querySelector('.ig-confirm-cancel'), x = dlg.querySelector('.ig-confirm-x');
    ok.textContent = opts.ok || 'Apagar';
    return new Promise((resolve) => {
      let answer = false;
      const finish = (v) => { answer = v; if (dlg.open) dlg.close(); };
      const onClick = (e) => { if (e.target === dlg) finish(false); };
      const onClose = () => { dlg.removeEventListener('click', onClick); dlg.removeEventListener('close', onClose); ok.onclick = cancel.onclick = x.onclick = null; resolve(answer); };
      ok.onclick = () => finish(true); cancel.onclick = () => finish(false); x.onclick = () => finish(false);
      dlg.addEventListener('click', onClick); dlg.addEventListener('close', onClose);
      dlg.showModal(); cancel.focus();
    });
  }
  window.IgnisConfirm = { ask };
})();
