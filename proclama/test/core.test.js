import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { defaultDb, defaultLive, liveReducer, parseSongSections, orderSections, songToPresentation, sectionHeader, fmtClock } from '../public/shared/model.js';
import { parseReference, formatRef, searchBible, bibleToPresentation, findBook } from '../public/shared/bible.js';
import { importSongFile, rtfToText } from '../public/shared/importers.js';

const bible = JSON.parse(fs.readFileSync(new URL('../public/bibles/rv1909.json', import.meta.url)));

test('secciones de canción', () => {
  const s = parseSongSections('Verso 1\nuno\ndos\n\ntres\n\n[Coro]\ncuatro\n\nCoro celestial canta\n');
  assert.deepEqual(s.map(x => [x.label, x.slides.length]), [['Verso 1', 2], ['Coro', 2]]);
  assert.equal(sectionHeader('Chorus 2:'), 'Coro 2');
  assert.equal(sectionHeader('Santo, Santo'), null);
});

test('orden de canción', () => {
  const s = parseSongSections('Verso 1\na\n\nCoro\nb\n\nVerso 2\nc\n\nPuente\nd');
  assert.deepEqual(orderSections(s, 'V1 C V2 C B C').map(x => x.label), ['Verso 1', 'Coro', 'Verso 2', 'Coro', 'Puente', 'Coro']);
});

test('presentación de canción con pie', () => {
  const db = defaultDb();
  const p = songToPresentation(db.songs[1], db);
  assert.equal(p.slides.length, 4);
  assert.match(p.slides[0].footer, /Sublime Gracia/);
  assert.equal(p.slides[1].footer, '');
  assert.equal(p.theme.id, db.settings.songThemeId);
});

test('referencias bíblicas', () => {
  assert.deepEqual(parseReference('Juan 3:16', bible), { book: 42, chapter: 3, from: 16, to: 16 });
  assert.deepEqual(parseReference('jn 3 16-18', bible), { book: 42, chapter: 3, from: 16, to: 18 });
  assert.deepEqual(parseReference('1 co 13', bible), { book: 45, chapter: 13, from: 0, to: 0 });
  assert.deepEqual(parseReference('Salmos 23:1-99', bible), { book: 18, chapter: 23, from: 1, to: 6 });
  assert.equal(parseReference('1 Juan 4:8', bible).book, 61);
  assert.equal(parseReference('II Timoteo 1:7', bible).book, 54);
  assert.equal(parseReference('Apocalipsis 22.21', bible).book, 65);
  assert.equal(parseReference('Juan 99:1', bible), null);
  assert.equal(parseReference('hola mundo', bible), null);
  assert.equal(findBook('gen'), 0);
  assert.equal(formatRef(bible, { book: 42, chapter: 3, from: 16, to: 18 }), 'Juan 3:16-18');
});

test('búsqueda y presentación bíblica', () => {
  const hits = searchBible(bible, 'de tal manera amó Dios');
  assert.ok(hits.some(h => h.book === 42 && h.chapter === 3 && h.verse === 16));
  const db = defaultDb();
  const p = bibleToPresentation(bible, { book: 42, chapter: 3, from: 16, to: 18 }, db);
  assert.equal(p.slides.length, 3);
  assert.match(p.slides[0].text, /^16 Porque de tal manera/);
  assert.match(p.slides[0].footer, /Juan 3:16 · Reina-Valera 1909/);
  db.settings.versesPerSlide = 2;
  assert.equal(bibleToPresentation(bible, { book: 18, chapter: 23, from: 0, to: 0 }, db).slides.length, 3);
});

test('reductor en vivo', () => {
  const pres = { id: 'x', slides: [{ text: 'a' }, { text: 'b' }], theme: {} };
  let l = liveReducer(defaultLive(), { type: 'show', pres, index: 0 });
  l = liveReducer(l, { type: 'next' }); assert.equal(l.index, 1);
  l = liveReducer(l, { type: 'next' }); assert.equal(l.index, 1);
  l = liveReducer(l, { type: 'black' }); assert.equal(l.black, true);
  l = liveReducer(l, { type: 'goto', index: 0 }); assert.equal(l.black, false);
  l = liveReducer(l, { type: 'alert', text: 'Hola', value: true }); assert.deepEqual(l.alert, { text: 'Hola', on: true });
  l = liveReducer(l, { type: 'countdown', seconds: 60, now: 1000 }); assert.equal(l.countdown.endAt, 61000);
  l = liveReducer(l, { type: 'close' }); assert.equal(l.pres, null);
  assert.equal(l.rev, 8);
  assert.equal(fmtClock(61000), '01:01');
});

test('importadores', () => {
  const [txt] = importSongFile('x.txt', 'Mi Canción\n\nVerso 1\nhola\n\nCoro\nadiós\nAutor: Ana');
  assert.equal(txt.title, 'Mi Canción'); assert.equal(txt.author, 'Ana'); assert.equal(parseSongSections(txt.text).length, 2);
  const [cho] = importSongFile('x.cho', '{title: Prueba}\n{artist: Luis}\n{soc}\n[G]Gloria a [D]Dios\n{eoc}\nOtra [Em]línea');
  assert.equal(cho.title, 'Prueba'); assert.equal(cho.author, 'Luis'); assert.match(cho.text, /Coro\nGloria a Dios/);
  const [os] = importSongFile('cancion', '<?xml version="1.0"?><song><title>OS</title><author>Yo</author><lyrics>[V1]\n.G  D\n Santo eres\n[C]\n Aleluya</lyrics><presentation>V1 C</presentation></song>');
  assert.equal(os.title, 'OS'); assert.deepEqual(parseSongSections(os.text).map(s => s.label), ['Verso 1', 'Coro']);
  const [ol] = importSongFile('a.xml', '<song xmlns="http://openlyrics.info/namespace/2009/song"><properties><titles><title>OL</title></titles><authors><author>A</author><author>B</author></authors></properties><lyrics><verse name="v1"><lines>uno<br/>dos</lines></verse><verse name="c1"><lines>tres &amp; cuatro</lines></verse></lyrics></song>');
  assert.equal(ol.title, 'OL'); assert.equal(ol.author, 'A, B'); assert.match(ol.text, /Verso 1\nuno\ndos\n\nCoro 1\ntres & cuatro/);
  const [hj] = importSongFile('h.json', JSON.stringify({ title: 'H', artist: 'Z', lyrics: { paragraphs: [{ description: 'Coro', text: 'la la' }, { description: '', text: 'otra' }] } }));
  assert.equal(hj.author, 'Z'); assert.equal(hj.text, 'Coro\nla la\n\notra');
});

test('RTF de EasyWorship', () => {
  const rtf = "{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Arial;}}{\\colortbl;\\red0\\green0\\blue0;}\\pard\\f0\\fs40 Verse 1\\par Se\\'f1or, t\\u250?\\par\\par Chorus\\par \\u161?Gloria!\\par}";
  assert.equal(rtfToText(rtf), 'Verse 1\nSeñor, tú\n\nChorus\n¡Gloria!');
});

test('importar Biblia del usuario', async () => {
  const { buildBible } = await import('../public/shared/bible-import.js');
  const perBook = BOOKS.map((b, i) => ({ name: b + '.json', content: JSON.stringify([[`_Texto ${i}_ /n dos`, 'Bet=el']]) }));
  const b = buildBible([...perBook, { name: '_index.json', content: '[{"key":"genesis"}]' }], { name: 'Reina-Valera 1960' });
  assert.equal(b.id, 'reina-valera-1960'); assert.equal(b.books.length, 66);
  assert.equal(b.books[42][0][0], 'Texto 42 dos'); assert.equal(b.books[0][0][1], 'Bet-el');
  assert.throws(() => buildBible(perBook.slice(0, 60), { name: 'X' }), /Faltan 6/);
  const whole = buildBible([{ name: 'b.json', content: JSON.stringify({ books: bible.books.map(c => ({ chapters: c.map(v => ({ verses: v.map(t => ({ text: t })) })) })) }) }], { name: 'Otra' });
  assert.equal(whole.books[42][2][15], bible.books[42][2][15]);
});
const BOOKS = ['genesis', 'exodo', 'levitico', 'numeros', 'deuteronomio', 'josue', 'jueces', 'rut', '1_samuel', '2_samuel', '1_reyes', '2_reyes', '1_cronicas', '2_cronicas', 'esdras', 'nehemias', 'ester', 'job', 'salmos', 'proverbios', 'eclesiastes', 'cantares', 'isaias', 'jeremias', 'lamentaciones', 'ezequiel', 'daniel', 'oseas', 'joel', 'amos', 'abdias', 'jonas', 'miqueas', 'nahum', 'habacuc', 'sofonias', 'hageo', 'zacarias', 'malaquias', 'mateo', 'marcos', 'lucas', 'juan', 'hechos', 'romanos', '1_corintios', '2_corintios', 'galatas', 'efesios', 'filipenses', 'colosenses', '1_tesalonicenses', '2_tesalonicenses', '1_timoteo', '2_timoteo', 'tito', 'filemon', 'hebreos', 'santiago', '1_pedro', '2_pedro', '1_juan', '2_juan', '3_juan', 'judas', 'apocalipsis'];

test('Biblia desde las líneas de un PDF', async () => {
  const { parseBiblePages, splitVerses, linesFromItems } = await import('../public/shared/bible-pdf.js');
  const L = (ys) => ys.map(([y, s]) => ({ x: 45, y, s }));
  const head = [800, 'Santa Biblia'], foot = [20, 'www.ejemplo.org'];
  // Interlineado de 14 dentro de un párrafo y de 28 entre párrafos, como en un PDF real.
  const pages = [
    L([head, foot, [760, 'LIBRO PRIMERO DE MOISÉS'], [732, 'GÉNESIS'], [704, 'La creación'], [676, 'Génesis 1'],
      [648, '1 En el principio'], [634, 'creó Dios. 2 Y la tierra'], [620, 'estaba vacía,'], [606, 'y las tinieblas estaban.3 Y dijo Dios:'], [592, 'Sea la luz;']]),
    L([head, foot, [760, 'y fue la luz.'], [732, 'El hombre en el huerto'], [718, '(Gn. 2.4-25)'], [690, 'Génesis 2'],
      [662, '1 Fueron, pues, acabados'], [648, 'los cielos, 2 y la tierra.'], [620, '¿Quién es el mayor?'], [592, '2 Y acabó Dios'], [578, 'en el día séptimo.']]),
    ...Array.from({ length: 6 }, () => L([head, foot])),
  ];
  const r = parseBiblePages(pages);
  assert.deepEqual(r.books[0][0], ['En el principio creó Dios.', 'Y la tierra estaba vacía, y las tinieblas estaban.', 'Y dijo Dios: Sea la luz; y fue la luz.']);
  assert.deepEqual(r.books[0][1], ['Fueron, pues, acabados los cielos, y la tierra.', 'Y acabó Dios en el día séptimo.']);
  assert.ok(r.missing > 1000);
  const gaps = [];
  assert.deepEqual(splitVerses('1 Uno. 2 Dos.x6* roto 4 Cuatro. 5 Cinco.', gaps), ['Uno.', 'Dos.x* roto', '', 'Cuatro.', 'Cinco.']);
  assert.deepEqual(gaps, [3]);
  assert.deepEqual(splitVerses('1 Uno. 2 Dos; 4 para que fin.', [], 3), ['Uno.', 'Dos;', 'para que fin.']);
  const items = [{ str: 'por mí', transform: [10, 0, 0, 10, 45, 700], width: 30 }, { str: 'y por ti.', transform: [10, 0, 0, 10, 79, 700], width: 40 }, { str: 'Otra', transform: [10, 0, 0, 10, 45, 686], width: 20 }];
  assert.deepEqual(linesFromItems(items).map(l => l.s), ['por mí y por ti.', 'Otra']);
});

test('actualizaciones: versiones y release.json al día', async () => {
  const { compareVersions, listFiles } = await import('../lib/update.js');
  assert.ok(compareVersions('0.10.0', '0.9.9') > 0); assert.ok(compareVersions('1.0.0', '1.0.0') === 0); assert.ok(compareVersions('0.2.9', '0.3.0') < 0);
  const root = new URL('..', import.meta.url).pathname;
  const release = JSON.parse(fs.readFileSync(root + 'release.json', 'utf8'));
  const files = await listFiles(root);
  assert.ok(!Object.keys(files).some(f => f.startsWith('data/') || f.startsWith('docs/') || f === 'release.json'));
  // Si esto falla, ejecuta: node tools/make-release.mjs <versión> "novedades"
  assert.deepEqual(files, release.files, 'release.json no coincide con los archivos: vuelve a generar la versión');
  assert.equal(release.version, JSON.parse(fs.readFileSync(root + 'package.json', 'utf8')).version);
});

test('PDF: presentación, caducidad de 2 semanas y capa del presentador', async () => {
  const { pdfToPresentation, expiredPdfs, pdfDaysLeft, pdfSrc, pdfKey, emptyOv, PDF_KEEP_DAYS } = await import('../public/shared/model.js');
  const { zoomTransform, fitRect } = await import('../public/js/overlay.js');
  const { timerColor, mmss } = await import('../public/shared/timer.js');
  const pdf = { id: 'abc12345', name: 'Prueba', pages: 3, pattern: '/pdf/abc12345/{k}.jpg' };
  assert.equal(pdfKey('p', 7), 'p0007'); assert.equal(pdfSrc(pdf, 't', 12), '/pdf/abc12345/t0012.jpg');
  const pres = pdfToPresentation(pdf);
  assert.equal(pres.type, 'pdf'); assert.equal(pres.pdfId, 'abc12345'); assert.equal(pres.slides.length, 3);
  assert.equal(pres.slides[1].media.src, '/pdf/abc12345/p0002.jpg'); assert.equal(pres.slides[1].media.thumb, '/pdf/abc12345/t0002.jpg');
  // 14 días desde la última vez que se abrió (no desde que se añadió)
  const DAY = 86400e3, now = Date.now();
  const db = { pdfs: [{ ...pdf, id: 'a', addedAt: now - 30 * DAY, lastOpened: now - 3 * DAY }, { ...pdf, id: 'b', addedAt: now - 30 * DAY, lastOpened: now - 15 * DAY }, { ...pdf, id: 'c', addedAt: now - 15 * DAY }] };
  assert.deepEqual(expiredPdfs(db, now).map(p => p.id), ['b', 'c']); assert.equal(PDF_KEEP_DAYS, 14);
  assert.equal(pdfDaysLeft(db.pdfs[0], now), 11); assert.equal(pdfDaysLeft(db.pdfs[1], now), 0);
  // anotaciones y cambio de página
  let l = liveReducer(defaultLive(), { type: 'show', pres, index: 0 });
  l = liveReducer(l, { type: 'overlay', patch: { pointer: { x: 0.5, y: 0.5, c: '#f00' }, zoom: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 }, strokes: [{ c: '#fff', a: 1, w: 0.005, p: [[0.1, 0.1]] }], sv: 5 } });
  assert.equal(l.ov.strokes.length, 1); assert.equal(l.ov.sv, 5);
  l = liveReducer(l, { type: 'goto', index: 2, ov: { strokes: [{ c: '#000', a: 1, w: 0.005, p: [[0.2, 0.2]] }], sv: 9 } });
  assert.equal(l.ov.pointer, null); assert.equal(l.ov.zoom, null); assert.equal(l.ov.strokes[0].c, '#000'); assert.equal(l.ov.sv, 9);
  l = liveReducer(l, { type: 'next' }); assert.equal(l.index, 2); // ya es la última página
  l = liveReducer(liveReducer(l, { type: 'prev' }), { type: 'overlay', patch: { zoom: { x: 0, y: 0, w: 1, h: 1 } } });
  l = liveReducer(l, { type: 'prev' }); assert.equal(l.ov.zoom, null); assert.deepEqual(l.ov.strokes, []);
  assert.deepEqual(liveReducer(l, { type: 'close' }).ov, emptyOv());
  // lupa: una región de la mitad de una página 16:9 en un lienzo 1920×1080 se ve al doble
  assert.equal(zoomTransform(null, 16 / 9, 1920, 1080), '');
  assert.match(zoomTransform({ x: 0, y: 0, w: 0.5, h: 0.5 }, 16 / 9, 1920, 1080), /scale\(2\.0000\)/);
  assert.deepEqual(fitRect(1, 1920, 1080), { left: 420, top: 0, width: 1080, height: 1080 });
  // cronómetro: color según el tiempo que falta
  assert.equal(timerColor(600), 'rgb(234,238,246)'); assert.equal(timerColor(0), 'rgb(255,194,71)'); assert.equal(timerColor(-300), 'rgb(255,77,94)'); assert.equal(timerColor(-1000), 'rgb(255,77,94)');
  assert.equal(mmss(65.9), '01:05'); assert.equal(mmss(3725), '1:02:05'); assert.equal(mmss(-3), '00:00');
});
