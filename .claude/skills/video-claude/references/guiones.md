# Guiones virales (ingeniería inversa de guiones, no de software)

## 1. Estudiar videos que ya funcionan
1. Junta 3-10 videos virales del mismo formato (links de YouTube/Shorts).
2. Transcripción con Firecrawl (`youtube-com/videos/video_transcript`, idioma original) y, para lo visual,
   `scripts/youtube_gemini.py <link> --pregunta "estructura: gancho, giros, ritmo de cortes, remate"`.
3. Saca la ESTRUCTURA (no copies frases): duración, nº de palabras, palabras por segundo, dónde cae el gancho,
   cada cuánto hay un giro o una pregunta, cómo termina y qué pide al final.

## 2. Fórmulas que vimos funcionar
- **Gancho con regla** (shorts de bloques): la 1.ª frase plantea una regla o un «¿qué pasaría si…?» («En este pueblo,
  si mientes, te crece una cola»). El resto del video rompe esa regla.
- **Historia con ironía** (estilo cabezón): situación cotidiana → error → escalada → giro irónico en la última línea.
  Narración seca (deadpan), ~200-250 palabras por minuto, sin silencios.
- **Explicativo** (estilo informativo 3D): gancho de peligro o curiosidad → UN solo objeto → se explica por partes
  (cada parte brilla cuando se nombra) → recompensa visual al final (explosión, revelación). A menudo sin música.
- **Suspenso / misterio** (collage): dato increíble → contexto → 2-3 giros → revelación → CTA.

## 3. Reglas de ritmo
- Una idea por frase; una frase por escena o toma.
- Pon la palabra clave al final de la frase (ahí caen el corte, el golpe y el sello).
- Cada 3-5 s algo nuevo: giro, pregunta, dato, cambio de lugar.
- Lee el guion en voz alta con `scripts/voz.py`: si sobra aire, recorta.
