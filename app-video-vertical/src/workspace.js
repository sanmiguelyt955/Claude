'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Carpeta de trabajo compartida por la interfaz, la línea de comandos y el asistente:
//   clips/<fase>/  musica/  salida/  analisis/  separar/  proyecto.json
const ROLES = ['apertura', 'demo', 'cierre'];
const VIDEO_EXT = /\.(mp4|mov|m4v|webm|mkv|avi)$/i;
const AUDIO_EXT = /\.(mp3|m4a|wav|aac|ogg|flac|opus)$/i;

const defaultWorkspace = () => process.env.VV_WORKSPACE || path.join(os.homedir(), 'Vertiflow');

function safeName(name) {
  const base = path.basename(String(name)).normalize('NFC').replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(0, 120);
  return base || `archivo_${Date.now()}`;
}

function uniquePath(dir, name) {
  const ext = path.extname(name);
  const stem = path.basename(name, ext);
  let candidate = path.join(dir, name);
  for (let i = 2; fs.existsSync(candidate); i++) candidate = path.join(dir, `${stem} (${i})${ext}`);
  return candidate;
}

function openWorkspace(root = defaultWorkspace()) {
  const dirs = {
    root,
    clips: path.join(root, 'clips'),
    music: path.join(root, 'musica'),
    out: path.join(root, 'salida'),
    viral: path.join(root, 'analisis'),
    separate: path.join(root, 'separar'),
  };
  for (const d of Object.values(dirs)) fs.mkdirSync(d, { recursive: true });
  for (const r of ROLES) fs.mkdirSync(path.join(dirs.clips, r), { recursive: true });
  const settingsFile = path.join(root, 'proyecto.json');

  const ws = {
    dirs,
    roles: ROLES,
    loadSettings() {
      try {
        return JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
      } catch {
        return {};
      }
    },
    saveSettings(s) {
      fs.writeFileSync(settingsFile, JSON.stringify(s, null, 2));
    },
    clipDir: (role) => {
      if (!ROLES.includes(role)) throw new Error(`Fase no válida: ${role}. Usa: ${ROLES.join(', ')}`);
      return path.join(dirs.clips, role);
    },
    // { apertura: ['a.mp4', ...], ... } (solo nombres)
    listClips() {
      return Object.fromEntries(ROLES.map((r) => [r, fs.readdirSync(path.join(dirs.clips, r)).filter((f) => VIDEO_EXT.test(f)).sort()]));
    },
    // Rutas absolutas de las fases con clips, en orden.
    projectRoles() {
      const clips = ws.listClips();
      const roles = {};
      for (const r of ROLES) if (clips[r].length) roles[r] = clips[r].map((f) => path.join(dirs.clips, r, f));
      return roles;
    },
    listOutputs() {
      return fs.readdirSync(dirs.out).filter((f) => VIDEO_EXT.test(f)).sort();
    },
    clearOutputs() {
      for (const f of ws.listOutputs()) fs.rmSync(path.join(dirs.out, f));
    },
    // Copia un archivo del usuario a una carpeta de la app.
    importFile(src, dir) {
      if (!fs.existsSync(src)) throw new Error(`No existe: ${src}`);
      fs.mkdirSync(dir, { recursive: true });
      const target = uniquePath(dir, safeName(src));
      fs.copyFileSync(src, target);
      return target;
    },
    musicForGeneration() {
      const m = ws.loadSettings().music;
      return m && fs.existsSync(m.path) ? { path: m.path, drop: m.drop, volume: m.volume ?? 1 } : undefined;
    },
  };
  return ws;
}

module.exports = { ROLES, VIDEO_EXT, AUDIO_EXT, defaultWorkspace, safeName, uniquePath, openWorkspace };
