'use strict';

const FASES = {
  apertura: { titulo: 'Aperturas', descripcion: 'El gancho de los primeros segundos.' },
  demo: { titulo: 'Demostraciones', descripcion: 'Aquí aparece el producto; la música marca su entrada.' },
  cierre: { titulo: 'Cierres', descripcion: 'Resultado final o llamada a la acción.' },
};

const $ = (sel, root = document) => root.querySelector(sel);
let estado = null;

// --- utilidades -----------------------------------------------------------

function aviso(texto, esError = false) {
  const el = document.createElement('div');
  el.className = 'toast' + (esError ? ' error' : '');
  el.textContent = texto;
  document.body.append(el);
  setTimeout(() => el.remove(), 4000);
}

async function api(url, opciones = {}) {
  const res = await fetch(url, opciones);
  const datos = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(datos.error || `Error ${res.status}`);
  return datos;
}

const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

function subir(url, archivos) {
  const datos = new FormData();
  for (const f of archivos) datos.append('archivo', f, f.name);
  return api(url, { method: 'POST', body: datos });
}

const segundos = (s) => `${Number(s).toFixed(1)} s`;

function mostrarProgreso(el, valor, texto) {
  el.hidden = false;
  el.firstElementChild.style.width = `${Math.round((valor || 0) * 100)}%`;
  el.lastElementChild.textContent = texto;
}

// Consulta un trabajo hasta que termina.
async function seguirTrabajo(id, alAvanzar) {
  for (;;) {
    const t = await api(`/api/trabajos/${id}`);
    alAvanzar(t);
    if (t.status !== 'en_curso') return t;
    await new Promise((r) => setTimeout(r, 700));
  }
}

function prepararZona(zona, alSoltar) {
  const input = $('input[type=file]', zona);
  input.addEventListener('change', () => {
    if (input.files.length) alSoltar([...input.files]);
    input.value = '';
  });
  zona.addEventListener('dragover', (e) => {
    e.preventDefault();
    zona.classList.add('encima');
  });
  zona.addEventListener('dragleave', () => zona.classList.remove('encima'));
  zona.addEventListener('drop', (e) => {
    e.preventDefault();
    zona.classList.remove('encima');
    if (e.dataTransfer.files.length) alSoltar([...e.dataTransfer.files]);
  });
}

// --- navegación -----------------------------------------------------------

document.querySelectorAll('.pestana').forEach((b) =>
  b.addEventListener('click', () => {
    document.querySelectorAll('.pestana').forEach((x) => x.classList.toggle('activa', x === b));
    document.querySelectorAll('.vista').forEach((v) => v.classList.toggle('activa', v.id === `vista-${b.dataset.vista}`));
    if (b.dataset.vista === 'movil') cargarMovil();
  })
);

// --- montaje: fases -------------------------------------------------------

function pintarFases() {
  const cont = $('#fases');
  if (!cont.children.length) {
    for (const rol of estado.roles) {
      const nodo = $('#plantilla-fase').content.firstElementChild.cloneNode(true);
      nodo.dataset.rol = rol;
      $('h2', nodo).textContent = FASES[rol]?.titulo || rol;
      $('.descripcion', nodo).textContent = FASES[rol]?.descripcion || '';
      prepararZona($('.zona', nodo), async (archivos) => {
        try {
          const r = await subir(`/api/clips/${rol}`, archivos);
          estado.clips = r.clips;
          pintarFases();
        } catch (err) {
          aviso(err.message, true);
        }
      });
      cont.append(nodo);
    }
  }
  for (const nodo of cont.children) {
    const rol = nodo.dataset.rol;
    const clips = estado.clips[rol] || [];
    $('.contador', nodo).textContent = `${clips.length} clip${clips.length === 1 ? '' : 's'}`;
    const lista = $('.clips', nodo);
    lista.replaceChildren(
      ...clips.map((c) => {
        const li = document.createElement('li');
        li.innerHTML = `<video src="${c.url}#t=0.5" preload="metadata" muted></video><div class="nombre"></div><button class="borrar" title="Quitar">×</button>`;
        $('.nombre', li).textContent = c.name;
        $('video', li).addEventListener('mouseenter', (e) => e.target.play().catch(() => {}));
        $('video', li).addEventListener('mouseleave', (e) => e.target.pause());
        $('.borrar', li).addEventListener('click', async () => {
          const r = await api(`/api/clips/${rol}/${encodeURIComponent(c.name)}`, { method: 'DELETE' });
          estado.clips = r.clips;
          pintarFases();
        });
        return li;
      })
    );
  }
  const usados = estado.roles.filter((r) => estado.clips[r].length);
  const posibles = usados.reduce((acc, r) => acc * estado.clips[r].length, usados.length ? 1 : 0);
  $('#posibles').textContent = `${posibles} combinaciones posibles`;
}

// --- montaje: música ------------------------------------------------------

function pintarMusica() {
  const m = estado.music;
  $('#musica-vacia').hidden = Boolean(m);
  $('#musica-cargada').hidden = !m;
  if (!m) return;
  $('#musica-nombre').textContent = `${m.name} · ${segundos(m.duration)}`;
  $('#drop-valor').textContent = segundos(m.drop);
  $('#vol-musica').value = m.volume ?? 1;
  if (m.url && $('#audio-musica').getAttribute('src') !== m.url) $('#audio-musica').src = m.url;
  dibujarOnda();
}

function dibujarOnda() {
  const m = estado.music;
  const canvas = $('#onda');
  const ancho = canvas.clientWidth || 600;
  const ratio = window.devicePixelRatio || 1;
  canvas.width = ancho * ratio;
  canvas.height = 90 * ratio;
  const ctx = canvas.getContext('2d');
  ctx.scale(ratio, ratio);
  const estilo = getComputedStyle(document.documentElement);
  ctx.fillStyle = estilo.getPropertyValue('--acento').trim();
  const picos = m.peaks || [];
  const paso = ancho / Math.max(1, picos.length);
  picos.forEach((p, i) => {
    const h = Math.max(1, p * 80);
    ctx.fillRect(i * paso, 45 - h / 2, Math.max(1, paso - 1), h);
  });
  const x = (m.drop / m.duration) * ancho;
  ctx.fillStyle = estilo.getPropertyValue('--peligro').trim();
  ctx.fillRect(x - 1, 0, 3, 90);
}

$('#subir-musica').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  aviso('Analizando la canción…');
  try {
    estado.music = await subir('/api/musica', [f]);
    pintarMusica();
    aviso(`Momento fuerte detectado en ${segundos(estado.music.drop)}`);
  } catch (err) {
    aviso(err.message, true);
  }
});

$('#onda').addEventListener('click', async (e) => {
  const rect = e.target.getBoundingClientRect();
  const drop = ((e.clientX - rect.left) / rect.width) * estado.music.duration;
  estado.music = { ...estado.music, ...(await api('/api/musica', json('PUT', { drop }))) };
  pintarMusica();
});

$('#drop-auto').addEventListener('click', async () => {
  estado.music = { ...estado.music, ...(await api('/api/musica', json('PUT', { drop: estado.music.detectedDrop }))) };
  pintarMusica();
});

$('#escuchar-drop').addEventListener('click', () => {
  const audio = $('#audio-musica');
  audio.currentTime = Math.max(0, estado.music.drop - 2);
  audio.play();
  setTimeout(() => audio.pause(), 5000);
});

$('#vol-musica').addEventListener('change', async (e) => {
  estado.music = { ...estado.music, ...(await api('/api/musica', json('PUT', { volume: Number(e.target.value) }))) };
});

$('#quitar-musica').addEventListener('click', async () => {
  await api('/api/musica', { method: 'DELETE' });
  estado.music = null;
  pintarMusica();
});

window.addEventListener('resize', () => estado && estado.music && dibujarOnda());

// --- montaje: generar -----------------------------------------------------

function pintarResultados(videos) {
  $('#resultados').replaceChildren(
    ...videos.map((v) => {
      const div = document.createElement('div');
      div.className = 'resultado';
      div.innerHTML = `<video src="${v.url}#t=0.1" controls preload="metadata" playsinline></video><p></p>`;
      $('p', div).textContent = v.clips ? v.clips.join(' + ') : v.name;
      return div;
    })
  );
}

let trabajoActual = null;
$('#generar').addEventListener('click', async () => {
  const boton = $('#generar');
  boton.disabled = true;
  $('#cancelar').hidden = false;
  pintarResultados([]);
  try {
    const { job } = await api(
      '/api/generar',
      json('POST', {
        count: Number($('#cantidad').value),
        resolution: $('#resolucion').value,
        clipVolume: Number($('#vol-clips').value),
      })
    );
    trabajoActual = job;
    const fin = await seguirTrabajo(job, (t) => {
      mostrarProgreso($('#progreso'), t.progress, `${t.stage || 'Preparando'} · ${Math.round(t.progress * 100)} %`);
      if (t.events.length) pintarResultados(t.events);
    });
    if (fin.status === 'error') throw new Error(fin.error);
    mostrarProgreso($('#progreso'), 1, `Listo: ${fin.result.length} vídeos en ${estado.workspace}`);
    pintarResultados(fin.result);
  } catch (err) {
    aviso(err.message, true);
    $('#progreso').hidden = true;
  } finally {
    boton.disabled = false;
    $('#cancelar').hidden = true;
    trabajoActual = null;
  }
});

$('#cancelar').addEventListener('click', () => trabajoActual && api(`/api/trabajos/${trabajoActual}/cancelar`, { method: 'POST' }));

// --- analizar viral -------------------------------------------------------

async function analizar(cuerpo) {
  const prog = $('#progreso-viral');
  mostrarProgreso(prog, 0, 'Empezando…');
  $('#resultado-viral').replaceChildren();
  try {
    const umbral = $('#umbral').value;
    const { job } = await api(`/api/analizar?umbral=${umbral}`, cuerpo);
    const fin = await seguirTrabajo(job, (t) => mostrarProgreso(prog, t.progress, t.stage || 'Analizando…'));
    if (fin.status === 'error') throw new Error(fin.error);
    prog.hidden = true;
    pintarViral(fin.result);
  } catch (err) {
    prog.hidden = true;
    aviso(err.message, true);
  }
}

function pintarViral(r) {
  const s = r.summary;
  const cont = $('#resultado-viral');
  const datos = [
    ['Duración', segundos(s.duration)],
    ['Planos', s.shots],
    ['Plano medio', segundos(s.averageShot)],
    ['Gancho (1.er plano)', segundos(s.hookDuration)],
    ['Cortes por segundo', s.cutsPerSecond],
  ];
  const resumen = document.createElement('div');
  resumen.className = 'resumen';
  resumen.innerHTML = datos.map(([k, v]) => `<div class="dato"><span>${k}</span><strong>${v}</strong></div>`).join('');
  const tarjeta = document.createElement('div');
  tarjeta.className = 'tarjeta';
  tarjeta.innerHTML = '<div class="tarjeta-cab"><h2>Planos</h2></div><div class="planos"></div>';
  if (r.ocrError) tarjeta.insertAdjacentHTML('beforeend', '<p class="ayuda">No se pudieron leer los textos (el lector de texto necesita internet la primera vez).</p>');
  $('.planos', tarjeta).append(
    ...r.shots.map((p) => {
      const div = document.createElement('div');
      div.className = 'plano';
      div.innerHTML = `<img src="${p.frameUrl}" alt="Plano ${p.index}" loading="lazy"><div><span class="tiempo"></span><p class="texto"></p></div>`;
      $('.tiempo', div).textContent = `Plano ${p.index} · ${p.start.toFixed(1)}–${p.end.toFixed(1)} s (${segundos(p.duration)})`;
      const texto = $('.texto', div);
      if (p.text) texto.textContent = `«${p.text}»`;
      else {
        texto.textContent = 'Sin texto en pantalla';
        texto.classList.add('sin-texto');
      }
      return div;
    })
  );
  cont.replaceChildren(resumen, tarjeta);
}

$('#form-viral').addEventListener('submit', (e) => {
  e.preventDefault();
  const url = $('#url-viral').value.trim();
  if (url) analizar(json('POST', { url }));
});

$('#archivo-viral').addEventListener('change', (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  const datos = new FormData();
  datos.append('archivo', f, f.name);
  analizar({ method: 'POST', body: datos });
});

// --- separar voz ----------------------------------------------------------

prepararZona($('#zona-separar'), async ([archivo]) => {
  const prog = $('#progreso-separar');
  $('#resultado-separar').replaceChildren();
  mostrarProgreso(prog, 0, 'Subiendo…');
  try {
    const { job } = await subir('/api/separar', [archivo]);
    const fin = await seguirTrabajo(job, (t) => mostrarProgreso(prog, t.progress, `${t.stage} · ${Math.round(t.progress * 100)} %`));
    if (fin.status === 'error') throw new Error(fin.error);
    prog.hidden = true;
    const r = fin.result;
    const cont = $('#resultado-separar');
    cont.innerHTML = `
      <div class="fila"><strong>Voz</strong><audio controls src="${r.voiceUrl}"></audio><a class="boton secundario" href="${r.voiceUrl}" download>Descargar</a></div>
      <div class="fila" style="margin-top:10px"><strong>Música</strong><audio controls src="${r.musicUrl}"></audio><a class="boton secundario" href="${r.musicUrl}" download>Descargar</a></div>`;
    if (r.method !== 'demucs') cont.insertAdjacentHTML('beforeend', '<p class="ayuda">Separación básica. Para usar IA, instala Demucs: <code>pip install demucs</code></p>');
  } catch (err) {
    prog.hidden = true;
    aviso(err.message, true);
  }
});

// --- móvil ----------------------------------------------------------------

async function cargarMovil() {
  try {
    const r = await api('/api/compartir');
    $('#qr').innerHTML = r.svg;
    $('#url-movil').textContent = r.url;
  } catch (err) {
    aviso(err.message, true);
  }
}

// --- inicio ---------------------------------------------------------------

async function iniciar() {
  estado = await api('/api/estado');
  $('#version').textContent = `v${estado.version}`;
  $('#metodo-separar').textContent = estado.demucs
    ? 'Separación con IA (Demucs) instalada.'
    : 'Sin IA instalada: se usará la separación básica. Para mejor calidad, instala Demucs (pip install demucs).';
  $('#config-mcp').textContent = JSON.stringify(
    { mcpServers: { vertiflow: { command: 'node', args: ['<carpeta de la app>/mcp/server.js'], env: { VV_WORKSPACE: estado.workspace } } } },
    null,
    2
  );
  pintarFases();
  pintarMusica();
  if (estado.outputs.length) pintarResultados(estado.outputs);

  const act = await api('/api/actualizacion').catch(() => null);
  if (act && act.available) {
    const el = $('#aviso-version');
    el.hidden = false;
    el.innerHTML = '<span></span><a class="boton" target="_blank" rel="noopener">Descargar</a>';
    $('span', el).textContent = `Hay una versión nueva (${act.latest}). ${act.notes || ''}`;
    if (act.download) $('a', el).href = act.download;
    else $('a', el).remove();
  }
}

iniciar().catch((err) => aviso(err.message, true));
