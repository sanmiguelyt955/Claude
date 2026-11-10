// Convierte el texto de un PDF de la Biblia en libros, capítulos y versículos.
// Espera el formato más común: un título por capítulo ("Génesis 1", "SALMO 23", "1 SAMUEL 3") y los
// versículos seguidos, cada uno precedido por su número. Ignora encabezados y pies de página repetidos
// y los títulos de sección ("La creación"). No depende del navegador: recibe las líneas ya extraídas.
import { norm } from './model.js';
import { findBook, BOOKS_ES } from './bible.js';

// Capítulos de cada libro (canon protestante de 66 libros).
export const CHAPTERS = [50, 40, 27, 36, 34, 24, 21, 4, 31, 24, 22, 25, 29, 36, 10, 13, 10, 42, 150, 31, 12, 8, 66, 52, 5, 48, 12, 14, 3, 9, 1, 4, 7, 3, 3, 3, 2, 14, 4, 28, 16, 24, 21, 28, 16, 16, 13, 6, 6, 4, 4, 5, 3, 6, 4, 3, 1, 13, 5, 5, 3, 5, 1, 1, 1, 22];

const ENDS = /[.,;:?!…»”"')\]]$/;
const headRe = /^(.{2,28}?)\s+(\d{1,3})$/;

/**
 * Fragmentos de texto de una página de PDF (como los entrega pdf.js) -> líneas { x, y, s }.
 * Junta los fragmentos de la misma línea y repone el espacio cuando hay un hueco entre dos de ellos.
 */
export function linesFromItems(items) {
  const lines = [];
  let cur = null, end = 0;
  for (const it of items) {
    if (typeof it.str !== 'string' || !it.str) continue;
    const x = it.transform[4], y = it.transform[5], size = Math.abs(it.transform[0]) || it.height || 10;
    if (!cur || Math.abs(cur.y - y) > size * 0.35) { cur = { x, y, s: '' }; lines.push(cur); end = x; }
    else if (x - end > size * 0.2 && !/\s$/.test(cur.s) && !/^\s/.test(it.str)) cur.s += ' ';
    cur.s += it.str;
    end = x + (it.width || 0);
  }
  return lines.map(l => ({ x: Math.round(l.x), y: Math.round(l.y * 10) / 10, s: l.s }));
}

const isHeadLine = (s) => { const m = headRe.exec(s); return !!m && (findBook(m[1]) >= 0 || norm(m[1]).startsWith('salmo')); };

/** Líneas de cada página -> párrafos ({ text, single }), sin encabezados ni pies repetidos. */
function paragraphs(pages) {
  const freq = new Map();
  for (const lines of pages) for (const s of new Set(lines.map(l => norm(l.s).trim()))) if (s) freq.set(s, (freq.get(s) ?? 0) + 1);
  const repeated = (s) => pages.length > 5 && (freq.get(norm(s).trim()) ?? 0) > pages.length * 0.3;
  const clean = pages.map(raw => raw.map(l => ({ ...l, s: l.s.replace(/\s+/g, ' ').trim() })).filter(l => l.s && !repeated(l.s) && !/^\d{1,4}$/.test(l.s))
    .sort((a, b) => b.y - a.y || a.x - b.x));
  // Interlineado normal del documento: la separación entre líneas que más se repite.
  const count = new Map();
  for (const lines of clean) for (let i = 1; i < lines.length; i++) {
    const g = Math.round(lines[i - 1].y - lines[i].y);
    if (g > 0) count.set(g, (count.get(g) ?? 0) + 1);
  }
  // (la menor entre las separaciones frecuentes: los saltos entre párrafos también se repiten mucho).
  const top = Math.max(0, ...count.values());
  const lead = Math.min(...[...count].filter(([, n]) => n >= top * 0.2).map(([g]) => g), Infinity);
  const out = [];
  for (const lines of clean) {
    let cur = null;
    lines.forEach((l, i) => {
      const gap = i ? lines[i - 1].y - l.y : Infinity;
      if (/^[-–—_=*\s]{4,}$/.test(l.s)) { cur = null; return; } // línea separadora: corta el párrafo y se descarta
      if (isHeadLine(l.s)) { out.push({ text: l.s, single: true, n: 1 }); cur = null; return; } // un título de capítulo siempre va solo
      if (!cur || !Number.isFinite(lead) || gap > lead * 1.45 + 1) { cur = { text: l.s, single: true, n: 1 }; out.push(cur); }
      else { cur.text += (cur.text.endsWith('-') && /^[a-záéíóúñ]/.test(l.s) ? '' : ' ') + l.s; cur.single = false; cur.n++; }
    });
  }
  return out;
}

const UP = /^[\p{Lu}¿¡“"«(—-]/u;
/** El texto bíblico no lleva cifras: las que quedan son marcas del PDF (sangrías, notas) y se quitan. */
const tidy = (v) => v.replace(/(\p{L})=(\p{L})/gu, '$1-$2').replace(/\s*\([^()]*\d[^()]*\)/g, '').replace(/(^|\s)\d{1,3}(?=\s)/g, '$1').replace(/\d+/g, '')
  .replace(/\s+([,.;:?!])/g, '$1').replace(/\s+/g, ' ').trim();

/**
 * Texto de un capítulo -> lista de versículos, buscando los números en orden (1, 2, 3…).
 * `expected` (opcional) es cuántos versículos debería tener; ayuda cuando el PDF trae un número mal puesto.
 * Si falta un número salta al siguiente que sí aparece, deja vacío el que falta y lo anota en `gaps`.
 */
export function splitVerses(text, gaps = [], expected = 0) {
  // Normaliza marcas pegadas: "naciones.18 ¿A" -> "naciones. 18 ¿A"; "11\\c Con" -> "11 Con".
  const t = ' ' + text.replace(/(\d)\\[a-z]+/gi, '$1').replace(/([.,;:?!»”"])(\d{1,3}) /g, '$1 $2 ').replace(/\s+/g, ' ').trim() + ' ';
  const verses = [];
  let pos = t.search(/ 1 (?=\S)/);
  if (pos < 0) return verses;
  // Posición del marcador del versículo `num` a partir de `from`. Si aparece varias veces antes del siguiente
  // número (marca de sangría repetida), se prefiere la que va seguida de mayúscula.
  const find = (num, from) => {
    const first = t.indexOf(` ${num} `, from);
    if (first < 0) return -1;
    const limit = t.indexOf(` ${num + 1} `, first + 1);
    const all = [first];
    for (let k = t.indexOf(` ${num} `, first + 1); k >= 0 && (limit < 0 || k < limit); k = t.indexOf(` ${num} `, k + 1)) all.push(k);
    if (all.length === 1) return first;
    const caps = all.filter(k => UP.test(t.slice(k + String(num).length + 2)));
    return caps.length === 1 ? caps[0] : first;
  };
  for (let n = 1; ; ) {
    const start = pos + String(n).length + 2;
    let next = find(n + 1, start), skip = 0;
    if (next < 0) for (let k = 2; k <= 4 && next < 0; k++) {
      // Salto: solo vale si después la numeración continúa (evita confundir una cifra dentro del texto).
      const cand = t.indexOf(` ${n + k} `, start);
      if (cand >= 0 && t.indexOf(` ${n + k + 1} `, cand) >= 0) { next = cand; skip = k - 1; }
    }
    if (next < 0 && expected && n < expected) {
      // Número mal puesto (p. ej. "32" donde va el 31): si quedan tantas cifras sueltas como versículos faltan, es ese.
      const rest = [...t.slice(start).matchAll(/ \d{1,3} (?=\S)/g)];
      if (rest.length === expected - n) { next = start + rest[0].index; t_fix.at = next; }
    }
    verses.push(tidy(t.slice(start, next < 0 ? undefined : next)));
    if (next < 0) break;
    for (let k = 1; k <= skip; k++) { verses.push(''); gaps.push(n + k); }
    n += 1 + skip;
    pos = next;
    if (t_fix.at === next) { // el marcador mal numerado mide lo que mida su cifra real
      const real = / (\d{1,3}) /.exec(t.slice(next, next + 6));
      pos = next + real[1].length - String(n).length; t_fix.at = -1;
    }
  }
  return verses;
}
const t_fix = { at: -1 };

/**
 * @param {{x: number, y: number, s: string}[][]} pages  líneas de texto de cada página
 * @param {{books: string[][][]}|null} ref  Biblia de referencia (solo se usa su número de versículos por capítulo)
 * @returns {{ books: string[][][], warnings: string[] }}
 */
export function parseBiblePages(pages, ref = null) {
  const paras = paragraphs(pages);
  const books = Array.from({ length: 66 }, () => []);
  let book = -1, chapter = 0, headName = '', buf = [];
  const damaged = [];

  const heading = (p) => {
    if (!p.single) return null;
    const m = headRe.exec(p.text);
    if (!m) return null;
    const name = norm(m[1]).trim(), n = Number(m[2]);
    if (name === headName && n === chapter + 1 && book >= 0 && n <= CHAPTERS[book]) return { book, n, name };
    let b = findBook(m[1]);
    if (b < 0 && name.startsWith('salmo')) b = 18;
    // Nombre con errata ("ECLESTIASTÉS 1"): si acaba de terminar un libro y empieza un capítulo 1, es el siguiente.
    if (b < 0 && n === 1 && book >= 0 && chapter === CHAPTERS[book] && /^[\p{L}\d .]+$/u.test(m[1]) && m[1] === m[1].toUpperCase()) b = book + 1;
    if (b < 0 || b > 65 || n > CHAPTERS[b]) return null;
    if (b === book ? n !== chapter + 1 : (b < book || n !== 1)) return null;
    return { book: b, n, name };
  };

  // Marca los títulos (de sección o de libro): línea suelta, sin número al inicio ni puntuación al final,
  // seguida por un versículo, un título de capítulo u otro título.
  const startsNum = (p) => /^\d{1,3} \S/.test(p.text);
  const isRef = (p) => /^\(.{2,80}\)$/.test(p.text) || /^[-–—_=*\s]{4,}$/.test(p.text); // "(1 Cr. 1.5-23)" o una línea separadora
  const refTitle = (p) => !/^\d/.test(p.text) && p.text.length < 200 && /\([^()]*\d\s*[.:]\s*\d[^()]*\)$/.test(p.text); // "Título (1 R. 10.26-29)"
  const looksTitle = (p) => refTitle(p) || (p.n <= 3 && !/^\d/.test(p.text) && p.text.length < 90 * p.n && (!ENDS.test(p.text) || isRef(p)));
  // Sobrescrito antes de un título de capítulo ("Salmo de David."): línea suelta que empieza en mayúscula
  // después de una oración terminada. Una continuación de versículo empieza en minúscula o a mitad de frase.
  const prevEnded = (i) => { for (let k = i - 1; k >= 0; k--) if (!isTitle[k] && !marks[k]) return /[.?!»”"')]$/.test(paras[k].text); return true; };
  const looksSuper = (i) => paras[i].n <= 3 && paras[i].text.length < 260 && /^[\p{Lu}¿¡“"«(]/u.test(paras[i].text) && i > 0 && !marks[i - 1] && looksTitle(paras[i - 1]);
  const flush = () => {
    if (book >= 0 && chapter) {
      const gaps = [];
      books[book][chapter - 1] = splitVerses(buf.join(' '), gaps, ref?.books[book]?.[chapter - 1]?.length ?? 0);
      for (const v of gaps) damaged.push(`${BOOKS_ES[book][0]} ${chapter}:${v}`);
    }
    buf = [];
  };
  // Primera pasada: localizar los títulos de capítulo en orden.
  const marks = new Array(paras.length).fill(null);
  for (let i = 0; i < paras.length; i++) {
    const h = heading(paras[i]);
    if (h) { marks[i] = h; book = h.book; chapter = h.n; headName = h.name; }
  }
  const isTitle = new Array(paras.length).fill(false);
  const nextHeadBook = (i) => { for (let k = i + 1; k < paras.length && k < i + 6; k++) if (marks[k]) return marks[k].book; return -1; };
  for (let i = paras.length - 2; i >= 0; i--) {
    if (marks[i]) continue;
    const beforeHead = !!marks[i + 1] || isTitle[i + 1];
    const inPsalms = nextHeadBook(i) === 18;
    if (looksTitle(paras[i])) isTitle[i] = beforeHead || startsNum(paras[i + 1]);
    // Título en forma de pregunta o exclamación ("¿Quién es el mayor?") entre dos versículos.
    else if (paras[i].single && paras[i].text.length < 70 && /^[¿¡].*[?!]$/.test(paras[i].text) && (beforeHead || startsNum(paras[i + 1]))) isTitle[i] = 'q';
    // Salmos: lo que va justo antes de "SALMO n" y no empieza con número es el título o el sobrescrito.
    else if (inPsalms && marks[i + 1] && !/^\d/.test(paras[i].text) && paras[i].n <= 4) isTitle[i] = true;
    else if (beforeHead && nextHeadBook(i) === 18 && looksSuper(i)) isTitle[i] = 'super'; // solo los Salmos llevan sobrescrito
  }
  for (let i = 0; i < paras.length; i++) if (isTitle[i] === 'q' && !prevEnded(i)) isTitle[i] = false;
  // Título en medio de un versículo: línea suelta y corta, sin puntuación final, entre una oración terminada
  // y un párrafo que empieza con mayúscula.
  for (let i = 1; i < paras.length - 1; i++) {
    const p = paras[i];
    if (isTitle[i] || marks[i] || !p.single || p.text.length > 60 || ENDS.test(p.text) || !/^\p{Lu}/u.test(p.text) || /^selah$/i.test(p.text)) continue;
    if (/[.?!]$/.test(paras[i - 1].text) && !marks[i + 1] && /^[\p{Lu}¿¡“"«]/u.test(paras[i + 1].text)) isTitle[i] = true;
  }
  for (let i = 0; i < paras.length; i++) if (isTitle[i] === 'super' && !prevEnded(i)) { // era continuación: se deshace la cadena
    for (let k = i; k >= 0 && isTitle[k] && !marks[k]; k--) isTitle[k] = false;
  }
  // Segunda pasada: reunir el texto de cada capítulo.
  book = -1; chapter = 0;
  for (let i = 0; i < paras.length; i++) {
    if (marks[i]) { flush(); book = marks[i].book; chapter = marks[i].n; continue; }
    if (book < 0 || isTitle[i]) continue;
    buf.push(paras[i].text);
  }
  flush();

  const warnings = [];
  const missing = [];
  for (let b = 0; b < 66; b++) for (let c = 0; c < CHAPTERS[b]; c++) if (!books[b][c]?.length) missing.push(`${BOOKS_ES[b][0]} ${c + 1}`);
  if (missing.length) warnings.push(`No encontré ${missing.length} capítulo(s): ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? '…' : ''}`);
  if (damaged.length) warnings.push(`El PDF no trae bien marcado(s) ${damaged.length} versículo(s), que quedaron unidos al anterior: ${damaged.slice(0, 8).join(', ')}${damaged.length > 8 ? '…' : ''}`);
  return { books, warnings, missing: missing.length, damaged };
}

/** Compara con una Biblia de referencia y avisa de capítulos con distinto número de versículos. */
export function compareShape(books, ref) {
  const diff = [];
  for (let b = 0; b < 66; b++) for (let c = 0; c < ref.books[b].length; c++) {
    const n = books[b]?.[c]?.length ?? 0;
    if (n && n !== ref.books[b][c].length) diff.push(`${BOOKS_ES[b][0]} ${c + 1} (${n} en vez de ${ref.books[b][c].length})`);
  }
  return diff;
}
