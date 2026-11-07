#!/usr/bin/env node
'use strict';

const path = require('node:path');

const AYUDA = `Vertiflow — vídeos verticales a partir de clips

Uso:
  vertiflow generar --apertura a.mp4 --demo b1.mp4,b2.mp4 --cierre c.mp4
                    [--musica cancion.mp3] [--drop 12.5] [--max 10]
                    [--resolucion 720p|1080p|1440p|4k] [--seed 1] [--out salida]
  vertiflow musica cancion.mp3            Detecta el momento fuerte
  vertiflow analizar <enlace o vídeo>     Planos y textos de un vídeo viral
  vertiflow separar <vídeo o audio>       Separa voz y música
  vertiflow app                           Abre la interfaz en el navegador
  vertiflow version                       Comprueba si hay versión nueva
`;

function parseFlags(argv) {
  const flags = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      flags[a.slice(2)] = argv[i + 1];
      i++;
    } else flags._.push(a);
  }
  return flags;
}

const ROLE_FLAGS = ['apertura', 'demo', 'cierre'];

async function cmdGenerar(f) {
  const { generate } = require('../src/project');
  const roles = {};
  for (const r of ROLE_FLAGS) if (f[r]) roles[r] = f[r].split(',').map((p) => path.resolve(p.trim()));
  if (!Object.keys(roles).length) throw new Error('Indica clips, por ejemplo: --apertura a.mp4 --demo b.mp4 --cierre c.mp4');
  const music = f.musica ? { path: path.resolve(f.musica), drop: f.drop !== undefined ? Number(f.drop) : undefined } : undefined;
  let last = -1;
  await generate(
    {
      roles,
      count: Number(f.max) || 5,
      seed: f.seed !== undefined ? Number(f.seed) : 1,
      resolution: f.resolucion || '1080p',
      music,
      outDir: f.out || 'salida',
    },
    (e) => {
      if (e.type === 'start') console.log(`Combinaciones posibles: ${e.possible}. Generando ${e.total}.`);
      if (e.type === 'progress') {
        const p = Math.floor(e.progress * 100);
        if (p >= last + 10) {
          last = p;
          process.stdout.write(`${p}% `);
        }
      }
      if (e.type === 'video') console.log(`\nOK ${e.file}  [${e.clips.join(' + ')}]`);
    }
  );
}

async function cmdMusica(f) {
  const { analyzeSong } = require('../src/music');
  const file = f._[1];
  if (!file) throw new Error('Indica una canción.');
  const r = await analyzeSong(path.resolve(file));
  console.log(`Duración: ${r.duration.toFixed(1)} s · Momento fuerte: ${r.drop} s`);
}

async function cmdAnalizar(f) {
  const viral = require('../src/viral');
  const src = f._[1];
  if (!src) throw new Error('Indica un enlace o un vídeo.');
  const out = f.out || path.resolve('analisis');
  const r = await viral.analyze(viral.isUrl(src) ? src : path.resolve(src), {
    workDir: out,
    threshold: Number(f.umbral) || 0.3,
    onEvent: (e) => e.type === 'stage' && console.log(`… ${e.stage}`),
  });
  await viral.closeOcr();
  const s = r.summary;
  console.log(`\n${s.shots} planos en ${s.duration} s · plano medio ${s.averageShot} s · gancho ${s.hookDuration} s`);
  for (const p of r.shots) console.log(`  ${String(p.index).padStart(2)}  ${p.start.toFixed(2)}–${p.end.toFixed(2)} s  ${p.text ? `«${p.text}»` : ''}`);
  if (r.ocrError) console.log(`Aviso: no se leyeron los textos (${r.ocrError})`);
  console.log(`\nDetalle en ${path.join(out, 'analisis.json')}`);
}

async function cmdSeparar(f) {
  const { separate } = require('../src/separate');
  const file = f._[1];
  if (!file) throw new Error('Indica un vídeo o un audio.');
  const r = await separate(path.resolve(file), path.resolve(f.out || 'separado'));
  console.log(`Voz: ${r.voice}\nMúsica: ${r.music}\nMétodo: ${r.method}`);
}

async function cmdApp() {
  const { start } = require('../server');
  const { url, dirs } = await start();
  console.log(`Vertiflow abierto en ${url}\nCarpeta de trabajo: ${dirs.root}\nPulsa Ctrl+C para cerrar.`);
  const opener = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try {
    require('node:child_process').spawn(opener[0], opener[1], { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
  } catch {
    // sin navegador disponible
  }
}

async function cmdVersion() {
  const { checkForUpdate } = require('../src/updates');
  const r = await checkForUpdate();
  if (r.error) console.log(`Versión ${r.current}. No se pudo comprobar: ${r.error}`);
  else if (r.available) console.log(`Hay versión nueva: ${r.latest} (tienes ${r.current}). ${r.download || ''}`);
  else console.log(`Tienes la última versión (${r.current}).`);
}

async function main() {
  const argv = process.argv.slice(2);
  // Compatibilidad: si empieza por --, se asume "generar".
  const cmd = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'generar';
  const f = parseFlags(cmd === 'generar' && argv[0] !== 'generar' ? ['generar', ...argv] : argv);
  const cmds = { generar: cmdGenerar, musica: cmdMusica, analizar: cmdAnalizar, separar: cmdSeparar, app: cmdApp, version: cmdVersion };
  if (!cmds[cmd] || argv.includes('--help') || argv.length === 0) {
    console.log(AYUDA);
    return;
  }
  await cmds[cmd](f);
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});

module.exports = { parseFlags };
