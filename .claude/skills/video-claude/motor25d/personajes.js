// Personajes planos (tarjetas 2D) dibujados con código: diseños propios de Kubo Studio.
// Cada función dibuja en un canvas de 512x768 con los pies en y=740. estado = {t, cara, accion, fase}
const TINTA = "#1d1420";

function ojo(g, x, y, r, mira, abierto) {
  g.fillStyle = "#fff"; g.strokeStyle = TINTA; g.lineWidth = 5;
  g.beginPath(); g.ellipse(x, y, r, r * abierto, 0, 0, Math.PI * 2); g.fill(); g.stroke();
  if (abierto > 0.25) { g.fillStyle = TINTA; g.beginPath(); g.arc(x + mira * r * 0.35, y, r * 0.45, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#fff"; g.beginPath(); g.arc(x + mira * r * 0.35 - r * 0.15, y - r * 0.18, r * 0.14, 0, Math.PI * 2); g.fill(); }
}

function parpadeo(t, semilla) { const c = (t + semilla * 1.7) % 3.1; return c < 0.12 ? 0.1 : 1; }

export function emu(g, e) {
  const t = e.t, s = e.semilla || 0;
  const alarma = e.cara === "alarma", corre = e.accion === "correr";
  const pica = e.accion === "picotear" ? Math.max(0, Math.sin((t + s) * 4.2)) : 0;
  const paso = corre ? Math.sin((t + s) * 14) : 0;
  g.lineJoin = "round"; g.lineCap = "round";
  // patas
  g.strokeStyle = "#6b5a52"; g.lineWidth = 12;
  for (const k of [-1, 1]) {
    const dx = corre ? paso * 38 * k : 0;
    g.beginPath(); g.moveTo(256 + 22 * k, 470); g.lineTo(256 + 22 * k + dx * 0.5, 610); g.lineTo(256 + 24 * k + dx, 735); g.stroke();
    g.beginPath(); g.moveTo(256 + 24 * k + dx, 735); g.lineTo(256 + 24 * k + dx + 30, 738); g.stroke();
  }
  // cuerpo: frijol de plumas
  const cy = 400 + (corre ? Math.abs(paso) * -10 : Math.sin(t * 2 + s) * 3);
  g.fillStyle = "#2a2226"; g.strokeStyle = TINTA; g.lineWidth = 7;
  g.beginPath(); g.ellipse(256, cy, 150, 105, -0.12, 0, Math.PI * 2); g.fill(); g.stroke();
  g.strokeStyle = "#4a3c40"; g.lineWidth = 5;
  for (let i = 0; i < 9; i++) { const a = -2.6 + i * 0.32; g.beginPath(); g.arc(256, cy, 80 + (i % 3) * 18, a, a + 0.35); g.stroke(); }
  // cuello y cabeza
  const hx = 330 + pica * 40, hy = 160 + pica * 230 - (alarma ? 20 : 0);
  g.strokeStyle = "#566a86"; g.lineWidth = 30;
  g.beginPath(); g.moveTo(300, cy - 60); g.quadraticCurveTo(355, cy - 160, hx, hy + 30); g.stroke();
  g.strokeStyle = TINTA; g.lineWidth = 4;
  g.beginPath(); g.moveTo(286, cy - 60); g.quadraticCurveTo(340, cy - 160, hx - 16, hy + 30); g.stroke();
  g.fillStyle = "#3a3036"; g.strokeStyle = TINTA; g.lineWidth = 6;
  g.beginPath(); g.ellipse(hx, hy, 52, 46, 0, 0, Math.PI * 2); g.fill(); g.stroke();
  // copete
  g.lineWidth = 4; for (const d of [-14, 0, 14]) { g.beginPath(); g.moveTo(hx + d, hy - 40); g.lineTo(hx + d * 1.6, hy - 70 - (alarma ? 15 : 0)); g.stroke(); }
  // pico
  g.fillStyle = "#3b3436"; g.beginPath(); g.moveTo(hx + 30, hy - 6); g.lineTo(hx + 86, hy + 8); g.lineTo(hx + 30, hy + 18); g.closePath(); g.fill(); g.stroke();
  if (alarma) { g.fillStyle = "#c2566a"; g.beginPath(); g.moveTo(hx + 34, hy + 14); g.lineTo(hx + 78, hy + 26); g.lineTo(hx + 34, hy + 34); g.fill(); g.stroke(); }
  const ab = parpadeo(t, s), r = alarma ? 22 : 17;
  ojo(g, hx - 4, hy - 6, r, alarma ? 0 : 1, ab);
  ojo(g, hx + 24, hy - 8, r * 0.85, alarma ? 0 : 1, ab);
}

export function granjero(g, e) {
  const t = e.t, s = e.semilla || 0, ab = parpadeo(t, s);
  g.lineJoin = "round"; g.lineCap = "round"; g.strokeStyle = TINTA; g.lineWidth = 7;
  g.fillStyle = "#4b5d7a"; g.fillRect(205, 560, 42, 175); g.fillRect(265, 560, 42, 175); g.strokeRect(205, 560, 42, 175); g.strokeRect(265, 560, 42, 175);
  g.fillStyle = "#b04a3a"; g.beginPath(); g.roundRect(170, 330, 172, 250, 40); g.fill(); g.stroke();
  g.strokeStyle = "#7d2e24"; g.lineWidth = 4; for (let x = 190; x < 340; x += 28) { g.beginPath(); g.moveTo(x, 335); g.lineTo(x, 575); g.stroke(); }
  g.strokeStyle = TINTA; g.lineWidth = 7; g.fillStyle = "#e9b48c";
  g.beginPath(); g.ellipse(256, 240, 88, 95, 0, 0, Math.PI * 2); g.fill(); g.stroke();
  g.fillStyle = "#c9a36a"; g.beginPath(); g.ellipse(256, 170, 150, 28, 0, 0, Math.PI * 2); g.fill(); g.stroke();
  g.beginPath(); g.roundRect(190, 95, 132, 80, 30); g.fill(); g.stroke();
  ojo(g, 226, 245, 15, e.cara === "serio" ? 0 : 0.6, ab); ojo(g, 286, 245, 15, e.cara === "serio" ? 0 : 0.6, ab);
  g.beginPath(); g.moveTo(232, 300); g.lineTo(282, 300); g.stroke();
}

export const DIBUJOS = { emu, granjero };
