// Importa una Biblia aportada por el usuario al formato compacto de Proclama.
// Formatos admitidos:
//  - Proclama: { books: [ [ [versículo, ...], ...capítulos ], ...66 libros ] }
//  - scrollmapper/bible_databases: { books: [{ name, chapters: [{ verses: [{ text }] }] }] }
//  - Lista de libros: [{ name|abbrev, chapters: [[versículo, ...], ...] }]
//  - Un archivo JSON por libro (genesis.json, 1_juan.json…), cada uno con [[versículo, ...], ...capítulos]
import { findBook, BOOKS_ES } from './bible.js';

const clean = (v) => String(typeof v === 'object' && v ? v.text ?? '' : v ?? '')
  .replace(/\/n|\|par\b/g, ' ').replace(/_/g, '').replace(/(\p{L})=(\p{L})/gu, '$1-$2').replace(/\s+/g, ' ').trim();
const chapter = (c) => (Array.isArray(c) ? c : c?.verses ?? []).map(clean);
const book = (b) => (Array.isArray(b) ? b : b?.chapters ?? []).map(chapter);

/** @param {{name: string, content: string}[]} files  @param {{id?: string, name: string, lang?: string}} meta */
export function buildBible(files, meta) {
  const name = String(meta.name || '').trim();
  if (!name) throw new Error('Escribe el nombre de la Biblia');
  const id = String(meta.id || name).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'biblia';
  let books;
  const parsed = files.map(f => ({ name: f.name, data: JSON.parse(String(f.content).replace(/^﻿/, '')) }));
  const whole = parsed.length === 1 ? parsed[0].data : null;
  if (whole && Array.isArray(whole.books ?? whole) && (whole.books ?? whole).length >= 66) {
    books = (whole.books ?? whole).slice(0, 66).map(book);
  } else {
    books = new Array(66).fill(null);
    for (const f of parsed) {
      if (!Array.isArray(f.data) || !Array.isArray(f.data[0])) continue; // índices y otros archivos
      const i = findBook(f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '));
      if (i >= 0 && !books[i]) books[i] = book(f.data);
    }
    const missing = books.map((b, i) => (b ? null : BOOKS_ES[i][0])).filter(Boolean);
    if (missing.length === 66) throw new Error('No reconocí el formato. Elige un JSON con la Biblia completa o los 66 archivos, uno por libro.');
    if (missing.length) throw new Error(`Faltan ${missing.length} libro(s): ${missing.slice(0, 6).join(', ')}${missing.length > 6 ? '…' : ''}`);
  }
  if (books.some(b => !b.length || b.some(c => !c.length))) throw new Error('El archivo tiene libros o capítulos vacíos');
  return { id, name, lang: meta.lang || 'es', custom: true, books };
}
