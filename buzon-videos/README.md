# Buzón de videos para IAs

Cloudflare Worker `buzon-videos` + R2 `videos-para-ias`. URL: https://buzon-videos.sanmiguelyt955.workers.dev

- iPhone: atajo «Bajar para IAs» → a-Shell `python3 bajar.py [link]` baja en 1080p y lo **sube aquí** (si existe `~/Documents/.clave_buzon`), luego lo borra del iPhone.
- IAs: `.claude/skills/video-claude/scripts/buzon.py --listar | --ultimo | --borrar <clave>`.
- Se borra solo a los 7 días (cron diario `17 9 * * *`).
- Secreto `CLAVE` solo en Cloudflare (`wrangler secret put CLAVE`). Nunca en el repo.
- Límite: 100 MB por video (límite de cuerpo de Workers en plan gratis).
- Deploy: `CI=true CLOUDFLARE_API_TOKEN=proxy-injected CLOUDFLARE_ACCOUNT_ID=73e77f7d8385b30a95f3ca5f7c00f86a ../obsidian-2-0/node_modules/.bin/wrangler deploy`
