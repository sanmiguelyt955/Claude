# Vídeo de prueba: "Nudo" (producto ficticio)
- Formato: 1080x1920 (9:16), 13,8 s, con voz en off y subtítulos palabra a palabra.
- Animación: HyperFrames 0.9.41 (HTML + GSAP), render en 25 s en CPU.
- Voz (v2): edge-tts, voz neural `es-MX-DaliaNeural` (gratis, sin clave). `tts-edge.py` apunta certifi al bundle CA del proxy del entorno.
- v1 (`nudo-promo-9x16-v1-voz-robot.mp4`): voz espeak-ng, muy robótica.
- Subtítulos (v2): tiempos reales por palabra con faster-whisper `small` (22/22 palabras). Con la voz robótica de v1, Whisper fallaba.
- Fuentes: Archivo Black / Archivo (fontsource vía jsDelivr). Paleta: crema #F3EDE2, tinta #1B1B1B, naranja #E8572A.
- Archivos: `index.html` (composición), `timing.json` (tiempos de palabras), `fotogramas.png` (hoja de contactos).

- Nota: `.gitignore` excluye `*.mp4`; estos vídeos se añadieron con `git add -f`.
