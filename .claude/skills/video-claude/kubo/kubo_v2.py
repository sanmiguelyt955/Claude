# Kubo v2 (prueba): modelo 3D de Hunyuan3D-2 → simplificar (25k caras) → pintar por zonas (cara por bultos) →
# esqueleto de 8 huesos con pesos automáticos (calor) → animación de prueba (rebote, saludo, ladeo, antena, salto) → video.
#   blender -b --factory-startup -P kubo_v2.py -- /ruta/salida [--control]

import bpy, bmesh, math, sys
from mathutils import Vector, Matrix
import numpy as np
SALIDA = sys.argv[sys.argv.index("--")+1] if "--" in sys.argv else "/tmp/claude-0/k2/out"
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath="/home/user/Claude/proyectos/kubo/modelos3d/kubo_hunyuan3d_forma.glb")
o=[o for o in bpy.context.scene.objects if o.type=='MESH'][0]
bpy.context.view_layer.objects.active=o; o.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
# 1) simplificar
m=o.modifiers.new("dec","DECIMATE"); m.ratio=25000/len(o.data.polygons)
bpy.ops.object.modifier_apply(modifier="dec")
me=o.data
for p in me.polygons: p.use_smooth=True
print("CARAS", len(me.polygons))
co=np.array([v.co[:] for v in me.vertices]); nr=np.array([v.normal[:] for v in me.vertices])
x,y,z=co[:,0],co[:,1],co[:,2]
# 2) colores por zonas
C={"piel":(0.24,0.84,0.78),"ropa":(1.0,0.55,0.10),"pant":(0.14,0.19,0.29),"zapato":(0.10,0.13,0.20),
   "suela":(0.95,0.95,0.95),"antena":(1.0,0.82,0.12),"ojo":(0.03,0.03,0.05),"mejilla":(0.95,0.55,0.62)}
col=np.zeros((len(co),3)); col[:]=C["piel"]
cabeza = z>-0.17
torso = (z<=-0.17)&(z>-0.60)
col[torso]=C["ropa"]
mano = torso & (np.abs(x)>0.43) & (z<-0.42)
col[mano]=C["piel"]
col[(z<=-0.60)&(z>-0.84)]=C["pant"]
col[z<=-0.84]=C["zapato"]; col[z<=-0.975]=C["suela"]
col[(z>0.842)&(np.abs(x)<0.12)]=C["antena"]
# rasgos de la cara: bultos (ojos, mejillas) y hundidos (boca) respecto a la superficie de alrededor
from mathutils.kdtree import KDTree
fr = cabeza & (nr[:,1]<-0.85) & (z<0.62) & (z>-0.05) & (np.abs(x)<0.36)
idx=np.nonzero(fr)[0]; kd=KDTree(len(idx))
for j,i in enumerate(idx): kd.insert((x[i],z[i],0),j)
kd.balance()
rel=np.zeros(len(co))
for i in idx:
    vec=[idx[j] for (_,j,_) in kd.find_range((x[i],z[i],0),0.09)]
    rel[i]=np.median(y[vec])-y[i]           # >0 sobresale hacia el frente (-y)
sale = fr & (rel>0.006); hunde = fr & (rel<-0.005) & (np.abs(x)<0.14)
zc=np.median(z[sale]) if sale.any() else 0.3
print("rasgos", sale.sum(), "boca", hunde.sum(), "z", round(float(zc),3))
CLS=np.zeros(len(co),dtype=int)  # 0 normal,1 ojo,2 mejilla,3 boca
CLS[sale&(z>=zc)]=1; CLS[sale&(z<zc)]=2; CLS[hunde&(z<zc)]=3
attr=me.color_attributes.new("Col","FLOAT_COLOR","CORNER")
for p_ in me.polygons:
    vs=list(p_.vertices); cl=np.bincount(CLS[vs],minlength=4)
    if cl[1]*2>=len(vs): c=C["ojo"]
    elif cl[2]*2>=len(vs): c=C["mejilla"]
    elif cl[3]*2>=len(vs): c=(0.35,0.05,0.10)
    else:
        cs=[tuple(col[v]) for v in vs]; c=max(set(cs),key=cs.count)
    for li in p_.loop_indices: attr.data[li].color=(*c,1)
me.color_attributes.active_color=attr
# 3) esqueleto
bpy.ops.object.armature_add(location=(0,0,0)); arm=bpy.context.active_object; arm.name="esqueleto"
bpy.ops.object.mode_set(mode="EDIT"); eb=arm.data.edit_bones; eb.remove(eb[0])
def hueso(n,h,t,p=None):
    b=eb.new(n); b.head=h; b.tail=t
    if p: b.parent=eb[p]
    return b
hueso("cadera",(0,0.05,-0.62),(0,0.05,-0.45))
hueso("pecho",(0,0.05,-0.45),(0,0.05,-0.20),"cadera")
hueso("cabeza",(0,0.05,-0.20),(0,0.05,0.70),"pecho")
hueso("antena",(0,-0.2,0.84),(0,-0.22,0.96),"cabeza")
for s,l in ((1,"D"),(-1,"I")):
    hueso("brazo"+l,(0.30*s,0.05,-0.27),(0.52*s,0.05,-0.52),"pecho")
    hueso("pierna"+l,(0.17*s,0.05,-0.62),(0.17*s,0.05,-0.97),"cadera")
bpy.ops.object.mode_set(mode="OBJECT")
# pesos automáticos (calor de huesos, como Mixamo/Blender); si fallan, zonas
import os
MODO=os.environ.get("PESOS","auto")
ok=False
if MODO=="auto":
    for ob in bpy.context.selected_objects: ob.select_set(False)
    o.select_set(True); arm.select_set(True); bpy.context.view_layer.objects.active=arm
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    ok=len(o.vertex_groups)>0 and any(True for v in me.vertices if v.groups)
    print("PESOS AUTO", ok, len(o.vertex_groups))
if not ok:
    print("PESOS POR ZONAS")
# (zonas), con mezcla suave en las uniones
    def suave(a,b,v): t=np.clip((v-a)/(b-a),0,1); return t*t*(3-2*t)
    W={}
    wc=suave(-0.24,-0.12,z)                       # cuello → cabeza
    W["cabeza"]=wc
    ax=np.abs(x)
    brazo = suave(0.29,0.36,ax)*(1-suave(-0.20,-0.12,z))*(z>-0.62) + suave(0.42,0.46,ax)*((z<=-0.62)&(z>-0.76))
    brazo = np.clip(brazo,0,1)
    W["brazoD"]=brazo*(x>0); W["brazoI"]=brazo*(x<0)
    pierna = (1-suave(-0.66,-0.58,z))*(1-brazo)
    W["piernaD"]=pierna*(x>0)*(1-brazo); W["piernaI"]=pierna*(x<0)*(1-brazo)
    resto = np.clip(1-wc-brazo-pierna,0,1)
    W["pecho"]=resto*suave(-0.55,-0.40,z); W["cadera"]=resto*(1-suave(-0.55,-0.40,z))
    W["antena"]=(z>0.865).astype(float); W["cabeza"]=W["cabeza"]*(1-W["antena"])
    for n,w in W.items():
        g=o.vertex_groups.new(name=n)
        for i in np.nonzero(w>0.001)[0]: g.add([int(i)],float(w[i]),"REPLACE")
    md=o.modifiers.new("arm","ARMATURE"); md.object=arm; o.parent=arm
    
# 4) animación de prueba (4 s): rebote, saludo, ladeo de cabeza, antena con resorte, salto final
sc=bpy.context.scene; F=24; N=4*F; sc.frame_start,sc.frame_end=1,N; sc.render.fps=F
pb=arm.pose.bones
for b in pb: b.rotation_mode="XYZ"
from mathutils import Quaternion
def girar(n, eje, ang):
    """Gira un hueso alrededor de un eje DEL MUNDO (x=lado, y=frente-atrás, z=arriba)."""
    b=pb[n]; b.rotation_mode="QUATERNION"
    R=b.bone.matrix_local.to_3x3()
    b.rotation_quaternion=(R.inverted() @ Matrix.Rotation(ang,3,eje) @ R).to_quaternion()
def key(f):
    t=(f-1)/F
    rebote=0.03*abs(math.sin(t*math.pi*2.2))
    salto = 0.45*max(0,math.sin((t-3.0)*math.pi)) if t>3.0 else 0
    agacha = -0.06*max(0,math.sin((t-2.6)*math.pi*2.5)) if 2.6<t<3.0 else 0
    pb["cadera"].location=(0,rebote+salto+agacha,0)  # hueso apunta a +z: y local = arriba
    pb["cabeza"].rotation_euler=(0,0.18*math.sin(t*math.pi*1.1),0.10*math.sin(t*2.0))
    sal=min(1,max(0,(t-0.4)/0.3))*(1-min(1,max(0,(t-2.3)/0.3)))
    arriba=min(1,salto*4) if t>3.0 else 0
    girar("brazoD","Y", -(2.5*sal + 0.35*sal*math.sin(t*14)) - 1.6*arriba)
    girar("brazoI","Y", 0.12*math.sin(t*3) + 1.6*arriba)
    pb["piernaD"].rotation_euler=(0.25*agacha/0.06 if agacha else 0,0,0)
    pb["piernaI"].rotation_euler=(0.25*agacha/0.06 if agacha else 0,0,0)
    pb["antena"].rotation_euler=(0.35*math.sin(t*13)*math.exp(-((t*1.0)%1.2)*2.5),0,0)
    for b in pb:
        b.keyframe_insert("rotation_quaternion" if b.rotation_mode=="QUATERNION" else "rotation_euler",frame=f)
        b.keyframe_insert("location",frame=f)
for f in range(1,N+1): key(f)
# 5) cámara, luz y render
sc.render.engine="BLENDER_WORKBENCH"; sh=sc.display.shading
sh.light="STUDIO"; sh.studio_light="paint.sl"; sc.view_settings.exposure=0.35; sh.color_type="VERTEX"; sh.show_cavity=True; sh.cavity_type="WORLD"; sh.show_object_outline=True
sh.object_outline_color=(0,0,0); sh.show_shadows=False
sc.view_settings.view_transform="Standard"
sc.world=bpy.data.worlds.new("w"); sc.world.color=(1.0,0.82,0.40)
bpy.ops.mesh.primitive_plane_add(size=20,location=(0,0,-1.0)); piso=bpy.context.active_object
piso.data.color_attributes.new("Col","FLOAT_COLOR","POINT")
for d in piso.data.color_attributes[0].data: d.color=(1.0,0.86,0.5,1)
bpy.ops.object.camera_add(location=(1.6,-3.6,0.5)); cam=bpy.context.active_object; sc.camera=cam; cam.data.lens=40
cam.rotation_euler=(Vector((0,0,-0.15))-cam.location).to_track_quat("-Z","Y").to_euler()
r=sc.render; r.resolution_x,r.resolution_y=720,1280; sc.display.render_aa="8"
r.image_settings.file_format="FFMPEG"; r.ffmpeg.format="MPEG4"; r.ffmpeg.codec="H264"; r.ffmpeg.constant_rate_factor="HIGH"
if "--control" in sys.argv:
    r.image_settings.file_format="PNG"
    for f in (12,30,60,80):
        sc.frame_set(f); r.filepath=f"{SALIDA}_{f}.png"; bpy.ops.render.render(write_still=True)
else:
    r.filepath=SALIDA+".mp4"; bpy.ops.render.render(animation=True)
bpy.ops.wm.save_as_mainfile(filepath="/tmp/claude-0/k2/kubo_v2.blend")
