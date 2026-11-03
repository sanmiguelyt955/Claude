# Conectar video-claude en la nube (Hugging Face) + Claude Code + Cowork

Todo el procesamiento corre en **tu Space de Hugging Face**: los modelos son abiertos y no se usa ninguna API de pago.
El despliegue es automático desde GitHub. Solo hay que hacer estos pasos **una vez**.

## 1. Token de Hugging Face (2 min)
1. Crea una cuenta gratis en https://huggingface.co (o entra con la tuya).
2. Ve a https://huggingface.co/settings/tokens → **Create new token** → tipo **Write** → cópialo.

## 2. Secretos en GitHub (2 min)
En https://github.com/sanmiguelyt955/claude/settings/secrets/actions → **New repository secret**:
| Nombre | Valor |
|---|---|
| `HF_TOKEN` | el token del paso 1 |
| `MCP_CLAVE` | una clave larga inventada por ti, solo letras, números y guiones (p. ej. `vn-8f3k2p9q7x`). Va dentro de la URL y protege el servidor |

Opcional, en la pestaña **Variables**: `HF_SPACE` = `tu-usuario/video-nube` (si no la pones, se usa ese nombre).
Opcional, como secreto del Space (en Hugging Face): `YTDLP_COOKIES` (cookies de YouTube en formato Netscape) si quieres analizar enlaces de YouTube. Sin cookies, YouTube suele bloquear las descargas desde servidores.

## 3. Desplegar (elige una vía)
**Vía A: GitHub Actions (automática).** El despliegue se lanza solo en cada push que toque el servidor.
- Si en la pestaña **Actions** del repo no aparece ninguna ejecución, Actions está desactivado. Actívalo en Settings → Actions → General → **Allow all actions**.
- Para lanzarlo ya: **Actions** → **Desplegar video-nube en Hugging Face** → última ejecución → **Re-run all jobs**.

**Vía B: desde una sesión de Claude Code en la web.**
1. En el menú del entorno de la nube (barra de título de la sesión → **Edit**), añade como variables de entorno `HF_TOKEN` (el token *Write* del paso 1) y `MCP_CLAVE`.
2. Abre una sesión nueva y pide «despliega video-nube». Claude ejecuta `python nube/desplegar.py`.

Nunca pegues el token en el chat.
Al terminar, el registro muestra la URL del Space. El primer arranque tarda unos 10-15 min (construye la imagen y descarga unos 12 GB de modelos).

Comprueba que responde: `https://<usuario>-video-nube.hf.space/` → `{"estado": "ok"}`.

Tu URL de conector es:
```
https://<usuario>-video-nube.hf.space/<MCP_CLAVE>/mcp
```

## 4. Cowork y claude.ai
1. **Conector:** Configuración → **Conectores** → **Añadir conector personalizado** → pega la URL del paso 3 → nombre `video-nube`.
2. **Skills:** descarga de GitHub `dist/ver-video.zip` y `dist/video-editor.zip`, y súbelas en Configuración → **Capacidades / Skills** → **Subir skill**.
   - Si tu Cowork admite plugins, puedes subir `dist/video-claude.plugin`, que trae las dos skills juntas. El conector se añade igualmente en el punto 1, porque la URL secreta no va dentro del paquete.

## 5. Claude Code (cualquier proyecto)
```
/plugin marketplace add sanmiguelyt955/claude
/plugin install video-claude@sanmiguel
```
Mientras los cambios estén solo en la rama de trabajo, usa:
`/plugin marketplace add https://github.com/sanmiguelyt955/claude.git#claude/video-editing-skill-6wybxb`

El plugin incluye el conector `video-nube`, que lee la URL de la variable de entorno `VIDEO_NUBE_URL`. Ponla en tu `~/.claude/settings.json`:
```json
{ "env": { "VIDEO_NUBE_URL": "https://<usuario>-video-nube.hf.space/<MCP_CLAVE>/mcp" } }
```
En las sesiones de Claude Code en la web, ponla en las **variables de entorno** del entorno de la nube.

## 6. Usarlo
- Pide cosas como «mira este video y dime dónde se ríen», «¿con qué tono habla en el minuto 2?» o «¿cuántas personas hablan?».
- **Archivos tuyos:** la nube no ve tu disco. Pásale un enlace directo o súbelo primero:
  `curl -F "archivo=@mi_video.mp4" https://<usuario>-video-nube.hf.space/<MCP_CLAVE>/subir` → `subida:<id>`.
  Claude lo hace solo cuando trabaja con archivos locales.

## Límites del plan gratuito de Hugging Face
- CPU básica: 2 vCPU y 16 GB de RAM. Basta para todos los modelos; la primera pasada de un video tarda aproximadamente su duración.
- El Space se duerme tras un tiempo sin uso: la primera llamada lo despierta y tarda unos minutos.
- El disco es temporal: subidas, cuadros y caché se borran al reiniciarse.
- **Render no sirve aquí:** su plan gratuito da 512 MB de RAM y solo los modelos ocupan unos 12 GB.
