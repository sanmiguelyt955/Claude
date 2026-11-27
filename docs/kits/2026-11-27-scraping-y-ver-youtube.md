# Tu kit para: quiero herramientas para hacer scraping y tener la opción de poder ver videos de YouTube
**Condiciones:** donde corre: cloud

## 🥇 Combinación recomendada (primer lugar)
| # | Paso | Kit | Puntos | Por qué |
|---|---|---|---|---|
| 1 | Scraping de páginas web | 📦 scrapy/scrapy + 🔌 Firecrawl | 100 | Firecrawl (ya lo tienes) saca cualquier página como texto limpio sin instalar nada; Scrapy, gratis, para rastrear sitios enteros cuando necesites miles de páginas. |
| 2 | Datos de YouTube (transcripción, comentarios, info) | 🔌 YTAPI | 86 | Trae transcripción, comentarios, datos, búsquedas y el mapa de lo más repetido de cualquier video, sin descargarlo. |
| 3 | Ver el video (imagen y audio) | 🔌 vidIQ + 🎓 aia-11-hn-mib/mib-mockinterviewaibot/gemini-video-understanding | 87 | vidIQ ve la imagen y oye el audio a la vez (probado: Shorts y videos de hasta ~20 min); la skill le enseña a la IA a usar Gemini para ver tramos con minutos exactos. |

## 📦 Repos
| # | Paso | Mejor | Respaldo | Cómo empezar |
|---|---|---|---|---|
| 1 | Scraping de páginas web | **[scrapy/scrapy](https://github.com/scrapy/scrapy)** (94 65,660⭐) ✔ verificado | **[howie6879/ruia](https://github.com/howie6879/ruia)** (92 1,737⭐) ✔ verificado | `git clone https://github.com/scrapy/scrapy` |
| 2 | Datos de YouTube (transcripción, comentarios, info) | — | — |  |
| 3 | Ver el video (imagen y audio) | — | — |  |

## 🎓 Skills
| # | Paso | Mejor | Respaldo | Cómo empezar |
|---|---|---|---|---|
| 1 | Scraping de páginas web | — | — |  |
| 3 | Ver el video (imagen y audio) | **[aia-11-hn-mib/mib-mockinterviewaibot/gemini-video-understanding](https://github.com/aia-11-hn-mib/mib-mockinterviewaibot)** (71) ✔ verificado | — | `npx skills add aia-11-hn-mib/mib-mockinterviewaibot --skill gemini-video-understanding` |

## 🔌 Conectores
| # | Paso | Mejor | Respaldo | Cómo empezar |
|---|---|---|---|---|
| 1 | Scraping de páginas web | **Firecrawl** (81) ✔ verificado ✅ ya lo tienes | **[Spicrawl](https://github.com/OfficialSpicrawl/mcp)** (79) ✔ verificado | ✅ ya lo tienes |
| 2 | Datos de YouTube (transcripción, comentarios, info) | **[YTAPI](https://github.com/ytapi/youtube-skills)** (80) ✔ verificado | **[mcp-server](https://github.com/cliptranscript/mcp-server)** (81) ✔ verificado · 💳 de paga (opcional): **[youtube-transcripts](https://github.com/johnisanerd/alphaosint-mcp-servers)** (81) ✔ verificado | `claude.ai → Conectores → https://api.ytapi.dev/mcp` |
| 3 | Ver el video (imagen y audio) | **vidIQ** (63) ✔ verificado ✅ ya lo tienes | **[YTAPI](https://github.com/ytapi/youtube-skills)** (61) ✔ verificado · 💳 de paga (opcional): **[youtube-transcripts](https://github.com/johnisanerd/alphaosint-mcp-servers)** (62) ✔ verificado | ✅ ya lo tienes |

_2 descartados porque no funcionan: YouTube Reader, YouTube Reader_
