import sys, asyncio, certifi
certifi.where = lambda: "/root/.ccr/ca-bundle.crt"   # CA del proxy del entorno; la verificación TLS sigue activa
import edge_tts
voice, rate, text, out = sys.argv[1:5]
asyncio.run(edge_tts.Communicate(text, voice, rate=rate).save(out))
print("ok", out)
