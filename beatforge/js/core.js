/*
 * BeatForge core: project model, timing and file encoders.
 * Pure functions only (no DOM, no Web Audio), so the same code runs in the
 * browser and in node tests.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BeatForgeCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const PPQ = 96;                          // ticks per quarter note
  const BEATS_PER_BAR = 4;
  const TICKS_PER_BAR = PPQ * BEATS_PER_BAR;
  const STEPS_PER_BAR = 16;                // sixteenth notes
  const TICKS_PER_STEP = TICKS_PER_BAR / STEPS_PER_BAR;
  const MAX_BARS = 64;
  const MIXER_INSERTS = 8;                 // inserts 1..8; insert 0 is the master
  const MIDI_MIN = 36;                     // C2
  const MIDI_MAX = 96;                     // C7

  const DRUMS = {
    kick: { name: 'Bombo', note: 36 },
    rim: { name: 'Rim', note: 37 },
    snare: { name: 'Caja', note: 38 },
    clap: { name: 'Palmas', note: 39 },
    hat: { name: 'Hi-hat cerrado', note: 42 },
    openhat: { name: 'Hi-hat abierto', note: 46 },
    tom: { name: 'Tom', note: 45 },
    crash: { name: 'Crash', note: 49 }
  };
  const COLORS = ['#ff7a59', '#ffb400', '#7bd389', '#4cc9f0', '#b388ff', '#f72585', '#00bba7', '#f4a261'];
  const WAVES = ['sine', 'triangle', 'sawtooth', 'square'];
  const FILTER_TYPES = ['lowpass', 'highpass', 'bandpass'];
  const SYNTH_DEFAULTS = {
    wave1: 'sawtooth', wave2: 'square', osc2Level: 0.4, detune: 8, octave: 0,
    filterType: 'lowpass', cutoff: 2400, resonance: 2, filterEnv: 0.35,
    attack: 0.01, decay: 0.25, sustain: 0.6, release: 0.3
  };
  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  let seq = 0;
  function newId(prefix = 'id') {
    seq += 1;
    return `${prefix}${Date.now().toString(36)}${seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function midiName(m) { return NOTE_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1); }
  function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function secondsPerTick(bpm) { return 60 / (bpm * PPQ); }

  function formatPosition(tick) {
    const t = Math.max(0, Math.floor(tick));
    const bar = Math.floor(t / TICKS_PER_BAR) + 1;
    const beat = Math.floor((t % TICKS_PER_BAR) / PPQ) + 1;
    const sub = Math.floor((t % PPQ) / TICKS_PER_STEP) + 1;
    return `${bar}.${beat}.${sub}`;
  }

  function createInsert(id) {
    return {
      id,
      name: id === 0 ? 'Master' : `Insert ${id}`,
      volume: id === 0 ? 0.9 : 1,
      pan: 0,
      mute: false,
      eq: { low: 0, mid: 0, high: 0 },          // dB
      drive: 0,                                 // 0..1
      comp: 0,                                  // 0..1
      delay: { mix: 0, time: 0.3, feedback: 0.35 },
      reverb: { mix: 0, decay: 2.5 }
    };
  }

  function mergeInsert(stored, id) {
    const base = createInsert(id);
    const s = stored || {};
    return {
      ...base, ...s, id,
      eq: { ...base.eq, ...(s.eq || {}) },
      delay: { ...base.delay, ...(s.delay || {}) },
      reverb: { ...base.reverb, ...(s.reverb || {}) }
    };
  }

  function createPattern(name, bars) {
    return { id: newId('pat'), name, bars: clamp(Math.round(bars) || 1, 1, MAX_BARS), notes: [] };
  }

  function createNote(channelId, midi, start, dur, vel) {
    return { id: newId('n'), ch: channelId, midi, start, dur, vel: vel == null ? 0.8 : vel };
  }

  function defaultChannelName(type, drum) {
    if (type === 'drum') return DRUMS[drum].name;
    return type === 'synth' ? 'Sintetizador' : 'Sample';
  }

  function addChannel(project, type, opts = {}) {
    const drum = type === 'drum' ? (DRUMS[opts.drum] ? opts.drum : 'kick') : null;
    const ch = {
      id: newId('ch'),
      type,                                       // 'synth' | 'drum' | 'sample'
      name: opts.name || defaultChannelName(type, drum),
      color: COLORS[project.channels.length % COLORS.length],
      volume: 0.8,
      pan: 0,
      mute: false,
      solo: false,
      insert: 1,
      baseNote: type === 'drum' ? DRUMS[drum].note : 60,
      drum,
      synth: type === 'synth' ? { ...SYNTH_DEFAULTS } : null,
      sample: type === 'sample' ? { name: null, root: 60 } : null
    };
    project.channels.push(ch);
    project.selectedChannelId = ch.id;
    return ch;
  }

  function createProject(name) {
    const project = {
      version: 1,
      name: name || 'Sin título',
      bpm: 128,
      channels: [],
      mixer: [],
      patterns: [],
      playlist: [],
      selectedPatternId: null,
      selectedChannelId: null
    };
    for (let i = 0; i <= MIXER_INSERTS; i++) project.mixer.push(createInsert(i));
    const pattern = createPattern('Patrón 1', 4);
    project.patterns.push(pattern);
    project.selectedPatternId = pattern.id;
    addChannel(project, 'drum', { drum: 'kick' });
    addChannel(project, 'drum', { drum: 'snare' });
    addChannel(project, 'synth', { name: 'Bajo' });
    project.selectedChannelId = project.channels[0].id;
    return project;
  }

  function patternTicks(pattern) { return pattern.bars * TICKS_PER_BAR; }

  function sortEvents(events) { return events.sort((a, b) => a.tick - b.tick); }

  function patternEvents(project, pattern, offset = 0) {
    return pattern.notes.map((n) => ({ tick: offset + n.start, ch: n.ch, midi: n.midi, dur: n.dur, vel: n.vel }));
  }

  function songLengthTicks(project) {
    let max = 0;
    for (const item of project.playlist) {
      const pattern = project.patterns.find((p) => p.id === item.pattern);
      if (pattern) max = Math.max(max, item.bar * TICKS_PER_BAR + patternTicks(pattern));
    }
    return max;
  }

  function songEvents(project) {
    const events = [];
    for (const item of project.playlist) {
      const pattern = project.patterns.find((p) => p.id === item.pattern);
      if (pattern) events.push(...patternEvents(project, pattern, item.bar * TICKS_PER_BAR));
    }
    return sortEvents(events);
  }

  function metronomeEvents(lengthTicks) {
    const out = [];
    for (let t = 0; t < lengthTicks; t += PPQ) out.push({ tick: t, click: true, accent: t % TICKS_PER_BAR === 0 });
    return out;
  }

  // channels: array of Float32Array (one per channel), returns a 16-bit PCM WAV.
  function encodeWav(channels, sampleRate) {
    const numCh = channels.length;
    const len = channels[0].length;
    const blockAlign = numCh * 2;
    const dataSize = len * blockAlign;
    const buf = new ArrayBuffer(44 + dataSize);
    const v = new DataView(buf);
    const str = (off, s) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); v.setUint32(4, 36 + dataSize, true); str(8, 'WAVE');
    str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, numCh, true);
    v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * blockAlign, true);
    v.setUint16(32, blockAlign, true); v.setUint16(34, 16, true);
    str(36, 'data'); v.setUint32(40, dataSize, true);
    let off = 44;
    for (let i = 0; i < len; i++) {
      for (let c = 0; c < numCh; c++) {
        const s = clamp(channels[c][i], -1, 1);
        v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        off += 2;
      }
    }
    return buf;
  }

  // Standard MIDI File, type 1: one tempo track plus one track per channel that has notes.
  function encodeMidi(project, events) {
    const ascii = (s) => Array.from(s, (c) => c.charCodeAt(0) & 0x7f);
    const u16 = (n) => [(n >> 8) & 0xff, n & 0xff];
    const u32 = (n) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
    const vlq = (n) => {
      const out = [n & 0x7f];
      n = Math.floor(n / 128);
      while (n > 0) { out.unshift((n & 0x7f) | 0x80); n = Math.floor(n / 128); }
      return out;
    };
    const chunk = (type, body) => [...ascii(type), ...u32(body.length), ...body];
    const track = (items) => {
      items.sort((a, b) => a.tick - b.tick || a.order - b.order);
      const body = [];
      let last = 0;
      for (const it of items) { body.push(...vlq(it.tick - last), ...it.data); last = it.tick; }
      body.push(0, 0xff, 0x2f, 0x00);
      return chunk('MTrk', body);
    };

    const tempo = Math.round(60000000 / project.bpm);
    const tracks = [track([
      { tick: 0, order: 0, data: [0xff, 0x51, 0x03, (tempo >> 16) & 0xff, (tempo >> 8) & 0xff, tempo & 0xff] },
      { tick: 0, order: 0, data: [0xff, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08] }
    ])];

    let melodic = 0;
    const nextMelodic = () => { if (melodic === 9) melodic++; return melodic++ % 16; };
    for (const ch of project.channels) {
      const chEvents = events.filter((e) => e.ch === ch.id);
      if (!chEvents.length) continue;
      const mc = ch.type === 'drum' ? 9 : nextMelodic();
      const items = [{ tick: 0, order: 0, data: [0xff, 0x03, ...vlq(ch.name.length), ...ascii(ch.name)] }];
      for (const e of chEvents) {
        const key = ch.type === 'drum' ? DRUMS[ch.drum].note : e.midi;
        const vel = clamp(Math.round(e.vel * 127), 1, 127);
        items.push({ tick: e.tick, order: 1, data: [0x90 | mc, key, vel] });
        items.push({ tick: e.tick + e.dur, order: 0, data: [0x80 | mc, key, 0] });
      }
      tracks.push(track(items));
    }

    const header = chunk('MThd', [...u16(1), ...u16(tracks.length), ...u16(PPQ)]);
    return Uint8Array.from([...header, ...tracks.flat()]);
  }

  function serializeProject(project) { return JSON.stringify(project, null, 2); }

  function normalizeProject(data) {
    const p = data;
    p.version = 1;
    p.name = String(p.name || 'Sin título');
    p.bpm = clamp(Number(p.bpm) || 128, 20, 300);
    p.mixer = Array.from({ length: MIXER_INSERTS + 1 }, (_, i) => mergeInsert((p.mixer || [])[i], i));
    p.channels = (p.channels || []).map((ch) => {
      const c = { ...ch };
      c.volume = clamp(Number(c.volume) || 0.8, 0, 1.5);
      c.pan = clamp(Number(c.pan) || 0, -1, 1);
      c.insert = clamp(Math.round(c.insert) || 1, 1, MIXER_INSERTS);
      c.baseNote = clamp(Math.round(c.baseNote) || 60, 0, 127);
      if (c.type === 'drum') { if (!DRUMS[c.drum]) c.drum = 'kick'; }
      if (c.type === 'synth') c.synth = { ...SYNTH_DEFAULTS, ...(c.synth || {}) };
      if (c.type === 'sample') c.sample = { name: null, root: 60, ...(c.sample || {}) };
      return c;
    });
    p.patterns = (p.patterns || []).map((pt) => ({
      id: pt.id || newId('pat'),
      name: String(pt.name || 'Patrón'),
      bars: clamp(Math.round(pt.bars) || 1, 1, MAX_BARS),
      notes: Array.isArray(pt.notes) ? pt.notes : []
    }));
    if (!p.patterns.length) p.patterns.push(createPattern('Patrón 1', 4));
    p.playlist = Array.isArray(p.playlist) ? p.playlist : [];
    if (!p.patterns.some((pt) => pt.id === p.selectedPatternId)) p.selectedPatternId = p.patterns[0].id;
    if (!p.channels.some((ch) => ch.id === p.selectedChannelId)) p.selectedChannelId = p.channels[0] ? p.channels[0].id : null;
    return p;
  }

  function parseProject(text) {
    const data = JSON.parse(text);
    if (!data || !Array.isArray(data.channels) || !Array.isArray(data.patterns) || !Array.isArray(data.mixer)) {
      throw new Error('El archivo no es un proyecto de BeatForge.');
    }
    return normalizeProject(data);
  }

  return {
    PPQ, BEATS_PER_BAR, TICKS_PER_BAR, STEPS_PER_BAR, TICKS_PER_STEP, MAX_BARS, MIXER_INSERTS,
    MIDI_MIN, MIDI_MAX, DRUMS, COLORS, WAVES, FILTER_TYPES, SYNTH_DEFAULTS,
    newId, clamp, midiName, midiToFreq, secondsPerTick, formatPosition,
    createInsert, createPattern, createNote, createProject, addChannel,
    patternTicks, patternEvents, songEvents, songLengthTicks, sortEvents, metronomeEvents,
    encodeWav, encodeMidi, serializeProject, parseProject
  };
});
