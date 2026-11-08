# Buzón de videos para IAs

Cloudflare Worker `buzon-videos` + R2 `videos-para-ias`. URL: https://buzon-videos.sanmiguelyt955.workers.dev

- iPhone: atajo «Bajar para IAs» → a-Shell `python3 bajar.py [link]` baja en 1080p y lo **sube aquí** (si existe `~/Documents/.clave_buzon`), luego lo borra del iPhone.
- IAs: `.claude/skills/video-claude/scripts/buzon.py --listar | --ultimo | --borrar <clave>`.
- Se borra en cuanto una IA termina el análisis (`buzon.py --terminar`). Cron diario `17 9 * * *` = red de seguridad: si pasa de 9 GB borra los más viejos.
- Secreto `CLAVE` solo en Cloudflare (`wrangler secret put CLAVE`). Nunca en el repo.
- Videos >90 MB: multipart de R2 en pedazos de 50 MB (`/partes/crear|subir|terminar|cancelar`). Probado con 126 MB.
- Deploy: `CI=true CLOUDFLARE_API_TOKEN=proxy-injected CLOUDFLARE_ACCOUNT_ID=73e77f7d8385b30a95f3ca5f7c00f86a ../obsidian-2-0/node_modules/.bin/wrangler deploy`
