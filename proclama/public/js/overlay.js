// Capa de puntero láser, anotaciones y lupa sobre una página de PDF. La usan el proyector y la consola del presentador:
// los dos dibujan el mismo estado (`ov` del estado en vivo), así lo que se ve en uno es lo que se ve en el otro.
const NS = 'http://www.w3.org/2000/svg';
const node = (name, attrs = {}) => { const e = document.createElementNS(NS, name); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };

/** Distancia máxima (en fracciones de página) para considerar que dos puntos son el mismo al guardar un trazo. */
export const MIN_STEP = 0.0015;

/** Rectángulo (en un lienzo W×H) que ocupa una página de proporción `asp` ajustada con «contain». */
export function fitRect(asp, W, H) {
  const w = asp > W / H ? W : H * asp, h = asp > W / H ? W / asp : H;
  return { left: (W - w) / 2, top: (H - h) / 2, width: w, height: h };
}

/** Transformación CSS que acerca la región `zoom` (fracciones de la página) para que ocupe el lienzo W×H. */
export function zoomTransform(zoom, asp, W, H) {
  if (!zoom) return '';
  const r = fitRect(asp, W, H);
  const rw = Math.max(0.02, zoom.w) * r.width, rh = Math.max(0.02, zoom.h) * r.height;
  const s = Math.min(8, Math.min(W / rw, H / rh));
  const cx = r.left + (zoom.x + zoom.w / 2) * r.width, cy = r.top + (zoom.y + zoom.h / 2) * r.height;
  return `translate(${(W / 2 - s * cx).toFixed(1)}px, ${(H / 2 - s * cy).toFixed(1)}px) scale(${s.toFixed(4)})`;
}

const pathData = (s, asp) => 'M' + s.p.map(([x, y], i) => `${(x * asp).toFixed(4)} ${y.toFixed(4)}`).join('L') + (s.p.length === 1 ? `L${(s.p[0][0] * asp + 0.0001).toFixed(4)} ${s.p[0][1].toFixed(4)}` : '');
function strokeEl(s, asp) {
  const p = node('path', { d: pathData(s, asp), fill: 'none', stroke: s.c, 'stroke-width': s.w, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  if (s.a < 1) p.setAttribute('stroke-opacity', s.a); // el resaltador es translúcido: se ve el texto debajo, también en fondos oscuros
  return p;
}

/** @returns {{ svg: SVGSVGElement, update(ov: object|null, asp: number): void }} */
export function createOverlay() {
  const svg = node('svg', { class: 'ov-svg', preserveAspectRatio: 'none' });
  const strokes = node('g'), draft = node('g'), dot = node('circle', { r: 0.011, 'stroke-width': 0.003, stroke: '#fff', visibility: 'hidden' });
  svg.append(strokes, draft, dot);
  let lastSv = -1, lastAsp = 0;
  return {
    svg,
    update(ov, asp) {
      if (!asp) return;
      ov ??= {};
      if (asp !== lastAsp) svg.setAttribute('viewBox', `0 0 ${asp} 1`);
      if (asp !== lastAsp || (ov.sv ?? 0) !== lastSv) { // los trazos terminados solo se redibujan cuando cambian
        strokes.replaceChildren(...(ov.strokes ?? []).map(s => strokeEl(s, asp)));
        lastSv = ov.sv ?? 0; lastAsp = asp;
      }
      draft.replaceChildren(...(ov.draft?.p?.length ? [strokeEl(ov.draft, asp)] : []));
      if (ov.pointer) {
        dot.setAttribute('cx', (ov.pointer.x * asp).toFixed(4)); dot.setAttribute('cy', ov.pointer.y.toFixed(4));
        dot.setAttribute('fill', ov.pointer.c || '#ff2b2b'); dot.setAttribute('visibility', 'visible');
      } else dot.setAttribute('visibility', 'hidden');
    },
  };
}
