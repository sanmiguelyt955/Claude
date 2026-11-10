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
