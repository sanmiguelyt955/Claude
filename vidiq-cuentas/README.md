# vidIQ Cuentas

Un conector MCP **por cada cuenta de vidIQ**, todos en un solo Worker de Cloudflare.

**Por qué existe:** claude.ai no deja agregar dos conectores con la misma URL. vidIQ siempre usa `https://mcp.vidiq.com/mcp`. Este Worker le da a cada cuenta su propia URL y reenvía todo a vidIQ con la clave de API de esa cuenta.

## URLs
`https://vidiq-cuentas.<subdominio>.workers.dev/<nicho>/mcp/<ACCESO>`

- `<nicho>` es el nombre del secreto sin `VIDIQ_`. Va en minúsculas: `VIDIQ_KUBO` → `/kubo/mcp/...`
- `/cuentas/mcp/<ACCESO>` lista los nombres de las cuentas configuradas. Nunca muestra las claves.

## Secretos (en Cloudflare, nunca en el repo ni en el chat)
- `ACCESO`: tu llave de acceso. Sin ella el Worker responde 404.
- `VIDIQ_<NICHO>`: la clave de API de vidIQ de cada cuenta. Se crea en `app.vidiq.com/account/settings/mcp`.

## Límites
- Las claves de API de vidIQ son de **solo lectura**: no editan ni publican videos.
- Cada cuenta gasta sus propios créditos.

## Publicar
`npx wrangler deploy`

## Cuentas de Sanmi
| Conector en claude.ai | Secreto en Cloudflare | Ruta |
|---|---|---|
| VidIQ-Sanmiguelyt3 | `VIDIQ_SANMIGUELYT3` | `/sanmiguelyt3/mcp/<ACCESO>` |
| VidIQ-Burneracsanmillonario | `VIDIQ_BURNERACSANMILLONARIO` | `/burneracsanmillonario/mcp/<ACCESO>` |
| VidIQ-Walllife7 | `VIDIQ_WALLLIFE7` | `/walllife7/mcp/<ACCESO>` |
| VidIQ-Luffybloom777 | `VIDIQ_LUFFYBLOOM777` | `/luffybloom777/mcp/<ACCESO>` |
| VidIQ-Automatizaciones777 | `VIDIQ_AUTOMATIZACIONES777` | `/automatizaciones777/mcp/<ACCESO>` |
| VidIQ-Noticiasia777 | `VIDIQ_NOTICIASIA777` | `/noticiasia777/mcp/<ACCESO>` |

Cuando Claude ve estos conectores, cada uno se llama `mcp__VidIQ-<cuenta>__...`. Antes de gastar créditos, revisa el saldo con `vidiq_balance`.
