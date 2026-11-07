#!/usr/bin/env node
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { uniqueCombinations, totalCombinations } = require('../src/combinations');
const { renderVideo } = require('../src/render');

// Uso:
//   node bin/cli.js --apertura a.mp4 --demo b1.mp4,b2.mp4 --cierre c.mp4 [--max 5] [--seed 1] [--out salida]
function parseArgs(argv) {
  const opts = { roles: {}, max: 5, seed: 1, out: 'salida' };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === '--max') { opts.max = Number(value); i++; }
    else if (key === '--seed') { opts.seed = Number(value); i++; }
    else if (key === '--out') { opts.out = value; i++; }
    else if (key.startsWith('--')) {
      opts.roles[key.slice(2)] = value.split(',').map((p) => path.resolve(p.trim()));
      i++;
    }
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (Object.keys(opts.roles).length === 0) {
    console.error('Indica al menos un rol, por ejemplo: --apertura a.mp4 --demo b.mp4 --cierre c.mp4');
    process.exit(1);
  }
  for (const clips of Object.values(opts.roles)) {
    for (const f of clips) if (!fs.existsSync(f)) throw new Error(`No existe: ${f}`);
  }
  const combos = uniqueCombinations(opts.roles, opts.max, opts.seed);
  console.log(`Combinaciones posibles: ${totalCombinations(opts.roles)}. Generando ${combos.length}.`);
  fs.mkdirSync(opts.out, { recursive: true });
  for (let i = 0; i < combos.length; i++) {
    const output = path.join(opts.out, `video_${String(i + 1).padStart(3, '0')}.mp4`);
    await renderVideo(combos[i].clips, output);
    console.log(`OK ${output}`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
