"""Transcripcion local en vivo (espanol por defecto). Requiere: pip install faster-whisper sounddevice numpy
Uso: python subtitulos_whisper.py [--salida ~/subtitulos.txt] [--idioma es] [--modelo small]"""
import argparse, os, queue
import numpy as np, sounddevice as sd
from faster_whisper import WhisperModel

ap = argparse.ArgumentParser()
ap.add_argument("--salida", default="~/subtitulos.txt")
ap.add_argument("--idioma", default="es")
ap.add_argument("--modelo", default="small")
ap.add_argument("--segundos", type=float, default=4.0)
a = ap.parse_args()
salida = os.path.expanduser(a.salida)
modelo = WhisperModel(a.modelo, compute_type="int8")
q = queue.Queue()
sd.InputStream(samplerate=16000, channels=1, dtype="float32", callback=lambda d, *_: q.put(d.copy())).start()
buf = np.zeros(0, dtype="float32")
while True:
    buf = np.concatenate([buf, q.get().ravel()])
    if len(buf) >= 16000 * a.segundos:
        segs, _ = modelo.transcribe(buf, language=a.idioma, vad_filter=True)
        txt = " ".join(s.text.strip() for s in segs)
        if txt:
            open(salida, "w", encoding="utf-8").write(txt)
        buf = np.zeros(0, dtype="float32")
