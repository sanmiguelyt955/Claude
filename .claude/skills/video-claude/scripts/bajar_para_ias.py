"""«Bajar para IAs»: programa para a-Shell (iPhone) que usa el atajo del mismo nombre.

En a-Shell, una sola vez:
    curl -L -o bajar.py https://raw.githubusercontent.com/sanmiguelyt955/claude/claude/video-editing-skill-6wybxb/.claude/skills/video-claude/scripts/bajar_para_ias.py

Y una sola vez la clave del buzón (Claude te la da):  copiarla y  pbpaste > .clave_buzon

El atajo (Recibir de Hoja de compartir → Ejecutar comando de a-Shell con «Abrir la app: sí» → Esperar a regresar →
Mostrar notificación):
    cd ~/Documents
    python3 bajar.py [Entrada de atajo]   ← baja el video en 1080p y, si existe .clave_buzon, lo SUBE al buzón de
                                            las IAs (Cloudflare) y lo borra del iPhone
    open shortcuts://                     ← regresa a Atajos
Las IAs lo bajan con  buzon.py --ultimo  (y se borra solo del buzón a los 7 días).
Sin .clave_buzon hace lo de antes: deja ia/video.mp4 (y  python3 bajar.py --limpiar  lo borra).

Prueba a mano: copia un link, y en a-Shell escribe  pbpaste > link.txt  y luego  python3 bajar.py
"""
import os
import shutil
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
CARPETA = os.path.join(AQUI, "ia")
LINK = os.path.join(AQUI, "link.txt")
CLAVE = os.path.join(AQUI, ".clave_buzon")          # clave del buzón (se pega UNA vez:  pbpaste > .clave_buzon)
BUZON = "https://buzon-videos.sanmiguelyt955.workers.dev"


def subir(final, url):
    """Manda el video al buzón de las IAs (Cloudflare) y lo borra del iPhone. Sin Drive, sin toques."""
    import urllib.parse
    import urllib.request
    clave = open(CLAVE, encoding="utf-8").read().strip()
    tam = os.path.getsize(final)
    destino = f"{BUZON}/subir?" + urllib.parse.urlencode({"nombre": "video.mp4", "origen": url})
    print(f"Subiendo al buzón de las IAs ({tam / 1e6:.1f} MB)…")
    with open(final, "rb") as f:
        req = urllib.request.Request(destino, data=f, method="PUT", headers={
            "Authorization": f"Bearer {clave}", "Content-Type": "video/mp4", "Content-Length": str(tam),
            "User-Agent": "bajar-para-ias/1.0"})   # sin esto Cloudflare responde 403
        try:
            r = urllib.request.urlopen(req, timeout=600).read().decode()
        except Exception as e:  # noqa: BLE001
            sys.exit(f"No se pudo subir al buzón ({e}). El video sigue en ia/video.mp4.")
    if '"ok": true' not in r:
        sys.exit(f"El buzón no aceptó el video: {r[:200]}")
    shutil.rmtree(CARPETA, ignore_errors=True)
    print("Listo: el video ya está en el buzón de las IAs (y se borró del iPhone).")


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
    if os.path.exists(CLAVE):
        subir(final, url)


if __name__ == "__main__":
    if "--limpiar" in sys.argv:
        limpiar()
    else:   # el atajo pasa el link directo:  python3 bajar.py "[Entrada de atajo]"  (la extensión no lee el portapapeles)
        bajar(" ".join(sys.argv[1:]) or None)
