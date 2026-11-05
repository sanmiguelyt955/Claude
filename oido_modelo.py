"""oido_modelo: oídos y vista "de verdad" para Claude.

Claude no acepta audio, así que no puede oír por sí mismo. Este módulo carga un modelo abierto
multimodal (Gemma 4 E2B, Apache 2.0, pesos abiertos) que SÍ recibe la señal de audio original
(y cuadros de video), y responde en texto a preguntas en lenguaje natural. Claude le pregunta
y el modelo escucha y mira.

No es Gemini ni una API de Google: los pesos corren en nuestro servidor (CPU), sin enviar datos fuera.
Modelo configurable con OIDO_MODELO (cualquier modelo de transformers con entrada de audio y chat template).
"""
import os
import time
from functools import lru_cache

import numpy as np

MODELO = os.environ.get("OIDO_MODELO", "google/gemma-4-E2B-it")
MAX_SEG_AUDIO = 30.0     # Gemma 4: el encoder de audio admite hasta ~30 s por clip


@lru_cache(maxsize=1)
def _cargar():
    import torch
    from transformers import AutoModelForImageTextToText, AutoProcessor
    torch.set_num_threads(max(1, os.cpu_count() or 1))
    proc = AutoProcessor.from_pretrained(MODELO)
    try:
        from transformers import Gemma4ForConditionalGeneration as Cls
    except ImportError:
        Cls = AutoModelForImageTextToText
    model = Cls.from_pretrained(MODELO, dtype=torch.bfloat16, low_cpu_mem_usage=True).eval()
    return proc, model


def _trozos(audio, sr=16000, max_s=MAX_SEG_AUDIO):
    n = int(max_s * sr)
    return [audio[i:i + n] for i in range(0, max(len(audio), 1), n)] or [audio]


def preguntar(pregunta, audio=None, imagenes=None, sr=16000, max_tokens=300, sistema=None):
    """audio: np.float32 mono a 16 kHz (≤30 s; si es más largo se pasan varios clips seguidos).
    imagenes: lista de rutas o PIL.Image (cuadros). Devuelve (texto, segundos)."""
    import torch
    from PIL import Image
    proc, model = _cargar()
    contenido = []
    for im in imagenes or []:
        contenido.append({"type": "image", "image": Image.open(im).convert("RGB") if isinstance(im, (str, os.PathLike)) else im})
    if audio is not None and len(audio):
        for clip in _trozos(np.asarray(audio, dtype=np.float32), sr):
            contenido.append({"type": "audio", "audio": clip})
    contenido.append({"type": "text", "text": pregunta})
    mensajes = []
    if sistema:
        mensajes.append({"role": "system", "content": [{"type": "text", "text": sistema}]})
    mensajes.append({"role": "user", "content": contenido})
    t0 = time.time()
    x = proc.apply_chat_template(mensajes, add_generation_prompt=True, tokenize=True, return_dict=True,
                                 return_tensors="pt", processor_kwargs={"sampling_rate": sr})
    x = {k: (v.to(model.dtype) if hasattr(v, "dtype") and v.dtype.is_floating_point else v) for k, v in x.items()}
    with torch.inference_mode():
        out = model.generate(**x, max_new_tokens=max_tokens, do_sample=False)
    texto = proc.decode(out[0][x["input_ids"].shape[-1]:], skip_special_tokens=True).strip()
    return texto, round(time.time() - t0, 1)


if __name__ == "__main__":
    import argparse
    import escucha_local as E
    ap = argparse.ArgumentParser(description="Pregunta a un modelo que escucha el audio original.")
    ap.add_argument("archivo")
    ap.add_argument("pregunta")
    ap.add_argument("--start", type=float, default=0)
    ap.add_argument("--end", type=float, default=0)
    ap.add_argument("--imagen", nargs="*")
    a = ap.parse_args()
    au = E.cargar(a.archivo, 16000, a.start, a.end or None)
    t, s = preguntar(a.pregunta, au, a.imagen)
    print(f"[{s}s] {t}")
