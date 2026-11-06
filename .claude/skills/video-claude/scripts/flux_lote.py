"""Genera en lote las imágenes de un proyecto con el Worker imagenes-flux (FLUX gratis en Cloudflare).

Uso: python3 flux_lote.py lista.json carpeta_salida
  lista.json = {"estilo": "...", "imagenes": [{"id": "f1_galeria", "prompt": "...", "formato": "9:16"},
                                             {"id": "e1_cuadro", "prompt": "...", "fondo": "verde"}, ...]}
La URL del MCP (con la clave) se lee de la variable IMAGENES_FLUX_URL o del archivo que indique
IMAGENES_FLUX_URL_ARCHIVO; nunca se guarda en el repo. Salta las imágenes que ya existan.
"""
import json
import os
import re
import sys
import time
import urllib.request
from pathlib import Path

UA = {"User-Agent": "video-claude/1.0", "Content-Type": "application/json"}


def url_mcp():
    u = os.environ.get("IMAGENES_FLUX_URL")
    if not u and os.environ.get("IMAGENES_FLUX_URL_ARCHIVO"):
        u = Path(os.environ["IMAGENES_FLUX_URL_ARCHIVO"]).read_text().strip()
    if not u:
        sys.exit("Falta IMAGENES_FLUX_URL (https://imagenes-flux.<cuenta>.workers.dev/<CLAVE>/mcp)")
    return u


def llamar(u, nombre, args):
    cuerpo = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": nombre, "arguments": args}}).encode()
    with urllib.request.urlopen(urllib.request.Request(u, cuerpo, UA), timeout=180) as r:
        res = json.loads(r.read())
    if "error" in res:
        raise RuntimeError(res["error"])
    textos = [c.get("text", "") for c in res["result"].get("content", []) if c.get("type") == "text"]
    if res["result"].get("isError"):
        raise RuntimeError(" ".join(textos))
    return " ".join(textos)


def main():
    lista, salida = json.loads(Path(sys.argv[1]).read_text()), Path(sys.argv[2])
    salida.mkdir(parents=True, exist_ok=True)
    u = url_mcp()
    for im in lista["imagenes"]:
        destino = salida / f"{im['id']}.jpg"
        if destino.is_file():
            continue
        args = {"prompt": im["prompt"], "formato": im.get("formato", "1:1"), "estilo": im.get("estilo", lista.get("estilo", ""))}
        if im.get("fondo"):
            args["fondo"] = im["fondo"]
        for intento in range(3):
            try:
                t0 = time.time()
                texto = llamar(u, "generar_imagen", args)
                enlace = re.search(r"https://\S+?/img/[0-9a-f]+\.jpg", texto).group(0)
                with urllib.request.urlopen(urllib.request.Request(enlace, headers=UA), timeout=60) as r:
                    destino.write_bytes(r.read())
                print(f"{im['id']}: {time.time() - t0:.0f} s", flush=True)
                break
            except Exception as e:  # noqa: BLE001
                print(f"{im['id']}: fallo ({e}); reintento", file=sys.stderr, flush=True)
                if "cuota" in str(e).lower():
                    sys.exit(1)
                time.sleep(5 * (intento + 1))
    print(llamar(u, "cuota_imagenes", {}))


if __name__ == "__main__":
    main()
