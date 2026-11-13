import io
import shutil
import subprocess
import time

import pytest

import app_web


@pytest.fixture
def cliente(tmp_path, monkeypatch):
    monkeypatch.setattr(app_web, "SALIDA", tmp_path)
    app_web.app.config["TESTING"] = True
    app_web.app.config["CLAVE"] = ""
    return app_web.app.test_client()


def _subida(nombre="a.mp4", datos=b"x", **campos):
    return {"video": (io.BytesIO(datos), nombre), **campos}


def test_descarga_rechaza_ids_no_validos(cliente, tmp_path):
    (tmp_path / "secreto.pdf").write_text("x")
    for ruta in ["/descargar/..%2F/secreto.pdf", "/descargar/abc/secreto.pdf",
                 "/descargar/..../secreto.pdf"]:
        assert cliente.get(ruta).status_code in (404, 308), ruta  # nunca 200


def test_descarga_solo_pdf_o_mp3(cliente, tmp_path):
    carpeta = tmp_path / "0123456789ab"
    carpeta.mkdir()
    (carpeta / "estado.json").write_text("{}")
    assert cliente.get("/descargar/0123456789ab/estado.json").status_code == 404


def test_idioma_invalido_se_rechaza(cliente):
    r = cliente.post("/convertir", data=_subida(idioma="../../etc"), content_type="multipart/form-data")
    assert r.status_code == 400


def test_formato_no_soportado(cliente):
    r = cliente.post("/convertir", data=_subida("a.exe"), content_type="multipart/form-data")
    assert r.status_code == 400


def test_trabajo_inexistente(cliente):
    assert cliente.get("/trabajo/0123456789ab").status_code == 404


def test_clave_obligatoria_si_esta_configurada(cliente):
    app_web.app.config["CLAVE"] = "secreta"
    assert cliente.get("/").status_code == 401
    assert cliente.get("/", auth=("x", "mala")).status_code == 401
    assert cliente.get("/", auth=("x", "secreta")).status_code == 200
    assert cliente.get("/salud").status_code == 200  # el chequeo de salud no pide clave


@pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="sin ffmpeg")
def test_flujo_completo_en_segundo_plano(cliente, tmp_path):
    video = tmp_path / "v.mp4"
    subprocess.run([
        "ffmpeg", "-y", "-loglevel", "error",
        "-f", "lavfi", "-i", "testsrc=duration=2:size=160x120:rate=5",
        "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
        "-shortest", "-c:v", "libx264", "-c:a", "aac", str(video),
    ], check=True)
    r = cliente.post("/convertir", data=_subida("v.mp4", video.read_bytes(), titulo="Prueba",
                                                letra="Verso\n\nCoro"),
                     content_type="multipart/form-data")
    assert r.status_code == 303
    pagina = r.headers["Location"]
    for _ in range(100):
        html = cliente.get(pagina).get_data(as_text=True)
        if "Descargar PDF" in html or 'class="aviso"' in html:
            break
        time.sleep(0.1)
    assert "Descargar PDF" in html
    id_trabajo = pagina.rsplit("/", 1)[-1]
    assert cliente.get(f"/descargar/{id_trabajo}/Prueba.pdf").data.startswith(b"%PDF")
    assert not list((tmp_path / id_trabajo).glob("entrada*"))  # el video original se borra


def test_trabajo_interrumpido_por_reinicio(cliente, tmp_path):
    carpeta = tmp_path / "0123456789ab"
    carpeta.mkdir()
    (carpeta / "estado.json").write_text('{"estado": "procesando", "titulo": "X", "arranque": "otro"}')
    assert "se reinició" in cliente.get("/trabajo/0123456789ab").get_data(as_text=True)
