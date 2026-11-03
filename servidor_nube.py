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
         # primer cuadro de cada intervalo de 2 s (el filtro fps tomaría el último y perdería el final)
         "-vf", f"select='isnan(prev_t)+gt(floor(t/{INTERVALO}+1e-6)\\,floor(prev_t/{INTERVALO}+1e-6))',scale=720:-2",
         "-fps_mode", "vfr", "-start_number", "0", "-q:v", "3", str(dir_cuadros / "tmp_%05d.jpg")],
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
    from vision_local import leer_wav_16k
    segmentos, _info = modelo.transcribe(leer_wav_16k(audio), language=None)
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


# ---------------------------------------------------------------------------
# Visión estilo Gemini (clean room a partir de la documentación pública de Google).
# Ver vision_local.py para la especificación y las decisiones propias.

def _error(e):
    from fastmcp.exceptions import ToolError
    return ToolError(str(e))


def _contenido_intercalado(r):
    """Como Gemini en modo static: cada cuadro va precedido de su marca MM:SS, la voz y el sonido de ese instante."""
    from fastmcp.utilities.types import Image
    import vision_local as vl
    resumen = {k: v for k, v in r.items() if k not in ("linea_de_tiempo",)}
    partes = [json.dumps(resumen, ensure_ascii=False)]
    if r.get("espectrograma"):
        partes += [f"Espectrograma del audio ({r['start_offset']:g}-{r['end_offset']:g} s; el eje de tiempo empieza en 0):",
                   Image(path=str(vl.RAIZ / r["espectrograma"]))]
    for c in r["linea_de_tiempo"]:
        txt = f"[{c['tiempo_mmss']}]" + (" (corte de escena)" if c.get("corte_de_escena") else "")
        if c["voz"]:
            txt += f" voz: «{c['voz']}»"
        if c.get("sonido"):
            txt += f" · sonido: {', '.join(c['sonido']['sonidos'])} · {c['sonido']['db']} dB"
        partes += [txt, Image(path=str(vl.RAIZ / c["archivo"]))]
    return partes


@mcp.tool
def ver_video(
    video_path: str,
    processing: str = "static",
    fps: float = 1.0,
    start_offset: float = 0,
    end_offset: float = 0,
    media_resolution: str = "default",
    idioma: str = "auto",
    escuchar: bool = True,
    escenas: bool = False,
):
    """Ve y oye un video como Gemini, en local. processing='static': 1 FPS por defecto, cada cuadro con [MM:SS], lo que se dice y lo que suena (sonidos AudioSet + dB), resumen de audio (tramos sonoros, silencios, BPM, tono/emoción de la voz) y espectrograma. fps>1 para acción rápida; start_offset/end_offset en segundos (0 = final). escenas=True añade un cuadro en cada corte de escena. processing='agentic': transcripción + mapa de sonidos + cortes, y después cargar_segmento. media_resolution: 'low' o 'default'."""
    import vision_local as vl
    try:
        if processing == "agentic":
            return json.dumps(vl.ver_agentic(video_path, idioma, escuchar), ensure_ascii=False)
        if processing != "static":
            raise vl.ErrorVision("processing debe ser 'static' o 'agentic'")
        return _contenido_intercalado(vl.ver_static(video_path, fps, start_offset, end_offset, media_resolution,
                                                    idioma, escuchar=escuchar, escenas=escenas))
    except vl.ErrorVision as e:
        raise _error(e)


@mcp.tool
def cargar_segmento(
    video_path: str,
    id: str = "",
    inicio: float = 0,
    fin: float = 0,
    fps: float = 1.0,
    media_resolution: str = "default",
    idioma: str = "auto",
    escuchar: bool = True,
    escenas: bool = False,
):
    """Modo agentic: carga solo los cuadros (y sonido) de un tramo, por id de segmento (seg_000...) o por inicio/fin en segundos."""
    import vision_local as vl
    try:
        return _contenido_intercalado(vl.cargar_segmento(video_path, id or None, inicio, fin, fps, media_resolution,
                                                         idioma, escuchar, escenas))
    except vl.ErrorVision as e:
        raise _error(e)


FORMATOS_AUDIO = {".wav", ".mp3", ".m4a", ".aac", ".ogg", ".oga", ".flac", ".opus", ".wma", ".aiff", ".aif"}


def _ruta_media(path):
    import vision_local as vl
    p = Path(path)
    p = p if p.is_absolute() else vl.RAIZ / p
    if not p.is_file():
        raise vl.ErrorVision(f"Falta {path}")
    if p.suffix.lower() not in FORMATOS_AUDIO | vl.FORMATOS:
        raise vl.ErrorVision(f"Formato no soportado: {p.suffix}")
    return p


def _duracion(p):
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)],
                                check=True, capture_output=True, text=True).stdout)


@mcp.tool
def escuchar_audio(path: str, start_offset: float = 0, end_offset: float = 0, idioma: str = "auto"):
    """"Oye" un audio o la pista de un video, en local: transcripción con marcas MM:SS, qué suena cada segundo (AudioSet: música, perro, lluvia, aplausos, sirena...), tramos y silencios, BPM/beats de la música, tono/volumen/velocidad/emoción de la voz, y el espectrograma como imagen."""
    import escucha_local as E
    import vision_local as vl
    from fastmcp.utilities.types import Image
    try:
        p = _ruta_media(path)
        dur = _duracion(p)
        ini = max(0.0, start_offset or 0)
        fin = min(end_offset or dur, dur)
        if ini >= fin:
            raise vl.ErrorVision("Rango vacío")
        meta = {"duracion_segundos": round(dur, 3), "tiene_audio": True}
        trans = vl.transcripcion(p, meta, idioma)
        r = vl._resumen_audio(p, meta, vl._eventos(p, meta), trans, ini, fin)
        ev = [e for e in vl._eventos(p, meta) if ini - 1e-6 <= e["t"] < fin]
        esp = vl.SALIDA / vl._id(p) / f"espectrograma_{ini:g}-{fin:g}.png"
        if not esp.is_file():
            E.espectrograma(p, ini, fin, esp)
        datos = {"duracion_segundos": meta["duracion_segundos"], "start_offset": ini, "end_offset": fin,
                 "idioma_detectado": trans["idioma"],
                 "transcripcion": [{k: s[k] for k in ("id", "inicio", "fin", "inicio_mmss", "texto")}
                                   for s in trans["segmentos"] if s["fin"] > ini and s["inicio"] < fin],
                 **r,
                 "por_segundo": [f"[{vl.mmss(e['t'])}] " + ", ".join(f"{a} {b:.2f}" for a, b in e["sonidos"]) + f" · {e['db']} dB"
                                 for e in ev]}
        return [json.dumps(datos, ensure_ascii=False),
                f"Espectrograma ({ini:g}-{fin:g} s; el eje de tiempo empieza en 0):", Image(path=str(esp))]
    except vl.ErrorVision as e:
        raise _error(e)


@mcp.tool
def preguntar_audio(path: str, descripciones: list[str], start_offset: float = 0, end_offset: float = 0):
    """Pregunta libre al audio con CLAP (local): pasa varias descripciones en inglés (p. ej. ["a dog barking", "rain", "a crowd cheering"]) y devuelve la probabilidad de cada una en el tramo. Útil para confirmar sonidos concretos."""
    import escucha_local as E
    import vision_local as vl
    try:
        p = _ruta_media(path)
        if len(descripciones) < 2:
            raise vl.ErrorVision("Pasa al menos 2 descripciones para comparar")
        r = E.preguntar(p, descripciones, start_offset or 0, end_offset or None)
        return json.dumps([{"descripcion": d, "probabilidad": pr} for d, pr in r], ensure_ascii=False)
    except vl.ErrorVision as e:
        raise _error(e)


if __name__ == "__main__":
    mcp.run()
