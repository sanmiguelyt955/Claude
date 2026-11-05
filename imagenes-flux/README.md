# imagenes-flux: imágenes gratis con FLUX para Claude

Conector MCP en Cloudflare Workers que genera imágenes con **FLUX** (Workers AI), dentro de la **cuota gratis diaria** (10 000 neuronas, se reinicia a las 00:00 UTC = 18:00 en el centro de México):

| Tipo | Modelo | Gasto aprox. | Al día gratis |
|---|---|---|---|
| Cuadrada 1024×1024 | FLUX.1 schnell | ~96 neuronas | ~100 |
| Vertical 9:16 (768×1360) | FLUX.2 klein 4B | ~156 neuronas | ~60 |

Herramientas:
- `generar_imagen`: 1-4 imágenes, con formato, frase de estilo y fondo verde o azul para recortar.
- `generar_capas`: las capas de una escena de collage, con un fondo y cada elemento sobre croma.
- `cuota_imagenes`: cuánto queda hoy.

Las imágenes se ven en el chat y quedan 30 días en `https://imagenes-flux.<cuenta>.workers.dev/img/<id>.jpg`.

## Estado
Publicado en `https://imagenes-flux.sanmiguelyt955.workers.dev` (cuenta de Cloudflare de sanmiguelyt955), con el secreto `CLAVE` ya puesto. Probado: schnell 1:1 en ~14 s (77 neuronas) y klein 9:16 sobre verde en ~7 s (156 neuronas); el recorte de `motion.py` lo deja limpio.
Para clientes propios (scripts), manda un `User-Agent` normal: la protección de Cloudflare bloquea el de Python por defecto.

## Publicarlo de nuevo (si hiciera falta, desde el celular)
1. https://dash.cloudflare.com → **Workers & Pages** → **Create** → **Import a repository** → `sanmiguelyt955/Claude`.
2. **Project name:** `imagenes-flux` · **Root directory:** `imagenes-flux` · **Deploy command:** `npx wrangler deploy` · **Rama:** la que tenga esta carpeta (`main` cuando esté fusionada).
3. Cuando termine: Worker `imagenes-flux` → **Settings → Variables and Secrets → Add** → tipo **Secret**, nombre `CLAVE`, valor: una clave larga inventada (letras, números y guiones). Guarda.
4. Abre `https://imagenes-flux.<tu-cuenta>.workers.dev/`. Debe decir `{"servicio":"imagenes-flux","estado":"ok"}`.

El almacén de imágenes (KV `imagenes-flux`) ya está creado en tu cuenta y conectado en `wrangler.jsonc`.

## Conectarlo a Claude
claude.ai → **Configuración → Conectores → Añadir conector personalizado** →
`https://imagenes-flux.<tu-cuenta>.workers.dev/<CLAVE>/mcp` → nombre `imagenes-flux`.
Sirve en todos los chats, en Cowork y en Claude Code. No compartas la URL: quien la tenga gasta tu cuota.

## Si se acaba la cuota
El servidor avisa antes de pasarse y no cobra nada: en el plan gratuito de Workers no hay cargos. Mañana vuelve a haber cuota.
