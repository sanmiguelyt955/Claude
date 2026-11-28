# Kit de scraping y ver YouTube (2026-11-28)

| Herramienta | Tipo | Estado | Cómo se usa |
|---|---|---|---|
| **Scrapy** 2.20 (BSD) | 📦 repo | ✅ instalado y probado (sacó frases de quotes.toscrape.com) | `scrapy runspider mi_spider.py -o salida.json`. Se reinstala con `instalar_repos.sh` |
| **gemini-video-understanding** (ClaudeKit, MIT) | 🎓 skill | ✅ instalada en `.claude/skills/`; ⏳ falta probarla cuando vuelva la cuota de Gemini | `python3 .claude/skills/gemini-video-understanding/scripts/analyze_video.py --youtube-url <link> --prompt "…" [--start-offset 40s --end-offset 80s --fps 5]` |
| **YTAPI** | 🔌 conector | ⏳ lo agrega Sanmi en claude.ai | URL `https://api.ytapi.dev/mcp`, «Iniciar sesión ahora». 200 créditos gratis (sin tarjeta); 1 crédito por consulta; 100/día hasta comprar; paquetes desde $9 |
| **Firecrawl** | 🔌 conector | ✅ ya conectado | scraping de páginas sueltas |
| **vidIQ** | 🔌 conector | ✅ ya conectado (11 cuentas) | ver imagen y audio |

**Revisión de la skill:**
- La copia que recomendó el kit (aia-11-hn-mib) NO traía sus scripts; se tomó la completa de ClaudeKit (mrgoonie/xxxnaper).
- El código solo llama a la API de Gemini.
- Se cambió: el modelo a gemini-3.8-flash (2.5 retirado), que también lea `~/.config/watch/.env`, y que el diagnóstico ya no imprima partes de la clave.
- Detalle en `.claude/skills/gemini-video-understanding/ORIGEN.md`.
