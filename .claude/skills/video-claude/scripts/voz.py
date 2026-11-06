"""Narración (texto → voz) gratis para los videos de la skill.

Motores:
  gemini  Google AI Studio, modelo TTS (gratis con la clave de AI Studio). Entiende cómo decirlo: pon el estilo en
          --estilo («con suspenso», «divertido y rápido», «susurrando») o etiquetas en el texto ([risa], [suspiro]).
          Voces: Charon (grave, informativa), Puck (alegre), Kore (firme), Fenrir (enérgica), Orus, Aoede, Zephyr…
  aura    Cloudflare Workers AI @cf/deepgram/aura-2-es (gratis con la cuota diaria). Voces: alvaro, javier, nestor,
          sirio, aquila, carina, celeste, diana, estrella, selena.
Por defecto usa gemini y, si falla (sin clave, 503 saturado, cuota…), cae a aura y lo dice.

Claves: secretos de red del entorno (generativelanguage.googleapis.com / x-goog-api-key y api.cloudflare.com /
Authorization), o variables GEMINI_API_KEY / CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID. Nunca en el repo.

Uso: python3 voz.py "texto o ruta.txt" salida.mp3 [--motor gemini|aura] [--voz Charon] [--estilo "con suspenso"]
"""
import argparse
import base64
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

UA = {"User-Agent": "video-claude/1.0", "Content-Type": "application/json"}
MODELOS_TTS = [m.strip() for m in os.environ.get("VIDEO_GEMINI_TTS", "gemini-2.5-flash-preview-tts").split(",") if m.strip()]
CUENTA_CF = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "73e77f7d8385b30a95f3ca5f7c00f86a")


def _a_mp3(pcm_o_archivo, salida, crudo=False):
    cmd = ["ffmpeg", "-y", "-v", "error"]
    cmd += ["-f", "s16le", "-ar", "24000", "-ac", "1", "-i", "pipe:0"] if crudo else ["-i", "pipe:0"]
    subprocess.run(cmd + ["-ar", "44100", "-b:a", "192k", str(salida)], input=pcm_o_archivo, check=True)


def gemini(texto, salida, voz="Charon", estilo=""):
    prompt = f"{estilo.strip()}: {texto}" if estilo else texto
    cuerpo = json.dumps({"contents": [{"parts": [{"text": prompt}]}], "generationConfig": {
        "responseModalities": ["AUDIO"],
        "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voz or "Charon"}}}}}).encode()
    ultimo = "sin modelos"
    for m in MODELOS_TTS:
        req = urllib.request.Request(f"https://generativelanguage.googleapis.com/v1beta/models/{m}:generateContent", cuerpo,
                                     {**UA, "x-goog-api-key": os.environ.get("GEMINI_API_KEY", "proxy-injected")})
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                d = json.loads(r.read())
            parte = d["candidates"][0]["content"]["parts"][0]["inlineData"]
            _a_mp3(base64.b64decode(parte["data"]), salida, crudo=True)
            return f"gemini ({m}, voz {voz})"
        except urllib.error.HTTPError as e:
            ultimo = f"{m}: HTTP {e.code}"
            if e.code == 404:
                continue
            raise RuntimeError(ultimo) from e
    raise RuntimeError(ultimo)


def aura(texto, salida, voz="alvaro"):
    cuerpo = json.dumps({"text": texto, "speaker": voz or "alvaro", "encoding": "mp3"}).encode()
    token = os.environ.get("CLOUDFLARE_API_TOKEN", "proxy-injected")
    req = urllib.request.Request(f"https://api.cloudflare.com/client/v4/accounts/{CUENTA_CF}/ai/run/@cf/deepgram/aura-2-es",
                                 cuerpo, {**UA, "Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req, timeout=300) as r:
        datos = r.read()
    _a_mp3(datos, salida)
    return f"aura (voz {voz})"


POR_QUE = {401: "sin clave válida", 403: "sin permiso / clave", 429: "límite de uso alcanzado (cuota diaria o "
           "demasiadas peticiones seguidas): espera unos minutos o usa el otro motor", 503: "servicio saturado"}


def _explica(e):
    codigo = getattr(e, "code", None)
    return f"HTTP {codigo}: {POR_QUE.get(codigo, 'error')}" if codigo else str(e)


def narrar(texto, salida, motor="gemini", voz=None, estilo=""):
    """Devuelve qué motor se usó. Si fallan los dos, RuntimeError con el porqué de cada uno."""
    orden = [("gemini", voz or "Charon"), ("aura", "alvaro")] if motor == "gemini" else [("aura", voz or "alvaro"), ("gemini", "Charon")]
    fallos = []
    for nombre, v in orden:
        try:
            hecho = gemini(texto, salida, v, estilo) if nombre == "gemini" else aura(texto, salida, v)
            return hecho + (f" — respaldo porque {fallos[0]}" if fallos else "")
        except Exception as e:  # noqa: BLE001
            fallos.append(f"{nombre} falló ({_explica(e)})")
            print(fallos[-1], file=sys.stderr)
    raise RuntimeError("No se pudo generar la voz: " + "; ".join(fallos))


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("texto")
    ap.add_argument("salida")
    ap.add_argument("--motor", default="gemini", choices=["gemini", "aura"])
    ap.add_argument("--voz")
    ap.add_argument("--estilo", default="")
    a = ap.parse_args()
    t = Path(a.texto).read_text(encoding="utf-8") if Path(a.texto).is_file() else a.texto
    t = " ".join(t.split())
    try:
        print(narrar(t, a.salida, a.motor, a.voz, a.estilo))
    except RuntimeError as e:
        sys.exit(str(e))
