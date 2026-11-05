"""Herramienta MCP ver_youtube: ver un video de YouTube solo con el enlace.

1. Intenta descargarlo (yt-dlp). Si se puede (computadora de casa, servidor con YTDLP_COOKIES...), lo ve completo
   como ver_video: cuadros con MM:SS, voz, sonidos.
2. Si YouTube bloquea la descarga desde servidores, NO intenta saltarse el bloqueo: usa lo que YouTube publica
   abiertamente: título y canal (oEmbed) y sus imágenes públicas (portada y 3 cuadros automáticos a ~25/50/75 %).
   La transcripción la trae Claude con el conector de Firecrawl (youtube-com/videos/video_transcript).
"""
import json
import re
import urllib.request

_ID = re.compile(r"(?:youtube\.com/(?:watch\?(?:.*&)?v=|shorts/|live/|embed/|v/)|youtu\.be/)([A-Za-z0-9_-]{11})")


def id_youtube(url):
    m = _ID.search(url or "")
    return m.group(1) if m else None


def _get(url, timeout=30):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (ver-video)"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def _recortar_barras(im):
    """Quita las franjas negras (los Shorts vienen en vertical dentro de una imagen 4:3)."""
    from PIL import ImageOps
    g = ImageOps.grayscale(im).point(lambda v: 255 if v > 18 else 0)
    caja = g.getbbox()
    return im.crop(caja) if caja else im


def _centro_vertical(im):
    """Shorts: la miniatura es 4:3 con el video 9:16 en el centro y un fondo difuminado a los lados."""
    w, h = im.size
    a = round(h * 9 / 16)
    return im.crop(((w - a) // 2, 0, (w - a) // 2 + a, h)) if a < w else im


def imagenes_publicas(vid, carpeta, vertical=False):
    """Portada + cuadros automáticos de YouTube (hq1/hq2/hq3 ≈ 25 %, 50 %, 75 % del video), en una hoja."""
    from PIL import Image, ImageDraw, ImageFont
    import io
    carpeta.mkdir(parents=True, exist_ok=True)
    piezas = []
    for nombre, etiqueta in (("hqdefault", "portada"), ("hq1", "~25 %"), ("hq2", "~50 %"), ("hq3", "~75 %")):
        try:
            im = Image.open(io.BytesIO(_get(f"https://i.ytimg.com/vi/{vid}/{nombre}.jpg"))).convert("RGB")
        except Exception:
            continue
        im = _recortar_barras(im)
        piezas.append((_centro_vertical(im) if vertical else im, etiqueta))
    if not piezas:
        return None
    alto = 520
    piezas = [(im.resize((max(1, round(im.width * alto / im.height)), alto)), e) for im, e in piezas]
    ancho = sum(im.width for im, _ in piezas) + 6 * (len(piezas) - 1)
    hoja = Image.new("RGB", (ancho, alto), "black")
    try:
        letra = ImageFont.load_default(size=34)
    except TypeError:
        letra = ImageFont.load_default()
    x = 0
    for im, e in piezas:
        d = ImageDraw.Draw(im)
        x0, y0, x1, y1 = d.textbbox((0, 0), e, font=letra)
        d.rectangle((0, 0, x1 - x0 + 14, y1 - y0 + 14), fill="black")
        d.text((7 - x0, 7 - y0), e, fill="yellow", font=letra)
        hoja.paste(im, (x, 0))
        x += im.width + 6
    destino = carpeta / f"youtube_{vid}{'_v' if vertical else ''}.jpg"
    hoja.save(destino, quality=88)
    return destino, [e for _, e in piezas]


def registrar(mcp, _error, contenido_intercalado):
    from fastmcp.utilities.types import Image

    @mcp.tool
    def ver_youtube(url: str, fps: float = 1.0, start_offset: float = 0, end_offset: float = 0, pagina: int = 1):
        """Ve un video de YouTube (watch, shorts, youtu.be) SOLO con el enlace. Si el servidor puede descargarlo, lo ve completo como ver_video (cuadros [MM:SS] + voz + sonidos; usa fps/offsets/pagina igual). Si YouTube bloquea la descarga (casi siempre en servidores en la nube), devuelve modo='enlace': título, canal, portada y 3 cuadros públicos (~25/50/75 %) y te indica traer la TRANSCRIPCIÓN con Firecrawl (youtube-com/videos/video_transcript, con el idioma original de caption_tracks). En modo enlace solo has visto esas imágenes: dilo al responder."""
        import vision_local as vl
        vid = id_youtube(url)
        if not vid:
            raise _error(vl.ErrorVision("No parece un enlace de YouTube (watch, shorts, live, embed o youtu.be)"))
        limpio = f"https://www.youtube.com/watch?v={vid}"
        try:
            vl.resolver(limpio)
            r = vl.ver_static(limpio, fps, start_offset, end_offset)
            partes = contenido_intercalado(r, "auto", pagina)
            return [json.dumps({"modo": "completo", "video_id": vid}, ensure_ascii=False)] + partes
        except vl.ErrorVision as e:
            bloqueo = str(e)
        info = {}
        try:
            info = json.loads(_get(f"https://www.youtube.com/oembed?url={limpio}&format=json"))
        except Exception:
            pass
        hoja = imagenes_publicas(vid, vl.SALIDA / "youtube", vertical="/shorts/" in url)
        datos = {
            "modo": "enlace", "video_id": vid, "url": limpio,
            "titulo": info.get("title"), "canal": info.get("author_name"), "canal_url": info.get("author_url"),
            "por_que": "YouTube no deja descargar el video desde este servidor; no se intenta saltar el bloqueo.",
            "detalle_bloqueo": bloqueo[:300],
            "imagenes": hoja[1] if hoja else [],
            "siguiente_paso": ("Trae la transcripción con timestamps: firecrawl_scrape alexandria "
                               "{provider:'youtube-com', capability:'videos/video_details', options:{url}} para ver idiomas "
                               "(caption_tracks) y duración, y después {capability:'videos/video_transcript', "
                               "options:{url, language:'<idioma original, p. ej. es>'}} (5 créditos cada una). "
                               "Para ver TODO el video: que el usuario lo descargue y lo adjunte, o usar el servidor "
                               "propio con YTDLP_COOKIES."),
        }
        partes = [json.dumps(datos, ensure_ascii=False)]
        if hoja:
            partes += ["Imágenes públicas de YouTube (portada y cuadros automáticos aproximados; no son todos los "
                       "cuadros):", Image(path=str(hoja[0]))]
        return partes
