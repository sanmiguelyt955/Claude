/*
 * BeatForge UI: state, rendering and input.
 * Structural edits go through mutate() (undoable, full re-render).
 * Continuous edits (sliders, drags) go through live(), which groups them
 * into one undo step when the user pauses.
 */
(function () {
  'use strict';
  const C = window.BeatForgeCore;
  const E = window.BeatForgeEngine;

  const STORAGE_KEY = 'beatforge.project.v1';
  const KEY_W = 56;                 // piano keys column width (px)
  const ROW_H = 12;
  const DRUM_ROW_H = 26;
  const TPS = C.TICKS_PER_STEP;
  const BLACK = [1, 3, 6, 8, 10];
  const KEYMAP = { a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12, o: 13, l: 14, p: 15, ';': 16 };

  const S = {
    project: null,
    past: [], future: [],
    edit: null,                  // open continuous edit: { before, timer }
    saveTimer: 0,
    tab: 'step', mode: 'pattern', metro: false, loop: true,
    snap: 4, zoom: 14, octave: 4, plBars: 32,
    sel: new Set(),              // selected note ids in the piano roll
    held: new Map(),             // input key -> { key, midi, chId, start }
    recording: false,
    stepCols: [], lastStep: -1,
    wasPlaying: false,
    roll: null,
    drag: null,
    paint: null
  };

  // ---------- small helpers ----------
  const $ = (sel) => document.querySelector(sel);
  const curPattern = () => S.project.patterns.find((p) => p.id === S.project.selectedPatternId) || S.project.patterns[0];
  const curChannel = () => S.project.channels.find((c) => c.id === S.project.selectedChannelId) || null;
  const status = (msg) => { $('#status').textContent = msg; };

  function h(tag, attrs, ...kids) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'style') Object.assign(node.style, v);
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else if (k === 'value' || k === 'checked' || k === 'disabled') node[k] = v;
      else node.setAttribute(k, v === true ? '' : String(v));
    }
    for (const kid of kids.flat()) {
      if (kid === null || kid === undefined || kid === false) continue;
      node.append(kid instanceof Node ? kid : String(kid));
    }
    return node;
  }

  const fmt = {
    num: (v) => Number(v).toFixed(2),
    pct: (v) => Math.round(v * 100) + '%',
    db: (v) => (v > 0 ? '+' : '') + Number(v).toFixed(1) + ' dB',
    sec: (v) => (v < 1 ? Math.round(v * 1000) + ' ms' : Number(v).toFixed(2) + ' s'),
    pan: (v) => (Math.abs(v) < 0.01 ? 'Centro' : v < 0 ? Math.round(-v * 100) + '% izq' : Math.round(v * 100) + '% der'),
    cents: (v) => Math.round(v) + ' ct',
    oct: (v) => (v > 0 ? '+' : '') + v,
    hz: (v) => (v >= 1000 ? (v / 1000).toFixed(1) + ' kHz' : Math.round(v) + ' Hz')
  };

  // ---------- edit / history ----------
  function live(fn) {
    if (!S.edit) S.edit = { before: JSON.stringify(S.project), timer: 0 };
    fn();
    clearTimeout(S.edit.timer);
    S.edit.timer = setTimeout(closeEdit, 400);
    E.sync(S.project);
    saveSoon();
  }

  function closeEdit() {
    if (!S.edit) return;
    clearTimeout(S.edit.timer);
    const { before } = S.edit;
    S.edit = null;
    if (JSON.stringify(S.project) !== before) pushPast(before);
  }

  function pushPast(snap) {
    S.past.push(snap);
    if (S.past.length > 200) S.past.shift();
    S.future = [];
  }

  function mutate(fn) {
    closeEdit();
    const before = JSON.stringify(S.project);
    fn();
    if (JSON.stringify(S.project) !== before) pushPast(before);
    const ids = new Set(S.project.patterns.flatMap((p) => p.notes.map((n) => n.id)));
    S.sel = new Set([...S.sel].filter((id) => ids.has(id)));
    E.sync(S.project);
    saveSoon();
    renderAll();
  }

  function undo() {
    closeEdit();
    const prev = S.past.pop();
    if (!prev) return status('Nada que deshacer.');
    S.future.push(JSON.stringify(S.project));
    restore(prev);
  }

  function redo() {
    closeEdit();
    const next = S.future.pop();
    if (!next) return status('Nada que rehacer.');
    S.past.push(JSON.stringify(S.project));
    restore(next);
  }

  function restore(snap) {
    S.project = C.parseProject(snap);
    S.sel.clear();
    E.sync(S.project);
    saveSoon();
    renderAll();
  }

  function saveSoon() {
    clearTimeout(S.saveTimer);
    S.saveTimer = setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, C.serializeProject(S.project)); } catch (e) { /* storage full or disabled */ }
    }, 400);
  }

  function loadInitial() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return C.parseProject(raw);
    } catch (e) { /* ignore broken autosave */ }
    return C.createProject('Mi primer beat');
  }

  // ---------- controls ----------
  function slider(label, value, min, max, step, fmtFn, onInput) {
    const out = h('span', { class: 'val' }, fmtFn(value));
    const input = h('input', {
      type: 'range', min, max, step, value,
      oninput: () => { const v = parseFloat(input.value); out.textContent = fmtFn(v); onInput(v); }
    });
    return h('label', { class: 'slider' }, h('span', { class: 'lbl' }, label), input, out);
  }

  function param(label, obj, key, min, max, step, fmtFn = fmt.num) {
    return slider(label, obj[key], min, max, step, fmtFn, (v) => live(() => { obj[key] = v; }));
  }

  function logParam(label, obj, key, min, max) {
    const ratio = max / min;
    const toPos = (v) => Math.round(Math.log(v / min) / Math.log(ratio) * 1000);
    const toVal = (p) => min * Math.pow(ratio, p / 1000);
    return slider(label, toPos(obj[key]), 0, 1000, 1, (p) => fmt.hz(toVal(p)), (p) => live(() => { obj[key] = toVal(p); }));
  }

  function field(label, control) {
    return h('div', { class: 'field' }, h('span', { class: 'lbl' }, label), control);
  }

  function select(options, value, onChange) {
    const el = h('select', { onchange: (e) => onChange(e.target.value) },
      ...options.map((o) => (typeof o === 'string' ? h('option', { value: o }, o) : h('option', { value: o.value }, o.label))));
    el.value = String(value);
    return el;
  }

  function noteSelect(value, onChange) {
    const opts = [];
    for (let m = C.MIDI_MIN; m <= C.MIDI_MAX; m++) opts.push({ value: m, label: C.midiName(m) });
    return select(opts, value, (v) => onChange(parseInt(v, 10)));
  }

  // ---------- rendering ----------
  function renderAll() {
    renderTop();
    renderChannels();
    renderPatterns();
    renderView();
    renderMixer();
  }

  function renderTop() {
    const p = S.project;
    if (document.activeElement !== $('#projectName')) $('#projectName').value = p.name;
    if (document.activeElement !== $('#bpm')) $('#bpm').value = p.bpm;
    document.querySelectorAll('#modeSeg button').forEach((b) => b.classList.toggle('on', b.dataset.mode === S.mode));
    $('#metro').checked = S.metro;
    $('#loopOn').checked = S.loop;
    $('#btnRec').classList.toggle('on', S.recording);
    $('#btnUndo').disabled = S.past.length === 0;
    $('#btnRedo').disabled = S.future.length === 0;
  }

  function renderChannels() {
    const box = $('#channels');
    box.replaceChildren();
    const p = S.project;
    for (const ch of p.channels) {
      const sel = ch.id === p.selectedChannelId;
      const insert = select(p.mixer.slice(1).map((t) => ({ value: t.id, label: t.name })), ch.insert,
        (v) => mutate(() => { ch.insert = parseInt(v, 10); }));
      const typeLabel = ch.type === 'drum' ? 'Batería' : ch.type === 'sample' ? 'Sample' : 'Synth';
      box.append(h('div', {
        class: 'chrow' + (sel ? ' sel' : ''),
        onclick: (e) => { if (!e.target.closest('button,input,select')) selectChannel(ch.id); }
      },
        h('span', { class: 'dot', style: { background: ch.color } }),
        h('input', { class: 'name', value: ch.name, title: 'Renombrar', onchange: (e) => mutate(() => { ch.name = e.target.value.trim() || ch.name; }) }),
        h('span', { class: 'type' }, typeLabel),
        h('button', { class: 'mini' + (ch.mute ? ' on' : ''), title: 'Silenciar', onclick: () => mutate(() => { ch.mute = !ch.mute; }) }, 'M'),
        h('button', { class: 'mini' + (ch.solo ? ' on' : ''), title: 'Solo', onclick: () => mutate(() => { ch.solo = !ch.solo; }) }, 'S'),
        slider('', ch.volume, 0, 1.2, 0.01, fmt.pct, (v) => live(() => { ch.volume = v; })),
        insert,
        h('button', { class: 'mini danger', title: 'Eliminar canal', onclick: () => deleteChannel(ch.id) }, '×')
      ));
    }
    if (!p.channels.length) box.append(h('p', { class: 'hint' }, 'Añade un canal con los botones de arriba.'));
  }

  function renderPatterns() {
    const box = $('#patterns');
    box.replaceChildren();
    const p = S.project;
    p.patterns.forEach((pt) => {
      box.append(h('div', {
        class: 'patrow' + (pt.id === p.selectedPatternId ? ' sel' : ''),
        onclick: () => selectPattern(pt.id),
        ondblclick: () => {
          const name = prompt('Nombre del patrón', pt.name);
          if (name) mutate(() => { pt.name = name.trim() || pt.name; });
        }
      }, h('span', { class: 'pname' }, pt.name), h('span', { class: 'pbars' }, pt.bars + ' cmp')));
    });
    const bars = $('#patBars');
    if (document.activeElement !== bars) bars.value = curPattern().bars;
  }

  function renderView() {
    document.querySelectorAll('.view').forEach((v) => { v.hidden = v.dataset.view !== S.tab; });
    document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === S.tab));
    if (S.tab === 'step') renderStep();
    if (S.tab === 'roll') { $('#rollSnap').value = String(S.snap); $('#rollZoom').value = String(S.zoom); drawRoll(); }
    if (S.tab === 'playlist') renderPlaylist();
    if (S.tab === 'instrument') renderInstrument();
  }

  // ---------- channel / pattern actions ----------
  function selectChannel(id) {
    if (S.project.selectedChannelId === id) return;
    S.project.selectedChannelId = id;
    S.sel.clear();
    saveSoon();
    renderAll();
  }

  function selectPattern(id) {
    S.project.selectedPatternId = id;
    S.sel.clear();
    saveSoon();
    renderAll();
  }

  function addChannel(type) {
    mutate(() => {
      const p = S.project;
      if (type === 'drum') {
        const used = new Set(p.channels.filter((c) => c.type === 'drum').map((c) => c.drum));
        const kind = Object.keys(C.DRUMS).find((k) => !used.has(k)) || 'kick';
        C.addChannel(p, 'drum', { drum: kind });
      } else {
        C.addChannel(p, type);
      }
    });
  }

  function deleteChannel(id) {
    const ch = S.project.channels.find((c) => c.id === id);
    if (!ch || !confirm(`¿Eliminar el canal "${ch.name}" y sus notas?`)) return;
    mutate(() => {
      const p = S.project;
      p.channels = p.channels.filter((c) => c.id !== id);
      for (const pt of p.patterns) pt.notes = pt.notes.filter((n) => n.ch !== id);
      if (p.selectedChannelId === id) p.selectedChannelId = p.channels[0] ? p.channels[0].id : null;
    });
    E.forgetSample(id);
  }

  function addPattern() {
    mutate(() => {
      const p = S.project;
      const pt = C.createPattern(`Patrón ${p.patterns.length + 1}`, curPattern().bars);
      p.patterns.push(pt);
      p.selectedPatternId = pt.id;
    });
  }

  function duplicatePattern() {
    mutate(() => {
      const p = S.project;
      const src = curPattern();
      const pt = C.createPattern(`${src.name} copia`, src.bars);
      pt.notes = src.notes.map((n) => ({ ...n, id: C.newId('n') }));
      p.patterns.push(pt);
      p.selectedPatternId = pt.id;
    });
  }

  function deletePattern() {
    const p = S.project;
    if (p.patterns.length <= 1) return status('Debe quedar al menos un patrón.');
    const pt = curPattern();
    if (!confirm(`¿Eliminar el patrón "${pt.name}"?`)) return;
    mutate(() => {
      p.patterns = p.patterns.filter((x) => x.id !== pt.id);
      p.playlist = p.playlist.filter((i) => i.pattern !== pt.id);
      p.selectedPatternId = p.patterns[0].id;
    });
  }

  // ---------- step sequencer ----------
  const hasStep = (pat, ch, s) => pat.notes.some((n) => n.ch === ch.id && n.start === s * TPS);

  function setStep(pat, ch, s, value) {
    const start = s * TPS;
    const idx = pat.notes.findIndex((n) => n.ch === ch.id && n.start === start);
    if (value && idx < 0) pat.notes.push(C.createNote(ch.id, ch.baseNote, start, TPS, 0.9));
    else if (!value && idx >= 0) pat.notes.splice(idx, 1);
  }

  function paintStep(pat, ch, s, value, cell) {
    live(() => setStep(pat, ch, s, value));
    cell.classList.toggle('on', value);
    cell.style.background = value ? ch.color : '';
  }

  function renderStep() {
    const view = $('#view-step');
    view.replaceChildren();
    S.stepCols = [];
    S.lastStep = -1;
    const p = S.project;
    const pat = curPattern();
    const steps = pat.bars * 16;
    const grid = h('div', { class: 'sgrid', style: { gridTemplateColumns: `150px repeat(${steps}, 22px)` } });
    grid.append(h('div', { class: 'sg-corner' }, `${pat.name} · ${pat.bars} comp.`));
    for (let s = 0; s < steps; s++) {
      const label = s % 16 === 0 ? String(s / 16 + 1) : s % 4 === 0 ? String((s / 4) % 4 + 1) : '';
      grid.append(h('div', { class: 'sg-head' + (s % 16 === 0 ? ' bar' : s % 4 === 0 ? ' beat' : '') }, label));
    }
    for (const ch of p.channels) {
      const sel = ch.id === p.selectedChannelId;
      grid.append(h('div', {
        class: 'sg-name' + (sel ? ' sel' : ''),
        style: { boxShadow: `inset 3px 0 0 ${ch.color}` },
        onclick: () => selectChannel(ch.id)
      }, ch.name));
      for (let s = 0; s < steps; s++) {
        const on = hasStep(pat, ch, s);
        const cell = h('div', {
          class: 'sg-cell' + (s % 16 === 0 ? ' bar' : s % 4 === 0 ? ' beat' : '') + (on ? ' on' : ''),
          style: on ? { background: ch.color } : null,
          onmousedown: (e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            closeEdit();
            S.edit = { before: JSON.stringify(S.project), timer: 0 };
            S.paint = !hasStep(pat, ch, s);
            p.selectedChannelId = ch.id;
            paintStep(pat, ch, s, S.paint, cell);
          },
          onmouseenter: () => { if (S.paint !== null) paintStep(pat, ch, s, S.paint, cell); }
        });
        (S.stepCols[s] = S.stepCols[s] || []).push(cell);
        grid.append(cell);
      }
    }
    view.append(h('div', { class: 'sgwrap' }, grid));
  }

  function markStep(step) {
    if (S.lastStep >= 0 && S.stepCols[S.lastStep]) S.stepCols[S.lastStep].forEach((c) => c.classList.remove('hot'));
    if (step >= 0 && S.stepCols[step]) S.stepCols[step].forEach((c) => c.classList.add('hot'));
    S.lastStep = step;
  }

  // ---------- piano roll ----------
  const rollRange = (ch) => (ch && ch.type === 'drum' ? [ch.baseNote, ch.baseNote] : [C.MIDI_MIN, C.MIDI_MAX]);
  const rowHeight = (ch) => (ch && ch.type === 'drum' ? DRUM_ROW_H : ROW_H);
  const findNote = (pat, chId, t, midi) => pat.notes.find((n) => n.ch === chId && n.midi === midi && t >= n.start && t < n.start + n.dur);

  function drawRoll() {
    const r = S.roll;
    if (!r) return;
    const pat = curPattern();
    const ch = curChannel();
    const steps = pat.bars * 16;
    const z = S.zoom;
    const [lo, hi] = rollRange(ch);
    const rh = rowHeight(ch);
    const rows = hi - lo + 1;
    const w = KEY_W + steps * z;
    const hgt = rows * rh;
    const dpr = window.devicePixelRatio || 1;
    const cv = r.canvas;
    cv.style.width = w + 'px';
    cv.style.height = hgt + 'px';
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(hgt * dpr);
    const g = r.ctx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#15171c';
    g.fillRect(0, 0, w, hgt);

    for (let i = 0; i < rows; i++) {
      const midi = hi - i;
      const y = i * rh;
      const black = BLACK.includes(midi % 12);
      g.fillStyle = black ? '#191c23' : '#21262f';
      g.fillRect(KEY_W, y, w - KEY_W, rh);
      g.fillStyle = black ? '#0d0f13' : '#e6e8ee';
      g.fillRect(0, y, KEY_W, rh - 1);
      g.font = '10px system-ui, sans-serif';
      if (ch && ch.type === 'drum') {
        g.fillStyle = '#e6e8ee';
        g.fillText(C.DRUMS[ch.drum].name, 4, y + rh - 7);
      } else if (midi % 12 === 0) {
        g.fillStyle = '#333';
        g.fillText(C.midiName(midi), 4, y + rh - 2);
      }
    }

    for (let s = 0; s <= steps; s++) {
      const x = KEY_W + s * z + 0.5;
      g.strokeStyle = s % 16 === 0 ? '#5a6275' : s % 4 === 0 ? '#3b4252' : '#272c37';
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, hgt); g.stroke();
    }

    const colors = new Map(S.project.channels.map((c) => [c.id, c.color]));
    const drawNote = (n, color, alpha, selected) => {
      if (n.midi < lo || n.midi > hi) return;
      const x = KEY_W + (n.start / TPS) * z;
      const nw = Math.max(4, (n.dur / TPS) * z - 1);
      const y = (hi - n.midi) * rh + 1;
      g.globalAlpha = alpha;
      g.fillStyle = color;
      g.fillRect(x, y, nw, rh - 2);
      g.globalAlpha = 1;
      if (selected) { g.strokeStyle = '#ffffff'; g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, nw - 1, rh - 3); }
    };
    for (const n of pat.notes) if (!ch || n.ch !== ch.id) drawNote(n, colors.get(n.ch) || '#888', 0.22, false);
    if (ch) for (const n of pat.notes) if (n.ch === ch.id) drawNote(n, ch.color, 1, S.sel.has(n.id));

    if (S.mode === 'pattern' && E.isPlaying()) {
      const x = KEY_W + (E.position() / TPS) * z;
      g.fillStyle = 'rgba(255,255,255,0.85)';
      g.fillRect(x, 0, 1.5, hgt);
    }
  }

  function bindRoll() {
    const canvas = $('#rollCanvas');
    S.roll = { canvas, ctx: canvas.getContext('2d') };
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    const local = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const grid = (x, y) => {
      const ch = curChannel();
      const [lo, hi] = rollRange(ch);
      const midi = hi - Math.floor(y / rowHeight(ch));
      return { step: Math.floor((x - KEY_W) / S.zoom), midi, valid: midi >= lo && midi <= hi };
    };

    canvas.addEventListener('pointerdown', (e) => {
      const ch = curChannel();
      if (!ch) return;
      const { x, y } = local(e);
      const g = grid(x, y);
      if (!g.valid) return;
      canvas.setPointerCapture(e.pointerId);

      if (x < KEY_W) {                              // click on the keys: preview
        S.drag = { preview: true, key: E.noteOn(ch.id, g.midi, 0.8) };
        return;
      }

      const pat = curPattern();
      const t = g.step * TPS;
      const hit = findNote(pat, ch.id, t, g.midi);
      if (e.button === 2) {
        if (hit) mutate(() => { pat.notes = pat.notes.filter((n) => n !== hit); });
        return;
      }

      closeEdit();
      S.edit = { before: JSON.stringify(S.project), timer: 0 };
      let mode;
      if (hit) {
        if (e.shiftKey) { if (S.sel.has(hit.id)) S.sel.delete(hit.id); else S.sel.add(hit.id); }
        else if (!S.sel.has(hit.id)) S.sel = new Set([hit.id]);
        if (!S.sel.has(hit.id)) { closeEdit(); drawRoll(); return; }
        const endX = KEY_W + ((hit.start + hit.dur) / TPS) * S.zoom;
        mode = x > endX - 6 ? 'resize' : 'move';
      } else {
        const snap = S.snap;
        const note = C.createNote(ch.id, g.midi, Math.floor(g.step / snap) * snap * TPS, snap * TPS, 0.85);
        live(() => pat.notes.push(note));
        S.sel = new Set([note.id]);
        mode = 'resize';
      }
      const origins = new Map();
      for (const n of pat.notes) if (S.sel.has(n.id)) origins.set(n.id, { start: n.start, midi: n.midi, dur: n.dur });
      const [lo, hi] = rollRange(ch);
      S.drag = { mode, pat, origins, ax: x, ay: y, lo, hi, rh: rowHeight(ch) };
      drawRoll();
    });

    canvas.addEventListener('pointermove', (e) => {
      const d = S.drag;
      if (!d || d.preview) return;
      const { x, y } = local(e);
      const snap = S.snap;
      const dSnap = Math.round(((x - d.ax) / S.zoom) / snap) * snap;
      const dMidi = d.lo === d.hi ? 0 : Math.round((d.ay - y) / d.rh);
      live(() => {
        for (const [id, o] of d.origins) {
          const n = d.pat.notes.find((q) => q.id === id);
          if (!n) continue;
          if (d.mode === 'move') {
            n.start = Math.max(0, o.start + dSnap * TPS);
            n.midi = C.clamp(o.midi + dMidi, d.lo, d.hi);
          } else {
            n.dur = Math.max(snap * TPS, o.dur + dSnap * TPS);
          }
        }
      });
      drawRoll();
    });

    const endDrag = () => {
      const d = S.drag;
      if (!d) return;
      if (d.preview) E.noteOff(d.key);
      S.drag = null;
      closeEdit();
      drawRoll();
    };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

    $('#rollSnap').addEventListener('change', (e) => { S.snap = parseInt(e.target.value, 10); drawRoll(); });
    $('#rollZoom').addEventListener('change', (e) => { S.zoom = parseInt(e.target.value, 10); drawRoll(); });
    $('#rollAll').addEventListener('click', selectAllNotes);
    $('#rollQuant').addEventListener('click', quantizeSelected);
    $('#rollDel').addEventListener('click', deleteSelected);
    $('#rollClear').addEventListener('click', () => {
      const ch = curChannel();
      if (!ch || !confirm(`¿Borrar todas las notas de "${ch.name}" en este patrón?`)) return;
      mutate(() => { const pat = curPattern(); pat.notes = pat.notes.filter((n) => n.ch !== ch.id); });
    });
  }

  function selectAllNotes() {
    const ch = curChannel();
    if (!ch) return;
    S.sel = new Set(curPattern().notes.filter((n) => n.ch === ch.id).map((n) => n.id));
    drawRoll();
  }

  function deleteSelected() {
    if (!S.sel.size) return;
    mutate(() => { const pat = curPattern(); pat.notes = pat.notes.filter((n) => !S.sel.has(n.id)); });
    S.sel.clear();
  }

  function quantizeSelected() {
    const grid = S.snap * TPS;
    mutate(() => {
      for (const n of curPattern().notes) {
        if (S.sel.has(n.id)) n.start = Math.max(0, Math.round(n.start / grid) * grid);
      }
    });
  }

  // ---------- playlist ----------
  function renderPlaylist() {
    const view = $('#view-playlist');
    view.replaceChildren();
    const p = S.project;
    const songBars = Math.ceil(C.songLengthTicks(p) / C.TICKS_PER_BAR);
    const cols = Math.max(S.plBars, songBars + 4);
    const grid = h('div', { class: 'sgrid', style: { gridTemplateColumns: `150px repeat(${cols}, 34px)` } });
    grid.append(h('div', { class: 'sg-corner' }, 'Patrón \\ compás'));
    for (let b = 0; b < cols; b++) grid.append(h('div', { class: 'sg-head' + (b % 4 === 0 ? ' beat' : '') }, String(b + 1)));
    p.patterns.forEach((pt, pi) => {
      const color = C.COLORS[pi % C.COLORS.length];
      grid.append(h('div', {
        class: 'sg-name' + (pt.id === p.selectedPatternId ? ' sel' : ''),
        style: { boxShadow: `inset 3px 0 0 ${color}` },
        onclick: () => selectPattern(pt.id)
      }, pt.name, h('small', {}, ` ${pt.bars}c`)));
      for (let b = 0; b < cols; b++) {
        const block = p.playlist.find((i) => i.pattern === pt.id && b >= i.bar && b < i.bar + pt.bars);
        const start = p.playlist.find((i) => i.pattern === pt.id && i.bar === b);
        grid.append(h('div', {
          class: 'pl-cell' + (block ? ' on' : '') + (start ? ' start' : ''),
          style: block ? { background: color } : null,
          onclick: () => togglePlaylist(pt, b, !!block)
        }, start ? pt.name : ''));
      }
    });
    view.append(
      h('div', { class: 'row' },
        h('button', { onclick: () => { S.plBars += 16; renderPlaylist(); } }, '+16 compases'),
        h('span', { class: 'hint' }, `Duración de la canción: ${songBars} compases. Clic para colocar un patrón; clic en un bloque para quitarlo. El modo Canción reproduce la playlist.`)),
      h('div', { class: 'sgwrap' }, grid)
    );
  }

  function togglePlaylist(pt, bar, isBlock) {
    mutate(() => {
      const p = S.project;
      if (isBlock) p.playlist = p.playlist.filter((i) => !(i.pattern === pt.id && bar >= i.bar && bar < i.bar + pt.bars));
      else p.playlist.push({ id: C.newId('pl'), pattern: pt.id, bar });
    });
  }

  // ---------- instrument panel ----------
  function renderInstrument() {
    const view = $('#view-instrument');
    view.replaceChildren();
    const ch = curChannel();
    if (!ch) { view.append(h('p', { class: 'hint' }, 'Selecciona un canal en el rack.')); return; }

    const body = h('div', { class: 'inst' });
    body.append(h('div', { class: 'inst-head' },
      h('h3', {}, ch.name),
      h('span', { class: 'badge' }, ch.type === 'drum' ? 'Batería' : ch.type === 'sample' ? 'Sample' : 'Sintetizador'),
      h('button', {
        onclick: () => {
          const key = E.noteOn(ch.id, ch.baseNote, 0.9);
          if (key) setTimeout(() => E.noteOff(key), 350);
        }
      }, '▶ Probar sonido')
    ));

    const basic = [];
    if (ch.type !== 'drum') {
      basic.push(field('Nota base', noteSelect(ch.baseNote, (v) => mutate(() => { ch.baseNote = v; }))));
    }
    basic.push(field('Canal de paneo', h('span', { class: 'hint' }, 'El paneo y volumen del canal están en el rack.')));
    body.append(h('div', { class: 'grid2' }, ...basic));

    if (ch.type === 'synth') body.append(synthPanel(ch.synth));
    if (ch.type === 'sample') body.append(samplePanel(ch));
    if (ch.type === 'drum') body.append(drumPanel(ch));
    view.append(body);
  }

  function synthPanel(s) {
    const sel = (label, key, options) => field(label, select(options, s[key], (v) => mutate(() => { s[key] = v; })));
    return h('div', { class: 'grid2 synth' },
      sel('Onda osc 1', 'wave1', C.WAVES),
      sel('Onda osc 2', 'wave2', C.WAVES),
      param('Nivel osc 2', s, 'osc2Level', 0, 1, 0.01, fmt.pct),
      param('Desafinado', s, 'detune', 0, 50, 1, fmt.cents),
      param('Octava', s, 'octave', -2, 2, 1, fmt.oct),
      sel('Tipo de filtro', 'filterType', C.FILTER_TYPES),
      logParam('Corte', s, 'cutoff', 20, 18000),
      param('Resonancia', s, 'resonance', 0.1, 20, 0.1),
      param('Env. del filtro', s, 'filterEnv', 0, 1, 0.01, fmt.pct),
      param('Ataque', s, 'attack', 0.001, 2, 0.001, fmt.sec),
      param('Caída', s, 'decay', 0.005, 2, 0.001, fmt.sec),
      param('Sostén', s, 'sustain', 0, 1, 0.01, fmt.pct),
      param('Liberación', s, 'release', 0.005, 4, 0.001, fmt.sec)
    );
  }

  function samplePanel(ch) {
    const loaded = E.hasSample(ch.id);
    return h('div', { class: 'grid2' },
      field('Archivo', h('div', { class: 'row' },
        h('span', {}, ch.sample.name || 'Ninguno'),
        h('button', { onclick: () => { const f = $('#fileSample'); f.dataset.channel = ch.id; f.click(); } }, 'Cargar audio…'))),
      field('Nota raíz', noteSelect(ch.sample.root, (v) => mutate(() => { ch.sample.root = v; }))),
      h('p', { class: 'hint wide' }, loaded
        ? 'Sample cargado. Los samples no se guardan dentro del proyecto: vuelve a cargarlos al abrir un archivo.'
        : 'Carga un audio (WAV, MP3, OGG) para tocar este canal.')
    );
  }

  function drumPanel(ch) {
    const options = Object.entries(C.DRUMS).map(([k, d]) => ({ value: k, label: d.name }));
    return h('div', { class: 'grid2' },
      field('Sonido de batería', select(options, ch.drum, (v) => mutate(() => {
        const old = ch.drum;
        ch.drum = v;
        ch.baseNote = C.DRUMS[v].note;
        if (ch.name === C.DRUMS[old].name) ch.name = C.DRUMS[v].name;
      }))),
      h('p', { class: 'hint wide' }, 'Cada canal de batería es un solo sonido, como en un step sequencer clásico.')
    );
  }

  // ---------- mixer ----------
  function renderMixer() {
    const box = $('#mixer');
    box.replaceChildren();
    const p = S.project;
    p.mixer.forEach((tr, i) => {
      const routed = p.channels.filter((c) => c.insert === i).map((c) => c.name);
      const nameInput = h('input', { class: 'name', value: tr.name, onchange: (e) => mutate(() => { tr.name = e.target.value.trim() || tr.name; }) });
      box.append(h('div', { class: 'strip' + (i === 0 ? ' master' : '') },
        nameInput,
        param('Volumen', tr, 'volume', 0, 1.5, 0.01, fmt.pct),
        param('Paneo', tr, 'pan', -1, 1, 0.01, fmt.pan),
        h('button', { class: 'mini wide' + (tr.mute ? ' on' : ''), onclick: () => mutate(() => { tr.mute = !tr.mute; }) }, tr.mute ? 'Silenciado' : 'Silenciar'),
        group('EQ', param('Graves', tr.eq, 'low', -12, 12, 0.5, fmt.db), param('Medios', tr.eq, 'mid', -12, 12, 0.5, fmt.db), param('Agudos', tr.eq, 'high', -12, 12, 0.5, fmt.db)),
        group('Distorsión', param('Cantidad', tr, 'drive', 0, 1, 0.01, fmt.pct)),
        group('Compresor', param('Cantidad', tr, 'comp', 0, 1, 0.01, fmt.pct)),
        group('Delay', param('Mezcla', tr.delay, 'mix', 0, 1, 0.01, fmt.pct), param('Tiempo', tr.delay, 'time', 0.01, 1.9, 0.01, fmt.sec), param('Feedback', tr.delay, 'feedback', 0, 0.9, 0.01, fmt.pct)),
        group('Reverb', param('Mezcla', tr.reverb, 'mix', 0, 1, 0.01, fmt.pct), param('Caída', tr.reverb, 'decay', 0.2, 8, 0.1, fmt.sec)),
        h('div', { class: 'routed', title: routed.join(', ') }, i === 0 ? 'Salida principal' : routed.length ? routed.join(', ') : 'Sin canales')
      ));
    });
  }

  function group(title, ...controls) {
    return h('fieldset', { class: 'fx' }, h('legend', {}, title), ...controls);
  }

  // ---------- transport ----------
  function togglePlay() {
    if (E.isPlaying()) return stopPlay();
    startPlay();
  }

  function startPlay() {
    const ok = E.play(S.project, { mode: S.mode, patternId: curPattern().id, metronome: S.metro, loop: S.loop });
    if (!ok) return status('Nada que reproducir: añade notas al patrón o items a la playlist.');
    S.wasPlaying = true;
    status(S.mode === 'song' ? 'Reproduciendo canción…' : 'Reproduciendo patrón…');
  }

  function stopPlay() {
    E.stop();
    S.wasPlaying = false;
    markStep(-1);
    status('Detenido.');
  }

  function setOctave(o) {
    S.octave = C.clamp(o, 0, 8);
    status(`Octava del teclado: ${S.octave}`);
  }

  function toggleRecord() {
    S.recording = !S.recording;
    status(S.recording ? 'Grabación activa: toca el teclado durante la reproducción de un patrón.' : 'Grabación desactivada.');
    renderTop();
  }

  function noteStart(id, midi, vel = 0.8) {
    const ch = curChannel();
    if (!ch || S.held.has(id)) return;
    const key = E.noteOn(ch.id, midi, vel);
    if (!key) return;
    const rec = { key, midi, chId: ch.id, start: null };
    if (S.recording && S.mode === 'pattern' && E.isPlaying()) {
      rec.start = Math.floor(E.position() / TPS) * TPS;
    }
    S.held.set(id, rec);
  }

  function noteStop(id) {
    const rec = S.held.get(id);
    if (!rec) return;
    S.held.delete(id);
    E.noteOff(rec.key);
    if (rec.start === null) return;
    const loop = E.loopTicks() || C.patternTicks(curPattern());
    let dur = E.position() - rec.start;
    if (dur <= 0) dur += loop;
    dur = Math.max(TPS, Math.round(dur / TPS) * TPS);
    const pat = curPattern();
    mutate(() => { pat.notes.push(C.createNote(rec.chId, rec.midi, rec.start, dur, 0.8)); });
  }

  function isTyping(e) {
    const t = e.target;
    return t.tagName === 'TEXTAREA' || t.tagName === 'SELECT'
      || (t.tagName === 'INPUT' && ['text', 'number', 'search'].includes(t.type));
  }

  function onKeyDown(e) {
    const k = e.key.toLowerCase();
    if (e.ctrlKey || e.metaKey) {
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo(); }
      else if (k === 'a' && S.tab === 'roll' && !isTyping(e)) { e.preventDefault(); selectAllNotes(); }
      else if (k === 's') { e.preventDefault(); saveFile(); }
      return;
    }
    if (isTyping(e)) return;
    if (k === ' ') { e.preventDefault(); togglePlay(); return; }
    if (k === 'delete' || k === 'backspace') {
      if (S.tab === 'roll' && S.sel.size) { e.preventDefault(); deleteSelected(); }
      return;
    }
    if (k === 'z') return setOctave(S.octave - 1);
    if (k === 'x') return setOctave(S.octave + 1);
    if (k === 'r') return toggleRecord();
    if (k === 'm') { S.metro = !S.metro; renderTop(); return; }
    if (Object.prototype.hasOwnProperty.call(KEYMAP, k) && !e.repeat) {
      e.preventDefault();
      noteStart(`k:${k}`, (S.octave + 1) * 12 + KEYMAP[k]);
    }
  }

  function onKeyUp(e) {
    const k = e.key.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(KEYMAP, k)) noteStop(`k:${k}`);
  }

  function setupMidi() {
    if (!navigator.requestMIDIAccess) { status('Este navegador no tiene Web MIDI; el teclado de la computadora sigue activo.'); return; }
    navigator.requestMIDIAccess().then((access) => {
      const bind = () => {
        const inputs = [...access.inputs.values()];
        inputs.forEach((inp) => { inp.onmidimessage = onMidi; });
        status(inputs.length ? `MIDI: ${inputs.map((i) => i.name).join(', ')}` : 'MIDI: no hay dispositivos conectados.');
      };
      bind();
      access.onstatechange = bind;
    }).catch(() => { status('MIDI no disponible (permiso denegado).'); });
  }

  function onMidi(e) {
    const [st, note, vel] = e.data;
    const cmd = st & 0xf0;
    if (cmd === 0x90 && vel > 0) noteStart(`m:${note}`, note, vel / 127);
    else if (cmd === 0x80 || (cmd === 0x90 && vel === 0)) noteStop(`m:${note}`);
  }

  // ---------- files ----------
  function safeName() {
    return (S.project.name || 'beat').replace(/[^\w\- ]+/g, '').trim() || 'beat';
  }

  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function saveFile() {
    closeEdit();
    downloadBlob(new Blob([C.serializeProject(S.project)], { type: 'application/json' }), `${safeName()}.beatforge.json`);
    status('Proyecto guardado en un archivo.');
  }

  function openFile(file) {
    file.text().then((text) => {
      const p = C.parseProject(text);
      closeEdit();
      pushPast(JSON.stringify(S.project));
      S.project = p;
      S.sel.clear();
      E.sync(p);
      saveSoon();
      renderAll();
      status(`Abierto ${file.name}. Los samples hay que volver a cargarlos.`);
    }).catch((err) => status('No se pudo abrir: ' + err.message));
  }

  function newProject() {
    if (!confirm('¿Crear un proyecto nuevo? Podrás deshacer con Ctrl+Z.')) return;
    closeEdit();
    pushPast(JSON.stringify(S.project));
    S.project = C.createProject();
    S.sel.clear();
    E.sync(S.project);
    saveSoon();
    renderAll();
  }

  async function exportWav() {
    closeEdit();
    status('Renderizando WAV…');
    try {
      const blob = await E.renderWav(S.project, { mode: S.mode, patternId: curPattern().id });
      downloadBlob(blob, `${safeName()}.wav`);
      status('WAV exportado.');
    } catch (err) {
      status(err.message);
    }
  }

  function exportMidi() {
    const events = S.mode === 'song' ? C.songEvents(S.project) : C.patternEvents(S.project, curPattern(), 0);
    if (!events.length) return status('No hay notas que exportar en este modo.');
    downloadBlob(new Blob([C.encodeMidi(S.project, events)], { type: 'audio/midi' }), `${safeName()}.mid`);
    status('MIDI exportado.');
  }

  // ---------- frame loop: playhead, meter, step highlight ----------
  function frame() {
    const playing = E.isPlaying();
    if (!playing && S.wasPlaying) {
      E.stop();
      S.wasPlaying = false;
      markStep(-1);
      status('Reproducción terminada.');
    }
    const pos = playing ? E.position() : 0;
    $('#position').textContent = C.formatPosition(pos);
    $('#btnPlay').classList.toggle('playing', playing);
    $('#meterBar').style.width = Math.min(100, E.peak() * 100) + '%';
    if (playing && S.mode === 'pattern' && S.tab === 'step') markStep(Math.floor(pos / TPS));
    if (playing && S.tab === 'roll') drawRoll();
    requestAnimationFrame(frame);
  }

  // ---------- startup ----------
  function bindStatic() {
    $('#btnPlay').addEventListener('click', togglePlay);
    $('#btnStop').addEventListener('click', stopPlay);
    $('#bpm').addEventListener('change', (e) => {
      const v = C.clamp(parseFloat(e.target.value) || 128, 20, 300);
      mutate(() => { S.project.bpm = v; });
    });
    $('#projectName').addEventListener('change', (e) => {
      const v = e.target.value.trim() || 'Sin título';
      mutate(() => { S.project.name = v; });
    });
    document.querySelectorAll('#modeSeg button').forEach((b) => b.addEventListener('click', () => {
      S.mode = b.dataset.mode;
      renderTop();
    }));
    $('#metro').addEventListener('change', (e) => { S.metro = e.target.checked; status('El metrónomo se aplica en la siguiente reproducción.'); });
    $('#loopOn').addEventListener('change', (e) => { S.loop = e.target.checked; status('El loop se aplica en la siguiente reproducción (solo en modo Canción).'); });
    $('#btnRec').addEventListener('click', toggleRecord);
    $('#btnUndo').addEventListener('click', undo);
    $('#btnRedo').addEventListener('click', redo);
    $('#btnNew').addEventListener('click', newProject);
    $('#btnOpen').addEventListener('click', () => $('#fileOpen').click());
    $('#fileOpen').addEventListener('change', (e) => { if (e.target.files[0]) openFile(e.target.files[0]); e.target.value = ''; });
    $('#btnSave').addEventListener('click', saveFile);
    $('#btnWav').addEventListener('click', exportWav);
    $('#btnMidi').addEventListener('click', exportMidi);

    document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => { S.tab = b.dataset.tab; renderView(); }));
    document.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', () => addChannel(b.dataset.add)));
    $('#btnPatAdd').addEventListener('click', addPattern);
    $('#btnPatDup').addEventListener('click', duplicatePattern);
    $('#btnPatDel').addEventListener('click', deletePattern);
    $('#patBars').addEventListener('change', (e) => {
      const v = C.clamp(parseInt(e.target.value, 10) || 1, 1, C.MAX_BARS);
      mutate(() => { curPattern().bars = v; });
    });

    $('#fileSample').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      const id = e.target.dataset.channel;
      e.target.value = '';
      if (!file || !id) return;
      try {
        const duration = await E.loadSample(id, await file.arrayBuffer());
        mutate(() => {
          const ch = S.project.channels.find((c) => c.id === id);
          if (ch) ch.sample.name = file.name;
        });
        status(`Sample "${file.name}" cargado (${duration.toFixed(2)} s).`);
      } catch (err) {
        status('No se pudo decodificar el audio: ' + err.message);
      }
    });

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('mouseup', () => { S.paint = null; closeEdit(); });
    window.addEventListener('blur', () => { for (const k of [...S.held.keys()]) noteStop(k); });
  }

  function init() {
    S.project = loadInitial();
    E.sync(S.project);
    bindStatic();
    bindRoll();
    setupMidi();
    renderAll();
    requestAnimationFrame(frame);
    status('Listo. Espacio: reproducir · Z/X: octava · A–; : teclado · R: grabar · Ctrl+Z: deshacer');
  }

  init();
})();
