#!/usr/bin/env python3
"""Combo vidIQ (ve) + YTAPI (corrige) en un solo comando.

Los conectores (YTAPI, vidIQ) solo los puede llamar Claude, no un script. Por eso Claude guarda lo que
devuelven en una carpeta y este script hace TODO lo demás, sin gastar créditos:

  carpeta/transcripcion.srt   YTAPI get_transcript format=srt       (obligatorio)
  carpeta/descripcion.txt     descripción del video (capítulos)       (opcional)
  carpeta/mapa.txt            YTAPI get_video_heatmap                 (opcional)
  carpeta/vidiq.md            lo que devolvió vidIQ                   (opcional)

Uso:  python3 combo_video.py --carpeta DIR [--titulo "..."] [--duracion SEG]

Sin vidiq.md  -> imprime el plan (qué ver y con qué) y el prompt para vidIQ.
Con vidiq.md  -> corrige los minutos, detecta CONFLICTOS entre lo que se ve y lo que dicen los
                 subtítulos (nombres mal oídos, cifras que vidIQ no mencionó) y escribe
                 carpeta/informe.md listo para guardar en Obsidian y en el repo.
"""
import argparse, difflib, os, re, subprocess, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from corregir_tiempos import TS, a_seg, buscar, fmt, frases_de, indexar, parse_srt

TOK = re.compile(r"[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9_.,'-]*")
NUM = re.compile(r"\d[\d.,]*\s?(?:€|euros?|dólares|usd|\$|%|gb|mb)?", re.I)


def corregir(lineas, palabras, idx, umbral):
    filas = []
    for ln in lineas:
        m = TS.search(ln)
        if not m:
            continue
        ts = m.group(1)
        c = [buscar(f, palabras, idx) for f in frases_de(ln, ts)]
        c = [x for x in c if x]
        r = max(c, key=lambda x: (x["votos"] * x["confianza"], x["confianza"])) if c else None
        if not r or r["confianza"] < 0.25:
            filas.append({"orig": a_seg(ts), "real": None, "conf": r["confianza"] if r else 0, "linea": ln})
        else:
            filas.append({"orig": a_seg(ts), "real": r["seg"], "conf": r["confianza"], "linea": ln})
    return filas


def conflictos(filas, palabras):
    """Parejas pantalla↔subtítulo parecidas pero distintas (nombres de marcas, rótulos): el subtítulo automático
    suele oír mal los nombres propios. Solo se revisan palabras que parecen nombre (Mayúscula en medio de un
    rótulo, MAYÚSCULAS, guion bajo o dígitos); las palabras comunes y sus conjugaciones se ignoran."""
    parejas, vistos = [], set()
    for f in filas:
        t = f["real"] if f["real"] is not None else f["orig"]
        ventana = [w for s, w in palabras if t - 25 <= s <= t + 40]
        vocab = set(ventana)
        qs = re.findall(r"[\"“«]([^\"”»]{3,})[\"”»]", f["linea"])
        if len(qs) > 1:  # la más larga suele ser la frase hablada; el resto son rótulos de pantalla
            qs.remove(max(qs, key=len))
        for q in qs:
            for i, tk in enumerate(TOK.findall(q)):
                w = tk.lower().strip(".,'-:")
                nombre = (tk.isupper() and len(tk) > 2) or "_" in tk or any(c.isdigit() for c in tk) or (
                    i > 0 and tk[:1].isupper())
                if len(w) < 3 or not nombre or w in vocab or (w, t // 60) in vistos:
                    continue
                cerca = difflib.get_close_matches(w, vocab, n=1, cutoff=0.6)
                if cerca and cerca[0] != w:
                    vistos.add((w, t // 60))
                    parejas.append((t, tk.strip(".,:"), cerca[0]))
    return parejas


def cifras_omitidas(srt_texto, vidiq_texto):
    """Cifras con unidad (€, %, GB...) dichas en el video que vidIQ no menciona (una vez por cifra)."""
    limpio = " ".join(l for l in srt_texto.splitlines() if "-->" not in l and not l.strip().isdigit())
    en_v = set(re.sub(r"\D", "", x) for x in NUM.findall(vidiq_texto))
    out, vistos = [], set()
    for m in re.finditer(r"(\d[\d.,]*)\s?(€|euros?|dólares|%|gb|mb)", limpio, re.I):
        k = re.sub(r"\D", "", m.group(1))
        if k and k not in en_v and k not in vistos:
            vistos.add(k)
            out.append(m.group(0).strip())
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--carpeta", required=True)
    ap.add_argument("--titulo", default="")
    ap.add_argument("--duracion", type=float)
    ap.add_argument("--umbral", type=float, default=3)
    a = ap.parse_args()
    d = a.carpeta
    p = lambda n: os.path.join(d, n)
    if not os.path.exists(p("transcripcion.srt")):
        sys.exit("Falta " + p("transcripcion.srt") + " (YTAPI get_transcript con format=srt)")
    srt = open(p("transcripcion.srt"), encoding="utf-8", errors="ignore").read()
    palabras = parse_srt(srt)

    # 1) plan
    cmd = [sys.executable, os.path.join(os.path.dirname(os.path.abspath(__file__)), "ytapi_plan.py"), "--srt", p("transcripcion.srt")]
    for opt, f in (("--descripcion", "descripcion.txt"), ("--mapa", "mapa.txt")):
        if os.path.exists(p(f)):
            cmd += [opt, p(f)]
    if a.duracion:
        cmd += ["--duracion", str(a.duracion)]
    plan = subprocess.run(cmd, capture_output=True, text=True).stdout
    if not os.path.exists(p("vidiq.md")):
        print(plan)
        print("\nSiguiente paso: pasar el prompt a vidIQ, guardar su respuesta en", p("vidiq.md"), "y volver a correr este comando.")
        return

    # 2) corrección de minutos
    vid = open(p("vidiq.md"), encoding="utf-8", errors="ignore").read()
    filas = corregir(vid.splitlines(), palabras, indexar(palabras), a.umbral)
    ok = [f for f in filas if f["real"] is not None and abs(f["real"] - f["orig"]) <= a.umbral]
    mov = [f for f in filas if f["real"] is not None and abs(f["real"] - f["orig"]) > a.umbral]
    rev = [f for f in filas if f["real"] is None]
    peor = max((abs(f["real"] - f["orig"]) for f in filas if f["real"] is not None), default=0)

    # 3) conflictos y omisiones
    par = conflictos(filas, palabras)
    cif = cifras_omitidas(srt, vid)

    out = [f"# Combo vidIQ + YTAPI: {a.titulo or os.path.basename(os.path.abspath(d))}", "",
           "## Resumen de la corrección de minutos", "",
           f"- Momentos de vidIQ con minuto: **{len(filas)}**.",
           f"- Ya estaban bien (±{int(a.umbral)} s): **{len(ok)}**. Corregidos: **{len(mov)}**. A revisar (no aparecen en los subtítulos, "
           f"normalmente cosas que solo se ven): **{len(rev)}**.",
           f"- Mayor diferencia: **{int(peor)} s**.", "", "| vidIQ | real | diferencia | confianza | estado |", "|---|---|---|---|---|"]
    for f in filas:
        if f["real"] is None:
            out.append(f"| {fmt(f['orig'])} | - | - | {f['conf']} | revisar |")
        else:
            dif = int(round(f["real"] - f["orig"]))
            out.append(f"| {fmt(f['orig'])} | {fmt(f['real'])} | {dif:+d} s | {f['conf']} | {'ok' if abs(dif) <= a.umbral else 'corregido'} |")
    out += ["", "## Conflictos: lo que se ve contra lo que dice el subtítulo", ""]
    out += [f"- {fmt(t)}: en pantalla **{pan}** ↔ el subtítulo oyó «{sub}». Probable error del subtítulo automático: manda lo de pantalla."
            for t, pan, sub in par] or ["- Ninguno detectado."]
    out += ["", "## Cifras habladas que vidIQ no mencionó", ""]
    out += [f"- {c}" for c in cif[:25]] or ["- Ninguna."]
    out += ["", "## Plan de visión", "", "```", plan.strip(), "```", ""]
    open(p("informe.md"), "w", encoding="utf-8").write("\n".join(out))
    # vidIQ con minutos corregidos
    texto = vid
    for f in sorted(filas, key=lambda x: -x["orig"]):
        if f["real"] is not None and abs(f["real"] - f["orig"]) > a.umbral:
            texto = texto.replace(f"[{fmt(f['orig'])}]", f"[{fmt(f['real'])}]", 1)
    open(p("vidiq_corregido.md"), "w", encoding="utf-8").write(texto)
    print("\n".join(out[:12]))
    print(f"\nConflictos pantalla↔subtítulo: {len(par)}  ·  cifras que vidIQ no mencionó: {len(cif)}")
    for t, pan, sub in par[:10]:
        print(f"  {fmt(t)}  pantalla «{pan}» ↔ subtítulo «{sub}»")
    print("\nEscrito:", p("informe.md"), "y", p("vidiq_corregido.md"))


if __name__ == "__main__":
    main()
