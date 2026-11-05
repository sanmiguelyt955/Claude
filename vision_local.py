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
import os
import re
import shutil
import subprocess
import urllib.error
import urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parent
SALIDA = RAIZ / "datos" / "vision"
FORMATOS = {".mp4", ".mpeg", ".mov", ".avi", ".flv", ".mpg", ".webm", ".wmv", ".3gp", ".3gpp", ".m4v"}
TOKENS_CUADRO = {"low": 66, "default": 258}          # documentación de Google
TOKENS_AUDIO_SEG = 32                                 # documentación de Google
ANCHO = {"low": 384, "default": 768}                  # DECISIÓN: Google no publica píxeles
FPS_MAX = 24.0                                        # DECISIÓN: Google no publica un máximo
MAX_CUADROS = 480                                     # DECISIÓN: con hojas de contacto y páginas ya no se corta nada


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


SUBIDAS = RAIZ / "datos" / "subidas"
DESCARGAS = RAIZ / "datos" / "descargas"
MAX_DESCARGA_MB = float(os.environ.get("MAX_DESCARGA_MB", 2000))


def _id_drive(url):
    """ID de archivo de un enlace de Google Drive (/file/d/<id>/..., ?id=<id>), o None."""
    if not re.match(r"https?://(drive|docs)\.google\.com/|https?://drive\.usercontent\.google\.com/", url):
        return None
    m = re.search(r"/file/d/([A-Za-z0-9_-]{10,})", url) or re.search(r"[?&]id=([A-Za-z0-9_-]{10,})", url)
    return m.group(1) if m else None


def _es_media(f):
    """True si ffprobe encuentra una pista de video o audio (evita guardar una página HTML como si fuera un .mp4)."""
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_type", "-of", "csv=p=0", str(f)],
                       capture_output=True, text=True)
    return r.returncode == 0 and any(t in r.stdout for t in ("video", "audio"))


def resolver(entrada):
    """Ruta local | 'subida:<id>' (archivo subido a /subir) | URL http(s) (directa o YouTube/TikTok/Instagram
    vía yt-dlp). Devuelve un Path local; las descargas se guardan en caché en datos/descargas/."""
    entrada = str(entrada).strip()
    if entrada.startswith("subida:"):
        ident = re.sub(r"[^A-Za-z0-9._-]", "", entrada[7:])
        hits = sorted(SUBIDAS.glob(ident + "*"))
        if not hits:
            raise ErrorVision(f"No existe la subida {ident}")
        return hits[0]
    if re.match(r"https?://", entrada):
        DESCARGAS.mkdir(parents=True, exist_ok=True)
        clave = hashlib.sha1(entrada.encode()).hexdigest()[:16]
        hechos = [f for f in DESCARGAS.glob(clave + ".*") if not f.name.endswith(".part")]
        if hechos:
            return hechos[0]
        directo = re.search(r"\.(mp4|mov|webm|mkv|avi|m4v|mp3|wav|m4a|aac|ogg|flac|opus)(\?|$)", entrada, re.I)
        drive = _id_drive(entrada)
        if drive:   # Google Drive compartido "cualquier persona con el enlace": descarga directa oficial
            entrada = f"https://drive.usercontent.google.com/download?id={drive}&export=download&confirm=t"
            directo = True
        ytdlp = shutil.which("yt-dlp")
        if not directo and not ytdlp:
            raise ErrorVision("Para enlaces de páginas (YouTube, TikTok, Instagram...) hace falta yt-dlp: "
                              "pip install 'yt-dlp[default]'. Con un enlace directo al .mp4 no hace falta.")
        if not directo:
            cmd = [ytdlp, "-q", "--no-playlist", "-f", "b[height<=720]/bv*[height<=720]+ba/b",
                   "--merge-output-format", "mp4", "--max-filesize", f"{int(MAX_DESCARGA_MB)}M",
                   "-o", str(DESCARGAS / f"{clave}.%(ext)s")]
            if os.environ.get("SSL_CERT_FILE"):     # proxy con CA propia: que yt-dlp use la del sistema, no certifi
                cmd += ["--compat-options", "no-certifi"]
            cookies = os.environ.get("YTDLP_COOKIES", "").strip()   # opcional: cookies Netscape (secreto del Space)
            if cookies:
                fc = DESCARGAS / ".cookies.txt"
                fc.write_text(cookies + "\n", encoding="utf-8")
                os.chmod(fc, 0o600)
                cmd += ["--cookies", str(fc)]
            r = subprocess.run(cmd + [entrada], capture_output=True, text=True)
            if r.returncode != 0:
                err = r.stderr.strip()
                if any(k in err for k in ("403", "Sign in", "logged-in", "cookies", "bot", "login")):
                    raise ErrorVision(
                        "La plataforma bloqueó la descarga desde este servidor (pide iniciar sesión o confirmar que no "
                        "es un bot; YouTube y Vimeo lo hacen con casi todos los servidores en la nube). Opciones: "
                        "1) adjunta el video en el chat (o súbelo a /subir) y usa esa ruta; 2) usa un enlace directo al "
                        "archivo .mp4; 3) en el servidor propio, pon tus cookies de la plataforma en YTDLP_COOKIES. "
                        f"Detalle: {err[-200:]}")
                raise ErrorVision(f"No se pudo descargar con yt-dlp: {err[-300:]}")
        else:
            ext = (directo.group(1).lower() if hasattr(directo, "group") else "mp4")
            destino = DESCARGAS / f"{clave}.{ext}"
            req = urllib.request.Request(entrada, headers={"User-Agent": "Mozilla/5.0 (ver-video)"})
            try:
                with urllib.request.urlopen(req, timeout=120) as r, open(str(destino) + ".part", "wb") as f:
                    total = 0
                    while True:
                        b = r.read(1 << 20)
                        if not b:
                            break
                        total += len(b)
                        if total > MAX_DESCARGA_MB * 1e6:
                            raise ErrorVision(f"El archivo supera {MAX_DESCARGA_MB:g} MB")
                        f.write(b)
            except urllib.error.URLError as e:
                pista = (" Si es de Google Drive, revisa que esté compartido como «Cualquier persona con el enlace»."
                         if drive else "")
                raise ErrorVision(f"No se pudo descargar {entrada}: {e}.{pista}")
            Path(str(destino) + ".part").replace(destino)
        hechos = [f for f in DESCARGAS.glob(clave + ".*") if not f.name.endswith(".part")]
        if not hechos:
            raise ErrorVision("La descarga no produjo ningún archivo")
        if not _es_media(hechos[0]):
            hechos[0].unlink()
            if "google.com" in entrada:
                raise ErrorVision("Google Drive no entregó el archivo: compártelo como «Cualquier persona con el enlace» "
                                  "(Compartir → Acceso general) y vuelve a pasar el enlace, o adjunta el video.")
            raise ErrorVision("El enlace no lleva a un video o audio (devolvió una página web). Usa el enlace directo "
                              "al archivo, o súbelo/adjúntalo.")
        return hechos[0]
    p = Path(entrada)
    return p if p.is_absolute() else RAIZ / p


def _ruta(video_path):
    p = resolver(video_path)
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
    cache = carpeta / f"transcripcion_v3_{idioma}.json"
    if cache.is_file():
        return json.loads(cache.read_text(encoding="utf-8"))
    if not meta["tiene_audio"]:
        datos = {"idioma": None, "segmentos": []}
    else:
        wav = carpeta / "audio.wav"
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(p), "-vn", "-ac", "1", "-ar", "16000", str(wav)], check=True)
        from faster_whisper import WhisperModel
        modelo = WhisperModel("small", device="cpu", compute_type="int8")
        # VAD: solo transcribe donde hay voz (evita que Whisper "alucine" texto en música, ruidos o silencio)
        segs, info = modelo.transcribe(leer_wav_16k(wav), language=None if idioma == "auto" else idioma,
                                       word_timestamps=True, vad_filter=True,
                                       vad_parameters={"min_silence_duration_ms": 500})
        segs = [s for s in segs if s.no_speech_prob < 0.6 and s.avg_logprob > -1.0]
        segmentos = []
        for i, s in enumerate(segs):
            segmentos.append({
                "id": f"seg_{i:03d}", "inicio": round(s.start, 2), "fin": round(s.end, 2),
                "inicio_mmss": mmss(s.start), "texto": s.text.strip(),
                "palabras": [{"p": w.word.strip(), "t": round(w.start, 2)} for w in (s.words or [])],
            })
        datos = {"idioma": info.language, "segmentos": segmentos}
        _hablantes(p, datos)
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


def _hablantes(p, datos):
    """Quién habla (escucha_local.diarizar). Marca cada palabra y segmento con H1, H2..."""
    try:
        import escucha_local as E
    except ImportError:      # sin dependencias de escucha: se omite
        return
    turnos, n = E.diarizar(p, datos["segmentos"])
    datos["hablantes"], datos["turnos"] = n, turnos
    for s in datos["segmentos"]:
        cuenta = {}
        for w in s["palabras"]:
            t = next((x for x in turnos if x["inicio"] - 0.05 <= w["t"] <= x["fin"] + 0.05), None)
            w["h"] = t["hablante"] if t else None
            if w["h"]:
                cuenta[w["h"]] = cuenta.get(w["h"], 0) + 1
        s["hablante"] = max(cuenta, key=cuenta.get) if cuenta else None


def _voz_en(trans, a, b):
    """Palabras dichas en [a, b); con varios hablantes: 'H1: ... / H2: ...'."""
    pal = [w for s in trans["segmentos"] if s["fin"] > a and s["inicio"] < b
           for w in s["palabras"] if a <= w["t"] < b]
    if trans.get("hablantes", 1) <= 1:
        return " ".join(w["p"] for w in pal).strip()
    partes = []
    for w in pal:
        if partes and partes[-1][0] == w.get("h"):
            partes[-1][1].append(w["p"])
        else:
            partes.append((w.get("h"), [w["p"]]))
    return " / ".join(f"{h}: {' '.join(ws)}" if h else " ".join(ws) for h, ws in partes).strip()


def _estimacion(n_cuadros, segundos, media_resolution):
    return {"tokens_estimados_gemini": n_cuadros * TOKENS_CUADRO[media_resolution] + math.ceil(segundos * TOKENS_AUDIO_SEG),
            "regla": f"{TOKENS_CUADRO[media_resolution]} tokens/cuadro + {TOKENS_AUDIO_SEG} tokens/s de audio"}


# ----------------------------------------------------------------- audio no verbal (escucha_local)

def _eventos(p, meta):
    """Qué suena cada segundo (AST/AudioSet), cacheado por video."""
    f = SALIDA / _id(p) / "eventos.json"
    if f.is_file():
        return json.loads(f.read_text(encoding="utf-8"))
    if not meta["tiene_audio"]:
        ev = []
    else:
        import escucha_local as E
        ev = E.eventos(p, meta["duracion_segundos"])
    f.write_text(json.dumps(ev, ensure_ascii=False), encoding="utf-8")
    return ev


def _sonido_en(ev, a, b):
    """Sonidos en [a, b): probabilidad máxima de cada etiqueta + volumen medio."""
    sel = [e for e in ev if a - 1e-6 <= e["t"] < b - 1e-6] or [e for e in ev if e["t"] <= a < e["t"] + 1.0]
    if not sel:
        return None
    best = {}
    for e in sel:
        for etq, pr in e["sonidos"]:
            best[etq] = max(best.get(etq, 0), pr)
    tops = sorted(best.items(), key=lambda z: -z[1])[:3]
    return {"sonidos": [f"{k} {v:.2f}" for k, v in tops], "db": round(sum(e["db"] for e in sel) / len(sel), 1)}


ETIQUETAS_MUSICA = ("Music", "music", "Song", "Singing", "Beat", "Drum", "Guitar", "Piano", "Synthesizer", "Sine wave")


def _resumen_audio(p, meta, ev, trans, ini, fin):
    import escucha_local as E
    ev_r = [e for e in ev if ini - 1e-6 <= e["t"] < fin]
    tramos = [t for t in E.resumen_eventos(ev_r, minimo=1)]
    for t in tramos:
        t["inicio_mmss"], t["fin_mmss"] = mmss(t["inicio"]), mmss(t["fin"])
        if any(k in t["sonido"] for k in ETIQUETAS_MUSICA) and t["fin"] - t["inicio"] >= 3:
            m = E.musica(p, t["inicio"], min(t["fin"], fin))
            t["bpm"], t["beats"] = m["bpm"], m["beats"][:32]
    segs = [s for s in trans["segmentos"] if s["fin"] > ini and s["inicio"] < fin]
    return {
        "tramos_sonoros": tramos,
        "silencios": [{**s, "inicio_mmss": mmss(s["inicio"])} for s in E.silencios(ev_r)],
        "voz": E.prosodia(p, segs) if segs else [],
    }


def _cortes(p, ini, fin, umbral=0.3):
    """Tiempos (absolutos) de cambio de escena según ffmpeg (scene > umbral)."""
    r = subprocess.run(["ffmpeg", "-v", "info", "-ss", f"{ini:.3f}", "-to", f"{fin:.3f}", "-i", str(p), "-an",
                        "-vf", f"select='gt(scene,{umbral})',showinfo", "-f", "null", "-"],
                       capture_output=True, text=True).stderr
    import re
    return [round(ini + float(x), 3) for x in re.findall(r"pts_time:([\d.]+)", r)]


def _cuadro_en(p, t, media_resolution, carpeta):
    f = carpeta / f"cuadro_{int(round(t * 1000)):09d}ms.jpg"
    if not f.is_file():
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", f"{t:.3f}", "-i", str(p), "-frames:v", "1",
                        "-vf", f"scale='min({ANCHO[media_resolution]},iw)':-2", "-q:v", "3", str(f)], check=True)
    return f


def ver_static(video_path, fps=1.0, start_offset=0, end_offset=0, media_resolution="default",
               idioma="auto", max_cuadros=MAX_CUADROS, escuchar=True, escenas=False):
    """Una sola pasada, como Gemini: por cada paso, el cuadro, lo que se dice y lo que suena.
    escenas=True (mejora propia, no existe en Gemini): añade además un cuadro en cada corte de escena."""
    p = _ruta(video_path)
    meta = metadatos(p)
    ini, fin = _rango(meta, start_offset, end_offset)
    previstos = math.ceil((fin - ini) * fps - 1e-6)
    if previstos > max_cuadros:
        raise ErrorVision(
            f"Serían {previstos} cuadros (máximo {max_cuadros} por respuesta). Como recomienda Google para videos "
            f"largos, usa processing='agentic', o baja fps, o recorta con start_offset/end_offset.")
    trans = transcripcion(p, meta, idioma)
    lista = [(t, f, False) for t, f in cuadros(p, ini, fin, fps, media_resolution)]
    paso = 1.0 / fps
    if escenas:
        carpeta = lista[0][1].parent if lista else SALIDA / _id(p)
        hay = {round(t, 2) for t, _, _ in lista}
        extra = [t for t in _cortes(p, ini, fin) if all(abs(t - h) > 0.25 for h in hay)]
        extra = extra[:max(0, max_cuadros - len(lista))]
        lista += [(t, _cuadro_en(p, t, media_resolution, carpeta), True) for t in extra]
        lista.sort(key=lambda z: z[0])
    ev = _eventos(p, meta) if escuchar else []
    linea = []
    for i, (t, f, corte) in enumerate(lista):
        sig = lista[i + 1][0] if i + 1 < len(lista) else min(t + paso, fin)
        c = {"tiempo_segundos": t, "tiempo_mmss": mmss(t), "archivo": str(f.relative_to(RAIZ)),
             "voz": _voz_en(trans, t, max(sig, t + 1e-3))}
        if corte:
            c["corte_de_escena"] = True
        if escuchar:
            c["sonido"] = _sonido_en(ev, t, max(sig, t + 1.0))
        linea.append(c)
    resultado = {
        **meta, "processing": "static", "fps_muestreo": fps, "start_offset": ini, "end_offset": fin,
        "media_resolution": media_resolution, "idioma_detectado": trans["idioma"],
        **_estimacion(len(linea), fin - ini, media_resolution),
        "audio": _resumen_audio(p, meta, ev, trans, ini, fin) if escuchar and meta["tiene_audio"] else None,
        "linea_de_tiempo": linea,
        "transcripcion": [{k: s.get(k) for k in ("id", "inicio", "fin", "inicio_mmss", "hablante", "texto")}
                          for s in trans["segmentos"] if s["fin"] > ini and s["inicio"] < fin],
        "hablantes": trans.get("hablantes"),
        "turnos": [{**t, "inicio_mmss": mmss(t["inicio"])} for t in trans.get("turnos", []) if t["fin"] > ini and t["inicio"] < fin],
    }
    if escuchar and meta["tiene_audio"]:
        import escucha_local as E
        esp = SALIDA / _id(p) / f"espectrograma_{ini:g}-{fin:g}.png"
        if not esp.is_file():
            E.espectrograma(p, ini, fin, esp)
        resultado["espectrograma"] = str(esp.relative_to(RAIZ))
    _guardar(p, f"static_{media_resolution}_{fps:g}fps_{ini:g}-{fin:g}{'_escenas' if escenas else ''}.json", resultado)
    return resultado


def ver_agentic(video_path, idioma="auto", escuchar=True):
    """Primero lo barato: transcripción + mapa de sonidos. Los cuadros se piden después con cargar_segmento."""
    p = _ruta(video_path)
    meta = metadatos(p)
    trans = transcripcion(p, meta, idioma)
    resultado = {
        **meta, "processing": "agentic", "idioma_detectado": trans["idioma"],
        "segmentos": [{k: s.get(k) for k in ("id", "inicio", "fin", "inicio_mmss", "hablante", "texto")} for s in trans["segmentos"]],
        "hablantes": trans.get("hablantes"),
        "turnos": [{**t, "inicio_mmss": mmss(t["inicio"])} for t in trans.get("turnos", [])],
        "siguiente_paso": "Pide solo los tramos visuales que necesites con cargar_segmento(video_path, id=... "
                          "o inicio/fin, fps, media_resolution).",
    }
    if escuchar and meta["tiene_audio"]:
        import escucha_local as E
        ev = _eventos(p, meta)
        resultado["tramos_sonoros"] = [{**t, "inicio_mmss": mmss(t["inicio"])} for t in E.resumen_eventos(ev, minimo=1)]
        resultado["silencios"] = E.silencios(ev)
        resultado["cortes_de_escena"] = [{"t": t, "mmss": mmss(t)} for t in _cortes(p, 0, meta["duracion_segundos"])]
    _guardar(p, "agentic.json", resultado)
    return resultado


def cargar_segmento(video_path, id=None, inicio=None, fin=None, fps=1.0, media_resolution="default", idioma="auto",
                    escuchar=True, escenas=False):
    p = _ruta(video_path)
    if id:
        meta = metadatos(p)
        seg = next((s for s in transcripcion(p, meta, idioma)["segmentos"] if s["id"] == id), None)
        if not seg:
            raise ErrorVision(f"No existe el segmento {id}")
        inicio, fin = seg["inicio"], seg["fin"]
    return ver_static(video_path, fps=fps, start_offset=inicio or 0, end_offset=fin or 0,
                      media_resolution=media_resolution, idioma=idioma, escuchar=escuchar, escenas=escenas)


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
    ap.add_argument("--escenas", action="store_true", help="añade un cuadro en cada corte de escena")
    ap.add_argument("--sin-audio", action="store_true", help="no analizar sonidos no verbales")
    a = ap.parse_args()
    try:
        if a.segmento:
            r = cargar_segmento(a.video, id=a.segmento, fps=a.fps, media_resolution=a.res, idioma=a.idioma,
                                escuchar=not a.sin_audio, escenas=a.escenas)
        elif a.processing == "agentic":
            r = ver_agentic(a.video, a.idioma, escuchar=not a.sin_audio)
        else:
            r = ver_static(a.video, a.fps, a.start, a.end, a.res, a.idioma, escuchar=not a.sin_audio, escenas=a.escenas)
    except ErrorVision as e:
        raise SystemExit(str(e))
    print(json.dumps(r, ensure_ascii=False, indent=1))
