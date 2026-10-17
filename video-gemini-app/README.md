# Video Gemini

App mínima para que Gemini **vea y escuche** un video: lo subes, Gemini lo procesa
completo (imagen + audio) y te devuelve escenas con marcas de tiempo, transcripción,
texto en pantalla y descripción del audio. Después puedes preguntarle lo que quieras
sobre el video.

Sin dependencias de npm: solo Node.js 22.9 o superior.

## Uso

```bash
cd video-gemini-app
cp .env.example .env     # pon tu GEMINI_API_KEY
npm start                # http://127.0.0.1:3000
```

1. Elige o arrastra un video.
2. La app lo sube a la Files API de Gemini, espera a que esté listo y lo analiza.
3. Revisa el resumen, las escenas, la transcripción y el audio.
4. Escribe una pregunta en el chat; Gemini responde con el video como contexto.

## Cómo funciona

- `lib/gemini.js`: sube el video con el protocolo reanudable de la Files API,
  espera a que pase de `PROCESSING` a `ACTIVE` y llama a `generateContent`
  con el video como `file_data`. El video se adjunta solo al primer turno de
  la conversación; los siguientes reutilizan ese contexto.
- `lib/analysis.js`: el prompt y el esquema JSON del análisis (escenas,
  transcripción, audio), con tiempos en segundos.
- `server.js`: rutas `/api/videos` (subir, listar, consultar),
  `/api/videos/:id/analyze` y `/api/videos/:id/chat`. La clave de Gemini se
  queda en el servidor; el navegador nunca la ve.
- `public/`: interfaz en HTML, CSS y JS sin frameworks.

## Límites que conviene conocer

- **Formatos:** mp4, mov, mpeg, avi, wmv, webm, flv, 3gp y audio (mp3, wav, m4a…).
  Un `.mkv` se rechaza con un mensaje; conviértelo a mp4 con ffmpeg.
- **Tamaño:** 2 GB por defecto (`MAX_UPLOAD_MB`).
- **Duración:** videos muy largos ocupan mucho contexto y pueden tardar varios minutos
  en analizarse. Para una película completa conviene partirla antes.
- **Memoria:** los videos, análisis y chats viven en memoria del servidor. Si lo
  reinicias, se pierden. El archivo en Gemini caduca a las 48 h.
- **Modelo:** `GEMINI_MODEL` (por defecto `gemini-3.7-flash`, el mismo que usa
  `video-analyzer`). Cambia la variable si tu cuenta usa otro.

## Pruebas

```bash
npm test
```

Las pruebas usan un `fetch` simulado: no llaman a Gemini ni gastan cuota.
