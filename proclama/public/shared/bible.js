// Biblia: nombres de libros, lectura de referencias ("Juan 3:16-18"), búsqueda y diapositivas.
import { norm, uid, themeById } from './model.js';

// [nombre, ...abreviaturas]
export const BOOKS_ES = [
  ['Génesis', 'gn', 'gen'], ['Éxodo', 'ex', 'exo'], ['Levítico', 'lv', 'lev'], ['Números', 'nm', 'num'], ['Deuteronomio', 'dt', 'deut'],
  ['Josué', 'jos'], ['Jueces', 'jue', 'jc'], ['Rut', 'rt'], ['1 Samuel', '1s', '1sam', '1sm'], ['2 Samuel', '2s', '2sam', '2sm'],
  ['1 Reyes', '1r', '1re', '1rey'], ['2 Reyes', '2r', '2re', '2rey'], ['1 Crónicas', '1cr', '1cro'], ['2 Crónicas', '2cr', '2cro'],
  ['Esdras', 'esd'], ['Nehemías', 'neh'], ['Ester', 'est'], ['Job', 'jb'], ['Salmos', 'sal', 'slm', 'salmo'], ['Proverbios', 'pr', 'prov'],
  ['Eclesiastés', 'ec', 'ecl'], ['Cantares', 'cnt', 'cant'], ['Isaías', 'is', 'isa'], ['Jeremías', 'jer'], ['Lamentaciones', 'lm', 'lam'],
  ['Ezequiel', 'ez', 'eze'], ['Daniel', 'dn', 'dan'], ['Oseas', 'os'], ['Joel', 'jl'], ['Amós', 'am'], ['Abdías', 'abd'], ['Jonás', 'jon'],
  ['Miqueas', 'mi', 'miq'], ['Nahúm', 'nah'], ['Habacuc', 'hab'], ['Sofonías', 'sof'], ['Hageo', 'hag'], ['Zacarías', 'zac'], ['Malaquías', 'mal'],
  ['Mateo', 'mt', 'mat'], ['Marcos', 'mr', 'mc', 'mar'], ['Lucas', 'lc', 'luc'], ['Juan', 'jn'], ['Hechos', 'hch', 'hech'], ['Romanos', 'ro', 'rom'],
  ['1 Corintios', '1co', '1cor'], ['2 Corintios', '2co', '2cor'], ['Gálatas', 'ga', 'gal'], ['Efesios', 'ef', 'efe'], ['Filipenses', 'fil', 'flp'],
  ['Colosenses', 'col'], ['1 Tesalonicenses', '1ts', '1tes'], ['2 Tesalonicenses', '2ts', '2tes'], ['1 Timoteo', '1ti', '1tim'], ['2 Timoteo', '2ti', '2tim'],
  ['Tito', 'tit'], ['Filemón', 'flm', 'filem'], ['Hebreos', 'he', 'heb'], ['Santiago', 'stg', 'sant'], ['1 Pedro', '1p', '1pe', '1ped'],
  ['2 Pedro', '2p', '2pe', '2ped'], ['1 Juan', '1jn'], ['2 Juan', '2jn'], ['3 Juan', '3jn'], ['Judas', 'jud'], ['Apocalipsis', 'ap', 'apoc'],
];

const key = (s) => norm(s).replace(/^(iii|ii|i)\s+(?=[a-z])/, (m, r) => r.length + '').replace(/[\s.]+/g, '');

export function bookName(bible, i) {
  return bible?.bookNames?.[i] ?? BOOKS_ES[i]?.[0] ?? `Libro ${i + 1}`;
}

/** Devuelve el índice (0-65) del libro que coincide con el texto, o -1. */
export function findBook(text, bible) {
  const k = key(text);
  if (!k) return -1;
  const names = BOOKS_ES.map((b, i) => [...b, ...(bible?.bookNames?.[i] ? [bible.bookNames[i]] : [])].map(key));
  let i = names.findIndex(list => list.includes(k));
  if (i < 0) i = names.findIndex(list => list.some(n => n.startsWith(k)));
  return i;
}

/** "Juan 3:16-18", "jn 3 16", "1 co 13", "Salmos 23" -> { book, chapter, from, to } (from/to = 0 si es el capítulo completo). */
export function parseReference(text, bible) {
  const m = /^\s*((?:[1-3]|i{1,3})?\s*[^\d:]+?)\.?\s*(\d+)(?:\s*[:.,\s]\s*(\d+)(?:\s*[-–a]\s*(\d+))?)?\s*$/i.exec(String(text ?? ''));
  if (!m) return null;
  const book = findBook(m[1], bible);
  if (book < 0) return null;
  const chapter = Number(m[2]);
  const from = m[3] ? Number(m[3]) : 0;
  const to = m[4] ? Math.max(Number(m[4]), from) : from;
  if (bible) {
    const ch = bible.books[book]?.[chapter - 1];
    if (!ch || from > ch.length) return null;
    return { book, chapter, from, to: Math.min(to, ch.length) };
  }
  return { book, chapter, from, to };
}

export function formatRef(bible, { book, chapter, from, to }) {
  let s = `${bookName(bible, book)} ${chapter}`;
  if (from) s += `:${from}` + (to && to !== from ? `-${to}` : '');
  return s;
}

/** Búsqueda de texto: todas las palabras deben aparecer en el versículo. */
export function searchBible(bible, query, limit = 60) {
  const words = norm(query).split(/\s+/).filter(w => w.length > 1);
  const out = [];
  if (!words.length) return out;
  for (let b = 0; b < bible.books.length; b++) {
    const book = bible.books[b];
    for (let c = 0; c < book.length; c++) {
      for (let v = 0; v < book[c].length; v++) {
        const t = norm(book[c][v]);
        if (words.every(w => t.includes(w))) {
          out.push({ book: b, chapter: c + 1, verse: v + 1, text: book[c][v] });
          if (out.length >= limit) return out;
        }
      }
    }
  }
  return out;
}

/** Pasaje -> presentación (un versículo, o varios, por diapositiva). */
export function bibleToPresentation(bible, ref, db, themeId) {
  const ch = bible.books[ref.book][ref.chapter - 1];
  const from = ref.from || 1, to = ref.to || (ref.from ? ref.from : ch.length);
  const per = Math.max(1, Number(db.settings.versesPerSlide) || 1);
  const slides = [];
  for (let v = from; v <= to; v += per) {
    const end = Math.min(to, v + per - 1);
    const parts = [];
    for (let x = v; x <= end; x++) parts.push({ n: x, t: ch[x - 1] });
    slides.push({
      text: parts.map(p => `${p.n} ${p.t}`).join(' '), verses: parts, label: `${ref.chapter}:${v}` + (end > v ? `-${end}` : ''),
      footer: `${formatRef(bible, { book: ref.book, chapter: ref.chapter, from: v, to: end })} · ${bible.name}`,
    });
  }
  return {
    id: uid(), type: 'bible', title: `${formatRef(bible, ref)} (${bible.name})`, slides,
    theme: themeById(db, themeId, db.settings.bibleThemeId),
  };
}
