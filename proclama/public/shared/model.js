// Modelo de datos y lógica compartida entre el navegador y el servidor (sin dependencias).

export const APP_NAME = 'Proclama';
export const VERSION = '0.3.0';

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const FONTS = [
  ['system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif', 'Sans (sistema)'],
  ['Arial, Helvetica, sans-serif', 'Arial'],
  ['"Arial Black", "Arial Bold", Gadget, sans-serif', 'Arial Black'],
  ['Verdana, Geneva, sans-serif', 'Verdana'],
  ['"Trebuchet MS", Tahoma, sans-serif', 'Trebuchet'],
  ['Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif', 'Impact'],
  ['Georgia, "Times New Roman", serif', 'Georgia (serif)'],
  ['"Courier New", Courier, monospace', 'Courier'],
];

export function defaultTheme(over = {}) {
  return {
    id: uid(), name: 'Tema', font: FONTS[0][0], size: 96, color: '#ffffff', bold: true, italic: false,
    upper: false, align: 'center', valign: 'middle', shadow: true, outline: 0, lineHeight: 1.25, margin: 7,
    bg: { type: 'gradient', color: '#0b1d3a', color2: '#1b4d8f', src: '' }, dim: 0, footer: true, fade: 350,
    ...over,
  };
}

const SAMPLE_SONGS = [
  {
    title: 'Santo, Santo, Santo', author: 'Reginald Heber · trad. Juan B. Cabrera', copyright: 'Dominio público', order: '',
    text: `Verso 1
¡Santo! ¡Santo! ¡Santo! Señor omnipotente,
Siempre el labio mío loores te dará;

¡Santo! ¡Santo! ¡Santo! Te adoro reverente,
Dios en tres personas, bendita Trinidad.

Verso 2
¡Santo! ¡Santo! ¡Santo! En numeroso coro
Santos escogidos te adoran sin cesar,

De alegría llenos, y sus coronas de oro
Rinden ante el trono y el cristalino mar.

Verso 3
¡Santo! ¡Santo! ¡Santo! La inmensa muchedumbre
De ángeles que cumplen tu santa voluntad,

Ante ti se postra, bañada de tu lumbre,
Ante ti que has sido, que eres y serás.

Verso 4
¡Santo! ¡Santo! ¡Santo! La gloria de tu nombre
Vemos en tus obras en cielo, tierra y mar;

¡Santo! ¡Santo! ¡Santo! Te adorará todo hombre,
Dios en tres personas, bendita Trinidad.`,
  },
  {
    title: 'Sublime Gracia', author: 'John Newton', copyright: 'Dominio público', order: '',
    text: `Verso 1
Sublime gracia del Señor,
Que a un infeliz salvó;
Fui ciego, mas hoy veo yo,
Perdido y Él me halló.

Verso 2
Su gracia me enseñó a temer,
Mis dudas ahuyentó;
¡Oh, cuán precioso fue a mi ser
Cuando Él me transformó!

Verso 3
En los peligros o aflicción
Que yo he tenido aquí,
Su gracia siempre me libró
Y me guiará feliz.

Verso 4
Y cuando en Sion por siglos mil
Brillando esté cual sol,
Yo cantaré por siempre allí
Su amor que me salvó.`,
  },
];

export function defaultDb() {
  const tSong = defaultTheme({ id: 'tema-canciones', name: 'Canciones (azul)' });
  const tBible = defaultTheme({
    id: 'tema-biblia', name: 'Biblia (oscuro)', size: 80, bold: false, align: 'left',
    bg: { type: 'gradient', color: '#141414', color2: '#3b2a12', src: '' },
  });
  const tClean = defaultTheme({
    id: 'tema-claro', name: 'Claro', color: '#1a1a1a', shadow: false,
    bg: { type: 'color', color: '#f4f1ea', color2: '#f4f1ea', src: '' },
  });
  return {
    version: 1,
    songs: SAMPLE_SONGS.map((s, i) => ({ id: 'ejemplo-' + (i + 1), ccli: '', themeId: '', ...s })),
    media: [],
    themes: [tSong, tBible, tClean],
    schedule: { name: 'Culto', items: [] },
    settings: {
      churchName: 'Mi Iglesia', songThemeId: tSong.id, bibleThemeId: tBible.id, textThemeId: tSong.id,
      bibleVersion: 'rv1909', versesPerSlide: 1, logoSrc: '', lowPower: true,
    },
  };
}

export function defaultLive() {
  return {
    rev: 0, pres: null, index: 0, black: false, clear: false,
    logo: { on: false, src: '', text: '' },
    alert: { on: false, text: '' },
    countdown: { on: false, endAt: 0, label: '' },
    stageMsg: '',
  };
}

// ---------- Canciones ----------

const SECTION_WORDS = [
  ['verso', 'Verso'], ['verse', 'Verso'], ['estrofa', 'Verso'], ['coro', 'Coro'], ['chorus', 'Coro'], ['estribillo', 'Coro'],
  ['pre-coro', 'Pre-coro'], ['precoro', 'Pre-coro'], ['pre coro', 'Pre-coro'], ['pre-chorus', 'Pre-coro'], ['prechorus', 'Pre-coro'],
  ['puente', 'Puente'], ['bridge', 'Puente'], ['intro', 'Intro'], ['final', 'Final'], ['ending', 'Final'], ['outro', 'Final'],
  ['interludio', 'Interludio'], ['interlude', 'Interludio'], ['tag', 'Tag'], ['instrumental', 'Instrumental'], ['slide', 'Diapositiva'],
];

/** Si la línea es un encabezado de sección ("Coro", "[Verso 2]", "Chorus 1:") devuelve su nombre normalizado. */
export function sectionHeader(line) {
  let s = String(line).trim();
  const bracket = /^\[(.+)\]$/.exec(s);
  if (bracket) s = bracket[1].trim();
  s = s.replace(/:$/, '').trim();
  const m = /^([A-Za-zÁÉÍÓÚáéíóúñÑ]+(?:[- ][A-Za-z]+)?)\s*(\d{0,2})\s*(?:\(?x\s*\d+\)?)?$/.exec(s);
  if (!m) return bracket ? s : null;
  const word = norm(m[1]);
  const hit = SECTION_WORDS.find(([k]) => k === word);
  if (!hit) return bracket ? s : null;
  return hit[1] + (m[2] ? ' ' + Number(m[2]) : '');
}

/** Texto de canción -> [{ label, slides: [texto] }]. Línea en blanco = nueva diapositiva. */
export function parseSongSections(text) {
  const sections = [];
  let cur = null, buf = [];
  const flush = () => {
    const t = buf.join('\n').trim();
    buf = [];
    if (!t) return;
    if (!cur) { cur = { label: '', slides: [] }; sections.push(cur); }
    cur.slides.push(t);
  };
  for (const raw of String(text ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    const head = sectionHeader(line);
    if (head) { flush(); cur = { label: head, slides: [] }; sections.push(cur); continue; }
    if (!line.trim()) { flush(); continue; }
    buf.push(line.trim());
  }
  flush();
  return sections.filter(s => s.slides.length);
}

/** Abreviatura de una sección: "Verso 2" -> "v2", "Coro" -> "c", "Puente" -> "p", "Pre-coro" -> "pc". */
export function sectionAbbr(label) {
  const m = /^(.*?)(?:\s+(\d+))?$/.exec(norm(label));
  const map = { verso: 'v', coro: 'c', 'pre-coro': 'pc', puente: 'p', intro: 'i', final: 'f', interludio: 'in', tag: 't', instrumental: 'ins', diapositiva: 'd' };
  return (map[m[1]] ?? m[1]) + (m[2] ?? '');
}

/** Aplica el orden de la canción ("V1 C V2 C P C"). Si no hay orden, usa el orden escrito. */
export function orderSections(sections, order) {
  const tokens = String(order ?? '').split(/[\s,]+/).map(norm).filter(Boolean);
  if (!tokens.length) return sections;
  const out = [];
  for (const tok of tokens) {
    const alias = tok.replace(/^b(\d*)$/, 'p$1'); // B = bridge/puente
    const found = sections.find(s => sectionAbbr(s.label) === alias)
      ?? sections.find(s => sectionAbbr(s.label) === alias + '1')
      ?? sections.find(s => sectionAbbr(s.label).replace(/\d+$/, '') === alias);
    if (found) out.push(found);
  }
  return out.length ? out : sections;
}

export function themeById(db, id, fallbackId) {
  return db.themes.find(t => t.id === id) ?? db.themes.find(t => t.id === fallbackId) ?? db.themes[0] ?? defaultTheme();
}

export function songToPresentation(song, db, themeId) {
  const sections = orderSections(parseSongSections(song.text), song.order);
  const footer = [song.title, song.author, song.copyright && '© ' + song.copyright.replace(/^©\s*/, ''), song.ccli && 'CCLI ' + song.ccli]
    .filter(Boolean).join(' · ');
  const slides = [];
  for (const sec of sections) for (const text of sec.slides) slides.push({ text, label: sec.label, footer: slides.length ? '' : footer });
  if (!slides.length) slides.push({ text: '', label: '', footer });
  return {
    id: uid(), type: 'song', title: song.title, slides,
    theme: themeById(db, themeId || song.themeId, db.settings.songThemeId),
  };
}

export function textToPresentation(title, text, db, themeId) {
  const slides = String(text ?? '').replace(/\r\n?/g, '\n').split(/\n\s*\n/).map(t => t.trim()).filter(Boolean)
    .map(t => ({ text: t, label: '', footer: '' }));
  if (!slides.length) slides.push({ text: '', label: '', footer: '' });
  return { id: uid(), type: 'text', title: title || 'Texto', slides, theme: themeById(db, themeId, db.settings.textThemeId) };
}

export function mediaToPresentation(media, db) {
  return {
    id: uid(), type: 'media', title: media.name,
    slides: [{ text: '', label: media.kind === 'video' ? 'Video' : 'Imagen', footer: '', media: { kind: media.kind, src: media.src } }],
    theme: defaultTheme({ id: 'media', bg: { type: 'color', color: '#000000', color2: '#000000', src: '' } }),
  };
}

// ---------- Estado en vivo ----------

/** Reductor puro del estado en vivo. Devuelve un objeto nuevo con rev + 1. */
export function liveReducer(live, action) {
  const l = { ...defaultLive(), ...live };
  const n = l.pres ? l.pres.slides.length : 0;
  const clamp = (i) => Math.max(0, Math.min(n - 1, i | 0));
  const on = (cur, v) => (v === undefined || v === null ? !cur : !!v);
  switch (action.type) {
    case 'show':
      l.pres = action.pres; l.index = Math.max(0, Math.min((action.pres?.slides.length ?? 1) - 1, action.index | 0));
      l.black = false; l.clear = false; l.logo = { ...l.logo, on: false };
      break;
    case 'next': if (n) { l.index = clamp(l.index + 1); l.clear = false; } break;
    case 'prev': if (n) { l.index = clamp(l.index - 1); l.clear = false; } break;
    case 'goto': if (n) { l.index = clamp(action.index); l.clear = false; l.black = false; } break;
    case 'black': l.black = on(l.black, action.value); break;
    case 'clear': l.clear = on(l.clear, action.value); break;
    case 'logo':
      l.logo = { on: on(l.logo.on, action.value), src: action.src ?? l.logo.src, text: action.text ?? l.logo.text };
      break;
    case 'close': l.pres = null; l.index = 0; l.clear = false; break;
    case 'alert': {
      const text = action.text ?? l.alert.text;
      l.alert = { text, on: !!text && on(l.alert.on, action.value) };
      break;
    }
    case 'countdown': {
      const secs = Number(action.seconds) || 0;
      l.countdown = secs > 0 && action.value !== false
        ? { on: true, endAt: (action.now ?? Date.now()) + secs * 1000, label: action.label ?? '' }
        : { on: false, endAt: 0, label: '' };
      break;
    }
    case 'stage': l.stageMsg = String(action.text ?? ''); break;
    default: return live;
  }
  l.rev = (live?.rev ?? 0) + 1;
  return l;
}

export function fmtClock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  const p = (x) => String(x).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(ss)}` : `${p(m)}:${p(ss)}`;
}
