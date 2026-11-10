// Prepara una versión nueva para publicar: sube el número de versión y genera release.json
// (la lista de archivos con su huella, que las instalaciones usan para actualizarse).
// Uso: node tools/make-release.mjs <versión> "Novedad 1" "Novedad 2" …
// Después: haz commit y push a la rama publicada (main). Las instalaciones verán «Actualizar a <versión>».
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listFiles, compareVersions } from '../lib/update.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const [, , version, ...notes] = process.argv;
if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) { console.error('Uso: node tools/make-release.mjs 1.2.3 "Qué cambió" "Otra novedad"'); process.exit(1); }
const pkgFile = path.join(root, 'package.json'), modelFile = path.join(root, 'public/shared/model.js');
const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
if (compareVersions(version, pkg.version) < 0) { console.error(`La versión ${version} es más vieja que la actual (${pkg.version}).`); process.exit(1); }
pkg.version = version;
fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n');
fs.writeFileSync(modelFile, fs.readFileSync(modelFile, 'utf8').replace(/export const VERSION = '[^']*';/, `export const VERSION = '${version}';`));
const files = await listFiles(root);
const release = { name: 'Proclama', version, date: new Date().toISOString().slice(0, 10), notes, files };
fs.writeFileSync(path.join(root, 'release.json'), JSON.stringify(release, null, 1) + '\n');
console.log(`Versión ${version} lista: ${Object.keys(files).length} archivos. Falta hacer commit y push para publicarla.`);
