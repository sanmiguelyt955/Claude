const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/core.js');

test('timing: 120 BPM sixteenth step lasts 125 ms', () => {
  const sec = C.secondsPerTick(120) * C.TICKS_PER_STEP;
  assert.ok(Math.abs(sec - 0.125) < 1e-9);
});

test('formatPosition: bar.beat.sixteenth', () => {
  assert.equal(C.formatPosition(0), '1.1.1');
  assert.equal(C.formatPosition(C.TICKS_PER_BAR * 2 + C.PPQ), '3.2.1');
  assert.equal(C.formatPosition(C.PPQ + C.TICKS_PER_STEP * 3), '1.2.4');
});

test('midi helpers', () => {
  assert.equal(C.midiName(60), 'C4');
  assert.equal(C.midiName(69), 'A4');
  assert.ok(Math.abs(C.midiToFreq(69) - 440) < 1e-9);
});

test('new project has master + 8 inserts, a pattern and channels', () => {
  const p = C.createProject('Test');
  assert.equal(p.mixer.length, C.MIXER_INSERTS + 1);
  assert.equal(p.patterns.length, 1);
  assert.ok(p.channels.length >= 2);
  assert.equal(p.selectedPatternId, p.patterns[0].id);
});

test('pattern and song event timing', () => {
  const p = C.createProject('Test');
  const ch = p.channels[0];
  const pat = p.patterns[0];
  pat.notes.push(C.createNote(ch.id, 36, C.TICKS_PER_STEP * 4, C.TICKS_PER_STEP, 1));
  assert.equal(C.patternTicks(pat), 4 * C.TICKS_PER_BAR);
  assert.equal(C.songLengthTicks(p), 0);

  p.playlist.push({ id: 'x', pattern: pat.id, bar: 2 });
  assert.equal(C.songLengthTicks(p), (2 + 4) * C.TICKS_PER_BAR);
  const ev = C.songEvents(p);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].tick, 2 * C.TICKS_PER_BAR + C.TICKS_PER_STEP * 4);
});

test('metronome emits one click per beat', () => {
  const ev = C.metronomeEvents(2 * C.TICKS_PER_BAR);
  assert.equal(ev.length, 8);
  assert.equal(ev.filter((e) => e.accent).length, 2);
});

test('WAV encoder writes a valid 16-bit stereo header and clamps samples', () => {
  const l = new Float32Array([0, 2, -2, 0.5]);
  const r = new Float32Array([0, 0, 0, 0]);
  const buf = C.encodeWav([l, r], 44100);
  const v = new DataView(buf);
  const str = (o, n) => String.fromCharCode(...new Uint8Array(buf, o, n));
  assert.equal(str(0, 4), 'RIFF');
  assert.equal(str(8, 4), 'WAVE');
  assert.equal(v.getUint16(22, true), 2, 'channels');
  assert.equal(v.getUint32(24, true), 44100, 'sample rate');
  assert.equal(v.getUint16(34, true), 16, 'bits per sample');
  assert.equal(v.getUint32(40, true), 4 * 2 * 2, 'data size');
  assert.equal(v.getInt16(44, true), 0);
  assert.equal(v.getInt16(44 + 4, true), 0x7fff, 'clamped to +1');
  assert.equal(v.getInt16(44 + 8, true), -0x8000, 'clamped to -1');
});

test('MIDI encoder writes an SMF type 1 header with the right track count', () => {
  const p = C.createProject('Test');
  const pat = p.patterns[0];
  const drum = p.channels.find((c) => c.type === 'drum');
  pat.notes.push(C.createNote(drum.id, drum.baseNote, 0, C.TICKS_PER_STEP, 0.9));
  const bytes = C.encodeMidi(p, C.patternEvents(p, pat, 0));
  const s = String.fromCharCode(...bytes.slice(0, 4));
  assert.equal(s, 'MThd');
  const view = new DataView(bytes.buffer, bytes.byteOffset);
  assert.equal(view.getUint16(8), 1, 'format 1');
  assert.equal(view.getUint16(10), 2, 'tempo track + one drum track');
  assert.equal(view.getUint16(12), C.PPQ, 'division');
});

test('project round-trips through JSON and fills missing fields', () => {
  const p = C.createProject('Round');
  const parsed = C.parseProject(C.serializeProject(p));
  assert.equal(parsed.name, 'Round');
  assert.equal(parsed.mixer.length, C.MIXER_INSERTS + 1);
  const partial = JSON.parse(C.serializeProject(p));
  partial.mixer = [{ id: 0, volume: 0.5 }];
  partial.channels.find((c) => c.type === 'synth').synth = { wave1: 'square' };
  const fixed = C.parseProject(JSON.stringify(partial));
  assert.equal(fixed.mixer.length, C.MIXER_INSERTS + 1);
  assert.equal(fixed.mixer[0].volume, 0.5);
  assert.equal(fixed.mixer[0].eq.low, 0);
  const syn = fixed.channels.find((c) => c.type === 'synth');
  assert.equal(syn.synth.wave1, 'square');
  assert.equal(syn.synth.wave2, C.SYNTH_DEFAULTS.wave2);
});

test('parseProject rejects files that are not projects', () => {
  assert.throws(() => C.parseProject('{"hello":1}'), /no es un proyecto/);
  assert.throws(() => C.parseProject('not json'));
});
