# Origen y cambios
- Skill **gemini-video-understanding** de ClaudeKit (autor: mrgoonie), licencia MIT.
  Copia tomada de https://github.com/mrgoonie/xxxnaper (.claude/skills/gemini-video-understanding).
  La copia de aia-11-hn-mib/mib-mockinterviewaibot que recomendó el kit NO traía los scripts.
- Revisada el 2026-11-28: solo llama a la API de Gemini (google-genai). No manda datos a otro lado.
- Cambios de Sanmi/Claude:
  1. El modelo por defecto pasa a `gemini-3.8-flash` (el alias gemini-flash-latest no existe en la API v1 de google-genai 3.x) (gemini-2.5-flash fue retirado). Se cambia con `GEMINI_VIDEO_MODEL`.
  2. También lee la clave de `~/.config/watch/.env`.
  3. `check_api_key.py` ya no imprime partes de la clave.
