# Servidor MCP de video (local, sin APIs en la nube)

Analiza `datos/videos/prueba.mp4` con **ffmpeg** (cuadros y audio) y **faster-whisper** (transcripción local, modelo `small`). No usa Gemini, Google, Hugging Face Spaces, Render ni ninguna API de pago.

## Instalación
Requisitos: Python 3 y `ffmpeg` instalados.

```bash
python --version
ffmpeg -version
pip install -r requirements.txt
```
La primera transcripción descarga los pesos del modelo `small` (una sola vez) y después corre 100 % en local, en CPU.

## Uso
1. Copia tu video a `datos/videos/prueba.mp4`. Si no existe, la herramienta se detiene con: `Falta datos/videos/prueba.mp4`.
2. Verifica la sintaxis: `python -m py_compile servidor_nube.py`
3. Arranca el servidor MCP: `python servidor_nube.py`. Claude Code lo detecta con `.mcp.json` (servidor `video-nube`).
4. Llama a la herramienta **`analizar_video_nube`** (parámetros fijos: `video_path=datos/videos/prueba.mp4`, `intervalo_segundos=2`, `inicio_segundos=0`, `fin_segundos=0` = hasta el final, `idioma=auto`).

## Salida
Un único JSON con `duracion_segundos`, `resolucion`, `fps_original`, `cuadros` (`tiempo_segundos`, `tiempo_hhmmss`, `archivo`) y `transcripcion` (`inicio`, `fin`, `texto`). Las imágenes no van en el JSON, solo sus rutas.

Archivos generados (solo dentro de `datos/`):
- `datos/cuadros/prueba/cuadro_00012.jpg` (el nombre es el segundo del cuadro, 5 dígitos; JPG de 720 px de ancho)
- `datos/audio/prueba.wav` (mono, 16000 Hz)
El video original nunca se modifica ni se borra.

## Ver videos como Gemini (local, clean room)

`vision_local.py` reimplementa en local lo que la documentación pública de Google describe para Gemini:
1 cuadro por segundo con marca `MM:SS`, voz alineada a cada cuadro, `fps` configurable, recorte
`start_offset`/`end_offset`, `media_resolution` (`low` = 384 px, `default` = 768 px) y modo `agentic`
(primero la transcripción y luego solo los tramos necesarios). No llama a Gemini ni a ninguna API.

Herramientas MCP añadidas al mismo servidor `video-nube`:
- `ver_video(video_path, processing, fps, start_offset, end_offset, media_resolution, idioma)`: devuelve las imágenes intercaladas con `[MM:SS] voz: «…»`.
- `cargar_segmento(video_path, id | inicio, fin, fps, media_resolution)`: carga un tramo en modo agentic.

CLI: `python vision_local.py video.mp4 --fps 2 --start 30 --end 60 --res low`
Skill para Claude Code: `.claude/skills/ver-video/SKILL.md`. Las salidas van a `datos/vision/` (ignorado por git).
