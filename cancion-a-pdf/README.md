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

Los archivos generados se guardan en `salidas/` (ignorada por git).

## Empaquetar como programa instalable (opcional, sin probar aún)

```bash
pip install pyinstaller
pyinstaller --windowed --name CancionPDF app_escritorio.py
```

Hay que incluir ffmpeg en el equipo destino y, por el tamaño de faster-whisper, el ejecutable será grande.
