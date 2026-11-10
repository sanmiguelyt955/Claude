// Almacén sincronizado. Dos modos:
//  - "servidor": con server.js (SSE + REST). Sincroniza todos los dispositivos de la red.
//  - "local": sin servidor (archivo estático / hosting). Usa localStorage + BroadcastChannel + IndexedDB,
//    y sincroniza las ventanas del mismo navegador.
import { defaultDb, defaultLive, liveReducer, uid } from '../shared/model.js';

const token = new URLSearchParams(location.search).get('token') || '';
const api = (p) => p + (token ? (p.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(token) : '');
export const withToken = (p) => api(p);

// ---------- IndexedDB mínimo (medios en modo local) ----------
function idb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('proclama', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('media');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function idbOp(mode, fn) {
  const d = await idb();
  return new Promise((resolve, reject) => {
    const tx = d.transaction('media', mode);
    const req = fn(tx.objectStore('media'));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
  });
}
const blobUrls = new Map();
/** Convierte un src guardado ("/media/x.jpg" o "idb:ID") en una URL utilizable. */
export async function resolveSrc(src) {
  if (!src) return '';
  if (!src.startsWith('idb:')) return src;
  if (!blobUrls.has(src)) {
    const blob = await idbOp('readonly', s => s.get(src.slice(4))).catch(() => null);
    blobUrls.set(src, blob ? URL.createObjectURL(blob) : '');
  }
  return blobUrls.get(src);
}

export async function createStore() {
  const me = uid();
  const listeners = new Set();
  const store = {
    mode: 'local', db: defaultDb(), live: defaultLive(), info: null, online: true,
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
  const emit = (what) => { for (const fn of listeners) fn(what, store); };
  const bibles = new Map();
  store.bibleIndex = null;

  let server = false;
  try {
    const r = await fetch(api('/api/ping'), { cache: 'no-store' });
    server = r.ok && (await r.json()).name === 'Proclama';
  } catch { /* sin servidor */ }

  if (server) {
    store.mode = 'server';
    const st = await (await fetch(api('/api/state'))).json();
    store.db = st.db; store.live = st.live;
    store.info = await (await fetch(api('/api/info'))).json().catch(() => null);
    let sentPres = store.live.pres;
    const es = new EventSource(api('/api/events'));
    es.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'hello') {
        store.db = msg.data.db; store.live = msg.data.live; sentPres = store.live.pres; emit('db'); emit('live');
      } else if (msg.type === 'live' && msg.keepPres) {
        if (msg.origin === me) return;
        if (store.live.pres?.id === msg.keepPres) { store.live = { ...msg.data, pres: store.live.pres }; emit('live'); }
        else fetch(api('/api/state')).then(r => r.json()).then(st => { store.live = st.live; sentPres = st.live.pres; emit('live'); }).catch(() => {});
      } else if (msg.type === 'bibles') {
        store.bibleIndex = null; bibles.clear(); emit('bibles');
      } else if (msg.origin !== me) {
        store[msg.type] = msg.data; if (msg.type === 'live') sentPres = msg.data.pres; emit(msg.type);
      }
    };
    es.onopen = () => { store.online = true; emit('online'); };
    es.onerror = () => { store.online = false; emit('online'); };
    const put = (path, body) => fetch(api(path), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, origin: me }) })
      .catch(() => { store.online = false; emit('online'); });
    // Solo se envían las diapositivas cuando cambia la presentación; al avanzar va un mensaje pequeño.
    store.setLive = (live) => {
      store.live = live; emit('live');
      const keep = !!live.pres && live.pres === sentPres;
      sentPres = live.pres;
      if (!keep) return put('/api/live', { live });
      put('/api/live', { live: { ...live, pres: null }, keepPres: live.pres.id })
        .then(r => { if (r?.status === 409) put('/api/live', { live: store.live }); });
    };
    let dbTimer = null;
    store.saveDb = () => { emit('db'); clearTimeout(dbTimer); dbTimer = setTimeout(() => put('/api/db', { db: store.db }), 150); };
    store.uploadMedia = async (file) => {
      const r = await fetch(api('/api/media?name=' + encodeURIComponent(file.name)), { method: 'POST', body: file });
      if (!r.ok) throw new Error((await r.json()).error || 'Error al subir');
      const item = await r.json();
      if (!store.db.media.some(m => m.id === item.id)) store.db.media.push(item);
      emit('db');
      return item;
    };
    store.deleteMedia = async (id) => {
      await fetch(api('/api/media/' + encodeURIComponent(id)), { method: 'DELETE' });
      store.db.media = store.db.media.filter(m => m.id !== id); emit('db');
    };
  } else {
    try {
      const saved = JSON.parse(localStorage.getItem('proclama.db'));
      if (saved?.songs) store.db = { ...store.db, ...saved, settings: { ...store.db.settings, ...saved.settings } };
      const l = JSON.parse(localStorage.getItem('proclama.live'));
      if (l) store.live = { ...store.live, ...l };
    } catch { /* almacenamiento vacío o bloqueado */ }
    const ch = 'BroadcastChannel' in window ? new BroadcastChannel('proclama') : null;
    if (ch) ch.onmessage = (ev) => { store[ev.data.type] = ev.data.data; emit(ev.data.type); };
    const persist = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.warn('No se pudo guardar', e); } };
    let liveTimer = null;
    store.setLive = (live) => {
      store.live = live; emit('live'); ch?.postMessage({ type: 'live', data: live });
      clearTimeout(liveTimer); liveTimer = setTimeout(() => persist('proclama.live', store.live), 400);
    };
    store.saveDb = () => { emit('db'); ch?.postMessage({ type: 'db', data: store.db }); persist('proclama.db', store.db); };
    store.uploadMedia = async (file) => {
      const kind = file.type.startsWith('video/') ? 'video' : file.type.startsWith('image/') ? 'image' : null;
      if (!kind) throw new Error('Tipo de archivo no admitido');
      const id = uid();
      await idbOp('readwrite', s => s.put(file, id));
      const item = { id, name: file.name.replace(/\.[^.]+$/, ''), kind, src: 'idb:' + id };
      store.db.media.push(item); store.saveDb();
      return item;
    };
    store.deleteMedia = async (id) => {
      await idbOp('readwrite', s => s.delete(id)).catch(() => {});
      store.db.media = store.db.media.filter(m => m.id !== id); store.saveDb();
    };
  }

  store.dispatch = (action) => {
    const next = liveReducer(store.live, action);
    if (next !== store.live) store.setLive(next);
  };

  // Biblias: las incluidas + las que añade el usuario (servidor: data/bibles/; modo local: IndexedDB).
  const localBibles = () => { try { return JSON.parse(localStorage.getItem('proclama.bibles')) ?? []; } catch { return []; } };
  store.listBibles = async () => {
    if (!store.bibleIndex) {
      const base = await fetch('bibles/index.json', { cache: 'no-store' }).then(r => r.json()).catch(() => []);
      const own = store.mode === 'server' ? [] : localBibles();
      store.bibleIndex = [...base.filter(b => !own.some(o => o.id === b.id)), ...own];
    }
    return store.bibleIndex;
  };
  store.loadBible = (id) => {
    const k = id || store.db.settings.bibleVersion;
    if (!bibles.has(k)) {
      const p = (async () => {
        if (store.mode !== 'server' && localBibles().some(b => b.id === k)) {
          const b = await idbOp('readonly', s => s.get('bible:' + k));
          if (b) return b;
        }
        const r = await fetch(`bibles/${encodeURIComponent(k)}.json`);
        if (!r.ok) throw new Error('Esa Biblia no está disponible');
        return r.json();
      })();
      p.catch(() => bibles.delete(k));
      bibles.set(k, p);
    }
    return bibles.get(k);
  };
  store.saveBible = async (bible) => {
    if (store.mode === 'server') {
      const r = await fetch(api('/api/bibles'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bible) });
      if (!r.ok) throw new Error((await r.json()).error || 'No se pudo guardar');
    } else {
      await idbOp('readwrite', s => s.put(bible, 'bible:' + bible.id));
      localStorage.setItem('proclama.bibles', JSON.stringify([...localBibles().filter(b => b.id !== bible.id), { id: bible.id, name: bible.name, lang: bible.lang, custom: true }]));
    }
    store.bibleIndex = null; bibles.delete(bible.id);
  };
  store.deleteBible = async (id) => {
    if (store.mode === 'server') await fetch(api('/api/bibles/' + encodeURIComponent(id)), { method: 'DELETE' });
    else {
      await idbOp('readwrite', s => s.delete('bible:' + id)).catch(() => {});
      localStorage.setItem('proclama.bibles', JSON.stringify(localBibles().filter(b => b.id !== id)));
    }
    store.bibleIndex = null; bibles.delete(id);
    if (store.db.settings.bibleVersion === id) { store.db.settings.bibleVersion = 'rv1909'; store.saveDb(); }
  };
  return store;
}
