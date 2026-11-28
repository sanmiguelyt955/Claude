#!/usr/bin/env python3
"""Plan de visión: dice qué tramos de un video conviene VER (vidIQ/Gemini) y cuáles bastan con leer.

Usa lo que trae YTAPI (todo cuesta 0 a 3 créditos): subtítulos SRT, capítulos de la descripción y
mapa de calor. Este script es local (no gasta créditos): tú, Claude, primero llamas al conector YTAPI,
guardas los resultados en archivos y luego lo corres.

  1) YTAPI get_video_info (gratis)  -> duración e idiomas
  2) YTAPI get_transcript format=srt (1 crédito) -> guárdalo en transcripcion.srt
  3) YTAPI get_video_details (1) -> copia la descripción a descripcion.txt (trae los capítulos)
  4) YTAPI get_video_heatmap (1, solo si el video es largo) -> mapa.txt (puede no existir)
  5) python3 ytapi_plan.py --srt transcripcion.srt [--descripcion descripcion.txt] [--mapa mapa.txt]

Qué entrega: tabla por tramo con palabras por minuto, «puntaje visual» (cuánto dice «aquí», «fijaos»,
«pulsamos», «seleccionamos»... = está mostrando algo en pantalla) y si cae en un pico del mapa de calor;
más la recomendación (qué herramienta de vidIQ/Gemini y cuánto cuesta) y un prompt listo para vidIQ que
pide la frase exacta entre comillas, para poder corregir los minutos después con corregir_tiempos.py.
"""
import argparse, re, sys
from corregir_tiempos import CUE, TS, a_seg, fmt, parse_srt

VISUAL = re.compile(
    r"\b(aqu[ií]|fijaos|f[ií]jate|mirad|mira|como (?:veis|ves)|pulsamos|pulsa|seleccionamos|elegimos|"
    r"entramos|abrimos|escribimos|pegamos|copiamos|descargamos|instalador|pantalla|bot[oó]n|men[uú]|"
    r"apartado|ventana|chat|excel|archivo|enlace|here|click|press|look|screen|button|menu|open)\b", re.I)


def capitulos(desc):
    caps = []
    for ln in desc.splitlines():
        m = TS.match(ln.strip())
        if m and len(ln.strip()) > len(m.group(1)) + 2:
            caps.append((a_seg(m.group(1)), ln.strip()[len(m.group(1)):].strip(" -–—:")))
    return sorted(caps) if len(caps) >= 3 else []


def picos(txt):
    out = []
    for ln in txt.splitlines():
        m = re.search(r"(\d+:\d{2}(?::\d{2})?)\s*-\s*(\d+:\d{2}(?::\d{2})?)\s*,?\s*intensity\s*([\d.]+)", ln)
        if m:
            out.append((a_seg(m.group(1)), a_seg(m.group(2)), float(m.group(3))))
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--srt", required=True)
    ap.add_argument("--descripcion")
    ap.add_argument("--mapa")
    ap.add_argument("--duracion", type=float, help="segundos (si no, se toma del final del SRT)")
    ap.add_argument("--ventana", type=int, default=300, help="segundos por tramo si no hay capítulos (300)")
    ap.add_argument("--presupuesto-min", type=int, default=15, help="minutos máximos a ver en videos largos (15)")
    a = ap.parse_args()

    palabras = parse_srt(open(a.srt, encoding="utf-8", errors="ignore").read())
    if len(palabras) < 20:
        sys.exit("No encontré subtítulos SRT en " + a.srt)
    ultimo = max(t for t, _ in palabras)
    dur = a.duracion or ultimo + 3
    caps = capitulos(open(a.descripcion, encoding="utf-8", errors="ignore").read()) if a.descripcion else []
    pk = picos(open(a.mapa, encoding="utf-8", errors="ignore").read()) if a.mapa else []

    if caps:
        lim = [c[0] for c in caps] + [dur]
        tramos = [(lim[i], lim[i + 1], caps[i][1]) for i in range(len(caps))]
        if lim[0] > 5:
            tramos.insert(0, (0, lim[0], "Inicio"))
    else:
        n = int(dur // a.ventana) + (1 if dur % a.ventana > 30 else 0)
        tramos = [(i * a.ventana, min(dur, (i + 1) * a.ventana), f"Tramo {i + 1}") for i in range(max(1, n))]

    filas = []
    for t0, t1, nombre in tramos:
        ws = [w for t, w in palabras if t0 <= t < t1]
        mins = max((t1 - t0) / 60, 0.1)
        vis = len(VISUAL.findall(" ".join(ws)))
        score = vis / max(len(ws), 1) * 100
        pico = max((p[2] for p in pk if p[0] < t1 and p[1] > t0), default=0)
        # puntaje: lo visual pesa más; el pico del mapa de calor suma interés
        total = score + pico * 3
        filas.append({"t0": t0, "t1": t1, "nombre": nombre, "pal_min": round(len(ws) / mins), "visual": round(score, 1),
                      "pico": pico, "total": total})
    print(f"Video de {fmt(dur)} · {len(palabras)} palabras en subtítulos · capítulos: {len(caps) or 'no hay (ventanas de %d s)' % a.ventana}"
          f" · picos del mapa: {len(pk) or 'sin mapa'}")
    print(f"{'tramo':<13} {'pal/min':>7} {'visual':>7} {'pico':>5}  nombre")
    for f in filas:
        print(f"{fmt(f['t0'])+'-'+fmt(f['t1']):<13} {f['pal_min']:>7} {f['visual']:>7} {f['pico'] or '-':>5}  {f['nombre'][:55]}")

    print("\nRECOMENDACIÓN")
    if dur <= 180:
        print(f"- Short/video corto ({fmt(dur)}): vidIQ `vidiq_watch_shortform_content` (10 créditos), completo.")
    elif dur <= 1200:
        print(f"- Video de {fmt(dur)}: vidIQ `vidiq_video_watch` completo (25 créditos); los minutos se corrigen con el SRT.")
        top = sorted(filas, key=lambda f: -f["total"])[:3]
        print("- Pídele que ponga más atención en los tramos más visuales: " +
              ", ".join(f"{fmt(f['t0'])}-{fmt(f['t1'])}" for f in sorted(top, key=lambda f: f['t0'])))
    else:
        resto, elegidos = a.presupuesto_min * 60, []
        for f in sorted(filas, key=lambda f: -f["total"]):
            if f["t1"] - f["t0"] <= resto:
                elegidos.append(f)
                resto -= f["t1"] - f["t0"]
        print(f"- Video largo ({fmt(dur)}): vidIQ `video_watch` pone mal los minutos. Ver solo estos tramos con "
              f"Gemini Video (start/end) y leer el resto en el SRT:")
        for f in sorted(elegidos, key=lambda f: f["t0"]):
            print(f"    {fmt(f['t0'])}-{fmt(f['t1'])}  {f['nombre'][:50]}")
        print("- Si Gemini no tiene cuota: vidIQ completo (25) y corregir minutos con corregir_tiempos.py.")
    print("\nPROMPT PARA vidIQ (copiar tal cual):")
    print("Watch the whole video. Return at least 25 key moments in order. Each line: [M:SS] then what is VISIBLE on "
          "screen (apps, buttons, menus, shown text, files) and then, in double quotes, the EXACT sentence the speaker "
          "says at that moment in the original language. Always include the quoted sentence. Also list every on-screen "
          "text, name, price, number and URL you can read. Do not invent anything you cannot see or hear.")


if __name__ == "__main__":
    main()
