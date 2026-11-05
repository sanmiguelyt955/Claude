# video-editor (skill de Claude Code)

Editor de video autónomo: transcripción por palabra, corte de silencios, subtítulos (viral / clean / cinematic, bilingües), motion graphics (Remotion), perfiles de marca multi-cliente, exportación 9:16 / 16:9 / 1:1 con audio normalizado.

Uso: dale a Claude un video y di qué quieres ("quita silencios, subtítulos virales en español con traducción al inglés, marca X, formato vertical"). Lee `SKILL.md`.

Estructura: `scripts/` (ffmpeg/whisper/ASS) · `styles/` · `brands/` · `remotion/` · `references/`.
Estado de pruebas: cortes, remapeo de palabras, subtítulos ASS (resaltado y bilingüe), render 9:16, overlay Remotion con alfa → probados con video sintético. `transcribe.py` (faster-whisper) NO se ha probado con voz real todavía.
