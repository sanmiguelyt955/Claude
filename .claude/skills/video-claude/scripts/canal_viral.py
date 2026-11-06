"""Estudiar un canal viral: ordena sus Shorts por vistas y manda los mejores a Gemini para entender POR QUÉ retienen
(marketing, neuromarketing y psicología) y sacar una fórmula propia + ideas para nuestro nicho.

Lista de videos (de más a menos completa):
  --lista shorts.json   salida de Firecrawl youtube-com/videos/channel_shorts (o channel_videos): {videos:[{video_id,
                        title, view_count_text}]}. Claude la trae con el MCP de Firecrawl (5 créditos, ~48 Shorts).
  @canal o URL          sin lista: RSS público del canal (solo los ~15 más recientes, con vistas).

    python3 canal_viral.py @capybluh [--lista shorts.json] [--top 3] [--nicho "animación 3D de humor familiar"]
                           [--salida docs/analisis-videos/archivo.md]

Regla de Gemini: si da 503 (o cualquier error) ese video se descarta y queda solo con título y vistas.
"""
import argparse
import datetime as dt
import json
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from youtube_gemini import gemini_youtube  # noqa: E402

REPO = Path(__file__).resolve().parents[4]
UA = {"User-Agent": "video-claude/1.0"}

PROMPT = """Responde en español. Eres estratega de contenido vertical, experto en marketing, neuromarketing y psicología
de la atención. Mira este Short COMPLETO (imagen y audio). Tiene {vistas} vistas. Sé concreto y cita MM:SS.
1) Resumen en 1 frase y formato (contraste A/B, escalera, historia, pregunta, tutorial…).
2) Gancho 0-2 s: qué se ve, qué se oye y qué pregunta abre en la cabeza del espectador.
3) Desencadenantes que retienen, cada uno con el momento exacto en que aparece y por qué funciona en el cerebro:
   brecha de curiosidad / efecto Zeigarnik, interrupción de patrón, contraste, identificación («eso me pasa»),
   escalada de intensidad (dopamina por anticipación), sorpresa o giro, humor físico, tensión-alivio, nostalgia,
   mascotas/caras/bebés (sesgo por rostros), emoción dominante (alegría, miedo, asco, ternura…), baja carga cognitiva
   (se entiende sin idioma), sonido (efectos que marcan el ritmo), y lo que haga que se repita (loop) o que comenten.
4) Ritmo: duración media de cada plano y dónde cae el clímax (en % del video).
5) Qué podría hacer que la gente se vaya (riesgos de retención) y cómo lo evita.
6) FÓRMULA replicable en 5 pasos, sin copiar personajes, marcas ni escenas.
7) Tres ideas ORIGINALES con esa fórmula para este nicho: {nicho}. Cada idea: título, gancho de 2 s y remate.
No inventes lo que no se ve ni se oye."""


def vistas(txt):
    m = re.search(r"([\d.,]+)\s*([KMB]?)", (txt or "").replace(",", ""), re.I)
    if not m:
        return 0
    return int(float(m.group(1)) * {"": 1, "K": 1e3, "M": 1e6, "B": 1e9}[m.group(2).upper()])


def bonito(n):
    return f"{n / 1e6:.1f}M" if n >= 1e6 else f"{n / 1e3:.0f}K" if n >= 1e3 else str(n)


def desde_rss(canal):
    """~15 videos más recientes con vistas, sin claves (RSS público). Acepta @handle, URL o channel_id."""
    cid = canal if re.fullmatch(r"UC[\w-]{22}", canal) else None
    if not cid:
        url = canal if canal.startswith("http") else f"https://www.youtube.com/{canal if canal.startswith('@') else '@' + canal}"
        html = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=20).read().decode(errors="ignore")
        m = re.search(r'"(?:channelId|externalId)":"(UC[\w-]{22})"', html)
        if not m:
            raise RuntimeError("no encontré el channel_id (YouTube pudo bloquear la página): usa --lista de Firecrawl")
        cid = m.group(1)
    xml = urllib.request.urlopen(urllib.request.Request(
        f"https://www.youtube.com/feeds/videos.xml?channel_id={cid}", headers=UA), timeout=20).read()
    ns = {"a": "http://www.w3.org/2005/Atom", "yt": "http://www.youtube.com/xml/schemas/2015",
          "m": "http://search.yahoo.com/mrss/"}
    out = []
    for e in ET.fromstring(xml).findall("a:entry", ns):
        est = e.find("m:group/m:community/m:statistics", ns)
        out.append({"video_id": e.find("yt:videoId", ns).text, "title": e.find("a:title", ns).text,
                    "vistas": int(est.get("views")) if est is not None else 0})
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("canal")
    ap.add_argument("--lista")
    ap.add_argument("--top", type=int, default=3)
    ap.add_argument("--nicho", default="animación 3D de humor (personajes cabezones) para Shorts/Reels/TikTok")
    ap.add_argument("--salida")
    a = ap.parse_args()
    if a.lista:
        d = json.loads(Path(a.lista).read_text(encoding="utf-8"))
        d = d.get("data", d)
        vids = [{"video_id": v["video_id"], "title": v.get("title"), "vistas": vistas(v.get("view_count_text"))}
                for v in d.get("videos", [])]
    else:
        vids = desde_rss(a.canal)
    vids.sort(key=lambda v: -v["vistas"])
    top = vids[: a.top]

    def analizar(v):
        txt, estado = gemini_youtube(f"https://www.youtube.com/watch?v={v['video_id']}",
                                     PROMPT.format(vistas=bonito(v["vistas"]), nicho=a.nicho))
        return v, txt, estado
    with ThreadPoolExecutor(3) as ex:
        res = list(ex.map(analizar, top))
    nombre = re.sub(r"\W+", "", a.canal.split("/")[-1]) or "canal"
    salida = Path(a.salida or REPO / "docs" / "analisis-videos" / f"{dt.date.today()}-{nombre}-viral.md")
    lineas = [f"# {a.canal}: por qué retienen sus Shorts más vistos", "",
              f"Fecha: {dt.date.today()} · {len(vids)} videos en la lista · top {a.top} analizados con Gemini "
              f"(marketing, neuromarketing y psicología) · nicho: {a.nicho}", "",
              "| # | Vistas | Título |", "|---|---|---|"]
    lineas += [f"| {k} | {bonito(v['vistas'])} | [{v['title']}](https://youtube.com/shorts/{v['video_id']}) |"
               for k, v in enumerate(vids, 1)]
    for v, txt, estado in res:
        lineas += ["", f"## {v['title']} ({bonito(v['vistas'])}) — https://youtube.com/shorts/{v['video_id']}",
                   f"_Gemini: {estado}_", "", txt or "(sin análisis: solo título y vistas)"]
    salida.parent.mkdir(parents=True, exist_ok=True)
    salida.write_text("\n".join(lineas) + "\n", encoding="utf-8")
    print(json.dumps({"salida": str(salida), "analizados": [(v["title"], bonito(v["vistas"]), e) for v, _, e in res]},
                     ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
