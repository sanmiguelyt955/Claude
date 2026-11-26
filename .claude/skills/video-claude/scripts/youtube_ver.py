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
Imprime JSON: {video_id, titulo, duracion, cada_s, cuadros (n), hojas [rutas JPG, cortes en rojo], cortes [MM:SS],
               subtitulos, linea_tiempo (.md: cuadro + corte + lo que se dice), gemini, analisis}
Mejoras v2: guarda info.json (no repite la consulta a YouTube), marca los cortes de plano en rojo, y trae los
subtítulos con tiempo (manuales o automáticos) del mismo info, sin Firecrawl.
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


def info(url, carpeta=None):
    cache = Path(carpeta) / "info.json" if carpeta else None
    if cache and cache.exists():
        return json.loads(cache.read_text())
    r = subprocess.run(["yt-dlp", "--js-runtimes", "node", "-J", "--no-warnings", url],
                       capture_output=True, text=True, timeout=180)
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip().splitlines()[-1] if r.stderr.strip() else "yt-dlp falló")
    d = json.loads(r.stdout)
    if cache:
        cache.write_text(json.dumps(d))
    return d


def subtitulos(d, idiomas=("es", "es-419", "en", "en-US")):
    """Subtítulos con tiempo desde el info (manuales primero, luego automáticos). Una petición, sin descargar video."""
    for fuente, tipo in ((d.get("subtitles") or {}, "manuales"), (d.get("automatic_captions") or {}, "automáticos")):
        base = d.get("language") or ""
        orig = [k for k in fuente if k.endswith("-orig")] + [k for k in fuente if base and k.split("-")[0] == base]
        for lang in list(dict.fromkeys(orig + [l for l in idiomas if l in fuente])):
            f = next((x for x in fuente[lang] if x.get("ext") == "json3"), None)
            if not f:
                continue
            try:
                j = json.loads(urllib.request.urlopen(urllib.request.Request(f["url"], headers=yg.UA), timeout=30).read())
            except Exception:  # noqa: BLE001
                continue
            seg = []
            for e in j.get("events", []):
                txt = "".join(x.get("utf8", "") for x in e.get("segs", []) or []).replace("\n", " ").strip()
                if txt:
                    seg.append((e.get("tStartMs", 0) / 1000, txt))
            if seg:
                return {"idioma": lang, "tipo": tipo, "segmentos": seg}
    return None


def cortes(lista, umbral=28.0):
    """Cambios de plano entre cuadros consecutivos (diferencia media de píxeles). Devuelve índices de cuadros con corte."""
    marcados, prev = set(), None
    for i, (_, c) in enumerate(lista):
        g = c.convert("L").resize((32, 18))
        if prev is not None:
            dif = sum(abs(a - b) for a, b in zip(g.tobytes(), prev.tobytes())) / (32 * 18)
            if dif > umbral:
                marcados.add(i)
        prev = g
    return marcados


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


def hojas(lista, carpeta, por_hoja=20, escala=2, cols=5, con_corte=frozenset()):
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
            corte = (k + i) in con_corte
            if corte:
                d.rectangle((x, y + 18, x + w - 1, y + 18 + h - 1), outline="red", width=4)
            d.text((x + 4, y + 3), f"{int(t // 60):02d}:{int(t % 60):02d}" + ("  CORTE" if corte else ""),
                   fill="red" if corte else "yellow")
        r = carpeta / f"hoja_{k // por_hoja + 1:02d}.jpg"
        lienzo.save(r, quality=90)
        rutas.append(str(r))
    return rutas


def _mmss(t):
    return f"{int(t // 60):02d}:{int(t % 60):02d}"


def linea_tiempo(lista, sub, cortes_idx, carpeta):
    """Archivo .md con un renglón por cuadro: MM:SS, si hay corte, y lo que se dice en ese tramo."""
    if not lista and not sub:
        return None
    filas = ["| MM:SS | Corte | Se dice (subtítulos) |", "|---|---|---|"]
    tiempos = [t for t, _ in lista] or sorted({round(t) for t, _ in sub["segmentos"]})
    for i, t in enumerate(tiempos):
        fin = tiempos[i + 1] if i + 1 < len(tiempos) else t + 2
        dicho = " ".join(x for s0, x in (sub["segmentos"] if sub else []) if t <= s0 < fin)
        filas.append(f"| {_mmss(t)} | {'✂️' if i in cortes_idx else ''} | {dicho} |")
    r = Path(carpeta) / "linea_tiempo.md"
    r.write_text("\n".join(filas) + "\n", encoding="utf-8")
    return str(r)


def ver(url, gemini=True, pregunta=None, por_hoja=20, salida=None):
    vid = yg.id_youtube(url) or "video"
    carpeta = Path(salida) if salida else RAIZ / vid
    carpeta.mkdir(parents=True, exist_ok=True)
    res = {"video_id": vid, "carpeta": str(carpeta)}
    try:
        d = info(url, carpeta)
        res.update(titulo=d.get("title"), canal=d.get("channel"), duracion=d.get("duration"))
        sb = mejor_storyboard(d)
        lista, cc = [], set()
        if sb:
            lista, cada = cuadros(sb, d.get("duration") or 1e9)
            cc = cortes(lista)
            res.update(cuadros=len(lista), cada_s=round(cada, 2) if cada else None,
                       tamano=f"{sb['width']}x{sb['height']}", hojas=hojas(lista, carpeta, por_hoja, con_corte=cc),
                       cortes=[_mmss(lista[i][0]) for i in sorted(cc)])
        if not sb:
            res["cuadros"] = 0
            res["nota_cuadros"] = "Este video no trae miniaturas de barra; quedan la portada y 3 cuadros de Gemini."
        sub = subtitulos(d)
        if sub:
            res["subtitulos"] = f"{sub['tipo']} ({sub['idioma']}), {len(sub['segmentos'])} líneas"
        res["linea_tiempo"] = linea_tiempo(lista, sub, cortes_idx=cc, carpeta=carpeta)
    except Exception as e:  # noqa: BLE001
        res.setdefault("error_cuadros", str(e))
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
