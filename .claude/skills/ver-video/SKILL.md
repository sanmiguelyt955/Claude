---
name: ver-video
description: Ve y entiende videos en local, de la misma forma que Gemini según su documentación pública. Toma 1 cuadro por segundo con marcas MM:SS, alinea la voz transcrita con cada cuadro, permite fps propio, recorte inicio/fin, media_resolution low/default y un modo agentic (primero la transcripción, luego solo los tramos necesarios). Úsala SIEMPRE que el usuario pida ver, analizar, describir, resumir o buscar momentos en un video (archivo local), o cuando el conector de Gemini Video falle. Sin APIs en la nube: ffmpeg + faster-whisper.
---

# ver-video (visión de video estilo Gemini, 100 % local)

Reimplementación clean room de cómo Google documenta que Gemini procesa video
(https://ai.google.dev/gemini-api/docs/video-understanding). No usa Gemini, Google ni APIs de pago.

## Herramientas MCP (servidor `video-nube`, `.mcp.json` en la raíz)
- `ver_video(video_path, processing="static", fps=1, start_offset=0, end_offset=0, media_resolution="default", idioma="auto")`
  - **static**: devuelve el resumen (duración, resolución, fps, tokens estimados con las cifras de Google)
    y después, por cada cuadro, `[MM:SS] voz: «…»` seguido de la imagen. Es lo mismo que Gemini tiene en contexto.
  - **agentic**: devuelve solo la transcripción con segmentos `seg_000…` (barato). Después usa `cargar_segmento`.
- `cargar_segmento(video_path, id="seg_003" | inicio, fin, fps, media_resolution)`: cuadros de ese tramo.
- `analizar_video_nube()`: análisis fijo de `datos/videos/prueba.mp4` (cuadros cada 2 s + transcripción) en JSON.

Sin MCP, usa el CLI: `python vision_local.py <video> [--processing agentic] [--fps 2] [--start 30 --end 60] [--res low] [--segmento seg_002]`
Imprime el JSON; mira los cuadros con Read sobre las rutas de `linea_de_tiempo`.

## Cómo elegir (igual que las recomendaciones de Google)
1. Video corto (≤ 2 min): `static` a 1 FPS.
2. Acción rápida o cortes de edición: sube `fps` (2-5) solo en el tramo que importa (`start_offset`/`end_offset`).
3. Video largo (> 5-10 min) o pregunta concreta: `agentic`. Lee la transcripción y carga solo los tramos relevantes.
4. Mucho video y poco detalle: `media_resolution="low"` (384 px; 66 tokens/cuadro en Gemini).
5. Límite de 120 cuadros por respuesta: si lo supera, la herramienta te pide `agentic`, bajar fps o recortar.

## Al responder
- Cita momentos con `MM:SS`, como Gemini.
- Distingue lo que **se ve** (cuadros) de lo que **se dice** (transcripción).
- Entre cuadros hay huecos: no afirmes lo que pasa entre dos muestras. Si importa, vuelve a cargar con más fps.
- Salidas en `datos/vision/<id>/` (no van a git). La transcripción se guarda en caché por video.
