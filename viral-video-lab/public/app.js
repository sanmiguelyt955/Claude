const state = {
  mode: 'viral', // 'viral' | 'aprendizaje' - qué sección de la biblioteca/flujo se muestra
  videos: [],
  currentId: null,
  currentCategory: 'viral',
  currentDuration: 0,
  patterns: null,
  lastFrames: null,
  justDragged: false,
};

const SEG_COLORS = { hook: 'var(--seg-hook)', demo: 'var(--seg-demo)', climax: 'var(--seg-climax)', cta: 'var(--seg-cta)' };
const RULE_META = {
  hook: { icon: '⏱️', label: 'Hook' },
  climax: { icon: '🎯', label: 'Climax' },
  cambio_estado: { icon: '🔄', label: 'Cambio de estado' },
  audio_sync: { icon: '🔇', label: 'Audio en climax' },
  cta: { icon: '📣', label: 'CTA' },
};
const NOTE_TYPE_META = {
  tecnica: { icon: '🛠️', label: 'Técnica' },
  paso: { icon: '🔢', label: 'Paso' },
  herramienta: { icon: '🧰', label: 'Herramienta' },
  cita: { icon: '💬', label: 'Cita' },
  advertencia: { icon: '⚠️', label: 'Advertencia' },
  otro: { icon: '✨', label: 'Otro' },
};

function colorForSeg(nombre) {
  return SEG_COLORS[(nombre || '').toLowerCase()] || 'var(--seg-other)';
}

async function api(path, opts) {
  const res = await fetch(`/api${path}`, {
    headers: opts?.body && !(opts.body instanceof FormData) ? { 'Content-Type': 'application/json' } : undefined,
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

function formatBytes(bytes) {
  if (!bytes) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(1)} ${units[i]}`;
}

function formatDuration(seconds) {
  if (!seconds && seconds !== 0) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

// ---------- Modo: Ganadores vs Aprendizaje ----------

const MODE_COPY = {
  viral: {
    scanLabel: '🔎 Escanear carpeta de ganadores',
    desc: 'Clips cortos para clonar su estructura viral (hook/climax/CTA).',
    emptyTitle: 'Videos Ganadores — empieza en 3 pasos',
    emptySteps: [
      ['1. Elige un video', 'escanea tu carpeta, pega una ruta, arrástralo o descríbelo (Modo B).'],
      ['2. Analízalo', 'extrae miniaturas, cortes de escena y silencios automáticamente.'],
      ['3. Marca hook / climax / CTA', 'en la línea de tiempo y valida contra el algoritmo viral.'],
    ],
    analisisHint: '🧪 ffmpeg extrae candidatos de cambio de escena, silencios (para la regla de audio en el climax) y una tira de miniaturas con foco denso en los primeros 15s — todo por streaming, sin cargar el video completo en memoria.',
  },
  aprendizaje: {
    scanLabel: '🔎 Escanear carpeta de aprendizaje',
    desc: 'Videos largos de YouTube para extraer técnicas y lecciones.',
    emptyTitle: 'Videos de Aprendizaje — empieza en 3 pasos',
    emptySteps: [
      ['1. Elige un video educativo', 'escanea tu carpeta, pega una ruta, arrástralo o descríbelo.'],
      ['2. Analízalo', 'ffmpeg ubica cambios de escena/pantalla como posibles capítulos, repartidos en todo el video.'],
      ['3. Anota lo valioso', 'técnicas, pasos, herramientas o citas con su timestamp, y pide mejoras de skill con eso.'],
    ],
    analisisHint: '🧪 ffmpeg ubica cambios de escena/pantalla (posibles capítulos) y genera una tira de miniaturas distribuida en todo el video — todo por streaming, sin cargar el archivo completo en memoria.',
  },
};

function renderEmptyState() {
  const copy = MODE_COPY[state.mode];
  document.getElementById('empty-title').textContent = copy.emptyTitle;
  document.getElementById('empty-steps').innerHTML = copy.emptySteps
    .map(([t, d]) => `<li><strong>${t}</strong> — ${d}</li>`)
    .join('');
}

function updateModeUI() {
  const copy = MODE_COPY[state.mode];
  document.getElementById('btn-scan').textContent = copy.scanLabel;
  document.getElementById('mode-desc').textContent = copy.desc;
  renderEmptyState();
}

function applyModeToStepper(category) {
  document.querySelectorAll('.step-btn[data-mode]').forEach((b) => {
    b.hidden = b.dataset.mode !== category;
  });
}

function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll('.mode-btn').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
  updateModeUI();
  renderVideoList();
  const current = state.videos.find((v) => v.id === state.currentId);
  if (!current || (current.category || 'viral') !== mode) {
    state.currentId = null;
    document.getElementById('video-view').hidden = true;
    document.getElementById('empty-state').hidden = false;
  }
}
document.querySelectorAll('.mode-btn').forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));

// ---------- Biblioteca ----------

async function loadVideos() {
  state.videos = await api('/videos');
  renderVideoList();
}

function statusPills(v) {
  const s = v.status || {};
  const pills = [];
  pills.push(s.hasFrames ? '<span class="pill ok">🔬 analizado</span>' : '<span class="pill">sin analizar</span>');
  if ((v.category || 'viral') === 'viral') {
    if (s.hasStructure) pills.push('<span class="pill ok">✂️ estructura</span>');
    if (s.veredicto === 'VIRAL_COMPLIANT') pills.push('<span class="pill ok">✅ compliant</span>');
    else if (s.veredicto === 'NO_CUMPLE') pills.push('<span class="pill fail">❌ no cumple</span>');
    else if (s.veredicto === 'INCOMPLETO') pills.push('<span class="pill warn">⚠️ incompleto</span>');
  } else if (s.hasLessons) {
    pills.push('<span class="pill ok">📓 con notas</span>');
  }
  return pills.join('');
}

function renderVideoList() {
  const ul = document.getElementById('video-list');
  ul.innerHTML = '';
  const filtered = state.videos.filter((v) => (v.category || 'viral') === state.mode);
  for (const v of filtered) {
    const li = document.createElement('li');
    li.className = v.id === state.currentId ? 'active' : '';
    li.innerHTML = `
      <div class="card-top">
        <span class="name" title="${v.filename}">${v.source === 'manual' ? '✍️' : '🎬'} ${v.filename}</span>
        <span class="size">${formatBytes(v.sizeBytes)}</span>
      </div>
      <div class="card-bottom">${statusPills(v)}</div>`;
    li.onclick = () => selectVideo(v.id);
    ul.appendChild(li);
  }
}

function setStepDone(step, done) {
  const btn = document.querySelector(`.step-btn[data-step="${step}"]`);
  if (btn) btn.classList.toggle('done', !!done);
}

async function selectVideo(id) {
  state.currentId = id;
  state.lastFrames = null;
  renderVideoList();
  document.getElementById('empty-state').hidden = true;
  document.getElementById('video-view').hidden = false;

  const video = await api(`/videos/${id}`);
  const listEntry = state.videos.find((v) => v.id === id);
  const category = video.category || 'viral';
  state.currentCategory = category;
  document.getElementById('video-title').textContent = video.filename;

  const p = video.probe || {};
  state.currentDuration = p.duration || 0;
  const badges = [`<span class="badge-pill">⏱ ${formatDuration(p.duration)}</span>`, `<span class="badge-pill">💾 ${formatBytes(video.sizeBytes)}</span>`];
  if (p.width) badges.push(`<span class="badge-pill">🖥 ${p.width}×${p.height}</span>`);
  if (video.source === 'manual') badges.push('<span class="badge-pill">✍️ Modo B — sin archivo</span>');
  badges.push(category === 'viral' ? '<span class="badge-pill">🏆 Ganador</span>' : '<span class="badge-pill">🎓 Aprendizaje</span>');
  document.getElementById('video-badges').innerHTML = badges.join('');

  applyModeToStepper(category);
  setStepDone(2, listEntry?.status?.hasFrames);
  setStepDone(3, category === 'viral' ? listEntry?.status?.hasStructure : listEntry?.status?.hasLessons);
  setStepDone(4, listEntry?.status?.hasReport);

  document.getElementById('analisis-hint').textContent = MODE_COPY[category].analisisHint;

  const player = document.getElementById('player');
  if (video.path) {
    player.src = `/api/videos/${id}/stream`;
    player.hidden = false;
  } else {
    player.removeAttribute('src');
    player.hidden = true;
  }

  document.getElementById('duracion-total').value = p.duration || '';
  document.getElementById('analysis-timeline-wrap').hidden = true;
  document.getElementById('frames-view').innerHTML = '';
  document.getElementById('validation-result').innerHTML = '';
  document.getElementById('pattern-result').innerHTML = '';
  document.getElementById('lessons-prompt').value = '';
  document.getElementById('lessons-summary').innerHTML = '';

  if (category === 'viral') {
    await loadStructureIntoForm(id);
  } else {
    await loadLessonsIntoForm(id);
  }
  await tryLoadFrames(id);
  switchTab('reproductor');
}

document.getElementById('btn-scan').onclick = async () => {
  const btn = document.getElementById('btn-scan');
  btn.disabled = true;
  btn.textContent = '⏳ Escaneando...';
  try {
    const r = await api('/videos/scan', { method: 'POST', body: JSON.stringify({ category: state.mode }) });
    await loadVideos();
    alert(`Encontrados/registrados: ${r.found} video(s) en ${r.folder}`);
  } catch (e) {
    alert(e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = MODE_COPY[state.mode].scanLabel;
  }
};

document.getElementById('btn-register').onclick = async () => {
  const input = document.getElementById('input-path');
  if (!input.value.trim()) return;
  try {
    await api('/videos/register', { method: 'POST', body: JSON.stringify({ path: input.value.trim(), category: state.mode }) });
    input.value = '';
    await loadVideos();
  } catch (e) {
    alert(e.message);
  }
};

document.getElementById('btn-manual').onclick = async () => {
  const nombre = document.getElementById('manual-nombre').value.trim();
  const duracion = Number(document.getElementById('manual-duracion').value);
  if (!nombre || !duracion) return alert('Nombre y duración son obligatorios.');
  try {
    const v = await api('/videos/manual', { method: 'POST', body: JSON.stringify({ nombre, duracion_segundos: duracion, category: state.mode }) });
    document.getElementById('manual-nombre').value = '';
    document.getElementById('manual-duracion').value = '';
    await loadVideos();
    selectVideo(v.id);
  } catch (e) {
    alert(e.message);
  }
};

async function uploadFile(file) {
  const fd = new FormData();
  fd.append('video', file);
  const dropzone = document.getElementById('dropzone');
  const original = dropzone.innerHTML;
  dropzone.innerHTML = `<span class="dropzone-icon">⏳</span><span>Subiendo ${file.name}...<br /><small>puede tardar en archivos grandes, no cierres la pestaña</small></span>`;
  try {
    const v = await api(`/videos/upload?category=${state.mode}`, { method: 'POST', body: fd });
    await loadVideos();
    selectVideo(v.id);
  } catch (e) {
    alert(e.message);
  } finally {
    dropzone.innerHTML = original;
  }
}

const dropzone = document.getElementById('dropzone');
dropzone.onclick = () => document.getElementById('file-input').click();
document.getElementById('file-input').onchange = (e) => {
  if (e.target.files[0]) uploadFile(e.target.files[0]);
};
dropzone.ondragover = (e) => {
  e.preventDefault();
  dropzone.classList.add('dragover');
};
dropzone.ondragleave = () => dropzone.classList.remove('dragover');
dropzone.ondrop = (e) => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
  if (e.dataTransfer.files[0]) uploadFile(e.dataTransfer.files[0]);
};

// ---------- Tabs / stepper ----------

function switchTab(name) {
  document.querySelectorAll('.step-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-content').forEach((c) => c.classList.toggle('active', c.id === `tab-${name}`));
  if (name === 'guion') loadPatternsIntoSelect();
  if (name === 'estructura') renderStructureTimeline();
  if (name === 'notas') renderNotasTimeline();
  if (name === 'aplicar') renderLessonsSummary();
}
document.querySelectorAll('.step-btn').forEach((b) => (b.onclick = () => switchTab(b.dataset.tab)));

// ---------- Línea de tiempo interactiva ----------

function seekTo(t) {
  const player = document.getElementById('player');
  if (player && !player.hidden && player.src) {
    player.currentTime = Math.max(0, t);
  }
}

function renderTimeline(containerId, opts) {
  const { duration, segments = [], sceneChanges = [], silenceIntervals = [], noteMarkers = [], editable = false, showHookZone = false } = opts;
  const el = document.getElementById(containerId);
  if (!el) return;
  el.dataset.duration = duration || 0;
  el.innerHTML = '';

  if (!duration || duration <= 0) {
    el.innerHTML = '<div class="hint" style="padding:26px;">Sin duración todavía — indícala arriba.</div>';
    return;
  }

  if (showHookZone) {
    const hz = document.createElement('div');
    hz.className = 'tl-hookzone';
    hz.style.width = `${Math.min(100, (15 / duration) * 100)}%`;
    el.appendChild(hz);
  }

  sceneChanges.forEach((t) => {
    const tick = document.createElement('div');
    tick.className = 'tl-tick';
    tick.style.left = `${(t / duration) * 100}%`;
    tick.title = `corte de escena candidato: ${t.toFixed(2)}s (clic para saltar ahí)`;
    tick.onclick = (e) => {
      e.stopPropagation();
      seekTo(t);
    };
    el.appendChild(tick);
  });

  silenceIntervals.forEach((s) => {
    const tick = document.createElement('div');
    tick.className = 'tl-tick silence';
    tick.style.left = `${(s.start / duration) * 100}%`;
    tick.title = `silencio: ${s.start.toFixed(2)}–${s.end.toFixed(2)}s`;
    tick.onclick = (e) => {
      e.stopPropagation();
      seekTo(s.start);
    };
    el.appendChild(tick);
  });

  noteMarkers.forEach((n) => {
    if (n.t == null || Number.isNaN(n.t)) return;
    const tick = document.createElement('div');
    tick.className = 'tl-tick note';
    tick.style.left = `${(n.t / duration) * 100}%`;
    tick.title = `📓 ${n.titulo || 'nota'} (${n.t}s)`;
    tick.onclick = (e) => {
      e.stopPropagation();
      seekTo(n.t);
    };
    el.appendChild(tick);
  });

  segments.forEach((seg, idx) => {
    if (!(seg.fin > seg.inicio)) return;
    const block = document.createElement('div');
    block.className = 'tl-segment';
    const leftPct = Math.max(0, Math.min(100, (seg.inicio / duration) * 100));
    const widthPct = Math.max(0.4, Math.min(100 - leftPct, ((seg.fin - seg.inicio) / duration) * 100));
    block.style.left = `${leftPct}%`;
    block.style.width = `${widthPct}%`;
    block.style.background = colorForSeg(seg.nombre);
    block.title = `${seg.nombre}: ${seg.inicio}s–${seg.fin}s`;
    block.innerHTML = `<span class="tl-label">${seg.nombre || '—'}</span>`;
    block.onclick = (e) => {
      e.stopPropagation();
      seekTo(seg.inicio);
    };
    if (editable) {
      const left = document.createElement('div');
      left.className = 'tl-handle left';
      left.onmousedown = (e) => startDrag(e, idx, 'inicio');
      const right = document.createElement('div');
      right.className = 'tl-handle right';
      right.onmousedown = (e) => startDrag(e, idx, 'fin');
      block.appendChild(left);
      block.appendChild(right);
    }
    el.appendChild(block);
  });

  const playhead = document.createElement('div');
  playhead.className = 'tl-playhead';
  playhead.id = `${containerId}-playhead`;
  playhead.style.display = 'none';
  el.appendChild(playhead);

  if (!el.dataset.clickBound) {
    el.addEventListener('click', (e) => {
      if (state.justDragged) {
        state.justDragged = false;
        return;
      }
      const rect = el.getBoundingClientRect();
      const t = ((e.clientX - rect.left) / rect.width) * Number(el.dataset.duration);
      seekTo(t);
    });
    el.dataset.clickBound = '1';
  }

  updatePlayheads();
}

function updatePlayheads() {
  const player = document.getElementById('player');
  if (!player || !player.duration) return;
  const pct = (player.currentTime / player.duration) * 100;
  ['analysis-timeline-playhead', 'structure-timeline-playhead'].forEach((id) => {
    const ph = document.getElementById(id);
    if (ph) {
      ph.style.display = 'block';
      ph.style.left = `${pct}%`;
    }
  });
}
document.getElementById('player').addEventListener('timeupdate', updatePlayheads);

function startDrag(e, idx, field) {
  e.preventDefault();
  e.stopPropagation();
  const el = document.getElementById('structure-timeline');
  const rect = el.getBoundingClientRect();
  const duration = Number(el.dataset.duration);

  function onMove(ev) {
    const t = Math.max(0, Math.min(duration, ((ev.clientX - rect.left) / rect.width) * duration));
    writeSegmentTimeToTable(idx, field, t);
    renderStructureTimeline();
  }
  function onUp() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    state.justDragged = true;
    setTimeout(() => (state.justDragged = false), 60);
  }
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

function writeSegmentTimeToTable(idx, field, value) {
  const tr = document.querySelectorAll('#segments-body tr')[idx];
  if (!tr) return;
  const input = tr.querySelector(field === 'inicio' ? '.seg-inicio' : '.seg-fin');
  input.value = Math.round(value * 100) / 100;
}

function getSegmentsFromTable() {
  return Array.from(document.querySelectorAll('#segments-body tr')).map((tr) => ({
    nombre: tr.querySelector('.seg-nombre').value.trim(),
    inicio: Number(tr.querySelector('.seg-inicio').value) || 0,
    fin: Number(tr.querySelector('.seg-fin').value) || 0,
  }));
}

function renderStructureTimeline() {
  const duration = Number(document.getElementById('duracion-total').value) || 0;
  renderTimeline('structure-timeline', {
    duration,
    segments: getSegmentsFromTable(),
    editable: true,
    showHookZone: true,
    sceneChanges: state.lastFrames?.scene_changes || [],
    silenceIntervals: state.lastFrames?.silence_intervals || [],
  });
}
document.getElementById('duracion-total').addEventListener('input', renderStructureTimeline);

// ---------- Análisis ----------

document.getElementById('btn-analyze').onclick = async () => {
  const id = state.currentId;
  if (!id) return;
  const video = state.videos.find((v) => v.id === id);
  if (!video?.path) return alert('Este video es una entrada Modo B (sin archivo) — no hay nada que analizar con ffmpeg. Llena la estructura directamente.');

  const { jobId } = await api(`/videos/${id}/analyze`, { method: 'POST' });
  void jobId;
  const progressBox = document.getElementById('analyze-progress');
  progressBox.hidden = false;
  document.getElementById('btn-analyze').disabled = true;

  const poll = setInterval(async () => {
    const job = await api(`/videos/${id}/analyze/status`);
    const pct = Math.round((job.progress || 0) * 100);
    document.getElementById('progress-fill').style.width = `${pct}%`;
    document.getElementById('progress-label').textContent = `${pct}% (${job.status})`;
    if (job.status === 'done') {
      clearInterval(poll);
      document.getElementById('btn-analyze').disabled = false;
      setStepDone(2, true);
      await tryLoadFrames(id);
    } else if (job.status === 'error') {
      clearInterval(poll);
      document.getElementById('btn-analyze').disabled = false;
      alert(`Falló el análisis: ${job.error}`);
    }
  }, 1200);
};

async function tryLoadFrames(id) {
  try {
    const frames = await api(`/videos/${id}/frames`);
    state.lastFrames = frames;
    renderFrames(frames);
    document.getElementById('analysis-timeline-wrap').hidden = false;
    renderTimeline('analysis-timeline', {
      duration: frames.duration,
      segments: [],
      editable: false,
      showHookZone: state.currentCategory === 'viral',
      sceneChanges: frames.scene_changes,
      silenceIntervals: frames.silence_intervals,
    });
    if (state.currentCategory === 'viral') renderStructureTimeline();
    else renderNotasTimeline();
  } catch {
    document.getElementById('frames-view').innerHTML = '<p class="hint">Este video todavía no ha sido analizado. Dale clic a "Analizar video".</p>';
    document.getElementById('analysis-timeline-wrap').hidden = true;
  }
}

function renderFrames(frames) {
  const el = document.getElementById('frames-view');
  const strip = `<div class="frames-strip">${frames.thumbnails
    .map((t) => `<figure><img loading="lazy" src="${t.url}" data-t="${t.t}" title="clic para saltar a ${t.t}s" /><figcaption>${t.t}s</figcaption></figure>`)
    .join('')}</div>`;
  el.innerHTML = `<h3 style="font-size:13px;color:var(--muted);margin:16px 0 8px;">🖼️ Miniaturas (clic para saltar el reproductor)</h3>${strip}`;
  el.querySelectorAll('.frames-strip img').forEach((img) => {
    img.onclick = () => seekTo(Number(img.dataset.t));
  });
}

// ---------- Estructura ----------

if (!document.getElementById('segment-names')) {
  const dl = document.createElement('datalist');
  dl.id = 'segment-names';
  dl.innerHTML = '<option value="hook"><option value="demo"><option value="climax"><option value="cta">';
  document.body.appendChild(dl);
}

function addSegmentRow(seg = { nombre: '', inicio: '', fin: '', contenido: '', audio: '' }) {
  const tbody = document.getElementById('segments-body');
  const tr = document.createElement('tr');
  tr.className = 'seg-row';
  tr.innerHTML = `
    <td><span class="seg-swatch" style="background:${colorForSeg(seg.nombre)}"></span><input list="segment-names" value="${seg.nombre}" class="seg-nombre" placeholder="hook / demo / climax / cta" /></td>
    <td><input type="number" step="0.01" value="${seg.inicio}" class="seg-inicio" /></td>
    <td><input type="number" step="0.01" value="${seg.fin}" class="seg-fin" /></td>
    <td><input type="text" value="${seg.contenido || ''}" class="seg-contenido" /></td>
    <td><input type="text" value="${seg.audio || ''}" class="seg-audio" /></td>
    <td><div class="row-actions">
      <button type="button" class="btn-set-start" title="Fijar INICIO = tiempo actual del reproductor">⏱️I</button>
      <button type="button" class="btn-set-end" title="Fijar FIN = tiempo actual del reproductor">⏱️F</button>
      <button type="button" class="btn-remove-row" title="Eliminar segmento">✕</button>
    </div></td>`;

  const swatch = tr.querySelector('.seg-swatch');
  const nombreInput = tr.querySelector('.seg-nombre');
  const rerender = () => {
    swatch.style.background = colorForSeg(nombreInput.value);
    renderStructureTimeline();
  };
  ['seg-nombre', 'seg-inicio', 'seg-fin'].forEach((cls) => tr.querySelector(`.${cls}`).addEventListener('input', rerender));

  tr.querySelector('.btn-set-start').onclick = () => {
    const player = document.getElementById('player');
    if (player && !Number.isNaN(player.currentTime)) {
      tr.querySelector('.seg-inicio').value = Math.round(player.currentTime * 100) / 100;
      renderStructureTimeline();
    }
  };
  tr.querySelector('.btn-set-end').onclick = () => {
    const player = document.getElementById('player');
    if (player && !Number.isNaN(player.currentTime)) {
      tr.querySelector('.seg-fin').value = Math.round(player.currentTime * 100) / 100;
      renderStructureTimeline();
    }
  };
  tr.querySelector('.btn-remove-row').onclick = () => {
    tr.remove();
    renderStructureTimeline();
  };

  tbody.appendChild(tr);
}

document.getElementById('btn-add-segment').onclick = () => addSegmentRow();

async function loadStructureIntoForm(id) {
  document.getElementById('segments-body').innerHTML = '';
  try {
    const s = await api(`/videos/${id}/structure`);
    document.getElementById('tipo-contenido').value = s.tipo_contenido || 'producto';
    document.getElementById('duracion-total').value = s.duracion_segundos || '';
    document.getElementById('cambio-estado-presente').checked = !!s.cambio_estado?.presente;
    document.getElementById('cambio-estado-desc').value = s.cambio_estado?.descripcion || '';
    (s.segments || []).forEach((seg) => addSegmentRow(seg));
  } catch {
    ['hook', 'demo', 'climax', 'cta'].forEach((nombre) => addSegmentRow({ nombre, inicio: '', fin: '' }));
  }
  renderStructureTimeline();
}

function collectStructure() {
  return {
    tipo_contenido: document.getElementById('tipo-contenido').value,
    duracion_segundos: Number(document.getElementById('duracion-total').value),
    segments: Array.from(document.querySelectorAll('#segments-body tr')).map((tr) => ({
      nombre: tr.querySelector('.seg-nombre').value.trim(),
      inicio: Number(tr.querySelector('.seg-inicio').value),
      fin: Number(tr.querySelector('.seg-fin').value),
      contenido: tr.querySelector('.seg-contenido').value.trim(),
      audio: tr.querySelector('.seg-audio').value.trim(),
    })),
    cambio_estado: {
      presente: document.getElementById('cambio-estado-presente').checked,
      descripcion: document.getElementById('cambio-estado-desc').value.trim(),
    },
  };
}

document.getElementById('btn-save-structure').onclick = async () => {
  const id = state.currentId;
  if (!id) return;
  try {
    await api(`/videos/${id}/structure`, { method: 'PUT', body: JSON.stringify(collectStructure()) });
    setStepDone(3, true);
    const entry = state.videos.find((v) => v.id === id);
    if (entry) entry.status = { ...(entry.status || {}), hasStructure: true };
    renderVideoList();
    switchTab('validacion');
  } catch (e) {
    alert(e.message);
  }
};

document.getElementById('btn-copy-manifest').onclick = async () => {
  const id = state.currentId;
  const video = state.videos.find((v) => v.id === id);
  let frameSummary = 'Todavía no se ha corrido el análisis ffmpeg (pestaña Análisis) para este video.';
  try {
    const frames = await api(`/videos/${id}/frames`);
    frameSummary = `Duración: ${frames.duration}s. Miniaturas en data/library/${id}/thumbs/ (${frames.thumbnails.length} imágenes, con foco denso en los primeros 15s para el hook). Cortes de escena candidatos (s): ${frames.scene_changes.map((t) => t.toFixed(2)).join(', ') || 'ninguno'}. Silencios (s): ${frames.silence_intervals.map((s) => `${s.start.toFixed(2)}-${s.end.toFixed(2)}`).join(', ') || 'ninguno'}.`;
  } catch {
    /* sin analizar todavía */
  }
  const text = `Usa el agente-lider (video-analyzer, Modo A) para analizar este video ya preprocesado por Viral Video Lab:

Archivo: ${video?.path || '(Modo B, sin archivo)'}
Carpeta de trabajo: data/library/${id}/ (dentro de viral-video-lab)
${frameSummary}

Mira las miniaturas relevantes (sobre todo alrededor de los cortes de escena y silencios listados) y dame la estructura hook/demo/climax/cta con segundos exactos. Cuando la tengas, dime los valores para que los guarde en la pestaña Estructura de la app.`;
  await navigator.clipboard.writeText(text);
  alert('Copiado. Pégalo en el chat con Claude Code.');
};

// ---------- Validación ----------

document.getElementById('btn-validate').onclick = async () => {
  const id = state.currentId;
  try {
    const v = await api(`/videos/${id}/validate`, { method: 'POST' });
    renderValidation(v);
    setStepDone(4, true);
    const entry = state.videos.find((vi) => vi.id === id);
    if (entry) entry.status = { ...(entry.status || {}), hasReport: true, veredicto: v.veredicto_global };
    renderVideoList();
  } catch (e) {
    alert(e.message);
  }
};

function renderValidation(v) {
  const rows = ['hook', 'climax', 'cambio_estado', 'audio_sync', 'cta'];
  const passCount = rows.filter((k) => v[k].verdict === 'PASS').length;
  const pct = Math.round((passCount / 5) * 100);
  const ringColor = v.veredicto_global === 'VIRAL_COMPLIANT' ? 'var(--accent)' : v.veredicto_global === 'NO_CUMPLE' ? 'var(--fail)' : 'var(--warn)';
  const globalLabel = {
    VIRAL_COMPLIANT: '✅ Viral compliant',
    NO_CUMPLE: `❌ No cumple (${v.fails} de 5 fallan)`,
    INCOMPLETO: `⚠️ Incompleto (${v.incompletos} sin determinar)`,
  }[v.veredicto_global];

  const summary = `
    <div class="summary-ring">
      <div class="ring" style="--ring-color:${ringColor}; --ring-pct:${pct};"><div class="ring-inner">${passCount}/5</div></div>
      <div class="summary-text"><h3>${globalLabel}</h3><p>Reglas fijas del algoritmo viral (hook por duración, climax por %, cambio de estado, audio en el climax, CTA en el último 30%).</p></div>
    </div>`;

  const cards = rows
    .map((k) => {
      const r = v[k];
      const meta = RULE_META[k];
      const icon = r.verdict === 'PASS' ? '✅' : r.verdict === 'FAIL' ? '❌' : '⚠️';
      return `<div class="verdict-card ${r.verdict}"><div class="vc-icon">${meta.icon}</div><div class="vc-body"><h3>${meta.label} <span class="badge ${r.verdict}">${icon} ${r.verdict}</span></h3><p>${r.razon}</p></div></div>`;
    })
    .join('');

  document.getElementById('validation-result').innerHTML = summary + cards;
}

document.getElementById('btn-match').onclick = async () => {
  const id = state.currentId;
  try {
    const m = await api(`/videos/${id}/pattern-match`);
    renderPatternMatch(m);
  } catch (e) {
    alert(e.message);
  }
};

function renderPatternMatch(m) {
  const el = document.getElementById('pattern-result');
  if (!m.ranking.length) {
    el.innerHTML = '<p class="hint">No hay patrones en PATTERN_LIBRARY.json para comparar, o falta guardar hook/climax en la estructura.</p>';
    return;
  }
  const simColor = (s) => (s === 'alta' ? 'var(--accent)' : s === 'media' ? 'var(--warn)' : 'var(--fail)');
  const simPct = (s) => (s === 'alta' ? 90 : s === 'media' ? 55 : 25);
  const header = `<div class="summary-ring" style="padding:14px 20px;"><div class="summary-text" style="width:100%"><h3 style="margin:0;">${m.es_patron_nuevo ? '🆕 Posible patrón nuevo — ningún match de alta similitud' : `🏆 Patrón más cercano: ${m.patron_mas_cercano.nombre}`}</h3></div></div>`;
  const cards = m.ranking
    .map(
      (p, i) => `
    <div class="pattern-card ${i === 0 && !m.es_patron_nuevo ? 'top' : ''}">
      <h3>${p.nombre} <span class="badge" style="background:${simColor(p.similitud)}22;color:${simColor(p.similitud)}">${p.similitud}</span></h3>
      <div class="sim-bar-track"><div class="sim-bar-fill" style="width:${simPct(p.similitud)}%;background:${simColor(p.similitud)}"></div></div>
      <p>✔️ <strong>Coincide:</strong> ${p.coincidencias.join('; ') || '—'}</p>
      <p>✖️ <strong>Difiere:</strong> ${p.diferencias.join('; ') || '—'}</p>
    </div>`
    )
    .join('');
  el.innerHTML = header + cards;
}

// ---------- Guion ----------

async function loadPatternsIntoSelect() {
  if (!state.patterns) {
    try {
      state.patterns = await api('/patterns');
    } catch (e) {
      document.getElementById('pattern-select').innerHTML = `<option>${e.message}</option>`;
      return;
    }
  }
  const sel = document.getElementById('pattern-select');
  sel.innerHTML = state.patterns.patrones
    .map((p) => `<option value="${p.id}">${p.nombre} (${p.duracion_segundos}s, ${p.tipo_contenido})</option>`)
    .join('');
  sel.onchange = renderPatternPreview;
  renderPatternPreview();
}

function renderPatternPreview() {
  const id = document.getElementById('pattern-select').value;
  const p = state.patterns?.patrones.find((x) => x.id === id);
  const box = document.getElementById('pattern-preview');
  if (!p) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  box.innerHTML = `
    <strong>${p.nombre}</strong> — ${p.duracion_segundos}s · ${p.tipo_contenido}<br/><br/>
    🪝 <strong>Hook</strong> (${p.estructura.hook.porcentaje}%): ${p.tecnicas.hook}<br/>
    🎬 <strong>Demo</strong> (${p.estructura.demo.porcentaje}%): ${p.tecnicas.demo}<br/>
    🎯 <strong>Climax</strong> (${p.estructura.climax.porcentaje_posicion}% posición): ${p.tecnicas.climax}<br/>
    📣 <strong>CTA</strong> (${p.estructura.cta.porcentaje}%): ${p.tecnicas.cta}<br/><br/>
    <em>Cuándo usar: ${p.cuando_usar}</em>`;
}

document.getElementById('btn-prepare-script').onclick = async () => {
  try {
    const r = await api('/script/prepare', {
      method: 'POST',
      body: JSON.stringify({
        patternId: document.getElementById('pattern-select').value,
        producto: document.getElementById('guion-producto').value.trim(),
        contexto: document.getElementById('guion-contexto').value.trim(),
        duracionObjetivo: document.getElementById('guion-duracion').value,
      }),
    });
    document.getElementById('script-prompt').value = r.prompt;
  } catch (e) {
    alert(e.message);
  }
};

document.getElementById('btn-copy-script').onclick = async () => {
  const ta = document.getElementById('script-prompt');
  if (!ta.value) return;
  await navigator.clipboard.writeText(ta.value);
  alert('Copiado. Pégalo en el chat con Claude Code.');
};

// ---------- Modo Aprendizaje: notas ----------

function getNotesFromCards() {
  return Array.from(document.querySelectorAll('#notas-list .nota-card')).map((card) => ({
    tipo: card.querySelector('.nota-tipo').value,
    timestamp: card.querySelector('.nota-timestamp').value === '' ? null : Number(card.querySelector('.nota-timestamp').value),
    titulo: card.querySelector('.nota-titulo').value.trim(),
    contenido: card.querySelector('.nota-contenido').value.trim(),
  }));
}

function addNotaCard(nota) {
  nota = nota || { tipo: 'tecnica', timestamp: '', titulo: '', contenido: '' };
  const list = document.getElementById('notas-list');
  const card = document.createElement('div');
  card.className = 'nota-card';
  card.innerHTML = `
    <div class="nota-head">
      <select class="nota-tipo">
        <option value="tecnica">🛠️ Técnica</option>
        <option value="paso">🔢 Paso</option>
        <option value="herramienta">🧰 Herramienta</option>
        <option value="cita">💬 Cita</option>
        <option value="advertencia">⚠️ Advertencia</option>
        <option value="otro">✨ Otro</option>
      </select>
      <input type="number" step="0.1" class="nota-timestamp" placeholder="segundo" value="${nota.timestamp ?? ''}" />
      <div class="row-actions">
        <button type="button" class="btn-set-nota-time" title="Usar tiempo actual del reproductor">⏱️</button>
        <button type="button" class="btn-remove-nota" title="Eliminar nota">✕</button>
      </div>
    </div>
    <input type="text" class="nota-titulo" placeholder="Título breve" value="${nota.titulo || ''}" />
    <textarea class="nota-contenido" rows="2" placeholder="Detalle de la lección...">${nota.contenido || ''}</textarea>`;
  card.querySelector('.nota-tipo').value = nota.tipo || 'tecnica';

  card.querySelector('.btn-set-nota-time').onclick = () => {
    const player = document.getElementById('player');
    if (player && !Number.isNaN(player.currentTime)) {
      card.querySelector('.nota-timestamp').value = Math.round(player.currentTime * 100) / 100;
      renderNotasTimeline();
    }
  };
  card.querySelector('.btn-remove-nota').onclick = () => {
    card.remove();
    renderNotasTimeline();
  };
  ['nota-timestamp', 'nota-titulo'].forEach((cls) => card.querySelector(`.${cls}`).addEventListener('input', renderNotasTimeline));

  list.appendChild(card);
}

document.getElementById('btn-add-nota').onclick = () => addNotaCard();

function renderNotasTimeline() {
  renderTimeline('notas-timeline', {
    duration: state.currentDuration,
    segments: [],
    editable: false,
    showHookZone: false,
    sceneChanges: state.lastFrames?.scene_changes || [],
    silenceIntervals: [],
    noteMarkers: getNotesFromCards()
      .filter((n) => n.timestamp != null && !Number.isNaN(n.timestamp))
      .map((n) => ({ t: n.timestamp, titulo: n.titulo })),
  });
  document.getElementById('notas-timeline-wrap').hidden = !state.currentDuration;
}

async function loadLessonsIntoForm(id) {
  document.getElementById('notas-list').innerHTML = '';
  try {
    const l = await api(`/videos/${id}/lessons`);
    document.getElementById('leccion-tema').value = l.tema_principal || '';
    document.getElementById('leccion-fuente').value = l.fuente || '';
    document.getElementById('leccion-resumen').value = l.resumen_ejecutivo || '';
    (l.notas || []).forEach((n) => addNotaCard(n));
  } catch {
    document.getElementById('leccion-tema').value = '';
    document.getElementById('leccion-fuente').value = '';
    document.getElementById('leccion-resumen').value = '';
    addNotaCard();
  }
  renderNotasTimeline();
}

function collectLessons() {
  return {
    tema_principal: document.getElementById('leccion-tema').value.trim(),
    fuente: document.getElementById('leccion-fuente').value.trim(),
    resumen_ejecutivo: document.getElementById('leccion-resumen').value.trim(),
    notas: getNotesFromCards(),
  };
}

document.getElementById('btn-save-lessons').onclick = async () => {
  const id = state.currentId;
  if (!id) return;
  try {
    await api(`/videos/${id}/lessons`, { method: 'PUT', body: JSON.stringify(collectLessons()) });
    setStepDone(3, true);
    const entry = state.videos.find((v) => v.id === id);
    if (entry) entry.status = { ...(entry.status || {}), hasLessons: true };
    renderVideoList();
    switchTab('aplicar');
  } catch (e) {
    alert(e.message);
  }
};

document.getElementById('btn-copy-lessons-manifest').onclick = async () => {
  const id = state.currentId;
  const video = state.videos.find((v) => v.id === id);
  let frameSummary = 'Todavía no se ha corrido el análisis ffmpeg (pestaña Análisis) para este video.';
  try {
    const frames = await api(`/videos/${id}/frames`);
    frameSummary = `Duración: ${frames.duration}s. Miniaturas en data/library/${id}/thumbs/ (${frames.thumbnails.length} imágenes, muestreadas de forma uniforme en todo el video). Cortes de escena/pantalla candidatos (s), útiles como posibles capítulos: ${frames.scene_changes.map((t) => t.toFixed(2)).join(', ') || 'ninguno'}.`;
  } catch {
    /* sin analizar todavía */
  }
  const text = `Usa el agente-lider (video-analyzer, Modo A) para identificar lecciones valiosas en este video educativo ya preprocesado por Viral Video Lab:

Archivo: ${video?.path || '(Modo B, sin archivo)'}
Carpeta de trabajo: data/library/${id}/ (dentro de viral-video-lab)
${frameSummary}

Mira las miniaturas relevantes (sobre todo alrededor de los cortes de escena/pantalla) y dame una lista de notas — cada una con tipo (técnica/paso/herramienta/cita/advertencia), el segundo aproximado, un título breve y el detalle. Cuando la tengas, dime los valores para que los guarde en la pestaña Notas.`;
  await navigator.clipboard.writeText(text);
  alert('Copiado. Pégalo en el chat con Claude Code.');
};

function renderLessonsSummary() {
  const l = collectLessons();
  const box = document.getElementById('lessons-summary');
  if (!l.tema_principal && !l.notas.length) {
    box.innerHTML = '<p class="hint">Todavía no hay notas guardadas para este video. Ve a la pestaña Notas, agrégalas y guárdalas.</p>';
    return;
  }
  const notasHtml =
    l.notas
      .map((n) => {
        const meta = NOTE_TYPE_META[n.tipo] || NOTE_TYPE_META.otro;
        return `<div class="nota-card"><div class="nota-head"><span class="pill">${meta.icon} ${meta.label}</span>${n.timestamp != null ? `<span class="pill">⏱ ${n.timestamp}s</span>` : ''}</div><div class="nota-titulo">${n.titulo || '(sin título)'}</div><p class="hint">${n.contenido || ''}</p></div>`;
      })
      .join('') || '<p class="hint">Sin notas todavía.</p>';
  box.innerHTML = `<strong>${l.tema_principal || '(sin tema)'}</strong>${l.fuente ? ` — ${l.fuente}` : ''}<p class="hint" style="margin:6px 0 12px;">${l.resumen_ejecutivo || ''}</p><div class="notas-list">${notasHtml}</div>`;
}

document.getElementById('btn-prepare-lessons-prompt').onclick = () => {
  const l = collectLessons();
  if (!l.notas.length) return alert('Agrega y guarda al menos una nota primero (pestaña Notas).');
  const notasText = l.notas
    .map((n, i) => {
      const meta = NOTE_TYPE_META[n.tipo] || NOTE_TYPE_META.otro;
      return `${i + 1}. [${meta.label}]${n.timestamp != null ? ` @${n.timestamp}s` : ''} ${n.titulo}: ${n.contenido}`;
    })
    .join('\n');
  const prompt = `Usa el agente-lider (skill-creator) para revisar estas lecciones extraídas de un video educativo y proponer mejoras concretas a las skills relacionadas con producción/ingeniería inversa de contenido, o registrarlo en MEJORAS_SKILLS.md si aplica:

TEMA: ${l.tema_principal || '(sin especificar)'}
FUENTE: ${l.fuente || '(sin especificar)'}
RESUMEN: ${l.resumen_ejecutivo || '(sin especificar)'}

NOTAS:
${notasText}

Dime qué skill actualizarías y cómo (o si esto solo amerita quedar registrado como lección en MEJORAS_SKILLS.md).`;
  document.getElementById('lessons-prompt').value = prompt;
  renderLessonsSummary();
};

document.getElementById('btn-copy-lessons-prompt').onclick = async () => {
  const ta = document.getElementById('lessons-prompt');
  if (!ta.value) return;
  await navigator.clipboard.writeText(ta.value);
  alert('Copiado. Pégalo en el chat con Claude Code.');
};

// ---------- Init ----------

updateModeUI();
loadVideos();
