const state = {
  selectedFile: null,
  currentJobId: null,
  interval: 1,
};

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('file-input');
const intervalSlider = document.getElementById('interval-slider');
const intervalDisplay = document.getElementById('interval-display');
const btnAnalyze = document.getElementById('btn-analyze');
const btnDownload = document.getElementById('btn-download');

const configSection = document.getElementById('config-section');
const progressSection = document.getElementById('progress-section');
const resultSection = document.getElementById('result-section');
const blocksSection = document.getElementById('blocks-section');
const blockDurationSlider = document.getElementById('block-duration-slider');
const blockDurationDisplay = document.getElementById('block-duration-display');
const keyframeCountSlider = document.getElementById('keyframe-count-slider');
const keyframeCountDisplay = document.getElementById('keyframe-count-display');
const btnGenerateBlocks = document.getElementById('btn-generate-blocks');
const blocksResult = document.getElementById('blocks-result');
const blocksList = document.getElementById('blocks-list');

state.blockDuration = 60;
state.keyFrameCount = 4;

blockDurationSlider.addEventListener('input', (e) => {
  state.blockDuration = parseInt(e.target.value, 10);
  blockDurationDisplay.textContent = state.blockDuration + 's';
});

keyframeCountSlider.addEventListener('input', (e) => {
  state.keyFrameCount = parseInt(e.target.value, 10);
  keyframeCountDisplay.textContent = state.keyFrameCount;
});

btnGenerateBlocks.addEventListener('click', async () => {
  if (!state.currentJobId) return alert('Analiza un video primero');

  btnGenerateBlocks.disabled = true;
  btnGenerateBlocks.textContent = 'Generando...';
  blocksResult.hidden = true;
  blocksList.innerHTML = '';

  try {
    const res = await fetch(`/api/blocks/${state.currentJobId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        blockDuration: state.blockDuration,
        keyFrameCount: state.keyFrameCount,
      }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Error generando bloques');
    }
    const manifest = await res.json();
    showBlocks(manifest);
  } catch (err) {
    alert('Error: ' + err.message);
  } finally {
    btnGenerateBlocks.disabled = false;
    btnGenerateBlocks.textContent = '🧩 Generar bloques';
  }
});

function showBlocks(manifest) {
  blocksResult.hidden = false;
  const totalFrames = manifest.blocks.reduce((sum, b) => sum + b.frameCount, 0);
  const totalKeyFrames = manifest.blocks.reduce((sum, b) => sum + b.keyFrames.length, 0);
  const savings = totalFrames > 0 ? Math.round((1 - totalKeyFrames / totalFrames) * 100) : 0;

  blocksResult.innerHTML = `
    ✅ <strong>${manifest.blockCount} bloques</strong> de ${manifest.blockDuration}s generados
    (video: ${manifest.duration.toFixed(1)}s).<br />
    Frames totales: ${totalFrames} · Frames clave para análisis: <strong>${totalKeyFrames}</strong>
    (~${savings}% menos lectura de imágenes).<br />
    <strong>Job ID:</strong> <code id="job-id-value">${manifest.jobId}</code>
    <button id="btn-copy-job-id" class="btn-copy" type="button" title="Copiar Job ID">📋</button>
    — dile esto a Claude para que empiece el análisis.
  `;

  document.getElementById('btn-copy-job-id').addEventListener('click', (e) => {
    navigator.clipboard.writeText(manifest.jobId).then(() => {
      e.target.textContent = '✅';
      setTimeout(() => { e.target.textContent = '📋'; }, 1200);
    });
  });

  blocksList.innerHTML = manifest.blocks.map(b => `
    <li>
      <span class="block-index">${b.blockIndex}</span>
      <span class="block-time">${b.startTime.toFixed(0)}s–${b.endTime.toFixed(0)}s</span>
      <span class="block-meta">
        <span class="chip">${b.frameCount} frames</span>
        <span class="chip">${b.keyFrames.length} clave</span>
      </span>
    </li>
  `).join('');
}

// Dropzone
dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.style.borderColor = 'var(--accent)';
});
dropzone.addEventListener('dragleave', () => {
  dropzone.style.borderColor = 'var(--card-border)';
});
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.style.borderColor = 'var(--card-border)';
  const files = e.dataTransfer.files;
  if (files.length > 0) selectFile(files[0]);
});

fileInput.addEventListener('change', (e) => {
  if (e.target.files.length > 0) selectFile(e.target.files[0]);
});

function selectFile(file) {
  state.selectedFile = file;
  dropzone.innerHTML = `
    <span class="icon">✅</span>
    <span><strong>${file.name}</strong><br /><small>${(file.size / 1024 / 1024).toFixed(2)} MB</small></span>
  `;
  configSection.hidden = false;
}

// Interval slider
intervalSlider.addEventListener('input', (e) => {
  state.interval = parseFloat(e.target.value);
  intervalDisplay.textContent = state.interval.toFixed(1);
});

// Analyze
btnAnalyze.addEventListener('click', async () => {
  if (!state.selectedFile) return alert('Selecciona un video primero');

  const formData = new FormData();
  formData.append('video', state.selectedFile);
  formData.append('interval', state.interval);

  configSection.hidden = true;
  progressSection.hidden = false;
  resultSection.hidden = true;

  try {
    const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData });
    const { jobId, duration } = await uploadRes.json();
    state.currentJobId = jobId;

    const frameCount = Math.ceil(duration / state.interval);
    document.getElementById('progress-info').textContent =
      `Duración: ${duration.toFixed(1)}s | Frames: ${frameCount} @ ${state.interval}s de intervalo`;

    pollJob();
  } catch (err) {
    alert('Error: ' + err.message);
    progressSection.hidden = true;
    configSection.hidden = false;
  }
});

function pollJob() {
  fetch(`/api/job/${state.currentJobId}`)
    .then(r => r.json())
    .then(job => {
      const pct = Math.round(job.progress * 100);
      document.getElementById('progress-fill').style.width = pct + '%';
      document.getElementById('progress-label').textContent = pct + '%';

      if (job.status === 'ready') {
        showResult(job);
      } else if (job.status === 'error') {
        alert('Error: ' + job.error);
        progressSection.hidden = true;
        configSection.hidden = false;
      } else {
        setTimeout(pollJob, 500);
      }
    });
}

function showResult(job) {
  progressSection.hidden = true;
  resultSection.hidden = false;
  blocksSection.hidden = false;
  document.getElementById('result-info').textContent =
    `✅ Análisis completo: ${job.result.frameCount} frames extraídos.`;
  btnDownload.onclick = () => {
    window.location.href = `/api/download/${state.currentJobId}`;
  };
}
