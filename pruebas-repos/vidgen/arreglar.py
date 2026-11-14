"""Completa palabras que Whisper se saltó al inicio de una escena. uso: arreglar.py guion.json tiempos.json"""
import sys,json,re
spec=json.load(open(sys.argv[1])); T=json.load(open(sys.argv[2]))
norm=lambda w: re.sub(r"[^\wáéíóúñü]","",w.lower())
for sc,ts in zip(spec["escenas"],T["escenas"]):
    sw=sc["voz"].split(); ww=ts["words"]
    mono=all(ww[j]["s"]>=ww[j-1]["s"] for j in range(1,len(ww)))
    if len(ww)==len(sw) and mono: continue
    tail=[norm(w["w"]) for w in ww]; k=len(sw)-len(ww)
    gapok = k>0 and (ww[0]["s"]-ts["audio_start"]) > 0.18*k
    if k>0 and gapok and [norm(w) for w in sw[k:]]==tail:
        a=ts["audio_start"]+0.05; b=ww[0]["s"]-0.05; L=sum(len(w) for w in sw[:k]); t=a; pre=[]
        for w in sw[:k]:
            d=(b-a)*len(w)/L; pre.append({"w":w,"s":round(t,2),"e":round(t+d,2)}); t+=d
        for j,w in enumerate(ww): w["w"]=sw[k+j]
        ts["words"]=pre+ww; print("escena",ts["i"],"completada:",k,"palabras")
    else:
        # reparto proporcional por letras en toda la escena
        a=ts["audio_start"]+0.05; b=ts["audio_start"]+ts["audio_dur"]-0.1; L=sum(len(w) for w in sw); t=a; nw=[]
        for w in sw:
            d=(b-a)*len(w)/L; nw.append({"w":w,"s":round(t,2),"e":round(t+d,2)}); t+=d
        ts["words"]=nw; print("escena",ts["i"],"reparto proporcional")
json.dump(T,open(sys.argv[2],"w"),ensure_ascii=False,indent=1)
