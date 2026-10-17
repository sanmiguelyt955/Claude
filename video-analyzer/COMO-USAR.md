# Cómo usar Video Analyzer en tu computadora

## Opción recomendada: instalar la app (como el Editor de video)

1. Abre <https://github.com/sanmiguelyt955/Claude/releases/tag/video-analyzer-latest>
   y descarga el instalador:
   - **Windows:** `Video-Analyzer-…-win-x64.exe`
   - **Mac (Apple Silicon):** `Video-Analyzer-…-mac-arm64.dmg`
2. Instálala. Trae todo lo que necesita (Node, Python con Whisper, FFmpeg): no
   hay que instalar nada más.
   - **Windows** puede mostrar "Windows protegió su PC" porque el instalador no
     está firmado: pulsa **Más información → Ejecutar de todas formas**.
   - **Mac:** la primera vez ábrela con **clic derecho → Abrir** (tampoco está
     firmada por Apple).
3. Ábrela. Te pedirá una clave de IA: en **Archivo → Configuración (claves de
   IA)** pega tu clave de Claude (`ANTHROPIC_API_KEY`, en
   <https://platform.claude.com/settings/keys>) y/o de Gemini
   (`GEMINI_API_KEY`, en <https://aistudio.google.com/apikey>), guarda y usa
   **Archivo → Reiniciar**.

**Actualizaciones:** la app revisa sola si hay una versión nueva cada vez que
la abres. En Windows la descarga y te ofrece reiniciar para instalarla; en Mac
te avisa y abre la página de descarga. Tus videos, análisis y conversaciones
se conservan (viven en la carpeta de datos de la app: **Archivo → Abrir carpeta
de datos**).

La primera vez que analizas un video tarda un poco más: descarga los pesos de
Whisper (unos 500 MB para el modelo `small`) y los guarda para siempre.

### Videos de TikTok, Instagram y YouTube

En **+ Cargar video → Pegar URL** pega el enlace de la publicación (también
los cortos, como `vm.tiktok.com/...`). La app descarga el video sola, con el
título real de la publicación.

Instagram (y algunos TikTok) solo dejan descargar si tienes la sesión
iniciada. Si la app te lo dice, abre **Archivo → Configuración**, agrega la
línea `YTDLP_COOKIES_FROM_BROWSER=firefox` (o `edge`, `chrome`, `safari`: el
navegador donde tienes tu sesión de Instagram abierta), guarda y reinicia la
app. Con Chrome en Windows a veces no funciona porque Chrome protege sus
cookies; en ese caso usa Firefox o Edge.

---

## Alternativa: el lanzador `.bat` (Windows, para desarrollo)

Corre la app directamente desde el código del repositorio; útil si vas a
modificarla. Requiere instalar los programas a mano.

### 1. Instala los programas (una sola vez)

Abre **PowerShell** (menú Inicio → escribe "PowerShell") y pega:

```powershell
winget install Git.Git
winget install OpenJS.NodeJS.LTS
winget install Python.Python.3.12
winget install Gyan.FFmpeg
```

Cierra PowerShell y vuelve a abrirlo para que reconozca los programas nuevos.

### 2. Descarga la app (una sola vez)

En PowerShell, elige dónde guardarla (por ejemplo, Documentos) y descárgala:

```powershell
cd $HOME\Documents
git clone https://github.com/sanmiguelyt955/Claude.git
```

Si te pide iniciar sesión en GitHub, hazlo: el repositorio es tuyo.

### 3. Ábrela

Entra a `Documents\Claude\video-analyzer` y haz doble clic en
**`Iniciar Video Analyzer.bat`**.

La primera vez tarda unos minutos porque instala todo. Además:

1. Se abre el Bloc de notas con el archivo de configuración `.env.local`.
   Pon tu clave de **Anthropic** (`ANTHROPIC_API_KEY=...`, se crea en
   <https://platform.claude.com/settings/keys>) y/o de **Gemini**
   (`GEMINI_API_KEY=...`, en <https://aistudio.google.com/apikey>).
   Guarda y cierra el Bloc de notas.
2. La app se abre sola en el navegador, en <http://localhost:3000>.

Las siguientes veces abre en segundos.

### 4. Pruébala

1. **+ Cargar video** → sube un video (MP4, MOV…) o pega el enlace de un
   TikTok, Instagram o YouTube.
2. Cuando diga "listo para analizar", pulsa **Analizar**. El análisis corre en
   segundo plano: puedes seguir usando la app.
3. Al terminar, en la página del video:
   - **Resumen**, **Timeline** (escenas con su minuto) y **Transcripción**
     (lo que se dice, con nuestro Whisper).
   - **Chat**: pregunta lo que quieras ("¿cuándo dice el precio?"); la
     respuesta cita el momento del video.
   - **Buscar en este video** y, en la Biblioteca, buscar en todos tus videos.
   - **Exportar a Obsidian** (si configuraste `OBSIDIAN_VAULT_PATH`).

### Actualizaciones del lanzador

No tienes que hacer nada: cada vez que abres `Iniciar Video Analyzer.bat`,
revisa GitHub, baja lo nuevo, instala solo lo que cambió y vuelve a compilar
si hace falta. Si la app ya estaba abierta y hay una actualización, la cierra,
la actualiza y la vuelve a abrir.

No se actualiza si editaste archivos de la app a mano (para no perder tus
cambios) o si no hay internet (usa la versión que ya tienes). En ambos casos
el lanzador te lo dice.

### Cerrarla

Doble clic en **`Detener Video Analyzer.bat`**. La app usa dos ventanas
minimizadas en la barra de tareas ("Video Analyzer - Web" y "Video Analyzer -
Worker"); si algo falla, ábrelas para ver el error.

### Tus datos (lanzador)

Videos, análisis y conversaciones se guardan en `video-analyzer\data\`, en tu
computadora. No se suben a GitHub y las actualizaciones no los borran.
