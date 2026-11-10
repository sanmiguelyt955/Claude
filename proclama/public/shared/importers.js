// Importadores de canciones. Funcionan igual en el navegador y en Node (sin DOMParser).
// Formatos: texto plano, ChordPro, OpenSong (XML), OpenLyrics/OpenLP (XML), Holyrics (JSON),
// copia de seguridad de Proclama (JSON) y el RTF que usa EasyWorship 6.1 para las letras.
import { uid, sectionHeader } from './model.js';

const song = (o) => ({
  id: uid(), title: 'Sin título', author: '', copyright: '', ccli: '', order: '', themeId: '', text: '', ...o,
  title: String(o.title || 'Sin título').trim(),
  text: String(o.text || '').replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim(),
});

const xmlDecode = (s) => String(s ?? '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(Number(d)))
  .replace(/&amp;/g, '&');

const tag = (xml, name) => {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(xml);
  return m ? xmlDecode(m[1]).trim() : '';
};

const LABELS = { v: 'Verso', c: 'Coro', p: 'Pre-coro', b: 'Puente', e: 'Final', i: 'Intro', t: 'Tag', o: 'Final' };
const codeToLabel = (code) => {
  const m = /^([a-z]+)\s*(\d*)/i.exec(String(code).trim());
  if (!m) return String(code);
  const base = LABELS[m[1].toLowerCase()[0]] ?? m[1];
  return base + (m[2] ? ' ' + Number(m[2]) : '');
};

// ---------- Texto plano ----------
export function importPlainText(content, filename = '') {
  const lines = String(content).replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  while (lines.length && !lines[0].trim()) lines.shift();
  let title = filename.replace(/\.[^.]+$/, '');
  // Si la primera línea está sola (seguida de línea en blanco) y no es un encabezado de sección, es el título.
  if (lines.length > 1 && lines[0].trim() && !lines[1].trim() && !sectionHeader(lines[0])) title = lines.shift().trim();
  const meta = {};
  const body = lines.filter(l => {
    const m = /^(autor|author|artista|artist|copyright|ccli)\s*[:=]\s*(.+)$/i.exec(l.trim());
    if (!m) return true;
    const k = m[1].toLowerCase();
    meta[k === 'copyright' ? 'copyright' : k === 'ccli' ? 'ccli' : 'author'] = m[2].trim();
    return false;
  });
  return [song({ title, text: body.join('\n'), ...meta })];
}

// ---------- ChordPro ----------
export function importChordPro(content, filename = '') {
  const o = { title: filename.replace(/\.[^.]+$/, ''), author: '', copyright: '', ccli: '' };
  const out = [];
  for (const raw of String(content).replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (line.startsWith('#')) continue;
    const d = /^\{\s*([a-z_]+)\s*(?::\s*(.*?))?\s*\}$/i.exec(line);
    if (d) {
      const k = d[1].toLowerCase(), v = d[2] ?? '';
      if (k === 'title' || k === 't') o.title = v;
      else if (k === 'artist' || k === 'subtitle' || k === 'st' || k === 'composer') o.author = o.author || v;
      else if (k === 'copyright') o.copyright = v;
      else if (k === 'ccli') o.ccli = v;
      else if (k === 'soc' || k === 'start_of_chorus') out.push('', v || 'Coro');
      else if (k === 'sov' || k === 'start_of_verse') out.push('', v || 'Verso');
      else if (k === 'sob' || k === 'start_of_bridge') out.push('', v || 'Puente');
      else if (/^(eoc|eov|eob|end_of_)/.test(k)) out.push('');
      else if (k === 'comment' || k === 'c' || k === 'ci') { if (sectionHeader(v)) out.push('', v); }
      continue;
    }
    out.push(raw.replace(/\[[^\]]*\]/g, '').replace(/\s{2,}/g, ' ').trim());
  }
  return [song({ ...o, text: out.join('\n') })];
}

// ---------- OpenSong ----------
export function importOpenSong(xml, filename = '') {
  const lyrics = tag(xml, 'lyrics');
  const out = [];
  for (const raw of lyrics.replace(/\r\n?/g, '\n').split('\n')) {
    if (raw.startsWith('.') || raw.startsWith(';')) continue; // acordes y comentarios
    const h = /^\s*\[([^\]]+)\]\s*$/.exec(raw);
    if (h) { out.push('', codeToLabel(h[1])); continue; }
    if (raw.trim() === '||' || raw.trim() === '---') { out.push(''); continue; }
    out.push(raw.replace(/^[ \d]/, '').replace(/[_|]/g, '').replace(/\s{2,}/g, ' ').trim());
  }
  return [song({
    title: tag(xml, 'title') || filename.replace(/\.[^.]+$/, ''), author: tag(xml, 'author'),
    copyright: tag(xml, 'copyright'), ccli: tag(xml, 'ccli'), order: tag(xml, 'presentation'), text: out.join('\n'),
  })];
}

// ---------- OpenLyrics (OpenLP) ----------
export function importOpenLyrics(xml, filename = '') {
  const out = [];
  const re = /<verse\s[^>]*name="([^"]+)"[^>]*>([\s\S]*?)<\/verse>/gi;
  let m;
  while ((m = re.exec(xml))) {
    out.push('', codeToLabel(m[1]));
    const linesRe = /<lines(?:\s[^>]*)?>([\s\S]*?)<\/lines>/gi;
    let l, first = true;
    while ((l = linesRe.exec(m[2]))) {
      if (!first) out.push('');
      first = false;
      out.push(...xmlDecode(l[1].replace(/<br\s*\/?>/gi, '\n').replace(/<chord[^>]*\/>/gi, '').replace(/<[^>]+>/g, ''))
        .split('\n').map(s => s.trim()).filter(Boolean));
    }
  }
  const authors = [...xml.matchAll(/<author(?:\s[^>]*)?>([\s\S]*?)<\/author>/gi)].map(a => xmlDecode(a[1]).trim());
  return [song({
    title: tag(xml, 'title') || filename.replace(/\.[^.]+$/, ''), author: authors.join(', '),
    copyright: tag(xml, 'copyright'), ccli: tag(xml, 'ccliNo'), order: tag(xml, 'verseOrder'), text: out.join('\n'),
  })];
}

// ---------- JSON (Holyrics / Proclama) ----------
export function importJson(content) {
  const data = JSON.parse(String(content).replace(/^﻿/, ''));
  const list = Array.isArray(data) ? data : Array.isArray(data.songs) ? data.songs : [data];
  return list.filter(o => o && typeof o === 'object').map(o => {
    if (o.lyrics && typeof o.lyrics === 'object' && Array.isArray(o.lyrics.paragraphs)) { // Holyrics
      const text = o.lyrics.paragraphs.map(p => {
        const head = p.description && sectionHeader(p.description) ? p.description + '\n' : '';
        return head + String(p.text ?? '').trim();
      }).join('\n\n');
      return song({ title: o.title, author: o.artist || o.author || '', copyright: o.copyright || '', ccli: o.ccli || '', text });
    }
    return song({
      title: o.title, author: o.author || o.artist || '', copyright: o.copyright || '', ccli: o.ccli || '', order: o.order || '',
      text: typeof o.text === 'string' ? o.text : typeof o.lyrics === 'string' ? o.lyrics : '',
    });
  });
}

// ---------- RTF (EasyWorship) ----------
const CP1252 = '€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f\u0090‘’“”•–—˜™š›œ\u009džŸ';
const SKIP_GROUPS = new Set(['fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'datastore', 'themedata', 'generator', 'listtable', 'listoverridetable']);

/** Convierte RTF a texto plano (suficiente para las letras de EasyWorship). */
export function rtfToText(rtf) {
  const s = String(rtf ?? '');
  if (!s.trimStart().startsWith('{\\rtf')) return s;
  let out = '';
  const stack = [];
  let skip = false, uc = 1, pendingSkip = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '{') { stack.push({ skip, uc }); continue; }
    if (c === '}') { const st = stack.pop(); if (st) ({ skip, uc } = st); continue; }
    if (c === '\\') {
      const n = s[i + 1];
      if (n === '\\' || n === '{' || n === '}') { if (!skip) out += n; i++; continue; }
      if (n === '~') { if (!skip) out += ' '; i++; continue; }
      if (n === '_') { if (!skip) out += '-'; i++; continue; }
      if (n === '*') { skip = true; i++; continue; }
      if (n === '\n' || n === '\r') { if (!skip) out += '\n'; i++; continue; }
      if (n === "'") {
        const code = parseInt(s.substr(i + 2, 2), 16);
        i += 3;
        if (pendingSkip > 0) { pendingSkip--; continue; }
        if (!skip && !Number.isNaN(code)) out += code >= 0x80 && code <= 0x9f ? CP1252[code - 0x80] : String.fromCharCode(code);
        continue;
      }
      const m = /^([a-zA-Z]+)(-?\d+)? ?/.exec(s.slice(i + 1, i + 40));
      if (!m) continue;
      i += m[0].length;
      const word = m[1], param = m[2] !== undefined ? Number(m[2]) : null;
      if (SKIP_GROUPS.has(word)) { skip = true; continue; }
      if (skip) continue;
      if (word === 'par' || word === 'line' || word === 'sect' || word === 'page') out += '\n';
      else if (word === 'tab') out += ' ';
      else if (word === 'uc') uc = param ?? 1;
      else if (word === 'u' && param !== null) { out += String.fromCodePoint(param < 0 ? param + 65536 : param); pendingSkip = uc; }
      else if (word === 'emdash') out += '—';
      else if (word === 'endash') out += '–';
      else if (word === 'lquote') out += '‘';
      else if (word === 'rquote') out += '’';
      else if (word === 'ldblquote') out += '“';
      else if (word === 'rdblquote') out += '”';
      continue;
    }
    if (c === '\r' || c === '\n') continue;
    if (pendingSkip > 0) { pendingSkip--; continue; }
    if (!skip) out += c;
  }
  // Combina pares sustitutos que llegaron como dos \u
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Fila de EasyWorship (tabla song + words RTF) -> canción de Proclama. */
export function easyWorshipRowToSong(row, wordsRtf) {
  return song({
    title: row.title, author: row.author || '', copyright: row.copyright || '',
    ccli: row.reference_number || '', text: rtfToText(wordsRtf),
  });
}

/** Elige el importador por extensión/contenido. Devuelve una lista de canciones. */
export function importSongFile(filename, content) {
  const name = String(filename).toLowerCase();
  const head = String(content).slice(0, 2000);
  if (name.endsWith('.json') || /^\s*[\[{]\s*"/.test(head)) return importJson(content);
  if (/<song[\s>][\s\S]*<lyrics>[\s\S]*<verse\s/i.test(String(content)) || /openlyrics/i.test(head)) return importOpenLyrics(content, filename);
  if (/<song[\s>]/i.test(head) && /<lyrics>/i.test(String(content))) return importOpenSong(content, filename);
  if (/\.(cho|crd|chopro|chordpro|pro)$/.test(name) || /^\{\s*(title|t)\s*:/im.test(head)) return importChordPro(content, filename);
  if (head.trimStart().startsWith('{\\rtf')) return [song({ title: filename.replace(/\.[^.]+$/, ''), text: rtfToText(content) })];
  return importPlainText(content, filename);
}
