#!/usr/bin/env python3
"""Mide un video de REFERENCIA y lo convierte en ajustes para el motor 2.5D (idea de Daniel Alcaide: dale una
referencia a Claude para que no salga «genérico»). Mide paleta, luz, ritmo de cortes y movimiento de cámara.

    python3 medir_referencia.py referencia.mp4 [--plan planes/x.json]   # --plan: escribe la luz y el ritmo en ese plan
Salida JSON: {paleta [hex], cielo_arriba, horizonte, sombra, brillo, saturacion, cortes_por_min, toma_media_s,
              movimiento (0 quieto - 1 mucho), sugerencias}
Usa la referencia SOLO para medir el estilo; nunca copiar su contenido ni publicarla.
"""
import json
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageStat


def cuadros(video, fps=4, ancho=160):
    d = Path(tempfile.mkdtemp())
    subprocess.run(["ffmpeg", "-v", "error", "-i", video, "-vf", f"fps={fps},scale={ancho}:-2", str(d / "c_%05d.png")], check=True)
    return [Image.open(p).convert("RGB") for p in sorted(d.glob("c_*.png"))], fps


def hexa(c):
    return "#%02x%02x%02x" % tuple(int(x) for x in c)


def medir(video):
    fr, fps = cuadros(video)
    if not fr:
        sys.exit("No salieron cuadros del video")
    mosaico = Image.new("RGB", (fr[0].width, fr[0].height * min(len(fr), 40)))
    paso = max(1, len(fr) // 40)
    for i, f in enumerate(fr[::paso][:40]):
        mosaico.paste(f, (0, i * f.height))
    pal = mosaico.quantize(8, method=Image.Quantize.MEDIANCUT).convert("RGB").getcolors(10 ** 7)
    pal = [c for _, c in sorted(pal, reverse=True)][:8]
    arriba = [ImageStat.Stat(f.crop((0, 0, f.width, f.height // 6))).mean for f in fr]
    medio = [ImageStat.Stat(f.crop((0, f.height * 2 // 5, f.width, f.height // 2))).mean for f in fr]
    prom = lambda xs: [sum(c[i] for c in xs) / len(xs) for i in range(3)]  # noqa: E731
    oscuros = sorted(pal, key=sum)[:2]
    hsv = [ImageStat.Stat(f.convert("HSV")).mean for f in fr]
    difs, cortes = [], 0
    for a, b in zip(fr, fr[1:]):
        g1, g2 = a.convert("L").resize((32, 18)), b.convert("L").resize((32, 18))
        d = sum(abs(x - y) for x, y in zip(g1.tobytes(), g2.tobytes())) / (32 * 18)
        difs.append(d)
        cortes += d > 28
    dur = len(fr) / fps
    mov = sorted(difs)[len(difs) // 2] / 20 if difs else 0
    r = {"duracion_s": round(dur, 1), "paleta": [hexa(c) for c in pal], "cielo_arriba": hexa(prom(arriba)),
         "horizonte": hexa(prom(medio)), "sombra": hexa(oscuros[0]),
         "brillo": round(sum(h[2] for h in hsv) / len(hsv) / 255, 2), "saturacion": round(sum(h[1] for h in hsv) / len(hsv) / 255, 2),
         "cortes_por_min": round(cortes / dur * 60, 1), "toma_media_s": round(dur / (cortes + 1), 2), "movimiento": round(min(1, mov), 2)}
    s = []
    s.append("cámara casi quieta: holds largos con empuje lento" if r["movimiento"] < .25 else
             "cámara viva: deslizamientos de 18-40 cuadros en cada toma" if r["movimiento"] < .6 else "cámara muy movida: barridos y sacudidas")
    s.append(f"una toma cada ~{r['toma_media_s']} s ({r['cortes_por_min']} cortes por minuto)")
    s.append("colores muy saturados" if r["saturacion"] > .5 else "colores suaves/apagados")
    r["sugerencias"] = s
    return r


if __name__ == "__main__":
    a = sys.argv[1:]
    if not a:
        sys.exit(__doc__)
    res = medir(a[0])
    if "--plan" in a:
        p = Path(a[a.index("--plan") + 1]); plan = json.loads(p.read_text())
        plan.setdefault("luz", {}).update(cielo_arriba=res["cielo_arriba"], horizonte=res["horizonte"], sombra=res["sombra"])
        plan["referencia"] = {k: res[k] for k in ("paleta", "toma_media_s", "movimiento", "sugerencias")}
        p.write_text(json.dumps(plan, ensure_ascii=False, indent=1))
    print(json.dumps(res, ensure_ascii=False, indent=1))
