# youtube-gemini-mcp (aigentive, MIT) — ver YouTube por link con memoria

Probado el 2026-11-26 en la nube: analizó un video de 4:36 por link (imagen + audio) sin descargarlo, y respondió una
segunda pregunta usando la memoria de la sesión.

Instalación (en una venv aparte: necesita `mcp<2`):
```bash
python3 -m venv /tmp/claude-0/ygm && /tmp/claude-0/ygm/bin/pip install "mcp[cli]<2" -e /tmp/claude-0/repos/youtube-gemini-mcp
cd /tmp/claude-0/repos/youtube-gemini-mcp && git apply /home/user/Claude/herramientas/youtube-gemini-mcp-modelo.patch
```
- El parche arregla un error del repo: usaba siempre `gemini-2.5-flash` (retirado). Ahora usa el modelo de la sesión o
  `YOUTUBE_GEMINI_MODEL` (por defecto `gemini-3.8-flash`).
- Clave: `GOOGLE_API_KEY` (la de Gemini). Al crear la sesión intenta leer el título con yt-dlp: en la nube falla (bot
  check) pero no importa, la sesión se crea igual.
- Herramientas: create_video_session, analyze_video_in_session (memoria), analyze_youtube_video, analyze_local_video…
