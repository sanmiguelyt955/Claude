# Instrucciones permanentes

## Guardar todo en GitHub

- Al terminar el trabajo de cada conversación (Claude Code o Claude Cowork), sube todo a este repositorio (`sanmiguelyt955/claude`): código, mods, documentos, notas y resultados.
- Objetivo: no perder nunca información. Nada debe quedar solo en el contenedor de la sesión, porque se borra al terminar.
- Haz commit con un mensaje claro y push a la rama designada de la sesión. No crees Pull Request salvo que el usuario lo pida.
- Si algo no cabe en el repo (secretos, claves, tokens), no lo subas: avisa al usuario.
- El usuario habla español: responde en español.

## Cuando el usuario manda un video o un link de video

1. Analízalo con la skill `video-claude`, que es SIEMPRE la primera opción para todo lo de video (antes que otras skills o conectores).
   Usa TODAS las herramientas para ver videos a la vez (en paralelo) y combina lo que salga: `scripts/youtube_gemini.py`
   (Gemini con nuestra clave), el conector **Gemini Video** (`ver_video`, tiene su propia cuota), `ver_youtube` de
   video-nube, la skill `/watch` y la transcripción de Firecrawl. Si una falla (503, 429 de cuota, bloqueo), sigue con las
   demás y di cuál funcionó.
2. Recomienda TODAS las mejoras que se te ocurran para las skills, apps, conectores y herramientas que ya tenemos (repo, Workers, MCP, etc.).
3. Pregunta siempre, adaptado al caso: «¿Quisieras que yo tuviera la capacidad de hacer lo que se hizo en ese video? Lo haríamos así: [pasos], con estas herramientas gratuitas: [lista], y funcionaría así: [cómo se usaría]. ¿Lo hago tal cual está en el video o hacemos la tuya propia y la vamos modificando?». Detalla lo que harías si dice que sí, y no lo construyas hasta que responda.

## Videos de YouTube / Shorts

- Intenta verlos completos (descarga). Si YouTube bloquea la descarga desde la nube (lo normal), usa el modo por link: transcripción (Firecrawl) + cuadros públicos + conector Gemini Video para lo visual. Nunca intentes saltarte el bloqueo; ofrece las opciones (adjuntar el archivo, Drive, computadora conectada).

- Si YouTube no deja (bloqueo o sin cuota de Gemini): pedir a Sanmi que use su atajo de iPhone **«Bajar para IAs»**
  (baja el video con su internet y lo deja en la carpeta de Drive «Videos para IAs», id 1durviUs0zFmhovA3D85kP1LKw-KdWI7h, compartida por link; `drive_publico.py --ultimo` baja el más nuevo). Bajarlo con
  `scripts/drive_publico.py`, analizarlo y **borrarlo del almacenamiento al terminar** (siempre).

## Cuando no puedas hacer algo

- Di siempre POR QUÉ no se puede y da las diferentes maneras de solucionarlo (con sus pros y contras).
