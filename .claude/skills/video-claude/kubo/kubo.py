#!/usr/bin/env python3
"""Kubo Studio · animaciones 3D virales (estilo cabezón) desde un guion o una voz, gratis y en la nube.

Flujo (cada paso guarda su resultado en el proyecto; se puede repetir cualquiera):
  1. nuevo     guion → voz (Gemini TTS / Aura, o tu audio) → tiempos de cada palabra (Whisper)
  2. plan      borrador de tomas (escenario, cámara, actores, caras, acciones, subtítulos, sonido) → plan.json
               Claude lo mejora: es el «director» (lee references/kubo.md y edita plan.json).
  3. revisar   un cuadro de cada toma en una hoja (segundos) → corregir el plan antes de renderizar
  4. render    Blender (Workbench) cuadro por cuadro: borrador 540p · normal 720p · final 1080p
  5. exportar  subtítulos virales + textos en pantalla + música y efectos + voz → MP4 9:16 listo para Shorts/Reels/TikTok
  idiomas      una pista de audio por idioma (plan.idiomas): .m4a para YouTube, .srt y un MP4 por idioma,
               + versión global sin subtítulos quemados para subir a YouTube con todas las pistas
  todo         2→5 de una vez (si el plan ya existe, no lo pisa)

    python3 kubo.py nuevo NOMBRE --guion "texto o archivo.txt" [--voz audio.mp3] [--voz-motor gemini|aura]
                                 [--voz-nombre Puck] [--estilo-voz "divertido y rápido"]
    python3 kubo.py nuevo NOMBRE --sin-voz          (videos solo con texto, música y efectos; el plan lleva «dur»)
    python3 kubo.py plan NOMBRE [--forzar]
    python3 kubo.py revisar NOMBRE
    python3 kubo.py render NOMBRE [--calidad borrador|normal|final] [--tomas 2-4]
    python3 kubo.py exportar NOMBRE [--musica caricatura|pulso|vintage|cinematico|ninguna] [--densidad pocos|medios|muchos]
                                    [--sin-subtitulos] [--lufs -18]
    python3 kubo.py todo NOMBRE [--calidad ...] [--musica ...]
    python3 kubo.py estado NOMBRE

Proyecto: proyectos/kubo/NOMBRE/ (guion, voz, palabras.json, plan.json: va al repo)
Pesado:   datos/kubo/NOMBRE/ (cuadros, video final: no va al repo)
"""
import argparse
import json
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

AQUI = Path(__file__).resolve().parent
SKILL = AQUI.parent
REPO = SKILL.parent.parent.parent
sys.path.insert(0, str(SKILL / "scripts"))
BLENDER = next((str(p) for p in [Path("/opt/blender-dl/blender-4.2.3-linux-x64/blender")] if p.exists()), shutil.which("blender"))
FPS = 24
PASO = {"borrador": 2, "normal": 2, "final": 1}
FUENTE = "Inter ExtraBold"
# El personaje de la marca: cabeza de cubo turquesa, sudadera naranja y antena con foco que cambia de color con la
# emoción (amarillo feliz, rojo enojo, azul triste, blanco miedo, verde idea). Gag fijo: se le sale la cabeza del susto.
KUBO = {"piel": "#3dd6c6", "ropa": "#ff8c1a", "pantalon": "#24304a", "antena": True}


def proyecto(nombre):
    return REPO / "proyectos" / "kubo" / nombre


def pesado(nombre):
    return REPO / "datos" / "kubo" / nombre


def fallo(msg):
    sys.exit(f"Kubo: {msg}")


# ------------------------------------------------------------------ 1. nuevo: guion → voz → tiempos
def cmd_nuevo(a):
    p = proyecto(a.nombre)
    p.mkdir(parents=True, exist_ok=True)
    guion = a.guion or ""
    if guion and len(guion) < 250 and Path(guion).is_file():
        guion = Path(guion).read_text(encoding="utf-8")
    guion = " ".join(guion.split())
    (p / "guion.txt").write_text(guion + "\n", encoding="utf-8")
    if a.sin_voz:
        (p / "palabras.json").write_text("[]")
        print(f"Proyecto {a.nombre} sin voz: escribe plan.json con «dur» por toma (o usa `plan`).")
        return
    voz = p / "voz.mp3"
    if a.voz:
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", a.voz, "-ac", "1", "-ar", "44100", "-b:a", "160k", str(voz)], check=True)
        print("Voz: tu audio")
    else:
        if not guion:
            fallo("falta --guion (o --voz con tu audio)")
        import voz as vz
        try:
            print("Voz:", vz.narrar(guion, voz, a.voz_motor, a.voz_nombre, a.estilo_voz))
        except RuntimeError as e:
            fallo(f"{e}. Opciones: espera unos minutos y repite, usa --voz-motor aura, o graba tu voz y pásala con --voz.")
    import motion
    pal = motion.palabras_voz(voz)
    if guion and not a.voz:
        pal = corregir_con_guion(pal, guion)
    (p / "palabras.json").write_text(json.dumps(pal, ensure_ascii=False))
    dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(voz)],
                               capture_output=True, text=True).stdout or 0)
    print(f"Listo: {len(pal)} palabras con tiempo, voz de {dur:.1f} s → siguiente: python3 kubo.py plan {a.nombre}")


def corregir_con_guion(pal, guion):
    """Whisper a veces oye mal («el estufa»): donde el guion y lo oído coinciden en número de palabras, se usa la
    palabra del guion (con su acento y puntuación) y se conservan los tiempos de Whisper."""
    import difflib
    import unicodedata

    def n(x):
        x = unicodedata.normalize("NFD", x.lower())
        return re.sub(r"[^a-z0-9ñ]", "", "".join(c for c in x if unicodedata.category(c) != "Mn"))
    tg = guion.split()
    sm = difflib.SequenceMatcher(a=[n(w[0]) for w in pal], b=[n(x) for x in tg], autojunk=False)
    out = [list(w) for w in pal]
    for op, a1, a2, b1, b2 in sm.get_opcodes():
        if op in ("equal", "replace") and a2 - a1 == b2 - b1:
            for k in range(a2 - a1):
                out[a1 + k][0] = tg[b1 + k]
    return out


# ------------------------------------------------------------------ 2. plan: borrador automático
CAMARAS = ["medio+empuje", "cerca", "medio+orbita", "lejos+paneo", "cerca+empuje", "medio+picado", "medio+contrapicado"]
PISTAS = [  # (palabras, cara, accion, sfx)
    (r"dinero|rico|millon|gan[oóa]|premio|loter", "extasis", "celebrar", "tada"),
    (r"miedo|terror|fantasma|monstruo|grit", "miedo", "temblar", "grito"),
    (r"enoj|furios|odi|harto", "enojado", "quieto", "remate"),
    (r"trist|llor|perdi", "triste", "quieto", None),
    (r"jaja|risa|chiste|gracios", "risa", "celebrar", None),
    (r"dorm|sueño|cansad", "dormido", "quieto", "ronquido"),
    (r"comi|comer|hambre|pizza|malvavisco", "feliz", "comer", "masticar"),
    (r"corr|escap|huy", "miedo", "correr", "deslizar"),
    (r"salt|brinc", "feliz", "saltar", "boing"),
    (r"pens|idea|por qué|porque|cómo", "pensando", "pensar", None),
]


def _tramos_habla(ws, t0):
    out = []
    for _, a, b in ws:
        a, b = a - t0, b - t0
        if out and a - out[-1][1] < 0.25:
            out[-1][1] = round(b, 2)
        else:
            out.append([round(max(0, a), 2), round(b, 2)])
    return out


def cmd_plan(a):
    p = proyecto(a.nombre)
    if (p / "plan.json").exists() and not a.forzar:
        print(f"Ya hay plan.json (usa --forzar para rehacerlo): {p / 'plan.json'}")
        return
    pal = json.loads((p / "palabras.json").read_text()) if (p / "palabras.json").exists() else []
    grupos = []
    if pal:
        grupo = []
        for k, w in enumerate(pal):
            grupo.append(w)
            dur = grupo[-1][2] - grupo[0][1]
            if (w[0].endswith((".", "?", "!", "…", ",")) and dur > 1.0) or dur > 2.6 or k == len(pal) - 1:
                grupos.append(grupo)
                grupo = []
    else:
        grupos = [[] for _ in range(4)]
    plan = {"formato": "9:16", "estilo": "cabezon", "musica": "caricatura",
            "personajes": {"kubo": KUBO}, "tomas": []}
    inicios = [0.0] + [g[0][1] for g in grupos[1:] if g]
    fin_total = pal[-1][2] + 0.7 if pal else 0
    for i, ws in enumerate(grupos):
        texto = " ".join(w[0] for w in ws)
        t0 = inicios[i] if pal else 0.0
        cara, accion, sfx = ("normal" if i % 2 else "feliz"), "quieto", None
        for patron, c, ac, sx in PISTAS:
            if re.search(patron, texto.lower()):
                cara, accion, sfx = c, ac, sx
                break
        if texto.endswith("?") and cara in ("normal", "feliz"):
            cara = "pensando"
        if texto.endswith("!") and cara in ("normal", "feliz"):
            cara = "sorpresa"
        clave = max((w[0] for w in ws), key=lambda x: len(re.sub(r"\W", "", x)), default="")
        toma = {"texto": texto, "escenario": "cuarto", "camara": CAMARAS[i % len(CAMARAS)],
                "actores": [{"id": "kubo", "pos": [0, 0], "cara": cara, "accion": accion,
                             "habla": _tramos_habla(ws, t0)}],
                "props": [], "animo": "alegre", "sfx": [sfx] if sfx else [],
                "palabras": [{"t": round(w[1] - t0, 3), "p": ("*" + w[0]) if w[0] == clave else w[0]} for w in ws]}
        if pal:
            toma["dur"] = round((inicios[i + 1] if i + 1 < len(inicios) else fin_total) - t0, 3)
        else:
            toma.update(dur=2.0, cabecera="TEXTO ARRIBA", texto="")
        plan["tomas"].append(toma)
    (p / "plan.json").write_text(json.dumps(plan, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Borrador: {len(plan['tomas'])} tomas → {p / 'plan.json'}\n"
          f"Ahora Claude lo dirige (escenarios, personajes, props, cámaras, caras) y luego: python3 kubo.py revisar {a.nombre}")


# ------------------------------------------------------------------ tiempos exactos por cuadro
def cuadros_por_toma(plan, paso):
    """Inicio y número de cuadros de cada toma, redondeados al paso SIN acumular error (los subtítulos no se
    desfasan con la voz aunque se anime «en dos»)."""
    t, bordes = 0.0, [0]
    for toma in plan["tomas"]:
        t += toma["dur"]
        bordes.append(max(bordes[-1] + paso, round(t * FPS / paso) * paso))
    return [(bordes[k], bordes[k + 1] - bordes[k]) for k in range(len(plan["tomas"]))]


def sincronizar(plan, pal):
    """Tomas con «rango»: [primera, última] palabra de la voz → dur, palabras (subtítulos) y tramos de boca de los
    actores con «habla»: true. La clave (amarilla) es «clave» (texto de la palabra) o la palabra más larga."""
    if pal and any("frases" in t for t in plan["tomas"]):      # frases [a, b] → rango de palabras
        fines = [k for k, w in enumerate(pal) if re.search(r"[.!?]['\")»]*$", w[0])]
        inicios = [0] + [f + 1 for f in fines]
        for t in plan["tomas"]:
            if "frases" in t:
                fa, fb = t["frases"] if isinstance(t["frases"], list) else (t["frases"], t["frases"])
                t["rango"] = [inicios[fa], fines[fb] if fb < len(fines) else len(pal) - 1]
    if not pal or not any("rango" in t for t in plan["tomas"]):
        return plan
    total = pal[-1][2] + plan.get("cola", 0.7)
    rangos = [t.get("rango") for t in plan["tomas"]]
    for k, t in enumerate(plan["tomas"]):
        if not rangos[k]:
            continue
        a, b = rangos[k]
        ws = pal[a:b + 1]
        t0 = 0.0 if k == 0 else ws[0][1] - 0.08
        sig = next((rangos[q][0] for q in range(k + 1, len(rangos)) if rangos[q]), None)
        t1 = (pal[sig][1] - 0.08) if sig is not None else total
        t["dur"] = round(t1 - t0, 3)
        clave = t.get("clave") or max((w[0] for w in ws), key=lambda x: len(re.sub(r"\W", "", x)))
        t["palabras"] = [{"t": round(w[1] - t0, 3), "p": ("*" + w[0]) if re.sub(r"\W", "", w[0].lower()) ==
                          re.sub(r"\W", "", clave.lower()) else w[0]} for w in ws]
        t["texto"] = " ".join(w[0] for w in ws)
        if t.get("golpe_clave", True):              # la cámara da un «punch-in» cuando se dice la palabra clave
            t["golpe_en"] = next((w["t"] for w in t["palabras"] if w["p"].startswith("*")), None)
        for act in t.get("actores", []):
            if act.get("habla") is True:
                act["habla"] = _tramos_habla(ws, t0)
            elif act.get("habla") is None:
                act["habla"] = []
    return plan


SACUDE = {"impacto": 1.0, "vine_boom": 0.9, "remate": 0.45, "grito": 0.6, "fuego": 0.35, "boing": 0.2, "caida": 0.3,
          "grieta": 0.6}


def sacudidas(toma):
    """Momentos en que la cámara se sacude, sacados de los efectos de la toma (manuales y de los movimientos): la
    sacudida cae justo con el sonido, exagerada pero corta (≈0.3 s), para retener sin marear."""
    out = []
    for x in list(toma.get("sfx", [])) + sfx_de_movimientos(toma):
        x = {"tipo": x} if isinstance(x, str) else x
        k = SACUDE.get(x["tipo"])
        if not k:
            continue
        en = x.get("en", 0)
        if en == "clave":
            en = next((w["t"] for w in toma.get("palabras", []) if w["p"].startswith("*")), 0)
        out.append([float(en), k * x.get("sacude", 1.0)])
    return out


def _plan_con_cuadros(nombre, paso):
    plan = json.loads((proyecto(nombre) / "plan.json").read_text(encoding="utf-8"))
    pal = json.loads((proyecto(nombre) / "palabras.json").read_text()) if (proyecto(nombre) / "palabras.json").exists() else []
    plan = sincronizar(plan, pal)
    for toma, (ini, n) in zip(plan["tomas"], cuadros_por_toma(plan, paso)):
        toma["cuadro0"], toma["cuadros"] = ini, n
        toma["dur"] = n / FPS
        if toma.get("sacudir", True):
            toma["sacudidas"] = sacudidas(toma)
    return plan


def _blender(plan, salida, calidad, extra=()):
    if not BLENDER:
        fallo("no encuentro Blender. Instálalo con: bash ../scripts/instalar_blender.sh")
    caras = pesado("_caras")
    if not (caras / "normal_0.png").exists() or (AQUI / "caras.py").stat().st_mtime > (caras / "normal_0.png").stat().st_mtime:
        import caras as cr
        cr.generar(caras)
    tmp = salida / "_plan.json"
    salida.mkdir(parents=True, exist_ok=True)
    tmp.write_text(json.dumps(plan, ensure_ascii=False))
    cmd = [BLENDER, "-b", "--factory-startup", "-P", str(AQUI / "blender_escena.py"), "--", str(tmp), str(salida), str(caras),
           "--calidad", calidad, *extra]
    t0 = time.time()
    with subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True) as pr:
        log = []
        for linea in pr.stdout:
            log.append(linea)
            if linea.startswith("KUBO"):
                print(f"  {linea.strip()}  ({time.time() - t0:.0f} s)", flush=True)
    if pr.returncode != 0 or not any("KUBO listo" in x for x in log):
        print("".join(log[-30:]), file=sys.stderr)
        fallo("Blender falló (arriba están las últimas líneas). Suele ser un dato raro en plan.json.")
    return time.time() - t0


# ------------------------------------------------------------------ 3. revisar
def cmd_revisar(a):
    from PIL import Image, ImageDraw, ImageFont
    plan = _plan_con_cuadros(a.nombre, 1)
    out = pesado(a.nombre) / "control"
    shutil.rmtree(out, ignore_errors=True)
    s = _blender(plan, out, "borrador", ["--control"])
    ims = sorted(out.glob("control_*.png"))
    col = min(6, len(ims))
    w, h = 270, 480
    filas = (len(ims) + col - 1) // col
    hoja = Image.new("RGB", (col * (w + 6), filas * (h + 70)), "white")
    d = ImageDraw.Draw(hoja)
    f = ImageFont.truetype("/usr/share/fonts/opentype/inter/Inter-Bold.otf", 15)
    for k, ruta in enumerate(ims):
        x, y = (k % col) * (w + 6), (k // col) * (h + 70)
        hoja.paste(Image.open(ruta).resize((w, h)), (x, y))
        t = plan["tomas"][k]
        txt = f"{k + 1}. {t.get('camara', '')} · {t['dur']:.1f}s\n{(t.get('texto') or t.get('cabecera') or '')[:70]}"
        d.multiline_text((x + 4, y + h + 4), txt, fill="black", font=f, spacing=2)
    destino = pesado(a.nombre) / "control.jpg"
    hoja.save(destino, quality=85)
    print(f"Hoja de control ({len(ims)} tomas, {s:.0f} s): {destino}")


# ------------------------------------------------------------------ 4. render
def cmd_render(a):
    paso = PASO[a.calidad]
    plan = _plan_con_cuadros(a.nombre, paso)
    out = pesado(a.nombre) / "cuadros"
    if not a.tomas:
        shutil.rmtree(out, ignore_errors=True)
    total = sum(t["cuadros"] for t in plan["tomas"])
    print(f"Render {a.calidad}: {len(plan['tomas'])} tomas, {total} cuadros ({total / FPS:.1f} s), "
          f"{'1 de cada 2 cuadros (animado en dos)' if paso == 2 else 'todos los cuadros'}")
    s = _blender(plan, out, a.calidad, ["--tomas", a.tomas] if a.tomas else [])
    (pesado(a.nombre) / "render.json").write_text(json.dumps({"calidad": a.calidad, "paso": paso, "segundos": round(s)}))
    print(f"Render listo en {s / 60:.1f} min → siguiente: python3 kubo.py exportar {a.nombre}")


# ------------------------------------------------------------------ efectos pegados a los movimientos
def sfx_de_movimientos(toma):
    """Cada movimiento suena justo cuando pasa (coherencia imagen-sonido): saltos → boing en cada despegue,
    susto → grito + boing al salir la cabeza, caída → golpe al tocar el piso, correr → silbato, comer → masticar…"""
    out = []
    dur = toma["dur"]
    for act in toma.get("actores", []):
        gestos = sorted(act.get("gestos") or []) or [[0, act.get("accion", "quieto")]]
        for k, (tg, acc) in enumerate(gestos):
            fin = gestos[k + 1][0] if k + 1 < len(gestos) else dur
            if acc == "saltar":
                out += [{"tipo": "boing", "en": tg + j / 2.0 + 0.02, "vol": 0.4} for j in range(3) if tg + j / 2.0 < fin - 0.2]
            elif acc == "susto":
                te = tg + act.get("salto_en", 0.15)
                out += [{"tipo": "grito", "en": te, "vol": 0.4}, {"tipo": "boing", "en": te + 0.05, "vol": 0.45}]
            elif acc == "caer":
                out.append({"tipo": "impacto", "en": tg + 1 / 1.8, "vol": 0.5})
            elif acc == "correr":
                out.append({"tipo": "deslizar", "en": tg, "vol": 0.35})
            elif acc == "comer":
                out.append({"tipo": "masticar", "en": tg + 0.25, "vol": 0.4})
            elif acc == "golpe":
                out.append({"tipo": "remate", "en": tg, "vol": 0.55})
            elif acc in ("sorpresa", "celebrar") and k > 0:
                out.append({"tipo": "pop", "en": tg, "vol": 0.35})
            elif acc == "zapatear":
                out += [{"tipo": "remate", "en": tg + j / 4 + 0.12, "vol": 0.25} for j in range(int((fin - tg) * 4))]
    out += sfx_de_efectos(toma)
    ya = {(x if isinstance(x, str) else x.get("tipo")) for x in toma.get("sfx", [])}
    return [x for x in out if x["tipo"] not in ya and x["en"] < dur]


SON_SIGNO = {"!": "pop", "?": "burbuja", "idea": "destello", "$": "monedas", "x": "error", "ok": "correcto",
             "+": "correcto", "!?": "pop", "zzz": "ronquido"}
SON_PARTICULAS = {"monedas": "monedas", "estrellas": "destello", "confeti": "tada", "chispas": "remate",
                  "corazones": "burbuja", "gotas": "burbuja", "fuego": "fuego"}


def sfx_de_efectos(toma):
    """Cada efecto visual suena justo cuando aparece (sonido y imagen coherentes)."""
    out = []
    for ef in toma.get("efectos", []):
        en, tipo = ef.get("en", 0), ef.get("tipo")
        son = None
        if tipo == "signo":
            son = SON_SIGNO.get(ef.get("texto", "!"), "pop")
        elif tipo == "etiqueta":
            son = "pop"
        elif tipo == "particulas":
            son = SON_PARTICULAS.get(ef.get("clase"))
        elif tipo == "estallido":
            son = "remate"
            out.append({"tipo": "impacto", "en": en, "vol": 0.35})
        elif tipo == "grieta":
            son = "grieta"
        elif tipo == "flecha":
            son = "swoosh"
        elif tipo == "indicador":
            for tt, col in sorted(ef.get("colores", []))[1:]:
                verde = col.lower() in ("#2ecc71", "#27ae60", "#00c853", "#4caf50", "#7dff6b")
                out.append({"tipo": "correcto" if verde else "error", "en": tt})
        if son and ef.get("sonido", True):
            out.append({"tipo": ef.get("sonido") if isinstance(ef.get("sonido"), str) else son, "en": en})
    return out


# ------------------------------------------------------------------ 5. exportar
def _ts(x):
    h, r = divmod(max(0, x), 3600)
    m, s = divmod(r, 60)
    return f"{int(h)}:{int(m):02d}:{s:05.2f}"


def _limpia(p):
    return p.replace("*", "").replace("{", "").replace("}", "")


def subtitulos_ass(plan, destino, ancho, alto, con_subs=True):
    """Subtítulos virales (1-3 palabras en mayúsculas, la clave en amarillo, con «pop») + textos en pantalla
    (cabecera arriba y barra de opciones con la activa en verde)."""
    tam = int(ancho * 0.085)
    cab = [
        "[Script Info]", "ScriptType: v4.00+", f"PlayResX: {ancho}", f"PlayResY: {alto}", "WrapStyle: 2", "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, "
        "Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, "
        "MarginV, Encoding",
        f"Style: Sub,{FUENTE},{tam},&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,1,0,0,0,100,100,0,0,1,{tam // 11},{tam // 22},5,40,40,0,1",
        f"Style: Cab,{FUENTE},{int(tam * 0.95)},&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,1,0,0,0,100,100,0,0,1,{tam // 10},0,8,40,40,{int(alto * 0.07)},1",
        "", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"]
    ev = []
    y_sub = int(alto * 0.68)
    for toma in plan["tomas"]:
        t0, t1 = toma["cuadro0"] / FPS, (toma["cuadro0"] + toma["cuadros"]) / FPS
        if toma.get("cabecera"):
            ev.append(f"Dialogue: 1,{_ts(t0)},{_ts(t1)},Cab,,0,0,0,,{{\\fad(60,0)}}{_limpia(toma['cabecera']).upper()}")
        if toma.get("barra"):
            b = toma["barra"]
            partes = [("{\\c&H38D94A&}" if k == b.get("activa", 0) else "{\\c&HFFFFFF&}") + _limpia(o)
                      for k, o in enumerate(b["opciones"])]
            ev.append(f"Dialogue: 1,{_ts(t0)},{_ts(t1)},Cab,,0,0,0,,{'   '.join(partes)}")
        if not con_subs or toma.get("sin_subtitulos"):
            continue
        ps = toma.get("palabras") or []
        grupos, g = [], []
        for w in ps:
            g.append(w)
            if len(g) >= 3 or w["p"].rstrip("*").endswith((".", ",", "?", "!", "…")) or w["p"].startswith("*"):
                grupos.append(g)
                g = []
        if g:
            grupos.append(g)
        for k, g in enumerate(grupos):
            a = t0 + g[0]["t"]
            b = min(t1, t0 + grupos[k + 1][0]["t"]) if k + 1 < len(grupos) else t1
            b = min(b, a + 1.6)
            txt = " ".join(("{\\c&H00D7FF&\\fscx112\\fscy112}" + _limpia(w["p"]).upper() + "{\\c&HFFFFFF&\\fscx100\\fscy100}")
                           if w["p"].startswith("*") else _limpia(w["p"]).upper() for w in g)
            ev.append(f"Dialogue: 0,{_ts(a)},{_ts(b)},Sub,,0,0,0,,{{\\an5\\pos({ancho // 2},{y_sub})"
                      f"\\fscx70\\fscy70\\t(0,90,\\fscx100\\fscy100)}}{txt}")
    destino.write_text("\n".join(cab + ev) + "\n", encoding="utf-8")
    return destino


def _escenas_banda(plan):
    escenas = [{"dur": t["dur"], "palabras": t.get("palabras", []),
                "animo": t.get("animo") or ("alegre" if t is plan["tomas"][0] else None),
                "sfx": list(t.get("sfx", [])) + (sfx_de_movimientos(t) if plan.get("sfx_auto", True) else []),
                "transicion": t.get("transicion", "corte"), "titular": t.get("titular")} for t in plan["tomas"]]
    if plan.get("swoosh_cortes", True):           # swoosh corto en cada corte de cámara (ritmo de edición)
        for e in escenas[1:]:
            e["sfx"] = [{"tipo": "swoosh", "en": -0.14, "vol": 0.2}] + list(e["sfx"])
    if plan.get("firma", True) and escenas:   # firma sonora al inicio y al final (reconocimiento de marca y loop)
        escenas[0]["sfx"] = [{"tipo": "firma", "en": 0, "vol": 0.35}] + list(escenas[0]["sfx"])
        escenas[-1]["sfx"] = list(escenas[-1]["sfx"]) + [{"tipo": "firma", "en": max(0, escenas[-1]["dur"] - 1.3)}]
    return escenas


def _mezclar(voz, banda, total, salida, lufs):
    """Voz + banda → una pista (WAV) a «lufs» LUFS, de la duración exacta del video."""
    if voz:
        ent = ["-i", str(banda), "-i", str(voz)]
        f = ("[1:a]aresample=44100,pan=stereo|c0=c0|c1=c0[vz];[vz][0:a]amix=inputs=2:normalize=0:duration=longest,"
             f"atrim=0:{total:.3f},apad=whole_dur={total:.3f},loudnorm=I={lufs}:TP=-1.5:LRA=11[a]")
    else:
        ent = ["-i", str(banda)]
        f = f"[0:a]atrim=0:{total:.3f},apad=whole_dur={total:.3f},loudnorm=I={lufs}:TP=-1.5:LRA=11[a]"
    r = subprocess.run(["ffmpeg", "-y", "-v", "error", *ent, "-filter_complex", f, "-map", "[a]", "-ar", "48000",
                        str(salida)], capture_output=True, text=True)
    if r.returncode != 0:
        fallo("ffmpeg falló al mezclar el audio: " + r.stderr[-500:])
    return salida


def _codificar(cuadros, paso, ass, audio, total, ancho, alto, salida):
    sub = f"ass={ass}:fontsdir=/usr/share/fonts/opentype/inter," if ass else ""
    filtro = f"[0:v]fps={FPS},scale={ancho}:{alto}:flags=lanczos,{sub}format=yuv420p[v]"
    cmd = ["ffmpeg", "-y", "-v", "error", "-framerate", str(FPS / paso), "-pattern_type", "glob",
           "-i", str(cuadros / "t*_*.png"), "-i", str(audio), "-filter_complex", filtro, "-map", "[v]", "-map", "1:a",
           "-c:v", "libx264", "-preset", "medium", "-crf", "21", "-maxrate", "6M", "-bufsize", "12M", "-profile:v", "high",
           "-level", "4.1", "-color_range", "tv", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
           "-tag:v", "avc1", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-t", f"{total:.3f}",
           "-movflags", "+faststart", str(salida)]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        fallo("ffmpeg falló al exportar: " + r.stderr[-600:])
    return salida


def _preparar_export(nombre):
    info = json.loads((pesado(nombre) / "render.json").read_text()) if (pesado(nombre) / "render.json").exists() else None
    if not info:
        fallo(f"primero renderiza: python3 kubo.py render {nombre}")
    plan = _plan_con_cuadros(nombre, info["paso"])
    cuadros = pesado(nombre) / "cuadros"
    if not list(cuadros.glob("t*_*.png")):
        fallo("no hay cuadros renderizados")
    ancho, alto = (1080, 1920) if plan.get("formato", "9:16") == "9:16" else (1920, 1080)
    total = sum(t["cuadros"] for t in plan["tomas"]) / FPS
    return info["paso"], plan, cuadros, ancho, alto, total


def cmd_exportar(a):
    import sonido
    paso, plan, cuadros, ancho, alto, total = _preparar_export(a.nombre)
    p, w = proyecto(a.nombre), pesado(a.nombre)
    voz = p / "voz.mp3" if (p / "voz.mp3").exists() else None
    estilo = a.musica or plan.get("musica", "caricatura")
    banda = w / "banda.wav"
    sonido.banda(_escenas_banda(plan), str(voz) if voz else None, banda,
                 estilo=estilo if estilo != "ninguna" else "caricatura", con_musica=estilo != "ninguna",
                 densidad=a.densidad, stems=w / "stems")
    ass = subtitulos_ass(plan, w / "subtitulos.ass", ancho, alto, not a.sin_subtitulos)
    idioma = plan.get("idioma", "en")
    audio = _mezclar(voz, banda, total, w / f"audio_{idioma}.wav", a.lufs)
    salida = _codificar(cuadros, paso, ass, audio, total, ancho, alto, w / f"{a.nombre}.mp4")
    import motion
    motion.escribir_srt([{"dur": t["dur"], "palabras": t.get("palabras", [])} for t in plan["tomas"]], w / f"subtitulos_{idioma}.srt")
    shutil.copy(ass, p / "subtitulos.ass")
    print(f"Video listo ({total:.1f} s, {salida.stat().st_size / 1e6:.1f} MB): {salida}\n"
          f"Pistas separadas (música, efectos) en {w / 'stems'}")


# ------------------------------------------------------------------ 6. idiomas: una pista de audio por idioma
def _duracion(ruta):
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0",
                                 str(ruta)], capture_output=True, text=True).stdout or 0)


def _leer(ruta, sr=44100):
    import numpy as np
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(ruta), "-ac", "1", "-ar", str(sr), "-f", "f32le", "-"],
                         capture_output=True).stdout
    return np.frombuffer(raw, np.float32).astype(np.float64)


def voz_idioma(plan, nombre, idioma, cfg, forzar=False):
    """Voz en otro idioma acomodada a las tomas del video (que ya está renderizado en el idioma base).

    Por toma: la frase traducida empieza donde empezaba la voz original; si dura más que el espacio de la toma se
    acelera (hasta 1.35×) para no pisar la siguiente. Devuelve (wav de voz, palabras por toma con tiempos)."""
    import numpy as np
    import soundfile as sf
    import motion
    import voz as vz
    carpeta = proyecto(nombre) / "idiomas" / idioma
    carpeta.mkdir(parents=True, exist_ok=True)
    textos = cfg["tomas"]
    if len(textos) != len(plan["tomas"]):
        fallo(f"idioma {idioma}: hay {len(textos)} textos y {len(plan['tomas'])} tomas (debe haber uno por toma)")
    guion = " ".join(t for t in textos if t)
    bruta = carpeta / "voz_bruta.mp3"
    previo = (carpeta / "guion.txt").read_text(encoding="utf-8") if (carpeta / "guion.txt").exists() else None
    if forzar or not bruta.exists() or previo != guion:
        print(f"  {idioma}: voz…", flush=True)
        try:
            print("  ", vz.narrar(guion, bruta, cfg.get("motor", "gemini"), cfg.get("voz", "Puck"), cfg.get("estilo", "")))
        except RuntimeError as e:
            fallo(f"{e}. Opciones: espera unos minutos, usa \"motor\": \"aura\" en el idioma, o graba la voz.")
        (carpeta / "guion.txt").write_text(guion, encoding="utf-8")
        pal = corregir_con_guion(motion.palabras_voz(bruta), guion)
        (carpeta / "palabras.json").write_text(json.dumps(pal, ensure_ascii=False))
    pal = json.loads((carpeta / "palabras.json").read_text())
    sr = 44100
    x = _leer(bruta, sr)
    total = sum(t["cuadros"] for t in plan["tomas"]) / FPS
    pista = np.zeros(int((total + 1) * sr))
    i, palabras_tomas = 0, []
    for k, (toma, texto) in enumerate(zip(plan["tomas"], textos)):
        n = len(texto.split()) if texto else 0
        ws = pal[i:i + n]
        i += n
        t0 = toma["cuadro0"] / FPS
        t1 = t0 + toma["cuadros"] / FPS
        if not ws:
            palabras_tomas.append([])
            continue
        a_, b_ = max(0.0, ws[0][1] - 0.04), ws[-1][2] + 0.12
        seg = x[int(a_ * sr):int(b_ * sr)]
        inicio = t0 + (toma["palabras"][0]["t"] if toma.get("palabras") else 0.08)
        hueco = max(0.3, t1 - inicio - 0.08)
        necesario = len(seg) / sr / hueco
        if necesario > 1.35:
            print(f"  AVISO {idioma} toma {k + 1}: la traducción es {necesario:.2f}× más larga que el espacio; "
                  f"acórtala (máximo 1.35×)", flush=True)
        factor = min(1.35, max(1.0, necesario))
        if factor > 1.0:                                    # acelerar sin cambiar el tono
            tmp_in, tmp_out = carpeta / "_seg.wav", carpeta / "_seg2.wav"
            sf.write(str(tmp_in), seg, sr)
            subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(tmp_in), "-filter:a", f"atempo={factor:.3f}",
                            str(tmp_out)], check=True)
            seg = _leer(tmp_out, sr)
        j = int(inicio * sr)
        pista[j:j + len(seg)] += seg[: len(pista) - j]
        lab = clave_idioma(cfg, k, ws)
        palabras_tomas.append([{"t": round(inicio - t0 + (w[1] - a_) / factor, 3),
                                "p": ("*" + w[0]) if lab and re.sub(r"\W", "", w[0].lower()) == lab else w[0]} for w in ws])
    salida = carpeta / "voz.wav"
    sf.write(str(salida), pista[: int(total * sr)].clip(-1, 1), sr)
    return salida, palabras_tomas


def clave_idioma(cfg, k, ws):
    claves = cfg.get("claves") or []
    c = claves[k] if k < len(claves) and claves[k] else max((w[0] for w in ws), key=lambda x: len(re.sub(r"\W", "", x)))
    return re.sub(r"\W", "", c.lower())


def cmd_idiomas(a):
    """Por cada idioma de plan["idiomas"]: pista de audio (voz + música + efectos) para subirla a YouTube como
    «pista de audio» del mismo video, subtítulos .srt y un MP4 con subtítulos quemados (TikTok/Reels/Facebook).
    Además: versión global sin subtítulos quemados (la que se sube a YouTube con todas las pistas)."""
    import sonido
    import motion
    paso, plan, cuadros, ancho, alto, total = _preparar_export(a.nombre)
    w = pesado(a.nombre)
    idiomas = plan.get("idiomas") or {}
    pedidos = a.solo.split(",") if a.solo else list(idiomas)
    base = plan.get("idioma", "en")
    voz_base = proyecto(a.nombre) / "voz.mp3"
    estilo = a.musica or plan.get("musica", "caricatura")
    salidas = {}
    # versión global: idioma base sin subtítulos quemados (cabeceras sí, si no dependen del idioma)
    banda = w / f"banda_{base}.wav"
    sonido.banda(_escenas_banda(plan), str(voz_base) if voz_base.exists() else None, banda,
                 estilo=estilo if estilo != "ninguna" else "caricatura", con_musica=estilo != "ninguna", densidad=a.densidad)
    audio_base = _mezclar(voz_base if voz_base.exists() else None, banda, total, w / f"audio_{base}.wav", a.lufs)
    _codificar(cuadros, paso, None, audio_base, total, ancho, alto, w / f"{a.nombre}_global.mp4")
    for idioma in pedidos:
        cfg = idiomas.get(idioma)
        if not cfg:
            fallo(f"no hay traducción para «{idioma}» en plan.json (plan.idiomas.{idioma}.tomas)")
        print(f"Idioma {idioma}:", flush=True)
        voz, pals = voz_idioma(plan, a.nombre, idioma, cfg, a.forzar)
        plan_l = json.loads(json.dumps(plan))
        for t, ps, k in zip(plan_l["tomas"], pals, range(len(pals))):
            t["palabras"] = ps
            if cfg.get("cabeceras") and k < len(cfg["cabeceras"]):
                t["cabecera"] = cfg["cabeceras"][k]
        banda_l = w / f"banda_{idioma}.wav"
        sonido.banda(_escenas_banda(plan_l), str(voz), banda_l, estilo=estilo if estilo != "ninguna" else "caricatura",
                     con_musica=estilo != "ninguna", densidad=a.densidad)
        audio = _mezclar(voz, banda_l, total, w / f"audio_{idioma}.wav", a.lufs)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(audio), "-c:a", "aac", "-b:a", "192k",
                        str(w / f"audio_{idioma}.m4a")], check=True)
        motion.escribir_srt([{"dur": t["dur"], "palabras": t["palabras"]} for t in plan_l["tomas"]], w / f"subtitulos_{idioma}.srt")
        ass = subtitulos_ass(plan_l, w / f"subtitulos_{idioma}.ass", ancho, alto, True)
        _codificar(cuadros, paso, ass, audio, total, ancho, alto, w / f"{a.nombre}_{idioma}.mp4")
        salidas[idioma] = str(w / f"{a.nombre}_{idioma}.mp4")
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(audio_base), "-c:a", "aac", "-b:a", "192k",
                    str(w / f"audio_{base}.m4a")], check=True)
    print(json.dumps({"global (YouTube, sin subtítulos quemados)": str(w / f"{a.nombre}_global.mp4"),
                      "pistas de audio (YouTube → Idiomas → Agregar audio)": sorted(str(x) for x in w.glob("audio_*.m4a")),
                      "subtítulos .srt": sorted(str(x) for x in w.glob("subtitulos_*.srt")),
                      "un MP4 por idioma (TikTok/Reels/Facebook)": salidas}, ensure_ascii=False, indent=1))


def cmd_todo(a):
    if not (proyecto(a.nombre) / "plan.json").exists():
        cmd_plan(a)
    cmd_render(a)
    cmd_exportar(a)


def cmd_estado(a):
    p, w = proyecto(a.nombre), pesado(a.nombre)
    pasos = [("guion", p / "guion.txt"), ("voz", p / "voz.mp3"), ("tiempos", p / "palabras.json"), ("plan", p / "plan.json"),
             ("control", w / "control.jpg"), ("render", w / "render.json"), ("video", w / f"{a.nombre}.mp4")]
    for nombre, ruta in pasos:
        print(f"{'✔' if ruta.exists() else '·'} {nombre:8s} {ruta if ruta.exists() else ''}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    for n in ("nuevo", "plan", "revisar", "render", "exportar", "idiomas", "todo", "estado"):
        s = sub.add_parser(n)
        s.add_argument("nombre")
        if n == "nuevo":
            s.add_argument("--guion")
            s.add_argument("--voz")
            s.add_argument("--sin-voz", action="store_true")
            s.add_argument("--voz-motor", default="gemini", choices=["gemini", "aura"])
            s.add_argument("--voz-nombre")
            s.add_argument("--estilo-voz", default="")
        if n in ("plan", "todo"):
            s.add_argument("--forzar", action="store_true")
        if n in ("render", "todo"):
            s.add_argument("--calidad", default="normal", choices=list(PASO))
            s.add_argument("--tomas")
        if n == "idiomas":
            s.add_argument("--solo", help="idiomas separados por coma (por defecto todos los del plan)")
            s.add_argument("--forzar", action="store_true", help="rehacer la voz aunque ya exista")
        if n in ("exportar", "todo", "idiomas"):
            s.add_argument("--musica")
            s.add_argument("--densidad", default="pocos", choices=["pocos", "medios", "muchos"])
            s.add_argument("--sin-subtitulos", action="store_true")
            s.add_argument("--lufs", type=float, default=-18)
    a = ap.parse_args()
    globals()[f"cmd_{a.cmd}"](a)


if __name__ == "__main__":
    main()
