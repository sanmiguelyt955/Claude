# Conectar video-claude en la nube (Hugging Face gratis) + Claude Code + Cowork

Todo el procesamiento corre en **tu Space gratuito de Hugging Face** (16 GB de RAM y 2 CPU). Los modelos son abiertos y no se usa ninguna API de pago.
No hacen falta GitHub Actions ni tokens. Haz esto **una sola vez** (unos 5 min).

## 1. Crear el Space
1. Entra en https://huggingface.co/new-space (con tu cuenta `Sanmiguelyt955`).
2. **Space name:** `video-nube`.
3. **SDK:** **Docker** → plantilla **Blank**.
4. **Hardware:** **CPU basic · Free**.
5. **Visibilidad:** **Public**. Es obligatorio: claude.ai no puede entrar en un Space privado. Lo protege la clave del paso 2.
6. Pulsa **Create Space**.

## 2. Poner la clave secreta
En el Space: **Settings** → **Variables and secrets** → **New secret**.
- **Name:** `MCP_CLAVE`
- **Value:** una clave larga inventada por ti, con letras, números y guiones (p. ej. `vn-8f3k2p9q7x4m`). Guárdala: va dentro de la URL del conector.

## 3. Subir el código
1. Descarga del repo de GitHub el archivo **`dist/space-video-nube.zip`** y descomprímelo en tu computadora. Salen 7 archivos: `Dockerfile`, `README.md`, `requirements-nube.txt`, `servidor_nube.py`, `vision_local.py`, `escucha_local.py` y `oido_modelo.py`.
2. En el Space: pestaña **Files** → **Add file** → **Upload files**.
3. Arrastra **los 7 archivos sueltos** (no el zip). El `README.md` sustituye al que creó Hugging Face; es correcto.
4. Pulsa **Commit changes to main**.

El Space empieza a construirse solo. Tarda unos **10-15 min** la primera vez: instala las librerías y después descarga unos 12 GB de modelos.
Cuando la pestaña **App** muestre `{"servicio":"video-nube","estado":"ok",…}`, ya está listo.

## 4. Tu URL de conector
```
https://sanmiguelyt955-video-nube.hf.space/<MCP_CLAVE>/mcp
```
Cambia `<MCP_CLAVE>` por tu clave. No compartas esta URL: quien la tenga puede usar tu servidor.

## 5. Cowork y claude.ai
1. **Conector:** Configuración → **Conectores** → **Añadir conector personalizado** → pega la URL del paso 4 → nombre `video-nube`.
2. **Skills:** descarga `dist/ver-video.zip` y `dist/video-editor.zip` y súbelas en Configuración → **Capacidades / Skills** → **Subir skill**.
   - Si tu Cowork admite plugins, puedes subir `dist/video-claude.plugin`, que trae las dos juntas. El conector se añade igualmente en el punto 1.

## 6. Claude Code (cualquier proyecto)
```
/plugin marketplace add sanmiguelyt955/claude
/plugin install video-claude@sanmiguel
```
Mientras los cambios estén solo en la rama de trabajo, usa:
`/plugin marketplace add https://github.com/sanmiguelyt955/claude.git#claude/video-editing-skill-6wybxb`

El conector del plugin lee la URL de `VIDEO_NUBE_URL`. Ponla en `~/.claude/settings.json`:
```json
{ "env": { "VIDEO_NUBE_URL": "https://sanmiguelyt955-video-nube.hf.space/<MCP_CLAVE>/mcp" } }
```
En Claude Code en la web, añádela en las **variables de entorno** del entorno de la nube.

## 7. Usarlo
- Pide cosas como «mira este video y dime dónde se ríen», «¿con qué tono habla en el 01:20?» o «¿cuántas personas hablan?».
- **Archivos tuyos:** la nube no ve tu disco. Dale un enlace directo o súbelo primero:
  `curl -F "archivo=@mi_video.mp4" https://sanmiguelyt955-video-nube.hf.space/<MCP_CLAVE>/subir` → `subida:<id>`.
  Claude lo hace solo cuando tiene el archivo a mano.
- YouTube y Vimeo bloquean las descargas desde servidores. Si los necesitas, añade al Space un secreto `YTDLP_COOKIES` con tus cookies en formato Netscape (usa tu sesión).

## Actualizar el servidor más adelante
Cuando cambie el código, te dejaré un `dist/space-video-nube.zip` nuevo: vuelve a subir los 7 archivos (paso 3).

## Límites del plan gratuito
- La primera pasada de un video tarda en CPU aproximadamente su duración. Memoria medida: 2,5 GB sin `oir` y 7,8 GB con `oir`, dentro de los 16 GB.
- El Space se duerme tras un tiempo sin uso. La primera llamada lo despierta, tarda unos minutos y vuelve a descargar los modelos.
- El disco es temporal: subidas, cuadros y caché se borran al reiniciarse.
