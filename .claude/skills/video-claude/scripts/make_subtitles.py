#!/usr/bin/env python3
"""words.json -> .ass con estilo (viral/clean/cinematic) y colores/fuente de la marca."""
import argparse, json, os
ap = argparse.ArgumentParser()
ap.add_argument("words"); ap.add_argument("--style", default="viral")
ap.add_argument("--brand", default=None); ap.add_argument("--aspect", default="9:16")
ap.add_argument("--translations", default=None, help="json [{start,end,text}] segunda línea")
ap.add_argument("--out", default="work/subs.ass")
a = ap.parse_args()
here = os.path.dirname(os.path.abspath(__file__)); root = os.path.dirname(here)
style = json.load(open(os.path.join(root, "styles", a.style + ".json")))
brand = json.load(open(a.brand)) if a.brand else json.load(open(os.path.join(root, "brands", "default.json")))
W, H = {"9:16": (1080,1920), "16:9": (1920,1080), "1:1": (1080,1080)}[a.aspect]
def ass(hexc):  # #RRGGBB -> &H00BBGGRR
    h = hexc.lstrip("#"); return f"&H00{h[4:6]}{h[2:4]}{h[0:2]}".upper()
font = brand.get("font_title") or style["font"]
size = int(style["size_vertical"] if H > W else style["size_horizontal"])
base = ass(brand["colors"].get("text", "#FFFFFF")); accent = ass(brand["colors"].get("accent", "#FFD400"))
margin_v = int(H * style.get("margin_v_pct", 0.22))
hdr = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {W}
PlayResY: {H}
WrapStyle: 0

[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
Style: Main,{font},{size},{base},{base},&H00000000,&H80000000,{-1 if style.get('bold',True) else 0},0,0,0,100,100,{style.get('spacing',0)},0,1,{style['outline']},{style['shadow']},2,60,60,{margin_v},1
Style: Sub,{font},{int(size*0.55)},&H00DDDDDD,&H00DDDDDD,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,{max(style['outline']-1,1)},1,2,60,60,{max(int(margin_v*0.45),30)},1

[Events]
Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
"""
def t(x):
    h = int(x // 3600); m = int(x % 3600 // 60); s = x % 60
    return f"{h}:{m:02d}:{s:05.2f}"
words = json.load(open(a.words))["words"]
if style.get("upper"): 
    for w in words: w["word"] = w["word"].upper()
chunk = style["words_per_chunk"]; lines = []
if chunk == 0:  # línea completa por pausas/longitud
    cur = []
    for w in words:
        if cur and (len(" ".join(x["word"] for x in cur + [w])) > style["max_chars"] or w["start"] - cur[-1]["end"] > 0.7):
            lines.append(cur); cur = []
        cur.append(w)
    if cur: lines.append(cur)
else:
    lines = [words[i:i+chunk] for i in range(0, len(words), chunk)]
ev = []
for grp in lines:
    if style.get("highlight"):
        for i, w in enumerate(grp):
            s = w["start"]; e = grp[i+1]["start"] if i+1 < len(grp) else w["end"] + 0.05
            txt = " ".join((f"{{\\c{accent}\\fscx112\\fscy112}}{x['word']}{{\\c{base}\\fscx100\\fscy100}}" if j == i else x["word"]) for j, x in enumerate(grp))
            ev.append(f"Dialogue: 0,{t(s)},{t(e)},Main,,0,0,0,,{{\\fad(0,0)}}{txt}")
    else:
        ev.append(f"Dialogue: 0,{t(grp[0]['start'])},{t(grp[-1]['end']+0.05)},Main,,0,0,0,,{{\\fad(80,80)}}{' '.join(x['word'] for x in grp)}")
if a.translations:
    for s in json.load(open(a.translations)):
        ev.append(f"Dialogue: 1,{t(s['start'])},{t(s['end'])},Sub,,0,0,0,,{s['text']}")
os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
open(a.out, "w", encoding="utf-8").write(hdr + "\n".join(ev) + "\n")
print(f"{len(ev)} eventos -> {a.out}")
