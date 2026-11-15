// Cronómetro del presentador: formato del tiempo y color según lo que falta (sin dependencias del navegador).

const p2 = (n) => String(n).padStart(2, '0');
/** Tiempo transcurrido como mm:ss (o h:mm:ss), sin redondear hacia arriba. */
export const mmss = (sec) => { const s = Math.max(0, Math.floor(sec)), hh = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return hh ? `${hh}:${p2(m)}:${p2(s % 60)}` : `${p2(m)}:${p2(s % 60)}`; };

/** Color del cronómetro según el tiempo que falta (más de 5 min: normal; en 0: ámbar; −2,5 min: naranja; −5 min: rojo). */
const STOPS = [[300, [234, 238, 246]], [0, [255, 194, 71]], [-150, [255, 138, 61]], [-300, [255, 77, 94]]];
export function timerColor(remaining) {
  if (remaining >= STOPS[0][0]) return `rgb(${STOPS[0][1].join(',')})`;
  for (let i = 1; i < STOPS.length; i++) {
    const [t0, c0] = STOPS[i - 1], [t1, c1] = STOPS[i];
    if (remaining >= t1) { const k = (t0 - remaining) / (t0 - t1); return `rgb(${c0.map((v, j) => Math.round(v + (c1[j] - v) * k)).join(',')})`; }
  }
  return `rgb(${STOPS.at(-1)[1].join(',')})`;
}
