// Widget de pantalla de bloqueo para Scriptable (iOS 16+).
// Lee el mismo estado.json que muestra la web app.
const URL_ESTADO = "https://raw.githubusercontent.com/sanmiguelyt955/Claude/claude/admiring-newton-086e1x/movil/pwa/estado.json";
const REFRESCO_MIN = 15;

async function cargarEstado() {
  const fm = FileManager.local();
  const cache = fm.joinPath(fm.cacheDirectory(), "panel-estado.json");
  try {
    const req = new Request(URL_ESTADO + "?t=" + Date.now());
    req.timeoutInterval = 10;
    const estado = await req.loadJSON();
    fm.writeString(cache, JSON.stringify(estado));
    return estado;
  } catch (e) {
    if (fm.fileExists(cache)) return JSON.parse(fm.readString(cache));
    return { titulo: "Sin conexión", lineas: [], pendientes: 0 };
  }
}

function construir(estado, familia) {
  const w = new ListWidget();
  w.refreshAfterDate = new Date(Date.now() + REFRESCO_MIN * 60 * 1000);
  const lineas = estado.lineas || [];

  if (familia === "accessoryInline") {
    w.addText(`${estado.titulo}: ${estado.pendientes ?? 0} pend.`);
  } else if (familia === "accessoryCircular") {
    w.addAccessoryWidgetBackground = true;
    const n = w.addText(String(estado.pendientes ?? 0));
    n.font = Font.boldSystemFont(24);
    n.centerAlignText();
    const t = w.addText("pend.");
    t.font = Font.systemFont(10);
    t.centerAlignText();
  } else {
    const t = w.addText(estado.titulo || "Panel");
    t.font = Font.boldSystemFont(14);
    t.lineLimit = 1;
    for (const l of lineas.slice(0, 2)) {
      const x = w.addText(l);
      x.font = Font.systemFont(12);
      x.lineLimit = 1;
    }
  }
  return w;
}

const familia = config.widgetFamily || "accessoryRectangular";
const widget = construir(await cargarEstado(), familia);
if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  await widget.presentAccessoryRectangular();
}
Script.complete();
