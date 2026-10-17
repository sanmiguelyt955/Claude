# Cómo usar Video Analyzer en tu computadora (Windows)

La app corre en tu computadora y se abre en el navegador. La instalas **una
sola vez**; después, cada vez que la abres con el lanzador, se actualiza sola
desde GitHub.

## 1. Instala los programas (una sola vez)

Abre **PowerShell** (menú Inicio → escribe "PowerShell") y pega:

```powershell
winget install Git.Git
winget install OpenJS.NodeJS.LTS
winget install Python.Python.3.12
winget install Gyan.FFmpeg
```

Cierra PowerShell y vuelve a abrirlo para que reconozca los programas nuevos.

## 2. Descarga la app (una sola vez)

En PowerShell, elige dónde guardarla (por ejemplo, Documentos) y descárgala:

```powershell
cd $HOME\Documents
git clone https://github.com/sanmiguelyt955/Claude.git
```

Si te pide iniciar sesión en GitHub, hazlo: el repositorio es tuyo.

## 3. Ábrela

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

## 4. Pruébala

1. **+ Cargar video** → sube un video (MP4, MOV…).
2. Cuando diga "listo para analizar", pulsa **Analizar**. El análisis corre en
   segundo plano: puedes seguir usando la app.
3. Al terminar, en la página del video:
   - **Resumen**, **Timeline** (escenas con su minuto) y **Transcripción**
     (lo que se dice, con nuestro Whisper).
   - **Chat**: pregunta lo que quieras ("¿cuándo dice el precio?"); la
     respuesta cita el momento del video.
   - **Buscar en este video** y, en la Biblioteca, buscar en todos tus videos.
   - **Exportar a Obsidian** (si configuraste `OBSIDIAN_VAULT_PATH`).

## Actualizaciones

No tienes que hacer nada: cada vez que abres `Iniciar Video Analyzer.bat`,
revisa GitHub, baja lo nuevo, instala solo lo que cambió y vuelve a compilar
si hace falta. Si la app ya estaba abierta y hay una actualización, la cierra,
la actualiza y la vuelve a abrir.

No se actualiza si editaste archivos de la app a mano (para no perder tus
cambios) o si no hay internet (usa la versión que ya tienes). En ambos casos
el lanzador te lo dice.

## Cerrarla

Doble clic en **`Detener Video Analyzer.bat`**. La app usa dos ventanas
minimizadas en la barra de tareas ("Video Analyzer - Web" y "Video Analyzer -
Worker"); si algo falla, ábrelas para ver el error.

## Tus datos

Videos, análisis y conversaciones se guardan en `video-analyzer\data\`, en tu
computadora. No se suben a GitHub y las actualizaciones no los borran.
