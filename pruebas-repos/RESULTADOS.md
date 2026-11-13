# Pruebas de repos de GitHub (2026-11-05)

Entorno: contenedor Linux, Python 3.13, Node 22 (Node 24 vía `npx node@24`), sin claves de API.

## 1. Alishahryar1/free-claude-code — FUNCIONA
- Requiere uv >= 0.13.7: el uv del contenedor es 0.11.32, así que usar `python3 -m uv` (tras `pip install uv`).
- `uv sync` OK. Tests: **10150 passed, 10 skipped** (~3 min).
- `fcc-server` arranca en :8082; Admin UI (`/admin`) responde 200; `/v1/models` lista modelos; `/v1/messages` (formato Anthropic) responde.
- Sin clave devuelve error claro: `NVIDIA_NIM_API_KEY is not set`.
- Falta para uso real: una clave (NVIDIA NIM gratis u otro proveedor) y lanzar `fcc-claude`.

## 2. ComputerUseAgent/AutoCua — INSTALA
- `pip install AutoCua` (0.1.9) en venv OK; `from AutoCua.agent_launcher import run_agent` importa bien.
- No probado el control real: necesita pantalla/escritorio y clave de proveedor (openrouter, openai, anthropic...). Este contenedor no tiene escritorio.
- API: `run_agent(mode="computer use", provider=..., model=..., task=...)`. Ver `agent_capabilities.md`.

## 3. Muaaz9329/cheap-ag — COMPILA, tests con fallos de entorno
- `npm ci` y `npm run build` OK.
- vitest: fallan 3 tests, todos de entorno: 2 en `jobs.test.ts` (matar grupo de procesos en verify) y 1 en `login.test.ts` (sin CLI `claude`, timeout 60 s).
- Idea: delegar la implementación a un modelo barato (OpenRouter/DeepSeek) desde Claude Code o Codex. Necesita clave y `npx cheap-agent`.

## 4. brocrew/brocrew — NO PROBADO A FONDO
- App de escritorio Electron (macOS Apple Silicon / Windows), pnpm, Node >= 24.
- `pnpm install --frozen-lockfile --ignore-scripts` con Node 24 OK.
- `pnpm typecheck` y la suite completa de vitest superan el tiempo límite del contenedor. No se puede ver la GUI aquí.
- Para probarlo de verdad: en un Mac o Windows, ver `docs/run-from-source.md`.

## 5. OpenSelena/omniget — FRONTEND OK
- App de escritorio Tauri (Rust + Svelte) para descargar vídeo, audio, cursos, torrents, etc. con herramientas extra (transcripción, PDF, lector).
- `pnpm install` OK, `pnpm build` OK, vitest: **183 passed (31 archivos)**.
- No compilé el backend Rust/Tauri (pesado y sin GUI en el contenedor).
- Nota: incluye descargadores de cursos de pago (Udemy/Hotmart); usar solo con contenido propio/legítimo.

## 6. Worldonlyu/Google_AI_Pro_2Year_ZeroCost_Auto — NO EJECUTADO (decisión)
- Solo leí el README. Es una herramienta para iniciar sesión de forma masiva en cuentas de Google ajenas/en lote, meter tarjetas y encadenar promociones gratis de Google AI Pro. Se vende con una tienda de cuentas ("卡网").
- Es fraude de cuentas/promociones y puede implicar credenciales robadas. No la ejecuto ni la adapto. No se clonó nada más allá de leer el README.

## Actualización: free-claude-code con clave de NVIDIA NIM — FUNCIONA DE EXTREMO A EXTREMO
- Clave pasada solo como variable de entorno `NVIDIA_NIM_API_KEY` (no se guarda en el repo).
- `/v1/messages` devuelve respuesta real del modelo `nvidia_nim/nvidia/nemotron-3-ultra-550b-a55b` en español.
- Streaming SSE y tool use (`tool_use` con `input_json_delta`) funcionan en formato Anthropic.
- Pendiente: probar `fcc-claude` (Claude Code real sobre el proxy), cheap-ag y AutoCua.

## fcc-claude (Claude Code real sobre el proxy FCC) — FUNCIONA
- Claude Code (`claude -p`) contra `ANTHROPIC_BASE_URL=http://127.0.0.1:8082` y el lanzador `fcc-claude -p` crean archivos con la herramienta Write usando Nemotron de NVIDIA NIM.
- Lección: el servidor debe arrancar con `NVIDIA_NIM_API_KEY` en su entorno; si ya hay una instancia en :8082 sin clave, Claude Code reintenta 503 y parece colgado. Matar la instancia y relanzar.
- `--dangerously-skip-permissions` fue bloqueado por el clasificador; se usó `--allowedTools Write`.

## Verificación de 2 posts de Reddit (2026-11-13)
- r/claudeskills "Sketchy": skill para que Claude dibuje diagramas. Repo `ddkbs/sketchy` existe, MIT, commit 2026-11-12; README confirma skill en zip para Claude (web/escritorio/móvil) y servidor MCP para Claude Code/Codex. VERDAD en lo comprobable; no se ejecutó.
- r/SATNA_PROJECT "10 repos": los 10 repos existen y están activos (Dream Loop, Blender Skills, TRELLIS.2, OpenDesign, Impeccable, HyperFrames, Superpowers, Graphify, Browser Use, Google Workspace CLI). Las salvedades del post coinciden con los README (TRELLIS.2: Linux + GPU NVIDIA de 24 GB; Google Workspace CLI: "not an officially supported Google product"; Dream Loop necesita generación de imágenes y visión). El post es promocional (enlace a Discord); el tono es exagerado pero el contenido es correcto.
- Límite: solo se leyeron README y metadatos; no se instaló ni ejecutó ninguno.
- Reddit bloquea curl y Firecrawl; funcionó TinyFish `fetch_content`.

## Pruebas reales de los repos de los posts de Reddit (2026-11-13)
| Repo | Resultado |
|---|---|
| ddkbs/sketchy | `npm ci`, `npm run build` OK; **128 tests passed (16 archivos)**. |
| pbakaus/impeccable | `npx impeccable detect test.html` sin clave: detectó **11 anti-patrones** (paleta morada "de IA", texto con degradado, contraste bajo, texto de 11 px, salto h1→h4, fuente Inter, palabras de marketing). Ver `artefactos/impeccable-test.html`. |
| heygen-com/hyperframes | `npx hyperframes init` + `check` (0 errores) + `render`: **MP4 de 4 s en 6,2 s** con Chromium por software. Ver `artefactos/hyperframes-demo.mp4`. |
| Graphify-Labs/graphify | `pip install graphifyy`; `graphify update` sobre el código de free-claude-code: **7235 nodos, 24061 aristas, 187 comunidades**, 100% local sin LLM; `graphify explain` respondió bien. |
| browser-use/browser-use | v1.0.3 con Chromium local y NVIDIA NIM (`nvidia/nemotron-3-ultra-550b-a55b`, API compatible con OpenAI): completó la tarea en 6 pasos y 26 s. Respuesta correcta (la example.com servida aquí no tiene h1). `meta/llama-3.3-70b-instruct` ya está retirado en NIM (410). Script: `artefactos/browser-use-nvidia.py` (la clave va por variable de entorno). En 1.0, `Browser()` es un navegador en la nube; para local usar `Browser("chromium", executable_path=...)`. |
| googleworkspace/cli | `npm i @googleworkspace/cli` OK; `gws --help` OK; sin OAuth devuelve `error[auth]`. Falta `gws auth login`. |
| EL4CTEO/blender-skills | Con `pip install bpy` (Blender 5.3 como módulo): **61 tests pasan, 1 falla** (addon), 5 archivos no corren por falta de GPU/EGL (core, npr, rendering, scene, video). |
| obra/superpowers | 14 skills revisadas (brainstorming, writing-plans, TDD, systematic-debugging...). No se instaló como plugin (modifica la config de Claude Code). |
| achimala/dream-loop | Es una skill (SKILL.md) + script `fal-batch.mjs`: **9/9 tests pasan**. El flujo completo necesita generación de imágenes (clave de fal/Gemini) y visión. |
| nexu-io/open-design | Monorepo Node 24 + pnpm 10.33.2: `pnpm install` falla en el postinstall de `packages/release` (el clon se hizo con `--filter=blob:limit=1m`, puede faltar algún archivo). Reintento bloqueado por el clasificador de permisos. |
| microsoft/TRELLIS.2 | No probado: exige Linux + GPU NVIDIA de 24 GB. |

## Posts de X revisados (2026-11-13)
- Se leyeron con la API pública de fxtwitter (`api.fxtwitter.com/<user>/status/<id>`).
- @cryptowluha y @flxrnc: listas de 16 repos para hacer motion graphics con IA (HyperFrames, Remotion, Remotion Skills, OpenMontage, GSAP, anime.js, video-shotcraft, Impeccable, Three.js, Blender, Blender MCP, Anatomy, ComfyUI, faster-whisper, FFmpeg, Mediabunny/Hallmark/Anthropic Skills). Útiles; @flxrnc pone un enlace de OpenMontage distinto (OpenMontageInc vs calesthio).
- @engmoelgaraihy: modelo "sin censura" (destilado DeepSeek-V4-Pro + Qwen3.5 9B, GGUF 5,6 GB) presumiendo de quitar los filtros de seguridad. Bombo; no se recomienda.
- @tye1337, @adeldeveloperx, @vynqorxe: cebos de engagement ("comenta guide", "98 mil $/mes", "65 mil $ en 23 días con TikTok"). Cifras no verificables.
- @astronaut_1216: DS-Bot (github.com/Fei2411/DS-Bot), plugin para DeepSeek Harness; promociona además un "中转站" (revendedor de API) y un descuento: precaución.
- @mxvdl: desglose de un shader de pinceladas en Three.js hecho con Fable 5.2 (vídeo).
- @robiartec: describe free-claude-code; coincide con lo que probamos aquí (proxy, NVIDIA NIM gratis, panel admin, modelo por tier).
