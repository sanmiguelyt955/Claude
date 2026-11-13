// Iconos propios en SVG (trazo simple, heredan el color del texto). Se ven igual en cualquier sistema.
const P = (d) => `<path d="${d}"/>`;
const F = (d) => `<path d="${d}" fill="currentColor" stroke="none"/>`;
const C = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}"/>`;
const R = (x, y, w, h, r = 2) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}"/>`;
const ICONS = {
  play: F('M7 4.5v15l12.5-7.5z'),
  plus: P('M12 5v14M5 12h14'),
  edit: P('M4 20h4L19 9l-4-4L4 16zM14 6l4 4'),
  trash: P('M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3'),
  up: P('M12 19V5M6 11l6-6 6 6'),
  down: P('M12 5v14M6 13l6 6 6-6'),
  x: P('M6 6l12 12M18 6L6 18'),
  left: P('M15 5l-7 7 7 7'),
  right: P('M9 5l7 7-7 7'),
  monitor: R(3, 4, 18, 13) + P('M8 21h8M12 17v4'),
  upload: P('M12 16V4M7 9l5-5 5 5M4 20h16'),
  settings: P('M4 7h9M19 7h1M4 17h3M13 17h7') + C(16, 7, 2.5) + C(10, 17, 2.5),
  music: P('M9 18V5l11-2v13') + C(6.5, 18, 2.5) + C(17.5, 16, 2.5),
  book: P('M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11M12 6.5v5M10 8.5h4'),
  image: R(3, 5, 18, 14) + C(8.5, 10, 1.5) + P('M21 15l-5-5-9 9'),
  video: R(3, 6, 13, 12) + P('M16 10.5l5-3v9l-5-3'),
  palette: C(12, 12, 9) + F('M12 3a9 9 0 0 0 0 18z'),
  list: P('M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01'),
  text: P('M5 6h14M5 12h14M5 18h9'),
  search: C(11, 11, 6.5) + P('M20 20l-4.3-4.3'),
  black: `<rect x="4" y="5" width="16" height="14" rx="2" fill="currentColor"/>`,
  eyeoff: P('M3 3l18 18M10.6 6.2A9.7 9.7 0 0 1 12 6c5 0 8.5 4 9.5 6a12 12 0 0 1-2.7 3.6M6.5 7.6A12.6 12.6 0 0 0 2.5 12c1 2 4.5 6 9.5 6 1.3 0 2.5-.3 3.6-.7M9.9 9.9a3 3 0 0 0 4.2 4.2'),
  eye: P('M2.5 12c1-2 4.5-6 9.5-6s8.5 4 9.5 6c-1 2-4.5 6-9.5 6s-8.5-4-9.5-6z') + C(12, 12, 3),
  logo: C(12, 12, 9) + P('M12 7v10M8.5 10.5h7'),
  bell: P('M6 16v-5a6 6 0 1 1 12 0v5l2 2H4zM10 21h4'),
  clock: C(12, 12, 9) + P('M12 7v5l3 2'),
  message: P('M4 5h16v11H9l-5 4z'),
  copy: R(9, 9, 11, 11) + P('M5 15V5h10'),
  phone: R(7, 3, 10, 18) + P('M11 18h2'),
  broadcast: C(12, 12, 2) + P('M7.8 16.2a6 6 0 0 1 0-8.4M16.2 7.8a6 6 0 0 1 0 8.4M5 19a10 10 0 0 1 0-14M19 5a10 10 0 0 1 0 14'),
  more: P('M5 12h.01M12 12h.01M19 12h.01'),
};
export function icon(name, size = 18) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', size); s.setAttribute('height', size);
  s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2');
  s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true');
  s.classList.add('ic');
  s.innerHTML = ICONS[name] ?? '';
  return s;
}
/** Coloca iconos en los elementos del HTML que llevan data-icon="nombre". */
export function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach(e => { if (!e.querySelector(':scope > .ic')) e.prepend(icon(e.dataset.icon, Number(e.dataset.iconSize) || 18)); });
}
