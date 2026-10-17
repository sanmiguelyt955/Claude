# Ingeniería inversa: memories.ai (observado desde fuera)

Fuentes públicas revisadas: `memories.ai` (sitio Webflow), `memories.ai/llms.txt`,
y la documentación de la API en `api-tools.memories.ai`. La app real
(`memories.ai/app`) está detrás de login, así que **no** se observó su interior:
lo de abajo sale de la documentación pública y de cómo está organizada la API.

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
