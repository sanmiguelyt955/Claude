/*
 * BeatForge audio engine (Web Audio).
 * - Mixer: 8 inserts + master, each with EQ, drive, compressor, delay and reverb.
 * - Instruments: subtractive synth, synthesized drum voices, audio sampler.
 * - Scheduler: looks ~150 ms ahead so timing stays steady on the UI thread.
 * - Offline render: the same graph and events are rendered to a WAV blob.
 */
(function (root) {
  'use strict';
  const C = root.BeatForgeCore;

  const LOOKAHEAD = 0.15;          // seconds scheduled ahead
  const SCHEDULER_MS = 25;
  const EXPORT_RATE = 44100;
  const EXPORT_TAIL = 3;           // seconds of reverb/delay tail on export
  const DRUM_TAIL = { kick: 0.45, rim: 0.1, snare: 0.3, clap: 0.35, hat: 0.1, openhat: 0.4, tom: 0.4, crash: 1.6 };

  let ctx = null;
  let graph = null;                // live mixer graph on the realtime context
  let current = null;              // project the engine reads from
  let transport = null;
  let timer = 0;
  const samples = {};              // channel id -> AudioBuffer (not stored in project files)
  const voices = [];               // { vg, end } realtime voices
  const held = new Map();          // live note key -> { v, rec }
  const noiseCache = new WeakMap();
  let keySeq = 0;

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const ramp = (c, param, value) => param.setTargetAtTime(value, c.currentTime, 0.01);
  const killGain = (vg, t) => { vg.gain.cancelScheduledValues(t); vg.gain.setValueAtTime(0, t); };

  function audioContext() {
    if (!ctx) {
      const AC = root.AudioContext || root.webkitAudioContext;
      ctx = new AC({ latencyHint: 'interactive' });
      timer = setInterval(housekeeping, SCHEDULER_MS);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // ---------- helpers: noise, distortion curve, reverb impulse ----------
  function noiseBuffer(c) {
    let buf = noiseCache.get(c);
    if (!buf) {
      buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      noiseCache.set(c, buf);
    }
    return buf;
  }

  function driveCurve(amount) {
    const n = 1024;
    const k = 1 + amount * 40;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = Math.tanh(k * x) / Math.tanh(k);
    }
    return curve;
  }

  function impulse(c, seconds) {
    const len = Math.max(1, Math.floor(c.sampleRate * seconds));
    const buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    return buf;
  }

  // ---------- mixer ----------
  function buildInsert(c, output) {
    const n = {
      input: c.createGain(),
      low: c.createBiquadFilter(), mid: c.createBiquadFilter(), high: c.createBiquadFilter(),
      dryDrive: c.createGain(), shaper: c.createWaveShaper(), wetDrive: c.createGain(), afterDrive: c.createGain(),
      comp: c.createDynamicsCompressor(),
      delay: c.createDelay(2), feedback: c.createGain(), dryDelay: c.createGain(), wetDelay: c.createGain(), afterDelay: c.createGain(),
      convolver: c.createConvolver(), dryVerb: c.createGain(), wetVerb: c.createGain(), afterVerb: c.createGain(),
      fader: c.createGain(), pan: c.createStereoPanner(),
      drive: -1, reverbKey: 2.5
    };
    n.low.type = 'lowshelf'; n.low.frequency.value = 200;
    n.mid.type = 'peaking'; n.mid.frequency.value = 1000; n.mid.Q.value = 0.8;
    n.high.type = 'highshelf'; n.high.frequency.value = 5000;
    n.shaper.oversample = '4x';
    n.comp.attack.value = 0.003; n.comp.release.value = 0.25; n.comp.knee.value = 6;
    n.convolver.buffer = impulse(c, 2.5);
    n.wetDrive.gain.value = 0; n.wetDelay.gain.value = 0; n.wetVerb.gain.value = 0;

    n.input.connect(n.low); n.low.connect(n.mid); n.mid.connect(n.high);
    n.high.connect(n.dryDrive); n.high.connect(n.shaper); n.shaper.connect(n.wetDrive);
    n.dryDrive.connect(n.afterDrive); n.wetDrive.connect(n.afterDrive);
    n.afterDrive.connect(n.comp);
    n.comp.connect(n.dryDelay); n.comp.connect(n.delay);
    n.delay.connect(n.feedback); n.feedback.connect(n.delay); n.delay.connect(n.wetDelay);
    n.dryDelay.connect(n.afterDelay); n.wetDelay.connect(n.afterDelay);
    n.afterDelay.connect(n.dryVerb); n.afterDelay.connect(n.convolver); n.convolver.connect(n.wetVerb);
    n.dryVerb.connect(n.afterVerb); n.wetVerb.connect(n.afterVerb);
    n.afterVerb.connect(n.fader); n.fader.connect(n.pan); n.pan.connect(output);
    return n;
  }

  function applyInsert(c, n, t) {
    ramp(c, n.fader.gain, t.mute ? 0 : t.volume);
    ramp(c, n.pan.pan, clamp(t.pan, -1, 1));
    ramp(c, n.low.gain, t.eq.low);
    ramp(c, n.mid.gain, t.eq.mid);
    ramp(c, n.high.gain, t.eq.high);

    const drive = clamp(t.drive, 0, 1);
    if (drive !== n.drive) { n.shaper.curve = driveCurve(drive); n.drive = drive; }
    ramp(c, n.dryDrive.gain, 1 - drive * 0.5);
    ramp(c, n.wetDrive.gain, drive * 0.8);

    const comp = clamp(t.comp, 0, 1);            // 0 = threshold at 0 dB, so no compression
    n.comp.threshold.value = comp ? -(comp * 48) : 0;
    n.comp.ratio.value = 1 + comp * 9;

    const dmix = clamp(t.delay.mix, 0, 1);
    n.delay.delayTime.value = clamp(t.delay.time, 0.01, 1.9);
    ramp(c, n.feedback.gain, clamp(t.delay.feedback, 0, 0.9));
    ramp(c, n.wetDelay.gain, dmix);
    ramp(c, n.dryDelay.gain, 1 - dmix * 0.5);

    const rmix = clamp(t.reverb.mix, 0, 1);
    const decay = clamp(Math.round(t.reverb.decay * 10) / 10, 0.2, 8);
    if (decay !== n.reverbKey) { n.convolver.buffer = impulse(c, decay); n.reverbKey = decay; }
    ramp(c, n.wetVerb.gain, rmix);
    ramp(c, n.dryVerb.gain, 1 - rmix * 0.5);
  }

  function buildBus(c) {
    const input = c.createGain();
    const pan = c.createStereoPanner();
    input.connect(pan);
    return { input, pan, route: null };
  }

  function syncGraph(g, project) {
    const c = g.ctx;
    project.mixer.forEach((track, i) => applyInsert(c, g.inserts[i], track));

    const alive = new Set(project.channels.map((ch) => ch.id));
    for (const id of Object.keys(g.buses)) {
      if (alive.has(id)) continue;
      g.buses[id].pan.disconnect();
      g.buses[id].input.disconnect();
      delete g.buses[id];
    }

    const anySolo = project.channels.some((ch) => ch.solo);
    for (const ch of project.channels) {
      let bus = g.buses[ch.id];
      if (!bus) { bus = buildBus(c); g.buses[ch.id] = bus; }
      const target = g.inserts[clamp(ch.insert, 1, g.inserts.length - 1)].input;
      if (bus.route !== target) { bus.pan.disconnect(); bus.pan.connect(target); bus.route = target; }
      const audible = !ch.mute && (!anySolo || ch.solo);
      ramp(c, bus.input.gain, audible ? ch.volume : 0);
      ramp(c, bus.pan.pan, clamp(ch.pan, -1, 1));
    }
  }

  function createGraph(c, project) {
    const g = { ctx: c, inserts: [], buses: {}, buf: null };
    g.analyser = c.createAnalyser();
    g.analyser.fftSize = 1024;
    g.limiter = c.createDynamicsCompressor();
    g.limiter.threshold.value = -1; g.limiter.knee.value = 0; g.limiter.ratio.value = 20;
    g.limiter.attack.value = 0.001; g.limiter.release.value = 0.1;
    g.limiter.connect(g.analyser);
    g.analyser.connect(c.destination);
    project.mixer.forEach((_, i) => { g.inserts[i] = buildInsert(c, i === 0 ? g.limiter : g.inserts[0].input); });
    syncGraph(g, project);
    return g;
  }

  function ensureGraph() {
    const c = audioContext();
    if (!graph) graph = createGraph(c, current);
    syncGraph(graph, current);
    return graph;
  }

  // ---------- voices ----------
  function voiceSynth(c, dest, p, midi, when, vel) {
    const vg = c.createGain();
    vg.gain.value = 1;
    vg.connect(dest);

    const amp = c.createGain();
    amp.gain.value = 0.0001;
    const filt = c.createBiquadFilter();
    filt.type = p.filterType;
    filt.Q.value = p.resonance;

    const peak = Math.max(0.0002, 0.5 * vel);
    const a = Math.max(0.001, p.attack);
    const d = Math.max(0.005, p.decay);
    const s = clamp(p.sustain, 0, 1);
    const r = Math.max(0.005, p.release);
    amp.gain.setValueAtTime(0.0001, when);
    amp.gain.linearRampToValueAtTime(peak, when + a);
    amp.gain.setTargetAtTime(peak * s, when + a, d / 4);

    const base = clamp(p.cutoff, 20, 18000);
    const env = p.filterEnv * 6000;
    filt.frequency.setValueAtTime(base, when);
    filt.frequency.linearRampToValueAtTime(clamp(base + env, 20, 18000), when + a);
    filt.frequency.setTargetAtTime(clamp(base + env * s, 20, 18000), when + a, d / 4);

    const f = C.midiToFreq(midi + (p.octave || 0) * 12);
    const o1 = c.createOscillator(); o1.type = p.wave1; o1.frequency.value = f; o1.detune.value = -p.detune / 2;
    const o2 = c.createOscillator(); o2.type = p.wave2; o2.frequency.value = f; o2.detune.value = p.detune / 2;
    const l2 = c.createGain(); l2.gain.value = clamp(p.osc2Level, 0, 1);
    o1.connect(filt); o2.connect(l2); l2.connect(filt);
    filt.connect(amp); amp.connect(vg);
    o1.start(when); o2.start(when);

    return {
      vg,
      tail: r * 1.5 + 0.1,
      release(t) {
        amp.gain.cancelScheduledValues(t);
        amp.gain.setTargetAtTime(0.0001, t, r / 4);
        o1.stop(t + r * 1.5);
        o2.stop(t + r * 1.5);
      }
    };
  }

  function voiceDrum(c, dest, kind, when, vel) {
    const vg = c.createGain();
    vg.gain.value = 1;
    vg.connect(dest);
    const lvl = (x) => Math.max(0.0002, x);

    const tone = (type, f0, f1, pitchTime, dur, level) => {
      const o = c.createOscillator(); const g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, when);
      o.frequency.exponentialRampToValueAtTime(f1, when + pitchTime);
      g.gain.setValueAtTime(lvl(level), when);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      o.connect(g); g.connect(vg);
      o.start(when); o.stop(when + dur + 0.05);
    };
    const noise = (type, freq, q, dur, level, offset = 0) => {
      const src = c.createBufferSource(); src.buffer = noiseBuffer(c);
      const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = c.createGain();
      g.gain.setValueAtTime(lvl(level), when + offset);
      g.gain.exponentialRampToValueAtTime(0.0001, when + offset + dur);
      src.connect(f); f.connect(g); g.connect(vg);
      src.start(when + offset, Math.random() * 1.5);
      src.stop(when + offset + dur + 0.05);
    };

    switch (kind) {
      case 'kick': tone('sine', 150, 42, 0.12, 0.42, vel); break;
      case 'rim': tone('square', 1700, 1500, 0.01, 0.03, 0.25 * vel); noise('bandpass', 3000, 2, 0.02, 0.2 * vel); break;
      case 'snare': tone('triangle', 220, 160, 0.05, 0.14, 0.5 * vel); noise('bandpass', 2000, 0.8, 0.2, 0.8 * vel); break;
      case 'clap':
        noise('bandpass', 1400, 1.2, 0.02, 0.7 * vel, 0);
        noise('bandpass', 1400, 1.2, 0.02, 0.7 * vel, 0.012);
        noise('bandpass', 1400, 1.2, 0.02, 0.7 * vel, 0.024);
        noise('bandpass', 1400, 0.9, 0.18, 0.5 * vel, 0.035);
        break;
      case 'hat': noise('highpass', 8000, 0.7, 0.05, 0.35 * vel); break;
      case 'openhat': noise('highpass', 7000, 0.7, 0.35, 0.3 * vel); break;
      case 'tom': tone('sine', 190, 90, 0.25, 0.4, 0.8 * vel); break;
      case 'crash': noise('highpass', 3500, 0.5, 1.5, 0.35 * vel); break;
      default: break;
    }
    return { vg, tail: DRUM_TAIL[kind] || 0.3 };
  }

  function voiceSample(c, dest, buffer, root, midi, when, vel) {
    const vg = c.createGain();
    vg.gain.value = 1;
    vg.connect(dest);
    const src = c.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = Math.pow(2, (midi - root) / 12);
    const g = c.createGain();
    g.gain.value = clamp(vel, 0, 1);
    src.connect(g); g.connect(vg);
    src.start(when);
    return {
      vg,
      tail: 0.3,
      release(t) {
        g.gain.cancelScheduledValues(t);
        g.gain.setTargetAtTime(0.0001, t, 0.02);
        src.stop(t + 0.3);
      }
    };
  }

  function voiceClick(c, dest, when, accent) {
    const g = c.createGain();
    g.gain.value = 0.0001;
    g.gain.setValueAtTime(accent ? 0.5 : 0.3, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.04);
    const o = c.createOscillator();
    o.frequency.value = accent ? 1600 : 1000;
    o.connect(g); g.connect(dest);
    o.start(when); o.stop(when + 0.05);
    return { vg: g, tail: 0.05 };
  }

  function triggerEvent(c, g, project, ev, when) {
    if (ev.click) return voiceClick(c, g.inserts[0].input, when, ev.accent);
    const ch = project.channels.find((x) => x.id === ev.ch);
    const bus = ch && g.buses[ch.id];
    if (!ch || !bus) return null;
    const vel = clamp(ev.vel == null ? 0.8 : ev.vel, 0, 1);
    if (ch.type === 'drum') return voiceDrum(c, bus.input, ch.drum, when, vel);
    if (ch.type === 'sample') {
      const buf = samples[ch.id];
      return buf ? voiceSample(c, bus.input, buf, ch.sample.root, ev.midi, when, vel) : null;
    }
    return voiceSynth(c, bus.input, ch.synth, ev.midi, when, vel);
  }

  // ---------- transport ----------
  function patternById(project, id) {
    return project.patterns.find((p) => p.id === id) || project.patterns[0];
  }

  function loopFor(project, opts) {
    if (opts.mode === 'song') return C.songLengthTicks(project);
    const pt = patternById(project, opts.patternId);
    return pt ? C.patternTicks(pt) : 0;
  }

  function eventsFor(project, opts, loop) {
    let events = opts.mode === 'song'
      ? C.songEvents(project)
      : C.patternEvents(project, patternById(project, opts.patternId), 0);
    events = events.filter((e) => e.tick < loop);
    if (opts.metronome) events = events.concat(C.metronomeEvents(loop));
    return C.sortEvents(events);
  }

  function schedule(ev, t, spt) {
    const v = triggerEvent(ctx, graph, current, ev, t);
    if (!v) return;
    if (ev.dur != null && v.release) v.release(t + ev.dur * spt);
    voices.push({ vg: v.vg, end: t + (ev.dur || 0) * spt + v.tail });
  }

  // Keeps the audio timeline ahead of the playhead. The cursor (abs, at) maps
  // ticks to audio time; each event is placed relative to the previous one, so
  // a tempo change only affects events scheduled after it.
  function pump() {
    const tr = transport;
    if (!tr || !ctx || !current) return;
    const now = ctx.currentTime;
    const horizon = now + LOOKAHEAD;
    const spt = C.secondsPerTick(current.bpm);

    for (let guard = 0; guard < 10000; guard++) {
      if (tr.done || tr.at > horizon) break;
      if (tr.idx >= tr.list.length) {
        const boundary = tr.cycleStart + tr.loop;
        tr.at += (boundary - tr.abs) * spt;
        tr.abs = boundary;
        if (!tr.opts.loop) { tr.done = true; break; }
        const loop = loopFor(current, tr.opts);
        if (loop <= 0) { tr.done = true; break; }
        tr.cycleStart = boundary;
        tr.loop = loop;
        tr.list = eventsFor(current, tr.opts, loop);
        tr.idx = 0;
        continue;
      }
      const ev = tr.list[tr.idx];
      const abs = tr.cycleStart + ev.tick;
      const t = tr.at + (abs - tr.abs) * spt;
      if (t > horizon) break;
      if (t >= now) schedule(ev, t, spt);
      tr.abs = abs;
      tr.at = t;
      tr.idx++;
    }
  }

  function housekeeping() {
    if (!ctx) return;
    pump();
    const now = ctx.currentTime;
    for (let i = voices.length - 1; i >= 0; i--) {
      if (voices[i].end < now) { voices[i].vg.disconnect(); voices.splice(i, 1); }
    }
  }

  function stop() {
    if (ctx) {
      const now = ctx.currentTime;
      for (const v of voices) { killGain(v.vg, now); v.vg.disconnect(); }
    }
    voices.length = 0;
    held.clear();
    transport = null;
  }

  function play(project, opts = {}) {
    stop();
    current = project;
    const c = audioContext();
    ensureGraph();
    const o = {
      mode: opts.mode === 'song' ? 'song' : 'pattern',
      patternId: opts.patternId,
      metronome: !!opts.metronome,
      loop: opts.loop !== false
    };
    const loop = loopFor(project, o);
    if (loop <= 0) return false;
    transport = {
      opts: o, abs: 0, at: c.currentTime + 0.05, cycleStart: 0, loop,
      list: eventsFor(project, o, loop), idx: 0, done: false
    };
    pump();
    return true;
  }

  function isPlaying() {
    return !!transport && !(transport.done && ctx && ctx.currentTime > transport.at);
  }

  function position() {
    if (!transport || !ctx) return 0;
    const spt = C.secondsPerTick(current.bpm);
    const tick = transport.abs + (ctx.currentTime - transport.at) / spt;
    const loop = transport.loop || 1;
    return ((tick - transport.cycleStart) % loop + loop) % loop;
  }

  function loopTicks() { return transport ? transport.loop : 0; }

  // ---------- live notes (keyboard, MIDI, audition) ----------
  function noteOn(channelId, midi, vel = 0.8) {
    if (!current) return null;
    const c = audioContext();
    const g = ensureGraph();
    const v = triggerEvent(c, g, current, { ch: channelId, midi, vel }, c.currentTime + 0.005);
    if (!v) return null;
    const rec = { vg: v.vg, end: v.release ? Infinity : c.currentTime + v.tail };
    voices.push(rec);
    const key = `k${++keySeq}`;
    held.set(key, { v, rec });
    return key;
  }

  function noteOff(key) {
    const h = held.get(key);
    if (!h || !ctx) return;
    held.delete(key);
    const t = ctx.currentTime;
    if (h.v.release) {
      h.v.release(t);
      h.rec.end = t + h.v.tail;
    }
  }

  // ---------- samples ----------
  async function loadSample(channelId, arrayBuffer) {
    const c = audioContext();
    const buf = await c.decodeAudioData(arrayBuffer);
    samples[channelId] = buf;
    return buf.duration;
  }

  function forgetSample(channelId) { delete samples[channelId]; }
  function hasSample(channelId) { return !!samples[channelId]; }

  // ---------- meter ----------
  function peak() {
    if (!graph) return 0;
    if (!graph.buf) graph.buf = new Float32Array(graph.analyser.fftSize);
    graph.analyser.getFloatTimeDomainData(graph.buf);
    let m = 0;
    for (let i = 0; i < graph.buf.length; i++) m = Math.max(m, Math.abs(graph.buf[i]));
    return m;
  }

  // ---------- offline render ----------
  async function renderWav(project, opts = {}) {
    const o = { mode: opts.mode === 'song' ? 'song' : 'pattern', patternId: opts.patternId, metronome: false, loop: false };
    const loop = loopFor(project, o);
    if (loop <= 0) throw new Error('Nada que exportar: añade notas o items a la playlist.');
    const spt = C.secondsPerTick(project.bpm);
    const Offline = root.OfflineAudioContext || root.webkitOfflineAudioContext;
    const off = new Offline(2, Math.ceil((loop * spt + EXPORT_TAIL) * EXPORT_RATE), EXPORT_RATE);
    const g = createGraph(off, project);
    for (const ev of eventsFor(project, o, loop)) {
      const t = ev.tick * spt;
      const v = triggerEvent(off, g, project, ev, t);
      if (v && v.release && ev.dur != null) v.release(t + ev.dur * spt);
    }
    const buf = await off.startRendering();
    const wav = C.encodeWav([buf.getChannelData(0), buf.getChannelData(1)], buf.sampleRate);
    return new Blob([wav], { type: 'audio/wav' });
  }

  root.BeatForgeEngine = {
    audioContext,
    sync(project) {
      current = project;
      if (graph) syncGraph(graph, project);
    },
    play, stop, isPlaying, position, loopTicks,
    noteOn, noteOff,
    loadSample, hasSample, forgetSample,
    peak, renderWav
  };
})(typeof window !== 'undefined' ? window : globalThis);
