"""Genera plan.json del episodio «La guerra de los emús» para el motor 2.5D, sincronizado con la voz (voz_tiempos.json).
    python3 hacer_plan.py   ->  plan.json  (luego: node .../motor25d/motor25d.mjs plan.json episodio.mp4)"""
import json
from pathlib import Path

AQUI = Path(__file__).parent
V = json.loads((AQUI / "voz_tiempos.json").read_text())
L = {l["n"]: l for l in V}


def tw(n, palabra, k=0):
    """Segundo en que empieza la palabra (k-ésima coincidencia) de la línea n."""
    c = [w for w in L[n]["palabras"] if w["w"].lower().strip(".,?!:…") .startswith(palabra.lower())]
    return round(c[k]["t"], 3)


ini = lambda n: L[n]["inicio"]  # noqa: E731
fin = lambda n: round(L[n]["inicio"] + L[n]["dur"], 3)  # noqa: E731
DUR = round(fin(15) + 0.6, 2)

# --- lugares del mundo
KUBO, GRANJA, CAMINO = [40, 0, 0], [-20, 0, 0], 6
HATO = [[-3.2, 0, -1.0], [-1.2, 0, -2.6], [0.8, 0, -1.4], [2.6, 0, -4.8], [-2.4, 0, -4.2], [0.2, 0, -5.6],
        [3.6, 0, -1.8], [-4.6, 0, -2.8], [1.8, 0, -7.2], [-0.8, 0, 0.4]]
SALIDA = [[-14, 0, 3], [-9, 0, -16], [6, 0, -18], [16, 0, -12], [-16, 0, -12], [2, 0, -22], [18, 0, 2], [-18, 0, -4], [12, 0, -20], [-6, 0, 10]]

elenco = []
for i, (p, s) in enumerate(zip(HATO, SALIDA)):
    t0 = ini(7) + 0.5 + (i % 4) * 0.12
    elenco.append({"tipo": "emu", "alto": 1.9 + (i % 3) * 0.15, "pos": p, "semilla": i * 0.7, "espejo": i % 2 == 0,
                   "estados": [{"t": 0, "accion": "picotear", "cara": "normal"}, {"t": t0, "accion": "correr", "cara": "alarma"},
                               {"t": ini(10) - 0.2, "accion": "picotear", "cara": "normal"}, {"t": ini(13), "accion": "correr", "cara": "normal"}],
                   "ruta": [{"t": 0, "pos": p}, {"t": t0, "pos": p}, {"t": fin(7), "pos": s}, {"t": ini(10) - 0.3, "pos": s},
                            {"t": ini(10) - 0.2, "pos": p}, {"t": ini(13), "pos": p},
                            {"t": fin(13), "pos": [p[0] + (1 if i % 2 else -1) * 1.5, 0, p[2] + 0.5]}]})
# vigía en su roca, emú tranquilo de la cita, granjeros y Kubo
elenco += [
    {"tipo": "emu", "alto": 2.4, "pos": [2.2, 1.25, -3], "semilla": 2.1,
     "estados": [{"t": 0, "accion": "quieto"}, {"t": tw(8, "warned") - 0.1, "cara": "alarma"}, {"t": fin(8) + 0.2, "cara": "normal"}]},
    {"tipo": "emu", "alto": 2.2, "pos": [10, 0, -2], "semilla": 3.3, "visible": [[ini(12) - 0.1, fin(12) + 0.1]],
     "estados": [{"t": 0, "accion": "correr"}], "ruta": [{"t": ini(12), "pos": [8, 0, -2]}, {"t": fin(12), "pos": [13, 0, -2]}]},
    {"tipo": "granjero", "alto": 2.1, "pos": [GRANJA[0] - 0.55, 0, 0.3], "semilla": 0.5, "estados": [{"t": 0, "cara": "serio"}]},
    {"tipo": "granjero", "alto": 2.0, "pos": [GRANJA[0] + 0.55, 0, -0.2], "semilla": 1.7, "espejo": True, "estados": [{"t": 0, "cara": "serio"}]},
    {"tipo": "kubo", "alto": 2.0, "pos": KUBO, "habla": True, "semilla": 0.2,
     "estados": [{"t": 0, "casco": True}, {"t": ini(6), "cara": "guiño", "casco": False}, {"t": fin(6), "cara": "normal"},
                 {"t": ini(14), "accion": "señalar"}, {"t": ini(15), "accion": "quieto"}]},
]
objetos = [{"tipo": "camion", "escala": 1.1, "giro": 0, "pos": [-40, 0, CAMINO],
            "ruta": [{"t": 0, "pos": [-40, 0, CAMINO]}, {"t": ini(5) - 0.6, "pos": [-33, 0, CAMINO]}, {"t": tw(5, "major"), "pos": [-23, 0, CAMINO]},
                     {"t": ini(9), "pos": [-23, 0, CAMINO]}, {"t": fin(9), "pos": [-38, 0, CAMINO]}]}]

def toma(t, pos, mira, fov, corte=True):
    return {"t": t, "pos": pos, "mira": mira, "fov": fov, **({"corte": True} if corte else {})}

def plano_kubo(t0, t1, acerca=0.6):
    return [toma(t0, [KUBO[0], 1.9, 4.6], [KUBO[0], 1.45, 0], 40), toma(t1, [KUBO[0], 1.85, 4.6 - acerca], [KUBO[0], 1.45, 0], 38, False)]

camara = []
camara += [toma(0, [KUBO[0], 1.9, 4.6], [KUBO[0], 1.45, 0], 40, False), toma(fin(1), [KUBO[0], 1.85, 3.9], [KUBO[0], 1.45, 0], 38, False)]
camara += [toma(ini(2) - 0.15, [0, 9, 12], [0, 0.5, -3], 46), toma(fin(2), [0, 8, 10], [0, 0.6, -3], 44, False)]
camara += [toma(ini(3) - 0.15, [-3, 1.6, 2.8], [-4, 1.0, -6], 40), toma(fin(3), [-2.6, 1.5, 2.0], [-4, 1.0, -6], 38, False)]
camara += [toma(ini(4) - 0.15, [GRANJA[0], 1.8, 5.2], [GRANJA[0], 1.4, 0], 42), toma(fin(4), [GRANJA[0], 1.75, 4.5], [GRANJA[0], 1.4, 0], 40, False)]
camara += [toma(ini(5) - 0.15, [-17, 2.4, 13], [-24, 1.0, CAMINO], 44), toma(fin(5), [-18, 2.2, 11.5], [-23, 1.0, CAMINO], 42, False)]
camara += plano_kubo(ini(6) - 0.15, fin(6), 0.9)
camara += [toma(ini(7) - 0.15, [0, 10, 9], [0, 0, -5], 52), toma(fin(7), [0, 13, 11], [0, 0, -6], 58, False)]
camara += [toma(ini(8) - 0.15, [3.6, 3.3, 0.8], [2.3, 3.2, -3], 30), toma(fin(8), [3.3, 3.3, 1.4], [2.3, 3.2, -3], 28, False)]
camara += [toma(ini(9) - 0.15, [-24, 2.6, 16], [-25, 1.0, CAMINO], 46), toma(fin(9), [-27, 2.4, 15], [-33, 1.0, CAMINO], 46, False)]
camara += [toma(ini(10) - 0.15, [0, 6, 11], [0, 0.8, -3], 48), toma(fin(10), [0, 5.2, 9], [0, 0.8, -3], 46, False)]
camara += [toma(ini(11) - 0.15, [1.5, 2.4, 5.5], [-0.5, 1.2, -3], 42), toma(fin(11), [1.2, 2.2, 4.4], [-0.5, 1.2, -3], 40, False)]
camara += [toma(ini(12) - 0.15, [10.5, 1.6, 4.5], [10.5, 1.3, -2], 40), toma(fin(12), [11.5, 1.6, 4.2], [11.5, 1.3, -2], 40, False)]
camara += [toma(ini(13) - 0.15, [0, 4.5, 9], [0, 1.0, -3], 46), toma(fin(13), [0, 3.8, 7.5], [0, 1.0, -3], 44, False)]
camara += plano_kubo(ini(14) - 0.15, fin(14), 0.5)
camara += plano_kubo(ini(15) - 0.15, DUR, 0.8)
cortes = sorted({round(k["t"], 3) for k in camara if k.get("corte")})

textos = [
    {"t0": tw(1, "nineteen"), "t1": fin(1), "texto": "1932", "x": .5, "y": .18, "tam": .16},
    {"t0": tw(1, "lost"), "t1": fin(1) + .3, "texto": "...AND LOST", "x": .5, "y": .32, "tam": .10, "color": "#ff5a4e", "rot": -6},
    {"t0": tw(2, "twenty"), "t1": fin(2), "texto": "", "contar": {"de": 0, "a": 20000, "dur": 1.2}, "x": .5, "y": .2, "tam": .15},
    {"t0": tw(2, "emus"), "t1": fin(2), "texto": "EMUS", "x": .5, "y": .3, "tam": .08, "color": "#ffffff"},
    {"t0": tw(4, "machine"), "t1": fin(4), "texto": "MACHINE GUNS?!", "x": .5, "y": .2, "tam": .085, "color": "#ff8a3d", "rot": -4},
    {"t0": tw(5, "two"), "t1": fin(5), "texto": "x2 GUNS", "x": .3, "y": .2, "tam": .08},
    {"t0": tw(5, "ten"), "t1": fin(5), "texto": "10,000 BULLETS", "x": .58, "y": .3, "tam": .075, "color": "#ffffff"},
    {"t0": ini(6), "t1": fin(6), "texto": "EASY?", "x": .5, "y": .2, "tam": .12},
    {"t0": tw(7, "wrong"), "t1": tw(7, "wrong") + 1.0, "texto": "WRONG", "x": .5, "y": .22, "tam": .14, "color": "#ff5a4e", "rot": 5},
    {"t0": tw(9, "six"), "t1": fin(9), "texto": "DAY 6: RETREAT", "x": .5, "y": .2, "tam": .085},
    {"t0": tw(10, "nine"), "t1": fin(10), "texto": "", "contar": {"de": 0, "a": 986, "dur": 2.2, "sufijo": " EMUS"}, "x": .5, "y": .2, "tam": .12},
    {"t0": tw(11, "nine"), "t1": fin(11), "texto": "9,860 BULLETS", "x": .5, "y": .16, "tam": .09, "color": "#ffffff"},
    {"t0": tw(11, "exactly"), "t1": fin(11), "texto": "/ 986 EMUS", "x": .5, "y": .25, "tam": .09, "color": "#ffffff"},
    {"t0": tw(11, "ten"), "t1": fin(11), "texto": "= 10 PER EMU", "x": .5, "y": .36, "tam": .11, "rot": -3},
    {"t0": tw(12, "invulnerability"), "t1": fin(12), "texto": "“LIKE TANKS”", "x": .5, "y": .2, "tam": .11},
    {"t0": tw(13, "won"), "t1": fin(13), "texto": "EMUS 1 - ARMY 0", "x": .5, "y": .2, "tam": .095},
    {"t0": tw(14, "send"), "t1": fin(14), "texto": "SEND THIS", "x": .5, "y": .17, "tam": .11},
    {"t0": tw(14, "can't"), "t1": fin(14), "texto": "“IT CAN'T BE THAT HARD”", "x": .5, "y": .27, "tam": .06, "color": "#ffffff"},
    {"t0": tw(15, "what"), "t1": DUR, "texto": "DUCK?  GOOSE?  OSTRICH?", "x": .5, "y": .2, "tam": .065},
    {"t0": tw(15, "comments"), "t1": DUR, "texto": "COMMENT BELOW", "x": .5, "y": .29, "tam": .07, "color": "#ffffff"},
]
fx = [{"t": tw(4, "machine"), "id": "ui/exclamation", "pos": [GRANJA[0], 3.1, 0], "alto": 0.8},
      {"t": tw(8, "warned") - 0.1, "id": "ui/exclamation", "pos": [2.75, 3.95, -2.9], "alto": 0.7},
      {"t": tw(11, "ten"), "id": "ui/confetti", "pos": [-0.5, 2.0, -1.5], "alto": 3.0},
      {"t": tw(13, "won"), "id": "ui/confetti", "pos": [0, 2.2, -2.5], "alto": 4.0},
      {"t": tw(1, "lost"), "id": "explosions/cartoon-pow", "pos": [KUBO[0] + 0.9, 2.4, 0.5], "alto": 1.0}]
sonidos = [{"t": c - 0.18, "id": "swish/flick", "vol": 0.45} for c in cortes if c > 0.5]
sonidos += [{"t": x["t0"], "id": "drip/bloop", "vol": 0.5} for x in textos]
sonidos += [{"t": tw(1, "lost"), "id": "cut_hit/kick", "vol": 0.9}, {"t": tw(7, "wrong"), "id": "cut_hit/punch", "vol": 0.9},
            {"t": tw(8, "warned"), "id": "cut_hit/air", "vol": 0.7}, {"t": tw(11, "ten"), "id": "cut_hit/kick", "vol": 0.9},
            {"t": tw(12, "tanks"), "id": "cut_hit/rumble", "vol": 0.8}, {"t": tw(13, "won"), "id": "pro_whoosh_big/swell", "vol": 0.6}]

plan = {"nombre": "Kubo narra: La guerra de los emús (EN)", "ancho": 540, "alto": 960, "fps": 30, "duracion": DUR,
        "luz": {"cielo_arriba": "#6c5fa8", "horizonte": "#ffc98a", "sombra": "#4a3f78", "sol": "#ffd4a0", "fuerza_sol": 2.6,
                "sol_az": 150, "sol_el": 22, "relleno": 0.9, "niebla": [25, 160], "tinta_tarjetas": "#fff1e0"},
        "mundo": {"suelo": "#d9a040", "espigas": ["#f0c060", "#b87a28", "#e8b04c", "#a86a24"], "espiga_cerca": "#e2a83c", "n_espigas": 3000,
                  "colinas": [[-70, -170, 45, "#c48a52"], [60, -190, 55, "#b37a4a"], [0, -220, 70, "#9c6c4a"]],
                  "rocas": [[2.2, -3, 0.9], [-6, -12, 1.4], [8, -16, 1.1], [43, -3, 1.0]],
                  "cercas": [{"x": -8, "z": -8, "n": 7, "rota": 4}, {"x": -26, "z": -2.5, "n": 6}]},
        "elenco": elenco, "objetos": objetos, "camara": camara, "sacudidas": [tw(1, "lost"), tw(7, "wrong"), tw(11, "ten")],
        "fx": fx, "sonidos": sonidos, "textos": textos, "voz": V, "voz_archivo": "voz_en.wav", "voz_volumen": 1.0}
(AQUI / "plan.json").write_text(json.dumps(plan, ensure_ascii=False, indent=1))
print(f"plan.json: {DUR} s, {len(camara)} llaves de cámara, {len(cortes)} cortes, {len(textos)} textos, {len(sonidos)} sonidos")
