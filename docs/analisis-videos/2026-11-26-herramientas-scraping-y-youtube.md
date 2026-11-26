# Herramientas de scraping y de YouTube (cacería del 2026-11-26)

## ¿Se pudo ver el video 0o1L-auFq9Y?
- Gemini (youtube-gemini-mcp) y vidIQ: sí vieron imagen y audio.
- Claude: sí, con los cuadros del storyboard. El link firmado llegó por ScrapeCreators (Firecrawl Alexandria, 1 crédito) y se bajó con 200.
- Subtítulos: el link `timedtext` de ScrapeCreators respondió 200, pero vino vacío.

## Herramientas que nombra el video (Top 10 de githubrepo.cloud)
10 tangency-labs/solidcraft (CAD en Rust, automatizable por MCP) · 9 mobile-next/mobile-mcp (controla iOS/Android) ·
8 lexmount/moli · 7 Panniantong/Agent-Reach · 6 Tencent/BrowserSkill · 5 D4Vinci/Scrapling · 4 microsoft/playwright ·
3 firecrawl/firecrawl · 2 vibheksoni/stealth-browser-mcp (evita Cloudflare y captchas: NO lo usamos) · 1 HKUDS/nanobot

## YouTube desde la nube (caminos legítimos)
| Herramienta | Qué da | Estado hoy |
|---|---|---|
| Firecrawl › scrapecreators/youtube/video | detalles, capítulos, link de subtítulos, storyboard, relacionados | ✅ 1 crédito |
| scrapecreators/youtube: video-comments, search, channel-videos, community-post | comentarios, búsqueda, canal | sin probar |
| Firecrawl › youtube-com/videos/* | detalles ✅ · transcripción y comentarios | 502 hoy |
| vidIQ video_watch / video_transcript | ve el video (imagen y audio) | ✅ 25 créditos |
| youtube-gemini-mcp (parcheado) | Gemini ve por link, con memoria | ✅ |
| Conectores alojados: YTAPI, youtube-transcripts, YouTube Reader, HasData | transcripciones, comentarios | sin probar, de paga o con key |

## Repos de scraping que funcionan en la nube (hunt.py)
- Generales: scrapy, apify/crawlee, go-rod/rod, lorien/grab, DotnetSpider, webmagic (Java), rvest (R).
- Con IA: parsera, Scrapegraph-ai, crawl4ai.
- Navegadores: obscura (headless para IA).
- Sitios populares: scrapfly-scrapers (+80 sitios).
- Ya los tenemos como conectores: Firecrawl, Apify (de paga) y Metricool.
- Locales que corren en el contenedor: apify-mcp-server, webclaw, crawlport, kreuzcrawl, supadata mcp.
- Evitar los que se brincan bloqueos: SeleniumBase en modo CDP, brightdata, stealth-browser-mcp y PyreCrawl.

## Bloqueos y su solución legítima
| Bloqueado | Solución |
|---|---|
| yt-dlp (descargar) | atajo «Bajar para IAs» + buzón · Gemini por link · vidIQ |
| youtube-transcript-api (IpBlocked) | scrapecreators · vidIQ transcript · correrlo en la laptop |
| storyboards (verificación de bot) | link firmado que trae scrapecreators |
| GitHub Trending | búsqueda oficial de GitHub |
| Reddit / X | Firecrawl |
| Gemini TTS sin cuota | HeadTTS (CPU) |
| GPU | RunPod, HF o laptop |
