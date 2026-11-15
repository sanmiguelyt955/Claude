// Sección «Presentar PDF»: consola del presentador para dos pantallas.
// Funciones tomadas del estudio de pympress (ver docs/pympress-ingenieria-inversa.md), escritas desde cero para la web:
// diapositiva actual y siguiente, cronómetro con tiempo previsto, reloj, ir a una página, cuadrícula de páginas,
// pantalla en negro, puntero láser, resaltador y lápiz con deshacer, lupa e intercambio de pantallas.
// Sin notas del presentador. El proyector (output.html) solo muestra la página actual con lo que se dibuje encima.
import { icon } from './icons.js';
import { resolveSrc } from './store.js';
import { createOverlay, fitRect, MIN_STEP } from './overlay.js';
import { timerColor, mmss } from '../shared/timer.js';
import { pdfToPresentation, pdfDaysLeft, pdfLastUse, PDF_KEEP_DAYS } from '../shared/model.js';

/** Lápices y resaltadores (teclas 1 a 7). Los anchos son fracciones de la altura de la página. */
export const PENS = [
  { id: 1, kind: 'marker', name: 'Resaltador amarillo', c: '#ffe600', a: 0.45, w: 0.034 },
  { id: 2, kind: 'marker', name: 'Resaltador verde', c: '#7dff00', a: 0.45, w: 0.034 },
  { id: 3, kind: 'marker', name: 'Resaltador rosa', c: '#ff0080', a: 0.45, w: 0.034 },
  { id: 4, kind: 'marker', name: 'Resaltador azul', c: '#3a3aff', a: 0.45, w: 0.034 },
  { id: 5, kind: 'pen', name: 'Lápiz rojo', c: '#ef2929', a: 1, w: 0.005 },
  { id: 6, kind: 'pen', name: 'Lápiz azul', c: '#0060ff', a: 1, w: 0.005 },
  { id: 7, kind: 'pen', name: 'Lápiz negro', c: '#111111', a: 1, w: 0.005 },
];
const LASERS = [['Rojo', '#ff2b2b'], ['Verde', '#22d35a'], ['Azul', '#3a8bff']];

const relDays = (ms) => { const d = Math.floor((Date.now() - ms) / 86400e3); return d <= 0 ? 'hoy' : d === 1 ? 'ayer' : `hace ${d} días`; };
const clamp01 = (v) => Math.max(0, Math.min(1, v));

/**
 * @param {{ store: object, root: HTMLElement, h: Function, toast: Function, addToSchedule: Function,
 *           openProjector: Function, swapScreens: Function }} ctx
 */
export function createPresenter(ctx) {
  const { store, root, h, toast } = ctx;
  const P = {
    pdf: null, pres: null, idle: 0, tool: 'none', pen: PENS[0], laser: LASERS[0][1], asp: 16 / 9,
    overview: false, ann: new Map(), sv: Date.now(), busy: null, lastIndex: -1,
    timer: { running: false, elapsed: 0, since: 0, ett: Number(localStorage.getItem('proclama.pdf.ett')) || 0 },
  };
  const el = {};
  const overlay = createOverlay();

  // ---------- estado derivado ----------
  const live = () => store.live;
  const isLive = () => !!P.pdf && live().pres?.pdfId === P.pdf.id;
  const total = () => P.pdf?.pages ?? 0;
  const index = () => (isLive() ? live().index : P.idle);
  const pageKey = (i) => `${P.pdf.id}:${i}`;
  const pageAnn = (i) => { const k = pageKey(i); if (!P.ann.has(k)) P.ann.set(k, { strokes: [], redo: [] }); return P.ann.get(k); };
  const ovFor = (i) => ({ strokes: P.ann.get(pageKey(i))?.strokes ?? [], sv: ++P.sv });
  const patch = (p) => store.dispatch({ type: 'overlay', patch: p });

  // ---------- cronómetro ----------
  const elapsed = () => P.timer.elapsed + (P.timer.running ? (Date.now() - P.timer.since) / 1000 : 0);
  function timerStart() { if (!P.timer.running) { P.timer.running = true; P.timer.since = Date.now(); } }
  function timerPause() { if (P.timer.running) { P.timer.elapsed = elapsed(); P.timer.running = false; } }
  const timerToggle = () => { P.timer.running ? timerPause() : timerStart(); renderTimer(); };
  const timerReset = () => { P.timer.elapsed = 0; P.timer.since = Date.now(); renderTimer(); };

  // ---------- abrir, proyectar, navegar ----------
  function open(pdfId, project = false) {
    const pdf = (store.db.pdfs ?? []).find(p => p.id === pdfId);
    if (!pdf) return toast('Ese PDF ya no está en el historial (se quita si pasan 2 semanas sin abrirlo). Ábrelo otra vez.');
    if (Date.now() - (pdf.lastOpened ?? 0) > 3600e3) { pdf.lastOpened = Date.now(); store.saveDb(); } // abrirlo reinicia las 2 semanas
    const same = P.pdf?.id === pdf.id;
    P.pdf = pdf; P.pres = pdfToPresentation(pdf);
    if (!same) { P.idle = 0; P.tool = 'none'; P.overview = false; buildStrip(); }
    renderAll();
    if (project) start();
  }
  function start() {
    if (!P.pdf) return toast('Elige primero un PDF');
    store.dispatch({ type: 'show', pres: P.pres, index: P.idle });
    const ov = ovFor(P.idle); if (ov.strokes.length) patch(ov);
    timerStart(); renderAll();
    if (!ctx.hasProjector()) toast('Falta abrir el proyector: pulsa «Abrir proyector»');
  }
  function end() { store.dispatch({ type: 'close' }); timerPause(); P.tool = 'none'; renderAll(); }
  function go(i) {
    if (!P.pdf) return;
    i = Math.max(0, Math.min(total() - 1, i | 0));
    if (isLive()) { if (i !== live().index) store.dispatch({ type: 'goto', index: i, ov: ovFor(i) }); }
    else { P.idle = i; renderAll(); }
  }
  const step = (d) => go(index() + d);

  // ---------- herramientas ----------
  const needLive = () => { if (isLive()) return true; toast('Pulsa «Proyectar» para usar el puntero, las anotaciones y la lupa'); return false; };
  function setTool(t) {
    if (t !== 'none' && !needLive()) return;
    const prev = P.tool;
    P.tool = P.tool === t && t !== 'none' ? 'none' : t;
    if (prev === 'laser' && P.tool !== 'laser' && isLive()) patch({ pointer: null });
    renderTools();
  }
  function pickPen(pen) { P.pen = pen; if (!needLive()) return; P.tool = 'draw'; renderTools(); }
  function undo() {
    if (!isLive()) return; const a = pageAnn(index());
    if (a.strokes.length) { a.redo.push(a.strokes.pop()); patch({ strokes: [...a.strokes], sv: ++P.sv }); }
  }
  function redo() {
    if (!isLive()) return; const a = pageAnn(index());
    if (a.redo.length) { a.strokes.push(a.redo.pop()); patch({ strokes: [...a.strokes], sv: ++P.sv }); }
  }
  function clearPage() {
    if (!isLive()) return; const a = pageAnn(index());
    if (a.strokes.length) { a.redo = []; a.strokes = []; patch({ strokes: [], sv: ++P.sv }); }
  }
  const unzoom = () => { if (isLive() && live().ov?.zoom) patch({ zoom: null }); };

  // Posición del cursor como fracción de la página
  const at = (e) => { const r = el.slide.getBoundingClientRect(); return [clamp01((e.clientX - r.left) / r.width), clamp01((e.clientY - r.top) / r.height)]; };
  let drag = null, lastSent = 0;
  const throttled = (fn) => { const now = performance.now(); if (now - lastSent > 55) { lastSent = now; fn(); } };
  function onDown(e) {
    if (!isLive() || P.tool === 'none' || P.tool === 'laser' || e.button !== 0) return;
    el.slide.setPointerCapture(e.pointerId);
    const [x, y] = at(e);
    if (P.tool === 'draw') drag = { kind: 'draw', s: { c: P.pen.c, a: P.pen.a, w: P.pen.w, p: [[x, y]] } };
    else if (P.tool === 'erase') { drag = { kind: 'erase' }; eraseAt(x, y); }
    else if (P.tool === 'zoom') { drag = { kind: 'zoom', x0: x, y0: y, x, y }; drawZoomDrag(); }
    if (drag?.kind === 'draw') patch({ draft: drag.s });
  }
  function onMove(e) {
    if (!isLive()) return;
    const [x, y] = at(e);
    if (P.tool === 'laser') { throttled(() => patch({ pointer: { x, y, c: P.laser } })); return; }
    if (!drag) return;
    if (drag.kind === 'draw') {
      const last = drag.s.p.at(-1);
      if (Math.hypot(x - last[0], y - last[1]) < MIN_STEP) return;
      drag.s.p.push([x, y]); throttled(() => patch({ draft: { ...drag.s } }));
    } else if (drag.kind === 'erase') eraseAt(x, y);
    else if (drag.kind === 'zoom') { drag.x = x; drag.y = y; drawZoomDrag(); }
  }
  function onUp() {
    if (!drag) return;
    const d = drag; drag = null;
    if (d.kind === 'draw') {
      const a = pageAnn(index()); a.strokes.push(d.s); a.redo = [];
      patch({ strokes: [...a.strokes], draft: null, sv: ++P.sv });
    } else if (d.kind === 'zoom') {
      el.zoomDrag.hidden = true;
      const w = Math.abs(d.x - d.x0), hh = Math.abs(d.y - d.y0);
      if (w > 0.03 && hh > 0.03) { patch({ zoom: { x: Math.min(d.x, d.x0), y: Math.min(d.y, d.y0), w, h: hh } }); P.tool = 'none'; renderTools(); }
    }
  }
  function onLeave() { if (P.tool === 'laser' && isLive()) patch({ pointer: null }); }
  function eraseAt(x, y) {
    const a = pageAnn(index()), r = 0.03;
    const keep = a.strokes.filter(s => !s.p.some(([px, py]) => Math.hypot((px - x) * P.asp, py - y) < r));
    if (keep.length !== a.strokes.length) { a.strokes = keep; a.redo = []; patch({ strokes: [...keep], sv: ++P.sv }); }
  }
  function drawZoomDrag() {
    const d = drag; if (!d) return;
    Object.assign(el.zoomDrag.style, { left: Math.min(d.x, d.x0) * 100 + '%', top: Math.min(d.y, d.y0) * 100 + '%', width: Math.abs(d.x - d.x0) * 100 + '%', height: Math.abs(d.y - d.y0) * 100 + '%' });
    el.zoomDrag.hidden = false;
  }

  // ---------- PDF: abrir archivo, historial ----------
  async function importFile(file) {
    if (P.busy) return toast('Espera: todavía se está preparando otro PDF');
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') return toast('Ese archivo no es un PDF');
    const name = file.name.replace(/\.pdf$/i, '');
    const same = store.db.pdfs.find(p => p.name === name && p.size === file.size);
    if (same) { same.lastOpened = Date.now(); store.saveDb(); open(same.id); return toast('Ya estaba en el historial: se abrió sin volver a prepararlo'); }
    P.busy = { name, done: 0, total: 0 }; renderList();
    let id = '';
    try {
      const { renderPdf, newPdfId } = await import('./pdf-slides.js');
      id = newPdfId();
      const { pages } = await renderPdf(file, store, id, (done, tot) => { P.busy.done = done; P.busy.total = tot; renderProgress(); });
      store.db.pdfs.unshift({ id, name, pages, size: file.size, addedAt: Date.now(), lastOpened: Date.now(), pattern: store.mode === 'server' ? `/pdf/${id}/{k}.jpg` : `idb:pdf:${id}:{k}` });
      store.saveDb(); P.busy = null; open(id);
      toast(`Listo: ${pages} página${pages === 1 ? '' : 's'}. Pulsa «Proyectar» cuando quieras.`);
    } catch (e) {
      const pages = P.busy?.total ?? 0; P.busy = null;
      if (id) await store.deletePdfFiles({ id, pages });
      toast(e.message); renderList();
    }
  }
  async function removePdf(p) {
    if (!confirm(`¿Quitar «${p.name}» del historial? Se borra lo guardado; el archivo PDF original no se toca.`)) return;
    if (P.pdf?.id === p.id) { if (isLive()) end(); P.pdf = null; P.pres = null; }
    await store.deletePdfFiles(p); store.db.pdfs = store.db.pdfs.filter(x => x !== p); store.saveDb(); renderAll();
  }

  // ---------- construcción de la interfaz ----------
  const act = (ic, text, title, onclick, cls = '') => h('button', { class: cls, title, 'aria-label': title || text, onclick }, icon(ic, 16), text && h('span', {}, text));
  function build() {
    const file = h('input', { type: 'file', accept: '.pdf,application/pdf', hidden: true, onchange: (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) importFile(f); } });
    el.list = h('div', { class: 'pd-list' });
    const side = h('aside', { class: 'pd-side' },
      h('div', { class: 'pd-sidehead' }, h('b', {}, 'Mis PDF'), file,
        h('button', { class: 'primary', title: 'Elige un PDF de tu computadora (también puedes arrastrarlo a la ventana)', onclick: () => file.click() }, icon('file', 16), 'Abrir PDF…')),
      el.list,
      h('div', { class: 'pd-sidefoot muted' }, `Los PDF que pasen ${PDF_KEEP_DAYS} días sin abrirse se quitan solos del historial.`));

    el.img = h('img', { class: 'pd-img', alt: '', draggable: 'false', onload: () => { P.asp = el.img.naturalWidth / el.img.naturalHeight || 16 / 9; fit(); paintOverlay(); } });
    el.zoomRect = h('div', { class: 'pd-zoomrect', hidden: true });
    el.zoomDrag = h('div', { class: 'pd-zoomrect drag', hidden: true });
    el.hint = h('div', { class: 'pd-hint' });
    el.slide = h('div', { class: 'pd-slide', onpointerdown: onDown, onpointermove: onMove, onpointerup: onUp, onpointercancel: onUp, onpointerleave: onLeave, oncontextmenu: (e) => e.preventDefault() }, el.img, overlay.svg, el.zoomRect, el.zoomDrag);
    el.curWrap = h('div', { class: 'pd-curwrap' }, el.slide, el.hint);

    el.nextImg = h('img', { class: 'pd-nextimg', alt: '' });
    el.nextEnd = h('div', { class: 'pd-nextend' }, 'Fin del documento');
    el.nextBox = h('div', { class: 'pd-nextbox', onclick: () => step(1) }, el.nextImg, el.nextEnd);
    el.time = h('div', { class: 'pd-time' }, '00:00');
    el.timeSub = h('div', { class: 'pd-timesub muted' });
    el.ett = h('input', { type: 'number', min: '0', max: '600', step: '5', placeholder: '0', value: P.timer.ett ? String(P.timer.ett) : '', 'aria-label': 'Duración prevista en minutos',
      onchange: (e) => { P.timer.ett = Math.max(0, Number(e.target.value) || 0); localStorage.setItem('proclama.pdf.ett', String(P.timer.ett)); renderTimer(); } });
    el.playBtn = act('play', '', 'Iniciar o pausar el cronómetro (P)', timerToggle);
    el.clock = h('div', { class: 'pd-clock' });
    el.pageIn = h('input', { class: 'pd-pagein', type: 'number', min: '1', 'aria-label': 'Ir a la página',
      onchange: (e) => { go(Number(e.target.value) - 1); e.target.blur(); }, onkeydown: (e) => { if (e.key === 'Enter') { go(Number(e.target.value) - 1); e.target.blur(); } e.stopPropagation(); } });
    el.pageTot = h('span', { class: 'muted' });
    el.bar = h('div', { class: 'pd-bar' }, h('i'));
    const right = h('div', { class: 'pd-right' },
      h('div', { class: 'pd-card' }, h('div', { class: 'pd-cap' }, 'SIGUIENTE'), el.nextBox),
      h('div', { class: 'pd-card' }, h('div', { class: 'pd-cap' }, 'TIEMPO'),
        h('div', { class: 'pd-timerow' }, el.time, el.playBtn, act('redo', '', 'Reiniciar el cronómetro (R)', timerReset)),
        h('label', { class: 'pd-ettrow' }, h('span', { class: 'muted' }, 'Duración prevista'), el.ett, h('span', { class: 'muted' }, 'min')), el.timeSub),
      h('div', { class: 'pd-card' }, h('div', { class: 'pd-cap' }, 'PÁGINA'),
        h('div', { class: 'pd-pagerow' }, el.pageIn, h('span', {}, 'de'), el.pageTot), el.bar),
      h('div', { class: 'pd-card pd-clockcard' }, h('div', { class: 'pd-cap' }, 'HORA'), el.clock));

    // Herramientas
    el.toolBtns = {
      none: act('cursor', 'Cursor', 'Sin herramienta (Esc)', () => setTool('none')),
      laser: act('pointer', 'Puntero', 'Puntero láser: se ve en el proyector donde pases el cursor (L)', () => setTool('laser')),
      draw: act('marker', 'Dibujar', 'Resaltador y lápiz (H)', () => setTool(P.tool === 'draw' ? 'none' : 'draw')),
      erase: act('trash', 'Borrador', 'Borra los trazos que toques (0)', () => setTool('erase')),
      zoom: act('zoom', 'Lupa', 'Arrastra un recuadro para acercarlo en el proyector (Z)', () => setTool('zoom')),
    };
    el.pens = h('div', { class: 'pd-pens' }, PENS.map(p => h('button', { class: 'pen', title: `${p.name} (${p.id})`, 'aria-label': p.name, style: { '--c': p.c }, onclick: () => pickPen(p) })));
    el.lasers = h('div', { class: 'pd-pens' }, LASERS.map(([n, c]) => h('button', { class: 'pen', title: 'Puntero ' + n.toLowerCase(), 'aria-label': 'Puntero ' + n.toLowerCase(), style: { '--c': c }, onclick: () => { P.laser = c; if (P.tool !== 'laser') setTool('laser'); else renderTools(); } })));
    el.unzoom = act('x', 'Quitar lupa', 'Volver a ver la página completa (U)', unzoom);
    el.undoBtn = act('undo', '', 'Deshacer (Ctrl+Z)', undo); el.redoBtn = act('redo', '', 'Rehacer (Ctrl+Shift+Z)', redo);
    el.clearBtn = act('trash', 'Borrar todo', 'Borra todas las anotaciones de esta página', clearPage, 'quiet danger');
    el.tools = h('div', { class: 'pd-tools' }, ...Object.values(el.toolBtns), h('span', { class: 'pd-sep' }), el.pens, el.lasers, el.unzoom, h('span', { class: 'spacer' }), el.undoBtn, el.redoBtn, el.clearBtn);

    // Barra principal
    el.prev = act('left', 'Anterior', 'Página anterior (←)', () => step(-1));
    el.next = act('right', 'Siguiente', 'Página siguiente (→ o espacio)', () => step(1), 'primary big');
    el.go = act('play', 'Proyectar', 'Empezar a proyectar (Enter)', start, 'primary big');
    el.end = act('x', 'Terminar', 'Quitar el PDF del proyector (Esc)', end, 'danger');
    el.black = act('black', 'Negro', 'Pantalla en negro (B)', () => store.dispatch({ type: 'black' }), 'toggle');
    el.overBtn = act('grid', 'Páginas', 'Ver todas las páginas (D)', () => { P.overview = !P.overview; renderOverview(); });
    el.projBtn = act('monitor', 'Abrir proyector', 'Abre la ventana del proyector', () => ctx.openProjector());
    el.swapBtn = act('swap', 'Intercambiar', 'Lleva el proyector a la otra pantalla (S)', () => ctx.swapScreens());
    el.nav = h('div', { class: 'pd-nav' }, el.prev, el.next, el.go, el.end, h('span', { class: 'pd-sep' }), el.black, el.overBtn, h('span', { class: 'spacer' }), el.projBtn, el.swapBtn);

    el.strip = h('div', { class: 'pd-strip' });
    el.over = h('div', { class: 'pd-over', hidden: true, onclick: (e) => { if (e.target === el.over) { P.overview = false; renderOverview(); } } });
    el.banner = h('div', { class: 'pd-banner', hidden: true }, icon('monitor', 18), h('span', {}, 'El proyector no está abierto: la congregación no verá nada.'), h('button', { class: 'primary', onclick: () => ctx.openProjector() }, 'Abrir proyector'));

    el.empty = h('div', { class: 'pd-empty' },
      h('div', { class: 'pd-emptybox' }, icon('file', 44), h('h2', {}, 'Presenta tu PDF como si fuera un PowerPoint'),
        h('p', { class: 'muted' }, 'Arrastra un PDF a esta ventana o pulsa el botón. Cada página será una diapositiva; no hace falta convertirlo.'),
        h('button', { class: 'primary big', onclick: () => file.click() }, icon('file', 18), 'Abrir un PDF…'),
        h('div', { class: 'guide' },
          [['Abre el PDF', 'Se prepara en segundos y queda en tu historial.'],
            ['Revisa y pulsa Proyectar', 'El proyector muestra solo la página actual.'],
            ['Presenta con calma', 'Aquí ves la siguiente página, el reloj y el tiempo; puedes señalar, dibujar y acercar.']]
            .map(([t, d], i) => h('div', { class: 'step' }, h('span', { class: 'n' }, String(i + 1)), h('span', {}, h('b', {}, t), h('small', {}, d)))))));
    el.work = h('div', { class: 'pd-work' }, el.banner, h('div', { class: 'pd-stage' }, el.curWrap, right), el.tools, el.nav, el.strip);
    root.append(side, h('div', { class: 'pd-main' }, el.empty, el.work), el.over);
    new ResizeObserver(fit).observe(el.curWrap);
  }

  // ---------- dibujo ----------
  function fit() {
    if (!el.curWrap?.clientWidth) return;
    const r = fitRect(P.asp, el.curWrap.clientWidth, el.curWrap.clientHeight);
    Object.assign(el.slide.style, { width: r.width + 'px', height: r.height + 'px' });
  }
  async function setImg(img, src) {
    if (img.dataset.k === src) return;
    img.dataset.k = src;
    const url = await resolveSrc(src);
    if (img.dataset.k === src && url) img.src = url; // si mientras tanto pidieron otra imagen, esta se descarta
  }
  function paintOverlay() {
    const l = live(), ov = isLive() ? l.ov : null;
    overlay.update(ov, P.asp);
    const z = ov?.zoom;
    el.zoomRect.hidden = !z;
    if (z) Object.assign(el.zoomRect.style, { left: z.x * 100 + '%', top: z.y * 100 + '%', width: z.w * 100 + '%', height: z.h * 100 + '%' });
  }
  function renderList() {
    const rows = [...store.db.pdfs].sort((a, b) => pdfLastUse(b) - pdfLastUse(a)).map(p => {
      const left = pdfDaysLeft(p);
      return h('div', { class: 'pd-row' + (P.pdf?.id === p.id ? ' active' : '') + (store.live.pres?.pdfId === p.id ? ' onair' : ''), tabindex: '0',
        onclick: () => open(p.id), ondblclick: () => open(p.id, true), onkeydown: (e) => { if (e.key === 'Enter' && e.target === e.currentTarget) open(p.id, true); } },
        h('span', { class: 'kind pdf' }, icon('file', 16)),
        h('span', { class: 'main' }, h('b', { class: 'ell' }, p.name),
          h('small', { class: 'ell' }, `${p.pages} pág. · ${relDays(pdfLastUse(p))}`),
          h('small', { class: 'ell', style: left <= 3 ? { color: 'var(--bible)' } : {} }, `se quita en ${left} día${left === 1 ? '' : 's'} si no lo abres`)),
        h('span', { class: 'acts', onclick: (e) => e.stopPropagation(), ondblclick: (e) => e.stopPropagation() },
          h('button', { class: 'act', title: 'Añadir al programa del culto', 'aria-label': 'Añadir al programa', onclick: () => ctx.addToSchedule({ type: 'pdf', pdfId: p.id }) }, icon('plus', 16)),
          h('button', { class: 'act danger', title: 'Quitar del historial (se borran sus páginas guardadas)', 'aria-label': 'Quitar del historial', onclick: () => removePdf(p) }, icon('trash', 16))));
    });
    let progress = null;
    if (P.busy) {
      el.bar2 = h('progress', { max: '100', value: '0' }); el.barText = h('small', { class: 'muted' }, 'Leyendo el archivo…');
      progress = h('div', { class: 'pd-row', style: { cursor: 'default' } }, h('span', { class: 'kind pdf' }, icon('file', 16)), h('span', { class: 'main' }, h('b', { class: 'ell' }, P.busy.name), el.barText, el.bar2));
      renderProgress();
    }
    el.list.replaceChildren(...[progress, ...rows, !rows.length && !P.busy ? h('div', { class: 'empty' }, 'Aquí aparecerán los PDF que abras.') : null].filter(Boolean));
  }
  function renderProgress() {
    if (!P.busy || !el.bar2) return;
    el.bar2.value = P.busy.total ? Math.round(100 * P.busy.done / P.busy.total) : 0;
    el.barText.textContent = P.busy.total ? `Preparando la página ${Math.min(P.busy.done + 1, P.busy.total)} de ${P.busy.total}…` : 'Leyendo el archivo…';
  }
  function buildStrip() {
    el.strip.replaceChildren(...(P.pdf ? Array.from({ length: P.pdf.pages }, (_, i) => {
      const img = h('img', { alt: '', loading: 'lazy', decoding: 'async' });
      setImg(img, P.pres.slides[i].media.thumb);
      return h('button', { class: 'pd-thumb', title: 'Página ' + (i + 1), 'aria-label': 'Ir a la página ' + (i + 1), onclick: () => go(i) }, img, h('i', {}, String(i + 1)));
    }) : []));
    el.strip._active = null;
  }
  function renderOverview() {
    el.over.hidden = !P.overview || !P.pdf;
    if (el.over.hidden) return;
    const cur = index();
    el.over.replaceChildren(h('div', { class: 'pd-overbox' },
      h('div', { class: 'pd-overhead' }, h('b', {}, P.pdf.name), h('span', { class: 'muted' }, ' · toca una página para ir a ella'), h('span', { class: 'spacer' }),
        h('button', { onclick: () => { P.overview = false; renderOverview(); } }, icon('x', 16), 'Cerrar')),
      h('div', { class: 'pd-overgrid' }, P.pres.slides.map((s, i) => {
        const img = h('img', { alt: '', loading: 'lazy', decoding: 'async' }); setImg(img, s.media.thumb);
        return h('button', { class: 'pd-thumb' + (i === cur ? ' active' : ''), onclick: () => { go(i); P.overview = false; renderOverview(); } }, img, h('i', {}, String(i + 1)));
      }))));
  }
  function renderTimer() {
    const e = elapsed(), ett = P.timer.ett * 60;
    el.time.textContent = mmss(e);
    el.time.style.color = ett ? timerColor(ett - e) : '';
    el.playBtn.replaceChildren(icon(P.timer.running ? 'pause' : 'play', 16));
    el.playBtn.title = P.timer.running ? 'Pausar el cronómetro (P)' : 'Iniciar el cronómetro (P)';
    el.timeSub.textContent = ett ? (ett - e >= 0 ? `Faltan ${mmss(ett - e)}` : `Te pasaste ${mmss(e - ett)}`) : (P.timer.running ? '' : (e ? 'En pausa' : 'Arranca al proyectar'));
    el.clock.textContent = new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  }
  function renderTools() {
    const liveOn = isLive(), l = live();
    for (const [k, b] of Object.entries(el.toolBtns)) {
      b.classList.toggle('on', P.tool === k || (k === 'none' && P.tool === 'none'));
      b.disabled = k !== 'none' && !liveOn;
    }
    el.pens.hidden = P.tool !== 'draw'; el.lasers.hidden = P.tool !== 'laser';
    [...el.pens.children].forEach((b, i) => b.classList.toggle('on', PENS[i] === P.pen));
    [...el.lasers.children].forEach((b, i) => b.classList.toggle('on', LASERS[i][1] === P.laser));
    el.unzoom.hidden = !(liveOn && l.ov?.zoom);
    const a = liveOn ? pageAnn(index()) : null;
    el.undoBtn.disabled = !a?.strokes.length; el.redoBtn.disabled = !a?.redo.length; el.clearBtn.disabled = !a?.strokes.length;
    el.slide.style.cursor = !liveOn ? 'default' : P.tool === 'draw' ? 'crosshair' : P.tool === 'erase' ? 'cell' : P.tool === 'zoom' ? 'zoom-in' : P.tool === 'laser' ? 'none' : 'default';
    el.hint.textContent = !liveOn ? 'Pulsa «Proyectar» para empezar' : '';
    el.hint.hidden = liveOn;
  }
  let listSig = '';
  function renderAll() {
    const has = !!P.pdf;
    el.empty.hidden = has; el.work.hidden = !has;
    const sig = JSON.stringify([store.db.pdfs.map(p => [p.id, p.name, p.lastOpened]), P.pdf?.id, store.live.pres?.pdfId, !!P.busy, Math.floor(Date.now() / 3600e3)]);
    if (sig !== listSig) { listSig = sig; renderList(); }
    if (!has) return;
    const i = index(), n = total(), liveOn = isLive(), l = live();
    setImg(el.img, P.pres.slides[i].media.src);
    const nx = P.pres.slides[i + 1];
    el.nextImg.hidden = !nx; el.nextEnd.hidden = !!nx;
    if (nx) setImg(el.nextImg, nx.media.thumb);
    if (document.activeElement !== el.pageIn) el.pageIn.value = String(i + 1);
    el.pageIn.max = String(n); el.pageTot.textContent = String(n);
    el.bar.firstChild.style.width = (n > 1 ? 100 * i / (n - 1) : 100) + '%';
    el.prev.disabled = i <= 0; el.next.disabled = i >= n - 1;
    el.go.hidden = liveOn; el.end.hidden = !liveOn;
    el.next.classList.toggle('primary', liveOn); // antes de proyectar, el botón principal es «Proyectar»
    el.black.hidden = !liveOn; el.black.classList.toggle('on', !!l.black);
    el.banner.hidden = !liveOn || ctx.hasProjector();
    const active = el.strip.children[i];
    if (el.strip._active !== active) { el.strip._active?.classList.remove('active'); active?.classList.add('active'); el.strip._active = active; active?.scrollIntoView({ block: 'nearest', inline: 'center' }); }
    el.projBtn.classList.toggle('open', ctx.hasProjector());
    renderTools(); renderTimer(); renderOverview(); fit(); paintOverlay();
  }

  // ---------- teclado ----------
  /** @returns {boolean} true si la tecla se usó */
  function onKey(e) {
    const tag = e.target.tagName;
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if (typing) { if (e.key === 'Escape') { e.target.blur(); return true; } return false; }
    if (e.altKey || (e.metaKey && !e.ctrlKey)) return false;
    const k = e.key, onButton = tag === 'BUTTON';
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      if (k === 'z' || k === 'Z') { e.shiftKey ? redo() : undo(); return true; }
      if (k === 'y' || k === 'Y') { redo(); return true; }
      return false;
    }
    if (!P.pdf) return false;
    if (k === 'ArrowRight' || k === 'ArrowDown' || k === 'PageDown' || (k === ' ' && !onButton)) step(1);
    else if (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'PageUp') step(-1);
    else if (k === 'Home') go(0);
    else if (k === 'End') go(total() - 1);
    else if (k === 'Enter' && !onButton) { if (!isLive()) start(); }
    else if (k === 'g' || k === 'G') { el.pageIn.focus(); el.pageIn.select(); }
    else if (k === 'd' || k === 'D') { P.overview = !P.overview; renderOverview(); }
    else if (k === 'b' || k === 'B') { if (isLive()) store.dispatch({ type: 'black' }); }
    else if (k === 'l' || k === 'L') setTool('laser');
    else if (k === 'h' || k === 'H') setTool('draw');
    else if (k === 'z' || k === 'Z') setTool('zoom');
    else if (k === 'u' || k === 'U') unzoom();
    else if (k === 'e' || k === 'E' || k === '0') setTool('erase');
    else if (k >= '1' && k <= '7') pickPen(PENS[Number(k) - 1]);
    else if (k === 'p' || k === 'P') timerToggle();
    else if (k === 'r' || k === 'R') timerReset();
    else if (k === 't' || k === 'T') { el.ett.focus(); el.ett.select(); }
    else if (k === 's' || k === 'S') ctx.swapScreens();
    else if (k === 'Escape') {
      if (P.overview) { P.overview = false; renderOverview(); }
      else if (P.tool !== 'none') setTool('none');
      else if (isLive() && live().ov?.zoom) unzoom();
      else if (isLive()) end();
      else return false;
    } else return false;
    return true;
  }

  // ---------- sincronización con el estado en vivo ----------
  function onLive() {
    const l = live();
    if (l.pres?.type === 'pdf' && l.pres.pdfId !== P.pdf?.id && (store.db.pdfs ?? []).some(p => p.id === l.pres.pdfId)) open(l.pres.pdfId); // lo proyectaron desde otro lado
    // Otro control (celular, teclado) cambió de página: se devuelven las anotaciones de esa página
    if (isLive() && l.index !== P.lastIndex) {
      P.lastIndex = l.index;
      const mine = P.ann.get(pageKey(l.index))?.strokes ?? [];
      if (mine.length && !(l.ov?.strokes?.length)) patch({ strokes: mine, sv: ++P.sv });
    }
    if (!isLive()) P.lastIndex = -1;
    if (root.hidden) return;
    // Mover el puntero o dibujar no cambia la página: basta repintar la capa y las herramientas
    const sig = [l.index, l.pres?.id, l.black, isLive(), store.clients?.output ?? 0, l.ov?.zoom ? 1 : 0].join('|');
    if (sig === P.sig) { paintOverlay(); renderTools(); } else { P.sig = sig; renderAll(); }
  }
  store.on((what) => {
    if (what === 'live' || what === 'clients') onLive();
    else if (what === 'db' && !root.hidden) { if (P.pdf && !(store.db.pdfs ?? []).some(p => p.id === P.pdf.id)) { P.pdf = null; P.pres = null; } renderAll(); }
  });
  setInterval(() => { if (!root.hidden && P.pdf) renderTimer(); }, 1000);

  build();
  renderAll();
  return { open, importFile, onKey, refresh: () => { renderAll(); fit(); }, isOpen: () => !!P.pdf };
}
