"""Servidor MCP local para analizar un video sin APIs en la nube.

Herramienta: analizar_video_nube
  - ffmpeg extrae cuadros (JPG 720 px de ancho) y audio (WAV mono 16 kHz)
  - faster-whisper (modelo small, en local, CPU) transcribe el audio
  - devuelve un solo JSON; las imágenes NO van dentro del JSON, solo sus rutas
Solo escribe dentro de la carpeta datos/ de este repositorio.
"""
import json
import math
import os
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


# --- Empaquetado de la respuesta: que NUNCA se corten imágenes ------------------------------------------------
# Claude Code corta la salida de una herramienta MCP a MAX_MCP_OUTPUT_TOKENS (25 000 por defecto) y descarta las
# imágenes que no caben. Por eso medimos el coste de cada imagen (≈ ancho*alto/750 tokens, tras el reescalado de
# Claude a ≤1568 px de lado y ≤1,15 MP) y, si no cabe todo, juntamos los cuadros en hojas de contacto con la marca
# MM:SS dentro de cada cuadro y repartimos el resto en páginas (pagina=2, 3...).
PRESUPUESTO = int(os.environ.get("VIDEO_NUBE_PRESUPUESTO_TOKENS", "18000"))
LADO_MAX, AREA_MAX = 1568, 1_150_000


def _tokens_imagen(w, h):
    f = min(1.0, LADO_MAX / max(w, h), math.sqrt(AREA_MAX / (w * h)))
    return math.ceil((w * f) * (h * f) / 750)


def _tokens_texto(t):
    return math.ceil(len(t) / 3) + 10


def _tam(ruta):
    try:
        from PIL import Image as P
        with P.open(ruta) as im:
            return im.size
    except ImportError:
        o = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
                            "-of", "csv=p=0", str(ruta)], capture_output=True, text=True, check=True).stdout
        w, h = o.strip().split(",")[:2]
        return int(w), int(h)


def _hay_pil():
    try:
        import PIL  # noqa: F401
        return True
    except ImportError:
        return False


def _marca(c):
    """MM:SS como Gemini; con fps>1 añade las centésimas para distinguir cuadros del mismo segundo."""
    t = c["tiempo_segundos"]
    return c["tiempo_mmss"] if abs(t - round(t)) < 1e-3 else f"{c['tiempo_mmss']}.{int(round((t % 1) * 100)):02d}"


def _hoja(celdas, destino, columnas, ancho_celda):
    """Hoja de contacto: cuadros en rejilla (izq→der, arriba→abajo) con su MM:SS grabado en la esquina."""
    from PIL import Image as P, ImageDraw, ImageFont
    w0, h0 = _tam(celdas[0][0])
    alto_celda = round(h0 * ancho_celda / w0)
    filas = math.ceil(len(celdas) / columnas)
    hoja = P.new("RGB", (columnas * ancho_celda + (columnas - 1) * 4, filas * alto_celda + (filas - 1) * 4), "black")
    tam_letra = max(18, ancho_celda // 9)
    try:
        letra = ImageFont.load_default(size=tam_letra)
    except TypeError:
        letra = ImageFont.load_default()
    for i, (ruta, etiqueta) in enumerate(celdas):
        with P.open(ruta) as im:
            c = im.convert("RGB").resize((ancho_celda, alto_celda), P.LANCZOS)
        d = ImageDraw.Draw(c)
        x0, y0, x1, y1 = d.textbbox((0, 0), etiqueta, font=letra)
        d.rectangle((0, 0, x1 - x0 + 12, y1 - y0 + 12), fill="black")
        d.text((6 - x0, 6 - y0), etiqueta, fill="yellow", font=letra)
        hoja.paste(c, ((i % columnas) * (ancho_celda + 4), (i // columnas) * (alto_celda + 4)))
    hoja.save(destino, quality=88)
    return destino


def _rejilla(w, h):
    """Columnas, filas y ancho de celda para que la hoja quepa en 1568 px sin reescalar (vertical 4x2, horizontal 3x3)."""
    if h > w * 1.2:
        return 4, 2, 388
    if w > h * 1.2:
        return 3, 3, 520
    return 3, 3, 440


def _linea(c):
    txt = f"[{_marca(c)}]" + (" (corte de escena)" if c.get("corte_de_escena") else "")
    if c["voz"]:
        txt += f" voz: «{c['voz']}»"
    if c.get("sonido"):
        txt += f" · sonido: {', '.join(c['sonido']['sonidos'])} · {c['sonido']['db']} dB"
    return txt


def _contenido_intercalado(r, formato="auto", pagina=1, presupuesto=None):
    """Como Gemini en modo static: cada cuadro con su marca MM:SS, la voz y el sonido de ese instante.
    formato='cuadros' (uno a uno), 'hojas' (hojas de contacto) o 'auto' (cuadros si caben; si no, hojas).
    Lo que no cabe en el presupuesto de tokens pasa a la página siguiente, nunca se corta."""
    from fastmcp.utilities.types import Image
    import vision_local as vl
    presupuesto = presupuesto or PRESUPUESTO
    linea = r["linea_de_tiempo"]
    resumen = {k: v for k, v in r.items() if k != "linea_de_tiempo"}
    cabecera = json.dumps(resumen, ensure_ascii=False)
    fijos = [cabecera]
    coste_fijo = _tokens_texto(cabecera)
    if r.get("espectrograma"):
        esp = vl.RAIZ / r["espectrograma"]
        t = f"Espectrograma del audio ({r['start_offset']:g}-{r['end_offset']:g} s; el eje de tiempo empieza en 0):"
        fijos += [t, Image(path=str(esp))]
        coste_fijo += _tokens_texto(t) + _tokens_imagen(*_tam(esp))
    if formato not in ("auto", "cuadros", "hojas"):
        raise vl.ErrorVision("formato debe ser 'auto', 'cuadros' o 'hojas'")

    # Bloques: (texto, ruta_imagen, coste). Un bloque es un cuadro suelto o una hoja de contacto.
    bloques = []
    if linea:
        w, h = _tam(vl.RAIZ / linea[0]["archivo"])
        sueltos = [(_linea(c), vl.RAIZ / c["archivo"], _tokens_texto(_linea(c)) + _tokens_imagen(w, h)) for c in linea]
        if formato == "cuadros" or not _hay_pil() or (formato == "auto" and coste_fijo + sum(b[2] for b in sueltos) <= presupuesto):
            bloques = sueltos
        else:
            cols, filas, ancho = _rejilla(w, h)
            n = cols * filas
            carpeta = (vl.RAIZ / linea[0]["archivo"]).parent / "hojas"
            carpeta.mkdir(exist_ok=True)
            for k in range(0, len(linea), n):
                grupo = linea[k:k + n]
                destino = carpeta / f"hoja_v2_{grupo[0]['tiempo_segundos']:.3f}-{grupo[-1]['tiempo_segundos']:.3f}_{cols}x{filas}.jpg"
                if not destino.is_file():
                    _hoja([(vl.RAIZ / c["archivo"], _marca(c)) for c in grupo], destino, cols, ancho)
                txt = (f"Hoja de contacto {k // n + 1} ({_marca(grupo[0])}–{_marca(grupo[-1])}; "
                       f"{len(grupo)} cuadros en orden izquierda→derecha, arriba→abajo; cada uno lleva su MM:SS en la "
                       f"esquina):\n" + "\n".join(_linea(c) for c in grupo))
                bloques.append((txt, destino, _tokens_texto(txt) + _tokens_imagen(*_tam(destino))))

    # Reparto en páginas: la 1 lleva el resumen y el espectrograma; cada página cabe en el presupuesto.
    paginas, actual, coste = [], [], coste_fijo
    for b in bloques:
        if actual and coste + b[2] > presupuesto:
            paginas.append(actual)
            actual, coste = [], 300
        actual.append(b)
        coste += b[2]
    paginas.append(actual)
    total = len(paginas)
    if not 1 <= pagina <= total:
        raise vl.ErrorVision(f"pagina debe estar entre 1 y {total}")
    partes = list(fijos) if pagina == 1 else [
        f"Página {pagina} de {total} (mismo video y parámetros; el resumen y el espectrograma están en la página 1)."]
    for txt, ruta, _ in paginas[pagina - 1]:
        partes += [txt, Image(path=str(ruta))]
    if pagina < total:
        quedan = sum(len(p) for p in paginas[pagina:])
        partes.append(f"CONTINÚA: faltan {total - pagina} página(s) ({quedan} bloque(s) de cuadros). Vuelve a llamar con "
                      f"los mismos parámetros y pagina={pagina + 1} antes de responder sobre ese tramo.")
    elif total > 1:
        partes.append(f"Fin: esta es la última página ({total} de {total}).")
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
    formato: str = "auto",
    pagina: int = 1,
):
    """Ve y oye un video como Gemini, en local. processing='static': 1 FPS por defecto, cada cuadro con [MM:SS], lo que se dice y lo que suena (sonidos AudioSet + dB), resumen de audio (tramos sonoros, silencios, BPM, tono/emoción de la voz) y espectrograma. fps>1 para acción rápida; start_offset/end_offset en segundos (0 = final). escenas=True añade un cuadro en cada corte de escena. Las imágenes nunca se cortan: formato='auto' manda los cuadros uno a uno si caben y, si no, hojas de contacto (rejillas con el MM:SS grabado en cada cuadro); formato='cuadros' u 'hojas' lo fuerza. Si la respuesta termina con 'CONTINÚA', pide pagina=2, 3... con los mismos parámetros. processing='agentic': transcripción + mapa de sonidos + cortes, y después cargar_segmento. media_resolution: 'low' o 'default'."""
    import vision_local as vl
    try:
        if processing == "agentic":
            return json.dumps(vl.ver_agentic(video_path, idioma, escuchar), ensure_ascii=False)
        if processing != "static":
            raise vl.ErrorVision("processing debe ser 'static' o 'agentic'")
        return _contenido_intercalado(vl.ver_static(video_path, fps, start_offset, end_offset, media_resolution,
                                                    idioma, escuchar=escuchar, escenas=escenas), formato, pagina)
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
    formato: str = "auto",
    pagina: int = 1,
):
    """Modo agentic: carga solo los cuadros (y sonido) de un tramo, por id de segmento (seg_000...) o por inicio/fin en segundos. formato y pagina funcionan igual que en ver_video (si termina con 'CONTINÚA', pide la página siguiente)."""
    import vision_local as vl
    try:
        return _contenido_intercalado(vl.cargar_segmento(video_path, id or None, inicio, fin, fps, media_resolution,
                                                         idioma, escuchar, escenas), formato, pagina)
    except vl.ErrorVision as e:
        raise _error(e)


FORMATOS_AUDIO = {".wav", ".mp3", ".m4a", ".aac", ".ogg", ".oga", ".flac", ".opus", ".wma", ".aiff", ".aif"}


def _ruta_media(path):
    import vision_local as vl
    p = vl.resolver(path)
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
                 "transcripcion": [{k: s.get(k) for k in ("id", "inicio", "fin", "inicio_mmss", "hablante", "texto")}
                                   for s in trans["segmentos"] if s["fin"] > ini and s["inicio"] < fin],
                 "hablantes": trans.get("hablantes"),
                 "turnos": [{**t, "inicio_mmss": vl.mmss(t["inicio"])} for t in trans.get("turnos", [])
                            if t["fin"] > ini and t["inicio"] < fin],
                 **r,
                 "por_segundo": [f"[{vl.mmss(e['t'])}] " + ", ".join(f"{a} {b:.2f}" for a, b in e["sonidos"]) + f" · {e['db']} dB"
                                 for e in ev]}
        return [json.dumps(datos, ensure_ascii=False),
                f"Espectrograma ({ini:g}-{fin:g} s; el eje de tiempo empieza en 0):", Image(path=str(esp))]
    except vl.ErrorVision as e:
        raise _error(e)


SISTEMA_OIDO = ("Eres los oídos (y, si recibes imágenes, los ojos) de otro asistente. Responde SOLO sobre lo que "
                "realmente oyes en el audio y ves en las imágenes recibidas. Si no recibes imágenes, no describas nada "
                "visual. Si algo no se distingue con claridad, dilo. Sé concreto y breve.")


@mcp.tool
def oir(path: str, pregunta: str, start_offset: float = 0, end_offset: float = 0, con_cuadros: bool = False,
        fps: float = 0.5, idioma_respuesta: str = "español"):
    """Oídos de verdad: un modelo multimodal abierto (Gemma 4 E2B, en el servidor, sin APIs) ESCUCHA la señal de audio original del tramo y responde a tu pregunta en lenguaje natural. Muy bueno con la VOZ: emoción, tono, ironía, acento, edad/género aparente, intención, qué dice y cómo lo dice. Con con_cuadros=True también ve los cuadros del tramo (fps) junto con el audio, para preguntas audio+video ("¿qué hace mientras dice X?"). Máx. 30 s por tramo recomendado (hasta 120 s). La respuesta incluye la evidencia del detector de sonidos (AudioSet) para contrastarla: para sonidos no verbales (sirenas, lluvia, música) confía más en esa evidencia o en preguntar_audio."""
    import escucha_local as E
    import oido_modelo as O
    import vision_local as vl
    try:
        p = _ruta_media(path)
        dur = _duracion(p)
        ini = max(0.0, start_offset or 0)
        fin = min(end_offset or min(dur, ini + 30), dur)
        if ini >= fin:
            raise vl.ErrorVision("Rango vacío")
        if fin - ini > 120:
            raise vl.ErrorVision("Tramo de más de 120 s: divídelo (el modelo escucha mejor en tramos de ≤30 s)")
        imagenes = []
        if con_cuadros:
            if p.suffix.lower() not in vl.FORMATOS:
                raise vl.ErrorVision("con_cuadros requiere un video")
            imagenes = [str(f) for _, f in vl.cuadros(p, ini, fin, fps, "default")][:16]
        q = pregunta
        if imagenes:
            q = (f"Recibes {len(imagenes)} cuadros del video (en orden, uno cada {1 / fps:g} s desde {vl.mmss(ini)}) "
                 f"y el audio del mismo tramo. {pregunta}")
        q += f" Responde en {idioma_respuesta}."
        texto, seg = O.preguntar(q, E.cargar(p, 16000, ini, fin), imagenes, sistema=SISTEMA_OIDO, max_tokens=400)
        meta = {"duracion_segundos": round(dur, 3), "tiene_audio": True}
        ev = [e for e in vl._eventos(p, meta) if ini - 1e-6 <= e["t"] < fin]
        evidencia = [f"[{vl.mmss(e['t'])}] " + ", ".join(f"{a} {b:.2f}" for a, b in e["sonidos"][:3]) for e in ev]
        trans = vl.transcripcion(p, meta)
        turnos = [f"[{vl.mmss(t['inicio'])}] {t['hablante']}: {t['texto'][:80]}" for t in trans.get("turnos", [])
                  if t["fin"] > ini and t["inicio"] < fin]
        return json.dumps({"respuesta": texto, "modelo": O.MODELO, "tramo": [ini, fin], "cuadros_vistos": len(imagenes),
                           "segundos": seg,
                           "aviso": "Contrasta la respuesta con la evidencia: el modelo es fiable con la voz (tono, emoción, "
                                    "intención) pero puede fallar contando hablantes o identificando sonidos no verbales.",
                           "evidencia_hablantes": {"n": trans.get("hablantes"), "turnos": turnos},
                           "evidencia_detector_sonidos": evidencia}, ensure_ascii=False)
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


# ---------------------------------------------------------------------------
# Modo nube (Hugging Face Space / cualquier servidor): MCP por HTTP + subida de archivos.
# La URL lleva una clave secreta: https://<servidor>/<MCP_CLAVE>/mcp  y  .../<MCP_CLAVE>/subir

import os as _os

CLAVE = _os.environ.get("MCP_CLAVE", "").strip().strip("/")
PREFIJO = f"/{CLAVE}" if CLAVE else ""
MAX_SUBIDA_MB = float(_os.environ.get("MAX_SUBIDA_MB", 2000))


@mcp.custom_route("/", methods=["GET"])
async def _estado(request):
    from starlette.responses import JSONResponse
    return JSONResponse({"servicio": "video-nube", "estado": "ok",
                         "mcp": "/<clave>/mcp" if CLAVE else "/mcp", "subir": "POST /<clave>/subir"})


@mcp.custom_route(f"{PREFIJO}/subir", methods=["POST"])
async def _subir(request):
    """Sube un archivo (multipart 'archivo' o cuerpo binario con ?nombre=x.mp4). Devuelve {"path": "subida:<id>"}."""
    import re
    import secrets
    from starlette.responses import JSONResponse
    import vision_local as vl
    vl.SUBIDAS.mkdir(parents=True, exist_ok=True)
    ident = secrets.token_hex(8)
    nombre = request.query_params.get("nombre", "")
    ctype = request.headers.get("content-type", "")
    if ctype.startswith("multipart/form-data"):
        form = await request.form(max_part_size=int(MAX_SUBIDA_MB * 1e6))
        f = form.get("archivo") or next((v for v in form.values() if hasattr(v, "read")), None)
        if f is None:
            return JSONResponse({"error": "Falta el campo 'archivo'"}, status_code=400)
        nombre = nombre or f.filename or "archivo.mp4"
        ext = re.sub(r"[^a-z0-9.]", "", Path(nombre).suffix.lower()) or ".mp4"
        destino = vl.SUBIDAS / f"{ident}{ext}"
        with open(destino, "wb") as out:
            while chunk := await f.read(1 << 20):
                out.write(chunk)
    else:
        ext = re.sub(r"[^a-z0-9.]", "", Path(nombre or "archivo.mp4").suffix.lower()) or ".mp4"
        destino = vl.SUBIDAS / f"{ident}{ext}"
        total = 0
        with open(destino, "wb") as out:
            async for chunk in request.stream():
                total += len(chunk)
                if total > MAX_SUBIDA_MB * 1e6:
                    out.close(); destino.unlink(missing_ok=True)
                    return JSONResponse({"error": f"Supera {MAX_SUBIDA_MB:g} MB"}, status_code=413)
                out.write(chunk)
    return JSONResponse({"path": f"subida:{ident}", "bytes": destino.stat().st_size})


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--http", action="store_true", help="servir por HTTP (nube) en vez de stdio")
    ap.add_argument("--port", type=int, default=int(_os.environ.get("PORT", 7860)))
    a = ap.parse_args()
    if a.http:
        if _os.environ.get("PRECARGAR_MODELOS") == "1":
            import threading

            def _precargar():
                from huggingface_hub import snapshot_download
                import escucha_local as E
                import oido_modelo as O
                for m in ["Systran/faster-whisper-small", E.MODELO_EVENTOS, E.MODELO_CLAP, E.MODELO_EMOCION,
                          E.MODELO_HABLANTE, O.MODELO]:
                    try:
                        snapshot_download(m)
                        print(f"[precarga] {m} listo", flush=True)
                    except Exception as e:  # sin red o sin permiso: se descargará al usarlo
                        print(f"[precarga] {m} falló: {e}", flush=True)
            threading.Thread(target=_precargar, daemon=True).start()
        mcp.run(transport="http", host="0.0.0.0", port=a.port, path=f"{PREFIJO}/mcp")
    else:
        mcp.run()
