"""Versión web: sube un video, descarga el MP3 y el PDF con la letra."""
from __future__ import annotations

import tempfile
import uuid
from pathlib import Path

from flask import Flask, abort, render_template, request, send_from_directory, url_for

from convertidor import MODELOS_VALIDOS, ErrorConversion, procesar

BASE = Path(__file__).parent
SALIDA = BASE / "salidas"
SALIDA.mkdir(exist_ok=True)
EXTENSIONES = {".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v", ".mp3", ".wav", ".m4a"}

app = Flask(__name__, template_folder=str(BASE / "templates"))
app.config["MAX_CONTENT_LENGTH"] = 1024 * 1024 * 1024  # 1 GB


@app.get("/")
def inicio():
    return render_template("index.html", modelos=MODELOS_VALIDOS, error=None, resultado=None)


@app.post("/convertir")
def convertir():
    archivo = request.files.get("video")
    titulo = (request.form.get("titulo") or "").strip() or "Canción"
    letra = request.form.get("letra") or None
    modelo = request.form.get("modelo", "small")
    idioma = (request.form.get("idioma") or "").strip() or None
    con_tiempos = request.form.get("con_tiempos") == "on"

    def mostrar_error(msg: str):
        return render_template("index.html", modelos=MODELOS_VALIDOS, error=msg, resultado=None), 400

    if archivo is None or not archivo.filename:
        return mostrar_error("Selecciona un archivo de video.")
    if Path(archivo.filename).suffix.lower() not in EXTENSIONES:
        return mostrar_error("Formato no soportado. Usa MP4, MOV, MKV, WEBM, AVI, M4V o audio.")
    if modelo not in MODELOS_VALIDOS:
        return mostrar_error("Modelo de transcripción no válido.")

    id_trabajo = uuid.uuid4().hex[:12]
    carpeta = SALIDA / id_trabajo
    carpeta.mkdir()
    with tempfile.TemporaryDirectory() as tmp:
        origen = Path(tmp) / f"entrada{Path(archivo.filename).suffix.lower()}"
        archivo.save(origen)
        try:
            rutas = procesar(origen, carpeta, titulo, letra_manual=letra,
                             modelo=modelo, idioma=idioma, con_tiempos=con_tiempos)
        except ErrorConversion as e:
            return mostrar_error(str(e))
        except Exception:  # noqa: BLE001 - error inesperado, sin detalles internos al usuario
            app.logger.exception("Fallo al convertir")
            return mostrar_error("Ocurrió un error inesperado al convertir el archivo.")

    return render_template(
        "index.html", modelos=MODELOS_VALIDOS, error=None,
        resultado={
            "titulo": titulo,
            "pdf": url_for("descargar", id_trabajo=id_trabajo, archivo=rutas["pdf"].name),
            "mp3": url_for("descargar", id_trabajo=id_trabajo, archivo=rutas["mp3"].name),
        },
    )


@app.get("/descargar/<id_trabajo>/<archivo>")
def descargar(id_trabajo: str, archivo: str):
    carpeta = SALIDA / id_trabajo
    if not carpeta.is_dir() or Path(archivo).name != archivo:
        abort(404)
    return send_from_directory(carpeta, archivo, as_attachment=True)


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5057, debug=False)
