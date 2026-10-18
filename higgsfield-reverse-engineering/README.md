# Ingeniería inversa de Higgsfield con REA

Investigación de cómo está construido **Higgsfield AI** (higgsfield.ai). La base es
[REA – Reverse Engineer Anything](https://github.com/morluto/rea) (`rea-agents@6.5.0`).
Como segunda fuente se usó el **MCP oficial de Higgsfield** conectado a la cuenta del usuario,
solo con llamadas de lectura y sin gastar créditos.

> **Alcance y límites éticos.** Solo se analizó lo que cualquier navegador anónimo descarga
> (HTML, JS y CSS públicos) y lo que el MCP oficial expone. No se inició sesión en la web,
> no se llamó a la API privada, no se lanzó ninguna generación y no se evadió
> Cloudflare ni DataDome. Las rutas de la API aparecen aquí como **observaciones estáticas**
> del bundle: no son una invitación a usarlas fuera de la integración oficial (MCP / API pública).

Cada conclusión indica su tipo de evidencia, siguiendo el método de REA:
**[O] observado** · **[I] inferido** · **[?] desconocido**.

---

## 1. Método (pipeline REA)

| Paso | Herramienta REA | Evidence ID | Resultado |
|---|---|---|---|
| 1 | `analyze-web-bundle` sobre `https://higgsfield.ai/` (CDP, 8 s, source maps) | `ev_dabaf463…2916` | 23 scripts, 5 source maps (todos de PostHog) |
| 2 | `capture-browser-scenario` (connect mode) en 8 rutas: `/generate`, `/ai/video`, `/pricing`, `/marketing-studio`, `/canvas`, `/mcp`, `/audio`, `/ai-influencer-studio` | `ev_f07c05c7…e9bef0` | 3.101 eventos, 1.024 peticiones, 789 scripts |
| 3 | `analyze-javascript-application` sobre los 787 chunks descargados (10 MB) | `ev_f6b57e62…0990` | 786 archivos parseados, 2,29 M nodos AST, 39.810 findings, 51 endpoints y 65 accesos a storage |
| 4 | `grep` dirigido sobre las rutas que REA marca como *unknown* (las construidas con template literals) | — | servicios del gateway, 218 `jobType`, 74 rutas `fetch` |
| 5 | MCP oficial: `models_explore`, `get_workflow_instructions` | — | 129 modelos, 13 workflows |

Todo se reproduce con [`scripts/reproduce.sh`](scripts/reproduce.sh). Los datos en bruto están en [`evidence/`](evidence/).

---

## 2. Arquitectura

```
                    ┌─────────────────────────── Cloudflare (WAF, /cdn-cgi/image, RUM, challenge) ──┐
 Navegador ──────►  │ higgsfield.ai  →  TanStack Start (SSR React) + i18n /_i18n/routes/*.json      │
                    └───────────────────────────────────────────────────────────────────────────────┘
     │  assets.higgsfield.ai/tanstack/assets/868a8dba-*.js|css   (≈790 chunks Vite, hash de build 868a8dba)
     │  clerk.higgsfield.ai  (Clerk 6.32 → JWT Bearer)          accounts.higgsfield.ai
     │  dd.higgsfield.ai     (DataDome anti-bot, vigila fnf-api-gw)
     │  higgsfield.ai/api/i  (PostHog 1.422.5 a través de proxy propio: replay, encuestas, web-vitals)
     ▼
 fnf-api-gw.higgsfield.ai ── /fnf                     núcleo: jobs, media, user, folders, workspaces, billing
                          ── /fnf-agent-gateway       agente / "Supercomputer"
                          ── /fnf-campaign-api  /fnf-ai-cmo  /fnf-score  /fnf-series  /fnf-meet
                          ── /fnf-community  /fnf-academy  /fnf-notification  /fnf-aitys
                          ── /fnf-apps-marketplace  /fnf-skills-marketplace  /fnf-higgsclaw-cron
 Workers aparte: canvas-worker · layer-worker · 3d-scene-builder · creator-hub-chat · fnf-device-auth
 Media: static / cdn / static-public-media .higgsfield.ai, images.higgs.ai, 3 distribuciones CloudFront
 Contenido: cms.higgsfield.ai        Consola de desarrolladores: console.higgsfield.ai
```

- **[O]** El framework es TanStack Start: aparecen cabeceras `x-tsr-serverFn` y `x-tss-serialized` y la ruta de assets `/tanstack/`. No es Next.js.
- **[O]** La base de la API está fija en el código: `Ud="https://fnf-api-gw.higgsfield.ai/fnf"` y `Wd="/fnf-agent-gateway"`. En el bundle quedan además hosts `dev-fnf-api-gw` y `dev-fnf-gw` (staging) y `localhost:8787` (wrangler, el entorno local de Cloudflare Workers).
- **[O]** La autenticación usa `Authorization: Bearer <token de Clerk>`, que se obtiene con `getToken()`. El workspace va en un header propio y las carpetas en `X-Folder-Id`.
- **[O]** Sin sesión, `/fnf/user/features`, `/fnf/workspaces/settings` y `/fnf/subscriptions/bundle/unlim-catalog` responden **401**. Los datos de usuario solo se cargan en el cliente; el SSR es público.
- **[O]** Hay un sistema anti-bot en dos capas: el challenge de Cloudflare más DataDome. DataDome escucha las peticiones AJAX a `fnf-api-gw` y comprueba la sesión con `POST /jobs/status-batch {ids:[]}`.
- **[I]** El nombre interno del backend es **"fnf"** y está dividido en microservicios detrás de un único gateway.

## 3. El motor: un único endpoint de jobs para todos los modelos

Toda generación (imagen, vídeo, audio, 3D, edición) sigue el mismo contrato **[O]**:

```js
// chunk 868a8dba-DH_HzfNKJ-9dGAOD.js (simplificado)
fetch(api(`/jobs/v2/${jobType}`), { method: "POST", headers /* Bearer + workspace */, body: JSON.stringify(params) })
// p.ej. TTS: body: JSON.stringify({ params: { prompt, voice, ... } })
```

Ciclo de vida observado en el bundle:

1. **Cotizar**: `POST /job-sets/costs` devuelve los créditos antes de lanzar el job.
2. **Subir inputs**: `POST /media/batch {mimetypes, source:"user_upload", surface, force_ip_check}` crea la entidad y devuelve una URL firmada (S3 `X-Amz-Signature` o GCS `X-Goog-Signature`). Después se hace el `PUT` del binario y se confirma con `POST /media/{id}/upload {job_id, filename}`. Para archivos grandes existe `/uploads/multipart/{init,part-urls,complete,abort}`, y vídeo y audio tienen sus propios `/video` y `/audio`.
3. **Lanzar**: `POST /jobs/v2/{jobType}`. Agrupaciones con `/job-sets`.
4. **Seguir el estado**: polling con TanStack Query (`refetchInterval`) sobre `/jobs/{id}`, `/jobs/{id}/status`, `/jobs/status-batch`, más `/jobs/{id}/trace` y `/jobs/{id}/track`. Estados: `queued · pending · waiting · in_progress · completed · failed · nsfw · canceled/cancelled`.
5. **[?]** No se encontraron WebSockets ni SSE para los jobs en el código público. El estado parece llegar solo por polling.
6. **[O]** `force_ip_check` y el job `ip_detection` indican un filtro de propiedad intelectual sobre las imágenes subidas.

### Catálogo de `jobType` (218)

La tabla completa está en [`evidence/job-types.tsv`](evidence/job-types.tsv). Por familias:

| Familia | Ejemplos |
|---|---|
| Modelos propios | `text2image_soul(_v2)`, `soul_cinematic`, `soul_cast`, `soul_location`, `hf_fnf_video` (Cinema Studio 3.0), `cinematic_studio_*` (2.5 → 4.0, relight, inpaint, 3D), `katana`, `hf_evolution`, `hf_mult_motion_control` / `hf_mult_replace_object` (Genjutsu) |
| Vídeo de terceros | `kling*` (2.6, 3.0, turbo, omni, motion control), `seedance*` (1.5 → 2.5, mini, unlimited), `veo3*`, `sora2_video*`, `wan2_2…wan3_0_prime`, `minimax_hailuo/h3`, `grok_video*`, `flux_3_video*`, `gemini_omni*`, `happy_horse_video` |
| Imagen de terceros | `nano_banana*` (15 variantes), `gpt_image_2*`, `openai_hazel`, `seedream*`, `flux_2/kontext/3`, `ideogram_4_5`, `recraft_v4*`, `grok_image*`, `z_image`, `claudesfield_image` |
| Audio | `text2speech(_v2)`, `elevenlabs_v4*`, `qwen_audio_tts`, `seed_audio`, `inworld_text_to_speech`, `mirelo_text_to_audio`, `sonilo_music`, `dubbing_lipsync`, `voice_change_merge`, `sync_so`, `infinite_talk` |
| Post-proceso | `topaz_*`, `bytedance_*_upscale`, `fps_boost`, `reframe`, `outpaint`, `image/video_background_remover`, `sam_3_video`, `depth_anything_video`, `concat_videos`, `beat_fit` |
| Productos/estudios | `marketing_studio_*` (v1/v2, hook, brand kit scrape), `ad_multiplier(_v2)`, `ai_influencer*`, `mixed_media`, `reels_studio`, `video_explainer`, `youtube_faceless_video`, `viral_hub_*`, `character_sheet`, `autosprite`, `bd_studio_*` |

**[I] Conclusión clave:** Higgsfield es sobre todo un **agregador y orquestador**. Envuelve
decenas de modelos de terceros (Kling, Seedance, Veo, Sora, Nano Banana, GPT Image, ElevenLabs…)
bajo un único contrato `jobType + params`, y añade capas propias encima:
- modelos Soul con identidad persistente (`custom-references`, `soul_id`);
- presets virales encadenados (`viral-hub/chain-presets`);
- estudios guiados (Cinema, Marketing, Ads, AI Influencer);
- edición de vídeo (Katana, Genjutsu, Higgsedit);
- un agente (Supercomputer / `fnf-agent-gateway`) que encadena todo lo anterior.

## 4. Lo que expone el MCP oficial (contrato público)

- **129 modelos** en [`evidence/mcp-models.tsv`](evidence/mcp-models.tsv), con id, proveedor, tipo, *roles* de media (`start_image`, `end_image`, `image_references`, `video_references`, `audio_references`, `product_image`…) y parámetros. Los ids del MCP coinciden 1:1 con los `jobType` del bundle **[O]**: `seedance_2_0`, `kling3_0`, `soul_cast`, etc. El MCP es una fachada directa sobre `/jobs/v2/{jobType}`.
- **13 workflows empaquetados** (SKILL.md servidos por el MCP): `ad-multiplier`, `ads-studio`, `brand-asset-creation`, `character-sheet`, `faceless-video`, `katana`, `narration`, `product-photoshoot`, `thumbnail-generation`, `ugc-video`, `video-editing`, `video-montage` y `website-builder-flow`. **[I]** La "inteligencia" de producto de Higgsfield (recetas, cadenas de modelos, prompts) se distribuye como *skills* para agentes, el mismo patrón que superpowers y REA.
- Estos parámetros revelan endpoints que no aparecen en el bundle: `GET /marketing-studio-v2/catalog`, `/marketing-studio/brand-kits(/fetch)`, `/marketing-studio/ad-references` y `/marketing-studio/webproducts`.

## 5. Sistema de diseño (para replicar la UI)

| Token | Valor |
|---|---|
| Marca (`--hf-color-lime-500`) | **#D1FE17** (lima neón) |
| Fondo (`--hf-color-cool-400` / `--color-page-primary`) | **#131416 / #131517** |
| Texto/botón primario | #FFFFFF |
| Tipografías | Inter Display (titulares), Inter (texto), Space Grotesk, Space Mono, IBM Plex Mono, JetBrains Mono |
| Stack CSS | Tailwind v4 (`--tw-*`) + tokens propios `--hf-*` (paletas lime/cool/grey/blue/pink/purple/orange y estados) |

Estilo: modo oscuro, *glass* con anillos blancos semitransparentes (`#ffffff1a…4d`) y un único acento lima.

## 6. Mapa de rutas del front (extracto)

`/generate` · `/ai/image` · `/ai/video` · `/audio` · `/canvas` · `/katana` · `/supercomputer` · `/agent` ·
`/marketing-studio` · `/ads-studio` · `/ai-influencer-studio` · `/shorts-studio` · `/mixed-media` · `/video-editor` ·
`/character` · `/elements` · `/library` · `/projects/$projectId` · `/community` · `/explore` · `/viral-effects` ·
`/viral-presets` · `/contests/*` · `/academy` · `/pricing` · `/mcp` · `/plugins/after-effects` · `/desktop` · `/mobile` · `/websites`

## 7. Los otros repositorios, pasados por REA

REA decide primero si hay que aplicarlo, y su propia regla dice: *"Skip REA for ordinary
source-repository architecture analysis"*. Los 9 repos traen el código fuente completo, así que
REA los clasifica como **análisis de repositorio normal** (lectura directa), no como binarios.
Esta es la utilidad de cada uno para este proyecto:

| Repo | Qué es | ¿Sirve para Higgsfield? | Cómo se usó / usar |
|---|---|---|---|
| **morluto/rea** | MCP + CLI de ingeniería inversa | **Base** | Pasos 1–3 completos (web bundle, escenario de navegador, grafo JS) |
| mksglu/context-mode | MCP que mantiene los datos crudos fuera del contexto ("think in code") | **Sí** | Mismo patrón aplicado: la evidencia de 296 MB se procesó con scripts que solo imprimen resúmenes |
| jordanrendric/claude-video-vision | Plugin para que Claude "vea" vídeos (ffmpeg + Whisper/Gemini) | **Sí** | Para analizar los outputs y vídeos promocionales de Higgsfield (frames + audio). Complementa `video-analyzer/` del repo |
| debpalash/VoiceStudio | Clonado de voz, TTS y doblaje local, con API + MCP | **Sí (réplica)** | Equivalente open-source de los jobs `text2speech`, `voice_change_merge` y `dubbing_lipsync` (motores OmniVoice, CosyVoice, IndexTTS…) |
| paperclipai/paperclip | Orquestación de equipos de agentes (Node + React) | **Sí (réplica)** | Modelo para el "Supercomputer"/agent-gateway: agentes, presupuestos (≈ créditos) y tareas cron (≈ `fnf-higgsclaw-cron`) |
| nextlevelbuilder/ui-ux-pro-max-skill | Base de datos de estilos, paletas y tipografías + generador de design systems | **Sí (réplica UI)** | Para reconstruir la UI con los tokens de la §5 (dark + acento neón, Inter/Space Grotesk) |
| obra/superpowers | Metodología de desarrollo con skills (brainstorm → plan → TDD → review) | Proceso | Plan por fases, subagentes en paralelo, verificación antes de dar algo por terminado |
| multica-ai/andrej-karpathy-skills | CLAUDE.md con 4 principios (pensar, simplicidad, cambios quirúrgicos, objetivos verificables) | Proceso | Criterio aplicado: separar lo observado de lo inferido y cambios mínimos |
| DietrichGebert/ponytail | Skill "senior perezoso": menos código y tests para la lógica arriesgada | Proceso | Para un posible clon: mínimo código, tests solo donde hay riesgo |
| david-ai-pro/ahorra-tokens-claude | Subagentes con modelo fijo, auditoría de tokens | Proceso | Delegar la exploración en modelos baratos al repetir el análisis |

## 8. Qué queda sin resolver

- **[?]** La lógica de servidor: enrutado a cada proveedor, colas, precios por modelo y moderación NSFW/IP. Es opaca desde el cliente.
- **[?]** Los esquemas exactos de `params` de cada `jobType`. El MCP (`models_explore get`) da los parámetros públicos, pero el front puede enviar campos extra.
- **[?]** El contenido de los 13 SKILL.md de workflows. Se pueden leer con `get_workflow_instructions {workflow}`; aquí no se copiaron por ser propiedad de Higgsfield.
- **[?]** El realtime. No se observó WebSocket porque la captura fue anónima; con sesión podría haberlo.
- Cobertura: el escenario solo visitó 8 rutas. Los chunks que se cargan de forma diferida en otras rutas no se analizaron. REA truncó el grafo semántico en 100k nodos.

## 9. Si quieres construir algo parecido

1. **Contrato único de jobs** (`POST /jobs/{type}` + polling + subida firmada en 3 pasos), con un adaptador por proveedor (fal.ai, Replicate o las APIs directas de Kling/Seedance/Veo).
2. **Créditos**: cotizar antes de lanzar (`/job-sets/costs`), con suscripciones y "unlimited" por modelo.
3. **Capa de producto encima**: presets encadenados y workflows como skills de agente (como los 13 del MCP).
4. Audio con **VoiceStudio**, orquestación con **paperclip** y UI con **ui-ux-pro-max** + tokens de la §5.
5. Para integrarte con Higgsfield de verdad, usa el **MCP oficial** o la API de `console.higgsfield.ai`, no los endpoints internos.
