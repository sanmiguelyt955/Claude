"""vision_local: ve un video como lo describe la documentación pública de Google para Gemini.

Reimplementación clean room, 100 % local (ffmpeg + faster-whisper), sin ninguna API en la nube.
Fuente de la especificación: https://ai.google.dev/gemini-api/docs/video-understanding (leída 2026-11-03).

Qué replica de esa documentación:
  - processing "static" (por defecto): cuadros a ritmo fijo de 1 FPS, en una sola pasada, con una
    marca de tiempo MM:SS por cuadro; el audio se procesa en paralelo (mono) y se alinea por tiempo.
  - fps personalizado (p. ej. 0.5 = 1 cuadro cada 2 s; más de 1 para acción rápida).
  - recorte con start_offset / end_offset (en segundos).
  - media_resolution: "low" (66 tokens/cuadro en Gemini) o "default" (258 tokens/cuadro);
    el audio cuenta 32 tokens/s. Se informa una estimación con esas cifras.
  - processing "agentic": primero la transcripción, y luego solo se cargan los segmentos visuales
    que se piden, identificados por id.
  - formatos: mp4, mpeg, mov, avi, flv, mpg, webm, wmv, 3gpp.
Lo que la documentación NO especifica (límites de fps, tamaño en píxeles por resolución, cómo se
intercalan exactamente audio y cuadros) son decisiones propias, marcadas con "DECISIÓN".
Todos los archivos generados se escriben dentro de datos/vision/ del repositorio.
"""
import hashlib
import json
import math
import subprocess
from pathlib import Path

RAIZ = Path(__file__).resolve().parent
SALIDA = RAIZ / "datos" / "vision"
FORMATOS = {".mp4", ".mpeg", ".mov", ".avi", ".flv", ".mpg", ".webm", ".wmv", ".3gp", ".3gpp", ".m4v"}
TOKENS_CUADRO = {"low": 66, "default": 258}          # documentación de Google
TOKENS_AUDIO_SEG = 32                                 # documentación de Google
ANCHO = {"low": 384, "default": 768}                  # DECISIÓN: Google no publica píxeles
FPS_MAX = 24.0                                        # DECISIÓN: Google no publica un máximo
MAX_CUADROS = 120                                     # DECISIÓN: límite por respuesta MCP


class ErrorVision(Exception):
    pass


def mmss(t):
    t = int(math.floor(t + 1e-6))
    h, m, s = t // 3600, t % 3600 // 60, t % 60
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m:02d}:{s:02d}"


def leer_wav_16k(ruta):
    """WAV PCM 16 bits mono 16 kHz -> float32 para faster-whisper (evita depender de PyAV)."""
    import wave
    import numpy as np
    with wave.open(str(ruta), "rb") as w:
        if w.getnchannels() != 1 or w.getframerate() != 16000 or w.getsampwidth() != 2:
            raise ValueError("Se esperaba WAV mono 16 kHz de 16 bits")
        return np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0


def _ruta(video_path):
    p = Path(video_path)
    p = p if p.is_absolute() else RAIZ / p
    if not p.is_file():
        raise ErrorVision(f"Falta {video_path}")
    if p.suffix.lower() not in FORMATOS:
        raise ErrorVision(f"Formato no soportado: {p.suffix}. Soportados: {', '.join(sorted(FORMATOS))}")
    return p


def _id(p):
    st = p.stat()
    return hashlib.sha1(f"{p.resolve()}|{st.st_size}|{int(st.st_mtime)}".encode()).hexdigest()[:12]


def metadatos(p):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries",
                          "stream=codec_type,width,height,r_frame_rate:format=duration", "-of", "json", str(p)],
                         check=True, capture_output=True, text=True).stdout
    j = json.loads(out)
    v = next((s for s in j["streams"] if s.get("codec_type") == "video"), None)
    if not v:
        raise ErrorVision("El archivo no tiene pista de video.")
    n, d = v["r_frame_rate"].split("/")
    return {
        "duracion_segundos": round(float(j["format"]["duration"]), 3),
        "resolucion": f"{v['width']}x{v['height']}",
        "fps_original": round(float(n) / float(d), 3) if float(d) else 0.0,
        "tiene_audio": any(s.get("codec_type") == "audio" for s in j["streams"]),
    }


def _rango(meta, start_offset, end_offset):
    dur = meta["duracion_segundos"]
    ini = max(0.0, float(start_offset or 0))
    fin = float(end_offset) if end_offset else dur
    fin = min(fin, dur)
    if ini >= fin:
        raise ErrorVision(f"Rango vacío: start_offset={ini} end_offset={fin} (duración {dur}s)")
    return ini, fin


def transcripcion(p, meta, idioma="auto"):
    """Audio mono 16 kHz -> faster-whisper small (local). Cacheada por video."""
    carpeta = SALIDA / _id(p)
    carpeta.mkdir(parents=True, exist_ok=True)
    cache = carpeta / f"transcripcion_{idioma}.json"
    if cache.is_file():
        return json.loads(cache.read_text(encoding="utf-8"))
    if not meta["tiene_audio"]:
        datos = {"idioma": None, "segmentos": []}
    else:
        wav = carpeta / "audio.wav"
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(p), "-vn", "-ac", "1", "-ar", "16000", str(wav)], check=True)
        from faster_whisper import WhisperModel
        modelo = WhisperModel("small", device="cpu", compute_type="int8")
        segs, info = modelo.transcribe(leer_wav_16k(wav), language=None if idioma == "auto" else idioma, word_timestamps=True)
        segmentos = []
        for i, s in enumerate(segs):
            segmentos.append({
                "id": f"seg_{i:03d}", "inicio": round(s.start, 2), "fin": round(s.end, 2),
                "inicio_mmss": mmss(s.start), "texto": s.text.strip(),
                "palabras": [{"p": w.word.strip(), "t": round(w.start, 2)} for w in (s.words or [])],
            })
        datos = {"idioma": info.language, "segmentos": segmentos}
    cache.write_text(json.dumps(datos, ensure_ascii=False, indent=1), encoding="utf-8")
    return datos


def cuadros(p, ini, fin, fps, media_resolution):
    """Cuadros a ritmo fijo `fps` entre ini y fin. Nombre = milisegundo absoluto del cuadro."""
    if not (0 < fps <= FPS_MAX):
        raise ErrorVision(f"fps debe estar entre 0 y {FPS_MAX}")
    if media_resolution not in ANCHO:
        raise ErrorVision("media_resolution debe ser 'low' o 'default'")
    n = max(1, math.ceil((fin - ini) * fps - 1e-6))
    carpeta = SALIDA / _id(p) / f"cuadros_{media_resolution}_{fps:g}fps"
    carpeta.mkdir(parents=True, exist_ok=True)
    tiempos = [round(ini + i / fps, 3) for i in range(n)]
    lista = [(t, carpeta / f"cuadro_{int(round(t * 1000)):09d}ms.jpg") for t in tiempos]
    faltan = [(t, f) for t, f in lista if not f.is_file()]
    if faltan:
        tmp = carpeta / "tmp"
        tmp.mkdir(exist_ok=True)
        for f in tmp.glob("*.jpg"):
            f.unlink()
        # DECISIÓN: cada cuadro es el primero de su intervalo [t, t + 1/fps)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", f"{ini:.3f}", "-to", f"{fin:.3f}", "-i", str(p),
                        "-vf", f"select='isnan(prev_t)+gt(floor(t*{fps}+1e-6)\\,floor(prev_t*{fps}+1e-6))',"
                               f"scale='min({ANCHO[media_resolution]},iw)':-2",
                        "-fps_mode", "vfr", "-start_number", "0", "-q:v", "3", str(tmp / "%07d.jpg")], check=True)
        hechos = sorted(tmp.glob("*.jpg"))
        for i, (t, f) in enumerate(lista):
            if i < len(hechos):
                hechos[i].replace(f)
        for f in tmp.glob("*.jpg"):
            f.unlink()
        tmp.rmdir()
    return [(t, f) for t, f in lista if f.is_file()]


def _voz_en(trans, a, b):
    """Palabras dichas en [a, b)."""
    pal = [w["p"] for s in trans["segmentos"] if s["fin"] > a and s["inicio"] < b
           for w in s["palabras"] if a <= w["t"] < b]
    return " ".join(pal).strip()


def _estimacion(n_cuadros, segundos, media_resolution):
    return {"tokens_estimados_gemini": n_cuadros * TOKENS_CUADRO[media_resolution] + math.ceil(segundos * TOKENS_AUDIO_SEG),
            "regla": f"{TOKENS_CUADRO[media_resolution]} tokens/cuadro + {TOKENS_AUDIO_SEG} tokens/s de audio"}


def ver_static(video_path, fps=1.0, start_offset=0, end_offset=0, media_resolution="default",
               idioma="auto", max_cuadros=MAX_CUADROS):
    """Una sola pasada: línea de tiempo con un cuadro por paso y lo que se dice en ese paso."""
    p = _ruta(video_path)
    meta = metadatos(p)
    ini, fin = _rango(meta, start_offset, end_offset)
    previstos = math.ceil((fin - ini) * fps - 1e-6)
    if previstos > max_cuadros:
        raise ErrorVision(
            f"Serían {previstos} cuadros (máximo {max_cuadros} por respuesta). Como recomienda Google para videos "
            f"largos, usa processing='agentic', o baja fps, o recorta con start_offset/end_offset.")
    trans = transcripcion(p, meta, idioma)
    lista = cuadros(p, ini, fin, fps, media_resolution)
    paso = 1.0 / fps
    linea = [{"tiempo_segundos": t, "tiempo_mmss": mmss(t), "archivo": str(f.relative_to(RAIZ)),
              "voz": _voz_en(trans, t, t + paso)} for t, f in lista]
    resultado = {
        **meta, "processing": "static", "fps_muestreo": fps, "start_offset": ini, "end_offset": fin,
        "media_resolution": media_resolution, "idioma_detectado": trans["idioma"],
        **_estimacion(len(linea), fin - ini, media_resolution),
        "linea_de_tiempo": linea,
        "transcripcion": [{k: s[k] for k in ("id", "inicio", "fin", "inicio_mmss", "texto")}
                          for s in trans["segmentos"] if s["fin"] > ini and s["inicio"] < fin],
    }
    _guardar(p, f"static_{media_resolution}_{fps:g}fps_{ini:g}-{fin:g}.json", resultado)
    return resultado


def ver_agentic(video_path, idioma="auto"):
    """Primero la transcripción (barata). Los cuadros se piden después con cargar_segmento."""
    p = _ruta(video_path)
    meta = metadatos(p)
    trans = transcripcion(p, meta, idioma)
    resultado = {
        **meta, "processing": "agentic", "idioma_detectado": trans["idioma"],
        "segmentos": [{k: s[k] for k in ("id", "inicio", "fin", "inicio_mmss", "texto")} for s in trans["segmentos"]],
        "siguiente_paso": "Pide solo los tramos visuales que necesites con cargar_segmento(video_path, id=... "
                          "o inicio/fin, fps, media_resolution).",
    }
    _guardar(p, "agentic.json", resultado)
    return resultado


def cargar_segmento(video_path, id=None, inicio=None, fin=None, fps=1.0, media_resolution="default", idioma="auto"):
    p = _ruta(video_path)
    if id:
        meta = metadatos(p)
        seg = next((s for s in transcripcion(p, meta, idioma)["segmentos"] if s["id"] == id), None)
        if not seg:
            raise ErrorVision(f"No existe el segmento {id}")
        inicio, fin = seg["inicio"], seg["fin"]
    return ver_static(video_path, fps=fps, start_offset=inicio or 0, end_offset=fin or 0,
                      media_resolution=media_resolution, idioma=idioma)


def _guardar(p, nombre, datos):
    f = SALIDA / _id(p) / nombre
    f.write_text(json.dumps(datos, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(description="Ver un video como Gemini (local).")
    ap.add_argument("video")
    ap.add_argument("--processing", choices=["static", "agentic"], default="static")
    ap.add_argument("--fps", type=float, default=1.0)
    ap.add_argument("--start", type=float, default=0)
    ap.add_argument("--end", type=float, default=0)
    ap.add_argument("--res", choices=list(ANCHO), default="default")
    ap.add_argument("--idioma", default="auto")
    ap.add_argument("--segmento")
    a = ap.parse_args()
    try:
        if a.segmento:
            r = cargar_segmento(a.video, id=a.segmento, fps=a.fps, media_resolution=a.res, idioma=a.idioma)
        elif a.processing == "agentic":
            r = ver_agentic(a.video, a.idioma)
        else:
            r = ver_static(a.video, a.fps, a.start, a.end, a.res, a.idioma)
    except ErrorVision as e:
        raise SystemExit(str(e))
    print(json.dumps(r, ensure_ascii=False, indent=1))
