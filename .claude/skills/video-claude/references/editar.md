# Video Editor (autónomo con revisión)

> Rutas: `scripts/`, `remotion/`, `brands/` y `styles/` están en `.claude/skills/video-claude/`. Para elegir música usa `references/musica.md`.

Flujo por defecto: el usuario da el video + una instrucción; tú haces todo y entregas MP4 + preview para que pida ajustes.

## 0. Prerrequisitos (comprobar una vez por sesión)
```bash
bash .claude/skills/video-claude/scripts/setup.sh   # instala/valida ffmpeg, faster-whisper, fuentes
```

## 1. Flujo de trabajo
1. **Entender el pedido**: tipo de video, plataforma destino (9:16 / 16:9 / 1:1), estilo (`styles/`), marca (`brands/`), idiomas de subtítulos. Si falta algo crítico, pregunta UNA vez; si no, usa defaults razonables y dilo.
2. **Analizar**: `scripts/analyze.sh <video>` → duración, resolución, fps, audio, silencios.
3. **Transcribir**: `python3 scripts/transcribe.py <video> --lang es --out work/words.json` (timestamps por palabra).
4. **Cortar**: `python3 scripts/cut_silences.py <video> --words work/words.json --out work/cut.mp4` (quita silencios y remapea las palabras a `work/cut.words.json`). Para cortes editoriales (muletillas, tomas falsas) decide los rangos leyendo la transcripción y usa `--remove "12.3-14.0,40-42.5"`.
5. **Subtítulos**: `python3 scripts/make_subtitles.py work/cut.words.json --style viral --brand brands/default.json --aspect 9:16 --out work/subs.ass` . Bilingüe: tú traduces los segmentos y pasas `--translations work/trad.json` (lista de `{start,end,text}`).
6. **Motion graphics** (lower thirds, títulos, contadores, callouts, intro/outro): ver `references/remotion.md`. Renderiza overlays con alfa (WebM/ProRes 4444) y compónlos con ffmpeg `overlay` en el paso 7.
6b. **Música**: para elegirla, ver `references/musica.md` (`recomendar_musica`); pasa el archivo elegido con `--music` o móntala con `montar_musica`.
7. **Render final**: `bash scripts/render.sh work/cut.mp4 work/subs.ass out/final.mp4 --aspect 9:16 [--overlay ov.webm] [--music m.mp3] [--logo logo.png]` (normaliza audio a -14 LUFS, H.264 yuv420p, +faststart).
8. **Revisión**: genera un contact sheet (`scripts/preview.sh out/final.mp4`) y míralo (Read de la imagen) ANTES de entregar. Comprueba: subtítulos dentro de zona segura, sin cortes bruscos de audio, logo visible, duración esperada.
9. **Guardar**: según CLAUDE.md del repo, commitea scripts/configs/brands y notas. Los videos pesados NO van a git (están en .gitignore); avisa al usuario dónde quedaron o súbelos a Drive si lo pide.

## 2. Estilos (styles/*.json)
- `viral`: palabras grandes en bloques de 2-3, palabra activa resaltada con color de acento, zooms/cortes rápidos.
- `clean`: línea completa abajo, tipografía sobria, sin resaltado.
- `cinematic`: texto fino, bajo, con sombra suave, letterbox opcional.
El estilo se **adapta a cada video**: elige según contenido y plataforma, o crea uno nuevo copiando un JSON.

## 3. Marcas / clientes (brands/*.json)
Un JSON por marca (`brands/_template.json`): colores, fuentes, logo, posición del logo, estilo por defecto, idiomas. Si el usuario nombra un cliente, usa o crea `brands/<cliente>.json`. Nunca mezcles marcas.

## 4. Reglas de calidad
- Nunca sobrescribas el original; trabaja en `work/` y entrega en `out/`.
- Subtítulos dentro del 80% central en vertical (evitar UI de TikTok/Reels: margen inferior ≥ 18%).
- Audio: normalizar, nunca clipping; música a -22 dB bajo la voz con ducking si hay voz.
- Cortes con pad de 0.08 s para no comer fonemas.
- Reporta honestamente lo que hiciste y lo que no pudo verificarse.
