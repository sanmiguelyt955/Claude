// Panel del operador.
import { createStore, resolveSrc, withToken } from './store.js';
import { createScreen } from './render.js';
import { resolveItem, itemInfo, labelColor } from './resolve.js';
import { defaultLive, defaultTheme, defaultDb, songToPresentation, mediaToPresentation, themeById, norm, uid, FONTS } from '../shared/model.js';
import { BOOKS_ES, bookName, parseReference, formatRef, searchBible, bibleToPresentation } from '../shared/bible.js';
import { importSongFile } from '../shared/importers.js';
import { buildBible } from '../shared/bible-import.js';
import { icon, hydrateIcons } from './icons.js';

const $ = (id) => document.getElementById(id);
function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  let value;
  for (const [k, v] of Object.entries(props ?? {})) {
    if (k === 'class') e.className = v;
    else if (k === 'value') value = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, '');
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  e.append(...kids.flat(Infinity).filter(x => x != null && x !== false));
  if (value !== undefined) e.value = value;
  return e;
}
/** Botón de acción con icono; `text` es la etiqueta visible (opcional). */
const act = (ic, title, onclick, text = '', cls = '') => h('button', { class: 'act ' + cls, title, 'aria-label': title, onclick }, icon(ic, 16), text && h('span', {}, text));
const KIND_ICON = { song: 'music', bible: 'book', media: 'image', text: 'text' };
const debounce = (fn, ms = 180) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
let toastTimer;
function toast(msg) {
  $('toast').textContent = msg; $('toast').classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('on'), 2600);
}
const isMobile = () => matchMedia('(max-width: 900px)').matches;
function setPanel(p) {
  document.body.dataset.panel = p;
  document.querySelectorAll('.mobnav button').forEach(b => b.classList.toggle('on', b.dataset.panel === p));
}

const store = await createStore('operator');
const ui = {
  tab: 'songs', songQuery: '', preview: null, // preview: { pres, index, item? }
  bible: { version: store.db.settings.bibleVersion, book: 42, chapter: 3, query: '', data: null },
  themeId: store.db.themes[0]?.id,
};
// Bajo consumo: los monitores del operador no reproducen video ni animaciones (el proyector sí).
const lite = () => store.db.settings.lowPower !== false;
const pvScreen = createScreen($('pvMonitor'), { chrome: false, muted: true, lite });
const lvScreen = createScreen($('lvMonitor'), { muted: true, lite });
/** Redibuja las tarjetas solo si cambió la lista de diapositivas; si no, solo mueve la marca de "activa". */
function syncSlides(box, slides, index, make, emptyText) {
  if (box._slides !== slides) {
    box._slides = slides;
    box.replaceChildren(...(slides ? slides.map(make) : [typeof emptyText === 'function' ? emptyText() : h('div', { class: 'empty' }, emptyText)]));
    box._active = null;
  }
  if (!slides) return;
  const next = box.children[index] ?? null;
  if (box._active !== next) {
    box._active?.classList.remove('active'); next?.classList.add('active'); box._active = next;
    next?.scrollIntoView({ block: 'nearest' });
  }
}

// ---------- Diálogos ----------
function openDialog(title, body, buttons = []) {
  const d = $('dlg');
  const close = () => d.close();
  d.replaceChildren(
    h('div', { class: 'dhead' }, title),
    h('div', { class: 'dbody' }, body),
    h('div', { class: 'dfoot' }, buttons.map(([label, fn, cls]) => h('button', { class: cls ?? '', onclick: async () => { if ((await fn?.()) !== false) close(); } }, label)),
      !buttons.length && h('button', { onclick: close }, 'Cerrar')),
  );
  if (!d.open) d.showModal();
  return close;
}
const field = (label, input, cls = '') => h('label', { class: 'field ' + cls }, h('span', {}, label), input);

// ---------- Vista previa ----------
function setPreview(pres, index = 0, item = null) {
  ui.preview = pres ? { pres, index: Math.min(index, pres.slides.length - 1), item } : null;
  renderPreview(); renderSchedule();
  if (isMobile() && pres) setPanel('preview');
}
async function previewItem(item, live = false) {
  try {
    const pres = await resolveItem(item, store);
    setPreview(pres, item.start ?? 0, item);
    if (live) goLive();
  } catch (e) { toast(e.message); }
}
function goLive(index) {
  if (!ui.preview) return toast('Elige primero una canción, un pasaje o una imagen');
  if (index !== undefined) ui.preview.index = index;
  store.dispatch({ type: 'show', pres: ui.preview.pres, index: ui.preview.index });
  if (isMobile()) setPanel('live');
}

function slideCard(slide, i, active, onclick, ondblclick) {
  const c = labelColor(slide.label);
  return h('button', { class: 'slide' + (active ? ' active' : ''), onclick, ondblclick, style: c ? { '--lab': c } : {} },
    h('span', { class: 'lab' }, h('i', {}, String(i + 1)), slide.label), slide.media ? `(${slide.label.toLowerCase()})` : slide.text);
}

function renderPreview() {
  const p = ui.preview;
  $('pvTitle').textContent = p ? `${p.pres.title} · ${p.pres.slides.length} diapositiva${p.pres.slides.length === 1 ? '' : 's'}` : 'Revisa antes de proyectar';
  pvScreen.update({ ...defaultLive(), pres: p?.pres ?? null, index: p?.index ?? 0 });
  syncSlides($('pvSlides'), p?.pres.slides ?? null, p?.index ?? 0,
    (s, i) => slideCard(s, i, false, () => { ui.preview.index = i; renderPreview(); }, () => goLive(i)),
    () => h('div', { class: 'guide' },
      [['Elige', 'Toca una canción, un pasaje o una imagen en la biblioteca de abajo.'],
        ['Revisa', 'Aquí ves cómo quedará, sin que la congregación lo vea todavía.'],
        ['Proyecta', 'Pulsa «Proyectar» (o Enter). Luego avanza con «Siguiente» o la flecha →.']]
        .map(([t, d], i) => h('div', { class: 'step' }, h('span', { class: 'n' }, String(i + 1)), h('span', {}, h('b', {}, t), h('small', {}, d))))));
  const sel = $('pvTheme');
  if (sel._themes !== store.db.themes || sel.options.length !== store.db.themes.length) {
    sel._themes = store.db.themes;
    sel.replaceChildren(...store.db.themes.map(t => h('option', { value: t.id }, t.name)));
  }
  sel.disabled = !p || p.pres.type === 'media';
  if (p) sel.value = p.pres.theme.id;
  $('pvLive').disabled = $('pvAdd').disabled = !p;
}
$('pvTheme').onchange = (e) => {
  const p = ui.preview; if (!p) return;
  p.pres = { ...p.pres, theme: themeById(store.db, e.target.value) };
  if (p.item) {
    p.item.themeId = e.target.value;
    const saved = store.db.schedule.items.find(x => x.id === p.item.id);
    if (saved) { saved.themeId = e.target.value; store.saveDb(); }
  }
  renderPreview();
};
$('pvLive').onclick = () => goLive();
$('pvAdd').onclick = () => { if (ui.preview?.item) addToSchedule({ ...ui.preview.item, start: ui.preview.index }); };

// ---------- En vivo ----------
function renderLive() {
  const l = store.live;
  $('lvTitle').textContent = l.pres ? `${l.pres.title} · ${l.index + 1} de ${l.pres.slides.length}` : 'Nada en pantalla';
  const state = l.black ? 'PANTALLA EN NEGRO' : l.logo.on ? 'MOSTRANDO EL LOGO' : l.clear && l.pres ? 'TEXTO OCULTO' : '';
  $('lvState').textContent = state; $('lvState').hidden = !state;
  $('lvClose').disabled = !l.pres; $('lvPrev').disabled = !l.pres || l.index === 0; $('lvNext').disabled = !l.pres || l.index >= l.pres.slides.length - 1;
  $('toolsDot').hidden = !(l.alert.on || l.countdown.on || l.stageMsg);
  lvScreen.update(l);
  syncSlides($('lvSlides'), l.pres?.slides ?? null, l.index,
    (s, i) => slideCard(s, i, false, () => store.dispatch({ type: 'goto', index: i })),
    () => h('div', { class: 'empty' }, h('b', {}, 'Nada en pantalla'), 'Lo que proyectes aparecerá aquí. Toca una diapositiva para saltar a ella.'));
  $('lvBlack').classList.toggle('on', l.black);
  $('lvClear').classList.toggle('on', l.clear);
  $('lvLogo').classList.toggle('on', l.logo.on);
  $('alertBtn').classList.toggle('on', l.alert.on); $('alertBtn').textContent = l.alert.on ? 'Quitar' : 'Mostrar';
  $('cdBtn').classList.toggle('on', l.countdown.on); $('cdBtn').textContent = l.countdown.on ? 'Detener' : 'Iniciar';
  if (document.activeElement !== $('stageText')) $('stageText').value = l.stageMsg;
  if (document.activeElement !== $('alertText') && l.alert.text) $('alertText').value = l.alert.text;
  document.querySelector('.mobnav [data-panel=live]').classList.toggle('onair', !!l.pres && !l.black);
}
const toggleLogo = () => store.dispatch({ type: 'logo', src: store.db.settings.logoSrc, text: store.db.settings.churchName });
$('lvPrev').onclick = () => store.dispatch({ type: 'prev' });
$('lvNext').onclick = () => store.dispatch({ type: 'next' });
$('lvBlack').onclick = () => store.dispatch({ type: 'black' });
$('lvClear').onclick = () => store.dispatch({ type: 'clear' });
$('lvLogo').onclick = toggleLogo;
$('lvClose').onclick = () => store.dispatch({ type: 'close' });
$('alertBtn').onclick = () => {
  if (store.live.alert.on) return store.dispatch({ type: 'alert', value: false });
  const text = $('alertText').value.trim();
  if (!text) return toast('Escribe el mensaje de la alerta');
  store.dispatch({ type: 'alert', text, value: true });
};
$('alertText').onkeydown = (e) => { if (e.key === 'Enter') { store.dispatch({ type: 'alert', text: e.target.value.trim(), value: true }); } };
$('cdBtn').onclick = () => store.dispatch(store.live.countdown.on
  ? { type: 'countdown', value: false }
  : { type: 'countdown', seconds: Math.round(Number($('cdMin').value) * 60), label: 'Comenzamos en' });
$('stageText').oninput = debounce((e) => store.dispatch({ type: 'stage', text: e.target.value }), 250);

// ---------- Programa ----------
function addToSchedule(item) {
  const copy = { ...item, id: uid() };
  store.db.schedule.items.push(copy);
  store.saveDb();
  toast('Añadido al programa');
}
let dragFrom = -1;
function renderSchedule() {
  const sch = store.db.schedule;
  if (document.activeElement !== $('schedName')) $('schedName').value = sch.name;
  const move = (i, to) => {
    if (to < 0 || to >= sch.items.length) return;
    sch.items.splice(to, 0, sch.items.splice(i, 1)[0]); store.saveDb();
  };
  $('schedList').replaceChildren(...(sch.items.length ? sch.items.map((item, i) => {
    const info = itemInfo(item, store.db);
    const onAir = store.live.pres?.itemId === item.id;
    const cls = 'row' + (ui.preview?.item?.id === item.id ? ' active' : '') + (onAir ? ' onair' : '');
    return h('div', {
      class: cls, draggable: 'true', tabindex: '0',
      onclick: () => previewItem(item), ondblclick: () => previewItem(item, true),
      onkeydown: (e) => { if (e.key === 'Enter' && e.target === e.currentTarget) { e.stopPropagation(); previewItem(item, true); } },
      ondragstart: (e) => { dragFrom = i; e.currentTarget.classList.add('drag'); e.dataTransfer.effectAllowed = 'move'; },
      ondragend: (e) => e.currentTarget.classList.remove('drag'),
      ondragover: (e) => { e.preventDefault(); e.currentTarget.classList.add('over'); },
      ondragleave: (e) => e.currentTarget.classList.remove('over'),
      ondrop: (e) => { e.preventDefault(); if (dragFrom >= 0 && dragFrom !== i) move(dragFrom, i); dragFrom = -1; },
    },
      h('span', { class: 'kind ' + item.type, title: onAir ? 'En pantalla ahora' : info.sub }, icon(info.icon === '▶' ? 'video' : KIND_ICON[item.type] ?? 'text', 16)),
      h('span', { class: 'main' }, h('b', { class: 'ell' }, info.title), h('small', { class: 'ell' }, onAir ? 'En pantalla ahora' : info.sub)),
      h('span', { class: 'acts', onclick: (e) => e.stopPropagation(), ondblclick: (e) => e.stopPropagation() },
        act('play', 'Proyectar ahora', () => previewItem(item, true), 'Proyectar', 'go'),
        act('up', 'Subir', () => move(i, i - 1), '', 'extra'),
        act('down', 'Bajar', () => move(i, i + 1), '', 'extra'),
        item.type === 'text' && act('edit', 'Editar', () => editText(item), '', 'extra'),
        act('x', 'Quitar del programa', () => { sch.items.splice(i, 1); store.saveDb(); }, '', 'danger extra')),
    );
  }) : [h('div', { class: 'empty' }, h('b', {}, 'Aquí va el orden del culto'), 'Busca una canción o un pasaje abajo y pulsa ', h('b', { style: { display: 'inline' } }, '＋ Programa'), ' para guardarlo aquí.')]));
}
$('schedName').onchange = (e) => { store.db.schedule.name = e.target.value || 'Culto'; store.saveDb(); };
$('btnClearSched').onclick = () => {
  if (store.db.schedule.items.length && confirm('¿Vaciar todo el programa?')) { store.db.schedule.items = []; store.saveDb(); }
};
function editText(item) {
  const isNew = !item;
  const t = h('input', { value: item?.title ?? '', placeholder: 'Anuncios' });
  const x = h('textarea', { value: item?.text ?? '', placeholder: 'Deja una línea en blanco para separar diapositivas.' });
  openDialog(isNew ? 'Nuevo texto' : 'Editar texto', [field('Título', t), field('Texto', x)], [
    ['Cancelar'],
    ['Guardar', () => {
      if (!x.value.trim()) { toast('Escribe el texto'); return false; }
      if (isNew) addToSchedule({ type: 'text', title: t.value.trim() || 'Texto', text: x.value });
      else { item.title = t.value.trim() || 'Texto'; item.text = x.value; store.saveDb(); }
    }, 'primary'],
  ]);
}
$('btnAddText').onclick = () => editText(null);

// ---------- Biblioteca: canciones ----------
function editSong(song) {
  const isNew = !song;
  const s = song ?? { id: uid(), title: '', author: '', copyright: '', ccli: '', order: '', themeId: '', text: '' };
  const f = {
    title: h('input', { value: s.title, placeholder: 'Título' }), author: h('input', { value: s.author }),
    copyright: h('input', { value: s.copyright }), ccli: h('input', { value: s.ccli }),
    order: h('input', { value: s.order, placeholder: 'Ej.: V1 C V2 C P C (opcional)' }),
    themeId: h('select', { value: s.themeId }, h('option', { value: '' }, '(predeterminado)'), store.db.themes.map(t => h('option', { value: t.id }, t.name))),
    text: h('textarea', { value: s.text, placeholder: 'Verso 1\nPrimera línea\nSegunda línea\n\nCoro\nLínea del coro' }),
  };
  openDialog(isNew ? 'Nueva canción' : 'Editar canción', [
    h('div', { class: 'drow' }, field('Título', f.title), field('Autor', f.author)),
    h('div', { class: 'drow' }, field('Copyright', f.copyright), field('N.º CCLI', f.ccli, 'sm')),
    h('div', { class: 'drow' }, field('Orden', f.order), field('Tema', f.themeId)),
    field('Letra', f.text),
    h('p', { class: 'muted' }, 'Escribe “Verso 1”, “Coro”, “Puente”… en su propia línea para marcar secciones. Una línea en blanco empieza otra diapositiva.'),
  ], [
    ['Cancelar'],
    ['Guardar', () => {
      if (!f.title.value.trim()) { toast('Ponle un título'); return false; }
      for (const k in f) s[k] = f[k].value.trim();
      if (isNew) store.db.songs.push(s);
      store.saveDb();
      if (ui.preview?.item?.songId === s.id || isNew) previewItem({ type: 'song', songId: s.id });
    }, 'primary'],
  ]);
}

function songsBar() {
  return [
    h('span', { class: 'searchbox' }, icon('search', 16), h('input', { type: 'search', placeholder: 'Buscar canción por título, autor o un pedazo de la letra…', value: ui.songQuery, 'aria-label': 'Buscar canciones',
      oninput: debounce((e) => { ui.songQuery = e.target.value; songsList(); }, 120) })),
    h('button', { onclick: () => editSong(null) }, icon('plus', 16), 'Nueva canción'),
  ];
}
const songIndex = new WeakMap(); // canción -> texto normalizado para buscar sin recalcular en cada tecla
const collator = new Intl.Collator('es');
const MAX_ROWS = 120;
function songKeys(s) {
  let k = songIndex.get(s);
  if (!k || k.src !== s.title + s.author + s.text.length) songIndex.set(s, k = { src: s.title + s.author + s.text.length, title: norm(s.title), author: norm(s.author), text: norm(s.text) });
  return k;
}
function songsList() {
  const q = norm(ui.songQuery).trim();
  const all = store.db.songs
    .map(s => { const k = q && songKeys(s); return { s, rank: !q ? 1 : k.title.includes(q) ? 3 : k.author.includes(q) ? 2 : k.text.includes(q) ? 1 : 0 }; })
    .filter(x => x.rank).sort((a, b) => b.rank - a.rank || collator.compare(a.s.title, b.s.title)).map(x => x.s);
  const songs = all.slice(0, MAX_ROWS);
  $('libBody').replaceChildren(h('div', { class: 'list' }, songs.length ? [songs.map(s => {
    const item = { type: 'song', songId: s.id };
    return h('div', { class: 'row', tabindex: '0', onclick: () => previewItem(item), ondblclick: () => previewItem(item, true),
      onkeydown: (e) => { if (e.key === 'Enter' && e.target === e.currentTarget) { e.stopPropagation(); previewItem(item, true); } } },
      h('span', { class: 'main' }, h('b', { class: 'ell' }, s.title), h('small', { class: 'ell' }, s.author || s.text.split('\n').find(l => l.trim() && l.length > 12) || '')),
      h('span', { class: 'acts', onclick: (e) => e.stopPropagation(), ondblclick: (e) => e.stopPropagation() },
        act('play', 'Proyectar ahora', () => previewItem(item, true), 'Proyectar', 'go'),
        act('plus', 'Añadir al programa', () => addToSchedule(item), 'Programa', 'add'),
        act('edit', 'Editar', () => editSong(s), '', ''),
        act('trash', 'Eliminar', () => {
          if (confirm(`¿Eliminar “${s.title}” de la biblioteca?`)) { store.db.songs = store.db.songs.filter(x => x !== s); store.saveDb(); }
        }, '', 'danger')),
    );
  }), all.length > songs.length && h('div', { class: 'empty' }, `Mostrando ${songs.length} de ${all.length}. Escribe en el buscador para encontrar las demás.`)]
    : h('div', { class: 'empty' }, q ? [h('b', {}, 'No encontré esa canción'), 'Prueba con otra palabra o créala con «Nueva canción».'] : [h('b', {}, 'Aún no hay canciones'), 'Crea una con «Nueva canción» o tráelas de otro programa con «Importar».'])));
}

// ---------- Biblioteca: Biblia ----------
async function bibleBar() {
  const b = ui.bible;
  const versions = await store.listBibles();
  try { b.data = await store.loadBible(b.version); } catch (e) { toast(e.message); return []; }
  const chapters = b.data.books[b.book].length;
  if (b.chapter > chapters) b.chapter = 1;
  return [
    h('select', { value: b.version, 'aria-label': 'Versión', title: 'Versión de la Biblia', onchange: (e) => {
      if (e.target.value === '+') { e.target.value = b.version; return openBibleDialog(); }
      b.version = e.target.value; store.db.settings.bibleVersion = b.version; store.saveDb(); renderLibrary();
    } },
      versions.map(v => h('option', { value: v.id }, v.name)), h('option', { value: '+' }, '＋ Añadir otra Biblia…')),
    h('span', { class: 'searchbox' }, icon('search', 16), h('input', { type: 'search', placeholder: 'Escribe una cita (Juan 3:16) o palabras (buen pastor) y pulsa Enter', value: b.query, 'aria-label': 'Referencia o búsqueda',
      oninput: debounce((e) => { b.query = e.target.value; bibleQuery(false); }, 200),
      onkeydown: (e) => { if (e.key === 'Enter') { b.query = e.target.value; bibleQuery(true, e.shiftKey || e.ctrlKey); } } })),
    h('select', { value: String(b.book), 'aria-label': 'Libro', onchange: (e) => { b.book = Number(e.target.value); b.chapter = 1; b.query = ''; renderLibrary(); } },
      BOOKS_ES.map((_, i) => h('option', { value: String(i) }, bookName(b.data, i)))),
    h('select', { value: String(b.chapter), 'aria-label': 'Capítulo', onchange: (e) => { b.chapter = Number(e.target.value); b.query = ''; renderLibrary(); } },
      Array.from({ length: chapters }, (_, i) => h('option', { value: String(i + 1) }, String(i + 1)))),
  ];
}
const chapterItem = (verse) => {
  const b = ui.bible, ref = { book: b.book, chapter: b.chapter, from: 0, to: 0 };
  return { type: 'bible', version: b.version, ...ref, start: verse - 1, title: formatRef(b.data, ref) };
};
function bibleQuery(enter, live) {
  const b = ui.bible, q = b.query.trim();
  const ref = q && parseReference(q, b.data);
  if (ref) {
    if (ref.book !== b.book || ref.chapter !== b.chapter) { b.book = ref.book; b.chapter = ref.chapter; renderLibrary({ keepQuery: true }); }
    if (enter) {
      const item = ref.to > ref.from
        ? { type: 'bible', version: b.version, ...ref, title: formatRef(b.data, ref) }
        : chapterItem(ref.from || 1);
      previewItem(item, live);
    } else bibleList(ref.from);
    return;
  }
  bibleList();
}
function bibleList(mark = 0) {
  const b = ui.bible; if (!b.data) return;
  const q = b.query.trim();
  if (q && !parseReference(q, b.data) && q.length > 2) {
    const hits = searchBible(b.data, q);
    return $('libBody').replaceChildren(h('div', { class: 'list' }, hits.length ? hits.map(x => {
      const item = { type: 'bible', version: b.version, book: x.book, chapter: x.chapter, from: 0, to: 0, start: x.verse - 1, title: formatRef(b.data, { book: x.book, chapter: x.chapter }) };
      return h('div', { class: 'row verse', tabindex: '0', onclick: () => previewItem(item), ondblclick: () => previewItem(item, true) },
        h('span', { class: 'main' }, h('b', {}, formatRef(b.data, { book: x.book, chapter: x.chapter, from: x.verse, to: x.verse })), x.text),
        h('span', { class: 'acts', onclick: (e) => e.stopPropagation() },
          act('play', 'Proyectar ahora', () => previewItem(item, true), 'Proyectar', 'go')));
    }) : h('div', { class: 'empty' }, 'Sin resultados para esa búsqueda.')));
  }
  const verses = b.data.books[b.book][b.chapter - 1];
  $('libBody').replaceChildren(h('div', { class: 'list' }, verses.map((t, i) => {
    const item = chapterItem(i + 1);
    return h('div', { class: 'row verse' + (mark === i + 1 ? ' active' : ''), tabindex: '0', onclick: () => previewItem(item), ondblclick: () => previewItem(item, true) },
      h('span', { class: 'n' }, String(i + 1)), h('span', { class: 'main' }, t),
      h('span', { class: 'acts', onclick: (e) => e.stopPropagation(), ondblclick: (e) => e.stopPropagation() },
        act('play', 'Proyectar ahora', () => previewItem(item, true), 'Proyectar', 'go'),
        act('plus', 'Añadir este versículo al programa', () => addToSchedule({ type: 'bible', version: b.version, book: b.book, chapter: b.chapter, from: i + 1, to: i + 1, title: formatRef(b.data, { book: b.book, chapter: b.chapter, from: i + 1, to: i + 1 }) }), 'Programa', 'add')));
  })));
  $('libBody').querySelector('.active')?.scrollIntoView({ block: 'center' });
}

// ---------- Biblioteca: medios ----------
function mediaBar() {
  const input = h('input', { type: 'file', accept: 'image/*,video/*', multiple: true, hidden: true, onchange: async (e) => {
    for (const f of e.target.files) { try { await store.uploadMedia(f); } catch (err) { toast(`${f.name}: ${err.message}`); } }
    e.target.value = ''; if (ui.tab === 'media') mediaList();
  } });
  return [h('span', { class: 'muted ell', style: { flex: '1' } }, 'Para proyectarlos o usarlos de fondo en un tema.'), input,
    h('button', { onclick: () => input.click() }, icon('plus', 16), 'Añadir imágenes o videos')];
}
function mediaList() {
  const tiles = store.db.media.map(m => {
    const thumb = h('button', { class: 'thumb', title: 'Vista previa', 'aria-label': 'Vista previa de ' + m.name, onclick: () => previewItem({ type: 'media', mediaId: m.id }) }, m.kind === 'video' ? icon('video', 28) : null);
    if (m.kind === 'image' || !lite()) resolveSrc(m.src).then(url => {
      if (!url) return;
      if (m.kind === 'image') thumb.replaceChildren(h('img', { src: url, alt: '', loading: 'lazy', decoding: 'async' }));
      else thumb.replaceChildren(h('video', { src: url + '#t=1', muted: true, preload: 'metadata' }));
    });
    return h('div', { class: 'tile' }, thumb, h('div', { class: 'cap ell' }, m.name), h('div', { class: 'acts' },
      act('play', 'Proyectar ahora', () => previewItem({ type: 'media', mediaId: m.id }, true), 'Proyectar', 'go'),
      act('plus', 'Añadir al programa', () => addToSchedule({ type: 'media', mediaId: m.id }), 'Programa', 'add'),
      m.kind === 'image' && act('logo', 'Usar esta imagen como logo de la iglesia', () => { store.db.settings.logoSrc = m.src; store.saveDb(); toast('Listo: se mostrará al pulsar «Logo»'); }, 'Logo'),
      act('trash', 'Eliminar', async () => { if (confirm(`¿Eliminar “${m.name}”?`)) { await store.deleteMedia(m.id); mediaList(); } }, '', 'danger')));
  });
  $('libBody').replaceChildren(tiles.length ? h('div', { class: 'tiles' }, tiles) : h('div', { class: 'empty' }, h('b', {}, 'Aún no hay imágenes ni videos'), 'Añade fondos, anuncios en imagen o videos desde tu computadora.'));
}

// ---------- Biblioteca: temas ----------
let themeScreen = null;
function themesView() {
  themeScreen?.destroy(); themeScreen = null;
  const db = store.db;
  let t = db.themes.find(x => x.id === ui.themeId) ?? db.themes[0];
  ui.themeId = t.id;
  const sample = () => ({ ...defaultLive(), pres: { id: 'muestra', slides: [{ text: 'Sublime gracia del Señor,\nque a un infeliz salvó', footer: 'Sublime Gracia · John Newton' }], theme: t } });
  const changed = () => {
    themeScreen?.update(sample());
    store.saveDb();
    if (ui.preview?.pres.theme.id === t.id) { ui.preview.pres = { ...ui.preview.pres, theme: { ...t } }; renderPreview(); }
    if (store.live.pres?.theme.id === t.id) store.setLive({ ...store.live, pres: { ...store.live.pres, theme: { ...t } }, rev: store.live.rev + 1 });
  };
  const bind = (key, input, parse = (v) => v, obj = t) => {
    const isCheck = input.type === 'checkbox';
    if (isCheck) input.checked = !!obj[key]; else input.value = obj[key];
    input.addEventListener(isCheck || input.tagName === 'SELECT' ? 'change' : 'input', () => { obj[key] = isCheck ? input.checked : parse(input.value); if (key === 'type') obj.src = ''; changed(); if (key === 'type') themesView(); });
    return input;
  };
  const num = (key, min, max, step = 1, obj = t) => bind(key, h('input', { type: 'number', min, max, step }), Number, obj);
  const check = (key, label) => h('label', { class: 'check' }, bind(key, h('input', { type: 'checkbox' })), label);
  const opt = (v, l) => h('option', { value: v }, l);
  const mediaOpts = db.media.filter(m => m.kind === t.bg.type);
  const mon = h('div', { class: 'monitor' });
  const form = h('div', { class: 'tform' },
    mon,
    field('Nombre', bind('name', h('input', {}))),
    field('Fuente', bind('font', h('select', {}, FONTS.map(([v, l]) => opt(v, l))))),
    field('Tamaño máximo', num('size', 30, 220, 2)),
    field('Color del texto', bind('color', h('input', { type: 'color' }))),
    field('Alineación', bind('align', h('select', {}, opt('left', 'Izquierda'), opt('center', 'Centro'), opt('right', 'Derecha')))),
    field('Posición vertical', bind('valign', h('select', {}, opt('top', 'Arriba'), opt('middle', 'Centro'), opt('bottom', 'Abajo')))),
    field('Interlineado', num('lineHeight', 0.9, 2, 0.05)),
    field('Margen (%)', num('margin', 0, 20, 1)),
    field('Contorno (px)', num('outline', 0, 8, 1)),
    field('Transición (ms)', num('fade', 0, 2000, 50)),
    field('Fondo', bind('type', h('select', {}, opt('color', 'Color'), opt('gradient', 'Degradado'), opt('image', 'Imagen'), opt('video', 'Video')), undefined, t.bg)),
    (t.bg.type === 'color' || t.bg.type === 'gradient') && field('Color de fondo', bind('color', h('input', { type: 'color' }), undefined, t.bg)),
    t.bg.type === 'gradient' && field('Segundo color', bind('color2', h('input', { type: 'color' }), undefined, t.bg)),
    (t.bg.type === 'image' || t.bg.type === 'video') && field('Archivo de fondo', bind('src', h('select', {}, opt('', mediaOpts.length ? '(elige)' : '(añade archivos en Medios)'), mediaOpts.map(m => opt(m.src, m.name))), undefined, t.bg)),
    (t.bg.type === 'image' || t.bg.type === 'video') && field('Oscurecer fondo (%)', num('dim', 0, 90, 5)),
    h('div', { class: 'checks' }, check('bold', 'Negrita'), check('italic', 'Cursiva'), check('upper', 'MAYÚSCULAS'), check('shadow', 'Sombra'), check('footer', 'Pie (título / cita)')),
    h('div', { class: 'wide' },
      h('button', { onclick: () => { db.settings.songThemeId = t.id; store.saveDb(); toast('Predeterminado para canciones'); themesView(); } }, 'Usar en canciones'),
      h('button', { onclick: () => { db.settings.bibleThemeId = t.id; store.saveDb(); toast('Predeterminado para Biblia'); themesView(); } }, 'Usar en Biblia'),
      h('button', { onclick: () => { db.settings.textThemeId = t.id; store.saveDb(); toast('Predeterminado para textos'); themesView(); } }, 'Usar en textos'),
      h('button', { onclick: () => { const c = { ...structuredClone(t), id: uid(), name: t.name + ' (copia)' }; db.themes.push(c); ui.themeId = c.id; store.saveDb(); themesView(); } }, 'Duplicar'),
      h('button', { class: 'danger', disabled: db.themes.length < 2, onclick: () => {
        if (!confirm(`¿Eliminar el tema “${t.name}”?`)) return;
        db.themes = db.themes.filter(x => x !== t);
        for (const k of ['songThemeId', 'bibleThemeId', 'textThemeId']) if (db.settings[k] === t.id) db.settings[k] = db.themes[0].id;
        ui.themeId = db.themes[0].id; store.saveDb(); themesView();
      } }, 'Eliminar')),
  );
  const uses = (x) => [db.settings.songThemeId === x.id && 'canciones', db.settings.bibleThemeId === x.id && 'Biblia', db.settings.textThemeId === x.id && 'textos'].filter(Boolean).join(', ');
  $('libBody').replaceChildren(h('div', { class: 'themes' },
    h('div', { class: 'list' },
      db.themes.map(x => h('div', { class: 'row' + (x === t ? ' active' : ''), tabindex: '0', onclick: () => { ui.themeId = x.id; themesView(); } },
        h('span', { class: 'main' }, h('b', { class: 'ell' }, x.name), h('small', { class: 'ell' }, uses(x) || ' ')))),
      h('div', { class: 'row', onclick: () => { const n = defaultTheme({ name: 'Tema nuevo' }); db.themes.push(n); ui.themeId = n.id; store.saveDb(); themesView(); } }, h('span', { class: 'main muted' }, '＋ Tema nuevo'))),
    form));
  themeScreen = createScreen(mon, { chrome: false, muted: true, lite });
  themeScreen.update(sample());
}

async function renderLibrary(opts = {}) {
  document.querySelectorAll('.tabs button').forEach(b => { b.classList.toggle('on', b.dataset.tab === ui.tab); b.setAttribute('aria-selected', b.dataset.tab === ui.tab); });
  if (ui.tab !== 'themes') { themeScreen?.destroy(); themeScreen = null; }
  const tab = ui.tab;
  if (tab === 'songs') { $('libBar').replaceChildren(...songsBar()); songsList(); }
  else if (tab === 'bible') {
    const active = document.activeElement?.type === 'search';
    if (!ui.bible.data || !$('libBar').querySelector('[aria-label="Versión"]')) {
      $('libBar').replaceChildren(); $('libBody').replaceChildren(h('div', { class: 'empty' }, 'Cargando la Biblia…'));
    }
    const bar = await bibleBar();
    if (ui.tab !== tab) return;
    $('libBar').replaceChildren(...bar);
    if (opts.keepQuery && active) { const i = $('libBar').querySelector('input'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
    bibleList(opts.keepQuery ? parseReference(ui.bible.query, ui.bible.data)?.from ?? 0 : 0);
  } else if (tab === 'media') { $('libBar').replaceChildren(...mediaBar()); mediaList(); }
  else { $('libBar').replaceChildren(); themesView(); }
}
document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => { ui.tab = b.dataset.tab; renderLibrary(); });
document.querySelectorAll('.mobnav button').forEach(b => b.onclick = () => setPanel(b.dataset.panel));

// ---------- Pantallas, importar, ajustes ----------
const pageUrl = (file) => withToken(new URL(file, location.href).href);
const lanUrl = (file) => (store.mode === 'server' && store.info?.urls?.[0] ? withToken(store.info.urls[0] + '/' + file) : pageUrl(file));
function openProjector() {
  window.open(pageUrl('output.html'), 'proclama-proyector', 'width=960,height=540');
  toast('Lleva esa ventana al proyector y pulsa F para pantalla completa');
}
$('btnProjector').onclick = openProjector;
function renderClients() {
  const open = (store.clients?.output ?? 0) > 0;
  $('btnProjector').classList.toggle('open', open);
  $('projLabel').textContent = open ? 'Proyector abierto' : 'Abrir proyector';
  $('btnProjector').title = open ? 'El proyector está conectado. Clic para abrir otra ventana.' : 'Abre la ventana que se muestra en el proyector';
}
$('btnOutputs').onclick = () => {
  const n = store.clients ?? {};
  const link = (ic, name, desc, file, role, features) => h('div', { class: 'linkrow' },
    h('span', { class: 'kind' }, icon(ic, 18)),
    h('span', { class: 'main' }, h('b', {}, name, n[role] ? h('span', { class: 'chip ok', style: { marginLeft: '8px' } }, 'Conectado') : null), h('small', {}, desc), h('small', {}, lanUrl(file))),
    h('button', { onclick: () => navigator.clipboard?.writeText(lanUrl(file)).then(() => toast('Enlace copiado')) }, icon('copy', 16), 'Copiar'),
    h('button', { class: 'primary', onclick: () => window.open(pageUrl(file), 'proclama-' + role, features) }, 'Abrir'));
  openDialog('Pantallas', [
    link('monitor', 'Proyector', 'Lo que ve la congregación. Lleva la ventana a la segunda pantalla y pulsa F.', 'output.html', 'output', 'width=960,height=540'),
    link('music', 'Pantalla de escenario', 'Para los músicos: letra actual, la siguiente, reloj y mensajes.', 'stage.html', 'stage', 'width=960,height=540'),
    link('broadcast', 'Transmisión (OBS)', 'Letra en la parte baja con fondo transparente. En OBS: fuente «Navegador», 1920×1080.', 'output.html?mode=lower', 'obs', 'width=960,height=540'),
    link('phone', 'Control remoto', 'Abre este enlace en el celular para pasar las diapositivas.', 'remote.html', 'remote', 'width=420,height=800'),
    h('div', { class: 'tip' }, store.mode === 'server'
      ? 'Cualquier dispositivo conectado al mismo Wi-Fi puede abrir estos enlaces.'
      : 'Modo local: las pantallas solo funcionan en este mismo navegador. Para usar el celular, otra computadora u OBS, inicia la app con «node server.js».'),
  ]);
};

const readText = (file) => file.text();
const readB64 = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(file); });
function addSongs(songs) {
  const have = new Set(store.db.songs.map(s => norm(s.title) + '|' + norm(s.text).slice(0, 80)));
  const fresh = songs.filter(s => s.text && !have.has(norm(s.title) + '|' + norm(s.text).slice(0, 80)));
  store.db.songs.push(...fresh);
  store.saveDb();
  toast(`${fresh.length} canción(es) importada(s)` + (songs.length - fresh.length ? `, ${songs.length - fresh.length} repetida(s) omitida(s)` : ''));
}
/** Controles para añadir o quitar Biblias propias. Se usa en «Importar» y en la pestaña Biblia. */
function bibleSection() {
  const bName = h('input', { value: 'Reina-Valera 1960', placeholder: 'Nombre de la Biblia' });
  const bFiles = h('input', { type: 'file', multiple: true, accept: '.json,application/json' });
  const bList = h('div', { class: 'list' });
  const drawBibles = async () => {
    const own = (await store.listBibles()).filter(b => b.custom);
    bList.replaceChildren(...own.map(b => h('div', { class: 'linkrow' }, h('span', { class: 'main' }, h('b', {}, b.name)),
      h('button', { class: 'danger', onclick: async () => {
        if (!confirm(`¿Quitar “${b.name}”?`)) return;
        await store.deleteBible(b.id);
        if (ui.bible.version === b.id) { ui.bible.version = store.db.settings.bibleVersion; ui.bible.data = null; }
        drawBibles(); if (ui.tab === 'bible') renderLibrary();
      } }, 'Quitar'))));
  };
  const bBtn = h('button', { class: 'primary', onclick: async () => {
    if (!bFiles.files.length) return toast('Elige el archivo JSON (o los 66 archivos, uno por libro)');
    bBtn.disabled = true; bBtn.textContent = 'Importando…';
    try {
      const files = [];
      for (const f of bFiles.files) files.push({ name: f.name, content: await readText(f) });
      const bible = buildBible(files, { name: bName.value });
      await store.saveBible(bible);
      ui.bible.version = bible.id; ui.bible.data = null; store.db.settings.bibleVersion = bible.id; store.saveDb();
      toast(`“${bible.name}” añadida`); bFiles.value = '';
      drawBibles(); if (ui.tab === 'bible') renderLibrary();
    } catch (err) { toast(err.message); }
    bBtn.disabled = false; bBtn.textContent = 'Añadir Biblia';
  } }, 'Añadir Biblia');
  drawBibles();
  return [
    h('p', { class: 'muted' }, 'Añade una traducción que tengas derecho a usar. Se guarda solo en esta computadora. Sirve un archivo JSON con la Biblia completa o los 66 archivos JSON, uno por libro (genesis.json, exodo.json…).'),
    h('div', { class: 'drow' }, field('1. Nombre que verás en la lista', bName), field('2. Archivo o archivos .json (no PDF ni Word)', bFiles)),
    h('div', {}, bBtn), bList,
  ];
}
function openBibleDialog() {
  openDialog('Añadir otra Biblia', [...bibleSection(),
    h('div', { class: 'tip' }, 'La app trae Reina-Valera 1909 y King James, que son de dominio público. Otras, como la Reina-Valera 1960 o la NVI, tienen derechos de autor: cárgalas solo si tu iglesia cuenta con permiso.')]);
}
$('btnImport').onclick = () => {
  const songFiles = h('input', { type: 'file', multiple: true, accept: '.txt,.json,.xml,.cho,.crd,.chopro,.chordpro,.pro,.rtf,text/plain,application/json', onchange: async (e) => {
    const all = [];
    for (const f of e.target.files) { try { all.push(...importSongFile(f.name, await readText(f))); } catch (err) { toast(`${f.name}: ${err.message}`); } }
    if (all.length) addSongs(all);
    e.target.value = '';
  } });
  const ewSongs = h('input', { type: 'file', accept: '.db' }), ewWords = h('input', { type: 'file', accept: '.db' });
  const ewBtn = h('button', { onclick: async () => {
    if (!ewSongs.files[0] || !ewWords.files[0]) return toast('Elige los dos archivos: Songs.db y SongWords.db');
    ewBtn.disabled = true; ewBtn.textContent = 'Importando…';
    try {
      const r = await fetch(withToken('/api/import/easyworship'), { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songs: await readB64(ewSongs.files[0]), words: await readB64(ewWords.files[0]) }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      addSongs(data.songs);
    } catch (err) { toast('No se pudo importar: ' + err.message); }
    ewBtn.disabled = false; ewBtn.textContent = 'Importar de EasyWorship';
  } }, 'Importar de EasyWorship');
  const backup = h('input', { type: 'file', accept: '.json', onchange: async (e) => {
    try {
      const data = JSON.parse(await readText(e.target.files[0]));
      if (!Array.isArray(data.songs) || !Array.isArray(data.themes)) throw new Error('No es una copia de seguridad de Proclama');
      if (!confirm('Esto reemplaza la biblioteca actual (canciones, temas y programa). ¿Continuar?')) return;
      const base = defaultDb();
      store.db = { ...base, ...data, media: store.db.media, settings: { ...base.settings, ...data.settings } };
      store.saveDb(); toast('Copia restaurada');
    } catch (err) { toast(err.message); }
  } });
  openDialog('Importar y exportar', [
    h('h4', {}, 'Canciones'),
    h('p', { class: 'muted' }, 'Texto plano (.txt), ChordPro, OpenSong, OpenLyrics/OpenLP (.xml) y JSON de Holyrics. Puedes elegir varios archivos.'),
    songFiles,
    h('h4', {}, 'EasyWorship 6.1 o posterior'),
    store.mode === 'server'
      ? [h('p', { class: 'muted' }, 'Los archivos están en C:\\Users\\Public\\Softouch\\EasyWorship\\Default\\Databases\\Data\\'),
        h('div', { class: 'drow' }, field('Songs.db', ewSongs), field('SongWords.db', ewWords)), h('div', {}, ewBtn)]
      : h('p', { class: 'muted' }, 'Disponible cuando la app se ejecuta con el servidor (node server.js).'),
    h('h4', {}, 'Biblias'),
    ...bibleSection(),
    h('h4', {}, 'Copia de seguridad'),
    h('div', { class: 'drow' },
      h('button', { onclick: () => {
        const { media, ...rest } = store.db;
        const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(rest, null, 1)], { type: 'application/json' })), download: `proclama-${new Date().toISOString().slice(0, 10)}.json` });
        a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      } }, 'Descargar copia (canciones, temas, programa)')),
    field('Restaurar una copia', backup),
  ]);
};

$('btnSettings').onclick = async () => {
  const s = store.db.settings;
  const versions = await store.listBibles();
  const f = {
    churchName: h('input', { value: s.churchName }),
    versesPerSlide: h('input', { type: 'number', min: 1, max: 6, value: String(s.versesPerSlide) }),
    lowPower: h('input', { type: 'checkbox' }),
    bibleVersion: h('select', { value: s.bibleVersion }, versions.map(v => h('option', { value: v.id }, v.name))),
  };
  f.lowPower.checked = s.lowPower !== false;
  openDialog('Ajustes', [
    field('Nombre de la iglesia (se muestra con el botón Logo si no hay imagen)', f.churchName),
    h('div', { class: 'drow' }, field('Versículos por diapositiva', f.versesPerSlide), field('Biblia predeterminada', f.bibleVersion)),
    s.logoSrc && h('div', {}, h('button', { onclick: () => { s.logoSrc = ''; store.saveDb(); toast('Logo quitado'); } }, 'Quitar la imagen del logo')),
    h('label', { class: 'check' }, f.lowPower, 'Modo de bajo consumo: en este panel los videos se ven como imagen fija y sin animaciones (el proyector no cambia)'),
    h('h4', {}, 'Atajos de teclado'),
    h('p', { class: 'muted' }, '→ o espacio: siguiente · ←: anterior · Enter: proyectar la vista previa · B: negro · C: ocultar texto · L: logo'),
    h('h4', {}, 'Control por API'),
    store.mode === 'server'
      ? h('p', { class: 'muted' }, 'Ejemplos: ', h('code', {}, '/api/action/next'), ' ', h('code', {}, '/api/action/show-verse?ref=Juan 3:16'), ' ', h('code', {}, '/api/action/alert?text=Hola'), '. Sirve para Stream Deck, Companion o scripts.')
      : h('p', { class: 'muted' }, 'Disponible con el servidor (node server.js).'),
  ], [['Cancelar'], ['Guardar', () => {
    s.churchName = f.churchName.value.trim(); s.versesPerSlide = Math.max(1, Number(f.versesPerSlide.value) || 1);
    s.bibleVersion = f.bibleVersion.value; ui.bible.version = s.bibleVersion; s.lowPower = f.lowPower.checked; store.saveDb();
    renderPreview(); renderLive(); if (ui.tab === 'media') mediaList();
  }, 'primary']]);
};

// ---------- Teclado ----------
addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || $('dlg').open) return;
  const tag = e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  const onButton = tag === 'BUTTON';
  const k = e.key;
  if (k === 'ArrowRight' || k === 'ArrowDown' || k === 'PageDown' || (k === ' ' && !onButton)) store.dispatch({ type: 'next' });
  else if (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'PageUp') store.dispatch({ type: 'prev' });
  else if (k === 'Enter' && !onButton) goLive();
  else if (k === 'b' || k === 'B') store.dispatch({ type: 'black' });
  else if (k === 'c' || k === 'C') store.dispatch({ type: 'clear' });
  else if (k === 'l' || k === 'L') toggleLogo();
  else return;
  e.preventDefault();
});

// ---------- Arranque ----------
let lastOnAir = null;
function renderStatus() {
  const s = $('status');
  if (store.mode === 'server') { s.textContent = store.online ? 'Conectado' : 'Sin conexión'; s.className = 'chip ' + (store.online ? 'ok' : 'bad'); }
  else { s.textContent = 'Modo local'; s.className = 'chip'; s.title = 'Sin servidor: los datos se guardan en este navegador'; }
}
store.on((what) => {
  if (what === 'live') {
    renderLive();
    const onAir = store.live.pres?.itemId ?? null;
    if (onAir !== lastOnAir) { lastOnAir = onAir; renderSchedule(); }
  }
  else if (what === 'db') {
    renderSchedule();
    if (ui.tab === 'songs') songsList(); else if (ui.tab === 'media') mediaList();
    else if (ui.tab === 'themes' && !$('libBody').contains(document.activeElement)) themesView();
    const sel = $('pvTheme'), cur = sel.value;
    sel._themes = store.db.themes;
    sel.replaceChildren(...store.db.themes.map(t => h('option', { value: t.id }, t.name))); sel.value = cur;
  } else if (what === 'clients') renderClients();
  else if (what === 'bibles') { ui.bible.data = null; if (ui.tab === 'bible') renderLibrary(); }
  else renderStatus();
});
hydrateIcons();
const tools = $('tools');
try { tools.open = localStorage.getItem('proclama.tools') === '1'; } catch { /* sin almacenamiento */ }
tools.addEventListener('toggle', () => { try { localStorage.setItem('proclama.tools', tools.open ? '1' : '0'); } catch { /* sin almacenamiento */ } });
setPanel('library');
renderClients(); renderStatus(); renderSchedule(); renderPreview(); renderLive(); renderLibrary();
