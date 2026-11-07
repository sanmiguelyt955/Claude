#!/usr/bin/env node
'use strict';

// Servidor MCP: permite a Claude preparar los vídeos usando la misma carpeta de trabajo que la app.
const path = require('node:path');
const fs = require('node:fs');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');
const express = require('express');

const pkg = require('../package.json');
const { openWorkspace, ROLES } = require('../src/workspace');
const { totalCombinations } = require('../src/combinations');
const { generate } = require('../src/project');
const { analyzeSong } = require('../src/music');
const viral = require('../src/viral');
const { separate } = require('../src/separate');
const { RESOLUTIONS } = require('../src/render');
const { lanAddress, newToken, qr, mountShare } = require('../src/share');

const ws = openWorkspace();
const server = new McpServer({ name: 'vertiflow', version: pkg.version });

const text = (obj) => ({ content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2) }] });
const fail = (err) => ({ isError: true, content: [{ type: 'text', text: err.message || String(err) }] });
const wrap = (fn) => async (args) => {
  try {
    return await fn(args || {});
  } catch (err) {
    return fail(err);
  }
};

function projectState() {
  const clips = ws.listClips();
  const used = Object.fromEntries(Object.entries(clips).filter(([, v]) => v.length));
  const m = ws.loadSettings().music;
  return {
    carpeta: ws.dirs.root,
    fases: clips,
    combinacionesPosibles: Object.keys(used).length ? totalCombinations(used) : 0,
    musica: m ? { archivo: m.name, duracion: Number(m.duration?.toFixed(2)), momentoFuerte: m.drop, volumen: m.volume ?? 1 } : null,
    videosGenerados: ws.listOutputs().map((f) => path.join(ws.dirs.out, f)),
  };
}

server.registerTool(
  'estado_proyecto',
  {
    title: 'Estado del proyecto',
    description: 'Muestra los clips de cada fase (apertura, demo, cierre), la música, cuántas combinaciones distintas se pueden sacar y los vídeos ya generados.',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  },
  wrap(async () => text(projectState()))
);

server.registerTool(
  'anadir_clips',
  {
    title: 'Añadir clips',
    description: 'Copia clips de vídeo del ordenador a una fase del montaje. Fases: apertura (gancho), demo (aparece el producto), cierre (resultado o llamada a la acción).',
    inputSchema: {
      fase: z.enum(ROLES),
      rutas: z.array(z.string()).min(1).describe('Rutas absolutas a los vídeos'),
    },
  },
  wrap(async ({ fase, rutas }) => {
    const dir = ws.clipDir(fase);
    const added = rutas.map((r) => path.basename(ws.importFile(path.resolve(r), dir)));
    return text({ añadidos: added, ...projectState() });
  })
);

server.registerTool(
  'quitar_clip',
  {
    title: 'Quitar clip',
    description: 'Quita un clip de una fase por su nombre de archivo.',
    inputSchema: { fase: z.enum(ROLES), nombre: z.string() },
    annotations: { destructiveHint: true },
  },
  wrap(async ({ fase, nombre }) => {
    const file = path.join(ws.clipDir(fase), path.basename(nombre));
    if (!fs.existsSync(file)) throw new Error(`No hay ningún clip «${nombre}» en ${fase}.`);
    fs.rmSync(file);
    return text(projectState());
  })
);

server.registerTool(
  'poner_musica',
  {
    title: 'Poner música',
    description: 'Usa una canción para todos los vídeos. Detecta su momento fuerte (drop) y lo hace coincidir con la entrada del producto. Se puede indicar el momento a mano en segundos.',
    inputSchema: {
      ruta: z.string().optional().describe('Ruta absoluta a la canción. Si se omite, se ajusta la canción actual.'),
      momento_fuerte: z.number().min(0).optional().describe('Segundo de la canción que debe coincidir con el producto'),
      volumen: z.number().min(0).max(2).optional(),
      quitar: z.boolean().optional().describe('true para quitar la música'),
    },
  },
  wrap(async ({ ruta, momento_fuerte, volumen, quitar }) => {
    const settings = ws.loadSettings();
    if (quitar) {
      delete settings.music;
      ws.saveSettings(settings);
      return text('Música quitada.');
    }
    if (ruta) {
      const file = ws.importFile(path.resolve(ruta), ws.dirs.music);
      const a = await analyzeSong(file);
      settings.music = { path: file, name: path.basename(file), drop: a.drop, detectedDrop: a.drop, duration: a.duration, peaks: a.peaks, volume: 1 };
    }
    if (!settings.music) throw new Error('No hay música. Indica la ruta de una canción.');
    if (momento_fuerte !== undefined) {
      if (momento_fuerte > settings.music.duration) throw new Error(`La canción dura ${settings.music.duration.toFixed(1)} s.`);
      settings.music.drop = momento_fuerte;
    }
    if (volumen !== undefined) settings.music.volume = volumen;
    ws.saveSettings(settings);
    return text(projectState().musica);
  })
);

server.registerTool(
  'generar_videos',
  {
    title: 'Generar vídeos',
    description: 'Genera vídeos verticales 9:16 distintos combinando un clip de cada fase, sin repetir combinaciones, con la música alineada. Sin marca de agua ni metadatos. Reemplaza la tanda anterior.',
    inputSchema: {
      cantidad: z.number().int().min(1).max(500).default(10),
      resolucion: z.enum(Object.keys(RESOLUTIONS)).default('1080p'),
      volumen_clips: z.number().min(0).max(1).optional().describe('Volumen del audio original de los clips (con música, 0.35 por defecto)'),
      semilla: z.number().int().optional().describe('Para repetir exactamente la misma selección'),
      con_musica: z.boolean().default(true),
    },
  },
  wrap(async ({ cantidad = 10, resolucion = '1080p', volumen_clips, semilla, con_musica = true }) => {
    const roles = ws.projectRoles();
    if (!Object.keys(roles).length) throw new Error('No hay clips. Añádelos con anadir_clips.');
    ws.clearOutputs();
    const videos = await generate({
      roles,
      count: cantidad,
      seed: semilla ?? Math.floor(Math.random() * 1e9),
      resolution: resolucion,
      clipVolume: volumen_clips,
      productRole: 'demo',
      music: con_musica ? ws.musicForGeneration() : undefined,
      outDir: ws.dirs.out,
    });
    return text({ generados: videos.length, carpeta: ws.dirs.out, videos });
  })
);

server.registerTool(
  'analizar_viral',
  {
    title: 'Analizar vídeo viral',
    description: 'Analiza un vídeo (enlace de TikTok, Reels, Shorts o ruta local): cada cambio de plano con sus tiempos, los textos en pantalla y un resumen del ritmo.',
    inputSchema: {
      fuente: z.string().describe('Enlace https://... o ruta absoluta a un vídeo'),
      sensibilidad: z.number().min(0.05).max(0.9).default(0.3).describe('Umbral de corte: más bajo detecta más cortes'),
      leer_textos: z.boolean().default(true),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  wrap(async ({ fuente, sensibilidad = 0.3, leer_textos = true }) => {
    const id = new Date().toISOString().replace(/[:.]/g, '-');
    const input = viral.isUrl(fuente) ? fuente : path.resolve(fuente);
    const r = await viral.analyze(input, { workDir: path.join(ws.dirs.viral, id), threshold: sensibilidad, ocr: leer_textos });
    await viral.closeOcr();
    return text({
      resumen: r.summary,
      planos: r.shots.map((s) => ({ plano: s.index, inicio: s.start, fin: s.end, duracion: s.duration, texto: s.text || null, fotograma: s.frame })),
      avisoTextos: r.ocrError,
    });
  })
);

server.registerTool(
  'separar_voz',
  {
    title: 'Separar voz y música',
    description: 'Separa la voz del fondo musical de un vídeo o audio. Usa IA (Demucs) si está instalada; si no, una separación básica.',
    inputSchema: { ruta: z.string().describe('Ruta absoluta al vídeo o audio') },
  },
  wrap(async ({ ruta }) => {
    const id = new Date().toISOString().replace(/[:.]/g, '-');
    const r = await separate(path.resolve(ruta), path.join(ws.dirs.separate, id));
    return text({ voz: r.voice, musica: r.music, metodo: r.method === 'demucs' ? 'IA (Demucs)' : 'básico (instala Demucs para más calidad)' });
  })
);

let shareServer = null;
server.registerTool(
  'enlace_movil',
  {
    title: 'Pasar vídeos al móvil',
    description: 'Abre un enlace en la red WiFi para descargar los vídeos generados en el teléfono. Devuelve la URL y un código QR para escanear.',
    inputSchema: {},
  },
  wrap(async () => {
    if (!shareServer) {
      const app = express();
      const token = newToken();
      const base = mountShare(app, { token, getDir: () => ws.dirs.out });
      const srv = await new Promise((resolve, reject) => {
        const s = app.listen(0, '0.0.0.0', () => resolve(s));
        s.on('error', reject);
      });
      shareServer = { url: `http://${lanAddress()}:${srv.address().port}${base}` };
    }
    const code = await qr(shareServer.url);
    return text(`Abre en el móvil (misma WiFi): ${shareServer.url}\n\n${code.terminal}`);
  })
);

async function main() {
  await server.connect(new StdioServerTransport());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
