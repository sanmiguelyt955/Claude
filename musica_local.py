"""Qué canción le queda a un video: motor local, sin APIs.

- Canciones (tu biblioteca): BPM, pulsos, tonalidad, curva de energía, clímax, voces/instrumental, ánimo y género
  (CLAP zero-shot) y huellas CLAP por ventanas de 10 s. Se guarda en musica/ (índice JSON + embeddings .npy).
- Video: duración, cortes, movimiento por segundo, tramos con voz, clímax, BPM sugerido por el ritmo de los cortes,
  ambiente visual (CLIP zero-shot) y huella visual CLIP.
- Recomendación: mezcla de (1) parecido entre la descripción buscada y el sonido (CLAP texto→audio), (2) tempo,
  (3) forma de la energía y clímax alineados con el video, (4) pulsos sobre los cortes, (5) voces vs. habla del video,
  y (6) tu gusto aprendido (calificaciones 👍/👎 y ejemplos tuyos o virales, por parecido visual).
- Montaje: ffmpeg con la canción desde el mejor punto, fundidos, ducking bajo la voz y -14 LUFS.
"""
import hashlib
import json
import math
import shutil
import subprocess
import time
from functools import lru_cache
from pathlib import Path

import numpy as np

RAIZ = Path(__file__).resolve().parent
import os
MUSICA = Path(os.environ.get("VIDEO_NUBE_MUSICA", RAIZ / "musica"))   # biblioteca y gusto aprendido (en el repo)
CANCIONES = MUSICA / "canciones"
EMB = MUSICA / "emb"
INDICE = MUSICA / "biblioteca.json"
GUSTOS = MUSICA / "gustos.json"
EJEMPLOS = MUSICA / "ejemplos.json"
MONTAJES = RAIZ / "datos" / "musica" / "montajes"
FORMATOS_AUDIO = {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".oga", ".flac", ".opus", ".wma", ".aiff", ".aif"}

MODELO_CLIP = "openai/clip-vit-base-patch32"
VENTANA, SALTO = 10.0, 5.0          # ventanas CLAP de las canciones (s)
MAX_CANCION = 420.0                 # analiza hasta 7 min

ANIMOS = {
    "alegre": "happy cheerful upbeat music", "triste": "sad melancholic music", "energético": "energetic powerful driving music",
    "tranquilo": "calm relaxing peaceful music", "romántico": "romantic tender love song", "épico": "epic cinematic dramatic music",
    "oscuro": "dark tense suspenseful music", "divertido": "funny playful quirky music", "nostálgico": "nostalgic emotional music",
    "agresivo": "aggressive intense heavy music", "soñador": "dreamy ethereal atmospheric music",
    "motivador": "motivational inspiring uplifting music",
}
GENEROS = {
    "pop": "pop music", "reggaetón": "reggaeton music", "hip hop": "hip hop rap music", "trap": "trap music",
    "electrónica": "electronic dance music EDM", "rock": "rock music with electric guitars", "acústica": "acoustic guitar music",
    "lo-fi": "lofi chill hip hop beats", "orquestal": "cinematic orchestral music", "latina": "latin music",
    "cumbia": "cumbia music", "regional mexicano": "mexican regional music corridos with trumpets and accordion",
    "jazz": "jazz music", "clásica": "classical piano music", "funk": "funk music", "r&b": "r&b soul music",
}
AMBIENTES_VIDEO = {
    "alegre": "a happy cheerful moment", "triste": "a sad emotional moment", "divertido": "a funny silly moment",
    "fiesta": "a party celebration", "romántico": "a romantic couple", "acción/deporte": "sports or fast action",
    "naturaleza tranquila": "a calm nature landscape", "ciudad/noche": "a city at night", "comida": "food and cooking",
    "producto": "a product showcase advertisement", "tutorial": "a person explaining a tutorial to the camera",
    "lujo/moda": "luxury fashion and style", "viaje": "travel adventure", "mascotas": "cute pets and animals",
    "niños/familia": "kids and family at home", "fitness": "a workout at the gym", "suspenso": "a scary dark scene",
}
# Del ambiente visual a una descripción de música (para CLAP) cuando no se da una descripción
MUSICA_PARA_AMBIENTE = {
    "alegre": "happy upbeat pop music", "triste": "sad emotional piano music", "divertido": "funny playful quirky music",
    "fiesta": "energetic party dance music", "romántico": "romantic soft love song", "acción/deporte": "intense energetic rock or EDM",
    "naturaleza tranquila": "calm ambient acoustic music", "ciudad/noche": "chill night lofi or synthwave",
    "comida": "light happy acoustic music", "producto": "modern upbeat commercial music",
    "tutorial": "soft background lofi music without vocals", "lujo/moda": "elegant deep house fashion music",
    "viaje": "uplifting adventurous indie music", "mascotas": "cute playful ukulele music",
    "niños/familia": "happy playful family music", "fitness": "high energy workout music", "suspenso": "dark suspense music",
}


class ErrorMusica(Exception):
    pass


# ----------------------------------------------------------------- utilidades

def _cargar(p, sr, ini=0.0, fin=None):
    import escucha_local as E
    return E.cargar(p, sr, ini, fin)


def _duracion(p):
    o = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)],
                       capture_output=True, text=True)
    try:
        return float(o.stdout.strip())
    except ValueError:
        raise ErrorMusica(f"No se pudo leer {p}")


def _id(p):
    h = hashlib.sha1()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()[:12]


def _norm(v):
    v = np.asarray(v, dtype=np.float32)
    n = np.linalg.norm(v, axis=-1, keepdims=True)
    return v / np.maximum(n, 1e-9)


def _leer(f, defecto):
    try:
        return json.loads(f.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return defecto


def _escribir(f, datos):
    f.parent.mkdir(parents=True, exist_ok=True)
    tmp = f.with_suffix(".tmp")
    tmp.write_text(json.dumps(datos, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(f)


def mmss(t):
    t = max(0.0, float(t))
    return f"{int(t // 60):02d}:{int(t % 60):02d}"


def _suave(x, k=3):
    if len(x) < k:
        return np.asarray(x, dtype=float)
    return np.convolve(x, np.ones(k) / k, mode="same")


def _escala01(x):
    x = np.asarray(x, dtype=float)
    if len(x) == 0:
        return x
    lo, hi = np.percentile(x, 5), np.percentile(x, 95)
    return np.clip((x - lo) / max(hi - lo, 1e-9), 0, 1)


# ----------------------------------------------------------------- modelos (CLAP compartido con escucha_local)

def _clap():
    import escucha_local as E
    return E._clap()


def clap_audio(trozos, sr=48000):
    """Embeddings CLAP (normalizados) de una lista de trozos de audio a 48 kHz."""
    import torch
    proc, model = _clap()
    out = []
    for i in range(0, len(trozos), 8):
        x = proc(audio=list(trozos[i:i + 8]), sampling_rate=sr, return_tensors="pt", padding=True)
        with torch.no_grad():
            e = model.get_audio_features(**{k: v for k, v in x.items() if k in ("input_features", "is_longer")})
        out.append(getattr(e, "pooler_output", e).numpy())
    return _norm(np.concatenate(out))


@lru_cache(maxsize=256)
def _clap_texto_uno(t):
    import torch
    proc, model = _clap()
    x = proc(text=[t], return_tensors="pt", padding=True)
    with torch.no_grad():
        e = model.get_text_features(input_ids=x["input_ids"], attention_mask=x["attention_mask"])
    return _norm(getattr(e, "pooler_output", e).numpy()[0])


def clap_texto(textos):
    return np.stack([_clap_texto_uno(t) for t in textos])


@lru_cache(maxsize=1)
def _clip():
    from transformers import CLIPModel, CLIPProcessor
    return CLIPProcessor.from_pretrained(MODELO_CLIP), CLIPModel.from_pretrained(MODELO_CLIP).eval()


def clip_imagenes(rutas):
    import torch
    from PIL import Image
    proc, model = _clip()
    ims = [Image.open(r).convert("RGB") for r in rutas]
    x = proc(images=ims, return_tensors="pt")
    with torch.no_grad():
        e = model.get_image_features(pixel_values=x["pixel_values"])
    return _norm(getattr(e, "pooler_output", e).numpy())


@lru_cache(maxsize=4)
def _clip_texto(textos):
    import torch
    proc, model = _clip()
    x = proc(text=list(textos), return_tensors="pt", padding=True)
    with torch.no_grad():
        e = model.get_text_features(input_ids=x["input_ids"], attention_mask=x["attention_mask"])
    return _norm(getattr(e, "pooler_output", e).numpy())


def _etiquetas(emb, vocab, temp=100.0, top=3):
    """Zero-shot: similitud coseno contra un vocabulario, softmax con temperatura (como CLAP/CLIP)."""
    nombres = list(vocab)
    s = emb @ clap_texto([vocab[n] for n in nombres]).T
    p = np.exp((s - s.max()) * temp)
    p = p / p.sum()
    orden = np.argsort(-p)[:top]
    return [(nombres[i], round(float(p[i]), 2)) for i in orden]


# ----------------------------------------------------------------- canciones

_PERFILES_TONO = {  # Krumhansl-Kessler
    "mayor": np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]),
    "menor": np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]),
}
_NOTAS = ["Do", "Do#", "Re", "Re#", "Mi", "Fa", "Fa#", "Sol", "Sol#", "La", "La#", "Si"]


def _tonalidad(y, sr):
    import librosa
    croma = librosa.feature.chroma_cqt(y=y, sr=sr).mean(axis=1)
    mejor = (-2, "", "")
    for modo, perfil in _PERFILES_TONO.items():
        for k in range(12):
            r = np.corrcoef(croma, np.roll(perfil, k))[0, 1]
            if r > mejor[0]:
                mejor = (r, _NOTAS[k], modo)
    return f"{mejor[1]} {mejor[2]}"


_ETIQUETAS_VOZ = {"Singing", "Male singing", "Female singing", "Child singing", "Choir", "Rapping", "Vocal music",
                  "A capella", "Speech", "Yodeling", "Humming", "Chant"}


def _voces(ruta, dur):
    """Proporción de la canción con voz cantada o rapeada (AudioSet), en ~12 ventanas de 2 s."""
    import escucha_local as E
    ev = E.eventos(ruta, dur, paso=max(1.0, dur / 12), top=12)
    con = [max([pr for et, pr in e["sonidos"] if et in _ETIQUETAS_VOZ] or [0]) for e in ev if e["db"] > E.SILENCIO_DB]
    return round(float(np.mean([v > 0.25 for v in con])), 2) if con else 0.0


def analizar_cancion(ruta, nombre=None):
    """Analiza una canción y devuelve su ficha (sin los embeddings, que se devuelven aparte)."""
    import librosa
    ruta = Path(ruta)
    dur = min(_duracion(ruta), MAX_CANCION)
    sr = 22050
    y = _cargar(ruta, sr, 0, dur)
    if len(y) < sr * 3:
        raise ErrorMusica(f"{ruta.name}: demasiado corta")
    tempo, beats = librosa.beat.beat_track(y=y, sr=sr, units="time")
    bpm = float(np.atleast_1d(tempo)[0])
    while 0 < bpm < 60:            # sin batería librosa suele dar la mitad o la cuarta parte
        bpm *= 2
        beats = np.sort(np.concatenate([beats, (beats[:-1] + beats[1:]) / 2])) if len(beats) > 1 else beats
    rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=sr // 2)[0]          # 2 valores por segundo
    energia = _escala01(_suave(rms, 3))
    # clímax / "drop": mayor subida sostenida de energía (después de los primeros 5 s)
    e1 = energia[::2] if len(energia) > 1 else energia
    subida = np.convolve(np.diff(e1, prepend=e1[0]), np.ones(4), mode="same") + 0.5 * e1
    k0 = min(5, max(0, len(subida) - 1))
    climax = float(np.argmax(subida[k0:]) + k0) if len(subida) else 0.0
    # huellas CLAP por ventanas
    y48 = _cargar(ruta, 48000, 0, dur)
    inicios = list(np.arange(0, max(dur - VENTANA, 0) + 1e-6, SALTO)) or [0.0]
    trozos = [y48[int(t * 48000):int((t + VENTANA) * 48000)] for t in inicios]
    emb = clap_audio(trozos)
    global_ = _norm(emb.mean(axis=0))
    pv = _voces(ruta, dur)
    ficha = {
        "nombre": nombre or ruta.stem, "archivo": ruta.name, "duracion": round(dur, 2),
        "bpm": round(bpm, 1) if bpm > 0 else None, "pulsos": [round(float(b), 2) for b in beats],
        "tonalidad": _tonalidad(y, sr), "energia": [round(float(v), 2) for v in energia],
        "energia_media": round(float(energia.mean()), 2), "climax": climax,
        "voces": pv,
        "animo": _etiquetas(global_, ANIMOS), "genero": _etiquetas(global_, GENEROS),
        "ventanas": [round(float(t), 2) for t in inicios],
    }
    return ficha, emb


def biblioteca():
    return _leer(INDICE, {"canciones": {}})


def _emb_cancion(cid):
    return np.load(EMB / f"{cid}.npy")


def agregar_canciones(rutas, copiar=True):
    """Analiza y guarda en la biblioteca (musica/). Copia el archivo a musica/canciones/ para poder montarlo luego."""
    bib = biblioteca()
    hechos, errores = [], []
    for r in rutas:
        r = Path(r)
        try:
            if not r.is_file() or r.suffix.lower() not in FORMATOS_AUDIO | {".mp4", ".mov", ".webm", ".mkv"}:
                raise ErrorMusica(f"{r}: no es un archivo de audio")
            cid = _id(r)
            if cid in bib["canciones"]:
                hechos.append({"id": cid, "nombre": bib["canciones"][cid]["nombre"], "ya_estaba": True})
                continue
            ficha, emb = analizar_cancion(r)
            if copiar:
                CANCIONES.mkdir(parents=True, exist_ok=True)
                destino = CANCIONES / f"{cid}_{r.name}"
                if not destino.exists():
                    shutil.copy2(r, destino)
                ficha["archivo"] = destino.name
            EMB.mkdir(parents=True, exist_ok=True)
            np.save(EMB / f"{cid}.npy", emb.astype(np.float16))
            ficha["agregada"] = time.strftime("%Y-%m-%d")
            bib["canciones"][cid] = ficha
            _escribir(INDICE, bib)
            hechos.append({"id": cid, "nombre": ficha["nombre"], "bpm": ficha["bpm"], "tonalidad": ficha["tonalidad"],
                           "animo": ficha["animo"], "genero": ficha["genero"], "voces": ficha["voces"]})
        except Exception as e:  # una canción rota no detiene las demás
            errores.append({"archivo": str(r), "error": str(e)[:300]})
    return {"agregadas": hechos, "errores": errores, "total_biblioteca": len(bib["canciones"])}


def ruta_cancion(cid):
    c = biblioteca()["canciones"].get(cid)
    if not c:
        raise ErrorMusica(f"No hay canción con id {cid} en la biblioteca")
    p = CANCIONES / c["archivo"]
    if not p.is_file():
        raise ErrorMusica(f"La ficha de «{c['nombre']}» existe pero falta su archivo ({p.name}): vuelve a adjuntarla")
    return p


# ----------------------------------------------------------------- video

def _movimiento(p, dur, fps=4):
    """Movimiento por segundo (0-1): diferencia media entre cuadros pequeños en gris."""
    w, h = 64, 36
    o = subprocess.run(["ffmpeg", "-v", "error", "-i", str(p), "-vf", f"fps={fps},scale={w}:{h},format=gray",
                        "-f", "rawvideo", "-"], capture_output=True)
    a = np.frombuffer(o.stdout, dtype=np.uint8)
    n = len(a) // (w * h)
    if n < 2:
        return np.zeros(max(1, int(math.ceil(dur))))
    a = a[:n * w * h].reshape(n, w * h).astype(np.float32)
    d = np.abs(np.diff(a, axis=0)).mean(axis=1)
    d = np.concatenate([[d[0]], d])
    seg = int(math.ceil(n / fps))
    por_s = np.array([d[i * fps:(i + 1) * fps].mean() for i in range(seg)])
    return _escala01(_suave(por_s, 3))


def _bpm_por_cortes(cortes, dur):
    """BPM sugerido para que los cortes caigan en pulsos: el plano típico = 2, 4 u 8 pulsos."""
    if len(cortes) < 4:
        return None
    planos = np.diff([0.0] + list(cortes) + [dur])
    planos = planos[planos > 0.3]
    if not len(planos):
        return None
    plano = float(np.median(planos))
    candidatos = [60 * n / plano for n in (1, 2, 4, 8, 16)]
    validos = [b for b in candidatos if 70 <= b <= 170]
    return round(min(validos, key=lambda b: abs(b - 115)), 1) if validos else None


def perfil_video(video_path):
    """Lo que la música tiene que acompañar: ritmo de edición, movimiento, voz, clímax y ambiente."""
    import vision_local as vl
    p = vl._ruta(video_path)
    meta = vl.metadatos(p)
    dur = meta["duracion_segundos"]
    cortes = []
    for c in vl._cortes(p, 0, dur):
        if not cortes or c - cortes[-1] > 0.6:
            cortes.append(c)
    mov = _movimiento(p, dur)
    voz = []
    if meta["tiene_audio"]:
        trans = vl.transcripcion(p, meta)
        voz = [(round(s["inicio"], 2), round(s["fin"], 2)) for s in trans["segmentos"]]
    hablado = sum(b - a for a, b in voz) / max(dur, 1e-6)
    # clímax: máximo de movimiento suavizado (y más cortes cerca), fuera de los 2 primeros segundos
    dens = np.zeros(len(mov))
    for c in cortes:
        dens[min(int(c), len(dens) - 1)] += 1
    intensidad = _suave(mov, 3) + 0.3 * _escala01(_suave(dens, 3))
    k0 = min(2, len(intensidad) - 1)
    climax = float(np.argmax(intensidad[k0:]) + k0)
    # ambiente visual con CLIP (1 cuadro cada ~dur/12 s)
    n = int(min(12, max(3, dur)))
    tiempos = [dur * (i + 0.5) / n for i in range(n)]
    carpeta = vl.SALIDA / vl._id(p) / "musica"
    carpeta.mkdir(parents=True, exist_ok=True)
    rutas = []
    for t in tiempos:
        f = carpeta / f"c_{t:.2f}.jpg"
        if not f.is_file():
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{t:.3f}", "-i", str(p), "-frames:v", "1",
                            "-vf", "scale=336:-2", str(f)], check=True)
        rutas.append(f)
    vis = clip_imagenes(rutas)
    vis_global = _norm(vis.mean(axis=0))
    nombres = list(AMBIENTES_VIDEO)
    s = vis_global @ _clip_texto(tuple(AMBIENTES_VIDEO[k] for k in nombres)).T
    pr = np.exp((s - s.max()) * 100)
    pr = pr / pr.sum()
    ambiente = [(nombres[i], round(float(pr[i]), 2)) for i in np.argsort(-pr)[:3]]
    ritmo = len(cortes) / max(dur, 1e-6) * 10
    bpm_cortes = _bpm_por_cortes(cortes, dur)
    m = float(mov.mean())
    rango = (125, 160) if m > 0.55 or ritmo > 4 else (95, 125) if m > 0.3 or ritmo > 1.5 else (65, 100)
    return {
        "video": str(p), "duracion": round(dur, 2), "cortes": [round(c, 2) for c in cortes],
        "cortes_por_10s": round(ritmo, 1), "bpm_sugerido": bpm_cortes,
        "bpm_rango": [bpm_cortes * 0.92, bpm_cortes * 1.08] if bpm_cortes else list(rango),
        "bpm_origen": "ritmo de los cortes" if bpm_cortes else "energía y movimiento del video",
        "movimiento": [round(float(v), 2) for v in mov], "movimiento_medio": round(float(mov.mean()), 2),
        "climax": climax, "voz": voz, "proporcion_hablada": round(hablado, 2),
        "ambiente_visual": ambiente, "_huella_visual": vis_global,
    }


# ----------------------------------------------------------------- gusto aprendido

def _gusto_vector():
    """Rocchio en el espacio CLAP: media de lo que te gustó menos (la mitad de) lo que no."""
    g = _leer(GUSTOS, {"calificaciones": []})
    bien, mal = [], []
    for c in g["calificaciones"]:
        try:
            v = _norm(_emb_cancion(c["cancion"]).astype(np.float32).mean(axis=0))
        except FileNotFoundError:
            continue
        (bien if c["me_gusta"] else mal).append(v)
    if not bien and not mal:
        return None, 0
    v = (np.mean(bien, axis=0) if bien else 0) - 0.5 * (np.mean(mal, axis=0) if mal else 0)
    return _norm(v), len(bien) + len(mal)


def _ejemplos_parecidos(huella, k=3):
    """Ejemplos (tuyos o virales) con video parecido: devuelven la huella CLAP de la música que llevaban."""
    ej = _leer(EJEMPLOS, {"ejemplos": []})["ejemplos"]
    res = []
    for e in ej:
        f = EMB / f"ej_{e['id']}.npz"
        if not f.is_file():
            continue
        d = np.load(f)
        sim = float(huella @ d["visual"].astype(np.float32))
        peso = sim * (1.5 if e.get("viral") else 1.0) * (1.2 if e.get("mio") else 1.0)
        res.append((peso, sim, e, _norm(d["musica"].astype(np.float32))))
    res.sort(key=lambda z: -z[0])
    return [r for r in res[:k] if r[1] > 0.75]


def calificar(video_path, cancion_id, me_gusta, comentario=""):
    if cancion_id not in biblioteca()["canciones"]:
        raise ErrorMusica(f"No hay canción con id {cancion_id}")
    g = _leer(GUSTOS, {"calificaciones": []})
    g["calificaciones"].append({"video": Path(str(video_path)).name, "cancion": cancion_id, "me_gusta": bool(me_gusta),
                                "comentario": comentario, "fecha": time.strftime("%Y-%m-%d %H:%M")})
    _escribir(GUSTOS, g)
    _, n = _gusto_vector()
    return {"guardado": True, "calificaciones_totales": n}


def aprender_ejemplo(video_path, nota="", viral=False, mio=True, cancion_id=None):
    """Guarda un video ya editado como ejemplo: su huella visual + la de la música que lleva (o la canción indicada)."""
    import vision_local as vl
    import escucha_local as E
    p = vl._ruta(video_path)
    perfil = perfil_video(p)
    if cancion_id:
        musica = _norm(_emb_cancion(cancion_id).astype(np.float32).mean(axis=0))
        origen = "biblioteca"
    else:
        meta = vl.metadatos(p)
        if not meta["tiene_audio"]:
            raise ErrorMusica("El video no tiene audio: indica cancion_id de la biblioteca")
        dur = meta["duracion_segundos"]
        y = E.cargar(p, 48000)
        trozos = [y[int(t * 48000):int((t + VENTANA) * 48000)] for t in np.arange(0, max(dur - VENTANA, 0) + 1e-6, SALTO)] or [y]
        musica = _norm(clap_audio(trozos).mean(axis=0))
        origen = "audio del video"
    eid = _id(p)
    EMB.mkdir(parents=True, exist_ok=True)
    np.savez(EMB / f"ej_{eid}.npz", visual=perfil["_huella_visual"].astype(np.float16), musica=musica.astype(np.float16))
    ej = _leer(EJEMPLOS, {"ejemplos": []})
    ej["ejemplos"] = [e for e in ej["ejemplos"] if e["id"] != eid]
    ficha = {"id": eid, "video": p.name, "nota": nota, "viral": bool(viral), "mio": bool(mio), "musica_de": origen,
             "cancion": cancion_id, "ambiente_visual": perfil["ambiente_visual"],
             "animo_musica": _etiquetas(musica, ANIMOS), "genero_musica": _etiquetas(musica, GENEROS),
             "fecha": time.strftime("%Y-%m-%d")}
    ej["ejemplos"].append(ficha)
    _escribir(EJEMPLOS, ej)
    return {**ficha, "ejemplos_totales": len(ej["ejemplos"])}


# ----------------------------------------------------------------- recomendación

def _mejor_inicio(c, perfil, emb, objetivo):
    """Desde qué segundo de la canción empezar: energía parecida a la del video, clímax de la canción sobre el
    clímax del video, pulsos sobre los cortes y el sonido de esa parte parecido a lo buscado."""
    dur_v = perfil["duracion"]
    dur_c = c["duracion"]
    ener = np.array(c["energia"])            # 2 valores/s
    mov = np.array(perfil["movimiento"])     # 1 valor/s
    pulsos = np.array(c["pulsos"])
    cortes = np.array(perfil["cortes"])
    candidatos = sorted({0.0, *[round(float(b), 2) for b in pulsos if b <= max(dur_c - dur_v, 0)]})
    if len(candidatos) > 120:
        candidatos = candidatos[::math.ceil(len(candidatos) / 120)]
    mejor = None
    for t0 in candidatos:
        tramo = ener[int(t0 * 2):int((t0 + dur_v) * 2)][::2]
        if len(tramo) < min(len(mov), 3):
            continue
        n = min(len(tramo), len(mov))
        forma = float(np.corrcoef(tramo[:n], mov[:n])[0, 1]) if n > 2 and np.std(tramo[:n]) > 1e-6 and np.std(mov[:n]) > 1e-6 else 0.0
        nivel = 1 - abs(float(tramo[:n].mean()) - perfil["movimiento_medio"])
        clim = 1 - min(abs((c["climax"] - t0) - perfil["climax"]) / max(dur_v, 1), 1) if t0 <= c["climax"] <= t0 + dur_v else 0.0
        if len(cortes) and len(pulsos):
            rel = pulsos[(pulsos >= t0) & (pulsos <= t0 + dur_v)] - t0
            dist = [np.min(np.abs(rel - x)) if len(rel) else 1 for x in cortes]
            beat = float(np.mean([1 - min(d / 0.15, 1) for d in dist]))
        else:
            beat = 0.5
        w = np.array(c["ventanas"])
        dentro = np.where((w >= t0 - SALTO) & (w <= t0 + dur_v))[0]
        sem = float(np.max(emb[dentro] @ objetivo)) if len(dentro) else float(np.max(emb @ objetivo))
        total = 0.30 * max(forma, 0) + 0.15 * nivel + 0.20 * clim + 0.20 * beat + 0.15 * (sem + 1) / 2
        if mejor is None or total > mejor["puntos"]:
            mejor = {"inicio": t0, "puntos": total, "forma": forma, "clímax": clim, "pulsos": beat, "sem": sem}
    return mejor or {"inicio": 0.0, "puntos": 0, "forma": 0, "clímax": 0, "pulsos": 0.5, "sem": 0}


def _tempo(bpm_c, rango):
    if not bpm_c or not rango:
        return 0.5
    lo, hi = rango
    dist = []
    for k in (0.5, 1, 2):
        b = bpm_c * k
        dist.append(0 if lo <= b <= hi else min(abs(math.log2(b / lo)), abs(math.log2(b / hi))))
    return max(0.0, 1 - min(dist) / 0.25) * (1 if dist[1] == min(dist) else 0.85)   # mitad/doble vale un poco menos


def recomendar(video_path, descripcion="", top=5):
    bib = biblioteca()["canciones"]
    if not bib:
        raise ErrorMusica("La biblioteca está vacía: agrega canciones primero (agregar_musica).")
    perfil = perfil_video(video_path)
    huella = perfil.pop("_huella_visual")
    auto = ", ".join(MUSICA_PARA_AMBIENTE[a] for a, _ in perfil["ambiente_visual"][:2])
    consulta = descripcion.strip() or auto
    objetivo = clap_texto([consulta])[0]
    gusto, n_gusto = _gusto_vector()
    parecidos = _ejemplos_parecidos(huella)
    ref = _norm(np.mean([m for _, _, _, m in parecidos], axis=0)) if parecidos else None
    res, sems = [], []
    for cid, c in bib.items():
        try:
            emb = _emb_cancion(cid).astype(np.float32)
        except FileNotFoundError:
            continue
        glob = _norm(emb.mean(axis=0))
        ini = _mejor_inicio(c, perfil, emb, objetivo)
        sem = ini["sem"]
        tempo = _tempo(c["bpm"], perfil["bpm_rango"])
        voces = 1 - c["voces"] * perfil["proporcion_hablada"] * 1.5      # mucha voz en el video → mejor instrumental
        g = float(gusto @ glob) if gusto is not None else 0.0
        e = float(ref @ glob) if ref is not None else 0.0
        peso_t = 0.15 if perfil["bpm_sugerido"] else 0.10
        total = peso_t * tempo + 0.25 * ini["puntos"] + 0.10 * max(voces, 0)
        razones = []
        animo = ", ".join(a for a, _ in c["animo"][:2])
        razones.append(f"suena {animo} ({c['genero'][0][0]})")
        if c["bpm"]:
            lo, hi = perfil["bpm_rango"]
            razones.append(f"{c['bpm']:g} BPM; el video pide {lo:.0f}-{hi:.0f} por su {perfil['bpm_origen']} ({tempo:.0%})")
        if ini["clímax"] > 0.5:
            razones.append(f"su subida ({mmss(c['climax'])} de la canción) cae en el {mmss(c['climax'] - ini['inicio'])} "
                           f"del video, cerca de su clímax ({mmss(perfil['climax'])})")
        if ini["pulsos"] > 0.6 and perfil["cortes"]:
            razones.append(f"los pulsos coinciden con los cortes ({ini['pulsos']:.0%})")
        if perfil["proporcion_hablada"] > 0.3:
            razones.append("casi instrumental: deja oír la voz" if c["voces"] < 0.35 else "tiene voces y el video es hablado: bájala mucho")
        sems.append(sem)
        res.append({"id": cid, "nombre": c["nombre"], "_parcial": total, "_sem": sem, "_g": g, "_e": e,
                    "empezar_cancion_en": round(ini["inicio"], 2), "empezar_mmss": mmss(ini["inicio"]),
                    "bpm": c["bpm"], "tonalidad": c["tonalidad"], "animo": c["animo"], "genero": c["genero"],
                    "voces": c["voces"], "razones": razones})
    # parecido con lo buscado: mitad absoluto (coseno CLAP ~0-0,5) y mitad relativo a tu biblioteca
    # El gusto pesa más cuantas más calificaciones/ejemplos haya (hasta 0,25 cada uno), y se mide relativo a tu biblioteca.
    w_g = min(0.25, 0.05 + 0.025 * n_gusto) if gusto is not None else 0.0
    w_e = min(0.25, 0.10 * len(parecidos)) if ref is not None else 0.0

    def rel(clave, r):
        vals = [x[clave] for x in res]
        lo, hi = min(vals), max(vals)
        return (r[clave] - lo) / (hi - lo) if hi - lo > 1e-6 else 0.5
    for r in res:
        s_ = 0.5 * min(max(r["_sem"] / 0.5, 0), 1) + 0.5 * rel("_sem", r)
        g_, e_ = rel("_g", r), rel("_e", r)
        r["_total"] = (r["_parcial"] + 0.35 * s_ + w_g * g_ + w_e * e_) / (1 + w_g + w_e)
        r["razones"].insert(1, f"parecido con lo buscado: {s_:.0%}")
        if w_g:
            r["razones"].append(f"afinidad con tus 👍/👎: {g_:.0%}")
        if w_e:
            r["razones"].append(f"parecida a la música de tus ejemplos con videos similares: {e_:.0%}")
    for r in res:
        r["puntuacion"] = round(r.pop("_total") * 100, 1)
        for k in ("_parcial", "_sem", "_g", "_e"):
            r.pop(k)
    res.sort(key=lambda r: -r["puntuacion"])
    lo_b, hi_b = perfil["bpm_rango"]
    energia = "alta" if perfil["movimiento_medio"] > 0.55 else "media" if perfil["movimiento_medio"] > 0.3 else "baja"
    perfil_ideal = (f"{consulta}; energía {energia}"
                    + f"; {lo_b:.0f}-{hi_b:.0f} BPM"
                    + ("; instrumental o con voz muy baja (el video es hablado)" if perfil["proporcion_hablada"] > 0.3 else "")
                    + f"; subida/clímax hacia {mmss(perfil['climax'])} del video; duración ≥ {perfil['duracion']:.0f} s")
    return {
        "perfil_video": {k: v for k, v in perfil.items() if k not in ("movimiento",)},
        "busqueda": {"descripcion_usada": consulta, "automatica": not descripcion.strip()},
        "perfil_ideal": perfil_ideal,
        "aprendizaje": {"calificaciones": n_gusto,
                        "ejemplos_parecidos": [{"video": e["video"], "viral": e.get("viral"), "nota": e.get("nota"),
                                                "parecido_visual": round(s, 2)} for _, s, e, _ in parecidos]},
        "ranking": res[:max(1, top)],
    }


# ----------------------------------------------------------------- montaje

def montar(video_path, cancion_id, inicio=None, volumen_db=None, salida=None):
    """Pone la canción al video: desde `inicio` (o el mejor punto), fundidos, ducking bajo la voz y -14 LUFS."""
    import vision_local as vl
    p = vl._ruta(video_path)
    meta = vl.metadatos(p)
    dur = meta["duracion_segundos"]
    cancion = ruta_cancion(cancion_id)
    if inicio is None:
        c = biblioteca()["canciones"][cancion_id]
        perfil = perfil_video(p)
        perfil.pop("_huella_visual")
        emb = _emb_cancion(cancion_id).astype(np.float32)
        inicio = _mejor_inicio(c, perfil, emb, _norm(emb.mean(axis=0)))["inicio"]
    hablado = False
    if meta["tiene_audio"]:
        trans = vl.transcripcion(p, meta)
        hablado = sum(s["fin"] - s["inicio"] for s in trans["segmentos"]) / max(dur, 1e-6) > 0.1
    if volumen_db is None:
        volumen_db = -16 if hablado else -6
    MONTAJES.mkdir(parents=True, exist_ok=True)
    destino = Path(salida) if salida else MONTAJES / f"{p.stem}__{cancion_id}.mp4"
    fade_out = min(1.5, dur / 4)
    mus = (f"[1:a]atrim=start={inicio:.3f}:duration={dur:.3f},asetpts=PTS-STARTPTS,"
           f"afade=t=in:d=0.4,afade=t=out:st={max(dur - fade_out, 0):.3f}:d={fade_out:.3f},volume={volumen_db}dB,"
           f"aresample=48000,aformat=channel_layouts=stereo[mus]")
    if meta["tiene_audio"]:
        filtro = (f"{mus};[0:a]aresample=48000,aformat=channel_layouts=stereo,asplit=2[voz][llave];"
                  + ("[mus][llave]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[duck];"
                     if hablado else "[llave]anullsink;[mus]anull[duck];")
                  + "[voz][duck]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11[a]")
    else:
        filtro = f"{mus};[mus]loudnorm=I=-14:TP=-1.5:LRA=11[a]"
    cmd = ["ffmpeg", "-v", "error", "-y", "-i", str(p), "-i", str(cancion), "-filter_complex", filtro,
           "-map", "0:v:0", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest",
           "-movflags", "+faststart", str(destino)]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise ErrorMusica(f"ffmpeg falló: {r.stderr.strip()[-400:]}")
    return {"salida": str(destino), "cancion": biblioteca()["canciones"][cancion_id]["nombre"],
            "empieza_en": round(float(inicio), 2), "volumen_musica_db": volumen_db,
            "ducking_bajo_la_voz": hablado, "lufs_objetivo": -14}
