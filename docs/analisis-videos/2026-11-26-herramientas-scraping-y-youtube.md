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

## Prueba 2 (mismo día)
- scrapecreators **video-comments**: ✅ 20 comentarios por página, con token para pedir más (probado en 4rKZG2s_YgU). En 0o1L-auFq9Y salió vacío porque el video no tiene comentarios.
- scrapecreators **search**: ✅ 11 videos y 25 shorts, con token para pedir más.
- **Storyboard completo:** con el link firmado bajaron las 16 hojas (L3). Son 144 cuadros de 320×180, uno cada 2 s, de 0:00 a 4:38. Se ve el video completo en baja resolución, sin audio.
  - El video trae subtítulos amarillos quemados. Se leen a medias, solo como pedazos.
- **Audio y transcripción:** NO se lograron por esta vía; el link de `timedtext` llegó vacío. Para el audio quedan Gemini por link y vidIQ.

## Prueba 3: ¿sirve con cualquier video? (imagen + transcripción)
| Video | Imagen (scrapecreators → storyboard) | Transcripción |
|---|---|---|
| 0o1L-auFq9Y (4:37) | ✅ 144 cuadros, 1 cada 2 s | youtube-com ❌ 502 (3 veces) · **vidIQ ✅** (5 créditos vidIQ) |
| Short DkJAY44ZxbU (0:28, vertical) | ✅ 29 cuadros, 1 por segundo | youtube-com ✅ (8 idiomas) · Gemini gratis ✅ |
| EsTrWCV0Ph4 (2:13:15) | ✅ 801 cuadros, 1 cada 10 s (89 hojas) + mapa «lo más repetido» | youtube-com ✅ 4,226 frases · Gemini ❌ 429 (sin cuota) |

- El intervalo del storyboard depende de la duración: Short 1 s · 4 min 2 s · 2 h 10 s.
- Costos: scrapecreators/video 1 crédito Firecrawl; youtube-com transcript ~5 solo si funciona (las fallas no cobran); vidIQ transcript 5 créditos vidIQ.
- **Orden recomendado para transcripción:** Gemini (gratis) → youtube-com (Firecrawl) → vidIQ.
- **Límite real:** si el video NO tiene subtítulos (ni automáticos), las tres dan vacío; entonces solo Gemini (que oye el audio) o el atajo «Bajar para IAs».
