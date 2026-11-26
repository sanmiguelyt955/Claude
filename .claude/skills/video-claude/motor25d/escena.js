// Mundo 3D con luz, sombras, niebla, tinta y personajes 2D (tarjetas). Determinista: cuadro(f) dibuja el cuadro f.
import * as THREE from "three";
import { DIBUJOS } from "./personajes.js";

const P = window.PLAN, W = P.ancho, H = P.alto, FPS = P.fps;
const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
r.setSize(W, H); r.setPixelRatio(1); r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
r.outputColorSpace = THREE.SRGBColorSpace; document.body.appendChild(r.domElement);
const esc = new THREE.Scene(), cam = new THREE.PerspectiveCamera(40, W / H, 0.1, 600);
let semilla = 7; const azar = () => ((semilla = (semilla * 16807) % 2147483647) / 2147483647);

// --- cielo con degradado y niebla del color del horizonte
const L = P.luz;
const cielo = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { a: { value: new THREE.Color(L.cielo_arriba) }, b: { value: new THREE.Color(L.horizonte) } },
  vertexShader: "varying float h; void main(){ h = normalize(position).y; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }",
  fragmentShader: "uniform vec3 a,b; varying float h; void main(){ gl_FragColor = vec4(mix(b,a,smoothstep(-.02,.45,h)),1.); }" }));
esc.add(cielo); esc.fog = new THREE.Fog(L.horizonte, L.niebla[0], L.niebla[1]);

// --- luces: sol con sombras suaves + relleno frío
const sol = new THREE.DirectionalLight(L.sol, L.fuerza_sol);
const az = THREE.MathUtils.degToRad(L.sol_az), el = THREE.MathUtils.degToRad(L.sol_el);
sol.position.set(Math.cos(el) * Math.sin(az) * 60, Math.sin(el) * 60, Math.cos(el) * Math.cos(az) * 60);
sol.castShadow = true; sol.shadow.mapSize.set(2048, 2048); Object.assign(sol.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, far: 200 });
sol.shadow.bias = -0.0005; sol.shadow.radius = 4; esc.add(sol);
esc.add(new THREE.HemisphereLight(L.cielo_arriba, L.sombra, L.relleno));

// --- materiales de dos tonos + tinta (casco invertido)
const grad = new THREE.DataTexture(new Uint8Array([90, 90, 90, 255, 200, 200, 200, 255, 255, 255, 255, 255]), 3, 1);
grad.minFilter = grad.magFilter = THREE.NearestFilter; grad.needsUpdate = true;
const toon = (c) => new THREE.MeshToonMaterial({ color: c, gradientMap: grad });
const tinta = new THREE.MeshBasicMaterial({ color: "#0c0a0d", side: THREE.BackSide });
function conTinta(geo, color, grosor = 0.04) {
  const g = new THREE.Group(), m = new THREE.Mesh(geo, toon(color)); m.castShadow = m.receiveShadow = true;
  const t = new THREE.Mesh(geo, tinta); t.scale.setScalar(1 + grosor); g.add(m, t); return g;
}

// --- suelo pintado (trigal) con textura hecha en canvas
function pintura(base, rayas, n = 1400) {
  const c = document.createElement("canvas"); c.width = c.height = 1024; const g = c.getContext("2d");
  g.fillStyle = base; g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < n; i++) { g.strokeStyle = rayas[i % rayas.length]; g.globalAlpha = .35 + azar() * .4; g.lineWidth = 1 + azar() * 3;
    const x = azar() * 1024, y = azar() * 1024; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (azar() - .5) * 8, y - 10 - azar() * 18); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(14, 14); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const suelo = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), new THREE.MeshToonMaterial({ map: pintura(P.mundo.suelo, P.mundo.espigas), gradientMap: grad }));
suelo.rotation.x = -Math.PI / 2; suelo.receiveShadow = true; esc.add(suelo);

// colinas lejanas, rocas, cerca y espigas en primer plano
for (const [x, z, s, c] of P.mundo.colinas) { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), toon(c)); m.scale.set(s, s * .28, s * .6); m.position.set(x, 0, z); esc.add(m); }
for (const [x, z, s] of P.mundo.rocas) { const g = conTinta(new THREE.DodecahedronGeometry(s, 0), "#8f7f74", .05); g.position.set(x, s * .55, z); g.rotation.y = x; esc.add(g); }
for (const c of P.mundo.cercas) { for (let i = 0; i < c.n; i++) {
  const x = c.x + i * 2.4, poste = conTinta(new THREE.BoxGeometry(.18, 1.3, .18), "#7a5a3c"); poste.position.set(x, .65, c.z); poste.rotation.z = (c.rota && i === c.rota) ? .5 : 0; esc.add(poste);
  if (i < c.n - 1 && !(c.rota && (i === c.rota || i === c.rota - 1))) for (const y of [.5, 1]) { const tb = conTinta(new THREE.BoxGeometry(2.4, .1, .06), "#8c6a48"); tb.position.set(x + 1.2, y, c.z); esc.add(tb); } } }
const espigaMat = new THREE.MeshToonMaterial({ color: P.mundo.espiga_cerca, gradientMap: grad });
for (let i = 0; i < P.mundo.n_espigas; i++) { const h = .5 + azar() * .6, m = new THREE.Mesh(new THREE.ConeGeometry(.025, h, 3), espigaMat);
  m.position.set((azar() - .5) * 40, h / 2, (azar() - .5) * 40); m.rotation.z = (azar() - .5) * .3; m.castShadow = true; esc.add(m); }

// --- personajes: tarjetas que miran a la cámara (solo giran en Y), con sombra real y sombra de contacto
const elenco = P.elenco.map((p) => {
  const c = document.createElement("canvas"); c.width = 512; c.height = 768; const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  if (p.espejo) { tex.wrapS = THREE.RepeatWrapping; tex.repeat.x = -1; tex.offset.x = 1; }
  const geo = new THREE.PlaneGeometry(p.alto * 512 / 768, p.alto); geo.translate(0, p.alto / 2 - p.alto * (28 / 768), 0);
  const mat = new THREE.MeshBasicMaterial({ map: tex, alphaTest: .5, side: THREE.DoubleSide, color: new THREE.Color(P.luz.tinta_tarjetas || "#ffffff") });
  const m = new THREE.Mesh(geo, mat); m.castShadow = true; esc.add(m);
  const sombra = new THREE.Mesh(new THREE.CircleGeometry(p.alto * .22, 24), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: .35, depthWrite: false }));
  sombra.rotation.x = -Math.PI / 2; esc.add(sombra);
  return { p, c, g: c.getContext("2d"), tex, m, sombra };
});

// --- efectos pixel (pixelfx) como tarjetas en el mundo 3D: hoja de sprites + json pre-renderizados por el motor
const efectos = await Promise.all((P.fx || []).map(async (e) => {
  const meta = await (await fetch(`/_fx/${e.id}.json`)).json(), img = new Image(); img.src = `/_fx/${e.id}.png`; await img.decode();
  const tex = new THREE.Texture(img); tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true;
  const fr = meta.frames, W0 = img.width, H0 = img.height, f0 = fr[0].frame;
  tex.repeat.set(f0.w / W0, f0.h / H0);
  const alto = e.alto || 1.5, m = new THREE.Mesh(new THREE.PlaneGeometry(alto * f0.w / f0.h, alto),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
  m.renderOrder = 5; m.visible = false; esc.add(m);
  return { e, m, tex, fr, W0, H0, dur: fr.reduce((a, x) => a + (x.duration || 33), 0) / 1000 };
}));

const ss = (x) => x * x * x * (x * (x * 6 - 15) + 10);           // smootherstep
const lerp = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
function estadoEn(lista, t, def) { let e = def; for (const k of lista || []) if (t >= k.t) e = { ...e, ...k }; return e; }
function posEn(ruta, t) { if (!ruta || ruta.length === 0) return null; let a = ruta[0];
  for (const b of ruta) { if (t < b.t) { const k = ss(Math.min(1, (t - a.t) / Math.max(.001, b.t - a.t))); return lerp(a.pos, b.pos, k); } a = b; } return a.pos; }
function camaraEn(t) { const ks = P.camara; let a = ks[0];
  for (const b of ks) { if (t < b.t) { if (b.corte) return a; const k = ss(Math.min(1, (t - a.t) / (b.t - a.t))); return { pos: lerp(a.pos, b.pos, k), mira: lerp(a.mira, b.mira, k), fov: a.fov + (b.fov - a.fov) * k }; } a = b; }
  return a; }

window.cuadro = (f) => {
  const t = f / FPS, c = camaraEn(t);
  let sacude = 0; for (const s of P.sacudidas || []) { const d = t - s; if (d >= 0 && d < .25) sacude = Math.max(sacude, (1 - d / .25) * .12); }
  cam.position.set(c.pos[0] + Math.sin(t * 90) * sacude, c.pos[1] + Math.cos(t * 77) * sacude, c.pos[2]);
  cam.fov = c.fov; cam.updateProjectionMatrix(); cam.lookAt(...c.mira);
  for (const a of elenco) {
    const e = estadoEn(a.p.estados, t, { cara: "normal", accion: "quieto" }), pos = posEn(a.p.ruta, t) || a.p.pos;
    a.g.clearRect(0, 0, 512, 768); DIBUJOS[a.p.tipo](a.g, { ...e, t, semilla: a.p.semilla || 0 });
    a.tex.needsUpdate = true; a.m.position.set(pos[0], pos[1] || 0, pos[2]);
    a.m.rotation.y = Math.atan2(cam.position.x - pos[0], cam.position.z - pos[2]);
    a.sombra.position.set(pos[0], (pos[1] || 0) + .02, pos[2]);
  }
  for (const x of efectos) {
    const d = t - x.e.t; x.m.visible = d >= 0 && d < x.dur * (x.e.veces || 1);
    if (!x.m.visible) continue;
    let ms = (d % x.dur) * 1000, i = 0; while (i < x.fr.length - 1 && ms >= (x.fr[i].duration || 33)) { ms -= (x.fr[i].duration || 33); i++; }
    const q = x.fr[i].frame; x.tex.offset.set(q.x / x.W0, 1 - (q.y + q.h) / x.H0);
    x.m.position.set(...x.e.pos); x.m.quaternion.copy(cam.quaternion);
  }
  r.render(esc, cam); return true;
};
window.listo = true;
