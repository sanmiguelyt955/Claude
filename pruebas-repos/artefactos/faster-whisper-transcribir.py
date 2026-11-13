import sys, time
from faster_whisper import WhisperModel
t=time.time(); m=WhisperModel("small", device="cpu", compute_type="int8")
segs, info = m.transcribe(sys.argv[1], language="es", word_timestamps=True)
print("idioma", info.language, "dur", round(info.duration,2))
for s in segs:
    print(f"[{s.start:.2f}-{s.end:.2f}] {s.text}")
    print("  palabras:", " ".join(f"{w.word.strip()}@{w.start:.2f}" for w in s.words))
print("tiempo total", round(time.time()-t,1),"s")
