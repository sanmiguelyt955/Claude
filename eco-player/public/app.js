// Eco: interfaz, reproductor y conexión con la parte online.
'use strict';

const $ = (id) => document.getElementById(id);
const audio = $('audio');

function fmt(sec) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const s = Math.floor(sec % 60), m = Math.floor(sec / 60) % 60, h = Math.floor(sec / 3600);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

function fmtBytes(n) {
  if (n == null) return '?';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i ? 1 : 0)} ${u[i]}`;
}

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children) if (c != null) e.append(c);
  return e;
}

// ---------- Pestañas ----------
function showView(name) {
  for (const b of document.querySelectorAll('.tabs [role=tab]')) b.setAttribute('aria-selected', String(b.dataset.view === name));
  for (const v of document.querySelectorAll('.view')) v.hidden = v.id !== `view-${name}`;
  if (name === 'soundcloud') SC.enter();
  history.replaceState(null, '', location.pathname + location.search + (name === 'soundcloud' ? '#soundcloud' : ''));
}
for (const b of document.querySelectorAll('.tabs [role=tab]')) b.addEventListener('click', () => showView(b.dataset.view));

function showSub(name) {
  for (const b of document.querySelectorAll('[data-sub]')) b.setAttribute('aria-pressed', String(b.dataset.sub === name));
  for (const s of document.querySelectorAll('#view-local .sub')) s.hidden = s.id !== `sub-${name}`;
  if (name === 'import') renderStorage();
  if (name === 'lists') Lists.render();
}
for (const b of document.querySelectorAll('[data-sub]')) b.addEventListener('click', () => showSub(b.dataset.sub));

function renderNet() {
  const on = navigator.onLine;
  $('net').textContent = on ? 'En línea' : 'Sin conexión';
  $('net').classList.toggle('off', !on);
  if (!$('view-soundcloud').hidden) SC.enter();
}
addEventListener('online', renderNet);
addEventListener('offline', renderNet);

// ---------- Reproductor ----------
// Cada elemento de la cola: { kind: 'local'|'sc', id, title, artist, duration, artwork?, permalink_url? }
const Player = {
  queue: [], index: -1, repeat: false, objectUrl: null, artUrl: null, hls: null,

  async playQueue(items, start = 0, shuffle = false) {
    if (!items.length) return;
    let q = items.slice();
    if (shuffle) {
      for (let i = q.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [q[i], q[j]] = [q[j], q[i]]; }
      start = 0;
    }
    this.queue = q;
    await this.load(start);
  },

  release() {
    if (this.hls) { this.hls.destroy(); this.hls = null; }
    if (this.objectUrl) { URL.revokeObjectURL(this.objectUrl); this.objectUrl = null; }
    if (this.artUrl) { URL.revokeObjectURL(this.artUrl); this.artUrl = null; }
  },

  async load(i) {
    if (i < 0 || i >= this.queue.length) return;
    this.index = i;
    const item = this.queue[i];
    this.release();
    audio.removeAttribute('src');
    let art = item.artwork || 'icon.svg';
    try {
      if (item.kind === 'local') {
        const blob = await LocalLibrary.getFile(item.id);
        if (!blob) throw new Error('Archivo no encontrado');
        this.objectUrl = URL.createObjectURL(blob);
        audio.src = this.objectUrl;
        if (item.hasArt) {
          const a = await LocalLibrary.getArt(item.id);
          if (a) art = this.artUrl = URL.createObjectURL(a);
        }
      } else {
        if (!navigator.onLine) throw new Error('Las pistas de SoundCloud necesitan conexión');
        await this.attachHls(`/play/${encodeURIComponent(item.id)}/index.m3u8`);
      }
      this.renderNowPlaying(item, art);
      await audio.play();
    } catch (e) {
      console.error(e);
      toast(e.message || 'No se pudo reproducir');
      this.renderNowPlaying(item, art);
    }
    highlightPlaying();
  },

  async attachHls(src) {
    if (audio.canPlayType('application/vnd.apple.mpegurl')) { audio.src = src; return; }
    const Hls = await loadHlsJs();
    if (!Hls.isSupported()) throw new Error('Este navegador no puede reproducir HLS');
    this.hls = new Hls();
    this.hls.on(Hls.Events.ERROR, (_, data) => {
      if (data.fatal) { toast('Error de reproducción'); console.error(data); }
    });
    this.hls.loadSource(src);
    this.hls.attachMedia(audio);
  },

  renderNowPlaying(item, art) {
    $('player').hidden = false;
    document.body.classList.add('has-player');
    $('np-title').textContent = item.title;
    $('np-artist').textContent = item.artist || '';
    $('np-art').src = art;
    $('np-dur').textContent = fmt(item.duration);
    const link = $('np-link');
    link.hidden = item.kind !== 'sc';
    if (item.kind === 'sc') link.href = item.permalink_url;
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: item.title, artist: item.artist || '', album: item.album || '',
        artwork: [{ src: new URL(art, location.href).href }],
      });
    }
  },

  next(auto = false) {
    if (this.index + 1 < this.queue.length) return this.load(this.index + 1);
    if (this.repeat && this.queue.length) return this.load(0);
    if (auto) audio.pause();
  },

  prev() {
    if (audio.currentTime > 3 || this.index <= 0) { audio.currentTime = 0; return; }
    return this.load(this.index - 1);
  },

  current() { return this.queue[this.index]; },
};

let hlsPromise = null;
function loadHlsJs() {
  if (!hlsPromise) {
    hlsPromise = new Promise((resolve, reject) => {
      const s = el('script', { src: 'https://cdn.jsdelivr.net/npm/hls.js@1.5.15/dist/hls.min.js' });
      s.onload = () => resolve(window.Hls);
      s.onerror = () => { hlsPromise = null; reject(new Error('No se pudo cargar el reproductor HLS')); };
      document.head.append(s);
    });
  }
  return hlsPromise;
}

$('btn-play').addEventListener('click', () => { if (audio.paused) audio.play().catch(() => {}); else audio.pause(); });
$('btn-next').addEventListener('click', () => Player.next());
$('btn-prev').addEventListener('click', () => Player.prev());
$('btn-repeat').addEventListener('click', (e) => {
  Player.repeat = !Player.repeat;
  e.currentTarget.setAttribute('aria-pressed', String(Player.repeat));
});
audio.addEventListener('play', () => { $('btn-play').textContent = '⏸'; $('btn-play').setAttribute('aria-label', 'Pausa'); });
audio.addEventListener('pause', () => { $('btn-play').textContent = '▶'; $('btn-play').setAttribute('aria-label', 'Reproducir'); });
audio.addEventListener('ended', () => Player.next(true));
audio.addEventListener('loadedmetadata', () => { if (Number.isFinite(audio.duration)) $('np-dur').textContent = fmt(audio.duration); });
let seeking = false;
audio.addEventListener('timeupdate', () => {
  $('np-time').textContent = fmt(audio.currentTime);
  if (!seeking && audio.duration) $('np-seek').value = String(Math.round((audio.currentTime / audio.duration) * 1000));
  if ('mediaSession' in navigator && audio.duration && Number.isFinite(audio.duration)) {
    try { navigator.mediaSession.setPositionState({ duration: audio.duration, position: audio.currentTime, playbackRate: audio.playbackRate }); } catch { /* opcional */ }
  }
});
$('np-seek').addEventListener('input', () => { seeking = true; });
$('np-seek').addEventListener('change', (e) => {
  seeking = false;
  if (audio.duration) audio.currentTime = (Number(e.target.value) / 1000) * audio.duration;
});

if ('mediaSession' in navigator) {
  const ms = navigator.mediaSession;
  ms.setActionHandler('play', () => audio.play());
  ms.setActionHandler('pause', () => audio.pause());
  ms.setActionHandler('previoustrack', () => Player.prev());
  ms.setActionHandler('nexttrack', () => Player.next());
  try { ms.setActionHandler('seekto', (d) => { audio.currentTime = d.seekTime; }); } catch { /* opcional */ }
}

function highlightPlaying() {
  const cur = Player.current();
  for (const li of document.querySelectorAll('.tracks li[data-id]')) {
    li.classList.toggle('playing', Boolean(cur) && li.dataset.id === cur.id);
  }
}

let toastTimer;
function toast(msg) {
  let t = document.querySelector('.toast');
  if (!t) { t = el('div', { class: 'toast', role: 'status' }); document.body.append(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
}

// ---------- Biblioteca local ----------
const Local = {
  tracks: [],
  artUrls: new Map(),

  async refresh() {
    this.tracks = await LocalLibrary.allTracks();
    this.render();
  },

  visible() {
    const q = $('search').value.trim().toLowerCase();
    let list = this.tracks.filter((t) => !q || `${t.title} ${t.artist} ${t.album}`.toLowerCase().includes(q));
    const by = $('sort').value;
    const cmp = (a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' });
    if (by === 'title') list.sort((a, b) => cmp(a.title, b.title));
    else if (by === 'artist') list.sort((a, b) => cmp(a.artist, b.artist) || cmp(a.title, b.title));
    else list.sort((a, b) => b.added - a.added);
    return list;
  },

  item(t) { return { kind: 'local', ...t }; },

  async art(t) {
    if (!t.hasArt) return 'icon.svg';
    if (!this.artUrls.has(t.id)) {
      const blob = await LocalLibrary.getArt(t.id);
      this.artUrls.set(t.id, blob ? URL.createObjectURL(blob) : 'icon.svg');
    }
    return this.artUrls.get(t.id);
  },

  row(t, list, i, extra) {
    const img = el('img', { alt: '', width: 44, height: 44, loading: 'lazy', src: 'icon.svg' });
    this.art(t).then((src) => { img.src = src; });
    const li = el('li', { 'data-id': t.id },
      img,
      el('button', { class: 'meta', onclick: () => Player.playQueue(list.map((x) => this.item(x)), i) },
        el('span', { class: 'title' }, t.title),
        el('span', { class: 'artist' }, [t.artist, t.album].filter(Boolean).join(' · '))),
      el('span', { class: 'dur' }, fmt(t.duration)),
      extra || el('button', { class: 'icon', 'aria-label': `Opciones de ${t.title}`, onclick: () => this.menu(t) }, '⋯'));
    return li;
  },

  render() {
    const list = this.visible();
    const ul = $('local-list');
    ul.replaceChildren(...list.map((t, i) => this.row(t, list, i)));
    $('local-empty').hidden = this.tracks.length > 0;
    const total = this.tracks.reduce((s, t) => s + (t.duration || 0), 0);
    $('count').textContent = this.tracks.length ? `${this.tracks.length} ${this.tracks.length === 1 ? "canción" : "canciones"} · ${fmt(total)}` : '';
    highlightPlaying();
  },

  async menu(t) {
    const lists = await LocalLibrary.allLists();
    const opts = $('add-options');
    const dlg = $('add-dialog');
    opts.replaceChildren(
      ...lists.map((l) => el('li', {}, el('button', {
        onclick: async () => {
          if (!l.trackIds.includes(t.id)) await LocalLibrary.saveList({ ...l, trackIds: [...l.trackIds, t.id] });
          dlg.close(); toast(`Añadida a «${l.name}»`);
        },
      }, l.name))),
      el('li', {}, el('button', {
        onclick: async () => {
          const name = prompt('Nombre de la nueva lista');
          if (!name) return;
          const l = await LocalLibrary.createList(name.trim().slice(0, 80));
          await LocalLibrary.saveList({ ...l, trackIds: [t.id] });
          dlg.close(); toast(`Añadida a «${l.name}»`);
        },
      }, '+ Nueva lista')),
      el('li', {}, el('button', {
        class: 'danger',
        onclick: async () => {
          if (!confirm(`¿Borrar «${t.title}» de este dispositivo?`)) return;
          await LocalLibrary.removeTrack(t.id);
          dlg.close(); await this.refresh();
        },
      }, 'Borrar del dispositivo')),
    );
    dlg.querySelector('h3').textContent = t.title;
    dlg.showModal();
  },
};

$('search').addEventListener('input', () => Local.render());
$('sort').addEventListener('change', () => Local.render());
$('play-all').addEventListener('click', () => { const l = Local.visible(); Player.playQueue(l.map((t) => Local.item(t))); });
$('shuffle-all').addEventListener('click', () => { const l = Local.visible(); Player.playQueue(l.map((t) => Local.item(t)), 0, true); });

// ---------- Listas locales ----------
const Lists = {
  open: null,
  async render() {
    const lists = (await LocalLibrary.allLists()).sort((a, b) => b.created - a.created);
    $('lists').replaceChildren(...lists.map((l) => el('li', {},
      el('button', { onclick: () => this.show(l.id) },
        el('span', { class: 'title' }, l.name),
        el('span', { class: 'artist' }, `${l.trackIds.length} ${l.trackIds.length === 1 ? "canción" : "canciones"}`)))));
    $('lists').hidden = Boolean(this.open);
    $('new-list').hidden = Boolean(this.open);
    $('list-detail').hidden = !this.open;
    if (this.open) {
      const l = lists.find((x) => x.id === this.open);
      if (!l) { this.open = null; return this.render(); }
      const byId = new Map(Local.tracks.map((t) => [t.id, t]));
      const tracks = l.trackIds.map((id) => byId.get(id)).filter(Boolean);
      $('list-title').textContent = l.name;
      $('list-tracks').replaceChildren(...tracks.map((t, i) => Local.row(t, tracks, i,
        el('button', {
          class: 'icon', 'aria-label': `Quitar ${t.title} de la lista`,
          onclick: async () => { await LocalLibrary.saveList({ ...l, trackIds: l.trackIds.filter((x) => x !== t.id) }); this.render(); },
        }, '✕'))));
      this.current = tracks;
      highlightPlaying();
    }
  },
  show(id) { this.open = id; this.render(); },
};

$('new-list').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('list-name').value.trim();
  if (!name) return;
  await LocalLibrary.createList(name);
  $('list-name').value = '';
  Lists.render();
});
$('list-back').addEventListener('click', () => { Lists.open = null; Lists.render(); });
$('list-play').addEventListener('click', () => Player.playQueue((Lists.current || []).map((t) => Local.item(t))));
$('list-shuffle').addEventListener('click', () => Player.playQueue((Lists.current || []).map((t) => Local.item(t)), 0, true));
$('list-delete').addEventListener('click', async () => {
  if (!confirm('¿Borrar esta lista? Las canciones siguen en tu biblioteca.')) return;
  await LocalLibrary.deleteList(Lists.open);
  Lists.open = null;
  Lists.render();
});

// ---------- Importar ----------
async function importFrom(files) {
  if (!files || !files.length) return;
  const box = $('import-progress');
  box.hidden = false;
  const res = await LocalLibrary.importFiles(files, (done, total, name) => {
    box.querySelector('.bar').style.width = `${total ? (done / total) * 100 : 100}%`;
    box.querySelector('span').textContent = total ? `${done}/${total} ${name}` : '';
  });
  box.hidden = true;
  const parts = [`${res.added} añadidas`];
  if (res.skipped) parts.push(`${res.skipped} ya estaban`);
  if (res.failed) parts.push(`${res.failed} no se pueden reproducir`);
  if (res.ignored) parts.push(`${res.ignored} no son audio`);
  toast(parts.join(' · '));
  await Local.refresh();
  renderStorage();
  if (res.added) showSub('songs');
}

$('pick-files').addEventListener('change', (e) => { importFrom(e.target.files); e.target.value = ''; });
$('pick-folder').addEventListener('change', (e) => { importFrom(e.target.files); e.target.value = ''; });
const drop = $('drop');
drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', async (e) => {
  e.preventDefault();
  drop.classList.remove('over');
  importFrom(await filesFromDrop(e.dataTransfer));
});

async function filesFromDrop(dt) {
  const entries = [...dt.items].map((i) => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
  if (!entries.length) return [...dt.files];
  const out = [];
  const walk = async (entry) => {
    if (entry.isFile) out.push(await new Promise((res, rej) => entry.file(res, rej)));
    else if (entry.isDirectory) {
      const reader = entry.createReader();
      let batch;
      do {
        batch = await new Promise((res, rej) => reader.readEntries(res, rej));
        for (const e of batch) await walk(e);
      } while (batch.length);
    }
  };
  for (const e of entries) await walk(e);
  return out;
}

async function renderStorage() {
  const s = await LocalLibrary.storageInfo();
  $('storage').textContent = `Espacio usado: ${fmtBytes(s.usage)} de ${fmtBytes(s.quota)} disponibles.` +
    (s.persisted ? ' Almacenamiento persistente activado.' : ' El navegador podría liberar espacio si el dispositivo se llena; instalar la app ayuda a evitarlo.');
}

// ---------- SoundCloud (API oficial, solo en línea) ----------
const SC = {
  status: null, me: null, list: 'likes', items: [], next: null, playlist: null, loading: false,

  async enter() {
    const offline = !navigator.onLine;
    $('sc-offline').hidden = !offline;
    if (offline) { $('sc-login').hidden = true; $('sc-library').hidden = true; $('sc-unconfigured').hidden = true; return; }
    let res;
    try {
      res = await fetch('/auth/status', { cache: 'no-store' });
    } catch {
      $('sc-offline').hidden = false;
      return;
    }
    try {
      this.status = await res.json();
    } catch {
      // Publicada como web estática (sin el servidor de Eco): no hay parte de SoundCloud.
      this.status = { configured: false, loggedIn: false };
    }
    $('sc-unconfigured').hidden = this.status.configured;
    $('sc-login').hidden = !this.status.configured || this.status.loggedIn;
    $('sc-library').hidden = !this.status.loggedIn;
    if (this.status.loggedIn && !this.me) {
      const r = await fetch('/api/me', { cache: 'no-store' });
      if (r.status === 401) { this.status.loggedIn = false; return this.enter(); }
      this.me = await r.json();
      $('me-avatar').src = this.me.avatar || 'icon.svg';
      $('me-name').textContent = this.me.username;
      $('me-name').href = this.me.permalink_url;
      this.load('likes');
    }
  },

  async load(list, playlist = null) {
    this.list = list;
    this.playlist = playlist;
    this.items = [];
    this.next = null;
    for (const b of document.querySelectorAll('[data-sc]')) b.setAttribute('aria-pressed', String(b.dataset.sc === list));
    $('sc-playlist-head').hidden = !playlist;
    if (playlist) $('sc-playlist-title').textContent = playlist.title;
    $('sc-list').replaceChildren();
    await this.more();
  },

  isTrackList() { return Boolean(this.playlist) || this.list === 'likes' || this.list === 'tracks'; },

  async more() {
    if (this.loading) return;
    this.loading = true;
    $('sc-status').textContent = 'Cargando…';
    try {
      const base = this.playlist
        ? `/api/playlist/${encodeURIComponent(this.playlist.urn)}/tracks`
        : `/api/list/${this.list}`;
      const url = this.next ? `${base}?next=${encodeURIComponent(this.next)}` : base;
      const r = await fetch(url, { cache: 'no-store' });
      if (r.status === 401) { this.me = null; return this.enter(); }
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || `Error ${r.status}`);
      this.items.push(...body.items);
      this.next = body.next;
      this.render();
      $('sc-status').textContent = this.items.length ? '' : 'No hay nada aquí todavía.';
    } catch (e) {
      $('sc-status').textContent = e.message;
    } finally {
      this.loading = false;
    }
  },

  queueItems() {
    return this.items.filter((t) => t.access !== 'blocked').map((t) => ({
      kind: 'sc', id: t.urn, title: t.title, artist: t.artist, duration: t.duration / 1000,
      artwork: t.artwork, permalink_url: t.permalink_url,
    }));
  },

  render() {
    const ul = $('sc-list');
    $('sc-actions').hidden = !this.isTrackList();
    if (this.isTrackList()) {
      const playable = this.queueItems();
      ul.replaceChildren(...this.items.map((t) => {
        const blocked = t.access === 'blocked';
        const idx = playable.findIndex((p) => p.id === t.urn);
        return el('li', { 'data-id': t.urn, class: blocked ? 'blocked' : '' },
          el('img', { alt: '', width: 44, height: 44, loading: 'lazy', src: t.artwork || 'icon.svg' }),
          el('button', { class: 'meta', disabled: blocked, onclick: () => Player.playQueue(playable, idx) },
            el('span', { class: 'title' }, t.title),
            el('span', { class: 'artist' }, t.artist + (t.access === 'preview' ? ' · solo vista previa' : blocked ? ' · no disponible' : ''))),
          el('span', { class: 'dur' }, fmt(t.duration / 1000)),
          el('a', { class: 'icon', href: t.permalink_url, target: '_blank', rel: 'noopener', 'aria-label': `Abrir ${t.title} en SoundCloud`, title: 'Abrir en SoundCloud' }, '↗'));
      }));
    } else {
      ul.replaceChildren(...this.items.map((p) => el('li', { 'data-id': p.urn },
        el('img', { alt: '', width: 44, height: 44, loading: 'lazy', src: p.artwork || 'icon.svg' }),
        el('button', { class: 'meta', onclick: () => this.load(this.list, p) },
          el('span', { class: 'title' }, p.title),
          el('span', { class: 'artist' }, `${p.artist} · ${p.track_count ?? '?'} pistas`)),
        el('span', { class: 'dur' }, ''),
        el('a', { class: 'icon', href: p.permalink_url, target: '_blank', rel: 'noopener', 'aria-label': `Abrir ${p.title} en SoundCloud`, title: 'Abrir en SoundCloud' }, '↗'))));
    }
    $('sc-more').hidden = !this.next;
    highlightPlaying();
  },
};

for (const b of document.querySelectorAll('[data-sc]')) b.addEventListener('click', () => SC.load(b.dataset.sc));
$('sc-more').addEventListener('click', () => SC.more());
$('sc-back').addEventListener('click', () => SC.load(SC.list));
$('sc-play-all').addEventListener('click', () => Player.playQueue(SC.queueItems()));
$('logout').addEventListener('click', async () => {
  await fetch('/auth/logout', { method: 'POST' }).catch(() => {});
  const cur = Player.current();
  if (cur && cur.kind === 'sc') { audio.pause(); Player.release(); }
  SC.me = null;
  SC.items = [];
  $('sc-list').replaceChildren();
  SC.enter();
});

// ---------- Arranque ----------
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service worker no registrado', e));
}
renderNet();
Local.refresh();
const params = new URLSearchParams(location.search);
if (params.get('login')) {
  const msgs = {
    caducado: 'El inicio de sesión caducó; inténtalo de nuevo.',
    cancelado: 'Inicio de sesión cancelado.',
    error: 'SoundCloud rechazó el inicio de sesión. Revisa las credenciales y la Redirect URI del servidor.',
  };
  toast(msgs[params.get('login')] || msgs.cancelado);
  history.replaceState(null, '', location.pathname + location.hash);
}
showView(location.hash === '#soundcloud' ? 'soundcloud' : 'local');
