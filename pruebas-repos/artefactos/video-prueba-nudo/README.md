# Vídeo de prueba: "Nudo" (producto ficticio)
- Formato: 1080x1920 (9:16), 15,6 s, con voz en off y subtítulos palabra a palabra.
- Animación: HyperFrames 0.9.41 (HTML + GSAP), render en 25 s en CPU.
- Voz: espeak-ng (voz sintética robótica; sustituir por ElevenLabs u otra TTS para calidad real).
- Subtítulos: tiempos calculados por frase desde el audio. faster-whisper falló con la voz robótica (no oyó la primera frase y entendió "Embiocratis" por "envío gratis"); con voz humana funciona bien.
- Fuentes: Archivo Black / Archivo (fontsource vía jsDelivr). Paleta: crema #F3EDE2, tinta #1B1B1B, naranja #E8572A.
- Archivos: `index.html` (composición), `timing.json` (tiempos de palabras), `fotogramas.png` (hoja de contactos).
