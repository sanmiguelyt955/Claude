---
name: ver-video
description: Ve y OYE videos y audios en local, como Gemini según su documentación pública. Cada segundo con [MM:SS] trae el cuadro, lo que se dice (Whisper con VAD, sin frases inventadas) y lo que suena (527 tipos de sonido de AudioSet: música, perro, lluvia, aplausos, sirena, risa...) con su volumen. Incluye BPM/beats, silencios, tono/velocidad/emoción de la voz, espectrograma, preguntas libres al audio (CLAP), fps propio, recorte, cortes de escena y modo agentic para videos largos. Úsala SIEMPRE que el usuario pida ver, escuchar, analizar, describir, resumir o buscar momentos en un video o audio, o cuando falle el conector de Gemini Video. Sin APIs en la nube.
---

# ver-video: ver y oír como Gemini, 100 % local

Reimplementación clean room de lo que Google documenta para Gemini
(https://ai.google.dev/gemini-api/docs/video-understanding). No usa Gemini, Google ni APIs de pago.
Claude no acepta audio: el sonido se traduce a texto (transcripción, etiquetas de sonido, música, voz) y a imagen (espectrograma).

## Herramientas MCP (servidor `video-nube`, ver `.mcp.json`)
| Herramienta | Para qué |
|---|---|
| `ver_video(video_path, processing="static", fps=1, start_offset, end_offset, media_resolution, escuchar=True, escenas=False)` | **static**: resumen + espectrograma + por cada cuadro `[MM:SS] voz: «…» · sonido: … · dB` y la imagen. **agentic**: transcripción + mapa de sonidos + cortes de escena, sin imágenes |
| `cargar_segmento(video_path, id \| inicio, fin, fps, …)` | Modo agentic: cuadros y sonido solo del tramo pedido |
| `escuchar_audio(path, start_offset, end_offset)` | Audio o pista de video (mp3, wav, m4a…): transcripción, sonidos por segundo, tramos, silencios, BPM, voz y espectrograma |
| `preguntar_audio(path, descripciones[], start_offset, end_offset)` | Pregunta libre con CLAP: `["a dog barking", "a cat", "rain"]` → probabilidad de cada una. Las descripciones van en inglés |
| `analizar_video_nube()` | Análisis fijo de `datos/videos/prueba.mp4` (cuadros cada 2 s + transcripción) |

Sin MCP: `python vision_local.py <video> [--processing agentic] [--fps 2] [--start 30 --end 60] [--res low] [--escenas] [--sin-audio]`
y `python escucha_local.py <audio|video> [--preguntar "a dog" "rain" --start 5 --end 10]`.

## Cómo elegir (las recomendaciones de Google y lo que hemos medido)
1. Video corto (≤ 2 min): `static` a 1 FPS, con escucha.
2. Acción rápida o edición con muchos cortes: `escenas=True`, o sube `fps` (2-5) solo en el tramo importante.
3. Video largo (> 5-10 min) o pregunta concreta: `agentic`. Lee la transcripción, los tramos sonoros y los cortes, y carga solo los tramos necesarios.
4. Duda sobre un sonido concreto: confírmalo con `preguntar_audio` dando 3-6 alternativas plausibles.
5. Ritmo y edición: usa `bpm` y `beats` de los tramos musicales.
6. Hay un máximo de 120 cuadros por respuesta. Si se pasa, usa agentic, baja fps o recorta.

## Al responder
- Cita momentos como `MM:SS`.
- Separa lo que **se ve** (cuadros), lo que **se dice** (transcripción) y lo que **suena** (sonidos, música).
- Las etiquetas de sonido son probabilidades: por debajo de 0.3, dilo con cautela o confírmalo con CLAP.
- La emoción de la voz (neutral, alegre, enfadado, triste) es orientativa.
- No afirmes lo que pasa entre dos cuadros. Si importa, recarga con más fps.
- La primera pasada de un video tarda en CPU aproximadamente su duración: descarga los modelos una vez y después usa la caché en `datos/vision/<id>/`.
