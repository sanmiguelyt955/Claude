import pytest
import app_web


@pytest.fixture
def cliente(tmp_path, monkeypatch):
    monkeypatch.setattr(app_web, "SALIDA", tmp_path)
    app_web.app.config["TESTING"] = True
    return app_web.app.test_client()


def test_descarga_rechaza_ids_no_validos(cliente, tmp_path):
    (tmp_path / "secreto.pdf").write_text("x")
    for ruta in ["/descargar/..%2F/secreto.pdf", "/descargar/abc/secreto.pdf",
                 "/descargar/..../secreto.pdf"]:
        r = cliente.get(ruta)
        assert r.status_code in (404, 308), ruta  # nunca 200: no se sirve nada


def test_descarga_archivo_inexistente(cliente):
    assert cliente.get("/descargar/0123456789ab/no.pdf").status_code == 404


def test_idioma_invalido_se_rechaza(cliente):
    r = cliente.post("/convertir", data={"video": (__import__("io").BytesIO(b"x"), "a.mp4"),
                                         "idioma": "../../etc"},
                     content_type="multipart/form-data")
    assert r.status_code == 400


def test_formato_no_soportado(cliente):
    r = cliente.post("/convertir", data={"video": (__import__("io").BytesIO(b"x"), "a.exe")},
                     content_type="multipart/form-data")
    assert r.status_code == 400
