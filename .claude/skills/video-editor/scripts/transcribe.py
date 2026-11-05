#!/usr/bin/env python3
"""Transcribe con faster-whisper -> words.json [{word,start,end}] + segments."""
import argparse, json, subprocess, tempfile, os
ap = argparse.ArgumentParser()
ap.add_argument("video"); ap.add_argument("--lang", default=None, help="es, en... (auto si se omite)")
ap.add_argument("--model", default="small"); ap.add_argument("--out", default="work/words.json")
a = ap.parse_args()
from faster_whisper import WhisperModel
os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
wav = tempfile.mktemp(suffix=".wav")
subprocess.run(["ffmpeg","-y","-v","error","-i",a.video,"-ac","1","-ar","16000",wav],check=True)
m = WhisperModel(a.model, device="cpu", compute_type="int8")
segs, info = m.transcribe(wav, language=a.lang, word_timestamps=True, vad_filter=True)
words, segments = [], []
for s in segs:
    segments.append({"start": round(s.start,3), "end": round(s.end,3), "text": s.text.strip()})
    for w in (s.words or []):
        words.append({"word": w.word.strip(), "start": round(w.start,3), "end": round(w.end,3)})
json.dump({"language": info.language, "words": words, "segments": segments}, open(a.out,"w"), ensure_ascii=False, indent=1)
os.remove(wav)
print(f"idioma={info.language} palabras={len(words)} -> {a.out}")
