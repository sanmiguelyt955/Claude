"""Genera voz por escena (edge-tts), tiempos por palabra (faster-whisper) y audio final.
uso: voz.py guion.json salida_dir"""
import sys, json, asyncio, subprocess, certifi, os
certifi.where = lambda: "/root/.ccr/ca-bundle.crt"
import edge_tts
from faster_whisper import WhisperModel
spec=json.load(open(sys.argv[1])); out=sys.argv[2]; os.makedirs(out,exist_ok=True)
voice=spec["voz"]; rate=spec.get("rate","+0%"); gap=spec.get("gap",0.45); lead=0.4
model=WhisperModel("small",device="cpu",compute_type="int8")
t=lead; scenes=[]
for i,sc in enumerate(spec["escenas"]):
    mp3=f"{out}/s{i}.mp3"; wav=f"{out}/s{i}.wav"
    asyncio.run(edge_tts.Communicate(sc["voz"],voice,rate=rate).save(mp3))
    subprocess.run(["ffmpeg","-loglevel","error","-y","-i",mp3,"-ar","44100","-ac","1",wav],check=True)
    d=float(subprocess.check_output(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",wav]))
    segs,_=model.transcribe(wav,language="es",word_timestamps=True,initial_prompt=sc["voz"])
    ww=[{"w":x.word.strip(),"s":round(t+x.start,2),"e":round(t+x.end,2)} for s in segs for x in s.words]
    sw=sc["voz"].split()
    if len(sw)==len(ww):
        for k in range(len(ww)): ww[k]["w"]=sw[k]   # ortografía del guion, tiempos de Whisper
    scenes.append({"i":i,"audio_start":round(t,2),"audio_dur":round(d,2),"words":ww})
    print(f"escena {i}: {d:.2f}s, {len(ww)} palabras (guion {len(sw)})", flush=True)
    t+=d+gap
target=spec.get("duracion",None); natural=t-gap+0.8
total=target if target and target>natural else natural
# repartir tiempo sobrante en las pausas para llegar a la duración objetivo
if target and target>natural and len(scenes)>1:
    extra=(target-natural)/(len(scenes)-1)
    for k,sc in enumerate(scenes):
        sh=extra*k; sc["audio_start"]=round(sc["audio_start"]+sh,2)
        for w in sc["words"]: w["s"]=round(w["s"]+sh,2); w["e"]=round(w["e"]+sh,2)
inp=[];flt=[]
for k,sc in enumerate(scenes):
    inp+=["-i",f"{out}/s{k}.wav"]; ms=int(sc["audio_start"]*1000); flt.append(f"[{k}]adelay={ms}|{ms}[a{k}]")
flt.append("".join(f"[a{k}]" for k in range(len(scenes)))+f"amix=inputs={len(scenes)}:normalize=0,apad=whole_dur={total}[o]")
subprocess.run(["ffmpeg","-loglevel","error","-y",*inp,"-filter_complex",";".join(flt),"-map","[o]","-t",str(total),"-ar","44100",f"{out}/voz.wav"],check=True)
json.dump({"total":round(total,2),"natural":round(natural,2),"escenas":scenes},open(f"{out}/tiempos.json","w"),ensure_ascii=False,indent=1)
print("total",round(total,2),"natural",round(natural,2))
