"""Poly Haven: cielos (HDRI), texturas y modelos 3D GRATIS y libres (CC0: se pueden usar en videos monetizados
sin dar crédito). API pública: https://api.polyhaven.com  (no necesita clave).

    python3 polyhaven.py buscar hdris "sunset"              lista ids (más descargados primero)
    python3 polyhaven.py buscar textures "wood floor"
    python3 polyhaven.py buscar models "chair"
    python3 polyhaven.py bajar hdris kloofendal_48d_partly_cloudy_puresky [--res 2k]
    python3 polyhaven.py bajar textures wood_floor_deck [--res 1k]     (color, normal, rugosidad… en una carpeta)
    python3 polyhaven.py bajar models Chair_01 [--res 1k]             (.gltf + texturas)

Guarda en datos/polyhaven/<tipo>/<id>/ y reutiliza lo que ya bajó (biblioteca: cada video nuevo cuesta menos).
En Blender: los HDRI van como fondo/luz del mundo (EEVEE/Cycles); los modelos .gltf se importan con
bpy.ops.import_scene.gltf.
"""
import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

API = "https://api.polyhaven.com"
UA = {"User-Agent": "kubo-studio/1.0 (videos de Sanmi)"}   # Poly Haven pide identificar la app
DESTINO = Path(__file__).resolve().parents[4] / "datos/polyhaven"


def pedir(ruta):
    return json.loads(urllib.request.urlopen(urllib.request.Request(API + ruta, headers=UA), timeout=60).read())


def buscar(tipo, texto="", n=15):
    datos = pedir(f"/assets?t={tipo}")
    palabras = [p for p in texto.lower().split() if p]
    res = []
    for aid, a in datos.items():
        campo = " ".join([aid, a.get("name", ""), " ".join(a.get("tags", [])), " ".join(a.get("categories", []))]).lower()
        if all(p in campo for p in palabras):
            res.append((a.get("download_count", 0), aid, a.get("name", ""), ", ".join(a.get("categories", [])[:4])))
    return sorted(res, reverse=True)[:n]


def _bajar(url, ruta):
    ruta.parent.mkdir(parents=True, exist_ok=True)
    if ruta.exists() and ruta.stat().st_size > 0:
        return ruta
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=300) as r, open(ruta, "wb") as f:
        while b := r.read(1 << 20):
            f.write(b)
    return ruta


def bajar(tipo, aid, res="2k"):
    archivos = pedir(f"/files/{urllib.parse.quote(aid)}")
    carpeta = DESTINO / tipo / aid
    hechos = []
    if tipo == "hdris":
        info = archivos["hdri"].get(res) or next(iter(archivos["hdri"].values()))
        f = info.get("hdr") or info.get("exr")
        hechos.append(_bajar(f["url"], carpeta / Path(f["url"]).name))
    elif tipo == "textures":
        for mapa, porres in archivos.items():
            if not isinstance(porres, dict) or res not in porres:
                continue
            fmt = porres[res].get("jpg") or porres[res].get("png")
            if fmt and "url" in fmt:
                hechos.append(_bajar(fmt["url"], carpeta / Path(fmt["url"]).name))
    elif tipo == "models":
        g = archivos.get("gltf", {}).get(res) or next(iter(archivos.get("gltf", {}).values()))
        principal = g["gltf"]
        hechos.append(_bajar(principal["url"], carpeta / Path(principal["url"]).name))
        for rel, inc in principal.get("include", {}).items():
            hechos.append(_bajar(inc["url"], carpeta / rel))
    (carpeta / "LICENCIA.txt").write_text("CC0 (dominio público) — Poly Haven, https://polyhaven.com/license\n")
    return carpeta, hechos


if __name__ == "__main__":
    a = sys.argv[1:]
    if len(a) >= 2 and a[0] == "buscar":
        for d, aid, nombre, cats in buscar(a[1], " ".join(a[2:])):
            print(f"{aid:45s} {nombre[:30]:30s} {cats}  ({d} descargas)")
    elif len(a) >= 3 and a[0] == "bajar":
        res = a[a.index("--res") + 1] if "--res" in a else ("2k" if a[1] == "hdris" else "1k")
        carpeta, hechos = bajar(a[1], a[2], res)
        print(carpeta)
        for h in hechos:
            print("  ", h.name, f"{h.stat().st_size / 1e6:.1f} MB")
    else:
        sys.exit(__doc__)
