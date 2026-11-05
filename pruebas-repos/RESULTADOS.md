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
