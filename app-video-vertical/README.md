# app-video-vertical

Genera vídeos verticales distintos (1080x1920) combinando clips por roles
(apertura, demostración, cierre). Procesado local con FFmpeg. Código propio,
escrito desde cero según `docs/app-video-vertical/especificacion.md`.

## Requisitos

- Node.js 22 o superior
- FFmpeg en el PATH

## Uso

```bash
node bin/cli.js \
  --apertura intro.mp4 \
  --demo demo1.mp4,demo2.mp4 \
  --cierre cta.mp4 \
  --max 5 --seed 1 --out salida
```

- Cada `--rol` acepta varios clips separados por comas.
- `--max` es el número de vídeos a generar; nunca repite combinaciones.
- `--seed` hace reproducible la selección.

## Tests

```bash
npm test
```

## Estado

Hito 1 (combinar clips en serie, salida 1080x1920): hecho.
Pendiente: música a tiempo, análisis de vídeos virales, separación de voz,
envío al móvil, interfaz de escritorio.
