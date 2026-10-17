# Investigación web con REA (17 de octubre de 2026)

Páginas leídas con REA (`inspect-web-page` sobre Chromium sin ventana, texto
de accesibilidad), buscando qué hace a la app más confiable y más capaz.

## Fuentes y lo que dicen

| Fuente | Dato clave |
|---|---|
| Gemini: media resolution | En Gemini 3+ cada imagen cuesta 1.120 tokens por defecto (high); medium cuesta 560 y es donde "satura" la lectura de texto; en video, low y medium cuestan 70 tokens por fotograma. |
| Gemini: thinking | `thinking_level` minimal/low/medium/high; low para extraer datos o clasificar. El tope de salida incluye el razonamiento. |
| Gemini: flex / priority | Flex cuesta la mitad pero falla con 503/429 cuando está lleno. Priority cuesta 75–100 % más y, saturado, baja a estándar en vez de fallar. |
| Gemini: background execution | Las conexiones HTTP normales se cierran a los ~60 s; en segundo plano el servidor da un ID y se consulta después. |
| Gemini: caching / batch | Caché implícita desde 4.096 tokens (poner lo común al principio). Batch: mitad de precio, 24 h. |
| yt-dlp README | Subtítulos (`--write-subs`, `--write-auto-subs`, `--sub-langs`), reintentos (`--extractor-retries`, por defecto 3; `--retry-sleep exp=1:30`), `--impersonate` (con aviso de que puede volver lentas las descargas). |
| faster-whisper / whisper.cpp | Detección de voz (Silero) para no pasar silencios a Whisper; faster-whisper solo quita silencios de más de 2 s por defecto. |
| FFmpeg filters | `mpdecimate`, `freezedetect` y `scdet` para fotogramas repetidos o congelados. |
| TwelveLabs | Búsqueda por lo visual, el sonido y la voz; coincidencia exacta de palabras para nombres de productos; segmentos definidos por el usuario. |

## Qué se implementó

1. **Fotogramas a resolución media** (`GEMINI_MEDIA_RESOLUTION`): un tramo de
   100 fotogramas cuesta la mitad de tokens y conserva el texto en pantalla.
2. **Poco razonamiento en los tramos** (`thinkingLevel: low`), el resumen sigue
   con el de siempre. Si un modelo rechaza alguno de los dos ajustes, la app
   repite la petición sin él.
3. **Subtítulos de la plataforma antes que Whisper** (también lo hace /watch).
4. **yt-dlp con 5 reintentos y pausas crecientes**; `YTDLP_IMPERSONATE` opcional.
5. **Nuestro Whisper se salta los silencios** de 1 s o más (por nivel de
   sonido, sin descargar el modelo Silero); faster-whisper corta desde 0,5 s.
6. **Fotogramas casi iguales descartados** en la misma pasada de FFmpeg (idea
   de /watch, que cubre lo que haría `mpdecimate`).

De memories.ai: **exportar el chat**, **carpetas**, **plantillas de
documento** y la **barra de progreso real** del análisis local.

## Qué no se hizo, y por qué

- **Priority / Flex:** cambian el precio (más caro, o más barato pero con más
  503). Se puede activar después con una variable si hace falta.
- **Ejecución en segundo plano** para el motor de video completo: el motor
  local ya usa streaming, que resuelve el mismo corte de 60 s.
- **Búsqueda exacta de palabras:** ya existe (FTS5 junto a sqlite-vec).
- **Separar hablantes:** necesita un modelo de diarización que nuestro Whisper
  no tiene; queda pendiente.
- **Batch API:** útil solo para reanalizar muchos videos sin prisa.
