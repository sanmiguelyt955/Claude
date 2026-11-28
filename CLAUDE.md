# Instrucciones permanentes

- **Mapa del repo:** lee `INDICE.md` para encontrar cualquier cosa; regéneralo con `python3 herramientas/indice.py` después de cambios grandes.

## Guardar todo en GitHub

- Al terminar el trabajo de cada conversación (Claude Code o Claude Cowork), sube todo a este repositorio (`sanmiguelyt955/claude`): código, mods, documentos, notas y resultados.
- Objetivo: no perder nunca información. Nada debe quedar solo en el contenedor de la sesión, porque se borra al terminar.
- Haz commit con un mensaje claro y push a la rama designada de la sesión. No crees Pull Request salvo que el usuario lo pida.
- Si algo no cabe en el repo (secretos, claves, tokens), no lo subas: avisa al usuario.
- El usuario habla español: responde en español.
- «Obsidian» siempre significa **Obsidian 2.0** (el conector `Obsidian_2_0`), nunca otro.

## Cuando el usuario manda un video o un link de video

1. Analízalo con la skill `video-claude`, que es SIEMPRE la primera opción para todo lo de video (antes que otras skills o conectores).
   Usa TODAS las herramientas para ver videos a la vez (en paralelo) y combina lo que salga: `scripts/youtube_gemini.py`
   (Gemini con nuestra clave), el conector **Gemini Video** (`ver_video`, tiene su propia cuota), `ver_youtube` de
   video-nube, la skill `/watch` y la transcripción de Firecrawl. Si una falla (503, 429 de cuota, bloqueo), sigue con las
   demás y di cuál funcionó.
2. Recomienda TODAS las mejoras que se te ocurran para las skills, apps, conectores y herramientas que ya tenemos (repo, Workers, MCP, etc.).
3. Pregunta siempre, adaptado al caso: «¿Quisieras que yo tuviera la capacidad de hacer lo que se hizo en ese video? Lo haríamos así: [pasos], con estas herramientas gratuitas: [lista], y funcionaría así: [cómo se usaría]. ¿Lo hago tal cual está en el video o hacemos la tuya propia y la vamos modificando?». Detalla lo que harías si dice que sí, y no lo construyas hasta que responda.

## Videos de YouTube / Shorts

- **Orden para VER (jerarquía):**
  1. **vidIQ** (ve la imagen y oye el audio sincronizados): Short → `vidiq_watch_shortform_content` (10 créditos); video de hasta ~20 min → `vidiq_video_watch` (25); video largo → `vidiq_video_transcript` (5, trae todo con tiempos exactos) + storyboard + Gemini por tramos (conector Gemini Video con start/end), porque en videos de horas `video_watch` sí ve todo pero pone mal los minutos.
     Usar la cuenta del nicho y revisar el presupuesto con `herramientas/vidiq_presupuesto.py`.
  2. **Sin créditos o si vidIQ falla:** `youtube_ver.py` (cuadros + Gemini + transcripción, storyboard por scrapecreators si YouTube bloquea).
  3. Atajo «Bajar para IAs» + buzón.
  Detalle en la skill video-claude, sección «Orden para VER videos de YouTube».

- **Primero:** `scripts/youtube_ver.py <link>` (skill video-claude): cuadros reales cada ~2 s (miniaturas públicas de la barra) que ves tú mismo + bitácora segundo a segundo de Gemini + transcripción de Firecrawl. Haz UNA consulta por video (si YouTube da 429, espera; no insistas) y borra la carpeta al terminar.
- Intenta verlos completos (descarga). Si YouTube bloquea la descarga desde la nube (lo normal), usa el modo por link: transcripción (Firecrawl) + cuadros públicos + conector Gemini Video para lo visual. Nunca intentes saltarte el bloqueo; ofrece las opciones (adjuntar el archivo, Drive, computadora conectada).

- Si YouTube no deja (bloqueo o sin cuota de Gemini): pedir a Sanmi que use su atajo de iPhone **«Bajar para IAs»**
  (Compartir → Bajar para IAs: a-Shell lo baja en 1080p y lo sube al **buzón de videos** en Cloudflare, sin Drive).
  Bajarlo con `scripts/buzon.py --ultimo` (la clave la pone el proxy; `--listar` muestra el link de origen),
  analizarlo COMPLETO sin perder datos (extraer_video.py + todas las herramientas) y en cuanto termine
  `buzon.py --terminar <archivo>` (borra local y del buzón). El buzón NO borra por tiempo (solo si pasa de 9 GB).
  Sin límite práctico de tamaño: >90 MB se sube en pedazos de 50 MB; largos (>10 min) en 1080p AV1/VP9.
  Respaldo viejo: carpeta de Drive «Videos para IAs» + `drive_publico.py --ultimo`.

## Cuando no puedas hacer algo

- Di siempre POR QUÉ no se puede y da las diferentes maneras de solucionarlo (con sus pros y contras).
