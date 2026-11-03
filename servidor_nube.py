"""Servidor MCP local para analizar un video sin APIs en la nube.

Herramienta: analizar_video_nube
  - ffmpeg extrae cuadros (JPG 720 px de ancho) y audio (WAV mono 16 kHz)
  - faster-whisper (modelo small, en local, CPU) transcribe el audio
  - devuelve un solo JSON; las imágenes NO van dentro del JSON, solo sus rutas
Solo escribe dentro de la carpeta datos/ de este repositorio.
"""
import json
import math
import subprocess
from pathlib import Path

from fastmcp import FastMCP

RAIZ = Path(__file__).resolve().parent
VIDEO_REL = "datos/videos/prueba.mp4"
DIR_CUADROS_REL = "datos/cuadros/prueba"
AUDIO_REL = "datos/audio/prueba.wav"
INTERVALO = 2

mcp = FastMCP("video-nube")


def _hhmmss(s):
    s = int(s)
    return f"{s // 3600:02d}:{s % 3600 // 60:02d}:{s % 60:02d}"


def _ffprobe(video):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height,r_frame_rate:format=duration",
         "-of", "json", str(video)],
        check=True, capture_output=True, text=True).stdout
    j = json.loads(out)
    st = j["streams"][0]
    num, den = st["r_frame_rate"].split("/")
    fps = float(num) / float(den) if float(den) else 0.0
    return float(j["format"]["duration"]), f"{st['width']}x{st['height']}", round(fps, 3)


def _analizar(video_path, intervalo_segundos, inicio_segundos, fin_segundos, idioma):
    if (video_path, intervalo_segundos, inicio_segundos, fin_segundos, idioma) != (
            VIDEO_REL, INTERVALO, 0, 0, "auto"):
        raise ValueError(
            "Parámetros fijos: video_path=datos/videos/prueba.mp4, intervalo_segundos=2, "
            "inicio_segundos=0, fin_segundos=0, idioma=auto")

    # 1. Verificar el video
    video = RAIZ / VIDEO_REL
    if not video.is_file():
        raise FileNotFoundError("Falta datos/videos/prueba.mp4")

    duracion, resolucion, fps = _ffprobe(video)

    # 2. Cuadros cada 2 s desde el segundo 0, JPG 720 px de ancho, nombre = segundo
    dir_cuadros = RAIZ / DIR_CUADROS_REL
    dir_cuadros.mkdir(parents=True, exist_ok=True)
    for viejo in list(dir_cuadros.glob("cuadro_*.jpg")) + list(dir_cuadros.glob("tmp_*.jpg")):
        viejo.unlink()
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-i", str(video),
         "-vf", f"fps=1/{INTERVALO}:start_time=0,scale=720:-2",
         "-start_number", "0", "-q:v", "3", str(dir_cuadros / "tmp_%05d.jpg")],
        check=True)
    cuadros = []
    for tmp in sorted(dir_cuadros.glob("tmp_*.jpg")):
        segundo = int(tmp.stem.split("_")[1]) * INTERVALO
        destino = dir_cuadros / f"cuadro_{segundo:05d}.jpg"
        tmp.rename(destino)
        cuadros.append({"tiempo_segundos": segundo, "tiempo_hhmmss": _hhmmss(segundo),
                        "archivo": f"{DIR_CUADROS_REL}/{destino.name}"})
    cuadros.sort(key=lambda c: c["tiempo_segundos"])

    # 3. Audio WAV mono 16000 Hz
    audio = RAIZ / AUDIO_REL
    audio.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-i", str(video), "-vn", "-ac", "1", "-ar", "16000", str(audio)],
        check=True)

    # 4. Transcripción local con faster-whisper (modelo small), sin API
    from faster_whisper import WhisperModel
    modelo = WhisperModel("small", device="cpu", compute_type="int8")
    segmentos, _info = modelo.transcribe(str(audio), language=None)
    transcripcion = [{"inicio": round(s.start, 2), "fin": round(s.end, 2), "texto": s.text.strip()}
                     for s in segmentos]
    transcripcion.sort(key=lambda t: t["inicio"])

    # 5. JSON único (solo rutas de imágenes)
    return {
        "duracion_segundos": round(duracion, 3),
        "resolucion": resolucion,
        "fps_original": fps,
        "cuadros": cuadros,
        "transcripcion": transcripcion,
    }


@mcp.tool
def analizar_video_nube(
    video_path: str = "datos/videos/prueba.mp4",
    intervalo_segundos: int = 2,
    inicio_segundos: int = 0,
    fin_segundos: int = 0,
    idioma: str = "auto",
) -> dict:
    """Analiza datos/videos/prueba.mp4: cuadros cada 2 s (rutas JPG) + transcripción local. fin_segundos=0 = hasta el final."""
    return _analizar(video_path, intervalo_segundos, inicio_segundos, fin_segundos, idioma)


if __name__ == "__main__":
    mcp.run()
