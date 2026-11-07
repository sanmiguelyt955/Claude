'use strict';

// Genera combinaciones únicas de clips por roles, sin repetir.
// roles: { apertura: [ruta...], demo: [ruta...], cierre: [ruta...] }
// Orden de salida: el orden en que se declaran los roles.

function totalCombinations(roles) {
  return Object.values(roles).reduce((acc, clips) => acc * clips.length, 1);
}

// PRNG determinista (mulberry32) para que el mismo seed dé el mismo resultado.
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(items, rand) {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function allCombinations(roles) {
  const names = Object.keys(roles);
  let result = [[]];
  for (const name of names) {
    const next = [];
    for (const prefix of result) {
      for (const clip of roles[name]) next.push([...prefix, clip]);
    }
    result = next;
  }
  return result.map((clips) => ({ clips }));
}

// Devuelve hasta `count` combinaciones distintas, elegidas al azar con `seed`.
function uniqueCombinations(roles, count, seed = 1) {
  for (const [name, clips] of Object.entries(roles)) {
    if (!Array.isArray(clips) || clips.length === 0) {
      throw new Error(`El rol "${name}" no tiene clips.`);
    }
  }
  const total = totalCombinations(roles);
  const wanted = Math.min(count, total);
  // Si el espacio es pequeño, se barajan todas; si es grande, se evita generar todo.
  if (total <= 10000) {
    return shuffle(allCombinations(roles), rng(seed)).slice(0, wanted);
  }
  const rand = rng(seed);
  const seen = new Set();
  const out = [];
  const names = Object.keys(roles);
  while (out.length < wanted) {
    const clips = names.map((n) => roles[n][Math.floor(rand() * roles[n].length)]);
    const key = clips.join('\u0000');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ clips });
  }
  return out;
}

module.exports = { totalCombinations, uniqueCombinations, rng };
