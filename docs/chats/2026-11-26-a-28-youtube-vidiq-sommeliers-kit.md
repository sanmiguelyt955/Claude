# Chat 26–28 nov 2026: YouTube desde la nube, vidIQ Cuentas, Sommeliers y kit.py

La nota completa está en Obsidian 2.0: `chats/2026-11-26 a 28 - YouTube en la nube, vidIQ Cuentas, Sommeliers y kit.md`.

Resumen:

- **Ver YouTube desde la nube.**
  - Funciona: storyboard (Firecrawl/ScrapeCreators), transcripción (Firecrawl o **YTAPI**, probado el 28 nov) y vidIQ.
  - vidIQ es la primera opción: Short = 10 créditos; video de hasta ~20 min = 25.
  - En videos de 2 h, vidIQ pone mal los minutos; para esos se usa transcripción + storyboard + Gemini por tramos.
- **vidiq-cuentas:** Worker de Cloudflare con 10 cuentas. Modo API con 87 herramientas y modo OAuth completo (falta que Sanmi lo pruebe).
- **Presupuesto de vidIQ:** `herramientas/vidiq_presupuesto.py`, con ~54 créditos al día como gasto seguro.
- **RepoSommelier:** modo «alternativa gratis a X» para cualquier app.
- **MCPSommelier:** opción `--fair`.
- **SkillSommelier:** repo nuevo.
- **kit.py:**
  - arma el kit completo para cualquier meta y verifica que todo funcione;
  - entrega 3 tablas y la mejor combinación;
  - lo revisa Claude, sin Gemini;
  - kits en `docs/kits/`.
- **Agregados:** Scrapy, la skill gemini-video-understanding (sin probar porque Gemini da error 429) y YTAPI.
- **Pendientes:**
  - modo OAuth de vidIQ;
  - probar la skill de Gemini cuando vuelva la cuota;
  - VoiceStudio: licencia no comercial y falta de disco (recomendado probar Kokoro primero).
