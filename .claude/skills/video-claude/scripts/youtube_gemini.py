"""Ver un video de YouTube (o Short) SOLO con el link, desde la skill video-claude, sin servidor ni descarga.

1. Datos públicos: título y canal (oEmbed) + portada y 3 cuadros automáticos (~25/50/75 %) en una hoja JPG.
2. Análisis COMPLETO (imagen + audio) con la API de Gemini: Google lee el link; aquí no se descarga nada.
   Regla del usuario: si Gemini da 503 (saturado) —o cualquier error, o no hay clave— se DESCARTA y quedan solo
   las 4 imágenes públicas (+ la transcripción, que Claude trae con Firecrawl).
   Modelos en orden: si uno ya no existe (404) se prueba el siguiente; un 503 descarta todo sin reintentar.

Clave: secreto de red del entorno para generativelanguage.googleapis.com (encabezado x-goog-api-key; el proxy la
inyecta) o variable GEMINI_API_KEY. Nunca se guarda en el repo.

Uso:  python3 youtube_gemini.py <link> [--pregunta "..."] [--inicio 30] [--fin 90] [--sin-gemini] [--salida carpeta]
Imprime un JSON: {modo, video_id, titulo, canal, gemini (estado), analisis (texto o null), hoja (ruta JPG)}.
"""
import argparse
import io
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

UA = {"User-Agent": "video-claude/1.0"}
_ID = re.compile(r"(?:youtube\.com/(?:watch\?(?:.*&)?v=|shorts/|live/|embed/|v/)|youtu\.be/)([A-Za-z0-9_-]{11})")
GEMINI_MODELOS = [m.strip() for m in os.environ.get(
    "VIDEO_NUBE_GEMINI_MODELOS", "gemini-3-flash-preview,gemini-flash-latest,gemini-3.8-flash").split(",") if m.strip()]
GEMINI_PROMPT = ("Responde en español. Analiza este video completo, imagen y audio. 1) Resumen en 2 frases. 2) Escena por "
                 "escena con marcas MM:SS: qué SE VE (planos, texto en pantalla, tipografías, colores, gráficos, "
                 "transiciones, cortes, zooms), qué SE DICE y qué SUENA (música, efectos). 3) Estilo de edición: ritmo "
                 "(duración típica de cada plano), recursos que se repiten. No inventes lo que no se ve.")


def id_youtube(url):
    m = _ID.search(url or "")
    return m.group(1) if m else None


def _get(url, timeout=20):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
        return r.read()


def datos_publicos(vid):
    try:
        info = json.loads(_get(f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={vid}&format=json"))
    except Exception:  # noqa: BLE001
        info = {}
    return {"titulo": info.get("title"), "canal": info.get("author_name"), "canal_url": info.get("author_url")}


def hoja_publica(vid, destino, vertical=False):
    """Portada + 3 cuadros automáticos de YouTube en una sola imagen con etiquetas."""
    from PIL import Image, ImageDraw
    nombres = [("hqdefault", "portada"), ("hq1", "~25 %"), ("hq2", "~50 %"), ("hq3", "~75 %")]
    cuadros = []
    for k, etiqueta in nombres:
        try:
            im = Image.open(io.BytesIO(_get(f"https://i.ytimg.com/vi/{vid}/{k}.jpg"))).convert("RGB")
        except Exception:  # noqa: BLE001
            continue
        w, h = im.size
        if h / w > 0.7:                                   # quita las franjas negras del 4:3
            im = im.crop((0, int(h * 0.125), w, int(h * 0.875)))
        if vertical:                                      # Short: centro 9:16
            w, h = im.size
            nw = int(h * 9 / 16)
            im = im.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
        cuadros.append((etiqueta, im))
    if not cuadros:
        return None
    alto = 360
    cuadros = [(e, im.resize((int(im.width * alto / im.height), alto))) for e, im in cuadros]
    hoja = Image.new("RGB", (sum(im.width for _, im in cuadros) + 6 * (len(cuadros) - 1), alto), "black")
    d, x = ImageDraw.Draw(hoja), 0
    for e, im in cuadros:
        hoja.paste(im, (x, 0))
        d.rectangle((x, 0, x + 9 * len(e) + 8, 22), fill="black")
        d.text((x + 4, 4), e, fill="yellow")
        x += im.width + 6
    destino = Path(destino)
    destino.parent.mkdir(parents=True, exist_ok=True)
    hoja.save(destino, quality=88)
    return str(destino)


def gemini_youtube(url, prompt=None, inicio=None, fin=None, timeout=300):
    """Devuelve (texto, estado). 404 = probar el siguiente modelo; 503 o cualquier otro error = descartar."""
    parte_video = {"file_data": {"file_uri": url}}
    if inicio is not None or fin is not None:
        meta = {}
        if inicio is not None:
            meta["start_offset"] = f"{float(inicio):.0f}s"
        if fin is not None:
            meta["end_offset"] = f"{float(fin):.0f}s"
        parte_video["video_metadata"] = meta
    cuerpo = json.dumps({"contents": [{"parts": [parte_video, {"text": prompt or GEMINI_PROMPT}]}]}).encode()
    estado = "sin modelos configurados"
    for modelo in GEMINI_MODELOS:
        req = urllib.request.Request(
            f"https://generativelanguage.googleapis.com/v1beta/models/{modelo}:generateContent", cuerpo,
            {**UA, "Content-Type": "application/json",
             "x-goog-api-key": os.environ.get("GEMINI_API_KEY", "proxy-injected")})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                res = json.loads(r.read())
            texto = "".join(p.get("text", "") for c in res.get("candidates", [])
                            for p in c.get("content", {}).get("parts", []))
            return (texto, f"ok ({modelo})") if texto.strip() else (None, "Gemini no devolvió texto: descartado")
        except urllib.error.HTTPError as e:
            cuerpo_err = e.read().decode(errors="ignore")[:400]
            if e.code == 503:
                return None, "Gemini saturado (503): descartado, se usan solo las 4 imágenes públicas"
            if e.code == 404:
                estado = f"modelo {modelo} no disponible (404)"
                continue
            if e.code in (401, 403) or "API key" in cuerpo_err or "API_KEY" in cuerpo_err:
                return None, (f"Gemini sin clave válida ({e.code}): guarda la clave de Google AI Studio en el entorno "
                              "(secreto de red generativelanguage.googleapis.com, encabezado x-goog-api-key)")
            return None, f"Gemini falló ({e.code}): descartado"
        except Exception as e:  # noqa: BLE001
            return None, f"Gemini no respondió ({type(e).__name__}): descartado"
    return None, f"Gemini: {estado}; descartado"


def ver(url, pregunta=None, inicio=None, fin=None, gemini=True, salida=None):
    vid = id_youtube(url)
    if not vid:
        raise ValueError("No parece un enlace de YouTube (watch, shorts, live, embed o youtu.be)")
    limpio = f"https://www.youtube.com/watch?v={vid}"
    salida = Path(salida or Path(__file__).resolve().parents[4] / "datos" / "vision" / "youtube")
    out = {"modo": "enlace", "video_id": vid, "url": limpio, **datos_publicos(vid)}
    out["hoja"] = hoja_publica(vid, salida / f"youtube_{vid}.jpg", vertical="/shorts/" in url)
    out["analisis"], out["gemini"] = gemini_youtube(limpio, pregunta, inicio, fin) if gemini else (None, "no pedido")
    out["nota"] = ("Con análisis de Gemini: lo visual y el audio vienen de su descripción del video completo. "
                   if out["analisis"] else "Sin Gemini: solo se vio la portada y 3 cuadros públicos. ") + \
                  "Trae además la transcripción con Firecrawl (youtube-com/videos/video_transcript)."
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("url")
    ap.add_argument("--pregunta")
    ap.add_argument("--inicio", type=float)
    ap.add_argument("--fin", type=float)
    ap.add_argument("--sin-gemini", action="store_true")
    ap.add_argument("--salida")
    a = ap.parse_args()
    try:
        print(json.dumps(ver(a.url, a.pregunta, a.inicio, a.fin, not a.sin_gemini, a.salida), ensure_ascii=False, indent=1))
    except ValueError as e:
        sys.exit(str(e))
