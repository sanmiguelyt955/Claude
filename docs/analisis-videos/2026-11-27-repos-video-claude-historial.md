# Repos para hacer video con Claude: tu historial de YouTube (2026-11-27)

Método:
- Transcripciones con Firecrawl: 6 videos (40 créditos).
- Búsqueda de títulos con Firecrawl › scrapecreators (5 créditos).
- El mejor video lo vio vidIQ (cuenta Mejoresreposdegithub777, 25 créditos). Sirvió para leer en pantalla los nombres exactos y los comandos.

## Videos revisados
| Video | Repos |
|---|---|
| Short n3T8DNQJu9g (githubrepo_cloud) | syncthing (90.7k⭐, sincroniza archivos entre tus dispositivos) |
| IYS_m9Y_X1s «25 IAs do GitHub» (André Lug, 115k vistas) | Presenton, Jan, LibreChat, LocalAI, Fooocus, Flowise, GPT-SoVITS, AnythingLLM, Open Interpreter, Cline, LobeHub, OpenHands, RAGFlow, Whisper, Browser Use, llama.cpp, ComfyUI, Open WebUI, Dify, SD WebUI, Ollama, AutoGPT, **MarkItDown**, Firecrawl, n8n |
| **oTWUyW_bR-g «Insane GitHub Repos To Actually 10x Claude Video Editing» (AI LABS, 159k vistas) ⭐ EL MEJOR** | ver la tabla de abajo |
| aD9X6Lc3dVk «10 GitHub Repos to 10x Your AI Motion Graphics» (Matt Penny, 217k vistas) | lemo-opus (66 estilos de película), three.js, pixelfx, Blender MCP, awesome-opus-videos / opus video prompts, Claude animation base, react-rapier (física), react-postprocessing (luz, glow, grano), librosa (sincronizar con el ritmo), **video-shotcraft** (22.9k⭐, 124 recetas de promos) |
| DSeWjzZq7no «Instalei esses repositórios no Claude Code» (Enzo Barbatto, 146k vistas) | **humanizer** (blader, 74k⭐), **grill-me** (RobMitt, 1.9k⭐), Laia (clasificar textos), ScrollCraft, VoiceStudio, REA (morluto, 480k⭐) |

## Los 8 de AI LABS (nombres y comandos leídos en pantalla por vidIQ)
| # | Repo | Instalar | Qué hace | ¿Corre en la nube? |
|---|---|---|---|---|
| 1 | alchaincyf/huashu-motion (3.2k⭐) | `npx skills add alchaincyf/huashu-motion` | Clon de Claude Motion: películas de lanzamiento cortadas al ritmo de la música, gancho en 3 s, pausa antes del clímax, panel para revisar con línea de tiempo y comentarios | ✅ terminal normal |
| 2 | rossark0/rossark-motion-skill | `npx skills@latest add rossark0/rossark-motion-skill` | Anima mascotas y personajes SVG con reglas de tiempo y un archivo MOTION.md de lo que puede hacer el personaje | ✅ |
| 3 | talsiach/take-one | `npx skills add talsiach/take-one` + `doctor.sh` | De una idea a película completa: estratega → director creativo → guion visual → música → edición. Un revisor aparte la califica y repite hasta 3 veces | ✅ (tarda mucho) |
| 4 | NiazMorshed2007/reanimate (2.6k⭐) | `npx skills add NiazMorshed2007/reanimate -g` | Copia el movimiento de una animación (sitio, video o GIF) cuadro por cuadro y compara hasta que coincide | ✅ |
| 5 | Runable (patrocinador) | — | Agente de paga con tareas programadas | ❌ de paga |
| 6 | argo (`@argo-video/cli`) | `npm i -D @argo-video/cli` · `argo init` | Graba con Playwright un demo de tu app con voz, sombras y resaltados | ✅ (Playwright + TTS) |
| 7 | vincentsch/explainroo (1.5k⭐) | `git clone` + modelos | Video explicativo con voz; cada escena cae en su palabra (un modelo escucha la voz). Revisa tamaño de letra, volumen y que no parpadee | ⚠️ baja modelos de voz (CPU) |
| 8 | Leonxlnx/earshot | `git clone` + torch (~1.1 GB, CLAP) | Oídos para el agente: describe y ubica sonidos contra la imagen | ✅ **ya lo tenemos** (`scripts/instalar_repos.sh`) |
| + | win4r/video-director (550⭐), lo menciona la narración | según su repo | Reglas de dirección, revisa el plan y el video final | ✅ |

**Lo que más nos sirve:**
1. **take-one** y **huashu-motion**: el revisor que califica, el panel para revisar y la edición al ritmo de la música.
2. **explainroo**: palabras sincronizadas con la imagen. Nosotros ya lo hacemos con los tiempos por palabra de HeadTTS.
3. **video-shotcraft**: 124 recetas de tomas.
4. **reanimate**: copiar movimientos que nos gusten de otros videos o sitios.
5. **humanizer**: guiones que no suenen a IA.

## Tanda 2 (2026-11-27)
**Pl7Cqf5ApT0, Short de afCodeHub** (1:48, 36.5k vistas, en portugués, etiquetado como «hecho con IA»). Lo vio vidIQ (10 créditos, Viewshortsfactory777) y corrigió los nombres que la transcripción escribía mal:
| # | Repo | ⭐ | Reemplaza a |
|---|---|---|---|
| 1 | wide-trace/open-higgsfield | 7k | Higgsfield (imagen y video; algunos modelos necesitan clave de API) |
| 2 | debpalash/VoiceStudio | 119k | ElevenLabs (clonar voz, doblaje, 646 idiomas, local) |
| 3 | every-app/open-seo | 26.6k | Semrush (usa APIs de DataForSEO y trae MCP) |
| 4 | AppFlowy-IO/AppFlowy | 79.6k | Notion |
| 5 | OpenWhispr/openwhispr | 10.6k | Dictado y transcripción (Parakeet/Whisper local) |
| 6 | opf/openproject | 17.8k | Asana |
| 7 | calcom/cal.diy | 49.7k | Calendly (agenda propia, MIT) |
| 8 | chatwoot/chatwoot | 40.7k | Intercom/Zendesk |
| 9 | CapSoftware/Cap | 25.7k | Loom |

- **Formato del Short (para copiar la idea, no el contenido):**
  - ventana de navegador con inclinación 2.5D que recorre la página del repo;
  - contador «GITHUB · 01 / 09» arriba;
  - etiquetas de funciones abajo;
  - voz de IA con subtítulos sincronizados y música suave.

**TiBUeT1-oI8, githubrepo_cloud** (4:37). Es otra versión del Top 10 de scraping. Lo nuevo:
- **unclecode/crawl4ai** (86.6k⭐): convierte sitios en markdown para IA.
- **citrolabs/ego-lite** (24.7k⭐): navegador rápido para agentes que comparte tu sesión iniciada.
- Igual que antes, **stealth-browser-mcp NO se usa**.
