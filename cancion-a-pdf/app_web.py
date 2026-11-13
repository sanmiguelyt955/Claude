"""Versión web: sube un video, descarga el MP3 y el PDF con la letra."""
from __future__ import annotations

import os
import re
import shutil
import tempfile
import time
import uuid
from pathlib import Path

from flask import Flask, abort, render_template, request, send_from_directory, url_for

from convertidor import MODELOS_VALIDOS, ErrorConversion, procesar

BASE = Path(__file__).parent
SALIDA = BASE / "salidas"
SALIDA.mkdir(exist_ok=True)
EXTENSIONES = {".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v", ".mp3", ".wav", ".m4a"}
RE_ID = re.compile(r"^[0-9a-f]{12}$")
RE_IDIOMA = re.compile(r"^[a-zA-Z]{2,3}(-[a-zA-Z]{2,4})?$")
HORAS_RETENCION = 24  # los resultados se borran después de este tiempo

app = Flask(__name__, template_folder=str(BASE / "templates"))
app.config["MAX_CONTENT_LENGTH"] = 1024 * 1024 * 1024  # 1 GB


def limpiar_antiguos() -> None:
    """Borra resultados más viejos que HORAS_RETENCION para no llenar el disco."""
    limite = time.time() - HORAS_RETENCION * 3600
    for carpeta in SALIDA.iterdir():
        if carpeta.is_dir() and carpeta.stat().st_mtime < limite:
            shutil.rmtree(carpeta, ignore_errors=True)


def _pagina(error=None, resultado=None, status=200):
    html = render_template("index.html", modelos=MODELOS_VALIDOS, error=error, resultado=resultado)
    return html, status


@app.get("/")
def inicio():
    return _pagina()


@app.post("/convertir")
def convertir():
    limpiar_antiguos()
    archivo = request.files.get("video")
    titulo = (request.form.get("titulo") or "").strip()[:120] or "Canción"
    letra = request.form.get("letra") or None
    modelo = request.form.get("modelo", "small")
    idioma = (request.form.get("idioma") or "").strip() or None
    con_tiempos = request.form.get("con_tiempos") == "on"

    if archivo is None or not archivo.filename:
        return _pagina("Selecciona un archivo de video o audio.", status=400)
    if Path(archivo.filename).suffix.lower() not in EXTENSIONES:
        return _pagina("Formato no soportado. Usa MP4, MOV, MKV, WEBM, AVI, M4V o audio.", status=400)
    if modelo not in MODELOS_VALIDOS:
        return _pagina("Modelo de transcripción no válido.", status=400)
    if idioma and not RE_IDIOMA.match(idioma):
        return _pagina("El idioma debe ser un código como es, en o pt.", status=400)

    id_trabajo = uuid.uuid4().hex[:12]
    carpeta = SALIDA / id_trabajo
    carpeta.mkdir()
    try:
        with tempfile.TemporaryDirectory() as tmp:
            origen = Path(tmp) / f"entrada{Path(archivo.filename).suffix.lower()}"
            archivo.save(origen)
            rutas = procesar(origen, carpeta, titulo, letra_manual=letra,
                             modelo=modelo, idioma=idioma, con_tiempos=con_tiempos)
    except ErrorConversion as e:
        shutil.rmtree(carpeta, ignore_errors=True)
        return _pagina(str(e), status=400)
    except Exception:  # noqa: BLE001 - no exponer detalles internos al usuario
        app.logger.exception("Fallo al convertir")
        shutil.rmtree(carpeta, ignore_errors=True)
        return _pagina("Ocurrió un error inesperado al convertir el archivo.", status=500)

    return _pagina(resultado={
        "titulo": titulo,
        "pdf": url_for("descargar", id_trabajo=id_trabajo, archivo=rutas["pdf"].name),
        "mp3": url_for("descargar", id_trabajo=id_trabajo, archivo=rutas["mp3"].name),
    })


@app.get("/descargar/<id_trabajo>/<archivo>")
def descargar(id_trabajo: str, archivo: str):
    if not RE_ID.match(id_trabajo) or Path(archivo).name != archivo:
        abort(404)
    carpeta = SALIDA / id_trabajo
    if not carpeta.is_dir() or not (carpeta / archivo).is_file():
        abort(404)
    return send_from_directory(carpeta, archivo, as_attachment=True)


if __name__ == "__main__":
    # Por defecto solo es accesible desde este equipo.
    # Para usarla desde el celular en la misma red Wi-Fi: CANCION_HOST=0.0.0.0
    anfitrion = os.environ.get("CANCION_HOST", "127.0.0.1")
    puerto = int(os.environ.get("CANCION_PORT", "5057"))
    app.run(host=anfitrion, port=puerto, debug=False, threaded=True)
