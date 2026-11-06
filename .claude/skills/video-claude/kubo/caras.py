"""Caras 2D de los personajes de Kubo (PNG con transparencia que se pegan al frente de la cabeza).

Cada expresión sale en dos versiones: boca cerrada («_0») y boca abierta («_1», para hablar). Diseño propio:
ojos ovalados con brillo, cejas gruesas y boca de caricatura.

    python3 caras.py carpeta_salida          → crea <expresion>_0.png y <expresion>_1.png
"""
import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw

T = 512           # lado de la imagen
N = (25, 20, 20, 255)      # tinta
BOCA = (120, 20, 30, 255)
LENGUA = (235, 90, 110, 255)
BLANCO = (255, 255, 255, 255)
ROSA = (255, 120, 150, 110)

# ojo: forma («ovalo», «feliz» = arco ^, «cerrado» = línea, «grande», «espiral», «x», «estrella»)
# ceja: (ángulo en grados, alto); boca: forma
EXPRESIONES = {
    "normal":    dict(ojo="ovalo", ceja=(0, 0), boca="linea"),
    "feliz":     dict(ojo="ovalo", ceja=(-8, 6), boca="sonrisa"),
    "risa":      dict(ojo="feliz", ceja=(-10, 10), boca="carcajada", mejillas=True),
    "triste":    dict(ojo="ovalo", ceja=(-22, 0), boca="triste", lagrima=True),
    "enojado":   dict(ojo="ovalo", ceja=(28, -12), boca="enojo"),
    "sorpresa":  dict(ojo="grande", ceja=(-5, 26), boca="o"),
    "miedo":     dict(ojo="grande", ceja=(-25, 18), boca="miedo", sudor=True),
    "extasis":   dict(ojo="estrella", ceja=(-10, 16), boca="sonrisa", mejillas=True),
    "malvado":   dict(ojo="ovalo", ceja=(30, -6), boca="malvada"),
    "sospecha":  dict(ojo="entrecerrado", ceja=(15, -4), boca="ladeada"),
    "grito":     dict(ojo="grande", ceja=(-20, 30), boca="grito"),
    "dormido":   dict(ojo="cerrado", ceja=(0, -4), boca="linea"),
    "mareado":   dict(ojo="espiral", ceja=(0, 8), boca="ladeada"),
    "ko":        dict(ojo="x", ceja=(0, 0), boca="o"),
    "enamorado": dict(ojo="corazon", ceja=(-8, 8), boca="sonrisa", mejillas=True),
    "pensando":  dict(ojo="ovalo", ceja=(12, 10), boca="ladeada"),
}


def _ojo(d, cx, cy, tipo, lado, mirada=0):
    cx += mirada * 24                    # mirada: -1 izquierda, +1 derecha (los ojos voltean hacia el otro)
    if tipo in ("ovalo", "grande", "entrecerrado"):
        rx, ry = (34, 50) if tipo == "ovalo" else (46, 62) if tipo == "grande" else (36, 20)
        d.ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=N)
        b = 13 if tipo != "entrecerrado" else 7
        bx = cx + rx * 0.35 * mirada if mirada else cx - rx * 0.35      # el brillo se va al lado hacia donde mira
        d.ellipse((bx - b, cy - ry * 0.45 - b, bx + b, cy - ry * 0.45 + b), fill=BLANCO)
    elif tipo == "feliz":
        d.arc((cx - 38, cy - 30, cx + 38, cy + 40), 200, 340, fill=N, width=16)
    elif tipo == "cerrado":
        d.arc((cx - 36, cy - 40, cx + 36, cy + 20), 20, 160, fill=N, width=14)
    elif tipo == "x":
        for a, b in (((-28, -28), (28, 28)), ((-28, 28), (28, -28))):
            d.line((cx + a[0], cy + a[1], cx + b[0], cy + b[1]), fill=N, width=16)
    elif tipo == "espiral":
        pts = [(cx + r * math.cos(r / 6), cy + r * math.sin(r / 6)) for r in range(2, 44)]
        d.line(pts, fill=N, width=8)
    elif tipo == "estrella":
        pts = [(cx + (46 if k % 2 == 0 else 20) * math.cos(math.pi / 2 + k * math.pi / 5),
                cy - (46 if k % 2 == 0 else 20) * math.sin(math.pi / 2 + k * math.pi / 5)) for k in range(10)]
        d.polygon(pts, fill=(255, 215, 40, 255), outline=N, width=6)
    elif tipo == "corazon":
        d.ellipse((cx - 36, cy - 30, cx, cy + 6), fill=(230, 40, 70, 255))
        d.ellipse((cx, cy - 30, cx + 36, cy + 6), fill=(230, 40, 70, 255))
        d.polygon([(cx - 35, cy - 4), (cx + 35, cy - 4), (cx, cy + 40)], fill=(230, 40, 70, 255))


def _ceja(d, cx, cy, ang, alto, lado):
    a = math.radians(ang) * (1 if lado < 0 else -1)
    largo = 46
    x1, y1 = cx - largo * math.cos(a), cy - alto - 78 - largo * math.sin(a)
    x2, y2 = cx + largo * math.cos(a), cy - alto - 78 + largo * math.sin(a)
    d.line((x1, y1, x2, y2), fill=N, width=18)
    for x, y in ((x1, y1), (x2, y2)):
        d.ellipse((x - 9, y - 9, x + 9, y + 9), fill=N)


def _boca(d, tipo, abierta):
    cx, cy = T // 2, 365
    if abierta and tipo in ("linea", "sonrisa", "enojo", "ladeada", "triste", "malvada"):
        tipo = {"triste": "o", "enojo": "grito_chico", "malvada": "carcajada"}.get(tipo, "hablar")
    if tipo == "linea":
        d.line((cx - 45, cy, cx + 45, cy), fill=N, width=14)
    elif tipo == "sonrisa":
        d.arc((cx - 80, cy - 70, cx + 80, cy + 40), 20, 160, fill=N, width=16)
    elif tipo == "triste":
        d.arc((cx - 60, cy, cx + 60, cy + 70), 200, 340, fill=N, width=14)
    elif tipo == "enojo":
        d.line((cx - 55, cy + 10, cx + 55, cy - 4), fill=N, width=14)
    elif tipo == "ladeada":
        d.arc((cx - 70, cy - 50, cx + 50, cy + 25), 30, 120, fill=N, width=14)
    elif tipo == "malvada":
        d.chord((cx - 90, cy - 60, cx + 90, cy + 50), 10, 170, fill=N)
        for k in range(-3, 4):
            d.rectangle((cx + k * 24 - 9, cy - 6, cx + k * 24 + 9, cy + 10), fill=BLANCO)
    elif tipo in ("hablar", "carcajada", "o", "grito", "miedo", "grito_chico"):
        rx, ry = {"hablar": (50, 34), "carcajada": (75, 55), "o": (30, 36), "grito": (85, 105),
                  "miedo": (60, 30), "grito_chico": (55, 40)}[tipo]
        if abierta and tipo in ("o", "miedo"):
            ry += 14
        caja = (cx - rx, cy - ry * 0.6, cx + rx, cy + ry * 1.2)
        if tipo == "carcajada":
            d.chord(caja, 0, 180, fill=BOCA, outline=N, width=10)
        else:
            d.ellipse(caja, fill=BOCA, outline=N, width=10)
        if tipo in ("hablar", "carcajada", "grito", "grito_chico"):
            lx, ly = cx, caja[3] - ry * 0.35
            d.ellipse((lx - rx * 0.55, ly - ry * 0.35, lx + rx * 0.55, ly + ry * 0.3), fill=LENGUA)
        if tipo == "miedo":
            d.line((caja[0] + 12, cy + ry * 0.3, caja[2] - 12, cy + ry * 0.3), fill=BLANCO, width=8)


def cara(expresion, abierta=False, parpadeo=False, mirada=0):
    e = dict(EXPRESIONES[expresion])
    if parpadeo and e["ojo"] in ("ovalo", "grande", "entrecerrado", "estrella", "corazon"):
        e["ojo"] = "cerrado"
    im = Image.new("RGBA", (T, T), (0, 0, 0, 0))
    d = ImageDraw.Draw(im, "RGBA")
    if e.get("mejillas"):
        for cx in (130, 382):
            d.ellipse((cx - 42, 290, cx + 42, 330), fill=ROSA)
    for lado, cx in ((-1, 180), (1, 332)):
        _ojo(d, cx, 220, e["ojo"], lado, mirada)
        _ceja(d, cx, 220, *e["ceja"], lado)
    if e.get("lagrima"):
        d.ellipse((140, 280, 170, 330), fill=(90, 170, 255, 230))
    if e.get("sudor"):
        d.ellipse((400, 120, 430, 175), fill=(120, 190, 255, 230))
    _boca(d, e["boca"], abierta)
    return im


def sombra(tam=256):
    """Mancha suave para la sombra de contacto bajo los pies."""
    im = Image.new("RGBA", (tam, tam), (0, 0, 0, 0))
    px = im.load()
    for y in range(tam):
        for x in range(tam):
            r = math.hypot(x - tam / 2, y - tam / 2) / (tam / 2)
            px[x, y] = (20, 15, 10, int(150 * max(0, 1 - r) ** 1.6))
    return im


def generar(destino):
    destino = Path(destino)
    destino.mkdir(parents=True, exist_ok=True)
    sombra().save(destino / "sombra.png")
    for nombre in EXPRESIONES:
        for ab in (0, 1):
            for m, suf in ((0, ""), (-1, "i"), (1, "d")):          # mirada al frente, izquierda, derecha
                cara(nombre, bool(ab), mirada=m).save(destino / f"{nombre}_{ab}{suf}.png")
                cara(nombre, bool(ab), True, m).save(destino / f"{nombre}_{ab}p{suf}.png")      # parpadeo
    return destino


if __name__ == "__main__":
    out = generar(sys.argv[1] if len(sys.argv) > 1 else "caras")
    hoja = Image.new("RGBA", (T // 2 * 8, T // 2 * 4), (255, 210, 60, 255))
    for i, n in enumerate(EXPRESIONES):
        for ab in (0, 1):
            k = i * 2 + ab
            hoja.alpha_composite(cara(n, bool(ab)).resize((T // 2, T // 2)), ((k % 8) * T // 2, (k // 8) * T // 2))
    hoja.convert("RGB").save(out / "_hoja.jpg", quality=85)
    print(out)
