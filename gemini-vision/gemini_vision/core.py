"""Núcleo de gemini-vision: solo librería estándar.

Diseñado contra los errores 503 (saturado) y 429 (cuota/ritmo) de Gemini:
  - streaming (streamGenerateContent) para que una petición larga no muera por timeout
  - reintentos con espera exponencial + jitter, respetando Retry-After / retryDelay
  - cadena de modelos: si uno está saturado, pasa al siguiente
  - varias rondas sobre toda la cadena antes de rendirse
  - archivos grandes por la Files API (subida reanudable por trozos) con caché 48 h
"""
import base64, hashlib, http.client, json, mimetypes, os, random, re, shutil, socket, subprocess
import sys, tempfile, time, urllib.error, urllib.parse, urllib.request

# Modelos por defecto (los mismos que usa video-analyzer). Sobrescribir con GEMINI_MODELS="a,b,c".
# Si alguno ya no existe, la API responde 404 y se salta solo. Comprobar con:  python -m gemini_vision doctor
DEFAULT_MODELS = ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite"]
TRANSIENT = {429, 500, 502, 503, 504}
RES = {"low": "MEDIA_RESOLUTION_LOW", "medium": "MEDIA_RESOLUTION_MEDIUM", "high": "MEDIA_RESOLUTION_HIGH"}


class GeminiError(Exception):
    def __init__(self, msg, status=None, transient=False, retry_after=None, daily=False):
        super().__init__(msg)
        self.status, self.transient, self.retry_after, self.daily = status, transient, retry_after, daily


def log(*a):
    if os.environ.get("GEMINI_QUIET") != "1":
        print("[gemini]", *a, file=sys.stderr, flush=True)


def base():
    return os.environ.get("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com").rstrip("/")


def api_key():
    k = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not k:
        raise GeminiError("Falta GEMINI_API_KEY (variable de entorno). Créala en https://aistudio.google.com/apikey")
    return k


def default_models():
    env = os.environ.get("GEMINI_MODELS", "").strip()
    return [m.strip() for m in env.split(",") if m.strip()] if env else list(DEFAULT_MODELS)


def _num(name, default):
    try:
        return float(os.environ.get(name, default))
    except ValueError:
        return float(default)


def _wait(attempt, retry_after=None):
    d = retry_after if retry_after else _num("GEMINI_BACKOFF_BASE", 2) * (2 ** attempt)
    d = min(d, 90) + random.uniform(0, 0.25 * d)
    time.sleep(d)
    return d


def _err_from(status, headers, body):
    msg, retry, daily = body[:500], None, False
    try:
        j = json.loads(body)
        e = j.get("error", j) if isinstance(j, dict) else {}
        msg = e.get("message", msg)
        for d in e.get("details", []) or []:
            m = re.match(r"([\d.]+)s", str(d.get("retryDelay", "")))
            if m:
                retry = float(m.group(1))
        daily = bool(re.search(r"per ?day|PerDay", json.dumps(e)))
    except Exception:
        pass
    ra = headers.get("Retry-After") if headers else None
    if ra and ra.replace(".", "").isdigit():
        retry = float(ra)
    return GeminiError(f"HTTP {status}: {msg}", status, status in TRANSIENT and not daily, retry, daily)


def _open(method, url, headers=None, body=None, timeout=300):
    h = {"x-goog-api-key": api_key()}
    h.update(headers or {})
    req = urllib.request.Request(url, data=body, method=method, headers=h)
    try:
        return urllib.request.urlopen(req, timeout=timeout)
    except urllib.error.HTTPError as e:
        raise _err_from(e.code, e.headers, e.read().decode("utf-8", "replace"))
    except (urllib.error.URLError, socket.timeout, ConnectionError, http.client.HTTPException, OSError) as e:
        raise GeminiError(f"Red: {e}", None, True)


def _json(method, url, payload=None, headers=None, timeout=120):
    h = {"Content-Type": "application/json", **(headers or {})}
    with _open(method, url, h, json.dumps(payload).encode() if payload is not None else None, timeout) as r:
        return json.loads(r.read() or b"{}")


# ---------------------------------------------------------------- generación

def _stream_once(model, body):
    url = f"{base()}/v1beta/models/{model}:streamGenerateContent?alt=sse"
    text, finish, block = [], None, None
    try:
        with _open("POST", url, {"Content-Type": "application/json"}, json.dumps(body).encode(), _num("GEMINI_READ_TIMEOUT", 300)) as r:
            for raw in r:
                line = raw.decode("utf-8", "replace").strip()
                if not line.startswith("data:"):
                    continue
                chunk = json.loads(line[5:])
                if "error" in chunk:
                    e = chunk["error"]
                    raise GeminiError(f"HTTP {e.get('code')}: {e.get('message')}", e.get("code"), e.get("code") in TRANSIENT)
                block = (chunk.get("promptFeedback") or {}).get("blockReason") or block
                for c in chunk.get("candidates", []):
                    finish = c.get("finishReason") or finish
                    for p in (c.get("content") or {}).get("parts", []):
                        if p.get("text") and not p.get("thought"):
                            text.append(p["text"])
    except (socket.timeout, ConnectionError, http.client.HTTPException, OSError, json.JSONDecodeError) as e:
        raise GeminiError(f"Stream cortado: {e}", None, True)
    out = "".join(text).strip()
    if not out:
        if block or finish in ("SAFETY", "PROHIBITED_CONTENT", "RECITATION", "BLOCKLIST"):
            raise GeminiError(f"Gemini bloqueó la respuesta ({block or finish}).")
        raise GeminiError(f"Respuesta vacía (finishReason={finish}).", None, True)
    return out


def generate(parts, prompt, *, models=None, system=None, resolution=None, search=False, json_mode=False):
    """Devuelve (texto, modelo_usado). Reintenta/cambia de modelo ante 429/5xx."""
    chain = models or default_models()
    body = {"contents": [{"role": "user", "parts": list(parts) + [{"text": prompt}]}]}
    if system:
        body["systemInstruction"] = {"parts": [{"text": system}]}
    gc = {}
    if resolution:
        gc["mediaResolution"] = RES[resolution]
    if json_mode:
        gc["responseMimeType"] = "application/json"
    if gc:
        body["generationConfig"] = gc
    if search:
        body["tools"] = [{"googleSearch": {}}]
    attempts, sweeps = int(_num("GEMINI_ATTEMPTS", 3)), int(_num("GEMINI_SWEEPS", 2))
    errors = []
    for sweep in range(sweeps):
        for m in chain:
            for a in range(attempts):
                try:
                    return _stream_once(m, body), m
                except GeminiError as e:
                    errors.append(f"{m} (ronda {sweep + 1}, intento {a + 1}): {e}")
                    log(errors[-1])
                    if e.status == 404 or e.daily:
                        break                      # modelo inexistente o cuota diaria: siguiente modelo
                    if not e.transient:
                        raise
                    if a + 1 < attempts:
                        _wait(a, e.retry_after)
                    else:
                        break                      # se agotaron los intentos de este modelo
        if sweep + 1 < sweeps:
            d = _num("GEMINI_SWEEP_PAUSE", 15)
            log(f"Todos los modelos saturados; pausa {d:.0f}s y nueva ronda")
            time.sleep(d)
    raise GeminiError("Todos los modelos fallaron:\n  " + "\n  ".join(errors[-8:]), transient=True)


# ---------------------------------------------------------------- archivos

def _cache_path():
    d = os.environ.get("GEMINI_CACHE_DIR") or os.path.join(os.path.expanduser("~"), ".cache", "gemini-vision")
    os.makedirs(d, exist_ok=True)
    return os.path.join(d, "uploads.json")


def _cache_load():
    try:
        return json.load(open(_cache_path()))
    except Exception:
        return {}


def _wait_active(name):
    limit, t0 = _num("GEMINI_PROCESS_TIMEOUT", 900), time.time()
    while True:
        f = _json("GET", f"{base()}/v1beta/{name}")
        st = f.get("state", "ACTIVE")
        if st == "ACTIVE":
            return f
        if st == "FAILED":
            raise GeminiError(f"Gemini no pudo procesar el archivo: {f.get('error')}")
        if time.time() - t0 > limit:
            raise GeminiError("Tiempo agotado esperando que Gemini procese el archivo.", transient=True)
        time.sleep(3)


def upload_file(path, mime=None):
    """Sube por la Files API (reanudable, por trozos). Reutiliza subidas de las últimas 47 h."""
    size, mtime = os.path.getsize(path), int(os.path.getmtime(path))
    if size == 0:
        raise GeminiError(f"Archivo vacío: {path}")
    key = hashlib.sha256(f"{os.path.abspath(path)}|{size}|{mtime}".encode()).hexdigest()
    cache = _cache_load()
    hit = cache.get(key)
    if hit and hit["t"] > time.time() - 47 * 3600:
        try:
            f = _json("GET", f"{base()}/v1beta/{hit['name']}")
            if f.get("state") == "ACTIVE":
                log(f"Reutilizo subida previa ({hit['name']})")
                return f
        except GeminiError:
            pass
    mime = mime or mimetypes.guess_type(path)[0] or "application/octet-stream"
    log(f"Subiendo {os.path.basename(path)} ({size / 1e6:.1f} MB)")
    start_h = {"Content-Type": "application/json", "X-Goog-Upload-Protocol": "resumable", "X-Goog-Upload-Command": "start",
               "X-Goog-Upload-Header-Content-Length": str(size), "X-Goog-Upload-Header-Content-Type": mime}
    sess = None
    for a in range(4):
        try:
            with _open("POST", f"{base()}/upload/v1beta/files", start_h, json.dumps({"file": {"display_name": os.path.basename(path)[:80]}}).encode()) as r:
                sess = r.headers.get("x-goog-upload-url")
            break
        except GeminiError as e:
            if not e.transient or a == 3:
                raise
            _wait(a, e.retry_after)
    if not sess:
        raise GeminiError("La Files API no devolvió URL de subida.")
    chunk, off, info = int(_num("GEMINI_CHUNK_MB", 32)) * 1024 * 1024, 0, None
    with open(path, "rb") as fh:
        while off < size:
            fh.seek(off)
            data = fh.read(chunk)
            last = off + len(data) >= size
            h = {"Content-Length": str(len(data)), "X-Goog-Upload-Offset": str(off),
                 "X-Goog-Upload-Command": "upload, finalize" if last else "upload"}
            for a in range(4):
                try:
                    with _open("POST", sess, h, data, 600) as r:
                        resp = r.read()
                    break
                except GeminiError as e:
                    if not e.transient or a == 3:
                        raise
                    _wait(a, e.retry_after)
            if last:
                info = json.loads(resp)["file"]
            off += len(data)
            if not last:
                log(f"  {off / size:.0%}")
    f = _wait_active(info["name"]) if info.get("state") != "ACTIVE" else info
    cache[key] = {"name": f["name"], "t": time.time()}
    json.dump(cache, open(_cache_path(), "w"))
    return f


# ---------------------------------------------------------------- entradas

def is_youtube(s):
    return bool(re.match(r"https?://((www|m)\.)?(youtube\.com|youtu\.be)/", s))


def is_url(s):
    return bool(re.match(r"https?://", s))


def _secs(v):
    """30, '90', '1:30', '0:01:30' -> segundos."""
    if v is None or v == "":
        return None
    parts = [float(x) for x in str(v).split(":")]
    t = 0.0
    for p in parts:
        t = t * 60 + p
    return t


def _download(url, workdir):
    if shutil.which("yt-dlp"):
        log("Descargando con yt-dlp")
        out = os.path.join(workdir, "dl.%(ext)s")
        subprocess.run(["yt-dlp", "-q", "-f", "mp4/best[height<=720]/best", "--max-filesize", "4G", "-o", out, url], check=True)
        return os.path.join(workdir, [f for f in os.listdir(workdir) if f.startswith("dl.")][0])
    log("Descargando directo")
    dest = os.path.join(workdir, "dl" + (os.path.splitext(urllib.parse.urlparse(url).path)[1] or ".bin"))
    with urllib.request.urlopen(url, timeout=120) as r, open(dest, "wb") as f:
        shutil.copyfileobj(r, f)
    return dest


def _shrink(path, workdir):
    out = os.path.join(workdir, "small.mp4")
    log("Archivo muy grande: reduzco a 480p / 5 fps con ffmpeg (Gemini muestrea ~1 fps)")
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", path, "-vf", "scale=-2:'min(480,ih)'", "-r", "5", "-c:v", "libx264",
                    "-crf", "30", "-preset", "veryfast", "-c:a", "aac", "-b:a", "64k", out], check=True)
    return out


def video_part(src, start=None, end=None, fps=None, compress=False, workdir=None):
    meta = {}
    if _secs(start) is not None:
        meta["startOffset"] = f"{_secs(start):g}s"
    if _secs(end) is not None:
        meta["endOffset"] = f"{_secs(end):g}s"
    if fps:
        meta["fps"] = float(fps)
    if is_youtube(src):
        part = {"fileData": {"fileUri": src}}
    else:
        path = _download(src, workdir) if is_url(src) else src
        if not os.path.isfile(path):
            raise GeminiError(f"No existe el archivo: {path}")
        if compress or os.path.getsize(path) > _num("GEMINI_MAX_UPLOAD_MB", 1900) * 1e6:
            path = _shrink(path, workdir)
        f = upload_file(path, mimetypes.guess_type(path)[0] or "video/mp4")
        part = {"fileData": {"fileUri": f["uri"], "mimeType": f["mimeType"]}}
    if meta:
        part["videoMetadata"] = meta
    return part


def _media_part(src, workdir, kind):
    path = _download(src, workdir) if is_url(src) else src
    if not os.path.isfile(path):
        raise GeminiError(f"No existe el archivo: {path}")
    mime = mimetypes.guess_type(path)[0] or ("image/jpeg" if kind == "image" else "audio/mpeg")
    if os.path.getsize(path) <= 15 * 1024 * 1024 and kind == "image":
        return {"inlineData": {"mimeType": mime, "data": base64.b64encode(open(path, "rb").read()).decode()}}
    f = upload_file(path, mime)
    return {"fileData": {"fileUri": f["uri"], "mimeType": f["mimeType"]}}


# ---------------------------------------------------------------- API pública (mismos nombres que el conector viejo)

DEF_VIDEO = ("Describe el video con detalle y con marcas de tiempo [mm:ss]: escenas y cambios de plano, acciones, texto en pantalla, "
             "lo que se dice (transcríbelo), música/sonido y ritmo de edición.")
DEF_IMAGE = "Describe la imagen con detalle: contenido, composición, colores, texto visible y estilo."
DEF_AUDIO = "Transcribe el audio completo con marcas de tiempo [mm:ss] e indica quién habla si hay varias voces. Añade un resumen breve."


def see_video(src, prompt=None, *, start=None, end=None, fps=None, resolution=None, compress=False, models=None):
    with tempfile.TemporaryDirectory() as wd:
        part = video_part(src, start, end, fps, compress, wd)
        return generate([part], prompt or DEF_VIDEO, models=models, resolution=resolution)


def see_image(srcs, prompt=None, *, models=None):
    srcs = [srcs] if isinstance(srcs, str) else srcs
    with tempfile.TemporaryDirectory() as wd:
        return generate([_media_part(s, wd, "image") for s in srcs], prompt or DEF_IMAGE, models=models)


def hear_audio(src, prompt=None, *, models=None):
    with tempfile.TemporaryDirectory() as wd:
        return generate([_media_part(src, wd, "audio")], prompt or DEF_AUDIO, models=models)


def ask(prompt, *, system=None, search=False, models=None):
    return generate([], prompt, models=models, system=system, search=search)
