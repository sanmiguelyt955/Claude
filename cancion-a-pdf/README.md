# Canción → MP3 → PDF

Convierte el audio de un video en MP3 y genera un PDF con la letra de la canción.
Tiene dos formas de uso: **página web** y **programa de escritorio** (la misma app dentro de una ventana).

## Qué hace

1. Extrae el audio del video a **MP3** (ffmpeg).
2. Obtiene la **letra**:
   - Si pegas la letra en el campo correspondiente, se usa tal cual (lo más preciso).
   - Si no, la transcribe del audio con **Whisper** (faster-whisper, se ejecuta en tu equipo, sin pagar APIs).
3. Crea un **PDF** con el título y la letra (opcionalmente con marcas de tiempo).

> Limitación: la transcripción automática de voz cantada es menos precisa que la voz hablada.
> Si la letra es importante, pégala en el campo "Letra".
> Esta versión genera PDF con **letra**, no partitura musical.

## Requisitos

- Python 3.10 o superior
- **ffmpeg** en el sistema:
  - macOS: `brew install ffmpeg`
  - Windows: `winget install ffmpeg`
  - Linux: `sudo apt install ffmpeg`

## Instalación

```bash
cd cancion-a-pdf
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

## Uso

**Web** (se abre en el navegador):

```bash
python app_web.py
# abre http://127.0.0.1:5057
```

**Escritorio** (ventana propia):

```bash
python app_escritorio.py
```

Luego: elige el video, escribe el título, opcionalmente pega la letra, y pulsa **Convertir**.

## Usar desde el celular

**En casa (misma red Wi-Fi):** en el computador ejecuta
`CANCION_HOST=0.0.0.0 python app_web.py` (en Windows: `set CANCION_HOST=0.0.0.0` y luego `python app_web.py`)
y abre en el celular `http://IP_DEL_COMPUTADOR:5057`. Desde el menú del navegador puedes "Añadir a pantalla de inicio".

**En la nube:** usa el `Dockerfile` incluido (trae ffmpeg y los modelos ya descargados). Define siempre
`CANCION_CLAVE` con una contraseña para que nadie más pueda usarla. El navegador la pide una vez.

Memoria necesaria (medida): pico de ~1,4 GB con el modelo `small` y ~600 MB con `base`.
**No cabe en servidores de 512 MB** (plan gratuito o Starter de Render): el proceso muere por falta de memoria.
Hugging Face Spaces (CPU gratuito, 16 GB) sí tiene espacio de sobra.

La conversión corre en segundo plano y la página de estado se actualiza sola, así que se puede bloquear
el celular mientras espera.

## Pruebas

```bash
pip install pytest
python -m pytest -q tests
```

## Estructura

| Archivo | Función |
|---|---|
| `convertidor.py` | Núcleo: ffmpeg, transcripción y generación de PDF |
| `app_web.py` | Servidor web (Flask) |
| `app_escritorio.py` | Ventana de escritorio (pywebview) |
| `templates/index.html` | Interfaz |
| `tests/` | Pruebas del núcleo |

Los archivos generados se guardan en `salidas/` (ignorada por git) y se borran automáticamente a las 24 horas.

La primera transcripción descarga el modelo de Whisper (decenas o cientos de MB según el modelo) y puede tardar varios minutos según la duración del audio.

## Empaquetar como programa instalable (opcional, sin probar aún)

```bash
pip install pyinstaller
pyinstaller --windowed --name CancionPDF app_escritorio.py
```

Hay que incluir ffmpeg en el equipo destino y, por el tamaño de faster-whisper, el ejecutable será grande.
