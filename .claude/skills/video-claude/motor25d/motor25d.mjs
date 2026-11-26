#!/usr/bin/env node
// Motor 2.5D de Kubo Studio: plan.json -> video MP4 (three.js en Chromium sin pantalla + ffmpeg).
//   node motor25d.mjs planes/emus_prueba.json salida.mp4 [--control]   (--control: 1 de cada 4 cuadros, rápido)
import { createServer } from "node:http";
import { readFileSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join, dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const AQUI = dirname(fileURLToPath(import.meta.url));
const THREE_DIR = process.env.THREE_DIR || "/tmp/claude-0/motor/node_modules/three/build";
const require = createRequire(process.env.PW_DIR || "/tmp/claude-0/motor/");
const { chromium } = require("playwright");
const [planRuta, salida = "salida.mp4", ...flags] = process.argv.slice(2);
const plan = JSON.parse(readFileSync(planRuta, "utf8")), control = flags.includes("--control");
const paso = control ? 4 : 1, total = Math.round(plan.duracion * plan.fps);

// efectos pixelfx: se renderizan una vez a hoja de sprites transparente en _fx/<id>.png/json
const PIXELFX = process.env.PIXELFX_DIR || "/tmp/claude-0/repos/pixelfx";
for (const e of plan.fx || []) {
  const dest = join(AQUI, "_fx", e.id + ".png");
  if (existsSync(dest)) continue;
  const r = spawnSync("node", [join(PIXELFX, "tools/render.mjs"), e.id, "--sheet", "--bg", "none", "--no-actor", "--out", join(AQUI, "_fxtmp")], { encoding: "utf8" });
  if (r.status !== 0) { console.error("pixelfx falló para", e.id, r.stderr); continue; }
  const name = e.id.split("/")[1]; mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, readFileSync(join(AQUI, "_fxtmp", e.id, name + ".png")));
  writeFileSync(dest.replace(/\.png$/, ".json"), readFileSync(join(AQUI, "_fxtmp", e.id, name + ".json")));
}
rmSync(join(AQUI, "_fxtmp"), { recursive: true, force: true });

const tipos = { ".js": "text/javascript", ".html": "text/html", ".png": "image/png", ".json": "application/json" };
const srv = createServer((q, s) => {
  const u = q.url.split("?")[0];
  const f = u === "/" ? null : u.startsWith("/three/") ? join(THREE_DIR, u.slice(7)) : join(AQUI, u.slice(1));
  if (!f) { s.setHeader("content-type", "text/html; charset=utf-8");
    return s.end(`<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#000}</style><script>window.PLAN=${JSON.stringify(plan)}</script>
<script type="importmap">{"imports":{"three":"/three/three.module.js"}}</script><script type="module" src="/escena.js"></script>`); }
  if (!existsSync(f)) { s.statusCode = 404; return s.end(); }
  s.setHeader("content-type", tipos[extname(f)] || "application/octet-stream"); s.end(readFileSync(f));
}).listen(0);
const puerto = srv.address().port;
const dir = resolve(salida + "_cuadros"); rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
const nav = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const pag = await nav.newPage({ viewport: { width: plan.ancho, height: plan.alto } });
pag.on("pageerror", (e) => console.error("Error en la escena:", e.message));
await pag.goto(`http://127.0.0.1:${puerto}/`); await pag.waitForFunction(() => window.listo === true, null, { timeout: 60000 });
const t0 = Date.now(); let n = 0;
for (let f = 0; f < total; f += paso) {
  const png = await pag.evaluate((f) => { window.cuadro(f); return (document.getElementById("salida") || document.querySelector("canvas")).toDataURL("image/png"); }, f);
  writeFileSync(join(dir, `c_${String(n++).padStart(5, "0")}.png`), Buffer.from(png.split(",")[1], "base64"));
}
await nav.close(); srv.close();
const fpsSal = plan.fps / paso;
// sonido: cada evento es un sonido del banco de earshot (hecho con código) colocado en su segundo
const EARSHOT = process.env.EARSHOT || "/tmp/claude-0/herr/bin/earshot";
const ent = ["-framerate", String(fpsSal), "-i", join(dir, "c_%05d.png")], filtros = []; let nEnt = 1;
(plan.sonidos || []).forEach((s, i) => {
  const wav = join(dir, `s${i}.wav`), args = ["sfx", "render", s.id, "-o", wav];
  if (s.dur) args.push("--dur", String(s.dur));
  if (spawnSync(EARSHOT, args, { encoding: "utf8" }).status !== 0) { console.error("earshot no pudo con", s.id); return; }
  const k = nEnt++; ent.push("-i", wav);
  filtros.push(`[${k}:a]adelay=${Math.round(s.t * 1000)}:all=1,volume=${s.vol ?? 1}[a${k}]`);
});
if (plan.voz_archivo) {
  const k = nEnt++; ent.push("-i", resolve(dirname(planRuta), plan.voz_archivo));
  filtros.push(`[${k}:a]volume=${plan.voz_volumen ?? 1}[a${k}]`);
}
let mapa = [];
if (filtros.length) {
  const etiquetas = filtros.map((f) => f.match(/\[(a\d+)\]$/)[1]);
  filtros.push(`${etiquetas.map((e) => `[${e}]`).join("")}amix=inputs=${etiquetas.length}:normalize=0,apad,atrim=0:${plan.duracion},alimiter=limit=0.9[aout]`);
  mapa = ["-filter_complex", filtros.join(";"), "-map", "0:v", "-map", "[aout]", "-c:a", "aac", "-b:a", "192k"];
}
const ff = spawnSync("ffmpeg", ["-v", "error", "-y", ...ent, ...mapa,
  "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-r", String(plan.fps), "-t", String(plan.duracion), salida], { stdio: "inherit" });
if (ff.status === 0) rmSync(dir, { recursive: true, force: true });
console.log(JSON.stringify({ salida, cuadros: n, segundos_render: Math.round((Date.now() - t0) / 1000), control }));
