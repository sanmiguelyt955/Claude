# Cómo usar Video Analyzer en tu computadora

> **Ahora mismo no hay instalador para descargar.** GitHub desactivó las
> "Actions" de la cuenta, que son las que construyen el instalador y lo
> publican. Hasta que el soporte de GitHub las reactive, usa el lanzador
> `.bat` (más abajo, en **Alternativa**): se actualiza solo desde el código.

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
cd Claude
git checkout claude/admiring-newton-086e1x
```

La última línea importa: las mejoras están en esa rama, y el lanzador se
actualiza desde la rama en la que estés.

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

### Cuánto tarda un análisis

Medido con Gemini real, en un servidor sin tarjeta gráfica:

| Video | Condiciones | Tiempo | Peticiones |
|---|---|---|---|
| 15 minutos | Google normal, modelos buenos | **11 min** | 12 |
| 51 minutos | Google saturado toda la noche | **unos 74 min** | 219 (165 de Flash-Lite) |

Calculado a partir de la medición de 15 minutos (sin medir todavía):

| Duración del video | Con Google normal | Peticiones a los modelos buenos (40 al día) |
|---|---|---|
| 1 minuto | 2–3 min | 3 |
| 5 minutos | 4–5 min | 5 |
| 30 minutos | 15–20 min | ~18 |
| 1 hora | 25–35 min | ~33 |
| 1 h 40 min | 45–60 min | ~53: no caben; el resto lo hace Flash-Lite |

- Gemini ve el video en partes de 2 minutos, 8 a la vez.
- Google cuenta como gastadas las peticiones que rechaza por saturación
  (error 503). En una noche saturada los modelos buenos se agotan pronto y
  Flash-Lite hace casi todo: tarda más, porque muchas de sus respuestas no
  pasan los controles y la app parte esas partes en trozos más pequeños.
- Un trozo de 15 segundos que ningún modelo consigue describir queda marcado
  como «sin registro» (con lo que se dice y los cortes medidos) y el análisis
  sigue.
- Con la tarjeta gráfica (RTX 3050), la transcripción debería ir más rápido.
- Si se acaban todas las peticiones del día, el análisis espera a que se
  renueven (medianoche de California) y continúa solo, sin perder lo avanzado.
- Al terminar, la app indexa el video para la búsqueda en segundo plano. En
  el video de 51 minutos eso son unos 1.260 fragmentos, unos 16 minutos más;
  la búsqueda va encontrando más mientras tanto.

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
