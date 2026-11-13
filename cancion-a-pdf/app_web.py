"""Versión web: sube un video, descarga el MP3 y el PDF con la letra.

La conversión corre en segundo plano: el navegador recibe enseguida una página de
estado que se actualiza sola, así que no importa si el celular apaga la pantalla.

Variables de entorno (todas opcionales):
  CANCION_CLAVE           contraseña de acceso; si está vacía no se pide (uso local)
  CANCION_MODELOS         modelos permitidos separados por coma (p. ej. "tiny,base")
  CANCION_MODELO_DEFECTO  modelo seleccionado por defecto
  CANCION_MAX_MB          tamaño máximo de subida en MB (1024 por defecto)
  CANCION_MAX_TRABAJOS    conversiones simultáneas (1 por defecto; el resto espera en cola)
  CANCION_SALIDAS         carpeta donde se guardan los resultados
  CANCION_HOST / CANCION_PORT  dirección y puerto al ejecutar `python app_web.py`
"""
from __future__ import annotations

import hmac
import json
import os
import re
import shutil
import threading
import time
import uuid
from pathlib import Path

from flask import (Flask, Response, abort, redirect, render_template, request,
                   send_from_directory, url_for)

from convertidor import MODELOS_VALIDOS, ErrorConversion, procesar

BASE = Path(__file__).parent
SALIDA = Path(os.environ.get("CANCION_SALIDAS", BASE / "salidas"))
SALIDA.mkdir(parents=True, exist_ok=True)
EXTENSIONES = {".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v", ".3gp",
               ".mp3", ".wav", ".m4a", ".aac", ".ogg", ".opus"}
RE_ID = re.compile(r"^[0-9a-f]{12}$")
RE_IDIOMA = re.compile(r"^[a-zA-Z]{2,3}(-[a-zA-Z]{2,4})?$")
HORAS_RETENCION = 24
ARRANQUE = uuid.uuid4().hex  # identifica este proceso para detectar trabajos interrumpidos


def _modelos_permitidos() -> tuple[str, ...]:
    pedidos = [m.strip() for m in os.environ.get("CANCION_MODELOS", "").split(",") if m.strip()]
    return tuple(m for m in pedidos if m in MODELOS_VALIDOS) or MODELOS_VALIDOS


MODELOS = _modelos_permitidos()
MODELO_DEFECTO = os.environ.get("CANCION_MODELO_DEFECTO", "small")
if MODELO_DEFECTO not in MODELOS:
    MODELO_DEFECTO = MODELOS[-1]
_cupos = threading.Semaphore(max(1, int(os.environ.get("CANCION_MAX_TRABAJOS", "1"))))

app = Flask(__name__, template_folder=str(BASE / "templates"))
app.config["MAX_CONTENT_LENGTH"] = int(os.environ.get("CANCION_MAX_MB", "1024")) * 1024 * 1024
app.config["CLAVE"] = os.environ.get("CANCION_CLAVE", "")


# ---------- acceso con contraseña ----------
@app.before_request
def pedir_clave():
    clave = app.config.get("CLAVE")
    if not clave or request.endpoint in ("static", "salud"):
        return None
    auth = request.authorization
    if auth and auth.password and hmac.compare_digest(auth.password.encode(), clave.encode()):
        return None
    return Response("Se necesita la contraseña.", 401,
                    {"WWW-Authenticate": 'Basic realm="Cancion PDF", charset="UTF-8"'})


@app.get("/salud")
def salud():
    return {"ok": True}


# ---------- estado de los trabajos ----------
def _estado_path(id_trabajo: str) -> Path:
    return SALIDA / id_trabajo / "estado.json"


def _guardar_estado(id_trabajo: str, **datos) -> None:
    ruta = _estado_path(id_trabajo)
    tmp = ruta.with_suffix(".tmp")
    tmp.write_text(json.dumps({**datos, "arranque": ARRANQUE}, ensure_ascii=False))
    tmp.replace(ruta)  # escritura atómica


def _leer_estado(id_trabajo: str) -> dict | None:
    try:
        datos = json.loads(_estado_path(id_trabajo).read_text())
    except (OSError, ValueError):
        return None
    if datos.get("estado") in ("en_cola", "procesando") and datos.get("arranque") != ARRANQUE:
        datos = {"estado": "error", "titulo": datos.get("titulo", ""),
                 "mensaje": "El servidor se reinició durante la conversión. Vuelve a subir el archivo."}
    return datos


def limpiar_antiguos() -> None:
    limite = time.time() - HORAS_RETENCION * 3600
    for carpeta in SALIDA.iterdir():
        if carpeta.is_dir() and carpeta.stat().st_mtime < limite:
            shutil.rmtree(carpeta, ignore_errors=True)


def _trabajar(id_trabajo: str, entrada: Path, titulo: str, opciones: dict) -> None:
    carpeta = SALIDA / id_trabajo
    with _cupos:
        _guardar_estado(id_trabajo, estado="procesando", titulo=titulo)
        try:
            rutas = procesar(entrada, carpeta, titulo, **opciones)
            _guardar_estado(id_trabajo, estado="listo", titulo=titulo,
                            pdf=rutas["pdf"].name, mp3=rutas["mp3"].name)
        except ErrorConversion as e:
            _guardar_estado(id_trabajo, estado="error", titulo=titulo, mensaje=str(e))
        except Exception:  # noqa: BLE001 - no exponer detalles internos al usuario
            app.logger.exception("Fallo al convertir %s", id_trabajo)
            _guardar_estado(id_trabajo, estado="error", titulo=titulo,
                            mensaje="Ocurrió un error inesperado al convertir el archivo.")
        finally:
            entrada.unlink(missing_ok=True)


# ---------- páginas ----------
def _pagina(error=None, trabajo=None, status=200):
    html = render_template("index.html", modelos=MODELOS, modelo_defecto=MODELO_DEFECTO,
                           error=error, trabajo=trabajo)
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
    modelo = request.form.get("modelo", MODELO_DEFECTO)
    idioma = (request.form.get("idioma") or "").strip() or None

    if archivo is None or not archivo.filename:
        return _pagina("Selecciona un archivo de video o audio.", status=400)
    extension = Path(archivo.filename).suffix.lower()
    if extension not in EXTENSIONES:
        return _pagina("Formato no soportado. Usa un video (MP4, MOV, MKV, WEBM…) o un audio.", status=400)
    if modelo not in MODELOS:
        return _pagina("Modelo de transcripción no válido.", status=400)
    if idioma and not RE_IDIOMA.match(idioma):
        return _pagina("El idioma debe ser un código como es, en o pt.", status=400)

    id_trabajo = uuid.uuid4().hex[:12]
    carpeta = SALIDA / id_trabajo
    carpeta.mkdir()
    entrada = carpeta / f"entrada{extension}"
    archivo.save(entrada)
    _guardar_estado(id_trabajo, estado="en_cola", titulo=titulo)
    opciones = {"letra_manual": letra, "modelo": modelo, "idioma": idioma,
                "con_tiempos": request.form.get("con_tiempos") == "on"}
    threading.Thread(target=_trabajar, args=(id_trabajo, entrada, titulo, opciones),
                     daemon=True).start()
    return redirect(url_for("trabajo", id_trabajo=id_trabajo), code=303)


@app.get("/trabajo/<id_trabajo>")
def trabajo(id_trabajo: str):
    if not RE_ID.match(id_trabajo):
        abort(404)
    estado = _leer_estado(id_trabajo)
    if estado is None:
        abort(404)
    estado["id"] = id_trabajo
    if estado["estado"] == "listo":
        estado["url_pdf"] = url_for("descargar", id_trabajo=id_trabajo, archivo=estado["pdf"])
        estado["url_mp3"] = url_for("descargar", id_trabajo=id_trabajo, archivo=estado["mp3"])
    return _pagina(trabajo=estado)


@app.get("/descargar/<id_trabajo>/<archivo>")
def descargar(id_trabajo: str, archivo: str):
    if not RE_ID.match(id_trabajo) or Path(archivo).name != archivo:
        abort(404)
    if Path(archivo).suffix.lower() not in (".pdf", ".mp3"):
        abort(404)
    carpeta = SALIDA / id_trabajo
    if not (carpeta / archivo).is_file():
        abort(404)
    return send_from_directory(carpeta, archivo, as_attachment=True)


@app.errorhandler(413)
def demasiado_grande(_e):
    limite = app.config["MAX_CONTENT_LENGTH"] // (1024 * 1024)
    return _pagina(f"El archivo es demasiado grande. El máximo es {limite} MB.", status=413)


if __name__ == "__main__":
    anfitrion = os.environ.get("CANCION_HOST", "127.0.0.1")
    puerto = int(os.environ.get("CANCION_PORT", "5057"))
    app.run(host=anfitrion, port=puerto, debug=False, threaded=True)
