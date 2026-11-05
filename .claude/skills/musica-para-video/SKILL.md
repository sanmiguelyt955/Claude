---
name: musica-para-video
description: Elige qué canción le queda a un video (por ritmo, energía, clímax, cortes, voz y sentimiento), desde la biblioteca musical del usuario o las tendencias de TikTok/Reels, la monta en el video (ducking bajo la voz, -14 LUFS) y aprende su gusto con 👍/👎 y con ejemplos suyos o virales. Úsala SIEMPRE que el usuario pregunte qué música/canción/sonido/audio ponerle a un video, quiera musicalizarlo, mande canciones para su biblioteca, califique una sugerencia o pase un video "con la música que le puse" o un viral como ejemplo.
---

# musica-para-video

Motor local y gratis (CLAP, CLIP, AudioSet, librosa, ffmpeg) en las herramientas MCP de `video-nube`. Todo lo aprendido se guarda en el repo (`musica/`), así que vale para todos los chats: **haz commit y push de `musica/` cada vez que cambie.**

## Herramientas
| Herramienta | Para qué |
|---|---|
| `agregar_musica(archivos[])` | Mete canciones en la biblioteca (adjuntos del chat, `subida:`, URL directa, Google Drive compartido). Mide BPM, pulsos, tonalidad, energía, subida/clímax, voces, ánimo, género y su huella de sonido. |
| `ver_biblioteca_musical(filtro)` | Qué canciones hay (id, BPM, ánimo, género…) y cuánto se ha aprendido. |
| `recomendar_musica(video, descripcion, top)` | Ranking con razones, desde qué segundo empezar cada canción y `perfil_ideal` en texto. |
| `montar_musica(video, cancion_id, inicio=-1, volumen_db=0)` | MP4 final con la canción: mejor punto de inicio, fundidos, ducking si hay voz, -14 LUFS. |
| `calificar_musica(video, cancion_id, me_gusta, comentario)` | 👍/👎: ajusta las siguientes sugerencias. |
| `aprender_de_video(video, nota, viral, mio, cancion_id)` | Ejemplo ya editado (suyo o viral): en videos parecidos preferirá música parecida. |

## Flujo
1. **Mira el video primero** con `ver_video` (skill ver-video): de qué trata, emoción, ritmo, momento fuerte, si es hablado. Tu criterio es parte del sistema.
2. Escribe la **`descripcion` en inglés**, concreta: género + ánimo + instrumentos + energía. Ej.: `"funny playful pizzicato strings"`, `"emotional piano build up to epic drums"`, `"upbeat latin reggaeton party"`. Vacía = automática por el ambiente visual (menos precisa).
3. `recomendar_musica`. Presenta el **top 3-5** así: nombre · puntuación · **desde qué segundo** · por qué (ánimo, BPM vs. el que pide el video, subida alineada con el clímax, pulsos sobre los cortes, voces vs. habla, gusto aprendido). Añade tu propio juicio: si la #1 no encaja con la emoción que viste, dilo y propone otra.
4. **Tendencias de TikTok/Reels**: busca en la web (herramientas de búsqueda) "canciones/sonidos en tendencia TikTok/Reels <mes año> <país del usuario>" y cruza con el `perfil_ideal` (género, ánimo, BPM, energía). Da 3-5 nombres con artista, por qué encajan y desde qué parte usarlos. **Aclara que no las escuchaste** (no se pueden descargar): son por descripción. Recomienda añadirlas **dentro de la app** (TikTok/Instagram) al publicar: así cuentan para la tendencia y tienen licencia. Si el usuario tiene el audio, `agregar_musica` y se analiza de verdad.
5. **Montar** cuando lo pida: `montar_musica` y entrega el archivo (SendUserFile). Ofrece calificar.
6. **Aprender**: cuando el usuario diga que le gustó/no le gustó una sugerencia → `calificar_musica`. Cuando mande un video ya editado o un viral como referencia → `aprender_de_video` (`viral=true` si es viral, `mio=false` si no es suyo). Después, commit + push de `musica/`.

## Cómo puntúa (para explicarlo si preguntan)
- 35 % parecido entre la descripción y cómo suena (CLAP texto→audio), relativo a su biblioteca.
- 10-15 % tempo: el BPM que pide el video (por el ritmo de los cortes si hay ≥4; si no, por su energía y movimiento); mitad/doble valen.
- 25 % ajuste en el tiempo: forma de la energía, subida de la canción sobre el clímax del video y pulsos sobre los cortes (eligiendo el mejor segundo de inicio).
- 10 % voces: si el video es hablado, mejor instrumental.
- Gusto aprendido: hasta +25 % por 👍/👎 y hasta +25 % por ejemplos con videos parecidos (virales 1,5x); crece con cada dato.

## Límites honestos
- Ánimo y género son zero-shot: orientan, no son etiquetas perfectas. El BPM puede salir a mitad/doble.
- Los ejemplos con voz encima del audio dan una huella musical menos limpia: si la canción está en la biblioteca, pasa su `cancion_id`.
- Derechos: canciones comerciales sirven en TikTok/Reels usando la biblioteca de la app; para YouTube, anuncios o clientes usa música con licencia.
