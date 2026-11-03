#!/usr/bin/env python3
"""Quita silencios y/o rangos indicados; remapea words.json al nuevo tiempo."""
import argparse, json, re, subprocess, os
ap = argparse.ArgumentParser()
ap.add_argument("video"); ap.add_argument("--out", default="work/cut.mp4")
ap.add_argument("--words"); ap.add_argument("--noise", default="-30dB")
ap.add_argument("--min-silence", type=float, default=0.4)
ap.add_argument("--pad", type=float, default=0.08)
ap.add_argument("--remove", default="", help="rangos extra a eliminar: '12.3-14,40-42.5'")
ap.add_argument("--no-silence", action="store_true", help="solo aplicar --remove")
a = ap.parse_args()
os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
dur = float(subprocess.check_output(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",a.video]))
cuts = []
if not a.no_silence:
    log = subprocess.run(["ffmpeg","-hide_banner","-nostats","-i",a.video,"-af",f"silencedetect=noise={a.noise}:d={a.min_silence}","-f","null","-"],capture_output=True,text=True).stderr
    st = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", log)]
    en = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", log)]
    if len(st) > len(en): en.append(dur)
    cuts += [(s + a.pad, e - a.pad) for s, e in zip(st, en) if e - s > 2*a.pad]
for r in filter(None, a.remove.split(",")):
    s, e = r.split("-"); cuts.append((float(s), float(e)))
cuts.sort(); merged = []
for s, e in cuts:
    if merged and s <= merged[-1][1]: merged[-1] = (merged[-1][0], max(merged[-1][1], e))
    else: merged.append((s, e))
keep, t = [], 0.0
for s, e in merged:
    if s > t: keep.append((t, s))
    t = max(t, e)
if t < dur: keep.append((t, dur))
keep = [(s, e) for s, e in keep if e - s > 0.05]
if not keep: raise SystemExit("Nada que conservar")
f = []
for i, (s, e) in enumerate(keep):
    f.append(f"[0:v]trim={s:.3f}:{e:.3f},setpts=PTS-STARTPTS[v{i}];[0:a]atrim={s:.3f}:{e:.3f},asetpts=PTS-STARTPTS,afade=t=in:d=0.01,afade=t=out:st={max(e-s-0.01,0):.3f}:d=0.01[a{i}]")
n = len(keep)
f.append("".join(f"[v{i}][a{i}]" for i in range(n)) + f"concat=n={n}:v=1:a=1[v][a]")
fs = a.out + ".filter.txt"; open(fs, "w").write(";\n".join(f))
subprocess.run(["ffmpeg","-y","-v","error","-i",a.video,"-filter_complex_script",fs,"-map","[v]","-map","[a]","-c:v","libx264","-crf","18","-preset","fast","-c:a","aac","-b:a","192k",a.out],check=True)
os.remove(fs)
new_dur = sum(e - s for s, e in keep)
print(f"{dur:.1f}s -> {new_dur:.1f}s ({n} tramos) -> {a.out}")
if a.words:
    d = json.load(open(a.words)); offs, acc = [], 0.0
    for s, e in keep: offs.append((s, e, acc)); acc += e - s
    def remap(x):
        for s, e, o in offs:
            if s - 1e-3 <= x <= e + 1e-3: return round(o + (x - s), 3)
        return None
    nw = []
    for w in d["words"]:
        a0, b0 = remap(w["start"]), remap(w["end"])
        if a0 is not None and b0 is not None: nw.append({**w, "start": a0, "end": b0})
    d["words"] = nw; d.pop("segments", None)
    out = os.path.splitext(a.out)[0] + ".words.json"
    json.dump(d, open(out, "w"), ensure_ascii=False, indent=1); print("palabras remapeadas ->", out)
