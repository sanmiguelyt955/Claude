"""Prepara TODO el material de un video para analizarlo sin perder detalles (pensado para las Muse, que trabajan con
cuadros y transcripción, y para cualquier IA con computadora). Solo necesita Python 3 + ffmpeg; usa Whisper y
Tesseract si están instalados.

    python3 extraer_video.py video.mp4 [carpeta_salida] [--fps 2]

Sale en la carpeta:
  info.txt            duración, resolución, fps, audio
  cortes.txt          cada corte de escena (cambio de plano) con su segundo exacto
  cuadros/            1 imagen cada 1/fps s (por defecto 2 por segundo; 1 por segundo si dura más de 3 min)
                      + 1 en cada corte. Nombre = tiempo (t_00m12.5s.jpg)
  hojas/              hojas de 4×4 cuadros con el tiempo escrito encima (para revisar rápido, en orden)
  transcripcion.txt   cada palabra con su segundo (Whisper); si no hay Whisper, lo dice
  audio.txt           volumen cada 0.5 s y los «golpes» (subidas bruscas = efectos, cortes de música, gritos)
  texto_pantalla.txt  texto leído en los cuadros (Tesseract), si está instalado
Después: analizar con el protocolo V6.5 (Obsidian 2.0: 2do cerebro dropshipping/05 Herramientas/Protocolo maestro V6.5).
Al terminar, BORRAR el video y esta carpeta.
"""
import json
import math
import re
import shutil
import subprocess
import sys
from pathlib import Path


def sh(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True, **kw)


def tiempo(s):
    return f"{int(s // 60):02d}:{s % 60:04.1f}"


def info(video):
    r = sh(["ffprobe", "-v", "error", "-show_entries", "format=duration:stream=codec_type,codec_name,width,height,"
            "r_frame_rate,sample_rate,channels", "-of", "json", str(video)])
    d = json.loads(r.stdout or "{}")
    dur = float(d.get("format", {}).get("duration", 0))
    v = next((s for s in d.get("streams", []) if s.get("codec_type") == "video"), {})
    a = next((s for s in d.get("streams", []) if s.get("codec_type") == "audio"), {})
    num, _, den = (v.get("r_frame_rate") or "0/1").partition("/")
    fps = float(num) / float(den or 1) if float(den or 1) else 0
    return dur, v, a, fps


def cortes(video, umbral=0.25):
    r = sh(["ffmpeg", "-hide_banner", "-i", str(video), "-filter:v", f"select='gt(scene,{umbral})',showinfo",
            "-f", "null", "-"])
    return [float(m) for m in re.findall(r"pts_time:([\d.]+)", r.stderr)]


def cuadro(video, t, destino):
    sh(["ffmpeg", "-v", "error", "-y", "-ss", f"{t:.3f}", "-i", str(video), "-frames:v", "1",
        "-vf", "scale='min(720,iw)':-2", "-q:v", "3", str(destino)])


def hojas(cuadros, carpeta):
    from PIL import Image, ImageDraw
    carpeta.mkdir(exist_ok=True)
    for k in range(0, len(cuadros), 16):
        grupo = cuadros[k:k + 16]
        ims = [(t, Image.open(p).convert("RGB")) for t, p in grupo]
        w, h = 240, int(240 * ims[0][1].height / ims[0][1].width)
        hoja = Image.new("RGB", (4 * w, 4 * (h + 22)), "black")
        d = ImageDraw.Draw(hoja)
        for i, (t, im) in enumerate(ims):
            x, y = (i % 4) * w, (i // 4) * (h + 22)
            hoja.paste(im.resize((w, h)), (x, y + 22))
            d.text((x + 4, y + 4), tiempo(t), fill="yellow")
        hoja.save(carpeta / f"hoja_{k // 16 + 1:02d}_{tiempo(grupo[0][0]).replace(':', 'm')}s.jpg", quality=85)


def transcribir(video, salida):
    wav = salida / "_audio16k.wav"
    sh(["ffmpeg", "-v", "error", "-y", "-i", str(video), "-ac", "1", "-ar", "16000", str(wav)])
    lineas = []
    try:
        from faster_whisper import WhisperModel
        import numpy as np
        pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", str(wav), "-f", "s16le", "-ac", "1", "-ar", "16000", "-"],
                             capture_output=True).stdout
        senal = np.frombuffer(pcm, np.int16).astype(np.float32) / 32768.0
        segs, inf = WhisperModel("small", device="cpu", compute_type="int8").transcribe(
            senal, word_timestamps=True, vad_filter=True)
        lineas.append(f"idioma: {inf.language}")
        for s in segs:
            for w in s.words or []:
                lineas.append(f"[{tiempo(w.start)}–{tiempo(w.end)}] {w.word.strip()}")
    except Exception as e:  # noqa: BLE001  (sin faster-whisper o falla: probar whisper normal)
        if not isinstance(e, ImportError):
            lineas.append(f"(faster-whisper falló: {type(e).__name__}; se intenta whisper)")
        try:
            import whisper
            r = whisper.load_model("small").transcribe(str(wav), word_timestamps=True)
            lineas.append(f"idioma: {r.get('language')}")
            for s in r["segments"]:
                for w in s.get("words", []):
                    lineas.append(f"[{tiempo(w['start'])}–{tiempo(w['end'])}] {w['word'].strip()}")
        except Exception:  # noqa: BLE001
            lineas.append("SIN WHISPER: instala faster-whisper (pip install --user faster-whisper) o usa tu "
                          "transcripción propia. NO inventes lo que se dice.")
    wav.unlink(missing_ok=True)
    (salida / "transcripcion.txt").write_text("\n".join(lineas) + "\n", encoding="utf-8")


def audio(video, salida, dur):
    r = sh(["ffmpeg", "-hide_banner", "-i", str(video), "-af", "ebur128=metadata=1,ametadata=print:key=lavfi.r128.M",
            "-f", "null", "-"])
    vals = [(float(t), float(m)) for t, m in re.findall(r"pts_time:([\d.]+).*?lavfi\.r128\.M=(-?[\d.]+|-inf)",
                                                     r.stderr.replace("-inf", "-70"), re.S)]
    por_medio, lineas, golpes = {}, [], []
    for t, m in vals:
        por_medio.setdefault(round(t * 2) / 2, []).append(m)
    prev = None
    for t in sorted(por_medio):
        m = max(por_medio[t])
        lineas.append(f"{tiempo(t)}  {m:6.1f} LUFS  {'█' * max(0, int((m + 50) / 2))}")
        if prev is not None and m - prev > 6:
            golpes.append(f"{tiempo(t)}  sube {m - prev:+.0f} dB (golpe, efecto, entrada de música o grito)")
        if prev is not None and prev - m > 10:
            golpes.append(f"{tiempo(t)}  baja {m - prev:+.0f} dB (silencio, corte de música)")
        prev = m
    texto = ["GOLPES Y CAMBIOS DE VOLUMEN:"] + (golpes or ["(ninguno brusco)"]) + ["", "VOLUMEN CADA 0.5 s:"] + lineas
    (salida / "audio.txt").write_text("\n".join(texto) + "\n", encoding="utf-8")


def ocr(cuadros, salida):
    if not shutil.which("tesseract"):
        (salida / "texto_pantalla.txt").write_text("SIN TESSERACT: lee el texto en pantalla mirando los cuadros.\n")
        return
    lineas, ultimo = [], ""
    for t, p in cuadros:
        txt = " ".join(sh(["tesseract", str(p), "-", "-l", "spa+eng", "--psm", "11"]).stdout.split())
        if len(txt) > 2 and txt != ultimo:
            lineas.append(f"[{tiempo(t)}] {txt}")
            ultimo = txt
    (salida / "texto_pantalla.txt").write_text("\n".join(lineas) + "\n", encoding="utf-8")


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    video = Path(sys.argv[1])
    salida = Path(sys.argv[2]) if len(sys.argv) > 2 and not sys.argv[2].startswith("--") else video.with_suffix("")
    fps_pedido = float(sys.argv[sys.argv.index("--fps") + 1]) if "--fps" in sys.argv else None
    salida.mkdir(parents=True, exist_ok=True)
    dur, v, a, fps = info(video)
    paso = 1 / (fps_pedido or (2 if dur <= 180 else 1))
    cs = cortes(video)
    (salida / "info.txt").write_text(
        f"archivo: {video.name}\nduración: {dur:.2f} s ({tiempo(dur)})\nvideo: {v.get('codec_name')} "
        f"{v.get('width')}x{v.get('height')} a {fps:.2f} fps\naudio: {a.get('codec_name')} {a.get('sample_rate')} Hz "
        f"{a.get('channels')} canales\ncortes de escena: {len(cs)}\ncuadros cada {paso:.2f} s + uno en cada corte\n",
        encoding="utf-8")
    (salida / "cortes.txt").write_text("\n".join(f"{tiempo(t)}  corte {k + 1}" for k, t in enumerate(cs)) + "\n",
                                       encoding="utf-8")
    tiempos = sorted(set([round(i * paso, 2) for i in range(int(dur / paso) + 1)] + [round(t + 0.05, 2) for t in cs]))
    carpeta = salida / "cuadros"
    carpeta.mkdir(exist_ok=True)
    cuadros = []
    for t in tiempos:
        if t >= dur:
            continue
        p = carpeta / f"t_{int(t // 60):02d}m{t % 60:04.1f}s.jpg"
        cuadro(video, t, p)
        if p.exists():
            cuadros.append((t, p))
    hojas(cuadros, salida / "hojas")
    transcribir(video, salida)
    audio(video, salida, dur)
    ocr(cuadros, salida)
    print(json.dumps({"carpeta": str(salida), "duracion_s": round(dur, 2), "cortes": len(cs), "cuadros": len(cuadros),
                      "hojas": len(list((salida / "hojas").glob("*.jpg")))}, ensure_ascii=False))


if __name__ == "__main__":
    main()
