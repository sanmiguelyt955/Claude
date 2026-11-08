"""Buzón de videos para IAs: lo que Sanmi manda desde su iPhone (atajo «Bajar para IAs» → a-Shell → Cloudflare).

    python3 buzon.py --listar              los videos que hay (más nuevo primero), con el link de origen
    python3 buzon.py --ultimo [carpeta]    baja el más nuevo  → imprime la ruta
    python3 buzon.py --bajar <clave> [carpeta]
    python3 buzon.py --borrar <clave>      bórralo del buzón
    python3 buzon.py --terminar <archivo>  YA ANALIZADO: borra el archivo local Y el del buzón (lo normal)

La clave se lee de $BUZON_CLAVE o ~/.config/buzon/clave (NUNCA en el repo). Si en este entorno la clave está guardada
como credencial del proxy para buzon-videos.sanmiguelyt955.workers.dev, sirve cualquier valor (el proxy la pone).
REGLA: en cuanto el análisis esté completo (sin perder datos), --terminar. El buzón NO borra por tiempo
(solo si pasa de 9 GB borra los más viejos). Videos >90 MB llegan subidos en pedazos; aquí se bajan igual.
"""
import json
import os
import sys
import urllib.parse
import urllib.request
from pathlib import Path

BUZON = "https://buzon-videos.sanmiguelyt955.workers.dev"
SCRATCH = Path("/tmp/claude-0") if Path("/tmp/claude-0").exists() else Path("/tmp")


def clave():
    if os.environ.get("BUZON_CLAVE"):
        return os.environ["BUZON_CLAVE"].strip()
    f = Path.home() / ".config/buzon/clave"
    return f.read_text().strip() if f.exists() else "inyectada-por-el-proxy"


def pedir(ruta, metodo="GET"):
    req = urllib.request.Request(BUZON + ruta, method=metodo, headers={"Authorization": f"Bearer {clave()}",
                                                                     "User-Agent": "video-claude/1.0"})
    return urllib.request.urlopen(req, timeout=600)


def listar():
    return json.loads(pedir("/lista").read())


def bajar(c, carpeta=None):
    carpeta = Path(carpeta or SCRATCH / "buzon_videos")
    carpeta.mkdir(parents=True, exist_ok=True)
    destino = carpeta / (c.split("/")[-1] + ("" if c.endswith(".mp4") else ".mp4"))
    with pedir("/video/" + urllib.parse.quote(c, safe="/")) as r, open(destino, "wb") as f:
        while b := r.read(1 << 20):
            f.write(b)
    return destino


if __name__ == "__main__":
    a = sys.argv[1:]
    if not a:
        sys.exit(__doc__)
    if a[0] == "--listar":
        for v in listar():
            print(f"{v['clave']}  {v['bytes'] / 1e6:.1f} MB  {v['subido']}  {v['origen']}")
    elif a[0] == "--ultimo":
        vs = listar()
        if not vs:
            sys.exit("El buzón está vacío.")
        print(bajar(vs[0]["clave"], a[1] if len(a) > 1 else None))
    elif a[0] == "--bajar" and len(a) > 1:
        print(bajar(a[1], a[2] if len(a) > 2 else None))
    elif a[0] == "--terminar" and len(a) > 1:
        arch = Path(a[1])
        print(pedir("/video/" + urllib.parse.quote("videos/" + arch.name, safe="/"), "DELETE").read().decode())
        arch.unlink(missing_ok=True)
        print("borrado local:", arch)
    elif a[0] == "--borrar" and len(a) > 1:
        print(pedir("/video/" + urllib.parse.quote(a[1], safe="/"), "DELETE").read().decode())
    else:
        sys.exit(__doc__)
