// Convierte Biblias de dominio público (formato JSON de scrollmapper/bible_databases)
// al formato compacto de Proclama: { id, name, lang, bookNames?, books: [ [ [versículo, ...], ...capítulos ], ...libros ] }
// Uso: node tools/build-bibles.mjs <entrada.json> <id> <nombre> <idioma> [--nombres-originales]
import fs from 'node:fs';
const [, , input, id, name, lang, flag] = process.argv;
if (!input || !id) { console.error('Uso: node tools/build-bibles.mjs entrada.json id "Nombre" es|en [--nombres-originales]'); process.exit(1); }
const src = JSON.parse(fs.readFileSync(input, 'utf8'));
const books = src.books.map(b => b.chapters.map(c => c.verses.map(v => String(v.text).trim())));
const out = { id, name, lang, books };
if (flag === '--nombres-originales') out.bookNames = src.books.map(b => b.name);
const dest = new URL(`../public/bibles/${id}.json`, import.meta.url);
fs.writeFileSync(dest, JSON.stringify(out));
const idxPath = new URL('../public/bibles/index.json', import.meta.url);
let idx = []; try { idx = JSON.parse(fs.readFileSync(idxPath, 'utf8')); } catch {}
idx = idx.filter(x => x.id !== id); idx.push({ id, name, lang });
fs.writeFileSync(idxPath, JSON.stringify(idx, null, 1));
console.log(`${id}: ${books.length} libros, ${books.flat(2).length} versículos`);
