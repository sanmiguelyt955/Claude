// Copia la interfaz de eco-player a www/ para empaquetarla en la app de iPhone,
// sin modificar eco-player: solo añade native.js y la configuración de esta compilación.
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, '..', 'eco-player', 'public');
const www = join(root, 'www');

rmSync(www, { recursive: true, force: true });
cpSync(src, www, { recursive: true });
cpSync(join(root, 'native', 'native.js'), join(www, 'native.js'));
cpSync(join(root, 'native', 'native.css'), join(www, 'native.css'));

// URL opcional de un servidor Eco publicado, para abrir la parte de SoundCloud en Safari.
let server = (process.env.ECO_SERVER_URL || '').trim().replace(/\/+$/, '');
if (server && !/^https:\/\/[^\s"'<>]+$/.test(server)) {
  console.warn(`ECO_SERVER_URL ignorada (debe empezar por https://): ${server}`);
  server = '';
}
writeFileSync(join(www, 'eco-config.js'), `window.ECO_SERVER_URL = ${JSON.stringify(server)};\n`);

const indexPath = join(www, 'index.html');
let html = readFileSync(indexPath, 'utf8');
const anchor = '<script src="local-library.js"></script>';
if (!html.includes(anchor)) throw new Error('index.html de eco-player cambió: no encuentro local-library.js');
html = html
  .replace('<link rel="stylesheet" href="styles.css">', '<link rel="stylesheet" href="styles.css">\n  <link rel="stylesheet" href="native.css">')
  .replace(anchor, `<script src="eco-config.js"></script>\n  ${anchor}`)
  .replace('<script src="app.js"></script>', '<script src="app.js"></script>\n  <script src="native.js"></script>');
writeFileSync(indexPath, html);
console.log(`www/ listo desde eco-player/public${server ? ` (servidor: ${server})` : ''}`);
