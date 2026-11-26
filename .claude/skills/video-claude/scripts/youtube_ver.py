"""Ver un video de YouTube SOLO con el link, imagen por imagen + audio, desde la nube y gratis.

YouTube no deja bajar el video a servidores (403). Este script mezcla tres fuentes legítimas:
  1. CUADROS REALES: las miniaturas públicas de la barra de reproducción («storyboard», las que salen al pasar el dedo
     por la barra). yt-dlp las lista como formatos sb0/sb1/sb2. Son imágenes del video, una cada ~1-10 s según la
     duración, a 160x90 (a veces 320x180). Claude las VE con sus propios ojos: se cortan una por una con su MM:SS y se
     arman hojas con la hora escrita.
  2. AUDIO + DETALLE: Gemini por link (youtube_gemini.py) ve y escucha el video completo y da una bitácora por segundo.
  3. TRANSCRIPCIÓN: Claude la trae aparte con Firecrawl (youtube-com/videos/video_transcript).
No se baja el video ni se salta ningún bloqueo. Hace UNA consulta a YouTube por video (si da 429, esperar; no insistir).

Uso:  python3 youtube_ver.py <link> [--sin-gemini] [--pregunta "..."] [--por-hoja 20] [--salida carpeta]
Imprime JSON: {video_id, titulo, duracion, cada_s, cuadros (n), hojas [rutas JPG], gemini, analisis}
Al terminar el análisis, borrar la carpeta (--borrar <carpeta>).
"""
import argparse
import io
import json
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).parent))
import youtube_gemini as yg  # noqa: E402

RAIZ = Path(__file__).resolve().parents[4] / "datos/vision/youtube"
PROMPT_SEGUNDOS = ("Responde en español. Mira y escucha el video completo. Da una BITÁCORA segundo a segundo "
                   "(o por cada cambio si el video dura más de 3 min) con este formato por línea: "
                   "MM:SS | SE VE (personas, acciones, objetos, texto en pantalla exacto, plano y cámara) | "
                   "SE DICE (palabras exactas y quién) | SUENA (música, efectos, silencios). "
                   "Después: lista de cortes con su MM:SS y el estilo de edición. No inventes lo que no se ve.")


def info(url):
    r = subprocess.run(["yt-dlp", "--js-runtimes", "node", "-J", "--no-warnings", url],
                       capture_output=True, text=True, timeout=180)
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip().splitlines()[-1] if r.stderr.strip() else "yt-dlp falló")
    return json.loads(r.stdout)


def mejor_storyboard(d):
    sbs = [f for f in d.get("formats", []) if str(f.get("format_id", "")).startswith("sb") and f.get("fragments")]
    return max(sbs, key=lambda f: (f.get("width") or 0)) if sbs else None


def cuadros(sb, duracion):
    """Baja las hojas del storyboard y las corta en cuadros con su tiempo (segundos)."""
    w, h, filas, cols = sb["width"], sb["height"], sb["rows"], sb["columns"]
    salida, t0 = [], 0.0
    for frag in sb["fragments"]:
        url = frag.get("url") or (sb.get("fragment_base_url", "") + frag.get("path", ""))
        hoja = Image.open(io.BytesIO(urllib.request.urlopen(
            urllib.request.Request(url, headers=yg.UA), timeout=30).read())).convert("RGB")
        n = filas * cols
        paso = (frag.get("duration") or 0) / n if n else 0
        for i in range(n):
            t = t0 + i * paso
            if t > duracion:
                break
            x, y = (i % cols) * w, (i // cols) * h
            if y + h > hoja.height or x + w > hoja.width:
                break
            c = hoja.crop((x, y, x + w, y + h))
            if c.getextrema()[0][1] < 8:  # cuadro negro de relleno al final de la hoja
                continue
            salida.append((t, c))
        t0 += frag.get("duration") or 0
    return salida, (salida[1][0] - salida[0][0]) if len(salida) > 1 else None


def hojas(lista, carpeta, por_hoja=20, escala=2, cols=5):
    rutas = []
    for k in range(0, len(lista), por_hoja):
        grupo = lista[k:k + por_hoja]
        w, h = grupo[0][1].width * escala, grupo[0][1].height * escala
        filas = (len(grupo) + cols - 1) // cols
        lienzo = Image.new("RGB", (cols * w, filas * (h + 18)), "black")
        d = ImageDraw.Draw(lienzo)
        for i, (t, c) in enumerate(grupo):
            x, y = (i % cols) * w, (i // cols) * (h + 18)
            lienzo.paste(c.resize((w, h), Image.LANCZOS), (x, y + 18))
            d.text((x + 4, y + 3), f"{int(t // 60):02d}:{int(t % 60):02d}", fill="yellow")
        r = carpeta / f"hoja_{k // por_hoja + 1:02d}.jpg"
        lienzo.save(r, quality=90)
        rutas.append(str(r))
    return rutas


def ver(url, gemini=True, pregunta=None, por_hoja=20, salida=None):
    vid = yg.id_youtube(url) or "video"
    carpeta = Path(salida) if salida else RAIZ / vid
    carpeta.mkdir(parents=True, exist_ok=True)
    res = {"video_id": vid, "carpeta": str(carpeta)}
    try:
        d = info(url)
        res.update(titulo=d.get("title"), canal=d.get("channel"), duracion=d.get("duration"))
        sb = mejor_storyboard(d)
        if sb:
            lista, cada = cuadros(sb, d.get("duration") or 1e9)
            res.update(cuadros=len(lista), cada_s=round(cada, 2) if cada else None,
                       tamano=f"{sb['width']}x{sb['height']}", hojas=hojas(lista, carpeta, por_hoja))
        else:
            res["cuadros"] = 0
            res["nota_cuadros"] = "Este video no trae miniaturas de barra; quedan la portada y 3 cuadros de Gemini."
    except Exception as e:  # noqa: BLE001
        res["error_cuadros"] = str(e)
    if gemini:
        g = yg.ver(url, pregunta=pregunta or PROMPT_SEGUNDOS, salida=str(carpeta))
        res.update(gemini=g.get("gemini"), analisis=g.get("analisis"), hoja_publica=g.get("hoja"))
    return res


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("url", nargs="?")
    ap.add_argument("--sin-gemini", action="store_true")
    ap.add_argument("--pregunta")
    ap.add_argument("--por-hoja", type=int, default=20)
    ap.add_argument("--salida")
    ap.add_argument("--borrar", help="borra la carpeta del análisis al terminar")
    a = ap.parse_args()
    if a.borrar:
        shutil.rmtree(a.borrar, ignore_errors=True)
        print(json.dumps({"borrado": a.borrar}))
    elif a.url:
        print(json.dumps(ver(a.url, not a.sin_gemini, a.pregunta, a.por_hoja, a.salida), ensure_ascii=False, indent=1))
    else:
        ap.print_help()
