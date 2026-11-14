"""Construye index.html de HyperFrames a partir de guion.json + tiempos.json.
uso: build.py guion.json tiempos.json proyecto_dir"""
import sys, json, html
spec=json.load(open(sys.argv[1])); T=json.load(open(sys.argv[2])); out=sys.argv[3]
W,H=spec["ancho"],spec["alto"]; vertical=H>W; total=T["total"]; P=spec["paleta"]
sc_t=T["escenas"]; n=len(sc_t)
starts=[0.0]+[max(sc_t[i]["audio_start"]-0.2,0) for i in range(1,n)]
ends=starts[1:]+[total]
U=(W if vertical else H)/1080  # unidad de escala
def px(v): return f"{v*U:.0f}px"
# --- layout
if vertical:
    head=dict(left=px(90),top=px(180),width=px(900))
    stage=dict(left=0,top=px(560),width=f"{W}px",height=px(820))
    caps_top=H-px_val if (px_val:=0) else None
    caps=dict(left=px(60),right=px(60),top=f"{H-int(440*U)}px")
    tsize=110
else:
    head=dict(left=px(110),top=px(150),width=f"{int(W*0.46)}px")
    stage=dict(left=f"{int(W*0.5)}px",top=px(110),width=f"{int(W*0.46)}px",height=px(680))
    caps=dict(left=px(110),right=px(110),top=f"{H-int(230*U)}px")
    tsize=92
def css(d): return ";".join(f"{k}:{v}" for k,v in d.items())
# --- visuales
def lampara(i,p):
    return (f'''<div class="lamp" id="lamp{i}"><div class="glow"></div><div class="lbase"></div><div class="larm"><div class="lhead"><div class="lled"></div></div></div></div>''',
            f'tl.from("#lamp{i}",{{y:120,autoAlpha:0,duration:0.6,ease:"power3.out"}},S);tl.from("#lamp{i} .glow",{{autoAlpha:0,scale:0.4,duration:0.8,ease:"power2.out"}},S+0.5);tl.from("#lamp{i} .larm",{{rotation:-40,duration:0.8,ease:"back.out(1.6)"}},S+0.3);')
def reloj(i,p):
    return (f'<div class="clock" id="ck{i}"><div class="ch h"></div><div class="ch m"></div><div class="cdot"></div></div><div class="vlabel" id="ckl{i}">{p.get("txt","")}</div>',
            f'tl.from("#ck{i}",{{scale:0,duration:0.5,ease:"back.out(2)"}},S+0.1);tl.fromTo("#ck{i} .m",{{rotation:-90}},{{rotation:270,duration:2.2,ease:"power1.inOut"}},S+0.3);tl.fromTo("#ck{i} .h",{{rotation:240}},{{rotation:330,duration:2.2,ease:"power1.inOut"}},S+0.3);tl.from("#ckl{i}",{{autoAlpha:0,y:30,duration:0.4}},S+0.6);')
def iman(i,p):
    return (f'<div class="wall" id="wl{i}"></div><div class="lamp small" id="lamp{i}"><div class="glow"></div><div class="lbase mag"></div><div class="larm"><div class="lhead"><div class="lled"></div></div></div></div>',
            f'tl.from("#wl{i}",{{scaleY:0,transformOrigin:"top",duration:0.5}},S);tl.fromTo("#lamp{i}",{{x:{int(-260*U)},rotation:-25,autoAlpha:0}},{{x:0,rotation:0,autoAlpha:1,duration:0.45,ease:"power4.in"}},S+0.6);tl.to("#lamp{i}",{{x:{int(-14*U)},duration:0.08,yoyo:true,repeat:3}},S+1.05);tl.from("#lamp{i} .glow",{{autoAlpha:0,duration:0.5}},S+1.3);')
def giro(i,p):
    return (f'<div class="lamp" id="lamp{i}"><div class="glow"></div><div class="lbase"></div><div class="larm"><div class="lhead"><div class="lled"></div></div></div></div><div class="ring" id="rg{i}"></div>',
            f'tl.from("#lamp{i}",{{autoAlpha:0,duration:0.4}},S);tl.from("#rg{i}",{{scale:0,autoAlpha:0,duration:0.6,ease:"back.out(1.7)"}},S+0.2);tl.to("#lamp{i} .larm",{{rotation:360,duration:2.4,ease:"power2.inOut"}},S+0.5);tl.to("#rg{i}",{{rotation:360,duration:3,ease:"none"}},S+0.2);')
def tonos(i,p):
    cols=p["colores"]; labs=p["etiquetas"]
    items="".join(f'<div class="tone" id="tn{i}_{k}"><div class="tdot" style="background:{c};box-shadow:0 0 {int(80*U)}px {c}"></div><div class="tlab">{l}</div></div>' for k,(c,l) in enumerate(zip(cols,labs)))
    return (f'<div class="tones">{items}</div>', "".join(f'tl.from("#tn{i}_{k}",{{y:60,autoAlpha:0,duration:0.4,ease:"back.out(2)"}},S+{0.3+k*p.get("paso",0.9):.2f});' for k in range(len(cols))))
def contador(i,p):
    return (f'<div class="counter"><span class="cnum" id="cn{i}">0</span><span class="cunit">{p["unidad"]}</span></div><div class="bar"><div class="barfill" id="bf{i}"></div></div>',
            f'(function(){{const o={{v:0}};tl.to(o,{{v:{p["n"]},duration:1.6,ease:"power2.out",onUpdate:()=>{{document.getElementById("cn{i}").textContent=(Number.isInteger({p["n"]})?Math.round(o.v):o.v.toFixed(1)).toString().replace(".",",")}}}},S+0.3);}})();tl.from("#bf{i}",{{scaleX:0,transformOrigin:"left",duration:1.6,ease:"power2.out"}},S+0.3);')
def lista(i,p):
    items="".join(f'<div class="li" id="li{i}_{k}"><span class="lib"></span>{html.escape(x)}</div>' for k,x in enumerate(p["items"]))
    return (f'<div class="list">{items}</div>', "".join(f'tl.from("#li{i}_{k}",{{x:{int(80*U)},autoAlpha:0,duration:0.35,ease:"power3.out"}},S+{0.3+k*p.get("paso",0.8):.2f});' for k in range(len(p["items"]))))
def precio(i,p):
    return (f'<div class="price"><div class="old" id="po{i}">{p["antes"]}<span class="strike" id="ps{i}"></span></div><div class="new" id="pn{i}">{p["ahora"]}</div><div class="save" id="pv{i}">{p.get("ahorro","")}</div></div>',
            f'tl.from("#po{i}",{{autoAlpha:0,y:30,duration:0.35}},S+0.2);tl.from("#ps{i}",{{scaleX:0,transformOrigin:"left",duration:0.35,ease:"power3.out"}},S+{p.get("t_strike",2.0)});tl.from("#pn{i}",{{scale:0,duration:0.5,ease:"back.out(2.2)"}},S+{p.get("t_new",1.0)});tl.from("#pv{i}",{{autoAlpha:0,y:20,duration:0.3}},S+{p.get("t_new",1.0)+0.6:.2f});')
def insignias(i,p):
    items="".join(f'<div class="badge2" id="bd{i}_{k}">{html.escape(x)}</div>' for k,x in enumerate(p["items"]))
    return (f'<div class="badges">{items}</div>', "".join(f'tl.from("#bd{i}_{k}",{{scale:0,duration:0.4,ease:"back.out(2.5)"}},S+{0.3+k*p.get("paso",0.9):.2f});' for k in range(len(p["items"]))))
def peso(i,p):
    return (f'<div class="scale"><div class="pan l" id="pl{i}"><div class="plab">{p["a"]}</div></div><div class="pan r" id="pr{i}"><div class="plab">{p["b"]}</div></div><div class="beam" id="bm{i}"></div></div>',
            f'tl.from(".scale",{{autoAlpha:0,duration:0.3}},S);tl.fromTo("#bm{i}",{{rotation:0}},{{rotation:-8,duration:0.9,ease:"elastic.out(1,0.4)"}},S+0.6);tl.fromTo("#pl{i}",{{y:0}},{{y:{int(-38*U)},duration:0.9,ease:"elastic.out(1,0.4)"}},S+0.6);tl.fromTo("#pr{i}",{{y:0}},{{y:{int(38*U)},duration:0.9,ease:"elastic.out(1,0.4)"}},S+0.6);')
def marca(i,p):
    return (f'<div class="brandmark" id="bmk{i}">{p["nombre"]}<b>.</b></div>', f'tl.from("#bmk{i}",{{scale:0.6,autoAlpha:0,duration:0.6,ease:"back.out(1.8)"}},S+0.15);')
def texto(i,p): return ("","")
VIS=dict(lampara=lampara,reloj=reloj,iman=iman,giro=giro,tonos=tonos,contador=contador,lista=lista,precio=precio,insignias=insignias,peso=peso,marca=marca,texto=texto)

def luna(i,p):
    cr="".join(f'<div class="crater" style="left:{x}%;top:{y}%;width:{w}%;height:{w}%"></div>' for x,y,w in [(20,25,18),(55,15,12),(60,55,22),(30,65,10),(75,35,8)])
    gone=p.get("desaparece",False)
    j=f'tl.from("#mn{i}",{{scale:0.3,autoAlpha:0,duration:0.7,ease:"back.out(1.6)"}},S+0.1);tl.to("#mn{i}",{{rotation:20,duration:4,ease:"none"}},S+0.1);'
    if gone: j+=f'tl.to("#mn{i}",{{scale:0.05,autoAlpha:0,duration:0.5,ease:"power4.in"}},S+{p.get("t",2.0)});tl.fromTo("#pf{i}",{{scale:0,opacity:0}},{{scale:1,opacity:1,duration:0.4,ease:"power2.out"}},S+{p.get("t",2.0)+0.4:.2f});tl.to("#pf{i}",{{opacity:0,scale:2,duration:0.6}},S+{p.get("t",2.0)+0.8:.2f});'
    return (f'<div class="moon" id="mn{i}">{cr}</div><div class="poof" id="pf{i}"></div>', j)
def marea(i,p):
    return (f'<div class="sea"><div class="wave" id="wv{i}"></div><div class="tidemark" id="tm{i}">{p.get("txt","")}</div></div>',
            f'tl.fromTo("#wv{i}",{{yPercent:0}},{{yPercent:-38,duration:1.1,yoyo:true,repeat:1,ease:"sine.inOut"}},S+0.2);tl.to("#wv{i}",{{yPercent:-12,duration:0.6,yoyo:true,repeat:3,ease:"sine.inOut"}},S+2.6);tl.from("#tm{i}",{{autoAlpha:0,duration:0.3}},S+2.4);')
def eje(i,p):
    return (f'<div class="earthwrap"><div class="axis" id="ax{i}"><div class="earth"><div class="land a"></div><div class="land b"></div></div><div class="pole"></div></div><div class="vlabel" id="axl{i}">{p.get("txt","")}</div></div>',
            f'tl.from("#ax{i}",{{scale:0,duration:0.5,ease:"back.out(2)"}},S+0.1);tl.fromTo("#ax{i}",{{rotation:-23}},{{rotation:23,duration:0.9,yoyo:true,repeat:5,ease:"sine.inOut"}},S+0.7);tl.from("#axl{i}",{{autoAlpha:0,y:20,duration:0.3}},S+0.9);')
def estrellas(i,p):
    import random
    r=random.Random(i); st="".join(f'<div class="star" style="left:{r.uniform(3,97):.1f}%;top:{r.uniform(3,97):.1f}%;width:{r.uniform(4,10):.0f}px;height:{r.uniform(4,10):.0f}px"></div>' for _ in range(70))
    return (f'<div class="sky" id="sk{i}">{st}</div>', f'tl.from("#sk{i} .star",{{autoAlpha:0,scale:0,duration:0.3,stagger:{{each:0.02,from:"random"}}}},S+0.1);tl.to("#sk{i} .star",{{opacity:0.3,duration:0.4,yoyo:true,repeat:5,stagger:{{each:0.03,from:"random"}}}},S+1.5);')
def fraccion(i,p):
    rows="".join(f'<div class="frow" id="fr{i}_{k}"><div class="flab">{html.escape(r[0])}</div><div class="fbar"><div class="ffill" style="width:{r[1]}%"></div></div><div class="fval">{html.escape(r[2])}</div></div>' for k,r in enumerate(p["filas"]))
    return (f'<div class="fracs">{rows}</div>', "".join(f'tl.from("#fr{i}_{k} .ffill",{{scaleX:0,transformOrigin:"left",duration:0.8,ease:"power3.out"}},S+{0.3+k*p.get("paso",1.2):.2f});tl.from("#fr{i}_{k}",{{autoAlpha:0,duration:0.3}},S+{0.25+k*p.get("paso",1.2):.2f});' for k in range(len(p["filas"]))))
VIS.update(luna=luna,marea=marea,eje=eje,estrellas=estrellas,fraccion=fraccion)

# --- escenas
scenes_html=[]; js=[]
for i,sc in enumerate(spec["escenas"]):
    S=starts[i]; D=ends[i]-S
    vh,vj=VIS[sc.get("visual","texto")](i,sc.get("p",{}))
    kick=f'<div class="kicker" id="k{i}">{html.escape(sc.get("kicker",""))}</div>' if sc.get("kicker") else ""
    title=sc.get("titulo","")
    tw="".join(f'<span class="tw">{html.escape(w)}</span> ' if w!="|" else "<br/>" for w in title.split())
    scenes_html.append(f'''<div class="scene clip" id="s{i}" data-start="{S:.2f}" data-duration="{D:.2f}" data-track-index="{i%2}">
 <div class="head" style="{css(head)}">{kick}<div class="title" id="t{i}">{tw}</div></div>
 <div class="stage" style="{css(stage)}">{vh}</div></div>''')
    js.append(f'S={S:.2f};')
    if kick: js.append(f'tl.from("#k{i}",{{autoAlpha:0,y:20,duration:0.3}},S+0.05);')
    js.append(f'tl.from("#t{i} .tw",{{y:{int(70*U)},autoAlpha:0,duration:0.45,stagger:0.06,ease:"power3.out"}},S+0.12);')
    js.append(vj)
    if i<n-1: js.append(f'tl.to("#s{i} .head, #s{i} .stage",{{autoAlpha:0,y:-30,duration:0.2}},{ends[i]-0.2:.2f});')
# --- subtítulos: trozos de <=4 palabras
lines=[]; cur=[]
allw=[w for sc in sc_t for w in sc["words"]]
for w in allw:
    cur.append(w)
    if len(cur)>=4 or w["w"][-1:] in ".,?!:" or sum(len(x["w"]) for x in cur)>20:
        lines.append(cur); cur=[]
if cur: lines.append(cur)
cap=[]; wid=0
for li,L in enumerate(lines):
    spans=""
    for w in L:
        spans+=f'<span class="w" id="w{wid}">{html.escape(w["w"])}</span>'
        js.append(f'tl.to("#w{wid}",{{color:"{P["acento"]}",duration:0.06}},{w["s"]:.2f});')
        wid+=1
    st=L[0]["s"]; en=lines[li+1][0]["s"] if li+1<len(lines) else min(L[-1]["e"]+0.8,total)
    en=min(en, L[-1]["e"]+0.9)
    cap.append(f'<div class="capline" id="cl{li}">{spans}</div>')
    js.append(f'tl.fromTo("#cl{li}",{{autoAlpha:0,y:14}},{{autoAlpha:1,y:0,duration:0.12}},{max(st-0.04,0):.2f});tl.to("#cl{li}",{{autoAlpha:0,duration:0.08}},{en-0.08:.2f});')
fs=lambda v: f"{v*U:.0f}px"
CSS=f'''@font-face{{font-family:"Archivo Black";font-weight:400;src:url("https://cdn.jsdelivr.net/npm/@fontsource/archivo-black@5.2.5/files/archivo-black-latin-400-normal.woff2") format("woff2")}}
@font-face{{font-family:"Archivo";font-weight:600;src:url("https://cdn.jsdelivr.net/npm/@fontsource/archivo@5.2.5/files/archivo-latin-600-normal.woff2") format("woff2")}}
*{{margin:0;padding:0;box-sizing:border-box}}
html,body{{width:{W}px;height:{H}px;overflow:hidden;background:{P["fondo"]}}}
#root{{position:relative;width:{W}px;height:{H}px;font-family:"Archivo",sans-serif;color:{P["tinta"]};background:radial-gradient(circle at 70% 30%, {P["fondo2"]} 0%, {P["fondo"]} 60%)}}
.scene{{position:absolute;inset:0}}
.head{{position:absolute}}
.kicker{{font-size:{fs(34)};letter-spacing:.14em;text-transform:uppercase;color:{P["acento"]};margin-bottom:{fs(18)}}}
.title{{font-family:"Archivo Black";font-size:{fs(tsize)};line-height:.98;letter-spacing:-0.035em}}
.tw{{display:inline-block}}
.stage{{position:absolute;display:flex;align-items:center;justify-content:center}}
.lamp{{position:relative;width:{fs(420)};height:{fs(520)}}}
.lamp.small{{transform-origin:center}}
.glow{{position:absolute;left:{fs(-80)};top:{fs(120)};width:{fs(580)};height:{fs(460)};background:radial-gradient(ellipse at 50% 20%, {P["luz"]}cc 0%, {P["luz"]}33 35%, transparent 70%);filter:blur({fs(8)})}}
.lbase{{position:absolute;left:{fs(130)};bottom:0;width:{fs(160)};height:{fs(40)};border-radius:{fs(20)};background:{P["producto"]}}}
.lbase.mag::after{{content:"";position:absolute;left:{fs(50)};top:{fs(-10)};width:{fs(60)};height:{fs(12)};border-radius:{fs(6)};background:{P["acento"]}}}
.larm{{position:absolute;left:{fs(198)};bottom:{fs(30)};width:{fs(24)};height:{fs(380)};border-radius:{fs(12)};background:{P["producto"]};transform-origin:50% 100%}}
.lhead{{position:absolute;left:{fs(-60)};top:{fs(-30)};width:{fs(150)};height:{fs(60)};border-radius:{fs(30)} {fs(30)} {fs(12)} {fs(12)};background:{P["producto"]}}}
.lled{{position:absolute;left:{fs(18)};bottom:{fs(-6)};width:{fs(114)};height:{fs(12)};border-radius:{fs(6)};background:{P["luz"]};box-shadow:0 0 {fs(40)} {P["luz"]}}}
.wall{{position:absolute;left:{fs(130)};top:0;width:{fs(30)};height:100%;background:{P["tinta"]}22;border-radius:{fs(8)}}}
.ring{{position:absolute;width:{fs(560)};height:{fs(560)};border-radius:50%;border:{fs(6)} dashed {P["acento"]}88}}
.clock{{position:relative;width:{fs(380)};height:{fs(380)};border-radius:50%;border:{fs(16)} solid {P["tinta"]}}}
.ch{{position:absolute;left:50%;bottom:50%;width:{fs(14)};margin-left:{fs(-7)};border-radius:{fs(7)};background:{P["tinta"]};transform-origin:50% 100%}}
.ch.h{{height:{fs(100)}}} .ch.m{{height:{fs(150)};background:{P["acento"]}}}
.cdot{{position:absolute;left:50%;top:50%;width:{fs(30)};height:{fs(30)};margin:{fs(-15)};border-radius:50%;background:{P["tinta"]}}}
.vlabel{{position:absolute;bottom:{fs(10)};font-family:"Archivo Black";font-size:{fs(70)};color:{P["acento"]}}}
.tones{{display:flex;gap:{fs(50)}}}
.tone{{text-align:center}} .tdot{{width:{fs(170)};height:{fs(170)};border-radius:50%;margin:0 auto {fs(26)}}}
.tlab{{font-size:{fs(40)};font-weight:600}}
.counter{{font-family:"Archivo Black";color:{P["acento"]};text-align:center}}
.cnum{{font-size:{fs(300)};letter-spacing:-0.05em}} .cunit{{font-size:{fs(110)};margin-left:{fs(16)}}}
.bar{{position:absolute;bottom:{fs(80)};width:70%;height:{fs(34)};border-radius:{fs(17)};background:{P["tinta"]}22}}
.barfill{{width:100%;height:100%;border-radius:{fs(17)};background:{P["acento"]}}}
.list{{display:flex;flex-direction:column;gap:{fs(30)};font-size:{fs(58)};font-weight:600}}
.li{{display:flex;align-items:center;gap:{fs(26)}}} .lib{{width:{fs(26)};height:{fs(26)};border-radius:50%;background:{P["acento"]}}}
.price{{text-align:center}}
.old{{position:relative;display:inline-block;font-size:{fs(90)};opacity:.6;font-weight:600}}
.strike{{position:absolute;left:-4%;top:50%;width:108%;height:{fs(10)};background:{P["rojo"]};border-radius:{fs(5)}}}
.new{{font-family:"Archivo Black";font-size:{fs(220)};color:{P["acento"]};letter-spacing:-0.04em;line-height:1.05}}
.save{{display:inline-block;margin-top:{fs(10)};padding:{fs(14)} {fs(34)};border-radius:{fs(40)};background:{P["tinta"]};color:{P["fondo"]};font-size:{fs(44)};font-weight:600}}
.badges{{display:flex;flex-direction:column;gap:{fs(34)};align-items:center}}
.badge2{{padding:{fs(26)} {fs(50)};border-radius:{fs(60)};background:{P["acento"]};color:{P["fondo"]};font-family:"Archivo Black";font-size:{fs(60)}}}
.scale{{position:relative;width:{fs(700)};height:{fs(420)}}}
.beam{{position:absolute;left:{fs(50)};top:{fs(150)};width:{fs(600)};height:{fs(16)};border-radius:{fs(8)};background:{P["tinta"]}}}
.pan{{position:absolute;top:{fs(180)};width:{fs(240)};height:{fs(150)};border-radius:0 0 {fs(120)} {fs(120)};background:{P["tinta"]}22;border:{fs(6)} solid {P["tinta"]};display:flex;align-items:center;justify-content:center}}
.pan.l{{left:{fs(30)}}} .pan.r{{right:{fs(30)}}} .plab{{font-family:"Archivo Black";font-size:{fs(44)};text-align:center}}
.brandmark{{font-family:"Archivo Black";font-size:{fs(260)};letter-spacing:-0.05em}} .brandmark b{{color:{P["acento"]}}}
#caps{{position:absolute;z-index:10;{css(caps)};height:{fs(200)}}}
.capline{{position:absolute;left:0;right:0;text-align:center;font-family:"Archivo Black";font-size:{fs(68 if vertical else 56)};line-height:1.1;color:{P["tinta"]};visibility:hidden;text-shadow:0 {fs(4)} {fs(20)} #0008}}
.w{{display:inline-block;margin:0 .18em}}
.moon{{position:relative;width:{fs(460)};height:{fs(460)};border-radius:50%;background:radial-gradient(circle at 35% 30%, #F2F0E6, #B9B6AA 70%, #8E8B80);box-shadow:0 0 {fs(90)} #F2F0E655}}
.crater{{position:absolute;border-radius:50%;background:#0000001f;box-shadow:inset {fs(4)} {fs(4)} {fs(8)} #00000033}}
.poof{{position:absolute;opacity:0;width:{fs(200)};height:{fs(200)};border-radius:50%;border:{fs(8)} solid {P["acento"]}}}
.sea{{position:relative;width:{fs(760)};height:{fs(560)};border-radius:{fs(40)};overflow:hidden;background:{P["tinta"]}10;border:{fs(4)} solid {P["tinta"]}33}}
.wave{{position:absolute;left:-10%;width:120%;top:60%;height:100%;background:{P["agua"]};border-radius:40% 45% 0 0}}
.tidemark{{position:absolute;right:{fs(30)};top:{fs(30)};font-family:"Archivo Black";font-size:{fs(54)};color:{P["acento"]}}}
.earthwrap{{position:relative;width:{fs(600)};height:{fs(640)};display:flex;align-items:center;justify-content:center}}
.axis{{position:relative;width:{fs(380)};height:{fs(380)}}}
.earth{{position:absolute;inset:0;border-radius:50%;background:{P["agua"]};overflow:hidden;box-shadow:inset {fs(-40)} {fs(-20)} {fs(60)} #0006}}
.land{{position:absolute;background:#5BAA5E;border-radius:45% 55% 50% 40%}} .land.a{{left:15%;top:20%;width:40%;height:35%}} .land.b{{left:55%;top:58%;width:32%;height:28%}}
.pole{{position:absolute;left:50%;top:{fs(-70)};width:{fs(10)};margin-left:{fs(-5)};height:{fs(520)};background:{P["acento"]};border-radius:{fs(5)}}}
.sky{{position:absolute;inset:0}} .star{{position:absolute;border-radius:50%;background:#FFF8D6;box-shadow:0 0 8px #FFF8D6}}
.fracs{{display:flex;flex-direction:column;gap:{fs(46)};width:90%}}
.frow{{display:grid;grid-template-columns:{fs(230)} 1fr {fs(170)};align-items:center;gap:{fs(24)}}}
.flab{{font-family:"Archivo Black";font-size:{fs(48)}}} .fval{{font-family:"Archivo Black";font-size:{fs(52)};color:{P["acento"]}}}
.fbar{{height:{fs(60)};border-radius:{fs(30)};background:{P["tinta"]}1f;overflow:hidden}} .ffill{{height:100%;background:{P["acento"]};border-radius:{fs(30)}}}'''
doc=f'''<!doctype html>
<html lang="es"><head><meta charset="UTF-8" /><meta name="viewport" content="width={W}, height={H}" />
<script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
<style>
{CSS}
</style></head><body>
<div id="root" data-composition-id="main" data-start="0" data-duration="{total}" data-width="{W}" data-height="{H}">
 <audio id="vo" src="voz.wav" data-start="0" data-track-index="9" data-volume="1"></audio>
 {"".join(scenes_html)}
 <div id="caps" class="clip" data-start="0" data-duration="{total}" data-track-index="3">{"".join(cap)}</div>
</div>
<script>
const tl = gsap.timeline({{ paused: true }}); let S=0;
{chr(10).join(js)}
window.__timelines["main"] = tl;
tl.seek(0);
</script></body></html>'''
open(f"{out}/index.html","w").write(doc); print("escenas",n,"lineas subtitulo",len(lines),"total",total)
