# Especificación: app de vídeos verticales a partir de clips

Documento de producto de nuestra propia app (nombre provisional: **Vertiflow**).
Se basa solo en las funciones que la web pública de otra app describe. No usa
código, binarios, diseño ni textos de esa app; todo se implementó desde cero.
Código: [`app-video-vertical/`](../../app-video-vertical/).

## Objetivo

De un conjunto de clips, generar muchos vídeos verticales distintos entre sí,
listos para subir a redes.

## Funciones

| # | Función | Estado | Implementación |
|---|---------|--------|----------------|
| 1 | Combinar clips en serie | Hecho | `src/combinations.js`, `src/render.js`, `src/project.js` |
| 2 | Música a tiempo | Hecho | `src/music.js`: drop = mayor subida de energía RMS; ajuste manual en la interfaz |
| 3 | Analizar vídeos virales | Hecho | `src/viral.js`: yt-dlp + `select=gt(scene)` de FFmpeg + OCR tesseract.js |
| 4 | Separar voz y música | Hecho | `src/separate.js`: Demucs (IA) o respaldo FFmpeg |
| 5 | Envío al móvil por WiFi | Hecho | `src/share.js`: página con token + código QR |
| 6 | Trabajar con un asistente | Hecho | `mcp/server.js`: 8 herramientas MCP |
| 7 | Exportación hasta 4K, sin marca de agua ni metadatos | Hecho | `src/render.js`: presets 720p–4K, `-map_metadata -1`, bitexact |
| 8 | Procesado local | Hecho | La API solo acepta peticiones desde el propio ordenador |
| 9 | Aviso de versiones | Hecho | `src/updates.js` + `versiones.json` |

## Decisiones tomadas

1. **Stack**: Node.js 22 + FFmpeg; interfaz web local; Electron para escritorio (Mac y Windows).
2. **Motor de vídeo**: FFmpeg (escala para cubrir 9:16, recorte centrado, concat, mezcla de audio).
3. **IA**: Demucs `htdemucs` para separar voz (local, opcional); tesseract.js para texto en pantalla.
4. **Carpeta de trabajo única** (`~/Vertiflow`), compartida por interfaz, CLI y MCP.
5. **Seguridad**: desde la red solo se accede a `/m/<token>`; el resto responde 403.

## Verificado en el entorno de desarrollo

- 26 tests (unitarios, integración con FFmpeg real, API y MCP de extremo a extremo).
- Interfaz probada en Chromium (Playwright): subir música, generar, analizar, separar, QR, página del móvil, modo oscuro; sin errores de consola.
- Demucs instalado en un entorno aparte: separación con IA de extremo a extremo.
- Render 4K (2160x3840).

## Pendiente de verificar en un ordenador real

- `npm run desktop` y los instaladores (`dist:win`, `dist:mac`): Electron no se pudo descargar en el entorno de desarrollo.
- Análisis de enlaces reales de TikTok/Reels con yt-dlp (depende de la red y de cada plataforma).
- Firma de código de Apple y Microsoft (sin ella, el sistema avisa en la primera apertura).

## Fuera de alcance (primera versión)

- Cuentas de usuario, pagos y sincronización en la nube.
- Publicación automática en redes.
