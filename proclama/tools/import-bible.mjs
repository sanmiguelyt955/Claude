// Añade a tu instalación una Biblia que tengas derecho a usar (no se guarda en el repositorio, va a data/bibles/).
// Uso: node tools/import-bible.mjs <archivo.json | carpeta con un JSON por libro> "Nombre" [id]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBible } from '../public/shared/bible-import.js';
const [, , src, name, id] = process.argv;
if (!src || !name) { console.error('Uso: node tools/import-bible.mjs <archivo.json | carpeta> "Nombre" [id]'); process.exit(1); }
const list = fs.statSync(src).isDirectory() ? fs.readdirSync(src).filter(f => f.endsWith('.json')).map(f => path.join(src, f)) : [src];
const bible = buildBible(list.map(f => ({ name: path.basename(f), content: fs.readFileSync(f, 'utf8') })), { name, id });
const dir = path.join(path.resolve(process.env.PROCLAMA_DATA || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data')), 'bibles');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, bible.id + '.json'), JSON.stringify(bible));
console.log(`"${bible.name}" (${bible.id}): ${bible.books.flat(2).length} versículos -> ${dir}`);
