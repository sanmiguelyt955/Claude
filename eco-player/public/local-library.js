// Biblioteca local: archivos de audio guardados en IndexedDB para escucharlos sin conexión.
'use strict';

const LocalLibrary = (() => {
  const DB_NAME = 'eco';
  const DB_VERSION = 1;
  let dbPromise = null;

  function open() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          db.createObjectStore('tracks', { keyPath: 'id' });   // metadatos
          db.createObjectStore('files');                         // id -> Blob de audio
          db.createObjectStore('art');                           // id -> Blob de carátula
          db.createObjectStore('lists', { keyPath: 'id' });     // { id, name, trackIds, created }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  }

  async function tx(stores, mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(stores, mode);
      let result;
      Promise.resolve(fn(...stores.map((s) => t.objectStore(s)))).then((r) => { result = r; });
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('transacción abortada'));
    });
  }

  const req2p = (r) => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });

  // ---------- Etiquetas ID3v2 (MP3) ----------
  function syncsafe(b, i) { return (b[i] << 21) | (b[i + 1] << 14) | (b[i + 2] << 7) | b[i + 3]; }

  function decodeText(bytes) {
    if (!bytes.length) return '';
    const enc = bytes[0];
    let body = bytes.subarray(1);
    let label = 'latin1';
    if (enc === 1) label = 'utf-16';
    else if (enc === 2) label = 'utf-16be';
    else if (enc === 3) label = 'utf-8';
    return new TextDecoder(label).decode(body).replace(/\u0000+$/g, '').split('\u0000')[0].trim();
  }

  function findTerminator(b, start, wide) {
    if (!wide) { const i = b.indexOf(0, start); return i < 0 ? b.length : i; }
    for (let i = start; i + 1 < b.length; i += 2) if (b[i] === 0 && b[i + 1] === 0) return i;
    return b.length;
  }

  function parseApic(b, v2) {
    const enc = b[0];
    let i = 1;
    let mime;
    if (v2) { mime = new TextDecoder('latin1').decode(b.subarray(1, 4)).toLowerCase() === 'png' ? 'image/png' : 'image/jpeg'; i = 4; }
    else { const end = b.indexOf(0, i); mime = new TextDecoder('latin1').decode(b.subarray(i, end)) || 'image/jpeg'; i = end + 1; }
    i += 1; // tipo de imagen
    const wide = enc === 1 || enc === 2;
    i = findTerminator(b, i, wide) + (wide ? 2 : 1);
    if (!mime.includes('/')) mime = `image/${mime.toLowerCase() === 'png' ? 'png' : 'jpeg'}`;
    return new Blob([b.subarray(i)], { type: mime });
  }

  // Desunsincronización ID3: quita el 0x00 insertado tras cada 0xFF.
  function unsync(b) {
    const out = new Uint8Array(b.length);
    let n = 0;
    for (let i = 0; i < b.length; i++) {
      out[n++] = b[i];
      if (b[i] === 0xff && b[i + 1] === 0x00) i++;
    }
    return out.subarray(0, n);
  }

  // ID3v1: 128 bytes al final de MP3 antiguos («TAG» + título, artista, álbum).
  async function readId3v1(file) {
    if (file.size < 128) return {};
    const b = new Uint8Array(await file.slice(file.size - 128).arrayBuffer());
    if (b[0] !== 0x54 || b[1] !== 0x41 || b[2] !== 0x47) return {};
    const field = (from, len) => new TextDecoder('latin1').decode(b.subarray(from, from + len)).split('\u0000')[0].trim();
    return { title: field(3, 30), artist: field(33, 30), album: field(63, 30) };
  }

  async function readId3(file) {
    const head = new Uint8Array(await file.slice(0, 10).arrayBuffer());
    if (head.length < 10 || head[0] !== 0x49 || head[1] !== 0x44 || head[2] !== 0x33) return readId3v1(file);
    const major = head[3];
    const size = syncsafe(head, 6);
    let b = new Uint8Array(await file.slice(10, 10 + size).arrayBuffer());
    if (major < 4 && head[5] & 0x80) b = unsync(b); // en v2.4 se marca por cuadro
    const out = {};
    const v2 = major === 2;
    const ids = v2
      ? { TT2: 'title', TP1: 'artist', TAL: 'album', PIC: 'art' }
      : { TIT2: 'title', TPE1: 'artist', TALB: 'album', APIC: 'art' };
    let i = 0;
    if (!v2 && head[5] & 0x40 && b.length > 4) i += major === 4 ? syncsafe(b, 0) : ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) + 4;
    while (i + (v2 ? 6 : 10) <= b.length) {
      const idLen = v2 ? 3 : 4;
      const id = String.fromCharCode(...b.subarray(i, i + idLen));
      if (!/^[A-Z0-9]+$/.test(id)) break;
      let len;
      if (v2) len = (b[i + 3] << 16) | (b[i + 4] << 8) | b[i + 5];
      else if (major === 4) len = syncsafe(b, i + 4);
      else len = (b[i + 4] << 24) | (b[i + 5] << 16) | (b[i + 6] << 8) | b[i + 7];
      const start = i + (v2 ? 6 : 10);
      if (len <= 0 || start + len > b.length) break;
      const key = ids[id];
      let data = b.subarray(start, start + len);
      if (major === 4) {
        const fmt = b[i + 9];
        if (fmt & 0x0c) { i = start + len; continue; } // comprimido o cifrado: no lo leemos
        if (fmt & 0x01) data = data.subarray(4);       // indicador de longitud de datos
        if (fmt & 0x02) data = unsync(data);
      } else if (major === 3 && b[i + 9] & 0xc0) {      // v2.3 comprimido o cifrado
        i = start + len; continue;
      }
      if (key === 'art' && !out.art) out.art = parseApic(data, v2);
      else if (key && !out[key]) out[key] = decodeText(data);
      i = start + len;
    }
    if (!out.title || !out.artist) {
      const v1 = await readId3v1(file);
      for (const k of ['title', 'artist', 'album']) if (!out[k] && v1[k]) out[k] = v1[k];
    }
    return out;
  }

  // ---------- Etiquetas iTunes (M4A/MP4) ----------
  // Lee moov > udta > meta > ilst sin cargar el audio: solo las cabeceras de cada caja.
  async function readMp4Tags(file) {
    const u32 = (v, o) => v.getUint32(o);
    const boxSize = (v, o) => {
      const s = u32(v, o);
      return s === 1 ? Number(v.getBigUint64(o + 8)) : s; // tamaño de 64 bits
    };
    // Busca la caja moov entre las de primer nivel sin leer el resto del archivo.
    let pos = 0, moov = null;
    while (pos + 8 <= file.size) {
      const h = new DataView(await file.slice(pos, pos + 16).arrayBuffer());
      let size = boxSize(h, 0);
      const type = String.fromCharCode(h.getUint8(4), h.getUint8(5), h.getUint8(6), h.getUint8(7));
      if (size === 0) size = file.size - pos;
      if (size < 8) break;
      if (type === 'moov') {
        if (size > 64 * 1024 * 1024) return {};
        moov = new Uint8Array(await file.slice(pos, pos + size).arrayBuffer());
        break;
      }
      pos += size;
    }
    if (!moov) return {};
    const v = new DataView(moov.buffer, moov.byteOffset, moov.byteLength);
    const typeAt = (o) => String.fromCharCode(moov[o + 4], moov[o + 5], moov[o + 6], moov[o + 7]);
    const find = (from, to, type) => {
      for (let o = from; o + 8 <= to;) {
        const s = boxSize(v, o);
        if (s < 8 || o + s > to) return null;
        if (typeAt(o) === type) return [o, o + s];
        o += s;
      }
      return null;
    };
    const udta = find(8, moov.length, 'udta');
    const meta = udta && find(udta[0] + 8, udta[1], 'meta');
    const ilst = meta && find(meta[0] + 12, meta[1], 'ilst'); // meta lleva 4 bytes de versión
    if (!ilst) return {};
    const keys = { '©nam': 'title', '©ART': 'artist', 'aART': 'artist', '©alb': 'album', covr: 'art' };
    const out = {};
    for (let o = ilst[0] + 8; o + 8 <= ilst[1];) {
      const s = boxSize(v, o);
      if (s < 8) break;
      const key = keys[typeAt(o)];
      const data = key && find(o + 8, o + s, 'data');
      if (data && !out[key]) {
        const kind = u32(v, data[0] + 8) & 0xffffff; // 1 = UTF-8, 13 = JPEG, 14 = PNG
        const body = moov.subarray(data[0] + 16, data[1]);
        if (key === 'art') out.art = new Blob([body], { type: kind === 14 ? 'image/png' : 'image/jpeg' });
        else if (kind === 1) out[key] = new TextDecoder('utf-8').decode(body).trim();
      }
      o += s;
    }
    return out;
  }

  const MP4_EXT = /\.(m4a|mp4|aac|m4b)$/i;
  async function readTags(file) {
    try {
      return MP4_EXT.test(file.name) || /mp4|m4a/.test(file.type) ? await readMp4Tags(file) : await readId3(file);
    } catch (e) {
      console.warn('Etiquetas ilegibles en', file.name, e);
      return {};
    }
  }

  function fromFilename(name) {
    const base = name.replace(/\.[^.]+$/, '').replace(/_/g, ' ').trim();
    const m = base.match(/^(.+?)\s+[-–—]\s+(.+)$/);
    return m ? { artist: m[1].trim(), title: m[2].trim() } : { title: base };
  }

  // Duración del audio, o null si el navegador no sabe reproducirlo.
  // iOS a menudo no carga metadatos sin reproducir: tras 3 s se deja en 0 y se completa
  // la primera vez que suena (ver LocalLibrary.setDuration).
  function probeDuration(blob) {
    return new Promise((resolve) => {
      const a = document.createElement('audio');
      const url = URL.createObjectURL(blob);
      let settled = false;
      const done = (d) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        URL.revokeObjectURL(url);
        a.removeAttribute('src');
        a.load();
        resolve(d);
      };
      const timer = setTimeout(() => done(0), 3000);
      a.preload = 'metadata';
      a.onloadedmetadata = () => done(Number.isFinite(a.duration) ? a.duration : 0);
      a.onerror = () => done(null);
      a.src = url;
    });
  }

  const AUDIO_EXT = /\.(mp3|m4a|aac|mp4|wav|flac|ogg|oga|opus|webm|aif|aiff)$/i;
  function isAudio(file) { return (file.type && file.type.startsWith('audio/')) || AUDIO_EXT.test(file.name); }

  async function fingerprint(file) {
    return `${file.name}|${file.size}|${file.lastModified}`;
  }

  async function importFiles(files, onProgress) {
    // Copia síncrona: quien llama puede vaciar el <input> (y su FileList) mientras importamos.
    const all = [...files];
    const audio = all.filter(isAudio);
    const existing = new Set((await allTracks()).map((t) => t.fingerprint));
    let added = 0, skipped = 0, failed = 0;
    for (let n = 0; n < audio.length; n++) {
      const file = audio[n];
      onProgress && onProgress(n, audio.length, file.name);
      try {
        const fp = await fingerprint(file);
        if (existing.has(fp)) { skipped++; continue; }
        const duration = await probeDuration(file);
        if (duration === null) { failed++; continue; } // el navegador no sabe reproducirlo
        const tags = await readTags(file);
        const guess = fromFilename(file.name);
        const id = crypto.randomUUID();
        const track = {
          id,
          fingerprint: fp,
          title: tags.title || guess.title,
          artist: tags.artist || guess.artist || '',
          album: tags.album || '',
          duration,
          size: file.size,
          type: file.type || '',
          hasArt: Boolean(tags.art),
          added: Date.now() + n,
        };
        const blob = new Blob([file], { type: file.type || 'audio/mpeg' });
        await tx(['tracks', 'files', 'art'], 'readwrite', (ts, fs, as) => {
          ts.put(track);
          fs.put(blob, id);
          if (tags.art) as.put(tags.art, id);
        });
        existing.add(fp);
        added++;
      } catch (e) {
        console.error('No se pudo importar', file.name, e);
        failed++;
      }
    }
    onProgress && onProgress(audio.length, audio.length, '');
    return { added, skipped, failed, ignored: all.length - audio.length };
  }

  async function allTracks() { return tx(['tracks'], 'readonly', (s) => req2p(s.getAll())); }

  // Guarda la duración real cuando se supo al reproducir (iOS no la da al importar).
  async function setDuration(id, duration) {
    return tx(['tracks'], 'readwrite', async (s) => {
      const t = await req2p(s.get(id));
      if (t && !(t.duration > 0)) s.put({ ...t, duration });
    });
  }
  async function getFile(id) { return tx(['files'], 'readonly', (s) => req2p(s.get(id))); }
  async function getArt(id) { return tx(['art'], 'readonly', (s) => req2p(s.get(id))); }

  async function removeTrack(id) {
    const lists = await allLists();
    await tx(['tracks', 'files', 'art', 'lists'], 'readwrite', (ts, fs, as, ls) => {
      ts.delete(id); fs.delete(id); as.delete(id);
      for (const l of lists) {
        if (l.trackIds.includes(id)) ls.put({ ...l, trackIds: l.trackIds.filter((t) => t !== id) });
      }
    });
  }

  async function allLists() { return tx(['lists'], 'readonly', (s) => req2p(s.getAll())); }
  async function saveList(list) { return tx(['lists'], 'readwrite', (s) => { s.put(list); }); }
  async function deleteList(id) { return tx(['lists'], 'readwrite', (s) => { s.delete(id); }); }

  async function createList(name) {
    const list = { id: crypto.randomUUID(), name, trackIds: [], created: Date.now() };
    await saveList(list);
    return list;
  }

  async function storageInfo() {
    let persisted = false;
    if (navigator.storage && navigator.storage.persist) {
      try { persisted = await navigator.storage.persisted() || await navigator.storage.persist(); } catch { /* sin soporte */ }
    }
    const est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null;
    return { persisted, usage: est ? est.usage : null, quota: est ? est.quota : null };
  }

  return {
    importFiles, allTracks, getFile, getArt, removeTrack, setDuration,
    allLists, saveList, deleteList, createList, storageInfo, readTags, fromFilename,
  };
})();
