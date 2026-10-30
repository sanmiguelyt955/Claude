const CLAVE = "panel.tareas.v1";
const $ = (id) => document.getElementById(id);
let tareas = [];

function leer() {
  try { const v = JSON.parse(localStorage.getItem(CLAVE)); return Array.isArray(v) ? v : []; }
  catch { return []; }
}
function guardar() {
  try { localStorage.setItem(CLAVE, JSON.stringify(tareas)); } catch {}
}

function pintarTareas() {
  const ul = $("tareas");
  ul.replaceChildren();
  tareas.forEach((t, i) => {
    const li = document.createElement("li");
    if (t.hecha) li.className = "hecha";
    const c = document.createElement("input");
    c.type = "checkbox"; c.checked = !!t.hecha;
    c.onchange = () => { t.hecha = c.checked; guardar(); pintarTareas(); };
    const s = document.createElement("span");
    s.textContent = t.texto;
    const b = document.createElement("button");
    b.textContent = "×"; b.setAttribute("aria-label", "Borrar");
    b.onclick = () => { tareas.splice(i, 1); guardar(); pintarTareas(); };
    li.append(c, s, b);
    ul.append(li);
  });
  $("cuenta").textContent = String(tareas.filter((t) => !t.hecha).length);
}

async function cargarEstado() {
  try {
    const r = await fetch("estado.json?t=" + Date.now(), { cache: "no-store" });
    if (!r.ok) throw new Error(r.status);
    const e = await r.json();
    $("titulo").textContent = e.titulo || "Mi panel";
    const ul = $("lineas");
    ul.replaceChildren(...(e.lineas || []).map((l) => Object.assign(document.createElement("li"), { textContent: l })));
    $("actualizado").textContent = e.actualizado ? "Actualizado: " + e.actualizado : "";
  } catch {
    $("titulo").textContent = "Sin conexión";
    $("lineas").replaceChildren();
    $("actualizado").textContent = "No se pudo leer el estado.";
  }
}

$("form").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const texto = $("nueva").value.trim();
  if (!texto) return;
  tareas.push({ texto, hecha: false });
  $("nueva").value = "";
  guardar(); pintarTareas();
});

tareas = leer();
pintarTareas();
cargarEstado();
if (!window.matchMedia("(display-mode: standalone)").matches && !navigator.standalone) $("ayuda").hidden = false;
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
