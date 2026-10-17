# Ingeniería inversa: la skill /watch (observada con REA)

Skill: `watch` 0.3.2 (plugin de Claude Code). Es Python con solo la librería
estándar, más `ffmpeg`, `ffprobe` y `yt-dlp`. Se estudió de dos formas, el 17
de octubre de 2026:

1. **REA `capture-process`:** se ejecutó `watch.py` con el motor local sobre
   un video de prueba de 6 s (rojo y luego azul, con voz) y REA registró la
   salida de la terminal, los procesos que lanzó y los archivos que dejó.
2. **Lectura del código** (`scripts/*.py`), para lo que la ejecución no
   cubre: el motor Gemini, que necesita una clave que aquí no hay.

## Lo que hizo en la ejecución (evidencia de REA)

Procesos, en orden:

1. `ffprobe` lee duración, resolución y pistas.
2. `ffmpeg -h full` comprueba qué opciones soporta el FFmpeg instalado.
3. `ffmpeg` busca cambios de escena con `select='eq(n,0)+gt(scene,0.2)'`.
4. Como el video casi no cambia, recurre a un muestreo uniforme.
5. `ffmpeg` reduce cada fotograma a 16×16 píxeles para descartar los casi
   iguales.

Resultado: **2 fotogramas de 12 candidatos** (10 casi idénticos descartados),
en `frames/frame_0001.jpg` (00:00) y `frame_0007.jpg` (00:03). La
transcripción quedó "no disponible": sin subtítulos, sin clave de Groq/OpenAI
y sin WhisperX instalado, `/watch` no puede escuchar. Terminó con código 0 y
sin procesos huérfanos.

## Cómo funciona (código)

- **Subtítulos primero.** Antes de bajar el video, pide a yt-dlp solo la
  información y los subtítulos. Prefiere los manuales a los automáticos, del
  idioma original, en VTT. Solo transcribe el audio si no hay subtítulos.
- **Presupuesto de fotogramas** por nivel de detalle: `transcript` (sin
  fotogramas), `efficient` (keyframes, tope 50), `balanced` (escenas, tope
  100) y `token-burner` (sin tope). Hasta 2 fps en uniforme y 512 px de ancho.
- **Descarte de casi duplicados:** si la diferencia media por píxel de la
  miniatura 16×16 contra el último fotograma guardado es ≤ 2 (de 255), se
  descarta. Esto ahorra imágenes en videos estáticos.
- **Marcas pedidas** (`--timestamps 4:32,7:10`): reserva fotogramas en los
  momentos que el presentador señala ("miren aquí").
- **Motor Gemini:** usa la **Interactions API** (`POST /v1beta/interactions`)
  con `processing: "agentic"`: Gemini recorre el video y pide la
  transcripción o los fotogramas que necesita. Para un tramo
  (`--start/--end`) usa `static` con `start_offset`/`end_offset`. Los videos
  locales se suben con la **Files API** (subida reanudable por bloques; espera
  a que el estado sea `ACTIVE`) y se **borran** después de la respuesta.
- **Errores:** los clasifica (`auth`, `quota`, `service`, `network`,
  `rejected`, `upload`) con una pista para el usuario, y **no cambia de
  motor sin preguntar**. No reintenta: un 503 termina la ejecución.

## Problemas encontrados en /watch

- Su modelo por defecto también es `gemini-3.7-flash` (`config.py`), que ya
  no aparece en la lista de modelos de Google. Se puede cambiar sin tocar la
  skill con `WATCH_GEMINI_MODEL=gemini-3.8-flash` en `~/.config/watch/.env`.
- Ante un 503 no reintenta ni prueba otro modelo.

## Qué conviene traer a Video Analyzer

1. **Descartar fotogramas casi iguales** antes de mandarlos al modelo:
   menos imágenes por tramo, peticiones más chicas y más baratas, y menos
   saturación.
2. **Subtítulos de la plataforma antes que Whisper** para TikTok y YouTube:
   más rápido que transcribir, y además ya separados por frases.
3. **Gemini con la Files API**: subir el video una vez y reutilizarlo,
   como recomienda Google para peticiones de más de 20 MB.
4. **Marcas pedidas**: fotogramas extra en los momentos que la
   transcripción señala.

Estado: el 1 y el 2 ya están en la app; el 3 ya lo usaba el motor Gemini
de video completo (`packages/ai-router/src/upload.ts`); el 4 no hace falta
porque el análisis local guarda un fotograma por segundo como mínimo.

Lo que Video Analyzer ya hace mejor: escucha sin claves ni descargas grandes
(nuestro Whisper), reintenta y cambia de modelo ante saturación, y guarda el
avance para no repetir trabajo.
