"""Baja un archivo de Google Drive compartido con «Cualquier persona con el enlace» (sin iniciar sesión).

Uso con la carpeta «Videos para IAs» de Sanmi (atajo de iPhone «Bajar para IAs»):
  1. Buscar el más nuevo con el conector de Google Drive:
       search_files  query: title contains '' and parentId = '<ID de la carpeta>'   orderBy: modifiedTime desc
     (o  mimeType contains 'video/' and modifiedTime > '<fecha>')
  2. python3 drive_publico.py <ID o link> [carpeta]   → imprime la ruta del video bajado
  3. Analizarlo con la skill (ver_video / motion) y BORRARLO al terminar:  python3 drive_publico.py --borrar <ruta>

Si el archivo no es público devuelve error (Google manda una página de «iniciar sesión» en vez del video).
"""
import re
import sys
import urllib.request
from http.cookiejar import CookieJar
from pathlib import Path

SCRATCH = Path("/tmp/claude-0") if Path("/tmp/claude-0").exists() else Path("/tmp")


def id_de(texto):
    m = re.search(r"(?:/d/|id=|folders/)([A-Za-z0-9_-]{20,})", texto)
    return m.group(1) if m else texto.strip()


def bajar(id_o_link, carpeta=None):
    fid = id_de(id_o_link)
    carpeta = Path(carpeta or SCRATCH / "drive_videos")
    carpeta.mkdir(parents=True, exist_ok=True)
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()))
    op.addheaders = [("User-Agent", "video-claude/1.0")]
    url = f"https://drive.usercontent.google.com/download?id={fid}&export=download&confirm=t"
    with op.open(url, timeout=300) as r:
        tipo = r.headers.get("Content-Type", "")
        nombre = re.search(r'filename="?([^";]+)', r.headers.get("Content-Disposition", "") or "")
        if "text/html" in tipo:
            raise RuntimeError("Drive devolvió una página web, no el video: el archivo NO está compartido con "
                               "«Cualquier persona con el enlace» (o el link está mal).")
        destino = carpeta / (nombre.group(1) if nombre else f"{fid}.mp4")
        with open(destino, "wb") as f:
            while True:
                b = r.read(1 << 20)
                if not b:
                    break
                f.write(b)
    return destino


if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "--borrar":
        Path(sys.argv[2]).unlink(missing_ok=True)
        print("borrado:", sys.argv[2])
    elif len(sys.argv) >= 2:
        try:
            print(bajar(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None))
        except RuntimeError as e:
            sys.exit(str(e))
    else:
        sys.exit(__doc__)
