# Kubo v2 (versión 2): modelo 3D de Hunyuan3D → personaje animable de verdad.
#   blender -b --factory-startup -P kubo_v2.py -- /ruta/salida [--control] [--final]
# Arreglos de la autocrítica de la versión 1:
#   1. Partes rígidas: cabeza, manos y zapatos se mueven completos (solo se doblan cuello, cintura, codos, rodillas).
#   2. Esqueleto con hombro-codo-muñeca, cadera-rodilla-tobillo y pies pegados al piso (IK).
#   3. Animación con principios: anticipación, aceleración/frenado (curvas Bézier), pausas, seguimiento, aterrizaje
#      con aplastamiento.
#   4. Cara viva: las caras 2D de Kubo (16 expresiones, parpadeo, boca) en el frente de la cabeza; el foco de la
#      antena cambia de color con la emoción.
#   5. Colores limpios (cortes rectos entre piezas) y escena sin horizonte con sombra de contacto y cámara que se mueve.
import math
import sys
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.kdtree import KDTree

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
SALIDA = ARGS[0] if ARGS else "/tmp/kubo_v2"
REPO = Path(__file__).resolve().parents[4] if "__file__" in dir() else Path("/home/user/Claude")
MODELO = REPO / "proyectos/kubo/modelos3d/kubo_hunyuan3d_forma.glb"
CARAS = REPO / "datos/kubo/_caras"
F = 24
DUR = 5.0
N = int(DUR * F)


def hexrgb(h, a=1.0):
    h = h.lstrip("#")
    return (*[(int(h[i:i + 2], 16) / 255) ** 2.2 for i in (0, 2, 4)], a)


COLORES = {"piel": "#3dd6c6", "ropa": "#ff8c1a", "pant": "#24304a", "zapato": "#1b2236", "suela": "#f2f2f2",
           "antena": "#ffe14d"}
FOCO = {"normal": "#fff3b0", "feliz": "#ffe14d", "risa": "#ffe14d", "extasis": "#ffd700", "sorpresa": "#ff9f1a",
        "pensando": "#7dff6b"}


def material(nombre, color):
    m = bpy.data.materials.new(nombre)
    m.diffuse_color = hexrgb(color)
    m.use_nodes = True
    m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = hexrgb(color)
    return m


def material_imagen(ruta):
    m = bpy.data.materials.new(Path(ruta).stem)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = bpy.data.images.load(str(ruta), check_existing=True)
    nt.links.new(t.outputs[0], b.inputs["Base Color"])
    nt.links.new(t.outputs[1], b.inputs["Alpha"])
    return m


def suave(a, b, v):
    t = np.clip((v - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


# ------------------------------------------------------------------ 1. modelo: simplificar, alisar la cara, cortar piezas
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(MODELO))
o = [x for x in bpy.context.scene.objects if x.type == "MESH"][0]
o.name = "kubo"
bpy.context.view_layer.objects.active = o
o.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
dec = o.modifiers.new("dec", "DECIMATE")
dec.ratio = 30000 / len(o.data.polygons)
bpy.ops.object.modifier_apply(modifier="dec")
me = o.data

# aplanar el frente de la cabeza (quita ojos/mejillas esculpidos; la cara 2D va encima)
co = np.array([v.co[:] for v in me.vertices])
nr = np.array([v.normal[:] for v in me.vertices])
x, y, z = co.T
cara = (z > -0.14) & (z < 0.74) & (np.abs(x) < 0.46) & (nr[:, 1] < -0.3) & (y < -0.2)
A = np.c_[np.ones(cara.sum()), x[cara], z[cara]]
coef = np.linalg.lstsq(A, y[cara], rcond=None)[0]
for _ in range(4):                                   # ajuste robusto: ignora los bultos
    res = y[cara] - A @ coef
    ok = np.abs(res) < np.percentile(np.abs(res), 70)
    coef = np.linalg.lstsq(A[ok], y[cara][ok], rcond=None)[0]
plano = coef[0] + coef[1] * x + coef[2] * z
borde = suave(0.46, 0.33, np.abs(x)) * suave(-0.14, -0.04, z) * suave(0.74, 0.62, z)
nuevo_y = np.where(cara, y + (plano - y) * borde, y)
for i in np.nonzero(cara)[0]:
    me.vertices[i].co.y = float(nuevo_y[i])
y = nuevo_y
fr = cara
FRENTE_Y = float(np.median(y[fr & (z > 0.0) & (z < 0.55) & (np.abs(x) < 0.25)]))

# cortes rectos donde cambia el color (bordes limpios, sin «pelos»)
bm = bmesh.new()
bm.from_mesh(me)
for zc in (-0.17, -0.60, -0.84, -0.975, 0.842):
    g = bm.verts[:] + bm.edges[:] + bm.faces[:]
    bmesh.ops.bisect_plane(bm, geom=g, plane_co=(0, 0, zc), plane_no=(0, 0, 1))
for xc in (-0.44, 0.44):
    g = bm.verts[:] + bm.edges[:] + bm.faces[:]
    bmesh.ops.bisect_plane(bm, geom=g, plane_co=(xc, 0, 0), plane_no=(1, 0, 0))
bm.to_mesh(me)
bm.free()
for p in me.polygons:
    p.use_smooth = True

for n, c in COLORES.items():
    me.materials.append(material(n, c))
ORDEN = list(COLORES)


def zona(c):
    px, py, pz = c
    if pz > 0.842 and abs(px) < 0.13:
        return "antena"
    if pz > -0.17:
        return "piel"
    if pz <= -0.975:
        return "suela"
    if pz <= -0.84:
        return "zapato"
    if pz <= -0.60:
        return "ropa" if abs(px) > 0.44 and pz > -0.76 else "pant"
    if abs(px) > 0.44 and pz < -0.42:
        return "piel"  # manos
    return "ropa"


for p in me.polygons:
    p.material_index = ORDEN.index(zona(p.center))
print("CARAS", len(me.polygons))

# ------------------------------------------------------------------ 2. esqueleto con IK
bpy.ops.object.armature_add(location=(0, 0, 0))
arm = bpy.context.active_object
arm.name = "esqueleto"
bpy.ops.object.mode_set(mode="EDIT")
eb = arm.data.edit_bones
eb.remove(eb[0])
Y0 = 0.08


def hueso(n, h, t, p=None, deforma=True, conectar=False):
    b = eb.new(n)
    b.head, b.tail = h, t
    b.use_deform = deforma
    if p:
        b.parent = eb[p]
        b.use_connect = conectar
    return b


hueso("raiz", (0, Y0, -1.0), (0, Y0 + 0.4, -1.0), deforma=False)
hueso("cadera", (0, Y0, -0.60), (0, Y0, -0.44), "raiz")
hueso("pecho", (0, Y0, -0.44), (0, Y0, -0.22), "cadera", conectar=True)
hueso("cabeza", (0, Y0, -0.20), (0, Y0, 0.70), "pecho")
hueso("antena", (0, -0.20, 0.84), (0, -0.22, 0.97), "cabeza")
for s, l in ((1, "D"), (-1, "I")):
    hueso("brazo" + l, (0.30 * s, Y0, -0.27), (0.42 * s, Y0, -0.39), "pecho")
    hueso("antebrazo" + l, (0.42 * s, Y0, -0.39), (0.49 * s, Y0, -0.49), "brazo" + l, conectar=True)
    hueso("mano" + l, (0.49 * s, Y0, -0.49), (0.54 * s, Y0, -0.66), "antebrazo" + l, conectar=True)
    hueso("muslo" + l, (0.17 * s, Y0, -0.60), (0.17 * s, Y0 - 0.02, -0.76), "cadera")
    hueso("espinilla" + l, (0.17 * s, Y0 - 0.02, -0.76), (0.17 * s, Y0, -0.90), "muslo" + l, conectar=True)
    hueso("ctrl_pie" + l, (0.17 * s, Y0, -0.90), (0.17 * s, Y0 - 0.25, -0.90), "raiz", deforma=False)
    hueso("pie" + l, (0.17 * s, Y0, -0.90), (0.17 * s, Y0 - 0.25, -0.96), "ctrl_pie" + l)
    hueso("rodilla" + l, (0.17 * s, -0.8, -0.76), (0.17 * s, -0.9, -0.76), "raiz", deforma=False)
bpy.ops.object.mode_set(mode="POSE")
for l in "DI":
    ik = arm.pose.bones["espinilla" + l].constraints.new("IK")
    ik.target, ik.subtarget = arm, "ctrl_pie" + l
    ik.pole_target, ik.pole_subtarget = arm, "rodilla" + l
    ik.pole_angle = math.radians(-90)
    ik.chain_count = 2
bpy.ops.object.mode_set(mode="OBJECT")

# pesos automáticos (calor) y luego partes rígidas
for ob in bpy.context.selected_objects:
    ob.select_set(False)
o.select_set(True)
arm.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.parent_set(type="ARMATURE_AUTO")
co = np.array([v.co[:] for v in me.vertices])
x, y, z = co.T
ax = np.abs(x)
lado = np.where(x > 0, "D", "I")
rigido = {}
cuello = suave(-0.26, -0.16, z)
for i in range(len(co)):
    if z[i] > 0.842 and ax[i] < 0.13:
        rigido[i] = {"antena": 1.0}
    elif z[i] > -0.26:
        rigido[i] = {"cabeza": float(cuello[i]), "pecho": float(1 - cuello[i])}
    elif ax[i] > 0.46 and -0.76 < z[i] < -0.47:
        rigido[i] = {"mano" + lado[i]: 1.0}
    elif z[i] < -0.84:
        rigido[i] = {"pie" + lado[i]: 1.0}
grupos = {g.name: g for g in o.vertex_groups}
for i, pesos in rigido.items():
    for g in o.vertex_groups:
        g.remove([i])
    for n, w in pesos.items():
        if w > 0.001:
            grupos[n].add([i], w, "REPLACE")
print("RIGIDOS", len(rigido))

# ------------------------------------------------------------------ 3. cara 2D (planos que se prenden/apagan)
CARA_Z, CARA_TAM = 0.27, 0.80
caras = {}


def plano_cara(nombre):
    if nombre in caras:
        return caras[nombre]
    bpy.ops.mesh.primitive_plane_add(size=CARA_TAM, location=(-0.02, FRENTE_Y - 0.012, CARA_Z),
                                     rotation=(math.radians(90), 0, 0))
    pl = bpy.context.active_object
    pl.name = "cara_" + nombre
    pl.data.materials.append(material_imagen(CARAS / f"{nombre}.png"))
    pl.parent = arm
    pl.parent_type = "BONE"
    pl.parent_bone = "cabeza"
    pl.matrix_parent_inverse = (arm.matrix_world @ arm.pose.bones["cabeza"].matrix @
                                Matrix.Translation((0, arm.data.bones["cabeza"].length, 0))).inverted()
    caras[nombre] = pl
    return pl


# guion de la cara: (segundo, expresión, boca 0/1, mirada "", "i", "d")
GUION_CARA = [(0.0, "feliz", 0, ""), (0.30, "feliz", 0, "p"), (0.38, "feliz", 0, ""),
              (0.80, "risa", 1, ""), (1.05, "risa", 0, ""), (1.25, "risa", 1, ""), (1.50, "risa", 0, ""),
              (1.70, "risa", 1, ""), (2.05, "feliz", 0, ""), (2.50, "sorpresa", 0, ""),
              (3.05, "extasis", 1, ""), (3.72, "sorpresa", 1, ""), (3.95, "risa", 1, ""), (4.40, "feliz", 0, ""),
              (4.62, "feliz", 0, "p"), (4.70, "feliz", 0, "")]


def archivo_cara(exp, boca, extra):
    return f"{exp}_{boca}{extra}"


for _, e, b_, x_ in GUION_CARA:
    plano_cara(archivo_cara(e, b_, x_))
for f in range(1, N + 1):
    t = (f - 1) / F
    activo = [g for g in GUION_CARA if g[0] <= t][-1]
    nom = archivo_cara(activo[1], activo[2], activo[3])
    for k, pl in caras.items():
        pl.hide_render = k != nom
        pl.keyframe_insert("hide_render", frame=f)
foco = me.materials[ORDEN.index("antena")]
for t, e, _, _ in GUION_CARA:
    foco.diffuse_color = hexrgb(FOCO.get(e, FOCO["normal"]))
    foco.keyframe_insert("diffuse_color", frame=int(t * F) + 1)

# ------------------------------------------------------------------ 4. animación (claves con curvas Bézier)
pb = arm.pose.bones


def gira(n, eje, ang):
    b = pb[n]
    b.rotation_mode = "QUATERNION"
    R = b.bone.matrix_local.to_3x3()
    b.rotation_quaternion = (R.inverted() @ Matrix.Rotation(ang, 3, eje) @ R).to_quaternion()


def mueve(n, dz):
    """Sube/baja un hueso dz en el mundo (los huesos de tronco apuntan a +z: su eje Y local es arriba)."""
    pb[n].location = (0, dz, 0)


POSES = {}  # segundo → función que pone la pose


def pose(t):
    def deco(fn):
        POSES[t] = fn
        return fn
    return deco


def reposo(brazoD=0.0, brazoI=0.0, codoD=0.15, codoI=0.15, cadera=0.0, cabeza_lado=0.0, cabeza_frente=0.0,
           antena=0.0, salto=0.0, aplasta=1.0, pecho=0.0, piernas_atras=0.0):
    gira("brazoD", "Y", -brazoD)
    gira("brazoI", "Y", brazoI)
    gira("antebrazoD", "Y", -codoD)
    gira("antebrazoI", "Y", codoI)
    gira("manoD", "Y", -0.1 * codoD)
    gira("manoI", "Y", 0.1 * codoI)
    mueve("cadera", cadera)
    gira("pecho", "X", pecho)
    gira("cabeza", "Y", cabeza_lado)
    pb["cabeza"].rotation_quaternion = pb["cabeza"].rotation_quaternion @ \
        (pb["cabeza"].bone.matrix_local.to_3x3().inverted() @ Matrix.Rotation(cabeza_frente, 3, "X") @
         pb["cabeza"].bone.matrix_local.to_3x3()).to_quaternion()
    gira("antena", "X", antena)
    # aplastar/estirar en el eje vertical del mundo (convertido a los ejes del hueso raíz)
    Rr = pb["raiz"].bone.matrix_local.to_3x3()
    ejez = Rr.inverted() @ Vector((0, 0, 1))
    sx = 1 / math.sqrt(aplasta)
    pb["raiz"].scale = tuple(aplasta if abs(c) > 0.9 else sx for c in ejez)


CLAVES = [
    # t,    kwargs
    (0.00, dict()),
    (0.45, dict(cadera=-0.015, cabeza_lado=0.04)),
    (0.65, dict(cadera=-0.035, brazoD=0.25, codoD=0.5, cabeza_lado=-0.06, antena=0.15)),           # anticipación
    (0.85, dict(cadera=0.0, brazoD=1.10, codoD=1.45, cabeza_lado=0.14, antena=-0.30)),              # sube el brazo
    (1.05, dict(brazoD=1.05, codoD=1.85, cabeza_lado=0.16, antena=0.20)),                            # saludo ida
    (1.25, dict(brazoD=1.10, codoD=1.15, cabeza_lado=0.12, antena=-0.10)),
    (1.45, dict(brazoD=1.05, codoD=1.85, cabeza_lado=0.16)),
    (1.65, dict(brazoD=1.10, codoD=1.15, cabeza_lado=0.12)),
    (1.85, dict(brazoD=1.05, codoD=1.75, cabeza_lado=0.14)),
    (2.15, dict(brazoD=-0.12, codoD=0.10, cabeza_lado=0.0, antena=0.25)),                           # baja (se pasa)
    (2.35, dict(brazoD=0.05, codoD=0.18, antena=-0.12)),
    (2.55, dict(cabeza_frente=0.0)),
    (2.85, dict(cadera=-0.13, brazoD=-0.55, brazoI=-0.55, codoD=0.4, codoI=0.4, cabeza_frente=0.12, pecho=0.18,
                antena=0.10, aplasta=0.95)),                                                         # se agacha
    (3.05, dict(cadera=0.02, brazoD=1.15, brazoI=1.15, codoD=0.55, codoI=0.55, salto=0.18, aplasta=1.08,
                cabeza_frente=-0.08, antena=-0.45)),                                                 # despega (se estira)
    (3.32, dict(brazoD=1.35, brazoI=1.35, codoD=0.8, codoI=0.8, salto=0.52, aplasta=1.0, antena=0.10)),                      # punto alto
    (3.48, dict(brazoD=1.3, brazoI=1.3, codoD=0.75, codoI=0.75, salto=0.50, antena=0.35)),                                   # flota un instante
    (3.72, dict(brazoD=0.9, brazoI=0.9, salto=0.0, aplasta=1.04, antena=0.30)),                      # toca el piso
    (3.84, dict(cadera=-0.11, brazoD=0.6, brazoI=0.6, codoD=0.5, codoI=0.5, aplasta=0.88, pecho=0.15,
                cabeza_frente=0.10, antena=-0.45)),                                                  # aplasta
    (4.10, dict(cadera=0.01, brazoD=0.15, brazoI=0.15, aplasta=1.02, antena=0.25)),                  # rebota
    (4.35, dict(cadera=-0.01, antena=-0.10)),
    (4.70, dict(cabeza_lado=0.05)),
    (5.00, dict()),
]

for t, kw in CLAVES:
    for b in pb:
        b.rotation_mode = "QUATERNION"
        b.rotation_quaternion = (1, 0, 0, 0)
        b.location = (0, 0, 0)
        b.scale = (1, 1, 1)
    reposo(**kw)
    # raíz: su eje Y apunta al frente-atrás; usamos su ubicación local Z = arriba en el mundo
    pb["raiz"].location = (0, 0, 0)
    pb["raiz"].location = pb["raiz"].bone.matrix_local.to_3x3().inverted() @ Vector((0, 0, kw.get("salto", 0.0)))
    f = int(round(t * F)) + 1
    for b in pb:
        b.keyframe_insert("rotation_quaternion", frame=f)
        b.keyframe_insert("location", frame=f)
        b.keyframe_insert("scale", frame=f)

# ------------------------------------------------------------------ 5. escena: estudio sin horizonte, sombra, cámara
sc = bpy.context.scene
sc.frame_start, sc.frame_end = 1, N
sc.render.fps = F
FONDO = "#ffd166"
sc.world = bpy.data.worlds.new("mundo")
sc.world.color = hexrgb(FONDO)[:3]
bpy.ops.mesh.primitive_plane_add(size=1.15, location=(0, Y0 - 0.05, -0.995))
sombra = bpy.context.active_object
sombra.name = "sombra"
sombra.data.materials.append(material_imagen(CARAS / "sombra.png"))
for t, kw in CLAVES:
    s_ = kw.get("salto", 0.0)
    k = 1.0 - 0.45 * min(1, s_ / 0.5)
    sombra.scale = (k, k * 0.8, 1)
    sombra.keyframe_insert("scale", frame=int(round(t * F)) + 1)

sc.render.engine = "BLENDER_WORKBENCH"
sh = sc.display.shading
sh.light = "STUDIO"
sh.studio_light = "paint.sl"
sh.color_type = "TEXTURE"
sh.show_cavity = True
sh.cavity_type = "WORLD"
sh.show_object_outline = True
sh.object_outline_color = (0, 0, 0)
sh.show_shadows = False
sh.show_backface_culling = False
sc.view_settings.view_transform = "Standard"
sc.view_settings.exposure = 0.35

bpy.ops.object.camera_add()
cam = bpy.context.active_object
sc.camera = cam
cam.data.lens = 42
mira = Vector((0, 0, -0.22))
for t, d, a, h in ((0.0, 4.4, 22, 0.55), (2.5, 4.0, 14, 0.45), (5.0, 3.8, 26, 0.50)):
    ang = math.radians(a)
    cam.location = mira + Vector((d * math.sin(ang), -d * math.cos(ang), h))
    cam.rotation_euler = (mira - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam.keyframe_insert("location", frame=int(t * F) + 1)
    cam.keyframe_insert("rotation_euler", frame=int(t * F) + 1)

r = sc.render
FINAL = "--final" in ARGS
r.resolution_x, r.resolution_y = (1080, 1920) if FINAL else (720, 1280)
sc.display.render_aa = "16" if FINAL else "8"
if "--control" in ARGS:
    r.image_settings.file_format = "PNG"
    for t in (0.3, 1.1, 2.85, 3.35, 3.85, 4.4):
        sc.frame_set(int(t * F) + 1)
        r.filepath = f"{SALIDA}_{t:.2f}.png"
        bpy.ops.render.render(write_still=True)
else:
    r.image_settings.file_format = "FFMPEG"
    r.ffmpeg.format = "MPEG4"
    r.ffmpeg.codec = "H264"
    r.ffmpeg.constant_rate_factor = "HIGH"
    r.filepath = SALIDA + ".mp4"
    bpy.ops.render.render(animation=True)
bpy.ops.wm.save_as_mainfile(filepath=SALIDA + ".blend")
print("KUBO_V2 LISTO")
