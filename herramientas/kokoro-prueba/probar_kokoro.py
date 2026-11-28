import soundfile as sf, time
from kokoro_onnx import Kokoro
k=Kokoro("kokoro-v1.0.int8.onnx","voices-v1.0.bin")
print([v for v in k.get_voices() if v[:2] in("ef","em","pf","pm")])
for lang,voice,txt,out in [("es","ef_dora","Hola, esta es una prueba de voz en español para el episodio de Kubo.","es.wav"),("pt-br","pf_dora","Olá, este é um teste de voz em português para o episódio do Kubo.","pt.wav")]:
    t=time.time(); a,sr=k.create(txt,voice=voice,speed=1.0,lang=lang); sf.write(out,a,sr); print(lang,round(len(a)/sr,1),"s audio en",round(time.time()-t,1),"s")
