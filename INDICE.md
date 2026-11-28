# ÍNDICE del repo (para IAs)
Generado: 2026-11-28 00:03 con `python3 herramientas/indice.py`.
Cómo usarlo: busca aquí la palabra de lo que necesitas, abre el archivo y lee su encabezado. Reglas en `CLAUDE.md`.
Memoria compartida de todas las IAs: Obsidian 2.0 (`indice.md`, `buzon/`, `aprendizajes/`).

## Skill de video (lo principal)
- `.claude/skills/video-claude/README.md` — video-claude (skill de Claude Code): ver, oír, musicalizar y editar videos
- `.claude/skills/video-claude/SKILL.md` — Todo lo de video en una sola skill. VER y OÍR videos y audios como Gemini (cuadros con MM:SS, voz con hablantes, sonidos, música, emoción; archivos adjuntos, enlaces, Google Drive y YouTube solo con el link; cortos o de 
- `.claude/skills/video-claude/brands/` — carpeta (2 archivos)
- `.claude/skills/video-claude/kubo/` — carpeta (6 archivos)
  - `.claude/skills/video-claude/kubo/blender_escena.py` — Kubo · conector de Blender: convierte un plan (JSON de tomas) en cuadros PNG con Blender sin interfaz.
  - `.claude/skills/video-claude/kubo/caras.py` — Caras 2D de los personajes de Kubo (PNG con transparencia que se pegan al frente de la cabeza).
  - `.claude/skills/video-claude/kubo/instalar_kubo.sh` — Instala Kubo Studio en cualquier computadora Linux (sin permisos de administrador) y revisa que todo funcione.
  - `.claude/skills/video-claude/kubo/kubo.py` — Kubo Studio · animaciones 3D virales (estilo cabezón) desde un guion o una voz, gratis y en la nube.
  - `.claude/skills/video-claude/kubo/kubo_v2.py` — 
- `.claude/skills/video-claude/motor25d/` — carpeta (6 archivos)
  - `.claude/skills/video-claude/motor25d/escena.js` — Mundo 3D con luz, sombras, niebla, tinta y personajes 2D (tarjetas). Determinista: cuadro(f) dibuja el cuadro f.
  - `.claude/skills/video-claude/motor25d/medir_referencia.py` — Mide un video de REFERENCIA y lo convierte en ajustes para el motor 2.5D (idea de Daniel Alcaide: dale una
  - `.claude/skills/video-claude/motor25d/motor25d.mjs` — Motor 2.5D de Kubo Studio: plan.json -> video MP4 (three.js en Chromium sin pantalla + ffmpeg).
  - `.claude/skills/video-claude/motor25d/personajes.js` — Personajes planos (tarjetas 2D) dibujados con código: diseños propios de Kubo Studio.
  - `.claude/skills/video-claude/motor25d/planes/` — carpeta (1 archivos)
- `.claude/skills/video-claude/plantillas/` — carpeta (3 archivos)
  - `.claude/skills/video-claude/plantillas/imagenes/` — carpeta (6 archivos)
- `.claude/skills/video-claude/references/` — carpeta (8 archivos)
  - `.claude/skills/video-claude/references/editar.md` — Video Editor (autónomo con revisión)
  - `.claude/skills/video-claude/references/guiones.md` — Guiones virales (ingeniería inversa de guiones, no de software)
  - `.claude/skills/video-claude/references/kubo.md` — Kubo Studio: animaciones 3D virales con Blender (estilo cabezón)
  - `.claude/skills/video-claude/references/motion.md` — Motion graphics con código (sin video de IA)
  - `.claude/skills/video-claude/references/motor25d.md` — Motor 2.5D (Kubo Studio): personajes 2D en un mundo 3D, con efectos pixel y sonido hecho con código
  - `.claude/skills/video-claude/references/musica.md` — Música para cada video
  - `.claude/skills/video-claude/references/remotion.md` — Motion graphics con Remotion
  - `.claude/skills/video-claude/references/ver-y-oir.md` — Ver y oír videos (como Gemini)
- `.claude/skills/video-claude/remotion/` — carpeta (6 archivos)
  - `.claude/skills/video-claude/remotion/src/` — carpeta (8 archivos)
    - `.claude/skills/video-claude/remotion/src/Collage.tsx` — 
    - `.claude/skills/video-claude/remotion/src/Counter.tsx` — 
    - `.claude/skills/video-claude/remotion/src/LowerThird.tsx` — 
    - `.claude/skills/video-claude/remotion/src/Reel.tsx` — 
    - `.claude/skills/video-claude/remotion/src/Root.tsx` — 
    - `.claude/skills/video-claude/remotion/src/TitleCard.tsx` — 
    - `.claude/skills/video-claude/remotion/src/comun.tsx` — 
    - `.claude/skills/video-claude/remotion/src/index.ts` — registerRoot(Root);
- `.claude/skills/video-claude/scripts/` — carpeta (23 archivos)
  - `.claude/skills/video-claude/scripts/analyze.sh` — Uso: analyze.sh video.mp4  -> resumen técnico + silencios
  - `.claude/skills/video-claude/scripts/bajar_para_ias.py` — «Bajar para IAs»: programa para a-Shell (iPhone) que usa el atajo del mismo nombre.
  - `.claude/skills/video-claude/scripts/buzon.py` — Buzón de videos para IAs: lo que Sanmi manda desde su iPhone (atajo «Bajar para IAs» → a-Shell → Cloudflare).
  - `.claude/skills/video-claude/scripts/canal_viral.py` — Estudiar un canal viral: ordena sus Shorts por vistas y manda los mejores a Gemini para entender POR QUÉ retienen
  - `.claude/skills/video-claude/scripts/cut_silences.py` — Quita silencios y/o rangos indicados; remapea words.json al nuevo tiempo.
  - `.claude/skills/video-claude/scripts/drive_publico.py` — Baja un archivo de Google Drive compartido con «Cualquier persona con el enlace» (sin iniciar sesión).
  - `.claude/skills/video-claude/scripts/extraer_video.py` — Prepara TODO el material de un video para analizarlo sin perder detalles (pensado para las Muse, que trabajan con
  - `.claude/skills/video-claude/scripts/flux_lote.py` — Genera en lote las imágenes de un proyecto con el Worker imagenes-flux (FLUX gratis en Cloudflare).
  - `.claude/skills/video-claude/scripts/instalar_blender.sh` — Instala Blender (sin interfaz) solo cuando se necesita: ~350 MB de descarga, ~1.3 GB en disco, ~1 min.
  - `.claude/skills/video-claude/scripts/instalar_repos.sh` — Instala en una sesión nueva las herramientas de los repos que usamos (gratis, sin GPU).
  - `.claude/skills/video-claude/scripts/make_subtitles.py` — words.json -> .ass con estilo (viral/clean/cinematic) y colores/fuente de la marca.
  - `.claude/skills/video-claude/scripts/motion.py` — Motion graphics con código (Remotion): reels animados (modo «reel») y collages con capas y cámara (modo «collage»).
  - `.claude/skills/video-claude/scripts/polyhaven.py` — Poly Haven: cielos (HDRI), texturas y modelos 3D GRATIS y libres (CC0: se pueden usar en videos monetizados
  - `.claude/skills/video-claude/scripts/preview.sh` — Contact sheet 4x3 para revisar el resultado visualmente. Uso: preview.sh video.mp4 [out.jpg]
  - `.claude/skills/video-claude/scripts/render.sh` — Uso: render.sh in.mp4 subs.ass out.mp4 [--aspect 9:16|16:9|1:1] [--overlay ov.webm] [--music m.mp3] [--logo logo.png] [--logo-pos tr|tl|br|bl]
  - `.claude/skills/video-claude/scripts/repos_de_videos.py` — repos_de_videos.py — de videos de YouTube a la lista de repos, ahorrando créditos.
  - `.claude/skills/video-claude/scripts/setup.sh` — Valida/instala dependencias. Seguro de ejecutar varias veces.
  - `.claude/skills/video-claude/scripts/sonido.py` — Banda sonora procedural para videos de historia (sin derechos, sin conectores): efectos de sonido sintetizados,
  - `.claude/skills/video-claude/scripts/transcribe.py` — Transcribe con faster-whisper -> words.json [{word,start,end}] + segments.
  - `.claude/skills/video-claude/scripts/voz.py` — Narración (texto → voz) gratis para los videos de la skill.
  - `.claude/skills/video-claude/scripts/youtube_gemini.py` — Ver un video de YouTube (o Short) SOLO con el link, desde la skill video-claude, sin servidor ni descarga.
  - `.claude/skills/video-claude/scripts/youtube_ver.py` — Ver un video de YouTube SOLO con el link, imagen por imagen + audio, desde la nube y gratis.
- `.claude/skills/video-claude/styles/` — carpeta (3 archivos)

## Proyectos (Kubo Studio y más)
- `proyectos/eiffel/` — «El hombre que vendió la Torre Eiffel» (collage animado, 31 s, 9:16)
  - `proyectos/eiffel/README.md` — «El hombre que vendió la Torre Eiffel» (collage animado, 31 s, 9:16)
  - `proyectos/eiffel/img/` — carpeta (14 archivos)
  - `proyectos/eiffel/musica.py` — Música de suspenso sintetizada a medida (sin derechos): tic-tac, latido grave, pad oscuro, golpe en cada cambio
- `proyectos/kubo/` — carpeta (9 archivos)
  - `proyectos/kubo/fila_lenta/` — carpeta (6 archivos)
  - `proyectos/kubo/guerra_emus/` — Kubo narra: «La guerra que Australia perdió contra unos pájaros» (historia real)
  - `proyectos/kubo/kubo_presenta/` — carpeta (4 archivos)
  - `proyectos/kubo/modelos3d/` — carpeta (6 archivos)
  - `proyectos/kubo/papa_chef/` — carpeta (5 archivos)
  - `proyectos/kubo/papa_chef_en/` — carpeta (5 archivos)
  - `proyectos/kubo/proyecto-claude-kubo-studio.md` — Proyecto «Kubo Studio» en Claude (con Coordinador)
  - `proyectos/kubo/prueba_astro/` — carpeta (3 archivos)
  - `proyectos/kubo/prueba_maqueta/` — carpeta (2 archivos)
- `proyectos/monalisa/` — «El robo de la Mona Lisa» (collage animado, 98 s, 9:16)
  - `proyectos/monalisa/README.md` — «El robo de la Mona Lisa» (collage animado, 98 s, 9:16)
  - `proyectos/monalisa/img/` — carpeta (28 archivos)

## Herramientas
- `herramientas/RepoSommelier.md` — buscarepos se mudó
- `herramientas/SkillSommelier.md` — SkillSommelier → https://github.com/sanmiguelyt955/SkillSommelier
- `herramientas/buscarepos/` — carpeta (1 archivos)
- `herramientas/indice.py` — Genera INDICE.md: el mapa del repo para cualquier IA (Claude, Muses, Codex…). Un renglón por cosa, con qué es y dónde está.
- `herramientas/scraping-y-youtube.md` — Kit de scraping y ver YouTube (2026-11-28)
- `herramientas/vidiq_presupuesto.py` — vidiq_presupuesto.py — cuánto gastamos de vidIQ y cuánto podemos gastar para que alcance hasta el reinicio.
- `herramientas/youtube-gemini-mcp-modelo.patch` — 
- `herramientas/youtube-gemini-mcp.md` — youtube-gemini-mcp (aigentive, MIT) — ver YouTube por link con memoria

## Servicios en la nube (Workers, servidores, VPS)
- `buzon-videos/` — Buzón de videos para IAs
- `obsidian-2-0/` — Obsidian 2.0 (código fuente)
- `nube/` — title: Video Nube
- `servers/` — Servers
- `vps/` — carpeta (4 archivos)
- `gemini-vision/` — carpeta (2 archivos)
- `imagenes-flux/` — imagenes-flux: imágenes gratis con FLUX para Claude
- `video-analyzer/` — carpeta (18 archivos)
- `video-descriptor-app/` — carpeta (7 archivos)
- `viral-video-lab/` — Viral Video Lab
- `gcp-analysis/` — carpeta (16 archivos)
- `mods/` — Mods de Claude
- `musica/` — Biblioteca musical (skill video-claude → música)

## Documentos y análisis
- `docs/analisis-videos/` — carpeta (20 archivos)
  - `docs/analisis-videos/2026-11-06-animaciones-3d-creatorize.md` — Animaciones 3D virales con IA (canal «g russ», herramienta Creatorize) — 2026-11-06
  - `docs/analisis-videos/2026-11-06-capybluh-viral.md` — @capybluh: por qué retienen sus Shorts más vistos
  - `docs/analisis-videos/2026-11-06-capybluh.md` — Canal Capybluh (@capybluh): análisis de su fórmula viral
  - `docs/analisis-videos/2026-11-06-creatorize-proceso.md` — Creatorize: proceso completo (2 videos de g russ) → especificación para Kubo Studio
  - `docs/analisis-videos/2026-11-06-lote4-entrenamiento.md` — Lote de entrenamiento 4 (2026-11-06)
  - `docs/analisis-videos/2026-11-06-lote5-entrenamiento.md` — Lote de entrenamiento 5 (2026-11-06): 14 Shorts
  - `docs/analisis-videos/2026-11-06-lote6-entrenamiento.md` — Lote de entrenamiento 6 (2026-11-06): 6 Shorts
  - `docs/analisis-videos/2026-11-06-nichos-ia-y-canales.md` — Nichos de IA y canales que mandó el usuario (2026-11-06)
  - `docs/analisis-videos/2026-11-08-supermercado-tomypapitas.md` — «Pusiste 10 estantes, ¡felicidades!, ahora tienes un súper» — TomyPapitas
  - `docs/analisis-videos/2026-11-26-bencord-top10-repos-video.md` — Bencord: «Probé 100+ repos de GitHub para editar videos. Este es mi TOP 10» (10:55)
  - `docs/analisis-videos/2026-11-26-herramientas-scraping-y-youtube.md` — Herramientas de scraping y de YouTube (cacería del 2026-11-26)
  - `docs/analisis-videos/2026-11-26-top10-scraping-githubrepo.md` — «Top 10 Web Scraping & Automation Tools Taking Over GitHub (2026)» — githubrepo_cloud (4:36)
  - `docs/analisis-videos/2026-11-27-repos-video-claude-historial.md` — Repos para hacer video con Claude: tu historial de YouTube (2026-11-27)
- `docs/kits/` — carpeta (3 archivos)
  - `docs/kits/2026-11-27-correos-shopify-telegram.md` — Tu kit para: quiero que la IA responda automáticamente los correos de los clientes de mi tienda en Shopify y que me avise por Telegram cuando haya un problema
  - `docs/kits/2026-11-27-scraping-y-ver-youtube.md` — Tu kit para: quiero herramientas para hacer scraping y tener la opción de poder ver videos de YouTube
  - `docs/kits/2026-11-27-videos-animados-monetizar.md` — Tu kit para: quiero hacer videos animados de manera gratuita con IA, con voz y subtítulos, y publicarlos en YouTube para después monetizarlos
- `docs/monetizacion/` — carpeta (1 archivos)
  - `docs/monetizacion/2026-11-06-monetizacion-redes.md` — Monetización en redes (noviembre 2026): cuánto pagan y qué piden
- `docs/noticias-repos-conectores-2026-11-26.md` — Noticias de repos y conectores (2026-11-26)
- `docs/ranking-repos-videos-3d-2026-11-26.md` — Mejores repos para: hacer videos 3D animados con código para shorts
- `docs/tickets-github.md` — Textos para tickets de soporte de GitHub (Actions bloqueadas)

## Archivos sueltos en la raíz
- `CLAUDE.md` — Instrucciones permanentes
- `CONECTAR.md` — Conectar video-claude en Hugging Face (PRO) + Claude Code + Cowork
- `INDICE.md` — ÍNDICE del repo (para IAs)
- `ORACLE.md` — video-nube 24/7 gratis en Oracle Cloud (desde el celular)
- `PRIVACIDAD.md` — Privacidad: video-claude / video-nube
- `README.md` — Servidor MCP de video (local, sin APIs en la nube)
- `escucha_local.py` — escucha_local: hace que Claude "oiga" el audio, en local y sin APIs.
- `herramientas_musica.py` — Herramientas MCP de música para video-nube: biblioteca, recomendación, aprendizaje y montaje.
- `herramientas_youtube.py` — Herramienta MCP ver_youtube: ver un video de YouTube solo con el enlace.
- `musica_local.py` — Qué canción le queda a un video: motor local, sin APIs.
- `oido_modelo.py` — oido_modelo: oídos y vista "de verdad" para Claude.
- `servidor_nube.py` — Servidor MCP local para analizar un video sin APIs en la nube.
- `vision_local.py` — vision_local: ve un video como lo describe la documentación pública de Google para Gemini.
