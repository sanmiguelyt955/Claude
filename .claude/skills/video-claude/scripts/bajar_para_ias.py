"""«Bajar para IAs»: programa para a-Shell (iPhone) que usa el atajo del mismo nombre.

En a-Shell, una sola vez:
    curl -L -o bajar.py https://raw.githubusercontent.com/sanmiguelyt955/claude/claude/video-editing-skill-6wybxb/.claude/skills/video-claude/scripts/bajar_para_ias.py

El atajo hace («Ejecutar comando» de a-Shell con «Abrir la app: no», para que Atajos espere):
    cd ~/Documents
    python3 bajar.py "[Entrada de atajo]"   ← baja el video en 1080p a ia/video.mp4 (el link va en la orden:
                                              la extensión de a-Shell NO puede leer el portapapeles)
    (Get File ia/video.mp4 → Guardar archivo en Google Drive / Videos para IAs)
    python3 bajar.py --limpiar  ← borra el video del iPhone

Prueba a mano: copia un link, y en a-Shell escribe  pbpaste > link.txt  y luego  python3 bajar.py
"""
import os
import shutil
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
CARPETA = os.path.join(AQUI, "ia")
LINK = os.path.join(AQUI, "link.txt")


def limpiar():
    shutil.rmtree(CARPETA, ignore_errors=True)
    for f in (LINK,):
        if os.path.exists(f):
            os.remove(f)
    print("Listo: se borró el video del iPhone.")


def bajar(texto=None):
    if texto is None:                                    # sin link en la orden: usar link.txt (pbpaste > link.txt)
        if not os.path.exists(LINK):
            sys.exit("No encontré el link: usa  python3 bajar.py \"LINK\"  o  pbpaste > link.txt")
        texto = open(LINK, encoding="utf-8").read()
    contenido = texto.strip()
    # TikTok/Instagram a veces mandan «texto … https://…»: tomar el primer link que aparezca
    url = next((p for p in contenido.split() if p.startswith("http")), contenido[:60])
    if not url.startswith("http"):
        sys.exit(f"No llegó un link (llegó: {url[:60]!r}). Copia el link del video y vuelve a intentar.")
    shutil.rmtree(CARPETA, ignore_errors=True)
    os.makedirs(CARPETA)
    import yt_dlp
    opciones = {
        "format_sort": ["res:1080", "vcodec:h264", "ext:mp4:m4a"],   # 1080p, H.264 (abre en cualquier lado)
        "merge_output_format": "mp4",
        "outtmpl": os.path.join(CARPETA, "video.%(ext)s"),
        "noplaylist": True,
        "quiet": False,
    }
    with yt_dlp.YoutubeDL(opciones) as y:
        y.download([url])
    final = os.path.join(CARPETA, "video.mp4")
    if not os.path.exists(final):                       # por si quedó con otra extensión
        otros = [f for f in os.listdir(CARPETA) if not f.endswith(".part")]
        if otros:
            os.rename(os.path.join(CARPETA, otros[0]), final)
    if not os.path.exists(final):
        sys.exit("No se pudo bajar el video (revisa que el link sea público).")
    print(f"Listo: ia/video.mp4 ({os.path.getsize(final) / 1e6:.1f} MB)")


if __name__ == "__main__":
    if "--limpiar" in sys.argv:
        limpiar()
    else:   # el atajo pasa el link directo:  python3 bajar.py "[Entrada de atajo]"  (la extensión no lee el portapapeles)
        bajar(" ".join(sys.argv[1:]) or None)
