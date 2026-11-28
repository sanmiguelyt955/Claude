#!/usr/bin/env python3
"""Corrige los minutos de lo que dijo vidIQ usando la transcripción exacta de YTAPI.

Idea: vidIQ VE el video (imagen + audio) pero en videos largos pone mal los minutos.
YTAPI trae los subtítulos con el tiempo exacto de cada línea (formato SRT).
Para cada línea de vidIQ que tenga un minuto y una frase, buscamos esa frase en el SRT
y ponemos el minuto real. Todo es local: no gasta créditos ni usa red.

Uso:
  corregir_tiempos.py --srt transcripcion.srt --vidiq lo_de_vidiq.md [--salida corregido.md] [--umbral 5]

Formato de lo_de_vidiq.md: cualquier texto con líneas que empiecen con (o contengan) un minuto
M:SS o H:MM:SS (opcional entre corchetes) y la frase o el resumen de ese momento. Las comillas
(" ' « ») se usan como frase exacta; si no hay, se usa todo el texto de la línea.

Por qué la frase de vidIQ puede no coincidir palabra por palabra: los subtítulos automáticos de
YouTube cambian palabras. Por eso se compara por tríos de palabras y se da una confianza (0 a 1).
Con confianza baja (< 0.25) NO se cambia el minuto: se marca «revisar».
"""
import argparse, json, re, sys
from collections import defaultdict

TS = re.compile(r"(?<![\d:])(\d{1,2}:\d{2}(?::\d{2})?)(?![\d:])")
CUE = re.compile(r"(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})")
WORD = re.compile(r"[a-z0-9áéíóúüñç']+")


def toks(txt):
    return WORD.findall(txt.lower())


def parse_srt(texto):
    """Lista de (segundo_de_inicio, palabra). Tolera encabezados y cortes a medias."""
    palabras, lineas = [], texto.splitlines()
    i = 0
    while i < len(lineas):
        m = CUE.search(lineas[i])
        if not m:
            i += 1
            continue
        h, mi, s, ms = (int(x) for x in m.groups()[:4])
        t0 = h * 3600 + mi * 60 + s + ms / 1000
        i += 1
        buf = []
        while i < len(lineas) and lineas[i].strip() and not CUE.search(lineas[i]):
            buf.append(lineas[i])
            i += 1
        # el número del cue anterior queda pegado al final del bloque anterior: se ignora si es solo dígitos
        buf = [b for b in buf if not b.strip().isdigit()]
        ws = toks(" ".join(buf))
        for k, w in enumerate(ws):
            palabras.append((t0, w))
    # los cues del SRT de YouTube se traslapan: ordenamos por tiempo (estable)
    palabras.sort(key=lambda x: x[0])
    return palabras


def indexar(palabras, n=3):
    idx = defaultdict(list)
    ws = [w for _, w in palabras]
    for p in range(len(ws) - n + 1):
        idx[tuple(ws[p:p + n])].append(p)
    return idx


def buscar(frase, palabras, idx, n=3):
    q = toks(frase)
    if len(q) < n:
        return None
    votos = defaultdict(int)
    for k in range(len(q) - n + 1):
        for p in idx.get(tuple(q[k:k + n]), ()):
            votos[p - k] += 1
    if not votos:
        return None
    # agrupa inicios cercanos (±6 palabras) para tolerar palabras cambiadas
    mejor, mejor_v = None, 0
    for p in votos:
        v = sum(c for p2, c in votos.items() if abs(p2 - p) <= 6)
        if v > mejor_v:
            mejor, mejor_v = p, v
    total = max(1, len(q) - n + 1)
    p = max(0, min(mejor, len(palabras) - 1))
    return {"seg": palabras[p][0], "confianza": round(min(1.0, mejor_v / total), 2)}


def a_seg(ts):
    p = [int(x) for x in ts.split(":")]
    return p[0] * 3600 + p[1] * 60 + p[2] if len(p) == 3 else p[0] * 60 + p[1]


def fmt(s):
    s = int(round(s))
    return f"{s // 3600}:{s % 3600 // 60:02d}:{s % 60:02d}" if s >= 3600 else f"{s // 60}:{s % 60:02d}"


def frase_de(linea, ts):
    q = re.findall(r"[\"“«'‘]([^\"”»'’]{12,})[\"”»'’]", linea)
    if q:
        return " ".join(q)
    return linea.replace(ts, " ")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--srt", required=True)
    ap.add_argument("--vidiq", required=True)
    ap.add_argument("--salida")
    ap.add_argument("--umbral", type=float, default=5, help="segundos de diferencia para avisar (5)")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()

    palabras = parse_srt(open(a.srt, encoding="utf-8", errors="ignore").read())
    if len(palabras) < 20:
        sys.exit("No encontré subtítulos SRT en " + a.srt)
    idx = indexar(palabras)
    fin = palabras[-1][0]
    filas, salida = [], []
    for linea in open(a.vidiq, encoding="utf-8", errors="ignore").read().splitlines():
        m = TS.search(linea)
        if not m:
            salida.append(linea)
            continue
        ts = m.group(1)
        r = buscar(frase_de(linea, ts), palabras, idx)
        orig = a_seg(ts)
        if not r or r["confianza"] < 0.25:
            filas.append({"original": ts, "corregido": None, "dif_s": None, "confianza": r["confianza"] if r else 0,
                          "estado": "revisar", "linea": linea.strip()[:90]})
            salida.append(linea + "  ⚠️ revisar")
            continue
        nuevo = r["seg"]
        dif = nuevo - orig
        estado = "ok" if abs(dif) <= a.umbral else "corregido"
        filas.append({"original": ts, "corregido": fmt(nuevo), "dif_s": round(dif), "confianza": r["confianza"],
                      "estado": estado, "linea": linea.strip()[:90]})
        salida.append(linea.replace(ts, fmt(nuevo), 1) if estado == "corregido" else linea)
    if a.salida:
        open(a.salida, "w", encoding="utf-8").write("\n".join(salida) + "\n")
    if a.json:
        print(json.dumps(filas, ensure_ascii=False, indent=1))
        return
    print(f"SRT: {len(palabras)} palabras, hasta {fmt(fin)}.  Líneas con minuto: {len(filas)}")
    print(f"{'vidIQ':>8} {'real':>8} {'dif':>7} {'conf':>5}  estado     texto")
    for f in filas:
        print(f"{f['original']:>8} {f['corregido'] or '-':>8} {('%+ds' % f['dif_s']) if f['dif_s'] is not None else '-':>7} "
              f"{f['confianza']:>5}  {f['estado']:<9}  {f['linea']}")
    n = lambda e: sum(1 for f in filas if f["estado"] == e)
    print(f"\nok: {n('ok')}  corregidos: {n('corregido')}  a revisar: {n('revisar')}")


if __name__ == "__main__":
    main()
