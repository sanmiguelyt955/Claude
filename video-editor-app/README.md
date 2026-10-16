# Editor de video

Editor de video web, inspirado en el uso público de editores como CapCut, construido con código propio.
Sin dependencias de npm: Node.js + FFmpeg.

## Requisitos
- Node.js 18+
- FFmpeg y FFprobe en el PATH

## Uso
```bash
npm start            # http://localhost:3000 (PORT=... para cambiar)
npm test             # pruebas del motor de exportación (requiere ffmpeg)
```

## Funciones (MVP)
- Importar videos (mp4, mov, webm, mkv, …) y listarlos en la biblioteca
- Añadir clips a la línea de tiempo, reordenarlos y quitarlos
- Recortar inicio y fin de cada clip
- Cortar en el cursor
- Añadir textos superpuestos con tiempo, posición, tamaño y color
- Reproducir la secuencia completa en la vista previa
- Exportar a MP4 1280×720 30 fps (H.264 + AAC)

## Estructura
- `server.js`: HTTP sin frameworks, subida, streaming con Range, exportación.
- `lib/export.js`: construcción del filtergraph de FFmpeg (función pura, probada).
- `public/`: interfaz (HTML, CSS y JS sin frameworks).
- `test/`: pruebas con clips reales generados por FFmpeg.
- `data/`: archivos subidos y exportados (ignorado por git).

## Pendiente (siguientes capas)
- Arrastrar clips con el ratón y ajustar con zoom de línea de tiempo
- Transiciones, velocidad y volumen por clip
- Proporción de salida configurable (9:16 para TikTok/Reels, 1:1)
- Texto con fuentes y estilos propios
- Deshacer/rehacer y guardado de proyectos
