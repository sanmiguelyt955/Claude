# Kit: guardián siempre despierto para el buzón de recados entre IAs

Meta: que un guardián vigile el buzón (recados entre Claude, las Muses y SanmIA) y reaccione al instante, sin depender de tareas programadas.
Búsqueda con `kit.py` (modo sin Gemini: el plan y la revisión los hizo Claude), más 4 búsquedas directas en GitHub.

## Lo que sí sirve (revisado)

| Paso | Herramienta | Por qué | Pegas |
|---|---|---|---|
| Buzón entre IAs (idea y diseño) | 📦 `aymandakirgh/agentbus` | Bus de mensajes + tablero de tareas para equipos de agentes sobre una carpeta compartida. Es el mismo diseño que nuestro buzón. | Trabaja con una carpeta local; el nuestro vive en Obsidian 2.0 (nube). Sirve de referencia. |
| Buzón con eventos | 📦 `delims/spark` | Bus de mensajes por eventos, expuesto como servidor MCP (SQLite + inotify). | Escucha cambios de archivos locales: solo funciona dentro de un VPS. |
| Proceso de coordinación | 🎓 `affaan-m/ECC/team-agent-orchestration` | Tareas con dueño, estados y avisos para escuadras de agentes. | Está pensada para agentes de código, no para chats. |
| Probar los avisos | 🔌 `webhooks.cc` y `Webhook Toolkit` | Capturan y repiten webhooks, para ver qué manda Obsidian 2.0 a n8n. | Solo para pruebas. |
| Aprobar por celular | 🔌 `Pushary` | Pregunta y recibe el «sí» de Sanmi por notificación. | Hoy ntfy ya avisa gratis; esto solo agrega botones de aprobar. |
| Guardián | n8n (`n8n-io/n8n`) | Recibe el aviso por webhook y decide qué hacer. | Licencia «fair-code» (Sustainable Use): gratis para uso propio, no para revenderlo. |
| Patrón webhook → Claude Code sin pantalla | 📦 `tinoimammp/gitlab-auto-reviewer` | Muestra la idea (un webhook lanza Claude Code headless). | Sin licencia: solo de referencia. No se copia. |
| Plugin que manda notas a n8n | 📦 `Masterb1234/obsidian-post-webhook` (MIT, 170★) | Manda notas a webhooks de n8n al guardarlas. | Es para la app Obsidian; nuestro Obsidian 2.0 es un servidor en Cloudflare. No aplica. |

## Lo que no sirvió
- Pasos 3 y 4 de `kit.py` (guardián n8n y despertar agentes por evento): devolvió repos que no tienen nada que ver (claude-seo, mobile-mcp…). No hay un repo que haga eso completo.
- `memglow`, `agent-diff-gate`, `ScribeWatch` y `obsidian-video-notes`: son otras cosas, aunque salgan con puntaje alto.

## Conclusión
No existe un repo que haga todo. Hay que armarlo:
1. Cambiar el servidor de Obsidian 2.0 para que, además de ntfy, llame a un webhook de n8n cuando se guarde un recado.
2. n8n lee el recado, hace lo automatizable y se lo deja pendiente a la Muse o te avisa.
3. Las Muses no se despiertan solas sin API: lo que necesite su cerebro sigue esperando su turno.
