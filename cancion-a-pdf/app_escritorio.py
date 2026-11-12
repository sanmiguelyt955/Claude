"""Versión de escritorio: abre la misma app web dentro de una ventana nativa."""
import socket
import threading
import time

import webview

from app_web import app


def _puerto_libre() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _esperar_servidor(puerto: int, limite_s: float = 10.0) -> None:
    """Espera a que el servidor acepte conexiones antes de abrir la ventana."""
    fin = time.time() + limite_s
    while time.time() < fin:
        try:
            with socket.create_connection(("127.0.0.1", puerto), timeout=0.2):
                return
        except OSError:
            time.sleep(0.1)
    raise RuntimeError("El servidor interno no arrancó a tiempo.")


def main() -> None:
    puerto = _puerto_libre()
    threading.Thread(
        target=lambda: app.run(host="127.0.0.1", port=puerto, debug=False,
                               use_reloader=False, threaded=True),
        daemon=True,
    ).start()
    _esperar_servidor(puerto)
    webview.create_window("Canción → MP3 → PDF", f"http://127.0.0.1:{puerto}/",
                          width=900, height=760, min_size=(480, 600))
    webview.start()


if __name__ == "__main__":
    main()
