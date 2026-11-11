"""Núcleo de la app: video -> MP3 -> transcripción de la letra -> PDF.

Requiere ffmpeg instalado en el sistema (comando `ffmpeg` disponible en la terminal).
La transcripción usa faster-whisper (open source, se ejecuta en tu equipo).
"""
from __future__ import annotations

import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

MODELOS_VALIDOS = ("tiny", "base", "small", "medium")
_modelo_cache: dict[str, object] = {}


class ErrorConversion(Exception):
    """Error controlado que se muestra al usuario."""


@dataclass
class Segmento:
    inicio: float
    fin: float
    texto: str


def verificar_ffmpeg() -> None:
    if shutil.which("ffmpeg") is None:
        raise ErrorConversion(
            "No se encontró ffmpeg. Instálalo: macOS `brew install ffmpeg`, "
            "Windows `winget install ffmpeg`, Linux `sudo apt install ffmpeg`."
        )


def extraer_mp3(video: Path, mp3: Path) -> Path:
    """Extrae solo el audio del video a MP3 (192 kbps)."""
    verificar_ffmpeg()
    mp3.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg", "-y", "-loglevel", "error",
        "-i", str(video),
        "-vn", "-acodec", "libmp3lame", "-b:a", "192k",
        str(mp3),
    ]
    resultado = subprocess.run(cmd, capture_output=True, text=True)
    if resultado.returncode != 0 or not mp3.exists():
        raise ErrorConversion(
            "No se pudo extraer el audio del video. "
            f"Detalle: {resultado.stderr.strip()[:300]}"
        )
    return mp3


def _cargar_modelo(nombre: str):
    if nombre not in MODELOS_VALIDOS:
        raise ErrorConversion(f"Modelo no válido: {nombre}")
    if nombre not in _modelo_cache:
        from faster_whisper import WhisperModel  # import perezoso: es pesado

        _modelo_cache[nombre] = WhisperModel(nombre, device="cpu", compute_type="int8")
    return _modelo_cache[nombre]


def transcribir(mp3: Path, modelo: str = "small", idioma: str | None = None) -> list[Segmento]:
    """Convierte el audio en texto por segmentos de tiempo."""
    whisper = _cargar_modelo(modelo)
    segmentos, _info = whisper.transcribe(
        str(mp3),
        language=idioma or None,
        vad_filter=True,  # ignora silencios y música sin voz
        beam_size=5,
    )
    resultado = [Segmento(s.start, s.end, s.text.strip()) for s in segmentos]
    return [seg for seg in resultado if seg.texto]


def _tiempo(segundos: float) -> str:
    m, s = divmod(int(segundos), 60)
    return f"{m:02d}:{s:02d}"


def generar_pdf(
    pdf: Path,
    titulo: str,
    letra: str | None = None,
    segmentos: list[Segmento] | None = None,
    con_tiempos: bool = False,
) -> Path:
    """Crea un PDF con el título y la letra.

    Si `letra` viene escrita a mano, se usa tal cual; si no, se usan los segmentos
    de la transcripción (una línea por segmento).
    """
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import cm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer
    from xml.sax.saxutils import escape

    estilos = getSampleStyleSheet()
    pdf.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(pdf), pagesize=A4,
        leftMargin=2 * cm, rightMargin=2 * cm, topMargin=2 * cm, bottomMargin=2 * cm,
        title=titulo,
    )
    historia = [Paragraph(escape(titulo), estilos["Title"]), Spacer(1, 0.5 * cm)]

    if letra is not None:
        for linea in letra.splitlines():
            if linea.strip():
                historia.append(Paragraph(escape(linea), estilos["BodyText"]))
            else:
                historia.append(Spacer(1, 0.4 * cm))
    else:
        for seg in segmentos or []:
            prefijo = f"<font color='grey'>[{_tiempo(seg.inicio)}]</font> " if con_tiempos else ""
            historia.append(Paragraph(prefijo + escape(seg.texto), estilos["BodyText"]))

    if len(historia) <= 2:
        raise ErrorConversion("No hay texto para escribir en el PDF.")
    doc.build(historia)
    return pdf


def procesar(
    video: Path,
    carpeta_salida: Path,
    titulo: str,
    letra_manual: str | None = None,
    modelo: str = "small",
    idioma: str | None = None,
    con_tiempos: bool = False,
) -> dict[str, Path]:
    """Flujo completo. Devuelve las rutas del MP3 y del PDF generados."""
    nombre = "".join(c for c in titulo if c.isalnum() or c in " -_").strip() or "cancion"
    mp3 = extraer_mp3(video, carpeta_salida / f"{nombre}.mp3")
    if letra_manual and letra_manual.strip():
        pdf = generar_pdf(carpeta_salida / f"{nombre}.pdf", titulo, letra=letra_manual)
    else:
        segmentos = transcribir(mp3, modelo=modelo, idioma=idioma)
        pdf = generar_pdf(
            carpeta_salida / f"{nombre}.pdf", titulo,
            segmentos=segmentos, con_tiempos=con_tiempos,
        )
    return {"mp3": mp3, "pdf": pdf}
