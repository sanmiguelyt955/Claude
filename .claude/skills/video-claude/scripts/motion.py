#!/usr/bin/env python3
"""Motion graphics con código (Remotion): reels animados (modo «reel») y collages con capas y cámara (modo «collage»).

    python3 motion.py reel    guion.json --salida out/reel.mp4    [--marca brands/x.json] [--voz voz.mp3] [--musica m.mp3]
    python3 motion.py collage guion.json --salida out/collage.mp4 [--marca ...] [--voz ...] [--musica ...]
    Opciones: --formato 9:16|16:9|1:1|4:5   --control (solo cuadros de control, rápido)   --nombre trabajo

Qué hace:
1. Copia imágenes, voz y música a una carpeta de trabajo (datos/motion/<nombre>/public).
2. Collage: recorta el fondo verde o azul de las capas marcadas con "croma": true (o detectado en las esquinas).
3. Con --voz: transcribe con Whisper (palabras con tiempos) y ajusta la duración de cada escena y la entrada de
   cada palabra al ritmo de la voz (el texto de cada escena debe ser lo que se dice en ella).
4. --control: render rápido a baja resolución y una hoja con cuadros de control de cada escena (revisar ANTES).
5. Render final a 1080 px (o el formato pedido) con -14 LUFS si hay audio.
"""
import argparse
import json
import re
import shutil
import subprocess
import sys
import unicodedata
from pathlib import Path

SKILL = Path(__file__).resolve().parent.parent
REMOTION = SKILL / "remotion"
REPO = SKILL.parent.parent.parent
TRABAJOS = REPO / "datos" / "motion"
CHROMIUM = "/opt/pw-browsers/chromium"
FORMATOS = {"9:16": (1080, 1920), "16:9": (1920, 1080), "1:1": (1080, 1080), "4:5": (1080, 1350)}


def fallo(msg):
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(1)


def marca_desde(archivo):
    """brands/<x>.json (formato de la skill) → props de Remotion."""
    if not archivo:
        return None
    d = json.loads(Path(archivo).read_text(encoding="utf-8"))
    c = d.get("colors", {})
    return {k: v for k, v in {
        "primary": c.get("primary"), "accent": c.get("accent"), "text": c.get("text"), "secondary": c.get("secondary"),
        "font": d.get("font_body"), "font_title": d.get("font_title"),
    }.items() if v}


def copiar(origen, public, nombre=None):
    origen = Path(origen).expanduser()
    if not origen.is_absolute():
        origen = (Path.cwd() / origen)
    if not origen.is_file():
        fallo(f"No existe {origen}")
    destino = public / (nombre or re.sub(r"[^A-Za-z0-9._-]", "_", origen.name))
    if not destino.exists() or destino.stat().st_size != origen.stat().st_size:
        shutil.copy2(origen, destino)
    return destino.name


# ----------------------------------------------------------------- croma (fondo verde / azul)

def _color_fondo(img):
    """Color medio de las esquinas si es claramente verde o azul; si no, None."""
    import numpy as np
    a = np.asarray(img.convert("RGB"), dtype=np.float32)
    h, w = a.shape[:2]
    k = max(4, min(h, w) // 25)
    esquinas = np.concatenate([a[:k, :k].reshape(-1, 3), a[:k, -k:].reshape(-1, 3), a[-k:, :k].reshape(-1, 3), a[-k:, -k:].reshape(-1, 3)])
    for muestra in (esquinas, a.reshape(-1, 3)):
        r, g, b = muestra[:, 0], muestra[:, 1], muestra[:, 2]
        verdes = (g > 60) & (g > r * 1.35) & (g > b * 1.2)
        azules = (b > 90) & (b > r * 1.35) & (b > g * 1.15)
        # esquinas: casi todas de color croma; imagen entera (p. ej. un marco con el hueco verde): al menos 20 %
        umbral = 0.6 if muestra is esquinas else 0.2
        if verdes.mean() > umbral:
            return "verde", tuple(muestra[verdes].mean(axis=0))
        if azules.mean() > umbral:
            return "azul", tuple(muestra[azules].mean(axis=0))
    return None


VERSION_RECORTE = 5   # súbela al cambiar el algoritmo: invalida los recortes guardados


def _mascara_croma(a, nombre):
    """0 = sujeto … 1 = fondo, por TONO (no por brillo): las sombras verde oscuro y el viñeteado negro de las
    esquinas que pinta la IA cuentan como fondo, aunque no sean «verde puro»."""
    import numpy as np
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx, mn = a.max(-1), a.min(-1)
    sat = (mx - mn) / (mx + 1e-6)
    c, o1, o2 = (g, r, b) if nombre == "verde" else (b, r, g)
    dom = (c - np.maximum(o1, o2)) / (c + 1e-6)          # dominancia RELATIVA del canal croma (vale igual en la sombra)
    t = np.clip((dom - 0.12) / 0.22, 0, 1) * np.clip((sat - 0.18) / 0.2, 0, 1)
    t = np.maximum(t, np.clip((dom - 0.3) / 0.2, 0, 1) * np.clip((45 - mx) / 25, 0, 1))   # sombra oscura MUY teñida
    # Por tono: el croma iluminado desparejo (manchas lima/amarillentas o turquesa) sigue siendo fondo
    hue = np.degrees(np.arctan2(np.sqrt(3) * (g - b), 2 * r - g - b)) % 360
    lo, hi = (62, 168) if nombre == "verde" else (195, 250)     # verde: de lima a verde puro, sin turquesa ni azul
    dentro = np.minimum(hue - lo, hi - hue)
    t_hue = np.clip(dentro / 12, 0, 1) * np.clip((sat - 0.3) / 0.15, 0, 1) * np.clip((mx - 45) / 30, 0, 1)
    # Sombra de contacto casi negra pero teñida de croma y sin nada de rojo (la madera, la piel o un traje sí tienen)
    dif = (g - r) if nombre == "verde" else (b - r)
    t_hue = np.maximum(t_hue, np.clip((dif - 10) / 8, 0, 1) * np.clip((dif / (mx + 1e-6) - 0.4) / 0.15, 0, 1) * (mx < 50))
    oscuro = np.clip((22 - mx) / 12, 0, 1)                   # casi negro (viñeta): fondo solo si toca el borde (abajo)
    return t, t_hue, oscuro


def recortar_croma(origen, destino, forzar=False):
    """PNG con transparencia. Fondo = croma conectado con el borde (incluye sombras verdes, viñeta de esquina y manchas
    del croma mal iluminado). Dentro del objeto NO se borra nada salvo croma verde muy saturado y grande: el vidrio,
    el metal y los reflejos claros se conservan. El borde es suave (sin escalera) y se quita el reflejo verde."""
    import numpy as np
    from PIL import Image
    from scipy import ndimage as nd
    img = Image.open(origen).convert("RGB")
    tipo = _color_fondo(img)
    if not tipo:
        if not forzar:
            return False
        tipo = ("verde", (0, 177, 64))
    nombre = tipo[0]
    a = np.asarray(img, dtype=np.float32)
    h, w = a.shape[:2]
    t_dom, t_hue, oscuro = _mascara_croma(a, nombre)
    t = np.maximum(t_dom, t_hue)
    mx, mn = a.max(-1), a.min(-1)
    sat = (mx - mn) / (mx + 1e-6)
    # 1) Fondo exterior: croma conectado con el borde de la imagen
    lab, _ = nd.label(t > 0.35)
    borde = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    exterior = np.isin(lab, borde[borde > 0])
    fondo = np.where(exterior, t, 0.0)
    # 2) Viñeta: lo casi negro solo si está en una esquina y conectado con ella
    lab_o, _ = nd.label(oscuro > 0.35)
    k = max(3, min(h, w) // 40)
    esq = np.unique(np.concatenate([lab_o[:k, :k].ravel(), lab_o[:k, -k:].ravel(), lab_o[-k:, :k].ravel(), lab_o[-k:, -k:].ravel()]))
    fondo = np.maximum(fondo, np.where(np.isin(lab_o, esq[esq > 0]) & (oscuro > 0.35), oscuro, 0.0))
    # 3) Huecos interiores: solo croma verde SATURADO y grande (no vidrio, metal ni reflejos claros)
    # Verde/turquesa intenso y GRANDE dentro del objeto (p. ej. el hueco vacío de un marco) = fondo; el brillo pequeño
    # de un vidrio o metal (lupa) se queda.
    verdoso = (a[..., 1] >= a[..., 0]) & (a[..., 1] >= a[..., 2] * 0.9) & (sat > 0.4)
    interior = (((t_dom > 0.95) & (sat > 0.7)) | (verdoso & (t_dom > 0.5)))
    lab_i, n_i = nd.label(interior & ~exterior)
    if n_i:
        areas = nd.sum(np.ones_like(t), lab_i, range(1, n_i + 1))
        grandes = np.isin(lab_i, 1 + np.flatnonzero(areas >= h * w * 0.03))
        fondo = np.maximum(fondo, np.where(grandes, np.maximum(t_dom, 0.9 * verdoso), 0.0))
    # 4) Islas sueltas de sujeto (manchas) fuera
    sujeto = fondo < 0.5
    lab_s, n_s = nd.label(sujeto)
    if n_s:
        areas = nd.sum(sujeto, lab_s, range(1, n_s + 1))
        keep = 1 + np.flatnonzero(areas >= max(areas.max() * 0.003, 150))
        sujeto_ok = np.isin(lab_s, keep)
        fondo = np.where(sujeto_ok, fondo, 1.0)
    # 5) Alfa suave: transición de 0.1 a 0.9 de croma, sin binarizar (así no hay escalera)
    alfa = 1 - np.clip((fondo - 0.1) / 0.8, 0, 1)
    alfa = nd.gaussian_filter(alfa.astype(np.float32), 0.6)
    # 6) Despill: quita el verde del objeto; en los bordes semitransparentes, más fuerte
    ci = 1 if nombre == "verde" else 2
    otros = np.maximum(a[..., 0], a[..., 2]) if ci == 1 else np.maximum(a[..., 0], a[..., 1])
    borde_px = (alfa < 0.98)
    tope = otros + np.where(borde_px, 4, 16)
    a[..., ci] = np.minimum(a[..., ci], tope)
    out = np.dstack([a, alfa * 255]).clip(0, 255).astype(np.uint8)
    im = Image.fromarray(out, "RGBA")
    caja = im.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    if caja:
        im = im.crop(caja)
    im.save(destino)
    return True


# ----------------------------------------------------------------- alinear con la voz

def _norm(p):
    p = unicodedata.normalize("NFD", p.lower())
    return re.sub(r"[^a-z0-9ñ]", "", "".join(c for c in p if unicodedata.category(c) != "Mn"))


def palabras_voz(voz):
    sys.path.insert(0, str(REPO))
    import vision_local as vl
    from faster_whisper import WhisperModel
    wav = Path(voz).with_suffix(".16k.wav")
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(voz), "-ac", "1", "-ar", "16000", str(wav)], check=True)
    segs, _ = WhisperModel("small", device="cpu", compute_type="int8").transcribe(
        vl.leer_wav_16k(wav), word_timestamps=True, vad_filter=True)
    pal = [(w.word.strip(), float(w.start), float(w.end)) for s in segs for w in (s.words or []) if w.word.strip()]
    wav.unlink(missing_ok=True)
    return pal


def _marcar_claves(ps):
    """«*Torre Eiffel*» → «*Torre*», «*Eiffel*» (claves de varias palabras), igual que marcarClaves en comun.tsx."""
    out, dentro = [], False
    for p in ps:
        abre = p.startswith("*")
        cierra = bool(re.search(r"\*[.,!?;:…]*$", p)) and (len(p) > 1 or dentro)
        base = re.sub(r"\*([.,!?;:…]*)$", r"\1", p.lstrip("*"))
        clave = dentro or abre
        if abre and not cierra:
            dentro = True
        elif cierra:
            dentro = False
        out.append(re.sub(r"([.,!?;:…]*)$", r"*\1", "*" + base, count=1) if clave else base)
    return out


def alinear(escenas, pal, total):
    """Reparte las palabras de la voz entre las escenas en orden (según cuántas palabras dice cada una: «texto», o los
    «items» de una lista) y fija la duración de cada escena y el momento en que entra cada palabra.
    Con voz, toda escena debería tener lo que se dice en ella; las que no tienen texto conservan su «dur»."""
    i = 0
    tramos = []                              # (inicio_voz, fin_voz) de cada escena o None
    for e in escenas:
        texto = _marcar_claves((e.get("texto") or " ".join(e.get("items") or [])).split())
        if not texto or i >= len(pal):
            tramos.append(None)
            continue
        j = min(len(pal), i + len(texto))
        ultima = _norm(texto[-1])            # tolera 1-2 palabras de más o de menos de Whisper
        for k in sorted(range(max(i + 1, j - 2), min(len(pal), j + 2) + 1), key=lambda k: abs(k - j)):
            if _norm(pal[k - 1][0]) == ultima:
                j = k
                break
        trozo = pal[i:j]
        tramos.append((trozo[0][1], trozo[-1][2], trozo, texto))
        i = j
    t = 0.0
    for k, e in enumerate(escenas):
        tr = tramos[k]
        if tr is None:
            e["dur"] = e.get("dur", 2.0)
            t += e["dur"]
            continue
        ini_voz, fin_voz, trozo, texto = tr
        sig = next((tramos[q][0] for q in range(k + 1, len(escenas)) if tramos[q]), None)
        fin = (sig - 0.12) if sig is not None else max(total, fin_voz + 0.6)
        e["dur"] = round(max(0.8, fin - t), 3)
        if e.get("texto"):
            tiempos = [w[1] for w in trozo] + [trozo[-1][1]] * (len(texto) - len(trozo))
            e["palabras"] = [{"t": round(max(0.02, tt - t), 3), "p": w} for w, tt in zip(texto, tiempos)]
        t += e["dur"]
    return escenas


# ----------------------------------------------------------------- render

def render(modo, props, public, salida, ancho, alto, escala=1.0):
    comp = "Reel" if modo == "reel" else "Collage"
    fprops = public.parent / "props.json"
    fprops.write_text(json.dumps(props, ensure_ascii=False), encoding="utf-8")
    if not (REMOTION / "node_modules").is_dir():
        subprocess.run(["npm", "install", "--no-audit", "--no-fund"], cwd=REMOTION, check=True)
    cmd = ["npx", "remotion", "render", "src/index.ts", comp, str(salida), f"--props={fprops}", f"--public-dir={public}",
           f"--width={ancho}", f"--height={alto}", f"--scale={escala}", "--concurrency=4", "--log=error",
           f"--browser-executable={CHROMIUM}", "--chromium-options=--no-sandbox"]
    r = subprocess.run(cmd, cwd=REMOTION, capture_output=True, text=True)
    if r.returncode != 0:
        fallo(f"Remotion falló:\n{(r.stderr or r.stdout)[-1500:]}")
    return salida


def hoja_control(video, escenas, destino):
    """Cuadros de control: inicio, mitad y final de cada escena, con su tiempo."""
    from PIL import Image, ImageDraw
    tiempos, t = [], 0.0
    for e in escenas:
        d = e["dur"]
        tiempos += [t + 0.25, t + d * 0.5, t + max(d - 0.15, 0.3)]
        t += d
    tmp = destino.parent / "control_tmp"
    tmp.mkdir(exist_ok=True)
    cuadros = []
    for k, tt in enumerate(tiempos):
        f = tmp / f"c{k:03d}.jpg"
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", f"{tt:.2f}", "-i", str(video), "-frames:v", "1", str(f)], check=True)
        if f.is_file():
            cuadros.append((tt, f))
    if not cuadros:
        return None
    w0, h0 = Image.open(cuadros[0][1]).size
    ancho = 300
    alto = round(h0 * ancho / w0)
    cols = 3
    filas = (len(cuadros) + cols - 1) // cols
    hoja = Image.new("RGB", (cols * ancho + (cols - 1) * 6, filas * (alto + 34)), "black")
    d = ImageDraw.Draw(hoja)
    for k, (tt, f) in enumerate(cuadros):
        x, y = (k % cols) * (ancho + 6), (k // cols) * (alto + 34)
        hoja.paste(Image.open(f).convert("RGB").resize((ancho, alto)), (x, y + 30))
        d.text((x + 6, y + 6), f"Escena {k // 3 + 1} · {int(tt // 60):02d}:{tt % 60:05.2f}", fill="yellow")
    hoja.save(destino, quality=88)
    shutil.rmtree(tmp, ignore_errors=True)
    return destino


def para_movil(video, audio=True):
    """Deja el MP4 reproducible en cualquier celular (iPhone incluido) y ligero para mandarlo o subirlo:
    H.264 High 4.1, yuv420p de rango limitado (Remotion saca yuvj420p, que iOS rechaza), ~6 Mbps máx., faststart,
    y audio a -14 LUFS."""
    tmp = video.with_suffix(".tmp.mp4")
    cmd = ["ffmpeg", "-y", "-v", "error", "-i", str(video),
           "-vf", "scale=in_range=full:out_range=tv,format=yuv420p", "-c:v", "libx264", "-preset", "medium", "-crf", "23",
           "-maxrate", "4M", "-bufsize", "8M", "-profile:v", "high", "-level", "4.1", "-color_range", "tv",
           "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-tag:v", "avc1"]
    cmd += ["-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-c:a", "aac", "-b:a", "192k", "-ar", "48000"] if audio else ["-an"]
    r = subprocess.run(cmd + ["-movflags", "+faststart", str(tmp)], capture_output=True)
    if r.returncode == 0:
        tmp.replace(video)
    else:
        print("Aviso: no se pudo convertir para móvil:", r.stderr.decode()[-300:], file=sys.stderr)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("modo", choices=["reel", "collage"])
    ap.add_argument("guion")
    ap.add_argument("--salida")
    ap.add_argument("--marca")
    ap.add_argument("--voz")
    ap.add_argument("--musica")
    ap.add_argument("--banda", action="store_true",
                    help="banda sonora propia (sonido.py): música por «animo» de escena + efectos «sfx» + whoosh y ducking")
    ap.add_argument("--formato", default="9:16", choices=list(FORMATOS))
    ap.add_argument("--control", action="store_true", help="solo render rápido + hoja de cuadros de control")
    ap.add_argument("--nombre")
    a = ap.parse_args()

    guion_path = Path(a.guion).resolve()
    props = json.loads(guion_path.read_text(encoding="utf-8"))
    base = guion_path.parent
    nombre = a.nombre or guion_path.stem
    trabajo = TRABAJOS / nombre
    public = trabajo / "public"
    public.mkdir(parents=True, exist_ok=True)
    marca = marca_desde(a.marca)
    if marca:
        props["marca"] = {**props.get("marca", {}), **marca}

    if a.modo == "collage":
        for e in props.get("escenas", []):
            for c in e.get("capas", []):
                src = Path(c["src"])
                src = src if src.is_absolute() else base / src
                if not src.is_file():
                    fallo(f"Falta la imagen {src}")
                croma = c.pop("croma", None)
                if croma is not False:
                    destino = public / (re.sub(r"[^A-Za-z0-9._-]", "_", src.stem) + f"_recorte{VERSION_RECORTE}.png")
                    if (destino.is_file() and destino.stat().st_mtime >= src.stat().st_mtime) or \
                            recortar_croma(src, destino, forzar=bool(croma)):
                        c["src"] = destino.name
                        continue
                c["src"] = copiar(src, public)

    total = 0.0
    if a.voz:
        props["voz"] = copiar(a.voz, public, "voz" + Path(a.voz).suffix.lower())
        total = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0",
                                      str(public / props["voz"])], capture_output=True, text=True).stdout or 0)
        print(f"Transcribiendo la voz ({total:.1f} s) para sincronizar escenas y palabras…", file=sys.stderr)
        props["escenas"] = alinear(props["escenas"], palabras_voz(public / props["voz"]), total)
    if a.musica:
        props["musica"] = copiar(a.musica, public, "musica" + Path(a.musica).suffix.lower())
    if a.banda:
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        import sonido
        for e in props.get("escenas", []):
            e.setdefault("dur", 3)
        _, secciones = sonido.banda(props["escenas"], public / props["voz"] if props.get("voz") else None, public / "banda.wav")
        props["musica"], props["volumenMusica"] = "banda.wav", 1.0
        print("Banda sonora:", ", ".join(f"{a_}@{t0:.1f}s" for a_, t0, _ in secciones), file=sys.stderr)
    for e in props.get("escenas", []):
        e.setdefault("dur", 3)

    ancho, alto = FORMATOS[a.formato]
    duracion = sum(e["dur"] for e in props["escenas"])
    if a.control:
        prev = trabajo / "control.mp4"
        render(a.modo, props, public, prev, ancho, alto, escala=0.4)
        hoja = hoja_control(prev, props["escenas"], trabajo / "control.jpg")
        print(json.dumps({"control_video": str(prev), "hoja_control": str(hoja), "duracion": round(duracion, 2),
                          "escenas": [{"n": i + 1, "dur": e["dur"]} for i, e in enumerate(props["escenas"])]}, ensure_ascii=False))
        return
    salida = Path(a.salida or (trabajo / f"{nombre}.mp4")).resolve()
    salida.parent.mkdir(parents=True, exist_ok=True)
    render(a.modo, props, public, salida, ancho, alto)
    para_movil(salida, audio=bool(a.voz or a.musica or a.banda))
    print(json.dumps({"salida": str(salida), "duracion": round(duracion, 2), "formato": a.formato}, ensure_ascii=False))


if __name__ == "__main__":
    main()
