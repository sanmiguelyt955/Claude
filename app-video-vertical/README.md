# Vertiflow

De un puñado de clips, muchos vídeos verticales distintos y listos para subir.
Código propio, escrito desde cero según
[`docs/app-video-vertical/especificacion.md`](../docs/app-video-vertical/especificacion.md).
Todo se procesa en tu ordenador.

## Funciones

| Función | Dónde | Cómo funciona |
|---|---|---|
| Combinar clips en serie | Montaje | Un clip de cada fase (apertura → demostración → cierre), sin repetir combinaciones. |
| Música a tiempo | Montaje → Música | Detecta el momento fuerte (mayor subida de energía) y lo alinea con la entrada del producto. Se puede mover a mano sobre la onda. |
| Analizar virales | Analizar viral | Enlace (yt-dlp) o archivo → cortes de plano (FFmpeg), fotograma por plano y textos en pantalla (OCR con tesseract.js). |
| Separar voz y música | Separar voz | IA con Demucs si está instalado; si no, separación básica con FFmpeg. |
| Directo al teléfono | Al móvil | Código QR a una página en tu WiFi, protegida con una clave que cambia en cada arranque. |
| Trabajar con Claude | Asistente | Servidor MCP con 8 herramientas (`mcp/server.js`). |
| Exportación | Montaje → Generar | 720p, 1080p, 1440p o 4K vertical; sin marca de agua y sin metadatos. |
| Procesado local | — | La interfaz solo responde desde este ordenador; desde la WiFi solo se abre la página del móvil. |
| Aviso de versiones | Al abrir la app | Lee `versiones.json` y avisa si hay una versión más nueva. |

## Requisitos

- Node.js 22 o superior
- FFmpeg en el PATH (o `VV_FFMPEG`/`VV_FFPROBE`). El instalador de escritorio lo incluye.
- Opcional: `yt-dlp` para analizar enlaces; `pip install demucs` para separar voz con IA.
- La primera vez que se leen textos, tesseract.js descarga el idioma (necesita internet).

## Uso

### Interfaz (recomendado)

```bash
npm install
npm start
```

Se abre en el navegador. Los archivos van a la carpeta `~/Vertiflow` (cámbiala con `VV_WORKSPACE`).
En Windows también puedes hacer doble clic en `Iniciar Vertiflow.bat`; en Mac, en `Iniciar Vertiflow.command`.

### App de escritorio

```bash
npm install
npm run desktop          # abre la ventana
npm run dist:win         # instalador .exe (en Windows)
npm run dist:mac         # .dmg para chip Apple e Intel (en Mac)
```

### Línea de comandos

```bash
node bin/cli.js generar --apertura a.mp4 --demo d1.mp4,d2.mp4 --cierre c.mp4 \
  --musica cancion.mp3 --max 20 --resolucion 1080p --out salida
node bin/cli.js musica cancion.mp3
node bin/cli.js analizar https://www.tiktok.com/@cuenta/video/123
node bin/cli.js separar clip.mp4
node bin/cli.js version
```

### Con Claude (MCP)

Añade a la configuración de Claude Desktop o Claude Code:

```json
{
  "mcpServers": {
    "vertiflow": {
      "command": "node",
      "args": ["/ruta/a/app-video-vertical/mcp/server.js"],
      "env": { "VV_WORKSPACE": "/ruta/a/tu/carpeta/Vertiflow" }
    }
  }
}
```

Herramientas: `estado_proyecto`, `anadir_clips`, `quitar_clip`, `poner_musica`,
`generar_videos`, `analizar_viral`, `separar_voz`, `enlace_movil`.

## Estructura

```
src/            motor: combinaciones, render, música, análisis viral, separación, móvil, versiones
server/         servidor local (API + archivos)
public/         interfaz
mcp/            servidor MCP para Claude
electron/       envoltorio de escritorio
bin/cli.js      línea de comandos
test/           tests unitarios, de integración (FFmpeg real) y de extremo a extremo (API y MCP)
```

## Variables de entorno

| Variable | Uso |
|---|---|
| `VV_WORKSPACE` | Carpeta de trabajo (por defecto `~/Vertiflow`) |
| `PORT`, `VV_HOST` | Puerto (4321) e interfaz de red (0.0.0.0) del servidor |
| `VV_FFMPEG`, `VV_FFPROBE`, `VV_YTDLP`, `VV_PYTHON` | Rutas a binarios |
| `VV_DEMUCS_MODEL` | Modelo de Demucs (`htdemucs`) |
| `VV_OCR_LANGS`, `VV_DISABLE_OCR` | Idiomas del OCR (`spa+eng`) o desactivarlo |
| `VV_UPDATE_URL` | URL de `versiones.json` |

## Publicar una versión

1. Sube `version` en `package.json` y en `versiones.json`.
2. Construye los instaladores y súbelos (por ejemplo, a una release de GitHub).
3. Pon sus enlaces en `versiones.json` → `descargas` (`win-x64`, `mac-arm64`, `mac-x64`) y súbelo a `main`.

## Tests

```bash
npm test
```

26 pruebas. Las de integración y de extremo a extremo usan FFmpeg real y se omiten si no está instalado.
