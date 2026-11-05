"""escucha_local: hace que Claude "oiga" el audio, en local y sin APIs.

Claude no acepta audio, así que el sonido se traduce a texto e imágenes:
  - eventos(): qué suena segundo a segundo (AST entrenado en AudioSet, 527 clases: música, perro, lluvia,
    aplausos, sirena, risa, motor, voz...). Ventana de 2 s centrada en cada segundo.
  - preguntar(): pregunta libre al audio con CLAP (Claude propone descripciones, CLAP puntúa cuál encaja).
  - musica(): BPM, beats, volumen por segundo (dBFS) y silencios.
  - prosodia(): tono (Hz), volumen, velocidad del habla y emoción por frase de la transcripción.
  - espectrograma(): imagen del sonido (Claude sí ve imágenes): golpes, silencios, música vs. voz.
Los modelos se descargan una vez (pesos abiertos) y corren en CPU.
Salidas en datos/vision/<id>/ (fuera de git).
"""
import json
import math
import subprocess
from functools import lru_cache
from pathlib import Path

import numpy as np

MODELO_EVENTOS = "MIT/ast-finetuned-audioset-10-10-0.4593"
MODELO_CLAP = "laion/clap-htsat-unfused"
MODELO_EMOCION = "superb/wav2vec2-base-superb-er"
EMOCIONES = {"neu": "neutral", "hap": "alegre", "ang": "enfadado", "sad": "triste"}
UMBRAL_EVENTO = 0.15
SILENCIO_DB = -45.0


# ----------------------------------------------------------------- audio

def cargar(p, sr, ini=0.0, fin=None):
    """Audio mono float32 a `sr` Hz con ffmpeg (sin PyAV)."""
    cmd = ["ffmpeg", "-v", "error", "-ss", f"{ini:.3f}"]
    if fin:
        cmd += ["-to", f"{fin:.3f}"]
    cmd += ["-i", str(p), "-vn", "-ac", "1", "-ar", str(sr), "-f", "s16le", "-"]
    raw = subprocess.run(cmd, check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0


def _db(x):
    rms = float(np.sqrt(np.mean(x ** 2))) if len(x) else 0.0
    return round(20 * math.log10(rms), 1) if rms > 1e-9 else -120.0


# ----------------------------------------------------------------- modelos (perezosos, una vez por proceso)

@lru_cache(maxsize=1)
def _ast():
    from transformers import ASTFeatureExtractor, ASTForAudioClassification
    return ASTFeatureExtractor.from_pretrained(MODELO_EVENTOS), ASTForAudioClassification.from_pretrained(MODELO_EVENTOS).eval()


@lru_cache(maxsize=1)
def _clap():
    from transformers import ClapModel, ClapProcessor
    return ClapProcessor.from_pretrained(MODELO_CLAP), ClapModel.from_pretrained(MODELO_CLAP).eval()


@lru_cache(maxsize=1)
def _emocion():
    from transformers import pipeline
    return pipeline("audio-classification", model=MODELO_EMOCION, device=-1)


# ----------------------------------------------------------------- qué suena

def eventos(p, duracion, paso=1.0, top=4, lote=16):
    """Lista por segundo: [{t, sonidos:[(etiqueta, prob)], db}]. Ventana de 2 s centrada en [t, t+paso)."""
    import torch
    fe, model = _ast()
    sr = 16000
    audio = cargar(p, sr)
    n = max(1, math.ceil(duracion / paso - 1e-6))
    ventanas, dbs = [], []
    for i in range(n):
        t = i * paso
        a, b = max(0, int((t + paso / 2 - 1.0) * sr)), int((t + paso / 2 + 1.0) * sr)
        ventanas.append(audio[a:b] if b > a else np.zeros(sr, np.float32))
        dbs.append(_db(audio[int(t * sr):int((t + paso) * sr)]))
    salida = []
    with torch.no_grad():
        for k in range(0, n, lote):
            grupo = ventanas[k:k + lote]
            x = fe(grupo, sampling_rate=sr, return_tensors="pt")
            probs = torch.sigmoid(model(**x).logits).numpy()
            for j, pr in enumerate(probs):
                i = k + j
                orden = np.argsort(-pr)[:top]
                sonidos = [(model.config.id2label[int(c)], round(float(pr[c]), 2)) for c in orden if pr[c] >= UMBRAL_EVENTO]
                if not sonidos:  # nada claro: el más probable igualmente, para no dejar el segundo vacío
                    sonidos = [(model.config.id2label[int(orden[0])], round(float(pr[orden[0]]), 2))]
                if dbs[i] < SILENCIO_DB:
                    sonidos = [("Silence", 1.0)]
                salida.append({"t": round(i * paso, 3), "sonidos": sonidos, "db": dbs[i]})
    return salida


def resumen_eventos(lista, minimo=2):
    """Agrupa segundos consecutivos con el mismo sonido dominante -> tramos legibles."""
    tramos = []
    for e in lista:
        dom = e["sonidos"][0][0] if e["sonidos"] else "Unknown"
        if tramos and tramos[-1]["sonido"] == dom and abs(tramos[-1]["fin"] - e["t"]) < 1e-6 + 1.0:
            tramos[-1]["fin"] = e["t"] + 1.0
        else:
            tramos.append({"sonido": dom, "inicio": e["t"], "fin": e["t"] + 1.0})
    return [t for t in tramos if t["fin"] - t["inicio"] >= minimo or len(tramos) == 1]


# ----------------------------------------------------------------- pregunta libre (CLAP)

def preguntar(p, opciones, ini=0.0, fin=None):
    """¿Cuál de estas descripciones suena en el tramo? Devuelve [(descripción, prob)] ordenado."""
    import torch
    proc, model = _clap()
    audio = cargar(p, 48000, ini, fin)
    x = proc(text=list(opciones), audio=[audio], sampling_rate=48000, return_tensors="pt", padding=True)
    with torch.no_grad():
        logits = model(**x).logits_per_audio[0]
    pr = torch.softmax(logits, dim=-1).numpy()
    return sorted([(o, round(float(v), 3)) for o, v in zip(opciones, pr)], key=lambda z: -z[1])


# ----------------------------------------------------------------- música

def musica(p, ini=0.0, fin=None):
    import librosa
    sr = 22050
    y = cargar(p, sr, ini, fin)
    if len(y) < sr:
        return {"bpm": None, "beats": []}
    tempo, beats = librosa.beat.beat_track(y=y, sr=sr, units="time")
    bpm = float(np.atleast_1d(tempo)[0])
    return {"bpm": round(bpm, 1) if bpm > 0 else None,
            "beats": [round(ini + float(b), 2) for b in beats][:200]}


def silencios(lista_eventos, minimo=1.0):
    tramos, cur = [], None
    for e in lista_eventos:
        if e["db"] < SILENCIO_DB:
            cur = cur or {"inicio": e["t"], "fin": e["t"]}
            cur["fin"] = e["t"] + 1.0
        elif cur:
            tramos.append(cur); cur = None
    if cur:
        tramos.append(cur)
    return [t for t in tramos if t["fin"] - t["inicio"] >= minimo]


# ----------------------------------------------------------------- voz: tono, volumen, velocidad, emoción

def prosodia(p, segmentos):
    import librosa
    sr = 16000
    audio = cargar(p, sr)
    emo = _emocion()
    out = []
    for s in segmentos:
        x = audio[int(s["inicio"] * sr):int(s["fin"] * sr)]
        if len(x) < sr * 0.3:
            continue
        f0 = librosa.yin(x, fmin=65, fmax=450, sr=sr)
        voiced = f0[(f0 > 66) & (f0 < 449)]
        palabras = len(s.get("palabras") or s["texto"].split())
        dur = max(s["fin"] - s["inicio"], 1e-3)
        e = emo({"raw": x, "sampling_rate": sr}, top_k=2)
        out.append({
            "id": s.get("id"), "inicio": s["inicio"], "fin": s["fin"],
            "tono_hz": round(float(np.median(voiced)), 0) if len(voiced) else None,
            "variacion_tono_hz": round(float(np.std(voiced)), 0) if len(voiced) else None,
            "volumen_db": _db(x),
            "palabras_por_segundo": round(palabras / dur, 2),
            "emocion": [(EMOCIONES.get(r["label"], r["label"]), round(r["score"], 2)) for r in e],
        })
    return out


# ----------------------------------------------------------------- quién habla (diarización)

MODELO_HABLANTE = "microsoft/wavlm-base-plus-sv"
UMBRAL_MISMO_HABLANTE = 0.86   # similitud coseno recomendada para wavlm-base-plus-sv


@lru_cache(maxsize=1)
def _hablante():
    from transformers import AutoFeatureExtractor, WavLMForXVector
    return AutoFeatureExtractor.from_pretrained(MODELO_HABLANTE), WavLMForXVector.from_pretrained(MODELO_HABLANTE).eval()


def _turnos(segmentos, pausa=0.35):
    """Parte la transcripción en turnos: un corte en cada segmento y en cada pausa larga entre palabras."""
    turnos = []
    for s in segmentos:
        pal = s.get("palabras") or [{"p": s["texto"], "t": s["inicio"]}]
        cur = None
        for i, w in enumerate(pal):
            fin_w = pal[i + 1]["t"] if i + 1 < len(pal) else s["fin"]
            if cur and w["t"] - cur["fin"] > pausa:
                turnos.append(cur); cur = None
            cur = cur or {"inicio": w["t"], "fin": w["t"], "palabras": []}
            cur["palabras"].append(w["p"])
            cur["fin"] = max(cur["fin"], min(fin_w, w["t"] + 1.5))
        if cur:
            turnos.append(cur)
    return turnos


def diarizar(p, segmentos, umbral=UMBRAL_MISMO_HABLANTE, min_dur=0.8, contexto=1.5):
    """Quién habla: H1, H2... (H1 = quien habla primero).
    1) turnos de voz >= 0,8 s -> embedding WavLM (x-vector) -> clustering aglomerativo por coseno:
       así se decide cuántos hablantes hay (número automático);
    2) turnos cortos: embedding de una ventana de 1,5 s centrada en el turno, asignada al hablante
       más parecido (nunca crea hablantes nuevos). Devuelve (turnos, n_hablantes)."""
    import torch
    from sklearn.cluster import AgglomerativeClustering
    turnos = _turnos(segmentos)
    if not turnos:
        return [], 0
    fe, model = _hablante()
    sr = 16000
    audio = cargar(p, sr)

    def emb(a, b):
        x = audio[max(0, int(a * sr)):int(b * sr)]
        with torch.no_grad():
            return torch.nn.functional.normalize(model(**fe(x, sampling_rate=sr, return_tensors="pt")).embeddings, dim=-1)[0].numpy()

    largos = [i for i, t in enumerate(turnos) if t["fin"] - t["inicio"] >= min_dur]
    if not largos:   # todo es muy corto: usar ventanas de contexto para todos
        largos = list(range(len(turnos)))
        embs = [emb((t["inicio"] + t["fin"]) / 2 - contexto / 2, (t["inicio"] + t["fin"]) / 2 + contexto / 2) for t in turnos]
    else:
        embs = [emb(turnos[i]["inicio"], turnos[i]["fin"]) for i in largos]
    etiquetas = [0] if len(embs) == 1 else list(AgglomerativeClustering(
        n_clusters=None, metric="cosine", linkage="average", distance_threshold=1 - umbral).fit(np.stack(embs)).labels_)
    mapa = {}
    for i, e in sorted(zip(largos, etiquetas)):
        turnos[i]["hablante"] = mapa.setdefault(e, f"H{len(mapa) + 1}")
    centro = {}
    for i, v in zip(largos, embs):
        centro.setdefault(turnos[i]["hablante"], []).append(v)
    centro = {h: np.mean(v, axis=0) / np.linalg.norm(np.mean(v, axis=0)) for h, v in centro.items()}
    for t in turnos:
        if "hablante" not in t:
            m = (t["inicio"] + t["fin"]) / 2
            e = emb(m - contexto / 2, m + contexto / 2)
            t["hablante"] = max(centro, key=lambda h: float(np.dot(centro[h], e)))
    for t in turnos:
        t["texto"] = " ".join(t.pop("palabras")).strip()
        t["inicio"], t["fin"] = round(t["inicio"], 2), round(t["fin"], 2)
    return turnos, len(mapa)


# ----------------------------------------------------------------- ver el sonido

def espectrograma(p, ini, fin, destino):
    """PNG con espectrograma (frecuencia en escala log) y eje de tiempo del tramo."""
    destino = Path(destino)
    destino.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", f"{ini:.3f}", "-to", f"{fin:.3f}", "-i", str(p), "-vn",
                    "-lavfi", "showspectrumpic=s=1200x360:legend=1:fscale=log:color=intensity:scale=log:gain=2",
                    str(destino)], check=True)
    return destino


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(description="Escuchar audio/video en local.")
    ap.add_argument("archivo")
    ap.add_argument("--preguntar", nargs="+", help="descripciones candidatas para CLAP")
    ap.add_argument("--start", type=float, default=0)
    ap.add_argument("--end", type=float, default=0)
    a = ap.parse_args()
    if a.preguntar:
        print(json.dumps(preguntar(a.archivo, a.preguntar, a.start, a.end or None), ensure_ascii=False, indent=1))
    else:
        d = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", a.archivo],
                                 capture_output=True, text=True).stdout)
        ev = eventos(a.archivo, d)
        print(json.dumps({"tramos": resumen_eventos(ev), "silencios": silencios(ev), "por_segundo": ev}, ensure_ascii=False))
