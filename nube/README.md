---
title: Video Nube
emoji: 🎬
colorFrom: indigo
colorTo: pink
sdk: docker
app_port: 7860
pinned: false
license: mit
short_description: MCP que ve y oye videos y audios (sin APIs de pago)
---

# video-nube

Servidor MCP que ve y oye videos y audios, como Gemini según su documentación pública. Corre entero en este Space, sin APIs de pago.

- MCP: `https://<este-space>.hf.space/<MCP_CLAVE>/mcp`
- Subir archivos: `POST https://<este-space>.hf.space/<MCP_CLAVE>/subir` (multipart, campo `archivo`) → `{"path": "subida:<id>"}`
- Estado: `GET /`

Herramientas: `ver_video`, `cargar_segmento`, `escuchar_audio`, `oir`, `preguntar_audio`, `analizar_video_nube`.
Código fuente: https://github.com/sanmiguelyt955/claude
