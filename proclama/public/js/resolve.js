// Convierte un elemento del programa (canción, pasaje, medio, texto) en una presentación lista para mostrar.
import { songToPresentation, textToPresentation, mediaToPresentation } from '../shared/model.js';
import { bibleToPresentation } from '../shared/bible.js';

export async function resolveItem(item, store) {
  const db = store.db;
  let pres;
  if (item.type === 'song') {
    const song = db.songs.find(s => s.id === item.songId);
    if (!song) throw new Error('Esa canción ya no está en la biblioteca');
    pres = songToPresentation(song, db, item.themeId);
  } else if (item.type === 'bible') {
    pres = bibleToPresentation(await store.loadBible(item.version), item, db, item.themeId);
  } else if (item.type === 'media') {
    const m = db.media.find(x => x.id === item.mediaId);
    if (!m) throw new Error('Ese archivo ya no está en la biblioteca');
    pres = mediaToPresentation(m, db);
  } else {
    pres = textToPresentation(item.title, item.text, db, item.themeId);
  }
  pres.itemId = item.id;
  return pres;
}

export function itemInfo(item, db) {
  if (item.type === 'song') {
    const s = db.songs.find(x => x.id === item.songId);
    return { icon: '♪', title: s?.title ?? '(canción eliminada)', sub: s?.author ?? '' };
  }
  if (item.type === 'bible') return { icon: '✝', title: item.title, sub: 'Biblia' };
  if (item.type === 'media') {
    const m = db.media.find(x => x.id === item.mediaId);
    return { icon: m?.kind === 'video' ? '▶' : '▣', title: m?.name ?? '(medio eliminado)', sub: m?.kind === 'video' ? 'Video' : 'Imagen' };
  }
  return { icon: '¶', title: item.title || 'Texto', sub: 'Texto' };
}

const LABEL_COLORS = { verso: '#6ea8ff', coro: '#ff8fa3', 'pre-coro': '#ffb86b', puente: '#c39bff', intro: '#7fd6c2', final: '#7fd6c2', tag: '#e6d36a' };
export const labelColor = (label) => LABEL_COLORS[String(label ?? '').toLowerCase().replace(/\s*\d+$/, '')] ?? '';
