// Cliente de Forja Studio: cotiza, sube referencias, lanza jobs y sondea su estado.
const $ = (id) => document.getElementById(id);
const ACTIVE = new Set(['queued', 'in_progress']);
const STATUS_LABEL = { queued: 'En cola', in_progress: 'Generando', completed: 'Listo', failed: 'Error', nsfw: 'Bloqueado', canceled: 'Cancelado' };

const state = {
  tab: 'image',
  models: [],
  modelByTab: {},
  params: {},
  medias: [], // { role, id, preview, uploading }
  jobs: new Map(),
};

async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  const token = localStorage.getItem('forja_token');
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.json);
  }
  const res = await fetch(`/api${path}`, { ...opts, headers });
  if (res.status === 401) {
    const t = prompt('Este servidor requiere token de acceso:');
    if (t) {
      localStorage.setItem('forja_token', t);
      return api(path, opts);
    }
  }
  const body = res.status === 204 ? null : await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.detail || `Error ${res.status}`);
  return body;
}

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  for (const c of [].concat(children)) if (c) node.append(c);
  return node;
}

// ---------- Composer ----------
function currentModel() {
  return state.models.find((m) => m.id === state.modelByTab[state.tab]);
}

function renderComposer() {
  const library = state.tab === 'library';
  $('composer').classList.toggle('hidden', library);
  $('feed-title').textContent = library ? 'Biblioteca' : 'Tus creaciones';
  if (library) return;

  const options = state.models.filter((m) => m.type === state.tab);
  const select = $('model');
  select.replaceChildren(...options.map((m) => el('option', { value: m.id, textContent: m.name + (m.available ? '' : ' (no disponible)'), disabled: !m.available })));
  if (!options.some((m) => m.id === state.modelByTab[state.tab] && m.available)) {
    state.modelByTab[state.tab] = (options.find((m) => m.available) || options[0] || {}).id;
  }
  select.value = state.modelByTab[state.tab] || '';
  onModelChange();
}

function onModelChange() {
  const model = currentModel();
  state.params = {};
  state.medias = [];
  if (!model) return;
  $('model-desc').textContent = model.description;
  $('prompt-field').hidden = model.prompt === 'none';
  $('prompt').placeholder = model.prompt === 'optional' ? 'Opcional: indica qué mejorar…' : 'Describe lo que quieres crear…';

  $('ratio-field').hidden = !model.aspect_ratios.length;
  state.params.aspect_ratio = model.aspect_ratios[0];
  $('ratios').replaceChildren(
    ...model.aspect_ratios.map((r) => {
      const b = el('button', { type: 'button', textContent: r, className: r === state.params.aspect_ratio ? 'active' : '' });
      b.onclick = () => {
        state.params.aspect_ratio = r;
        [...$('ratios').children].forEach((x) => x.classList.toggle('active', x === b));
        updateCost();
      };
      return b;
    }),
  );

  $('params').replaceChildren(...model.params.map(renderParam));
  renderMediaSlots();
  updateCost();
}

function renderParam(p) {
  state.params[p.name] = p.default;
  if (p.type === 'boolean') {
    const input = el('input', { type: 'checkbox', checked: Boolean(p.default) });
    input.onchange = () => { state.params[p.name] = input.checked; updateCost(); };
    return el('label', { className: 'field toggle' }, [input, el('span', { textContent: p.label })]);
  }
  let input;
  if (p.type === 'select') {
    input = el('select', {}, p.options.map((o) => el('option', { value: String(o), textContent: String(o) })));
    input.value = String(p.default);
    input.onchange = () => { state.params[p.name] = input.value; updateCost(); };
  } else {
    input = el('input', { type: 'number', min: p.min, max: p.max, value: p.default });
    input.oninput = () => { state.params[p.name] = Number(input.value); updateCost(); };
  }
  return el('label', { className: 'field' }, [el('span', { textContent: p.label }), input]);
}

function renderMediaSlots() {
  const model = currentModel();
  $('media-slots').replaceChildren(
    ...model.media.map((spec) => {
      const file = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', multiple: spec.max > 1, hidden: true });
      const drop = el('div', { className: 'drop' });
      const items = state.medias.filter((m) => m.role === spec.role);
      for (const m of items) {
        const remove = el('button', { type: 'button', textContent: '×', title: 'Quitar' });
        remove.onclick = (e) => {
          e.stopPropagation();
          state.medias = state.medias.filter((x) => x !== m);
          renderMediaSlots();
          updateCost();
        };
        drop.append(el('div', { className: `thumb${m.uploading ? ' uploading' : ''}` }, [el('img', { src: m.preview, alt: '' }), remove]));
      }
      if (items.length < spec.max) drop.append(el('span', { textContent: items.length ? '+ Añadir' : 'Arrastra o haz clic para subir' }));
      drop.onclick = () => file.click();
      drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
      drop.ondragleave = () => drop.classList.remove('over');
      drop.ondrop = (e) => {
        e.preventDefault();
        drop.classList.remove('over');
        addFiles(spec, [...e.dataTransfer.files]);
      };
      file.onchange = () => addFiles(spec, [...file.files]);
      const label = spec.label + (spec.required ? '' : ' (opcional)');
      return el('div', { className: 'field' }, [el('span', { textContent: label }), drop, file]);
    }),
  );
}

// Subida en 3 pasos: crear entidad → PUT del binario → confirmar.
async function addFiles(spec, files) {
  const free = spec.max - state.medias.filter((m) => m.role === spec.role).length;
  const picked = files.filter((f) => f.type.startsWith('image/')).slice(0, free);
  if (!picked.length) return;
  const entries = picked.map((f) => ({ role: spec.role, id: null, preview: URL.createObjectURL(f), uploading: true }));
  state.medias.push(...entries);
  renderMediaSlots();
  try {
    const created = await api('/media/batch', { method: 'POST', json: { mimetypes: picked.map((f) => f.type) } });
    await Promise.all(
      created.map(async (item, i) => {
        await api(item.upload_url.replace(/^\/api/, ''), { method: 'PUT', body: picked[i], headers: { 'Content-Type': picked[i].type } });
        await api(`/media/${item.id}/upload`, { method: 'POST' });
        entries[i].id = item.id;
        entries[i].uploading = false;
      }),
    );
  } catch (err) {
    state.medias = state.medias.filter((m) => !entries.includes(m));
    showError(err.message);
  }
  renderMediaSlots();
  updateCost();
}

function collectParams() {
  return {
    ...state.params,
    prompt: $('prompt').value,
    medias: state.medias.filter((m) => m.id).map((m) => ({ role: m.role, id: m.id })),
  };
}

let costTimer;
function updateCost() {
  clearTimeout(costTimer);
  costTimer = setTimeout(async () => {
    const model = currentModel();
    if (!model) return;
    try {
      const { credits } = await api('/job-sets/costs', { method: 'POST', json: { job_type: model.id, params: { ...collectParams(), prompt: 'x' } } });
      $('cost').textContent = `· ⚡ ${credits}`;
    } catch {
      $('cost').textContent = '';
    }
  }, 150);
}

function showError(msg) {
  $('form-error').textContent = msg;
  $('form-error').hidden = !msg;
}

async function generate() {
  const model = currentModel();
  if (!model) return;
  showError('');
  if (state.medias.some((m) => m.uploading)) return showError('Espera a que terminen las subidas');
  $('generate').disabled = true;
  try {
    const job = await api(`/jobs/v2/${model.id}`, { method: 'POST', json: { params: collectParams() } });
    state.jobs.set(job.id, job);
    renderFeed();
    refreshUser();
  } catch (err) {
    showError(err.message);
  } finally {
    $('generate').disabled = false;
  }
}

// ---------- Feed ----------
function renderFeed() {
  const jobs = [...state.jobs.values()]
    .filter((j) => (state.tab === 'library' ? j.status === 'completed' : j.type === state.tab))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  $('grid').replaceChildren(...jobs.map(renderCard));
  $('empty').hidden = jobs.length > 0;
}

function renderMedia(result) {
  if (result.mime.startsWith('video/')) return el('video', { src: result.url, controls: true, loop: true, muted: true, playsInline: true });
  if (result.mime.startsWith('audio/')) return el('audio', { src: result.url, controls: true });
  return el('img', { src: result.url, alt: '', loading: 'lazy' });
}

function renderCard(job) {
  const card = $('card-tpl').content.firstElementChild.cloneNode(true);
  const media = card.querySelector('.media');
  if (job.status === 'completed') {
    if (job.results.length > 1) media.append(el('div', { className: 'many' }, job.results.map(renderMedia)));
    else if (job.results[0]) media.append(renderMedia(job.results[0]));
  } else if (ACTIVE.has(job.status)) {
    media.append(el('div', { className: 'spinner' }), el('span', { className: 'note', textContent: STATUS_LABEL[job.status] }));
  } else {
    media.append(el('span', { className: 'note', textContent: job.error || STATUS_LABEL[job.status] }));
  }
  card.querySelector('.model').textContent = job.model_name;
  const status = card.querySelector('.status');
  status.textContent = STATUS_LABEL[job.status] || job.status;
  status.classList.add(job.status);
  card.querySelector('.prompt').textContent = job.params.prompt || '—';

  const actions = card.querySelector('.actions');
  for (const r of job.status === 'completed' ? job.results : []) {
    actions.append(el('a', { href: r.url, download: '', textContent: 'Descargar' }));
  }
  if (ACTIVE.has(job.status)) {
    const cancel = el('button', { type: 'button', textContent: 'Cancelar' });
    cancel.onclick = async () => {
      try {
        state.jobs.set(job.id, await api(`/jobs/${job.id}/cancel`, { method: 'POST' }));
        renderFeed();
        refreshUser();
      } catch (err) {
        alert(err.message);
      }
    };
    actions.append(cancel);
  }
  actions.append(el('span', { className: 'status', textContent: `⚡ ${job.cost}` }));
  return card;
}

async function pollActive() {
  const ids = [...state.jobs.values()].filter((j) => ACTIVE.has(j.status)).map((j) => j.id);
  if (ids.length) {
    try {
      const { items } = await api('/jobs/status-batch', { method: 'POST', json: { ids } });
      let changed = false;
      for (const job of items) {
        if (state.jobs.get(job.id)?.status !== job.status) changed = true;
        state.jobs.set(job.id, job);
      }
      if (changed) {
        renderFeed();
        refreshUser();
      }
    } catch {
      /* reintenta en el siguiente ciclo */
    }
  }
  setTimeout(pollActive, 2000);
}

async function refreshUser() {
  const user = await api('/user');
  $('credits').textContent = user.credits;
  $('provider-badge').textContent = user.provider;
}

// ---------- Init ----------
async function init() {
  $('tabs').onclick = (e) => {
    const tab = e.target.dataset.tab;
    if (!tab) return;
    state.tab = tab;
    [...$('tabs').children].forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    renderComposer();
    renderFeed();
  };
  $('model').onchange = () => {
    state.modelByTab[state.tab] = $('model').value;
    onModelChange();
  };
  $('generate').onclick = generate;
  $('prompt').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) generate();
  });

  await refreshUser();
  state.models = (await api('/models')).items;
  const { items } = await api('/jobs?limit=100');
  for (const j of items) state.jobs.set(j.id, j);
  renderComposer();
  renderFeed();
  pollActive();
}

init().catch((err) => showError(err.message));
