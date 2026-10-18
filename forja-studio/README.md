# Forja Studio

Estudio de generación con IA (imagen, vídeo y audio) recreado a partir de la
[ingeniería inversa de Higgsfield](../higgsfield-reverse-engineering/README.md).
Copia su **arquitectura**, no su marca: un único contrato de jobs sobre muchos modelos de terceros,
créditos con cotización previa y reembolso, subidas en tres pasos y sondeo de estado.

```
Navegador ──► Express ──► JobService (cola + concurrencia + créditos) ──► Proveedor
   │            │                                                        ├─ mock (local, sin claves)
   │            └─ /files  (subidas y resultados guardados en disco)      ├─ fal.ai  (queue API)
   └─ public/ (HTML+CSS+JS sin build)                                     └─ KIE.ai  (Market API)
```

## Arrancar

```bash
npm install
npm start            # http://localhost:4600  (proveedor mock: no gasta dinero)
npm test             # 10 tests: ciclo completo + adaptadores con fetch simulado
```

Con un proveedor real:

```bash
FAL_KEY=xxxx npm start                 # fal.ai
KIE_API_KEY=xxxx npm start             # KIE.ai
PROVIDER=kie KIE_API_KEY=xxxx npm start   # forzar uno si tienes las dos claves
```

| Variable | Por defecto | Para qué |
|---|---|---|
| `PROVIDER` | `fal` si hay `FAL_KEY`, si no `kie` si hay `KIE_API_KEY`, si no `mock` | Proveedor de generación |
| `PORT` | `4600` | Puerto HTTP |
| `INITIAL_CREDITS` | `500` | Créditos del usuario al crear la base de datos |
| `CONCURRENCY` | `2` | Jobs simultáneos (el "concurrent boost" de Higgsfield) |
| `PUBLIC_BASE_URL` | vacío | URL pública del servidor. Si se define, las referencias se envían al proveedor como URL; si no, como data URI (vale para fal, KIE necesita URL) |
| `API_TOKEN` | vacío | Si se define, la API exige `Authorization: Bearer <token>` (la web lo pide una vez) |
| `DATA_DIR` | `./data` | Base de datos JSON y archivos |
| `MAX_UPLOAD_MB` | `100` | Tamaño máximo de subida |
| `MOCK_DELAY_MS` | `2500` | Duración simulada de cada job en modo mock |

En modo mock, escribir `[fail]` o `[nsfw]` en el prompt simula esos estados (y el reembolso).

## API (mismo contrato que el original)

| Método | Ruta | Equivalente en Higgsfield |
|---|---|---|
| `GET` | `/api/user` | `/fnf/user` (créditos) |
| `GET` | `/api/models`, `/api/models/:id` | `models_explore` del MCP |
| `POST` | `/api/job-sets/costs` `{job_type, params}` | `/fnf/job-sets/costs` |
| `POST` | `/api/media/batch` `{mimetypes}` → `[{id, upload_url}]` | `/fnf/media/batch` |
| `PUT` | `/api/media/:id/blob` (binario) | PUT a la URL firmada de S3/GCS |
| `POST` | `/api/media/:id/upload` | `/fnf/media/{id}/upload` |
| `POST` | `/api/jobs/v2/:jobType` `{params}` | `/fnf/jobs/v2/{jobType}` |
| `GET` | `/api/jobs?limit&cursor&type`, `/api/jobs/:id` | historial / `/fnf/jobs/{id}` |
| `POST` | `/api/jobs/status-batch` `{ids}` | `/fnf/jobs/status-batch` |
| `POST` | `/api/jobs/:id/cancel` | — |

Estados: `queued → in_progress → completed | failed | nsfw | canceled`. Solo `completed` consume créditos.

```bash
curl -s localhost:4600/api/jobs/v2/flux_schnell -H 'Content-Type: application/json' \
  -d '{"params":{"prompt":"una zapatilla flotando, luz de estudio","aspect_ratio":"9:16"}}'
```

## Añadir o corregir modelos

Todo está en [`server/catalog.json`](server/catalog.json), sin tocar código:

- `params` / `aspect_ratios` / `media`: lo que ve la interfaz y lo que se valida.
- `cost` (por job) o `cost_per_second` (vídeo). Un parámetro con `multiplies_cost` multiplica el precio.
- `providers.fal.endpoint` o `providers.kie.model`. Con `with_media`, la variante que se usa cuando hay referencias.
- `inputs`: el campo del proveedor que recibe cada rol de media (`*_urls` se envía como lista).
- `params` del proveedor: renombrar (`to`), traducir valores (`map`), formatear (`template: "{v}s"`) o descartar (`drop`).

> Los ids de modelo de fal.ai y KIE.ai cambian a menudo. Los del catálogo siguen sus convenciones
> públicas, pero **verifícalos** en fal.ai/models y kie.ai/market antes de usar dinero real.
> Los tests prueban el mapeo con respuestas simuladas, no contra las APIs reales.

## Próximos pasos (lo que tiene Higgsfield y aquí falta)

- Usuarios y workspaces reales (Clerk / Auth.js) y pagos (Stripe) en lugar de un usuario local.
- Postgres + cola externa (BullMQ / Cloud Tasks) para escalar a varios nodos.
- Webhooks del proveedor en vez de sondeo.
- Capa de producto: presets encadenados (vídeo viral), personajes persistentes (Soul ID), estudios guiados
  y un agente que orqueste workflows, como los 13 del MCP de Higgsfield.
- Audio local con [VoiceStudio](https://github.com/debpalash/VoiceStudio) como proveedor adicional.
