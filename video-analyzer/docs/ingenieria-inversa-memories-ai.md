# Ingeniería inversa: memories.ai (observado desde fuera)

Fuentes públicas revisadas: `memories.ai` (sitio Webflow), `memories.ai/llms.txt`,
y la documentación de la API en `api-tools.memories.ai`. Las secciones 1 a 5
salen de la documentación pública. La sección 6 añade lo que se observó de la
app real (`memories.ai/app`) con [REA](https://github.com/morluto/rea).

## 1. Qué ofrecen

- Análisis de video con "memoria visual persistente" (llaman LVMM a su modelo).
- Ingesta desde 20+ plataformas (YouTube, TikTok, Instagram, X, Vimeo…) y subida directa.
- Preguntas y respuestas sobre el video con marcas de tiempo, búsqueda de momentos
  por texto, resúmenes, transcripción con diarización de hablantes, OCR, detección de
  objetos/rostros.
- Biblioteca indexada: búsqueda entre muchos videos, no solo uno.

## 2. Arquitectura que se deduce de la API

La API no es un "modelo que mira un video": es una **cadena de servicios
especializados**, y cada uno responde una pregunta distinta.

| Capacidad            | Endpoints públicos (v1)                                                  | Qué resuelve |
|----------------------|---------------------------------------------------------------------------|--------------|
| Ingesta              | `POST /upload`, `POST /upload/signed-url`, scraping por plataforma        | Llevar el video a un almacén propio |
| **Ver**              | `POST /video/extract-frames`, "Video Frame Description", "Video Summary"   | Frames muestreados + descripción visual |
| **Escuchar**         | Transcripción (ElevenLabs, AssemblyAI, Whisper), diarización multi-hablante | Audio separado del video, con hablantes |
| Analizar             | `POST /vu/chat/completions` (Q&A), "Video Model Selection" (Gemini, Nova, Qwen) | Razonar sobre el contenido ya extraído |
| Memoria / búsqueda   | `embeddings/video`, `embeddings/text`, `embeddings/image`                 | Recuperar momentos entre videos |
| Tiempo real          | Streams con moderación y "understanding" por callback o WebSocket         | Análisis continuo |

Conclusiones de diseño que se pueden copiar:

1. **Ver y escuchar son etapas separadas.** Los frames y la transcripción se
   producen con herramientas distintas, y el razonamiento final solo ve el
   resultado de ambas. Esto es lo opuesto a mandar el video entero a un solo modelo.
2. **Selección de modelo por capacidad**, no un modelo fijo. Ofrecen varios motores
   de video y de imagen detrás de la misma forma de respuesta.
3. **Q&A y búsqueda reutilizan un índice**, no re-analizan el video en cada pregunta.
4. **Timestamps como moneda común.** Cada salida (escena, frase, texto en pantalla)
   lleva inicio y fin, y así se puede saltar en el reproductor y buscar.

## 3. Qué no se puede afirmar

- Si LVMM es un modelo propio o una capa sobre otros modelos: la documentación
  lista motores de terceros para video, pero no detalla su composición interna.
- Cómo indexan la biblioteca (vector DB, tamaño de embedding, granularidad).
- Límites reales del plan gratis fuera de los créditos publicados.

## 4. Estado de la API

La documentación indica que **la API 1.0 se descontinúa el 13 de agosto de 2026**
y que todo pasa a la 2.0 ("Video Datalake": un host, una clave, una especificación
OpenAPI para ingesta, búsqueda y lectura de momentos). Cualquier integración nueva
debe apuntar a la 2.0.

## 5. Qué adoptar en video-analyzer

- Separar **frames (ver)** y **transcripción (escuchar)** en etapas con proveedor intercambiable.
- Un **fallback por proveedor** ante 503/saturación, en vez de depender de un solo modelo.
- Guardar cada salida con timestamps en un formato común y reutilizarla para preguntas.

## 6. La app por dentro, observada con REA

Herramienta: REA 6.5.0 (`rea-agents`), que se conecta a un Chromium por el
protocolo de depuración (CDP) y analiza los scripts que la página carga, sin
ejecutarlos. Fecha: 17 de octubre de 2026. Sin iniciar sesión.

Pasos:

1. `rea list-browser-targets` con Chromium abierto en `memories.ai/app`.
2. `rea inspect-web-page`: 90 scripts, todos servidos desde `memories.ai`.
3. `rea analyze-web-bundle`: se analizaron 62 de 62 scripts, sin errores de
   análisis. El resultado fueron 112 candidatos a endpoint y las huellas de
   Next.js y React.

Aunque la página es la de login, el bundle ya trae el cliente completo de la
API, así que se ve qué hace la app aunque no se haya visto con sesión.

### Qué tiene la app (endpoints `serve/...`)

| Área | Endpoints | Qué revela |
|---|---|---|
| Videos | `video/getVideo`, `video/getParsedVideo`, `video/retry`, `video/delete`, `video/hide`, `video/renameVideoName` | Guardan el video y aparte su "versión analizada" (`getParsedVideo`). Un análisis fallido se reintenta sin volver a subir el video. |
| Descarga por URL | `video/download`, `video/download-without-indexing` (+ `/finish`, `/retry`, `/delete`) | Separan **descargar** de **indexar**: se puede traer un video sin gastar en analizarlo. |
| Búsqueda | `video/search`, `video/search_clip`, `open/video/search_pub_video` | Dos niveles: videos completos y **clips** (momentos con inicio y fin). También buscan en videos públicos. |
| Chat | `video/getHisChatList`, `video/renameChatTitle`, `video/removeChat`, `video/exportChat`, `video/chat/comment` | Varias conversaciones por usuario, con título, borrado, **exportación** y valoración de respuestas (`chat/comment`). |
| Hablantes | `speaker/generateSpeaker`, `speaker/getSpeakerFace`, `speaker/getSpeakerMultimodal`, `speaker/updateSpeaker`, `speaker/saveOrBatchUpdateSpeaker`, `video/speakerTrans`, `video/download_speaker` | Identifican **quién habla** juntando voz y cara ("multimodal"). El usuario puede renombrar a cada hablante, y la transcripción sale por hablante. |
| Transcripción | `video/transcription`, `transcript/get-trans-language`, `transcript/transcript-language-templates`, `transcript/create-temp`, `transcript/update-temp`, `transcript/temp-summary` | Elección de idioma y **plantillas de resumen** editables por el usuario (`temp` = template). |
| Carpetas | `user/folder/create`, `get`, `rename`, `move`, `delete`, `videos` | La biblioteca se organiza en carpetas. |
| Compartir | `share/video/generate`, `get`, `list`, `copy`, `getShareUser`, `queryProgress` | Enlaces para compartir un video analizado, y copiarlo a otra cuenta. |
| Importar de nubes | `google/drive/...`, `dropbox/...`, `one/drive/...`, `vimeo/...`, `common/drive/list`, `common/drive/unbind` | Importan desde Google Drive, Dropbox, OneDrive y Vimeo con OAuth. |
| Progreso en vivo | `sse/register`, `sse/unregister` | Server-Sent Events: el servidor avisa del progreso en vez de que la página pregunte una y otra vez. |
| Cuenta y pagos | `auth/customer/...`, `payment/...` | Login por código o contraseña, suscripciones y recargas de créditos. |

Otros detalles: Sentry (`sentry-trace`, `baggage`) para errores y PostHog
(`ingest/...`) para analítica.

### Límites de esta observación

- Son **candidatos** sacados del código, no peticiones vistas en la red: no
  prueban que cada endpoint se use ni cómo es exactamente su respuesta.
- No se inició sesión ni se subió ningún video. Las partes que se cargan solo
  con sesión, o las rutas armadas con texto en tiempo de ejecución, pueden
  faltar.
- El modelo que ve los videos corre en sus servidores: REA no puede ver qué
  modelo es ni cómo indexa.

### Qué nos falta en Video Analyzer, por prioridad

1. **Búsqueda de clips:** devolver momentos con inicio y fin que lleven al
   punto del video, no solo el video.
2. **Hablantes:** separar quién habla (diarización), dejar que el usuario
   ponga nombres y mostrar la transcripción por hablante.
3. **Varias conversaciones por video:** con título, borrado y exportación
   (Markdown).
4. **Plantillas de resumen:** el usuario define qué secciones quiere en el
   resumen.
5. **Descargar sin analizar:** traer el video y decidir después si se gasta en
   analizarlo. Ya lo hacemos: el análisis se pide con el botón **Analizar**.
6. **Carpetas** en la biblioteca.
7. **Progreso por SSE** en vez de consultas periódicas.
