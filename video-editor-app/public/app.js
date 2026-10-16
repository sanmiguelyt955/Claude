'use strict';

// Aplicación: estado, línea de tiempo, inspector, deshacer/rehacer, proyectos y exportación.
(function () {
  const LABEL_W = 118;          // ancho de la columna de nombres de pista (px)
  const MIN_CLIP = 0.1;         // duración mínima de un clip (s)
  const SNAP_PX = 8;            // distancia de imán al cursor (px)
  const DRAFT_KEY = 've-draft';

  const $ = (id) => document.getElementById(id);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const fmt = (t) => {
    const m = Math.floor(t / 60);
    return `${String(m).padStart(2, '0')}:${(t % 60).toFixed(1).padStart(4, '0')}`;
  };

  const S = {
    project: null,
    media: [],
    mediaMap: new Map(),
    selected: null,          // id del clip seleccionado
    selectedTrack: null,     // id de la pista seleccionada
    t: 0,                    // cursor (s)
    playing: false,
    pxPerSec: 70,
    undo: [],
    redo: [],
    gestureBefore: null,     // snapshot para cambios en el inspector
    exporting: false,
  };

  const preview = new VEPreview($('stage'), {
    urlFor: (id) => (S.mediaMap.get(id) || {}).url,
    mediaFor: (id) => S.mediaMap.get(id),
  });

  // ---------- proyecto y utilidades ----------

  function trackName(kind, index) {
    return { video: 'Video', audio: 'Sonido', text: 'Texto', graphic: 'Forma' }[kind] + ' ' + index;
  }

  function newTrack(kind, existing = []) {
    const count = existing.filter((t) => t.kind === kind).length + 1;
    return { id: uid(), kind, name: trackName(kind, count), muted: false, clips: [] };
  }

  function newProject() {
    const tracks = [];
    for (const kind of ['video', 'text', 'audio']) tracks.push(newTrack(kind, tracks));
    return { name: 'Proyecto sin título', ratio: '16:9', fps: 30, tracks };
  }

  function baseTrackId() {
    const v = S.project.tracks.find((t) => t.kind === 'video');
    return v ? v.id : null;
  }

  function findClip(id) {
    if (!id) return null;
    for (const track of S.project.tracks) {
      const clip = track.clips.find((c) => c.id === id);
      if (clip) return { clip, track };
    }
    return null;
  }

  function sortTrack(track) {
    track.clips.sort((a, b) => a.at - b.at);
  }

  function duration() {
    return VEModel.projectDuration(S.project);
  }

  function mediaById(id) {
    return S.mediaMap.get(id);
  }

  function setStatus(msg, isError = false) {
    const el = $('status');
    el.textContent = msg;
    el.classList.toggle('error', isError);
  }

  function snap() {
    return JSON.stringify(S.project);
  }

  function validate() {
    const base = baseTrackId();
    const errs = [];
    for (const track of S.project.tracks) {
      errs.push(...VEModel.trackErrors(track, track.id === base));
    }
    return errs;
  }

  // Ejecuta un cambio con historial. Si deja el proyecto inválido, lo revierte.
  function mutate(label, fn) {
    const before = snap();
    fn();
    return finish(before, label);
  }

  function finish(before, label) {
    const errs = validate();
    if (errs.length) {
      S.project = JSON.parse(before);
      setStatus(errs[0], true);
      renderAll();
      return false;
    }
    if (snap() !== before) {
      S.undo.push(before);
      if (S.undo.length > 150) S.undo.shift();
      S.redo = [];
      setStatus(label || '');
      saveDraft();
    }
    renderAll();
    return true;
  }

  function undo() {
    if (!S.undo.length) return;
    S.redo.push(snap());
    S.project = JSON.parse(S.undo.pop());
    afterHistory();
  }

  function redo() {
    if (!S.redo.length) return;
    S.undo.push(snap());
    S.project = JSON.parse(S.redo.pop());
    afterHistory();
  }

  function afterHistory() {
    if (S.selected && !findClip(S.selected)) S.selected = null;
    saveDraft();
    renderAll();
  }

  function saveDraft() {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(S.project)); } catch (_) { /* privado o sin espacio */ }
  }

  // ---------- API ----------

  async function api(path, opts = {}) {
    const res = await fetch(path, opts);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `Error ${res.status}`);
    return body;
  }

  async function loadMedia() {
    S.media = await api('/api/media');
    S.mediaMap = new Map(S.media.map((m) => [m.id, m]));
  }

  async function importFiles(files) {
    for (const file of files) {
      setStatus(`Subiendo ${file.name}…`);
      try {
        await api(`/api/upload?name=${encodeURIComponent(file.name)}`, { method: 'POST', body: file });
      } catch (err) {
        setStatus(`No se pudo subir ${file.name}: ${err.message}`, true);
        return;
      }
    }
    await loadMedia();
    setStatus('Medios importados');
    renderAll();
  }

  // ---------- añadir clips ----------

  function endOf(track) {
    return track.clips.reduce((m, c) => Math.max(m, c.at + VEModel.clipDuration(c)), 0);
  }

  function ensureTrack(kind) {
    let track = S.project.tracks.find((t) => t.id === S.selectedTrack && t.kind === kind);
    if (!track) track = S.project.tracks.find((t) => t.kind === kind);
    if (!track) {
      track = newTrack(kind, S.project.tracks);
      S.project.tracks.push(track);
    }
    return track;
  }

  // Completa un clip nuevo con los valores por defecto del modelo (volumen, filtros, etc.).
  function prepared(raw, kind) {
    return VEModel.normalizeClip(raw, kind, mediaById);
  }

  function addMedia(m) {
    const kind = m.type === 'audio' ? 'audio' : 'video';
    mutate(`Añadido ${m.name}`, () => {
      const track = ensureTrack(kind);
      const at = endOf(track);
      let raw;
      if (m.type === 'image') raw = { type: 'image', mediaId: m.id, at, dur: 3 };
      else raw = { type: m.type, mediaId: m.id, at, in: 0, out: m.duration, speed: 1 };
      const clip = prepared(raw, track.kind);
      track.clips.push(clip);
      sortTrack(track);
      S.selected = clip.id;
      S.selectedTrack = track.id;
    });
  }

  function addOverlayText() {
    mutate('Texto añadido', () => {
      const track = ensureTrack('text');
      const clip = prepared({ type: 'text', at: S.t, dur: 3, text: 'Escribe aquí', x: 50, y: 85, size: 48, color: '#ffffff', bg: null, bgOpacity: 0.5 }, 'text');
      track.clips.push(clip);
      sortTrack(track);
      S.selected = clip.id;
      S.selectedTrack = track.id;
    });
  }

  function addShape() {
    mutate('Forma añadida', () => {
      const track = ensureTrack('graphic');
      const clip = prepared({ type: 'shape', at: S.t, dur: 3, x: 50, y: 50, w: 30, h: 20, color: '#7c5cff', opacity: 0.8 }, 'graphic');
      track.clips.push(clip);
      sortTrack(track);
      S.selected = clip.id;
      S.selectedTrack = track.id;
    });
  }

  // ---------- edición de clips ----------

  function selectClip(id, trackId) {
    S.selected = id;
    if (trackId) S.selectedTrack = trackId;
  }

  function splitAtCursor() {
    const t = S.t;
    const candidates = [];
    for (const track of S.project.tracks) {
      for (const c of track.clips) {
        const dur = VEModel.clipDuration(c);
        if (t > c.at + 0.05 && t < c.at + dur - 0.05) candidates.push({ c, track });
      }
    }
    if (!candidates.length) return setStatus('El cursor no está sobre un clip', true);
    const pick = candidates.find((x) => x.c.id === S.selected) || candidates[0];
    mutate('Corte', () => {
      const { track } = pick;
      const idx = track.clips.findIndex((c) => c.id === pick.c.id);
      const c = track.clips[idx];
      const right = clone(c);
      right.id = uid();
      right.at = t;
      if (c.type === 'video' || c.type === 'audio') {
        const cut = c.in + (t - c.at) * c.speed;
        c.out = cut;
        right.in = cut;
        c.fadeOut = 0;
        right.fadeIn = 0;
      } else {
        const leftDur = t - c.at;
        right.dur = c.dur - leftDur;
        c.dur = leftDur;
      }
      right.transitionIn = null;
      track.clips.splice(idx + 1, 0, right);
      S.selected = right.id;
      S.selectedTrack = track.id;
    });
  }

  function deleteSelected() {
    const found = findClip(S.selected);
    if (!found) return;
    mutate('Clip eliminado', () => {
      found.track.clips = found.track.clips.filter((c) => c.id !== found.clip.id);
      S.selected = null;
    });
  }

  function duplicateSelected() {
    const found = findClip(S.selected);
    if (!found) return;
    mutate('Clip duplicado', () => {
      const copy = clone(found.clip);
      copy.id = uid();
      copy.transitionIn = null;
      const dur = VEModel.clipDuration(found.clip);
      copy.at = found.track.id === baseTrackId() ? endOf(found.track) : found.clip.at + dur;
      found.track.clips.push(copy);
      sortTrack(found.track);
      S.selected = copy.id;
    });
  }

  // Ajusta una posición para que no se solape en la pista base (salvo la transición de entrada).
  function fitInBase(track, clipId, at, dur, origAt, allowOverlap) {
    const others = track.clips.filter((c) => c.id !== clipId).sort((a, b) => a.at - b.at);
    let pos = at;
    for (let pass = 0; pass < 4; pass++) {
      let moved = false;
      for (const o of others) {
        const oEnd = o.at + VEModel.clipDuration(o);
        const slack = allowOverlap || 0;
        const overlaps = pos < oEnd - slack - 1e-6 && pos + dur > o.at + 1e-6;
        if (!overlaps) continue;
        if (origAt >= oEnd - slack - 1e-6) pos = oEnd - slack;
        else if (origAt + dur <= o.at + 1e-6) pos = o.at - dur;
        else return null;
        moved = true;
      }
      if (!moved) return Math.max(0, pos);
    }
    return null;
  }

  // ---------- gestos de la línea de tiempo ----------

  let raf = 0;
  function scheduleTimeline() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      renderTimeline();
      updateTransport();
    });
  }

  function beginGesture(e, clipId, mode) {
    const found = findClip(clipId);
    if (!found) return;
    e.preventDefault();
    e.stopPropagation();
    selectClip(clipId, found.track.id);
    const g = {
      mode,
      clipId,
      startX: e.clientX,
      before: snap(),
      orig: clone(found.clip),
      origAt: found.clip.at,
      origDur: VEModel.clipDuration(found.clip),
      moved: false,
    };
    const move = (ev) => {
      const dt = (ev.clientX - g.startX) / S.pxPerSec;
      if (Math.abs(ev.clientX - g.startX) > 3) g.moved = true;
      if (g.moved) applyGesture(g, ev, dt);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (g.moved) finish(g.before, g.mode === 'move' ? 'Clip movido' : 'Clip recortado');
      else renderAll();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  function applyGesture(g, ev, dt) {
    const found = findClip(g.clipId);
    if (!found) return;
    const { clip, track } = found;
    const base = track.id === baseTrackId();
    const isMedia = clip.type === 'video' || clip.type === 'audio';
    const o = g.orig;
    const dur = g.origDur;
    const speed = isMedia ? o.speed : 1;
    const allowOverlap = o.transitionIn ? o.transitionIn.dur : 0;

    if (g.mode === 'move') {
      let at = Math.max(0, o.at + dt);
      const snapT = (x) => (Math.abs(x - S.t) * S.pxPerSec < SNAP_PX ? S.t : x);
      at = snapT(at);
      at = snapT(at + dur) - dur;
      at = Math.max(0, at);
      // La pista de destino depende de dónde está el puntero (solo si el tipo es compatible).
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const row = el && el.closest ? el.closest('[data-track-id]') : null;
      let target = track;
      if (row) {
        const t2 = S.project.tracks.find((t) => t.id === row.dataset.trackId);
        if (t2 && t2.kind === track.kind) target = t2;
      }
      if (target.id === baseTrackId()) {
        const fitted = fitInBase(target, clip.id, at, dur, o.at, allowOverlap);
        if (fitted === null) return;
        at = fitted;
      }
      clip.at = at;
      if (target !== track) {
        track.clips = track.clips.filter((c) => c.id !== clip.id);
        target.clips.push(clip);
        sortTrack(target);
        S.selectedTrack = target.id;
      }
      sortTrack(target);
    } else if (g.mode === 'trim-l') {
      if (isMedia) {
        const minIn = Math.max(0, o.in - o.at * speed);
        let newIn = clamp(o.in + dt * speed, minIn, o.out - MIN_CLIP * speed);
        const newAt = o.at + (newIn - o.in) / speed;
        clip.in = newIn;
        clip.at = Math.max(0, newAt);
      } else {
        const newAt = clamp(o.at + dt, 0, o.at + dur - MIN_CLIP);
        clip.at = newAt;
        clip.dur = o.at + dur - newAt;
      }
      if (base) {
        const prev = track.clips.filter((c) => c.id !== clip.id && c.at <= o.at).pop();
        if (prev && clip.at < prev.at + VEModel.clipDuration(prev) - allowOverlap) {
          const limit = prev.at + VEModel.clipDuration(prev) - allowOverlap;
          const shift = limit - clip.at;
          clip.at = limit;
          if (isMedia) clip.in += shift * speed;
          else clip.dur -= shift;
        }
      }
    } else if (g.mode === 'trim-r') {
      if (isMedia) {
        const srcDur = (mediaById(clip.mediaId) || {}).duration || o.out;
        let newOut = clamp(o.out + dt * speed, o.in + MIN_CLIP * speed, srcDur);
        if (base) {
          const next = track.clips.filter((c) => c.id !== clip.id && c.at >= o.at).sort((a, b) => a.at - b.at)[0];
          if (next) newOut = Math.min(newOut, o.in + (next.at + allowOverlap - o.at) * speed);
        }
        clip.out = Math.max(o.in + MIN_CLIP * speed, newOut);
      } else {
        let newDur = Math.max(MIN_CLIP, dur + dt);
        if (base) {
          const next = track.clips.filter((c) => c.id !== clip.id && c.at >= o.at).sort((a, b) => a.at - b.at)[0];
          if (next) newDur = Math.min(newDur, next.at + allowOverlap - o.at);
        }
        clip.dur = Math.max(MIN_CLIP, newDur);
      }
    }
    scheduleTimeline();
    renderInspector();
  }

  // ---------- render ----------

  function renderAll() {
    $('projectName').value = S.project.name;
    $('ratioSelect').value = S.project.ratio;
    $('undoBtn').disabled = !S.undo.length;
    $('redoBtn').disabled = !S.redo.length;
    $('exportBtn').disabled = S.exporting || duration() <= 0;
    renderMedia();
    renderTimeline();
    renderInspector();
    updateTransport();
    preview.setProject(S.project);
    preview.sync(S.t, S.playing);
  }

  const KIND_ICON = { video: '▶', image: '🖼', audio: '♪' };
  const KIND_NAME = { video: 'Video', image: 'Foto', audio: 'Sonido' };

  function renderMedia() {
    const list = $('mediaList');
    if (!S.media.length) {
      list.innerHTML = '<li class="empty">Todavía no tienes archivos. Sube uno con el botón de arriba.</li>';
      return;
    }
    list.innerHTML = S.media.map((m) => `
      <li>
        <span class="media-item">
          <span class="media-kind ${m.type}" aria-hidden="true">${KIND_ICON[m.type]}</span>
          <span class="media-meta">
            <span class="name" title="${esc(m.name)}">${esc(m.name)}</span>
            <small class="muted">${KIND_NAME[m.type]}${m.duration ? ' · ' + fmt(m.duration) : ''}</small>
          </span>
        </span>
        <span class="row">
          <button class="small" data-add-media="${m.id}" title="Poner en la línea de tiempo" aria-label="Añadir ${esc(m.name)} a la línea de tiempo">+ Añadir</button>
          <button data-del-media="${m.id}" class="ghost" title="Borrar este archivo" aria-label="Borrar ${esc(m.name)}">🗑</button>
        </span>
      </li>`).join('');
  }

  const TRACK_NAME = { video: 'Video', audio: 'Sonido', text: 'Texto', graphic: 'Formas' };

  function renderTimeline() {
    const total = Math.max(duration(), 10) + 5;
    const laneW = Math.ceil(total * S.pxPerSec);
    const rows = S.project.tracks.map((track) => {
      const blocks = track.clips.map((c) => {
        const dur = VEModel.clipDuration(c);
        const name = c.type === 'text' ? c.text : c.type === 'shape' ? 'Forma' : ((mediaById(c.mediaId) || {}).name || c.type);
        const sel = c.id === S.selected ? ' selected' : '';
        return `<div class="block ${c.type}${sel}" data-clip="${c.id}" data-track="${track.id}"
          title="${esc(name)} · ${dur.toFixed(1)} s"
          style="left:${c.at * S.pxPerSec}px;width:${Math.max(dur * S.pxPerSec, 6)}px">
          <span class="handle l" data-trim="l" data-clip="${c.id}" title="Arrastra para recortar el inicio" aria-hidden="true"></span>
          <span class="block-name">${esc(name)}</span>
          ${dur * S.pxPerSec > 90 ? `<span class="block-meta">${dur.toFixed(1)} s</span>` : ''}
          <span class="handle r" data-trim="r" data-clip="${c.id}" title="Arrastra para recortar el final" aria-hidden="true"></span>
        </div>`;
      }).join('');
      const selRow = track.id === S.selectedTrack ? ' selected-track' : '';
      return `<div class="row-track kind-${track.kind}${selRow}" data-track-id="${track.id}">
        <div class="track-label">
          <span class="track-name" title="${esc(track.name)}">${esc(track.name)}</span>
          <span class="track-kind">${TRACK_NAME[track.kind]}</span>
          <span class="track-tools">
            <button data-mute="${track.id}" class="ghost ${track.muted ? 'on' : ''}" title="${track.muted ? 'Activar sonido de la pista' : 'Silenciar la pista'}" aria-label="${track.muted ? 'Activar sonido' : 'Silenciar'} pista">${track.muted ? '🔇' : '🔈'}</button>
            <button data-del-track="${track.id}" class="ghost" title="Borrar esta pista y sus clips" aria-label="Borrar pista">✕</button>
          </span>
        </div>
        <div class="lane" data-lane="${track.id}" style="width:${laneW}px">${blocks}</div>
      </div>`;
    }).join('');

    const ticks = [];
    const step = S.pxPerSec >= 60 ? 1 : S.pxPerSec >= 30 ? 2 : 5;
    for (let s = 0; s <= total; s += step) {
      ticks.push(`<span class="tick" style="left:${s * S.pxPerSec}px">${fmt(s).replace('.0', '')}</span>`);
    }

    $('timelineInner').innerHTML = `
      <div class="ruler-row" style="--label-w:${LABEL_W}px">
        <div class="ruler-label"></div>
        <div class="ruler" id="ruler" style="width:${laneW}px">${ticks.join('')}</div>
      </div>
      <div class="rows" style="--label-w:${LABEL_W}px">${rows || '<p class="empty-lane">Empieza añadiendo una pista de video con el botón “+ Pista de video”.</p>'}</div>
      <div class="playhead" id="playhead" style="left:${LABEL_W + S.t * S.pxPerSec}px"></div>`;
    bindTimeline();
  }

  function bindTimeline() {
    const inner = $('timelineInner');
    inner.querySelectorAll('.block').forEach((el) => {
      el.addEventListener('pointerdown', (e) => {
        const trim = e.target.dataset && e.target.dataset.trim;
        if (trim) return beginGesture(e, el.dataset.clip, `trim-${trim}`);
        beginGesture(e, el.dataset.clip, 'move');
      });
    });
    inner.querySelectorAll('.lane').forEach((lane) => {
      lane.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.block')) return;
        S.selected = null;
        S.selectedTrack = lane.dataset.lane;
        seek(xToTime(e.clientX, lane));
        renderAll();
      });
    });
    const ruler = $('ruler');
    ruler.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const scrub = (ev) => seek(xToTime(ev.clientX, ruler));
      scrub(e);
      const up = () => {
        window.removeEventListener('pointermove', scrub);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', scrub);
      window.addEventListener('pointerup', up);
    });
  }

  function xToTime(clientX, el) {
    const rect = el.getBoundingClientRect();
    return Math.max(0, (clientX - rect.left) / S.pxPerSec);
  }

  function renderInspector() {
    const body = $('inspectorBody');
    const badge = $('clipBadge');
    const found = findClip(S.selected);
    if (!found) {
      badge.hidden = true;
      body.innerHTML = `<div class="empty">
          <p><b>Toca un clip</b> en la línea de tiempo para cambiar su tamaño, color, velocidad o sonido.</p>
          <p class="muted small">Tip: arrastra el clip para moverlo y sus bordes para recortarlo.</p>
        </div>`;
      return;
    }
    badge.hidden = false;
    const { clip, track } = found;
    badge.textContent = { video: 'Video', image: 'Imagen', audio: 'Sonido', text: 'Texto', shape: 'Forma' }[clip.type];
    const base = track.id === baseTrackId();
    const f = (type, key, label, val, o = {}) => {
      const attrs = Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}="${esc(v)}"`).join(' ');
      if (type === 'check') return `<label class="field check"><input type="checkbox" data-key="${key}" ${val ? 'checked' : ''}><span>${label}</span></label>`;
      if (type === 'select') {
        const opts = o.options.map(([v, l]) => `<option value="${v}" ${v === val ? 'selected' : ''}>${l}</option>`).join('');
        return `<label class="field"><span>${label}</span><select data-key="${key}">${opts}</select></label>`;
      }
      if (type === 'textarea') return `<label class="field wide"><span>${label}</span><textarea data-key="${key}" rows="2">${esc(val)}</textarea></label>`;
      if (type === 'range') {
        return `<label class="field"><span>${label} <b class="out">${fmtRange(val, o.fmt)}</b></span>
          <input type="range" data-key="${key}" data-fmt="${o.fmt || ''}" value="${val}" ${attrs}></label>`;
      }
      if (type === 'color') return `<label class="field"><span>${label}</span><input type="color" data-key="${key}" value="${val}"></label>`;
      return `<label class="field"><span>${label}</span><input type="number" data-key="${key}" value="${Number(val).toFixed(2).replace(/\.?0+$/, '') || 0}" ${attrs}></label>`;
    };
    const num = (key, label, val, o = {}) => f('num', key, label, val, { step: o.step || 0.1, min: o.min, max: o.max });

    const group = (title, html) => `<fieldset><legend>${title}</legend><div class="grid">${html}</div></fieldset>`;
    const dur = VEModel.clipDuration(clip);
    const parts = [];

    parts.push(group('Cuándo aparece', [
      num('at', 'Empieza en (segundos)', clip.at, { min: 0 }),
      `<label class="field"><span>Dura</span><output>${dur.toFixed(2)} s</output></label>`,
      ...(clip.type === 'video' || clip.type === 'audio' ? [
        num('in', 'Recorte: desde (s)', clip.in, { min: 0 }),
        num('out', 'Recorte: hasta (s)', clip.out, { min: 0 }),
        num('speed', 'Velocidad (1 = normal)', clip.speed, { min: 0.1, max: 100 }),
      ] : [num('dur', 'Cuánto dura (s)', clip.dur, { min: 0.1 })]),
    ].join('')));

    if (clip.type === 'video' || clip.type === 'audio') {
      parts.push(group('Sonido', [
        f('range', 'volume', 'Volumen', clip.volume, { min: 0, max: 2, step: 0.01, fmt: 'pct' }),
        num('fadeIn', 'Aparece poco a poco (s)', clip.fadeIn, { min: 0 }),
        num('fadeOut', 'Se apaga poco a poco (s)', clip.fadeOut, { min: 0 }),
        f('check', 'muted', 'Silenciar este clip', clip.muted),
      ].join('')));
    }

    if (clip.type === 'video' || clip.type === 'image') {
      const f0 = clip.filter || { preset: 'none', brightness: 0, contrast: 1, saturation: 1 };
      parts.push(group('Color y efectos', [
        f('select', 'filter.preset', 'Estilo de color', f0.preset, { options: [
          ['none', 'Ninguno'], ['warm', 'Cálido'], ['cool', 'Frío'], ['bw', 'Blanco y negro'],
          ['vintage', 'Vintage'], ['vivid', 'Vívido'], ['dramatic', 'Dramático'],
        ] }),
        f('range', 'filter.brightness', 'Brillo', f0.brightness, { min: -1, max: 1, step: 0.01, fmt: 'n' }),
        f('range', 'filter.contrast', 'Contraste', f0.contrast, { min: 0, max: 2, step: 0.01, fmt: 'x' }),
        f('range', 'filter.saturation', 'Saturación', f0.saturation, { min: 0, max: 3, step: 0.01, fmt: 'x' }),
      ].join('')));

      parts.push(group(base ? 'Encuadre' : 'Posición en la pantalla', [
        base
          ? '<p class="muted wide">Este video es el fondo: ocupa toda la pantalla. Para moverlo o cambiar su tamaño, ponlo en otra pista de video.</p>'
          : [
            f('range', 'x', 'Izquierda ↔ derecha', clip.x, { min: 0, max: 100, step: 0.5, fmt: 'pct0' }),
            f('range', 'y', 'Arriba ↕ abajo', clip.y, { min: 0, max: 100, step: 0.5, fmt: 'pct0' }),
            f('range', 'scale', 'Tamaño', clip.scale, { min: 5, max: 300, step: 1, fmt: 'pct0' }),
          ].join(''),
        f('range', 'opacity', 'Transparencia', clip.opacity, { min: 0, max: 1, step: 0.01, fmt: 'pct' }),
        f('check', 'chromaOn', 'Quitar un color (fondo verde)', !!clip.chromaKey),
        clip.chromaKey ? f('color', 'chromaKey.color', 'Color a quitar', clip.chromaKey.color) : '',
        clip.chromaKey ? f('range', 'chromaKey.similarity', 'Tolerancia', clip.chromaKey.similarity, { min: 0.01, max: 0.5, step: 0.01, fmt: 'n' }) : '',
      ].join('')));
    }

    if (clip.type === 'video' || clip.type === 'image') {
      const tr = clip.transitionIn;
      parts.push(group('Cómo entra al video', [
        f('select', 'transitionIn.type', 'Efecto de entrada', tr ? tr.type : 'none', { options: [
          ['none', 'Ninguna'], ['fade', 'Fundido'], ['slide-left', 'Deslizar ←'], ['slide-right', 'Deslizar →'],
          ['slide-up', 'Deslizar ↑'], ['slide-down', 'Deslizar ↓'],
        ] }),
        tr ? num('transitionIn.dur', 'Duración del efecto (s)', tr.dur, { min: 0.1, max: 2 }) : '',
      ].join('')));
    }

    if (clip.type === 'text') {
      parts.push(group('Texto', [
        f('textarea', 'text', 'Escribe tu texto', clip.text),
        num('size', 'Tamaño de letra', clip.size, { min: 8, max: 300, step: 1 }),
        f('color', 'color', 'Color', clip.color),
        f('check', 'bgOn', 'Poner fondo detrás del texto', !!clip.bg),
        clip.bg ? f('color', 'bg', 'Color del fondo', clip.bg) : '',
        clip.bg ? f('range', 'bgOpacity', 'Transparencia del fondo', clip.bgOpacity, { min: 0, max: 1, step: 0.01, fmt: 'pct' }) : '',
        f('range', 'x', 'Izquierda ↔ derecha', clip.x, { min: 0, max: 100, step: 0.5, fmt: 'pct0' }),
        f('range', 'y', 'Arriba ↕ abajo', clip.y, { min: 0, max: 100, step: 0.5, fmt: 'pct0' }),
      ].join('')));
    }

    if (clip.type === 'shape') {
      parts.push(group('Forma', [
        f('color', 'color', 'Color', clip.color),
        f('range', 'opacity', 'Transparencia', clip.opacity, { min: 0, max: 1, step: 0.01, fmt: 'pct' }),
        f('range', 'x', 'Centro: izquierda ↔ derecha', clip.x, { min: 0, max: 100, step: 0.5, fmt: 'pct0' }),
        f('range', 'y', 'Centro: arriba ↕ abajo', clip.y, { min: 0, max: 100, step: 0.5, fmt: 'pct0' }),
        f('range', 'w', 'Ancho', clip.w, { min: 1, max: 100, step: 0.5, fmt: 'pct0' }),
        f('range', 'h', 'Alto', clip.h, { min: 1, max: 100, step: 0.5, fmt: 'pct0' }),
      ].join('')));
    }

    body.innerHTML = `<form id="inspectorForm" autocomplete="off">${parts.join('')}</form>
      <div class="row end">
        <button type="button" id="inspDup" title="Copiar este clip">⧉ Duplicar</button>
        <button type="button" id="inspDel" class="danger" title="Quitar este clip">Quitar clip</button>
      </div>`;
  }

  function fmtRange(v, kind) {
    const n = Number(v);
    if (kind === 'pct') return `${Math.round(n * 100)}%`;
    if (kind === 'pct0') return `${Math.round(n)}%`;
    if (kind === 'x') return `${n.toFixed(2)}×`;
    return n.toFixed(2);
  }

  // Aplica el valor de un campo del inspector al clip seleccionado (sin historial todavía).
  function applyField(el) {
    const found = findClip(S.selected);
    if (!found) return;
    const { clip, track } = found;
    const key = el.dataset.key;
    let v;
    if (el.type === 'checkbox') v = el.checked;
    else if (el.type === 'number' || el.type === 'range') v = el.value === '' ? 0 : Number(el.value);
    else v = el.value;

    switch (key) {
      case 'transitionIn.type':
        clip.transitionIn = v === 'none' ? null : { type: v, dur: clip.transitionIn ? clip.transitionIn.dur : 0.5 };
        break;
      case 'transitionIn.dur':
        if (clip.transitionIn) clip.transitionIn.dur = v;
        break;
      case 'chromaOn':
        clip.chromaKey = v ? { color: '#00ff00', similarity: 0.2 } : null;
        break;
      case 'bgOn':
        clip.bg = v ? '#000000' : null;
        break;
      case 'chromaKey.color':
      case 'chromaKey.similarity':
        if (clip.chromaKey) setPath(clip, key, v);
        break;
      default:
        setPath(clip, key, v);
    }

    try {
      const normalized = VEModel.normalizeClip(clip, track.kind, mediaById);
      const idx = track.clips.findIndex((c) => c.id === clip.id);
      track.clips[idx] = normalized;
      sortTrack(track);
    } catch (err) {
      setStatus(err.message, true);
    }
  }

  function setPath(obj, path, value) {
    const keys = path.split('.');
    let o = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      if (o[keys[i]] == null) o[keys[i]] = {};
      o = o[keys[i]];
    }
    o[keys[keys.length - 1]] = value;
  }

  function bindInspector() {
    const body = $('inspectorBody');
    body.addEventListener('focusin', () => {
      if (findClip(S.selected)) S.gestureBefore = snap();
    });
    body.addEventListener('input', (e) => {
      if (!e.target.dataset || !e.target.dataset.key) return;
      applyField(e.target);
      if (e.target.type === 'range') {
        const out = e.target.closest('label').querySelector('.out');
        if (out) out.textContent = fmtRange(e.target.value, e.target.dataset.fmt);
      }
      scheduleTimeline();
      preview.sync(S.t, S.playing);
    });
    body.addEventListener('change', (e) => {
      if (!e.target.dataset || !e.target.dataset.key) return;
      applyField(e.target);
      const before = S.gestureBefore || snap();
      S.gestureBefore = null;
      finish(before, 'Propiedad cambiada');
    });
    body.addEventListener('click', (e) => {
      if (e.target.id === 'inspDup') duplicateSelected();
      if (e.target.id === 'inspDel') deleteSelected();
    });
  }

  // ---------- transporte y reproducción ----------

  function seek(t) {
    S.t = clamp(t, 0, Math.max(duration(), 0));
    preview.sync(S.t, false);
    updateTransport();
  }

  function updateTransport() {
    const total = duration();
    $('timecode').innerHTML = `${fmt(S.t)} <span>/ ${fmt(total)}</span>`;
    $('playBtn').textContent = S.playing ? '❚❚' : '▶';
    $('playBtn').setAttribute('aria-label', S.playing ? 'Pausar' : 'Reproducir');
    $('playBtn').title = S.playing ? 'Pausar (Espacio)' : 'Reproducir (Espacio)';
    $('welcome').hidden = total > 0;
    const ph = $('playhead');
    if (ph) ph.style.left = `${LABEL_W + S.t * S.pxPerSec}px`;
  }

  let lastTs = 0;
  function tick(ts) {
    if (!S.playing) return;
    const dt = Math.min(0.1, (ts - lastTs) / 1000);
    lastTs = ts;
    S.t += dt;
    const total = duration();
    if (S.t >= total) {
      S.t = total;
      S.playing = false;
      preview.sync(S.t, false);
      updateTransport();
      return;
    }
    preview.sync(S.t, true);
    updateTransport();
    requestAnimationFrame(tick);
  }

  function togglePlay() {
    if (S.playing) {
      S.playing = false;
      preview.sync(S.t, false);
      return updateTransport();
    }
    if (duration() <= 0) return setStatus('Añade clips para reproducir', true);
    if (S.t >= duration()) S.t = 0;
    S.playing = true;
    lastTs = performance.now();
    requestAnimationFrame(tick);
    updateTransport();
  }

  // ---------- proyectos y exportación ----------

  async function saveProject() {
    S.project.name = $('projectName').value.trim() || 'Proyecto sin título';
    try {
      const saved = S.project.id
        ? await api(`/api/projects/${S.project.id}`, jsonReq('PUT', S.project))
        : await api('/api/projects', jsonReq('POST', S.project));
      S.project = saved;
      setStatus(`Proyecto guardado (${fmtTime(saved.updatedAt)})`);
      saveDraft();
      renderAll();
    } catch (err) {
      setStatus(`No se pudo guardar: ${err.message}`, true);
    }
  }

  function fmtTime(iso) {
    const d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  }

  function jsonReq(method, body) {
    return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
  }

  async function openDialog() {
    const list = await api('/api/projects');
    $('projectList').innerHTML = list.length
      ? list.map((p) => `<li><button data-open="${p.id}" class="wide-btn">${esc(p.name)} <small class="muted">${esc(p.ratio)}</small></button></li>`).join('')
      : '<li class="muted">No hay proyectos guardados.</li>';
    $('openDialog').showModal();
  }

  async function openProject(id) {
    S.project = await api(`/api/projects/${id}`);
    S.undo = [];
    S.redo = [];
    S.selected = null;
    S.t = 0;
    $('openDialog').close();
    setStatus(`Abierto: ${S.project.name}`);
    renderAll();
  }

  async function exportProject() {
    if (duration() <= 0) return setStatus('No hay contenido para exportar', true);
    S.exporting = true;
    $('exportBtn').disabled = true;
    setStatus('Exportando… esto puede tardar según la duración');
    try {
      const body = await api('/api/export', jsonReq('POST', S.project));
      setStatus('');
      $('status').innerHTML = `Listo: <a href="${esc(body.url)}" download="${esc(S.project.name)}.mp4">Descargar MP4</a>`;
    } catch (err) {
      setStatus(`Error al exportar: ${err.message}`, true);
    } finally {
      S.exporting = false;
      $('exportBtn').disabled = duration() <= 0;
    }
  }

  // ---------- eventos ----------

  function bindEvents() {
    $('fileInput').addEventListener('change', (e) => { importFiles([...e.target.files]); e.target.value = ''; });
    $('mediaList').addEventListener('click', async (e) => {
      const add = e.target.dataset.addMedia;
      const del = e.target.dataset.delMedia;
      if (add) return addMedia(mediaById(add));
      if (del) {
        const m = mediaById(del);
        if (!confirm(`¿Borrar "${m.name}" de la biblioteca? Los clips que lo usan dejarán de funcionar.`)) return;
        await api(`/api/media/${del}`, { method: 'DELETE' });
        await loadMedia();
        renderAll();
      }
    });

    document.querySelectorAll('[data-add-track]').forEach((b) => b.addEventListener('click', () => {
      mutate(`Pista ${b.dataset.addTrack} añadida`, () => {
        const t = newTrack(b.dataset.addTrack, S.project.tracks);
        S.project.tracks.push(t);
        S.selectedTrack = t.id;
      });
    }));
    $('addTextBtn').addEventListener('click', addOverlayText);
    $('addShapeBtn').addEventListener('click', addShape);

    $('timelineInner').addEventListener('click', (e) => {
      const mute = e.target.dataset.mute;
      const del = e.target.dataset.delTrack;
      if (mute) {
        mutate('Pista silenciada', () => {
          const t = S.project.tracks.find((x) => x.id === mute);
          t.muted = !t.muted;
        });
      }
      if (del) {
        const t = S.project.tracks.find((x) => x.id === del);
        if (t.clips.length && !confirm(`¿Borrar la pista "${t.name}" y sus clips?`)) return;
        mutate('Pista eliminada', () => {
          S.project.tracks = S.project.tracks.filter((x) => x.id !== del);
          if (S.selectedTrack === del) S.selectedTrack = null;
          if (findClip(S.selected) === null) S.selected = null;
        });
      }
    });

    $('zoom').addEventListener('input', (e) => {
      S.pxPerSec = Number(e.target.value);
      renderTimeline();
      updateTransport();
    });

    $('playBtn').addEventListener('click', togglePlay);
    $('toStartBtn').addEventListener('click', () => { seek(0); renderTimeline(); });
    $('splitBtn').addEventListener('click', splitAtCursor);
    $('dupBtn').addEventListener('click', duplicateSelected);
    $('delBtn').addEventListener('click', deleteSelected);

    $('undoBtn').addEventListener('click', undo);
    $('redoBtn').addEventListener('click', redo);
    $('ratioSelect').addEventListener('change', (e) => mutate('Proporción cambiada', () => { S.project.ratio = e.target.value; }));
    $('projectName').addEventListener('change', (e) => mutate('Nombre cambiado', () => { S.project.name = e.target.value.trim() || 'Proyecto sin título'; }));

    $('newBtn').addEventListener('click', () => {
      if (S.project.tracks.some((t) => t.clips.length) && !confirm('¿Crear un proyecto nuevo? Los cambios no guardados se perderán.')) return;
      S.project = newProject();
      S.undo = [];
      S.redo = [];
      S.selected = null;
      S.t = 0;
      renderAll();
    });
    $('openBtn').addEventListener('click', () => openDialog().catch((err) => setStatus(err.message, true)));
    $('closeOpen').addEventListener('click', () => $('openDialog').close());
    $('projectList').addEventListener('click', (e) => {
      const id = e.target.closest('[data-open]');
      if (id) openProject(id.dataset.open);
    });
    $('saveBtn').addEventListener('click', saveProject);
    $('exportBtn').addEventListener('click', exportProject);

    bindInspector();

    window.addEventListener('keydown', (e) => {
      const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && document.activeElement.type !== 'range';
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); return undo(); }
      if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); return redo(); }
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); return saveProject(); }
      if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); return duplicateSelected(); }
      if (typing) return;
      if (e.key === ' ') { e.preventDefault(); togglePlay(); }
      else if (e.key === 's' || e.key === 'S') splitAtCursor();
      else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelected(); }
      else if (e.key === 'ArrowRight') seek(S.t + (e.shiftKey ? 1 : 0.1));
      else if (e.key === 'ArrowLeft') seek(S.t - (e.shiftKey ? 1 : 0.1));
      else if (e.key === 'Home') seek(0);
      else return;
      renderTimeline();
    });
  }

  // ---------- arranque ----------

  async function init() {
    S.project = newProject();
    try {
      const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
      if (draft && draft.tracks) S.project = draft;
    } catch (_) { /* sin borrador */ }
    bindEvents();
    try {
      await loadMedia();
    } catch (err) {
      setStatus(`No se pudo conectar con el servidor: ${err.message}`, true);
    }
    renderAll();
  }

  init();
})();
