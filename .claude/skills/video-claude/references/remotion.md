# Motion graphics con Remotion

Plantillas en `remotion/src/`: `LowerThird`, `TitleCard`, `Counter` (todas reciben `brand` por props, 1080x1920 por defecto).

## Instalar (una vez por sesión)
```bash
cd .claude/skills/video-claude/remotion && npm install --no-audit --no-fund
```

## Renderizar un overlay con transparencia (probado)
```bash
npx remotion render src/index.ts LowerThird out/lt.webm \
  --codec=vp8 --image-format=png --pixel-format=yuva420p \
  --browser-executable=/opt/pw-browsers/chromium --chromium-options="--no-sandbox" \
  --props='{"name":"Ana Pérez","role":"CEO","brand":{"primary":"#111","accent":"#FFD400","text":"#fff","font":"Arial"}}'
```
Luego pásalo a `render.sh --overlay out/lt.webm`. Para 16:9 añade `--width=1920 --height=1080`.
Para que aparezca en un momento concreto del video, genera el overlay con la duración justa y retrásalo en ffmpeg (`-itsoffset <seg>` antes del input) o añade un `Sequence` con `from`.

## Crear una animación nueva
1. Copia una plantilla, ajusta el JSX; usa `spring()` para entradas y `interpolate()` para salidas.
2. Regístrala en `Root.tsx` con `<Composition>` (id, durationInFrames, fps=30, tamaño, defaultProps).
3. Nunca pongas colores/fuentes fijos: usa `brand.*`.
4. Revisa un frame: `npx remotion still src/index.ts <Id> out/f.png --frame=30 (+ flags de navegador)`.

## Ideas de biblioteca para ampliar
Barras/gráficos animados, callouts con flecha, transiciones (wipe, glitch, zoom), intro/outro de marca, listas que aparecen punto a punto, subtítulos karaoke, countdown, "swipe up", progress bar.
