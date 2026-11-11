import subprocess
import shutil
import pytest
from pathlib import Path

import convertidor as c

requiere_ffmpeg = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="sin ffmpeg")


@requiere_ffmpeg
def test_extrae_mp3_de_video(tmp_path):
    video = tmp_path / "prueba.mp4"
    subprocess.run([
        "ffmpeg", "-y", "-loglevel", "error",
        "-f", "lavfi", "-i", "testsrc=duration=2:size=320x240:rate=10",
        "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
        "-shortest", "-c:v", "libx264", "-c:a", "aac", str(video),
    ], check=True)
    mp3 = c.extraer_mp3(video, tmp_path / "salida.mp3")
    assert mp3.exists() and mp3.stat().st_size > 1000


def test_pdf_con_letra_manual(tmp_path):
    pdf = c.generar_pdf(tmp_path / "letra.pdf", "Prueba", letra="Verso uno\n\nCoro & más <b>")
    assert pdf.read_bytes().startswith(b"%PDF")


def test_pdf_con_segmentos(tmp_path):
    segs = [c.Segmento(0.0, 2.0, "Primera línea"), c.Segmento(65.0, 70.0, "Segunda")]
    pdf = c.generar_pdf(tmp_path / "seg.pdf", "Prueba", segmentos=segs, con_tiempos=True)
    assert pdf.read_bytes().startswith(b"%PDF")


def test_pdf_vacio_falla(tmp_path):
    with pytest.raises(c.ErrorConversion):
        c.generar_pdf(tmp_path / "vacio.pdf", "Título", segmentos=[])


def test_modelo_invalido():
    with pytest.raises(c.ErrorConversion):
        c._cargar_modelo("gigante")
