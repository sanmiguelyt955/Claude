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


def main() -> None:
    puerto = _puerto_libre()
    servidor = threading.Thread(
        target=lambda: app.run(host="127.0.0.1", port=puerto, debug=False, use_reloader=False),
        daemon=True,
    )
    servidor.start()
    time.sleep(0.8)
    webview.create_window("Canción → MP3 → PDF", f"http://127.0.0.1:{puerto}/",
                          width=900, height=760)
    webview.start()


if __name__ == "__main__":
    main()
