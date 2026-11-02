(() => {
  'use strict';

  const PAGE = 30;
  const $ = (sel) => document.querySelector(sel);
  const listEl = $('#list');
  const emptyEl = $('#empty');
  const moreBtn = $('#more');
  const statusEl = $('#status');
  const countEl = $('#count');
  const searchEl = $('#q');
  const dlg = $('#dlg');
  const textEl = $('#text');
  const formErr = $('#formErr');
  const saveBtn = $('#save');
  const toastEl = $('#toast');

  let items = [];
  let query = '';
  let exhausted = false;
  let loading = false;
  let toastTimer;

  // The page and the API share one origin; nginx adds the credentials the backend needs.
  async function api(path, options = {}) {
    let res;
    try {
      res = await fetch('api' + path, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
      });
    } catch (e) {
      throw new Error('Could not reach the server. If you were signed out, reload the page.');
    }
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json()).detail || ''; } catch (e) { /* no body */ }
      throw new Error(detail || 'Server error ' + res.status);
    }
    return res.status === 204 ? null : res.json();
  }

  function showStatus(message) {
    statusEl.textContent = message || '';
    statusEl.hidden = !message;
  }

  function toast(message) {
    toastEl.textContent = message;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 1800);
  }

  async function load(reset) {
    if (loading) return;
    loading = true;
    try {
      const params = new URLSearchParams({ limit: String(PAGE) });
      if (query) params.set('q', query);
      if (!reset && items.length) params.set('before', items[items.length - 1].created_at);
      const page = await api('/v1/scans?' + params);
      items = reset ? page : items.concat(page);
      exhausted = page.length < PAGE;
      showStatus('');
    } catch (e) {
      showStatus(e.message);
    } finally {
      loading = false;
      render();
    }
  }

  function when(iso) {
    const d = new Date(iso);
    return d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  }

  function render() {
    listEl.replaceChildren(...items.map(card));
    moreBtn.hidden = exhausted || !items.length;
    countEl.textContent = items.length ? items.length + (exhausted ? '' : '+') + ' shown' : '';
    emptyEl.hidden = items.length > 0 || !!statusEl.textContent;
    if (!emptyEl.hidden) {
      emptyEl.textContent = query
        ? 'No scans match “' + query + '”.'
        : 'No scans yet. Take a photo of some text in the Ignis app, or add one here.';
    }
  }

  function card(scan) {
    const li = document.createElement('li');
    li.className = 'card';

    const body = document.createElement('p');
    body.className = 'body';
    body.textContent = scan.text;

    const foot = document.createElement('div');
    foot.className = 'foot';

    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = scan.device;

    const time = document.createElement('time');
    time.dateTime = scan.created_at;
    time.textContent = when(scan.created_at);

    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'ghost';
    copy.textContent = 'Copy';
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(scan.text);
        toast('Copied');
      } catch (e) {
        toast('Could not copy');
      }
    });

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'ghost danger';
    del.textContent = 'Delete';
    let disarm;
    del.addEventListener('click', async () => {
      if (!del.classList.contains('armed')) {
        del.classList.add('armed');
        del.textContent = 'Really delete?';
        disarm = setTimeout(() => {
          del.classList.remove('armed');
          del.textContent = 'Delete';
        }, 3000);
        return;
      }
      clearTimeout(disarm);
      del.disabled = true;
      try {
        await api('/v1/scans/' + encodeURIComponent(scan.id), { method: 'DELETE' });
        items = items.filter((s) => s.id !== scan.id);
        render();
        toast('Deleted');
      } catch (e) {
        del.disabled = false;
        showStatus(e.message);
      }
    });

    foot.append(badge, time, copy, del);
    li.append(body, foot);
    return li;
  }

  // search
  let searchTimer;
  searchEl.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      query = searchEl.value.trim();
      load(true);
    }, 300);
  });
  moreBtn.addEventListener('click', () => load(false));

  // new scan dialog
  function openDialog() {
    textEl.value = '';
    formErr.hidden = true;
    saveBtn.disabled = false;
    dlg.showModal();
    textEl.focus();
  }

  async function save() {
    const text = textEl.value.trim();
    if (!text) {
      formErr.textContent = 'Write something first.';
      formErr.hidden = false;
      return;
    }
    saveBtn.disabled = true;
    try {
      await api('/v1/scans', { method: 'POST', body: JSON.stringify({ text }) });
      dlg.close();
      toast('Saved');
      load(true);
    } catch (e) {
      formErr.textContent = e.message;
      formErr.hidden = false;
      saveBtn.disabled = false;
    }
  }

  $('#newBtn').addEventListener('click', openDialog);
  $('#cancel').addEventListener('click', () => dlg.close());
  $('#form').addEventListener('submit', (e) => { e.preventDefault(); save(); });
  textEl.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); save(); }
  });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });

  // Pick up scans made on the phone when you come back to this tab.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !dlg.open) load(true);
  });

  load(true);
})();
