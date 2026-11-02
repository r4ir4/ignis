// Settings page: health of the wearable connections (last sync) and API tokens, backed by the shared ignis API.
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const make = (tag, cls, text) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  };

  async function api(path, options) {
    const init = options ? { method: options.method, headers: { 'Content-Type': 'application/json' }, body: options.body ? JSON.stringify(options.body) : undefined } : undefined;
    const res = await fetch('api' + path, init);
    if (!res.ok) {
      let detail = '';
      try { const body = await res.json(); if (typeof body.detail === 'string') detail = body.detail; } catch (e) { /* not json */ }
      throw new Error(detail || 'Something went wrong (' + res.status + ').');
    }
    return res.status === 204 ? null : res.json();
  }
  let toastTimer;
  function toast(text) {
    const el = $('toast');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2400);
  }

  const S = { data: null };
  const STATUS = { ok: 'Healthy', late: 'Running late', down: 'Not syncing', never: 'Never synced' };
  const when = (stamp) => (stamp ? new Date(stamp) : null);
  function ago(stamp) {
    const d = when(stamp);
    if (!d) return 'never';
    const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 86400) { const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60); return h + ' h' + (m ? ' ' + m + ' min' : '') + ' ago'; }
    const days = Math.floor(s / 86400);
    return days + (days === 1 ? ' day ago' : ' days ago');
  }
  const exact = (stamp) => { const d = when(stamp); return d ? d.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'No data received yet'; };
  const fmt = (n) => Number(n).toLocaleString();

  async function load(quiet) {
    try {
      S.data = await api('/v1/settings/overview');
      $('stEmpty').hidden = true;
      render(quiet);
    } catch (e) {
      if (!S.data) { $('stEmpty').textContent = 'Could not load settings. Reload to try again.'; $('stEmpty').hidden = false; }
    }
  }

  const SYNC = '<svg viewBox="0 0 40 40" aria-hidden="true"><g class="ar" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M31 15a12 12 0 0 0-21-3"/><path d="M10 5v7h7"/><path d="M9 25a12 12 0 0 0 21 3"/><path d="M30 35v-7h-7"/></g></svg>';

  function renderTop() {
    const c = S.data.connections;
    const top = $('stTop');
    top.replaceChildren();
    const word = make('figure', 'st-fig st-word grain');
    word.innerHTML = '<p class="st-wordt">Settings</p><svg class="st-tw" style="--x:88%;--y:12%;--s:22px;--d:0s" viewBox="0 0 32 32" aria-hidden="true"><use href="#spark"/></svg><svg class="st-tw st-tw-p" style="--x:74%;--y:66%;--s:16px;--d:1.1s" viewBox="0 0 32 32" aria-hidden="true"><use href="#spark"/></svg><svg class="st-tw" style="--x:50%;--y:10%;--s:12px;--d:2s" viewBox="0 0 32 32" aria-hidden="true"><use href="#spark"/></svg>';
    const row = make('div', 'st-wordrow');
    row.appendChild(make('small', '', 'Connections and access'));
    word.appendChild(row);

    const bad = c.filter((x) => x.status === 'down').length;
    const warn = c.filter((x) => x.status === 'late' || x.status === 'never').length;
    const sum = make('figure', 'st-fig st-sum ' + (bad ? 'bad' : warn ? 'warn' : ''));
    sum.appendChild(make('p', 'st-sumt', bad ? bad + (bad === 1 ? ' connection down' : ' connections down') : warn ? warn + (warn === 1 ? ' needs a look' : ' need a look') : 'All synced'));
    sum.appendChild(make('p', 'st-sums', bad ? 'A wearable has stopped sending data. Check the sync log on the server.' : warn ? 'Something is running late or has not connected yet.' : 'Every connection has sent data on schedule.'));
    const btn = make('button', 'st-btn');
    btn.type = 'button';
    btn.id = 'stRefresh';
    btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.4-5.7M20 4v5h-5"/></svg>Check again';
    btn.addEventListener('click', async () => { btn.classList.add('spin'); await load(true); setTimeout(() => btn.classList.remove('spin'), 400); toast('Updated'); });
    sum.appendChild(btn);
    top.append(word, sum);
  }

  function renderConnections(quiet) {
    const box = $('stCards');
    box.replaceChildren();
    S.data.connections.forEach((c, i) => {
      const li = make('li', 'st-cn ' + c.status);
      li.style.setProperty('--i', i);
      if (quiet) { li.style.animation = 'none'; li.style.opacity = '1'; li.style.transform = 'none'; }
      const top = make('div', 'st-cn-top');
      top.appendChild(make('h3', '', c.label));
      const ic = make('span', 'st-ic');
      ic.innerHTML = SYNC;
      top.appendChild(ic);
      const pill = make('span', 'st-pill');
      pill.append(make('i', 'st-dot'), document.createTextNode(STATUS[c.status]));
      const last = make('div', 'st-last');
      last.appendChild(make('small', '', 'Last sync'));
      const a = make('span', 'st-ago', ago(c.last_sync));
      a.dataset.t = c.last_sync || '';
      last.append(a, make('span', 'st-exact', exact(c.last_sync)));
      const meta = make('dl', 'st-meta');
      const item = (k, v) => { const d = make('div'); d.append(make('dt', '', k), make('dd', '', v)); meta.appendChild(d); };
      item('Readings', fmt(c.readings));
      item('Workouts', fmt(c.workouts));
      item('Newest reading', c.newest_reading ? exact(c.newest_reading) : '–');
      item('Last check-in', c.last_check ? ago(c.last_check) : '–');
      li.append(top, pill, make('p', 'st-what', c.what + ' · ' + c.cadence), last, meta);
      box.appendChild(li);
    });
  }

  let armed = { name: null, timer: 0 };
  function renderTokens() {
    const box = $('stToks');
    box.replaceChildren();
    if (!S.data.tokens.length) { box.appendChild(make('li', 'st-empty', 'No device tokens yet. Generate one for your iPhone, iPad or a script.')); return; }
    S.data.tokens.forEach((t) => {
      const li = make('li', 'st-tk');
      const n = make('span', 'st-tn');
      n.appendChild(make('b', '', t.name));
      n.appendChild(make('span', 'st-tag' + (t.origin === 'server' ? ' srv' : ''), t.origin === 'server' ? 'server' : 'web'));
      const ts = make('span', 'st-ts', (t.last_seen ? 'Used ' + ago(t.last_seen) : 'Never used') + (t.created_at ? ' · made ' + exact(t.created_at) : ''));
      const rev = make('button', 'st-rev', t.origin === 'server' ? 'Server' : 'Revoke');
      rev.type = 'button';
      if (t.origin === 'server') { rev.disabled = true; rev.title = 'Managed on the server with new-token.sh'; }
      else rev.addEventListener('click', async () => {
        if (armed.name !== t.name) {
          clearTimeout(armed.timer);
          armed = { name: t.name, timer: setTimeout(() => { armed = { name: null, timer: 0 }; rev.classList.remove('sure'); rev.textContent = 'Revoke'; }, 4000) };
          rev.classList.add('sure'); rev.textContent = 'Sure?';
          return;
        }
        clearTimeout(armed.timer); armed = { name: null, timer: 0 };
        try { await api('/v1/settings/tokens/' + encodeURIComponent(t.name), { method: 'DELETE' }); toast('Token revoked'); await load(true); } catch (e) { toast(e.message); }
      });
      li.append(n, ts, rev);
      box.appendChild(li);
    });
  }

  function render(quiet) {
    renderTop();
    renderConnections(quiet);
    renderTokens();
  }

  // ---- new token dialog -------------------------------------------------------------------------------------------------------------------
  let made = false;
  function openToken() {
    made = false;
    $('stTokTitle').textContent = 'New token';
    $('stTokAsk').hidden = false;
    $('stTokShow').hidden = true;
    $('stTokErr').hidden = true;
    $('stTokName').value = '';
    const save = $('stTokSave');
    save.disabled = false;
    save.querySelector('span').textContent = 'Generate token';
    $('stTokDialog').showModal();
    $('stTokName').focus();
  }
  async function saveToken(event) {
    event.preventDefault();
    if (made) { $('stTokDialog').close(); return; }
    const err = $('stTokErr');
    err.hidden = true;
    const name = $('stTokName').value.trim().toLowerCase();
    if (!/^[a-z0-9-]{1,32}$/.test(name)) { err.textContent = 'Use lowercase letters, digits and dashes (up to 32).'; err.hidden = false; return; }
    $('stTokSave').disabled = true;
    try {
      const r = await api('/v1/settings/tokens', { method: 'POST', body: { name } });
      made = true;
      $('stTokTitle').textContent = 'Token for ' + r.name;
      $('stTokAsk').hidden = true;
      $('stTokShow').hidden = false;
      $('stTokVal').textContent = r.token;
      $('stTokCopy').textContent = 'Copy token';
      $('stTokSave').disabled = false;
      $('stTokSave').querySelector('span').textContent = 'Done';
      await load(true);
    } catch (e) {
      err.textContent = e.message;
      err.hidden = false;
      $('stTokSave').disabled = false;
    }
  }
  async function copyToken() {
    const text = $('stTokVal').textContent;
    try { await navigator.clipboard.writeText(text); $('stTokCopy').textContent = 'Copied'; }
    catch (e) {
      const r = document.createRange(); r.selectNodeContents($('stTokVal'));
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      $('stTokCopy').textContent = 'Selected: press copy';
    }
  }

  function init() {
    $('stGrid').innerHTML = '<div class="identity st-board">'
      + '<div class="st-top" id="stTop"></div>'
      + '<figure class="st-fig st-cardsc"><div class="st-head"><p class="st-k">Connections</p></div><ul class="st-cards" id="stCards"></ul></figure>'
      + '<figure class="st-fig st-tokc"><div class="st-head"><p class="st-k">Access tokens</p><button type="button" class="st-btn" id="stNewTok"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>New token</button></div><ul class="st-toks" id="stToks"></ul></figure>'
      + '</div>';
    $('stNewTok').addEventListener('click', openToken);
    $('stTokClose').addEventListener('click', () => $('stTokDialog').close());
    $('stTokDialog').addEventListener('click', (e) => { if (e.target === $('stTokDialog')) $('stTokDialog').close(); });
    $('stTokForm').addEventListener('submit', saveToken);
    $('stTokCopy').addEventListener('click', copyToken);
    load(false);
    setInterval(() => { if (!document.hidden) load(true); }, 60000);
    setInterval(() => { document.querySelectorAll('.st-ago').forEach((el) => { if (el.dataset.t) el.textContent = ago(el.dataset.t); }); }, 20000);
  }
  init();
})();
