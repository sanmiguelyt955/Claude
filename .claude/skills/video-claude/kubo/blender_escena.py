"""Kubo · conector de Blender: convierte un plan (JSON de tomas) en cuadros PNG con Blender sin interfaz.

    blender -b -P blender_escena.py -- plan.json carpeta_cuadros carpeta_caras [--calidad borrador|normal|final]
                                       [--tomas 1-3] [--control]

Estilo «cabezón»: personajes de bloques con cabeza grande y cara 2D intercambiable (caras.py), escenarios y
objetos hechos con figuras básicas, motor Workbench (rápido en CPU) con sombras, contorno y colores planos.
--control: un solo cuadro (la mitad) de cada toma, para revisar el plan antes del render completo.

Formato del plan: ver references/kubo.md (personajes, tomas: dur, escenario, camara, actores, props, …).
"""
import json
import math
import random
import sys
from pathlib import Path

import bpy
from mathutils import Vector

ARGS = sys.argv[sys.argv.index("--") + 1:]
PLAN, SALIDA, CARAS = Path(ARGS[0]), Path(ARGS[1]), Path(ARGS[2])
CALIDAD = ARGS[ARGS.index("--calidad") + 1] if "--calidad" in ARGS else "normal"
CONTROL = "--control" in ARGS
SOLO = None
if "--tomas" in ARGS:
    a, _, b = ARGS[ARGS.index("--tomas") + 1].partition("-")
    SOLO = range(int(a), int(b or a) + 1)
RES = {"borrador": (540, 960, 2), "normal": (720, 1280, 2), "final": (1080, 1920, 1)}
FPS = 24
LUZ = ARGS[ARGS.index("--luz") + 1] if "--luz" in ARGS else "paint.sl"
EXPOSICION = float(ARGS[ARGS.index("--exposicion") + 1]) if "--exposicion" in ARGS else 0.35


def hexrgb(h, a=1.0):
    h = h.lstrip("#")
    lin = [((int(h[i:i + 2], 16) / 255) ** 2.2) for i in (0, 2, 4)]
    return (*lin, a)


def oscurecer(h, k):
    h = h.lstrip("#")
    return "#" + "".join(f"{int(int(h[i:i + 2], 16) * k):02x}" for i in (0, 2, 4))


# ------------------------------------------------------------------ materiales
_MATS = {}


def mat(color):
    if color in _MATS:
        return _MATS[color]
    m = bpy.data.materials.new(f"c{color}")
    m.use_nodes = True
    m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = hexrgb(color)
    m.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.8
    m.diffuse_color = hexrgb(color)
    _MATS[color] = m
    return m


def mat_imagen(ruta):
    key = f"img:{ruta}"
    if key in _MATS:
        return _MATS[key]
    m = bpy.data.materials.new(Path(ruta).stem)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = bpy.data.images.load(str(ruta), check_existing=True)
    nt.links.new(t.outputs[0], b.inputs["Base Color"])
    nt.links.new(t.outputs[1], b.inputs["Alpha"])
    _MATS[key] = m
    return m


TINTA = None


def contorno(o, grosor=0.035):
    """Contorno negro de caricatura (casco invertido)."""
    global TINTA
    if TINTA is None:
        TINTA = bpy.data.materials.new("tinta")
        TINTA.diffuse_color = (0, 0, 0, 1)
        TINTA.use_nodes = True
        TINTA.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0, 0, 0, 1)
        TINTA.use_backface_culling = True
    o.data.materials.append(TINTA)
    md = o.modifiers.new("contorno", "SOLIDIFY")
    md.thickness = -grosor
    md.use_flip_normals = True
    md.material_offset = len(o.data.materials) - 1


def colgar(hijo, padre):
    """Emparenta sin mover: el hijo queda donde está en el mundo."""
    bpy.context.view_layer.update()
    hijo.parent = padre
    hijo.matrix_parent_inverse = padre.matrix_world.inverted()


def caja(loc, dim, color, padre=None, bisel=0.0, borde=True, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.scale = dim
    bpy.ops.object.transform_apply(scale=True)
    o.data.materials.append(mat(color))
    if bisel:
        b = o.modifiers.new("bisel", "BEVEL")
        b.width, b.segments = bisel, 3
    if borde:
        contorno(o)
    if padre:
        colgar(o, padre)
    return o


def cilindro(loc, r, h, color, padre=None, rot=(0, 0, 0), borde=True, verts=24):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=h, location=loc, rotation=rot, vertices=verts)
    o = bpy.context.active_object
    o.data.materials.append(mat(color))
    if borde:
        contorno(o, 0.025)
    if padre:
        colgar(o, padre)
    return o


def esfera(loc, r, color, padre=None, escala=(1, 1, 1), borde=True):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=32, ring_count=16)
    o = bpy.context.active_object
    o.scale = escala
    bpy.ops.object.shade_smooth()
    o.data.materials.append(mat(color))
    if borde:
        contorno(o, 0.03)
    if padre:
        colgar(o, padre)
    return o


def cono(loc, r, h, color, padre=None):
    bpy.ops.mesh.primitive_cone_add(radius1=r, depth=h, location=loc, vertices=24)
    o = bpy.context.active_object
    o.data.materials.append(mat(color))
    contorno(o, 0.025)
    if padre:
        colgar(o, padre)
    return o


def vacio(loc=(0, 0, 0)):
    bpy.ops.object.empty_add(location=loc)
    return bpy.context.active_object


# ------------------------------------------------------------------ escenarios
ESCENARIOS = {}


def escenario(f):
    ESCENARIOS[f.__name__] = f
    return f


def _piso(color, tam=40):
    caja((0, 0, -0.05), (tam, tam, 0.1), color, borde=False)


def _paredes(color, zocalo="#ffffff"):
    caja((0, 4, 3), (16, 0.2, 6), color, borde=False)
    caja((-6, 0, 3), (0.2, 16, 6), color, borde=False)
    caja((0, 3.88, 0.15), (16, 0.05, 0.3), zocalo, borde=False)


@escenario
def cuarto(cielo):
    _piso("#a0703c")
    _paredes("#8fc7e8")
    caja((2.2, 3.85, 3.2), (1.8, 0.1, 1.6), "#dff4ff")              # ventana
    caja((2.2, 3.8, 3.2), (0.08, 0.1, 1.6), "#ffffff")
    caja((-3.5, 2.6, 0.45), (2.6, 1.6, 0.5), "#e74c3c")              # cama
    caja((-3.5, 3.2, 0.85), (2.6, 0.4, 0.3), "#ffffff")
    return "#cfe9f7"


@escenario
def cocina(cielo):
    _piso("#e9e2d0")
    _paredes("#ffe29a")
    caja((-1, 3.4, 0.6), (6, 1.0, 1.2), "#ffffff")                   # mueble
    caja((-1, 3.4, 1.25), (6.1, 1.1, 0.1), "#5d6d7e")
    caja((-3.3, 3.4, 2.9), (1.6, 0.7, 1.0), "#ffffff")
    caja((2.8, 3.2, 1.0), (1.2, 1.3, 2.0), "#bdc3c7")                # refri
    return "#fff3c4"


@escenario
def parque(cielo):
    _piso("#6ab04c")
    for x, y, s in ((-4, 6, 1.2), (5, 8, 1.5), (-7, 10, 1.4), (8, 4, 1.0), (1, 12, 1.6)):
        cilindro((x, y, s), 0.25 * s, 2 * s, "#8e5b34")
        esfera((x, y, 2.4 * s), 1.1 * s, "#3c9a3c")
    caja((0, 9, 0.02), (3, 14, 0.04), "#d9c38a", borde=False)        # camino
    return cielo or "#7ec8f0"


@escenario
def calle(cielo):
    _piso("#4d5656")
    caja((0, 0, 0.02), (40, 0.25, 0.04), "#f4d03f", borde=False)
    caja((0, 4.5, 0.1), (40, 3, 0.2), "#aab7b8", borde=False)        # banqueta
    random.seed(4)
    for x in range(-12, 14, 4):
        h = random.uniform(5, 11)
        caja((x, 8, h / 2), (3.6, 3, h), random.choice(["#e59866", "#85c1e9", "#f7dc6f", "#bb8fce", "#76d7c4"]))
        for fy in range(1, int(h) - 1, 2):
            caja((x, 6.45, fy + 0.5), (2.4, 0.05, 0.6), "#dff4ff", borde=False)
    return cielo or "#9fd3f5"


@escenario
def escuela(cielo):
    _piso("#c8a165")
    _paredes("#f5cba7")
    caja((0, 3.85, 2.8), (5, 0.1, 2.2), "#1e5631")                   # pizarrón
    caja((0, 3.8, 1.6), (5.2, 0.2, 0.12), "#8e5b34")
    return "#fbe5d6"


@escenario
def tienda(cielo):
    _piso("#ecf0f1")
    _paredes("#f8c471")
    for x in (-4, 0, 4):
        caja((x, 3.2, 1.2), (3, 0.9, 2.4), "#d35400")
        for z in (0.6, 1.3, 2.0):
            for k in range(-1, 2):
                caja((x + k * 0.8, 2.85, z), (0.5, 0.3, 0.45), random.choice(["#e74c3c", "#3498db", "#2ecc71", "#f1c40f"]))
    return "#fdebd0"


@escenario
def noche(cielo):
    _piso("#2d4a2d")
    for x, y in ((-5, 7), (6, 9), (-8, 12), (3, 13)):
        cilindro((x, y, 1.5), 0.3, 3, "#4a3020")
        cono((x, y, 4), 1.5, 3.5, "#1e4620")
    return cielo or "#1b2a49"


@escenario
def estudio(cielo):
    """Fondo liso de color, sin paredes (para comparaciones y memes)."""
    _piso(cielo or "#ffd166")
    caja((0, 6, 6), (40, 0.2, 14), cielo or "#ffd166", borde=False)
    return cielo or "#ffd166"


# ------------------------------------------------------------------ objetos
PROPS = {}


def prop(f):
    PROPS[f.__name__] = f
    return f


@prop
def mesa(p, s, c):
    caja((p[0], p[1], 0.9 * s), (1.8 * s, 1.1 * s, 0.12 * s), c or "#a0522d")
    for dx in (-0.8, 0.8):
        for dy in (-0.45, 0.45):
            caja((p[0] + dx * s, p[1] + dy * s, 0.42 * s), (0.12 * s, 0.12 * s, 0.84 * s), c or "#8b4513")


@prop
def silla(p, s, c):
    caja((p[0], p[1], 0.55 * s), (0.7 * s, 0.7 * s, 0.1 * s), c or "#c0392b")
    caja((p[0], p[1] + 0.32 * s, 1.0 * s), (0.7 * s, 0.08 * s, 0.9 * s), c or "#c0392b")
    for dx in (-0.3, 0.3):
        for dy in (-0.3, 0.3):
            caja((p[0] + dx * s, p[1] + dy * s, 0.25 * s), (0.08 * s, 0.08 * s, 0.5 * s), "#5d4037")


@prop
def cama(p, s, c):
    caja((p[0], p[1], 0.35 * s), (1.6 * s, 2.6 * s, 0.5 * s), c or "#3498db")
    caja((p[0], p[1] + 1.0 * s, 0.7 * s), (1.4 * s, 0.5 * s, 0.25 * s), "#ffffff")


@prop
def arbol(p, s, c):
    cilindro((p[0], p[1], 1.0 * s), 0.22 * s, 2 * s, "#8e5b34")
    esfera((p[0], p[1], 2.4 * s), 1.0 * s, c or "#3c9a3c")


@prop
def caja_regalo(p, s, c):
    caja((p[0], p[1], 0.4 * s), (0.8 * s, 0.8 * s, 0.8 * s), c or "#e84393", bisel=0.03)
    caja((p[0], p[1], 0.4 * s), (0.82 * s, 0.15 * s, 0.82 * s), "#fdcb6e", borde=False)


@prop
def fogata(p, s, c):
    for a in (0, 60, 120):
        cilindro((p[0], p[1], 0.12 * s), 0.08 * s, 1.0 * s, "#6d4c41", rot=(math.radians(90), 0, math.radians(a)))
    cono((p[0], p[1], 0.5 * s), 0.35 * s, 0.8 * s, c or "#ff7f11")
    cono((p[0], p[1], 0.45 * s), 0.2 * s, 0.5 * s, "#ffd23f")


@prop
def tele(p, s, c):
    caja((p[0], p[1], 1.4 * s), (2.0 * s, 0.15 * s, 1.2 * s), "#2d3436")
    caja((p[0], p[1] - 0.08 * s, 1.4 * s), (1.8 * s, 0.02 * s, 1.0 * s), c or "#74b9ff", borde=False)
    caja((p[0], p[1], 0.4 * s), (1.6 * s, 0.6 * s, 0.8 * s), "#636e72")


@prop
def puerta(p, s, c):
    caja((p[0], p[1], 1.1 * s), (1.0 * s, 0.12 * s, 2.2 * s), c or "#8e5b34")
    esfera((p[0] + 0.35 * s, p[1] - 0.1 * s, 1.1 * s), 0.07 * s, "#f1c40f")


@prop
def coche(p, s, c):
    caja((p[0], p[1], 0.6 * s), (3.2 * s, 1.5 * s, 0.7 * s), c or "#e74c3c", bisel=0.08)
    caja((p[0] - 0.2 * s, p[1], 1.15 * s), (1.8 * s, 1.3 * s, 0.6 * s), "#aed6f1", bisel=0.06)
    for dx in (-1.0, 1.0):
        for dy in (-0.75, 0.75):
            cilindro((p[0] + dx * s, p[1] + dy * s, 0.3 * s), 0.3 * s, 0.25 * s, "#222222", rot=(math.radians(90), 0, 0))


@prop
def sofa(p, s, c):
    caja((p[0], p[1], 0.35 * s), (2.6 * s, 1.0 * s, 0.5 * s), c or "#6c5ce7", bisel=0.08)
    caja((p[0], p[1] + 0.4 * s, 0.85 * s), (2.6 * s, 0.25 * s, 0.7 * s), c or "#6c5ce7", bisel=0.08)


@prop
def bici(p, s, c):
    for dx in (-0.6, 0.6):
        bpy.ops.mesh.primitive_torus_add(location=(p[0] + dx * s, p[1], 0.45 * s), rotation=(math.radians(90), 0, 0),
                                         major_radius=0.42 * s, minor_radius=0.05 * s)
        o = bpy.context.active_object
        o.data.materials.append(mat("#222222"))
    caja((p[0], p[1], 0.75 * s), (1.2 * s, 0.08 * s, 0.08 * s), c or "#e17055", borde=False, rot=(0, math.radians(-15), 0))


@prop
def dinero(p, s, c):
    for k in range(5):
        caja((p[0] + random.uniform(-.2, .2) * s, p[1] + random.uniform(-.2, .2) * s, (0.06 + k * 0.12) * s),
             (0.8 * s, 0.4 * s, 0.1 * s), "#27ae60")


@prop
def nube(p, s, c):
    for dx, r in ((-0.6, 0.6), (0, 0.85), (0.7, 0.6)):
        esfera((p[0] + dx * s, p[1], (p[2] if len(p) > 2 else 6) * 1.0), r * s, c or "#ffffff")


@prop
def bloque(p, s, c):
    caja((p[0], p[1], 0.5 * s), (s, s, s), c or "#f39c12", bisel=0.04)


@prop
def castillo(p, s, c):
    caja((p[0], p[1], 0.6 * s), (2.4 * s, 2.4 * s, 1.2 * s), c or "#e5c07b")
    for dx in (-1, 1):
        for dy in (-1, 1):
            cilindro((p[0] + dx * s, p[1] + dy * s, 1.0 * s), 0.35 * s, 2 * s, c or "#e5c07b")
            cono((p[0] + dx * s, p[1] + dy * s, 2.35 * s), 0.45 * s, 0.7 * s, "#c0392b")


@prop
def columpio(p, s, c):
    for dx in (-1.2, 1.2):
        cilindro((p[0] + dx * s, p[1], 1.5 * s), 0.08 * s, 3 * s, "#7f8c8d")
    cilindro((p[0], p[1], 3 * s), 0.08 * s, 2.6 * s, "#7f8c8d", rot=(0, math.radians(90), 0))


@prop
def malvavisco(p, s, c):
    cilindro((p[0], p[1], (p[2] if len(p) > 2 else 1.5)), 0.18 * s, 0.3 * s, c or "#fff5e6")


@prop
def libro(p, s, c):
    caja((p[0], p[1], 0.08 * s), (0.9 * s, 0.65 * s, 0.16 * s), c or "#c0392b")
    caja((p[0] + 0.02 * s, p[1], 0.08 * s), (0.86 * s, 0.6 * s, 0.13 * s), "#fdfefe", borde=False)


@prop
def humo(p, s, c):
    rnd = random.Random(int(p[0] * 10 + p[1]))
    for k in range(7):
        esfera((p[0] + rnd.uniform(-1, 1) * s, p[1] + rnd.uniform(-.5, .5) * s, (1 + k * 0.6) * s),
               rnd.uniform(0.5, 0.9) * s, c or "#7f8c8d", borde=False)


@prop
def estufa(p, s, c):
    caja((p[0], p[1], 0.6 * s), (1.4 * s, 1.0 * s, 1.2 * s), c or "#dfe6e9")
    for dx in (-0.35, 0.35):
        cilindro((p[0] + dx * s, p[1], 1.22 * s), 0.22 * s, 0.04 * s, "#2d3436", borde=False)
    caja((p[0], p[1] - 0.51 * s, 0.55 * s), (1.0 * s, 0.02 * s, 0.6 * s), "#636e72", borde=False)


# ------------------------------------------------------------------ personajes
def personaje(defn, pos, mira, nombre):
    """Cabezón de bloques. Devuelve (raiz, piezas). La cabeza mide ~1.3 y el cuerpo ~1.6: proporción caricatura."""
    piel, ropa, pantalon = defn.get("piel", "#ffd23f"), defn.get("ropa", "#2e86de"), defn.get("pantalon", "#1b3a5c")
    alto = defn.get("altura", 1.0)
    raiz = vacio((pos[0], pos[1], 0))
    raiz.name = nombre
    cuerpo = vacio((pos[0], pos[1], 0))
    colgar(cuerpo, raiz)
    piezas = {"raiz": raiz, "cuerpo": cuerpo}
    for lado in (-1, 1):
        pierna = vacio((pos[0] + 0.22 * lado, pos[1], 0.75))
        colgar(pierna, cuerpo)
        caja((pos[0] + 0.22 * lado, pos[1], 0.38), (0.36, 0.4, 0.75), pantalon, pierna, bisel=0.04)
        piezas[f"pierna{lado}"] = pierna
    caja((pos[0], pos[1], 1.2), (0.9, 0.55, 0.9), ropa, cuerpo, bisel=0.05)
    manga = defn.get("mangas") or oscurecer(ropa, 0.82)   # manga un tono distinto: el brazo se lee contra el torso
    for lado in (-1, 1):
        brazo = vacio((pos[0] + 0.62 * lado, pos[1], 1.56))  # hombro
        colgar(brazo, cuerpo)
        caja((pos[0] + 0.69 * lado, pos[1], 1.22), (0.3, 0.36, 0.74), manga, brazo, bisel=0.05)
        caja((pos[0] + 0.69 * lado, pos[1], 0.76), (0.34, 0.38, 0.26), piel, brazo, bisel=0.07)
        piezas[f"brazo{lado}"] = brazo
    cabeza = vacio((pos[0], pos[1], 1.7))
    colgar(cabeza, cuerpo)
    h = 1.3
    forma = defn.get("cabeza", "cubo")
    if forma == "esfera":
        esfera((pos[0], pos[1], 1.7 + h / 2), h * 0.55, piel, cabeza)
        frente = pos[1] - h * 0.55 - 0.002
    else:
        caja((pos[0], pos[1], 1.7 + h / 2), (h * 1.05, h * 0.95, h), piel, cabeza, bisel=0.12)
        frente = pos[1] - h * 0.475 - 0.004
    if defn.get("pelo"):
        caja((pos[0], pos[1] + 0.05, 1.7 + h + 0.08), (h * 1.1, h * 1.0, 0.25), defn["pelo"], cabeza, bisel=0.08)
    if defn.get("gorra"):
        caja((pos[0], pos[1], 1.7 + h + 0.12), (h * 1.08, h * 0.98, 0.3), defn["gorra"], cabeza, bisel=0.06)
        caja((pos[0], pos[1] - h * 0.6, 1.7 + h + 0.02), (h * 0.9, 0.5, 0.08), defn["gorra"], cabeza)
    if defn.get("gorro_chef"):
        cilindro((pos[0], pos[1], 1.7 + h + 0.35), 0.5, 0.7, "#ffffff", cabeza)
        esfera((pos[0], pos[1], 1.7 + h + 0.8), 0.55, "#ffffff", cabeza, escala=(1, 1, 0.6))
    if defn.get("orejas"):              # animalito (capibara, oso…)
        for lado in (-1, 1):
            esfera((pos[0] + 0.45 * lado, pos[1], 1.7 + h + 0.05), 0.18, defn["orejas"], cabeza)
    if defn.get("antena"):              # firma de Kubo: antena con foco que cambia de color con la emoción
        pivote = vacio((pos[0], pos[1], 1.7 + h))
        colgar(pivote, cabeza)
        cilindro((pos[0], pos[1], 1.7 + h + 0.3), 0.04, 0.6, "#2d3436", pivote)
        piezas["foco"] = (pos[0], pos[1], 1.7 + h + 0.68)
        piezas["antena"] = pivote
    piezas["mira"], piezas["alto"] = mira, alto
    piezas["cabeza"] = cabeza
    piezas["frente"] = (pos[0], frente, 1.7 + h * 0.5)
    piezas["alto_cara"] = h * 0.95
    return piezas


def caras_de(piezas, usadas):
    """Un plano por cara usada (expresión × boca); se muestran/ocultan por cuadro."""
    planos = {}
    x, y, z = piezas["frente"]
    for nombre in usadas:
        for ab in (0, 1):
            for pp in ("", "p"):
                bpy.ops.mesh.primitive_plane_add(size=piezas["alto_cara"], location=(x, y, z), rotation=(math.radians(90), 0, 0))
                o = bpy.context.active_object
                o.data.materials.append(mat_imagen(CARAS / f"{nombre}_{ab}{pp}.png"))
                colgar(o, piezas["cabeza"])
                planos[(nombre, ab, pp)] = o
    piezas["focos"] = {}
    if "foco" in piezas:
        for color in sorted({FOCO.get(n, FOCO["normal"]) for n in usadas}):
            b = esfera(piezas["foco"], 0.16, color, piezas["antena"])
            piezas["focos"][color] = b
    raiz = piezas["raiz"]                # giro y tamaño al final, con todo ya colgado
    raiz.rotation_euler[2] = math.radians(piezas["mira"])
    raiz.scale = (piezas["alto"],) * 3
    return planos


# color del foco de la antena según la emoción (se lee sin idioma: rojo = enojo, azul = tristeza…)
FOCO = {"normal": "#fff3b0", "feliz": "#ffe14d", "risa": "#ffe14d", "extasis": "#ffd700", "enamorado": "#ff6fae",
        "triste": "#4d8bff", "enojado": "#ff2d2d", "malvado": "#b026ff", "sospecha": "#b026ff", "miedo": "#ffffff",
        "grito": "#ffffff", "sorpresa": "#ff9f1a", "pensando": "#7dff6b", "dormido": "#3a3a3a", "mareado": "#7dff6b",
        "ko": "#3a3a3a"}


def boca_abierta(t, habla):
    """Aleteo de boca mientras habla: abierta/cerrada a ~8 Hz dentro de cada tramo [ini, fin]."""
    for a, b in habla:
        if a <= t <= b:
            return int(((t - a) * 8) % 1 < 0.55)
    return 0


def _resorte(d, rapidez=11.0, rebote=15.0):
    """Transición con «overshoot» (se pasa un poco y se asienta): 0 → 1. Da el movimiento elástico de caricatura."""
    if d <= 0:
        return 0.0
    return 1 - math.exp(-rapidez * d) * (math.cos(rebote * d) + (rapidez / rebote) * math.sin(rebote * d))


def _suave(x):
    x = min(1.0, max(0.0, x))
    return x * x * (3 - 2 * x)


R = math.radians
CERO = {"x": 0, "y": 0, "z": 0, "sz": 1.0, "inclina": 0.0, "ladeo": 0.0, "cab": (0, 0, 0), "cab_z": 0.0,
        "bi": (0, 0, 0), "bd": (0, 0, 0), "pi": (0, 0, 0), "pd": (0, 0, 0)}


def pose(accion, t, tl, rnd, act):
    """Pose de una acción en el tiempo t (tl = tiempo desde que empezó esa acción). Todas las acciones respiran y se
    mueven: nunca hay un personaje congelado."""
    p = dict(CERO)
    # base viva: respiración, peso de un pie al otro, brazos sueltos
    p["sz"] = 1 + 0.025 * math.sin(t * 3.4)
    p["ladeo"] = R(2.5) * math.sin(t * 1.4)
    p["bi"] = (R(3) * math.sin(t * 1.6), R(6), 0)
    p["bd"] = (R(-3) * math.sin(t * 1.6), R(-6), 0)
    if accion == "saltar":
        fase = (tl * 2.0) % 1
        p["z"] = 1.1 * math.sin(math.pi * fase) ** 0.8
        p["sz"] = 1 - 0.25 * math.exp(-(min(fase, 1 - fase) / 0.06) ** 2) + 0.12 * math.sin(math.pi * fase)
        brazos = R(140) * math.sin(math.pi * fase)
        p["bi"], p["bd"] = (0, brazos + R(20), 0), (0, -brazos - R(20), 0)
        p["pi"] = p["pd"] = (R(-25) * math.sin(math.pi * fase), 0, 0)
    elif accion == "celebrar":
        fase = (tl * 3.0) % 1
        p["z"] = 0.35 * math.sin(math.pi * fase)
        p["sz"] = 1 - 0.14 * math.exp(-(min(fase, 1 - fase) / 0.07) ** 2)
        p["bi"] = (0, R(150 + 18 * math.sin(tl * 19)), 0)
        p["bd"] = (0, R(-150 - 18 * math.sin(tl * 19 + 1)), 0)
        p["cab"] = (0, R(6) * math.sin(tl * 9.5), 0)
    elif accion == "bailar":
        p["x"] = 0.15 * math.sin(tl * 6)
        p["ladeo"] = R(12) * math.sin(tl * 6)
        p["z"] = 0.12 * abs(math.sin(tl * 6))
        p["bi"] = (R(-60) * (0.5 + 0.5 * math.sin(tl * 6)), R(40), 0)
        p["bd"] = (R(-60) * (0.5 - 0.5 * math.sin(tl * 6)), R(-40), 0)
        p["cab"] = (0, R(-10) * math.sin(tl * 6), 0)
    elif accion == "agitar":
        p["bd"] = (R(-10), R(-155 + 28 * math.sin(tl * 15)), 0)
        p["ladeo"] = R(5) * math.sin(tl * 7.5)
        p["cab"] = (0, R(8), 0)
    elif accion == "senalar":
        e = _resorte(tl)
        p["bd"] = (R(-95) * e, R(-8), 0)
        p["inclina"] = R(-8) * e
        p["cab"] = (R(-5) * e, 0, 0)
    elif accion in ("temblar", "miedo"):
        p["x"] = rnd.uniform(-.05, .05)
        p["inclina"] = R(10)
        p["sz"] = 0.94 + rnd.uniform(-.02, .02)
        p["bi"] = (R(-75), R(35), 0)
        p["bd"] = (R(-75), R(-35), 0)
        p["pi"] = (R(rnd.uniform(-6, 6)), 0, 0)
        p["pd"] = (R(rnd.uniform(-6, 6)), 0, 0)
    elif accion == "susto":
        te = tl - act.get("salto_en", 0.15)
        if te < 0:                                   # anticipación: se encoge antes del susto
            p["sz"] = 1 - 0.18 * _suave(1 + te / 0.12)
        else:
            p["cab_z"] = 1.2 * math.sin(math.pi * te / 0.55) if te <= 0.55 else 0
            p["z"] = 0.5 * math.sin(math.pi * te / 0.35) if te <= 0.35 else 0
            p["sz"] = 1 + 0.2 * math.exp(-te * 6) * math.cos(te * 25)
            ag = R(160) * math.exp(-te * 1.5)
            p["bi"] = (R(-30) * math.sin(te * 30), ag + R(15), 0)
            p["bd"] = (R(30) * math.sin(te * 30), -ag - R(15), 0)
            if te > 0.55:
                p["x"] = rnd.uniform(-.04, .04)
    elif accion == "pensar":
        e = _resorte(tl, 7, 10)
        p["bd"] = (R(-115) * e, R(-25) * e, R(15) * e)       # mano a la barbilla
        p["bi"] = (R(-30) * e, R(20), 0)
        p["cab"] = (R(4), R(10) * e + R(3) * math.sin(t * 2), 0)
    elif accion == "comer":
        c = abs(math.sin(tl * 5))
        p["bd"] = (R(-125 + 30 * c), R(-15), R(25))
        p["cab"] = (R(6) * c, 0, 0)
        p["sz"] = 1 + 0.03 * c
    elif accion == "zapatear":                       # enojo: pisotones y puños
        fase = (tl * 4) % 1
        p["pd"] = (R(-35) * math.sin(math.pi * fase) * (int(tl * 4) % 2 == 0), 0, 0)
        p["pi"] = (R(-35) * math.sin(math.pi * fase) * (int(tl * 4) % 2 == 1), 0, 0)
        p["sz"] = 1 - 0.06 * math.exp(-(min(fase, 1 - fase) / 0.08) ** 2)
        p["bi"] = (R(-40), R(25), 0)
        p["bd"] = (R(-40), R(-25), 0)
        p["inclina"] = R(-6)
    elif accion == "golpe":                          # reacción a un impacto: sale hacia atrás y se recupera
        e = math.exp(-tl * 4) * math.cos(tl * 12)
        p["inclina"] = R(22) * e
        p["sz"] = 1 - 0.15 * e
        p["bi"], p["bd"] = (R(50) * e, R(40) * e, 0), (R(50) * e, R(-40) * e, 0)
    elif accion == "sorpresa":
        e = _resorte(tl)
        p["inclina"] = R(12) * e
        p["z"] = 0.25 * math.sin(math.pi * min(1, tl / 0.3))
        p["bi"], p["bd"] = (R(-20), R(70) * e, 0), (R(-20), R(-70) * e, 0)
    elif accion in ("caminar", "correr"):
        v, amp = (12, 0.95) if accion == "correr" else (7, 0.55)
        sw = math.sin(tl * v)
        p["pi"], p["pd"] = (amp * sw, 0, 0), (-amp * sw, 0, 0)
        p["bi"], p["bd"] = (-amp * sw, R(8), 0), (amp * sw, R(-8), 0)
        p["z"] = 0.08 * abs(math.cos(tl * v)) * (2 if accion == "correr" else 1)
        p["inclina"] = R(-14) if accion == "correr" else R(-4)
    elif accion == "volar":
        p["z"] = 1.5 + math.sin(t * 3) * 0.2 + tl * act.get("sube", 1.0)
        p["bi"], p["bd"] = (0, R(170), 0), (0, R(-170), 0)
        p["inclina"] = R(-20)
    elif accion == "caer":
        p["z"] = max(0.0, 3 * (1 - tl * 1.8))
        if p["z"] == 0:
            d = tl - 1 / 1.8
            p["sz"] = 1 - 0.3 * math.exp(-d * 7) * math.cos(d * 20)
    return p


def _mezcla(a, b, k):
    out = {}
    for key in a:
        va, vb = a[key], b[key]
        out[key] = tuple(x + (y - x) * k for x, y in zip(va, vb)) if isinstance(va, tuple) else va + (vb - va) * k
    return out


def animar_actor(piezas, act, n, planos):
    """Anima un actor cuadro por cuadro. «gestos»: [[t, accion], …] cambia de acción dentro de la toma con una
    transición elástica. Al hablar gesticula (cabeceo, brazo que acompaña, rebote). Parpadea, la antena rebota con
    cada cambio y la cabeza hace «pop» al cambiar de emoción."""
    caras = sorted(act.get("caras") or [[0, act.get("cara", "normal")]])
    gestos = sorted(act.get("gestos") or []) or [[0, act.get("accion", "quieto")]]
    if gestos[0][0] > 0:
        gestos.insert(0, [0, act.get("accion", "quieto")])
    habla = act.get("habla") or []
    raiz, cuerpo, cabeza = piezas["raiz"], piezas["cuerpo"], piezas["cabeza"]
    bi, bd, pi_, pd = piezas["brazo-1"], piezas["brazo1"], piezas["pierna-1"], piezas["pierna1"]
    p0 = Vector(raiz.location)
    cab0 = Vector(cabeza.location)
    hasta = act.get("hasta")
    a0 = piezas["alto"]
    rnd = random.Random(sum(map(ord, act.get("id", ""))) * 7 + int(p0.x * 10))
    parpadeos, tt = [], rnd.uniform(0.4, 1.8)
    while tt < n / FPS:
        parpadeos.append(tt)
        tt += rnd.uniform(2.0, 4.0)
    cambios = [c[0] for c in caras[1:]] + [g[0] for g in gestos[1:]]
    eventos = [0.0] + cambios + [g[0] + act.get("salto_en", 0.15) for g in gestos if g[1] == "susto"]
    fase_brazo = rnd.uniform(0, 6)
    estado_cara = None
    for f in range(1, n + 1):
        t = (f - 1) / FPS
        u = (f - 1) / max(1, n - 1)
        k = max(i for i, g in enumerate(gestos) if g[0] <= t)
        tg, acc = gestos[k]
        po = pose(acc, t, t - tg, rnd, act)
        if k > 0:                                   # transición elástica desde la acción anterior
            prev = pose(gestos[k - 1][1], t, t - gestos[k - 1][0], rnd, act)
            po = _mezcla(prev, po, min(1.08, _resorte(t - tg, 13, 16)))
        hablando = any(a <= t <= b for a, b in habla)
        if hablando and acc in ("quieto", "pensar", "senalar", "agitar", "zapatear"):
            # gesticular: cabeceo, rebote del cuerpo y un brazo que acompaña las palabras
            po["cab"] = (po["cab"][0] + R(5) * math.sin(t * 9), po["cab"][1] + R(4) * math.sin(t * 3.1), po["cab"][2])
            po["sz"] *= 1 + 0.025 * math.sin(t * 17)
            if acc == "quieto":
                g = 0.5 + 0.5 * math.sin(t * 2.6 + fase_brazo)
                po["bd"] = (R(-55) * g, R(-12) - R(25) * g, R(20) * g)
                po["inclina"] += R(-3)
        # posición: desplazamiento con aceleración suave
        base = p0.lerp(Vector((hasta[0], hasta[1], 0)), _suave(u * 1.05)) if hasta else p0
        raiz.location = base + Vector((po["x"], po["y"], po["z"]))
        sz = po["sz"]
        raiz.scale = (a0 / math.sqrt(sz), a0 / math.sqrt(sz), a0 * sz)
        raiz.rotation_euler = (0, 0, R(piezas["mira"]) + R(act.get("gira", 0)) * _suave(u))
        cuerpo.rotation_euler = (po["inclina"], po["ladeo"], 0)
        pop = 1.0
        for tc in cambios:
            d = t - tc
            if 0 <= d < 0.4:
                pop = 1 + 0.13 * math.exp(-d * 9) * math.cos(d * 22)
        cabeza.scale = (pop, pop, pop)
        cabeza.location = cab0 + Vector((0, 0, po["cab_z"]))
        cabeza.rotation_euler = po["cab"]
        bi.rotation_euler, bd.rotation_euler = po["bi"], po["bd"]
        pi_.rotation_euler, pd.rotation_euler = po["pi"], po["pd"]
        if "antena" in piezas:                      # resorte amortiguado: reacciona a cada evento y al salto
            amp = 0.0
            extra = [math.floor((t - tg) * 2.0) / 2.0 + tg] if acc == "saltar" else []
            for te in eventos + extra:
                d = t - te
                if d >= 0:
                    amp += 0.5 * math.exp(-d * 4.5) * math.sin(d * 18)
            amp += -0.6 * (po["z"] - pose(acc, t - 1 / FPS, t - tg - 1 / FPS, random.Random(0), act)["z"])
            piezas["antena"].rotation_euler = (amp + 0.05 * math.sin(t * 2.3), 0.05 * math.sin(t * 1.7), 0)
            piezas["antena"].keyframe_insert("rotation_euler", frame=f)
        if "sombra" in piezas:                      # sombra de contacto: sigue al personaje y se achica al saltar
            sm = piezas["sombra"]
            sm.location = (raiz.location.x, raiz.location.y, 0.012)
            ks = a0 / (1 + 0.45 * max(0.0, raiz.location.z))
            sm.scale = (1.9 * ks, 1.3 * ks, 1)
            sm.keyframe_insert("location", frame=f)
            sm.keyframe_insert("scale", frame=f)
        for o in (raiz, cuerpo, cabeza, bi, bd, pi_, pd):
            o.keyframe_insert("location", frame=f)
            o.keyframe_insert("rotation_euler", frame=f)
            o.keyframe_insert("scale", frame=f)
        actual = caras[0][1]
        for tc, nombre in caras:
            if t >= tc:
                actual = nombre
        parpadea = "p" if any(0 <= t - tp < 0.13 for tp in parpadeos) else ""
        clave = (actual, boca_abierta(t, habla), parpadea)
        if clave != estado_cara:
            for kk, o in planos.items():
                o.hide_render = (kk != clave)
                o.keyframe_insert("hide_render", frame=f)
            prendido = FOCO.get(actual, FOCO["normal"])
            for color, bb in piezas.get("focos", {}).items():
                bb.hide_render = (color != prendido)
                bb.keyframe_insert("hide_render", frame=f)
            estado_cara = clave


# ------------------------------------------------------------------ cámara
TIROS = {"cerca": 3.0, "medio": 5.0, "lejos": 9.0, "plano_general": 14, "detalle": 2.0}


def camara(toma, objetivo, n, ancho_grupo=0.0):
    tipo = toma.get("camara", "medio")
    partes = tipo.split("+")              # p. ej. «medio+empuje», «cerca+temblor», «lejos+orbita»
    tiro = next((TIROS[p] for p in partes if p in TIROS), 6.5)
    # que quepan todos: en vertical el ángulo horizontal es estrecho (~35° con lente 32)
    sc = bpy.context.scene
    lente = toma.get("lente", 32)
    hfov = 2 * math.atan(36 * min(1, sc.render.resolution_x / sc.render.resolution_y) / 2 / lente)
    if ancho_grupo:
        necesario = (ancho_grupo + 2.3) / 2 / math.tan(hfov / 2)      # +2.8: medio cuerpo a cada lado
        tiro = max(tiro, necesario / (0.78 if "empuje" in partes else 1))
    alto = 1.0 if "contrapicado" in partes else 5.5 if "picado" in partes else 2.6
    lado = math.radians(toma.get("angulo", 12 if "lateral" not in partes else 55))
    bpy.ops.object.camera_add()
    cam = bpy.context.active_object
    cam.data.lens = lente
    bpy.context.scene.camera = cam
    obj = vacio(objetivo)
    rnd = random.Random(7)
    for f in range(1, n + 1):
        u = (f - 1) / max(1, n - 1)
        u2 = u * u * (3 - 2 * u)
        d = tiro
        a = lado
        if "empuje" in partes:
            d = tiro * (1 - 0.35 * u2)
        if "alejar" in partes:
            d = tiro * (0.7 + 0.45 * u2)
        if "orbita" in partes:
            a = lado + math.radians(40) * (u2 - 0.5)
        if "paneo" in partes:
            obj.location = Vector(objetivo) + Vector((-1.5 + 3 * u2, 0, 0))
        cam.location = Vector(obj.location) + Vector((d * math.sin(a), -d * math.cos(a), alto - 1.6 + d * 0.06))
        g = toma.get("golpe_en")
        if g is not None and f / FPS >= g:          # «punch-in» en la palabra clave: entra rápido y vuelve suave
            dg = f / FPS - g
            d *= 1 - 0.13 * min(1, dg / 0.06) * math.exp(-max(0, dg - 0.06) * 3.5)
        if "temblor" in partes or ("golpe" in partes and u < 0.25):
            cam.location += Vector((rnd.uniform(-.08, .08), 0, rnd.uniform(-.08, .08)))
        direc = Vector(obj.location) - cam.location
        cam.rotation_euler = direc.to_track_quat("-Z", "Y").to_euler()
        cam.keyframe_insert("location", frame=f)
        cam.keyframe_insert("rotation_euler", frame=f)
        obj.keyframe_insert("location", frame=f)
    return cam


# ------------------------------------------------------------------ escena y render
def limpiar():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for col in (bpy.data.meshes, bpy.data.cameras, bpy.data.lights):
        for b in list(col):
            if b.users == 0:
                col.remove(b)


def configurar(sc, ancho, alto):
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = ancho, alto, 100
    sc.render.fps = FPS
    sc.render.engine = "BLENDER_WORKBENCH"
    sh = sc.display.shading
    sh.light = "STUDIO"
    sh.color_type = "TEXTURE"
    sh.show_shadows = "--sombras" in ARGS     # las sombras de Workbench dejan franjas («acné»): se usa sombra de contacto
    sh.shadow_intensity = 0.35
    sh.show_cavity = "--sin-cavidad" not in ARGS
    sh.cavity_type = "WORLD"
    sh.show_object_outline = True
    sh.show_backface_culling = True       # el casco invertido de contorno solo se ve por detrás
    sh.show_specular_highlight = False
    sh.object_outline_color = (0, 0, 0)
    sc.display.shadow_focus = 0.2
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"
    sc.view_settings.exposure = EXPOSICION
    sh.studio_light = LUZ
    sc.render.image_settings.file_format = "PNG"
    sc.render.film_transparent = False
    sc.display.render_aa = ARGS[ARGS.index("--aa") + 1] if "--aa" in ARGS else ("16" if CALIDAD == "final" else "8")


def render_toma(i, toma, plan, ancho, alto, paso):
    sc = bpy.context.scene
    limpiar()
    n = toma.get("cuadros") or max(2, round(toma["dur"] * FPS / paso) * paso)
    sc.frame_start, sc.frame_end, sc.frame_step = 1, n, paso
    cielo = ESCENARIOS.get(toma.get("escenario", "cuarto"), cuarto)(toma.get("cielo"))
    if not sc.world:
        sc.world = bpy.data.worlds.new("mundo")
    sc.world.color = hexrgb(cielo)[:3]
    for pr in toma.get("props", []):
        f = PROPS.get(pr["tipo"])
        if not f:
            print(f"KUBO aviso: objeto desconocido «{pr['tipo']}» (hay: {', '.join(PROPS)})", flush=True)
            continue
        antes = set(bpy.data.objects)
        f(pr.get("pos", [0, 0]), pr.get("escala", 1.0), pr.get("color"))
        for o in set(bpy.data.objects) - antes:
            if o.parent is None:
                o.location.z += pr.get("z", 0)
                if pr.get("giro"):
                    o.rotation_euler[2] += math.radians(pr["giro"])
    centros = []
    for k, act in enumerate(toma.get("actores", [])):
        defn = plan.get("personajes", {}).get(act["id"], {})
        pos = act.get("pos", [k * 2.2 - (len(toma["actores"]) - 1) * 1.1, 0])
        piezas = personaje(defn, pos, act.get("mira", 0), act["id"])
        usadas = sorted({c[1] for c in (act.get("caras") or [])} | {act.get("cara", "normal")})
        planos = caras_de(piezas, usadas)
        bpy.ops.mesh.primitive_plane_add(size=1, location=(pos[0], pos[1], 0.012))
        piezas["sombra"] = bpy.context.active_object
        piezas["sombra"].data.materials.append(mat_imagen(CARAS / "sombra.png"))
        animar_actor(piezas, act, n, planos)
        if not toma.get("objetivo") or toma.get("objetivo") == act["id"]:
            cerca = any(x in toma.get("camara", "") for x in ("cerca", "detalle"))
            centros.append(Vector((pos[0], pos[1], (2.45 if cerca else 2.0) * defn.get("altura", 1.0))))
    objetivo = toma.get("mirar_a") or (sum(centros, Vector()) / len(centros) if centros else Vector((0, 0, 1.5)))
    xs = [a.get("pos", [0, 0])[0] for a in toma.get("actores", []) if not toma.get("objetivo") or toma["objetivo"] == a["id"]]
    camara(toma, Vector(objetivo), n, (max(xs) - min(xs)) if len(xs) > 1 else 0.0)
    if CONTROL:
        sc.frame_set(n // 2)
        sc.render.filepath = str(SALIDA / f"control_{i:02d}.png")
        bpy.ops.render.render(write_still=True)
    else:
        sc.render.filepath = str(SALIDA / f"t{i:02d}_")
        bpy.ops.render.render(animation=True)


def main():
    plan = json.loads(PLAN.read_text(encoding="utf-8"))
    ancho, alto, paso = RES[CALIDAD]
    if plan.get("formato") == "16:9":
        ancho, alto = alto, ancho
    SALIDA.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    configurar(bpy.context.scene, ancho, alto)
    random.seed(1)
    for i, toma in enumerate(plan["tomas"], 1):
        if SOLO and i not in SOLO:
            continue
        print(f"KUBO toma {i}/{len(plan['tomas'])}", flush=True)
        render_toma(i, toma, plan, ancho, alto, paso)
    print("KUBO listo", flush=True)


main()
