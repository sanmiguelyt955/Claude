---
name: ver-video
description: Ve y OYE videos y audios como Gemini (según su documentación pública), con el conector video-nube (Hugging Face Space o local). Cada segundo [MM:SS] trae el cuadro, lo que se dice con quién lo dice (H1, H2...), lo que suena (AudioSet: música, perro, lluvia, aplausos, sirena...) y el volumen; además BPM, silencios, tono y emoción de la voz, espectrograma, cortes de escena, modo agentic para videos largos, y "oídos de verdad" (un modelo que escucha el audio original y responde preguntas). Úsala SIEMPRE que el usuario pida ver, escuchar, analizar, describir, transcribir, resumir o buscar momentos en un video o audio (archivo, subida o enlace), o cuando falle el conector de Gemini Video.
---

# ver-video: ver y oír como Gemini

Clean room de lo que Google documenta para Gemini (https://ai.google.dev/gemini-api/docs/video-understanding).
No usa Gemini ni APIs de pago: modelos abiertos en nuestro servidor (Whisper, AST/AudioSet, CLAP, WavLM, Gemma 4 E2B).

## 0. Conexión
- **Nube (claude.ai, Cowork o Claude Code):** conector MCP `https://<usuario>-video-nube.hf.space/<MCP_CLAVE>/mcp`.
  El servidor no ve tus archivos locales, así que pásale **una URL** o **súbelo** primero:
  ```bash
  curl -s -F "archivo=@video.mp4" https://<usuario>-video-nube.hf.space/<MCP_CLAVE>/subir
  # -> {"path": "subida:3f2a..."}   y usa ese valor como video_path / path
  ```
  (La URL de subida es la del conector cambiando `/mcp` por `/subir`.)
- **Local (este repo):** `.mcp.json` arranca `servidor_nube.py` por stdio y acepta rutas locales.
- Si el servidor del Space está dormido, la primera llamada tarda 1-3 min en despertarlo; reintenta.

## 1. Herramientas
| Herramienta | Para qué |
|---|---|
| `ver_video(video_path, processing="static", fps=1, start_offset, end_offset, media_resolution, escuchar=True, escenas=False)` | **static**: resumen + espectrograma + por cada cuadro `[MM:SS] voz: «H1: …» · sonido: … · dB` y la imagen. **agentic**: transcripción con hablantes + mapa de sonidos + cortes, sin imágenes |
| `cargar_segmento(video_path, id \| inicio, fin, fps, escenas)` | Modo agentic: solo el tramo pedido |
| `escuchar_audio(path, start_offset, end_offset)` | Audio o pista de un video: transcripción con hablantes, sonidos por segundo, silencios, BPM, voz y espectrograma |
| `oir(path, pregunta, start_offset, end_offset, con_cuadros=False)` | **Oídos de verdad**: un modelo multimodal escucha la señal original (y ve cuadros si `con_cuadros`) y responde. Ideal para tono, emoción, ironía, acento, intención. Tramos de ≤30 s |
| `preguntar_audio(path, descripciones[], start_offset, end_offset)` | CLAP: probabilidad de cada descripción (en inglés), p. ej. `["a siren", "a dog barking", "rain"]` |

Entradas válidas: `subida:<id>`, URL directa (`.mp4`, `.mp3`…), enlaces de YouTube/TikTok (las plataformas suelen bloquear servidores; si falla, sube el archivo) o ruta local (solo en modo local).

## 2. Cómo trabajar (como Gemini)
1. Video ≤ 2 min: `ver_video` static a 1 FPS.
2. Edición rápida o acción: `escenas=True`, o sube `fps` (2-5) solo en el tramo importante.
3. Video largo (> 5-10 min) o pregunta concreta: `processing="agentic"`, lee la transcripción, los tramos sonoros y los cortes, y después `cargar_segmento` solo donde haga falta.
4. Cómo suena la voz (emoción, sarcasmo, intención) o audio+imagen a la vez: `oir`.
5. Confirmar un sonido: `preguntar_audio` con 3-6 alternativas plausibles.
6. Ritmo para editar: `bpm` y `beats` de los tramos musicales.
7. Máximo 120 cuadros por respuesta: si se pasa, usa agentic, baja fps o recorta.

## 3. Fiabilidad (medida en pruebas)
- Transcripción con VAD: no inventa frases sobre música, ruido o silencio. Las palabras justo en un cambio de hablante pueden caer en el vecino.
- Sonidos (AudioSet) y CLAP: muy fiables (CLAP acertó 7 de 7). Una etiqueta por debajo de 0.3 es dudosa.
- `oir`: excelente con la voz; **flojo contando hablantes o con sonidos no verbales**. Contrasta siempre con `evidencia_hablantes` y `evidencia_detector_sonidos`, que vienen en su respuesta.
- No afirmes lo que pasa entre dos cuadros; si importa, recarga con más fps.

## 4. Al responder
Cita los momentos como `MM:SS`, y separa lo que **se ve**, lo que **se dice** (y quién: H1, H2…) y lo que **suena**.
