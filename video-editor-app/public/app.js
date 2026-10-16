'use strict';

const PX_PER_SEC = 40;
const TEXT_DEFAULT_DURATION = 3;

const state = {
  media: [],        // medios disponibles en la biblioteca
  clips: [],        // { mediaId, start, end, name }
  texts: [],        // { text, start, end, position, size, color }
  selected: -1,     // índice del clip seleccionado
  playhead: 0,      // posición en la línea de tiempo final (s)
  playing: false,
};

const $ = (id) => document.getElementById(id);
const video = $('video');
let loadedMediaId = null;   // medio cargado actualmente en el <video>
let pendingSeek = null;     // posición local que hay que aplicar tras cargar

// ---------- utilidades ----------

function fmt(t) {
  const m = Math.floor(t / 60);
  const s = (t % 60).toFixed(1).padStart(4, '0');
  return `${String(m).padStart(2, '0')}:${s}`;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function setStatus(msg) { $('status').textContent = msg; }

function mediaById(id) { return state.media.find((m) => m.id === id); }

function clipDuration(c) { return c.end - c.start; }

// Inicio de cada clip en la línea de tiempo final.
function clipOffsets() {
  let acc = 0;
  return state.clips.map((c) => {
    const off = acc;
    acc += clipDuration(c);
    return off;
  });
}

function totalDuration() {
  return state.clips.reduce((sum, c) => sum + clipDuration(c), 0);
}

// Índice del clip que cubre el tiempo t (o -1).
function clipAt(t) {
  const offs = clipOffsets();
  for (let i = 0; i < state.clips.length; i++) {
    if (t >= offs[i] && t < offs[i] + clipDuration(state.clips[i])) return i;
  }
  return -1;
}

// ---------- biblioteca ----------

async function loadLibrary() {
  const res = await fetch('/api/media');
  state.media = await res.json();
  renderBin();
}

function renderBin() {
  const list = $('mediaList');
  if (state.media.length === 0) {
    list.innerHTML = '<li class="muted">Aún no hay videos.</li>';
    return;
  }
  list.innerHTML = state.media.map((m) => `
    <li>
      <span class="name" title="${esc(m.name)}">${esc(m.name)}<br><small class="muted">${fmt(m.duration)}</small></span>
      <button data-add="${m.id}">+ Añadir</button>
    </li>`).join('');
}

async function uploadFiles(files) {
  for (const file of files) {
    setStatus(`Subiendo ${file.name}…`);
    const res = await fetch(`/api/upload?name=${encodeURIComponent(file.name)}`, {
      method: 'POST', body: file,
    });
    const body = await res.json();
    if (!res.ok) {
      setStatus(`Error: ${body.error}`);
      return;
    }
  }
  await loadLibrary();
  setStatus('Listo');
}

function addClip(mediaId) {
  const m = mediaById(mediaId);
  if (!m) return;
  state.clips.push({ mediaId, start: 0, end: m.duration, name: m.name });
  state.selected = state.clips.length - 1;
  render();
}

// ---------- edición ----------

function splitAtPlayhead() {
  const t = state.playhead;
  const i = clipAt(t);
  if (i < 0) return setStatus('El cursor no está sobre un clip');
  const c = state.clips[i];
  const local = c.start + (t - clipOffsets()[i]);
  if (local - c.start < 0.1 || c.end - local < 0.1) {
    return setStatus('Mueve el cursor más lejos de los bordes para cortar');
  }
  const left = { ...c, end: local };
  const right = { ...c, start: local };
  state.clips.splice(i, 1, left, right);
  state.selected = i + 1;
  render();
}

function removeSelected() {
  if (state.selected < 0) return;
  state.clips.splice(state.selected, 1);
  state.selected = Math.min(state.selected, state.clips.length - 1);
  render();
}

function moveSelected(delta) {
  const j = state.selected + delta;
  if (state.selected < 0 || j < 0 || j >= state.clips.length) return;
  [state.clips[state.selected], state.clips[j]] = [state.clips[j], state.clips[state.selected]];
  state.selected = j;
  render();
}

function updateSelectedFromInputs() {
  const c = state.clips[state.selected];
  if (!c) return;
  const m = mediaById(c.mediaId);
  let start = Math.max(0, Number($('clipStart').value) || 0);
  let end = Math.min(m ? m.duration : Infinity, Number($('clipEnd').value) || 0);
  if (end - start < 0.1) {
    setStatus('El clip debe durar al menos 0.1 s');
    return renderInspector();
  }
  c.start = start;
  c.end = end;
  render();
}

function addTextAtPlayhead() {
  const text = $('textInput').value.trim();
  if (!text) return setStatus('Escribe el texto primero');
  const start = state.playhead;
  const end = Math.min(start + TEXT_DEFAULT_DURATION, Math.max(totalDuration(), start + 0.5));
  state.texts.push({ text, start, end, position: 'bottom', size: 48, color: '#ffffff' });
  $('textInput').value = '';
  render();
}

function removeText(i) {
  state.texts.splice(i, 1);
  render();
}

// ---------- vista previa ----------

// Muestra en el reproductor el frame correspondiente al tiempo t de la línea de tiempo.
function showAt(t, andPlay = false) {
  const total = totalDuration();
  state.playhead = Math.max(0, Math.min(t, total));
  const i = clipAt(state.playhead);
  if (i < 0) {
    video.pause();
    state.playing = false;
    updateTransport();
    return;
  }
  const c = state.clips[i];
  const local = c.start + (state.playhead - clipOffsets()[i]);
  if (c.mediaId !== loadedMediaId) {
    loadedMediaId = c.mediaId;
    pendingSeek = local;
    video.src = mediaById(c.mediaId).url;
  } else {
    video.currentTime = local;
  }
  if (andPlay) video.play().catch(() => {});
  updateTransport();
}

function updateTransport() {
  const total = totalDuration();
  const slider = $('playhead');
  slider.max = total || 0;
  slider.value = state.playhead;
  $('timecode').textContent = `${fmt(state.playhead)} / ${fmt(total)}`;
  $('playBtn').textContent = state.playing ? '❚❚ Pausa' : '▶ Reproducir';
}

video.addEventListener('loadedmetadata', () => {
  if (pendingSeek !== null) {
    video.currentTime = pendingSeek;
    pendingSeek = null;
  }
  if (state.playing) video.play().catch(() => {});
});

// Avanza la línea de tiempo mientras se reproduce y salta al siguiente clip al terminar.
video.addEventListener('timeupdate', () => {
  if (!state.playing) return;
  const i = clipAt(state.playhead);
  if (i < 0) return;
  const c = state.clips[i];
  const offs = clipOffsets();
  if (video.currentTime >= c.end - 0.03) {
    if (i + 1 < state.clips.length) {
      state.playhead = offs[i + 1];
      showAt(state.playhead, true);
    } else {
      state.playing = false;
      video.pause();
      state.playhead = totalDuration();
      updateTransport();
    }
    return;
  }
  state.playhead = offs[i] + (video.currentTime - c.start);
  updateTransport();
});

$('playBtn').addEventListener('click', () => {
  if (state.playing) {
    state.playing = false;
    video.pause();
    return updateTransport();
  }
  if (state.clips.length === 0) return setStatus('Añade clips a la línea de tiempo');
  if (state.playhead >= totalDuration()) state.playhead = 0;
  state.playing = true;
  showAt(state.playhead, true);
});

$('playhead').addEventListener('input', (e) => {
  state.playing = false;
  video.pause();
  showAt(Number(e.target.value));
});

// ---------- exportación ----------

async function exportProject() {
  if (state.clips.length === 0) return setStatus('No hay clips para exportar');
  const btn = $('exportBtn');
  btn.disabled = true;
  setStatus('Exportando… puede tardar según la duración');
  const project = {
    width: 1280, height: 720, fps: 30,
    clips: state.clips.map((c) => ({ mediaId: c.mediaId, start: c.start, end: c.end })),
    texts: state.texts,
  };
  try {
    const res = await fetch('/api/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(project),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error);
    setStatus('');
    $('status').innerHTML = `Listo: <a href="${esc(body.url)}" download>Descargar MP4</a>`;
  } catch (err) {
    setStatus(`Error al exportar: ${err.message}`);
  } finally {
    btn.disabled = false;
  }
}

// ---------- render ----------

function renderTimeline() {
  const offs = clipOffsets();
  const total = totalDuration();
  const width = Math.max(total, 10) * PX_PER_SEC + 40;
  const clipBlocks = state.clips.map((c, i) => `
    <div class="block ${i === state.selected ? 'selected' : ''}" data-clip="${i}"
         style="left:${offs[i] * PX_PER_SEC}px;width:${clipDuration(c) * PX_PER_SEC}px">
      ${esc(c.name)}<small>${fmt(clipDuration(c))}</small>
    </div>`).join('');
  const textBlocks = state.texts.map((t, i) => `
    <div class="block text" data-text="${i}"
         style="left:${t.start * PX_PER_SEC}px;width:${(t.end - t.start) * PX_PER_SEC}px"
         title="${esc(t.text)}">${esc(t.text)}</div>`).join('');

  $('tracks').innerHTML = `
    <div class="track">
      <div class="track-label">Video</div>
      <div class="track-body" style="width:${width}px">
        ${clipBlocks || '<span class="empty-track">Añade videos desde la biblioteca</span>'}
      </div>
    </div>
    <div class="track">
      <div class="track-label">Texto</div>
      <div class="track-body" style="width:${width}px">${textBlocks}</div>
    </div>
    <div class="track">
      <div class="track-label"></div>
      <div class="track-body" style="width:${width}px;background:none">
        <div style="position:absolute;top:0;bottom:0;width:2px;background:#ff5d8f;left:${state.playhead * PX_PER_SEC}px"></div>
      </div>
    </div>`;
}

function renderInspector() {
  const c = state.clips[state.selected];
  $('clipControls').hidden = !c;
  $('clipInfo').hidden = !!c;
  if (!c) return;
  $('clipInfo').textContent = '';
  $('clipInfo').className = '';
  const m = mediaById(c.mediaId);
  $('clipInfo').innerHTML = `<div class="name">${esc(c.name)}</div>`;
  $('clipStart').value = c.start.toFixed(1);
  $('clipEnd').value = c.end.toFixed(1);
  $('clipStart').max = c.end;
  $('clipEnd').max = m ? m.duration : undefined;
}

function renderTexts() {
  const list = $('textList');
  list.innerHTML = state.texts.map((t, i) => `
    <li>
      <span class="name">${esc(t.text)}<br><small class="muted">${fmt(t.start)} → ${fmt(t.end)}</small></span>
      <button data-remove-text="${i}">✕</button>
    </li>`).join('') || '<li class="muted">Sin textos.</li>';
}

function render() {
  renderBin();
  renderTimeline();
  renderInspector();
  renderTexts();
  updateTransport();
  $('exportBtn').disabled = state.clips.length === 0;
}

// ---------- eventos ----------

$('fileInput').addEventListener('change', (e) => uploadFiles(e.target.files));
$('mediaList').addEventListener('click', (e) => {
  const id = e.target.dataset.add;
  if (id) addClip(id);
});
$('tracks').addEventListener('click', (e) => {
  const clip = e.target.closest('[data-clip]');
  if (clip) {
    state.selected = Number(clip.dataset.clip);
    const offs = clipOffsets();
    state.playing = false;
    video.pause();
    showAt(offs[state.selected]);
    return render();
  }
  const text = e.target.closest('[data-text]');
  if (text) {
    const t = state.texts[Number(text.dataset.text)];
    state.playing = false;
    video.pause();
    showAt(t.start);
    setStatus(`Texto: ${t.text}`);
  }
});
$('textList').addEventListener('click', (e) => {
  const i = e.target.dataset.removeText;
  if (i !== undefined) removeText(Number(i));
});
$('splitBtn').addEventListener('click', splitAtPlayhead);
$('deleteClip').addEventListener('click', removeSelected);
$('moveLeft').addEventListener('click', () => moveSelected(-1));
$('moveRight').addEventListener('click', () => moveSelected(1));
$('clipStart').addEventListener('change', updateSelectedFromInputs);
$('clipEnd').addEventListener('change', updateSelectedFromInputs);
$('addText').addEventListener('click', addTextAtPlayhead);
$('textInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') addTextAtPlayhead(); });
$('exportBtn').addEventListener('click', exportProject);

loadLibrary().then(render);
