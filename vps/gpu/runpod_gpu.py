"""Tarjeta de video por segundo en RunPod: se prende, hace el trabajo, guarda el resultado y SE BORRA COMPLETA.

    python3 runpod_gpu.py trabajo LISTA.json [--gpu "NVIDIA RTX A5000"] [--max-min 120]
    python3 runpod_gpu.py vigilante          ← red de seguridad (cron cada 10 min en el VPS): borra CUALQUIER máquina
                                               nuestra que lleve más de --max-min prendida
    python3 runpod_gpu.py estado             ← lista máquinas y saldo

Reglas de dinero (pedidas por Sanmi):
  1. La máquina SIEMPRE se borra al terminar (también si algo falla): «terminate», no «stop». Borrar = deja de cobrar
     la tarjeta Y el disco. Nunca se usan discos de red («network volumes»), que cobran aunque no haya máquina.
  2. Límite de tiempo por sesión (--max-min, 120 por defecto). Si se pasa, se borra aunque no haya terminado.
  3. Un «vigilante» en el VPS revisa cada 10 min y borra cualquier máquina olvidada (doble seguridad).
  4. Saldo bajo en la cuenta (~$10): lo peor que puede pasar es gastar ese saldo.
Clave: variable RUNPOD_API_KEY (en el VPS, /etc/taller/claves.env con `taller-clave RUNPOD_API_KEY`). Nunca en el repo.
"""
import json
import os
import sys
import time
import urllib.request

API = "https://rest.runpod.io/v1"
ETIQUETA = "kubo-studio"          # todas nuestras máquinas llevan este nombre: el vigilante solo toca esas
GPU_ORDEN = ["NVIDIA RTX A5000", "NVIDIA GeForce RTX 3090", "NVIDIA RTX A6000"]   # barata → rescate


def _pedir(metodo, ruta, datos=None):
    clave = os.environ.get("RUNPOD_API_KEY", "")
    if not clave:
        sys.exit("Falta RUNPOD_API_KEY (taller-clave RUNPOD_API_KEY en el VPS).")
    req = urllib.request.Request(API + ruta, method=metodo, data=json.dumps(datos).encode() if datos else None,
                                 headers={"Authorization": f"Bearer {clave}", "Content-Type": "application/json",
                                          "User-Agent": "kubo-studio/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        cuerpo = r.read()
        return json.loads(cuerpo) if cuerpo else {}


def maquinas():
    return [p for p in _pedir("GET", "/pods") if str(p.get("name", "")).startswith(ETIQUETA)]


def borrar(pid):
    """Borra la máquina y su disco (terminate). Reintenta: es lo más importante del script."""
    for intento in range(5):
        try:
            _pedir("DELETE", f"/pods/{pid}")
            print(f"BORRADA {pid}")
            return True
        except Exception as e:  # noqa: BLE001
            print(f"  no se pudo borrar {pid} ({e}); reintento {intento + 2}/5")
            time.sleep(10)
    print(f"ALERTA: {pid} sigue viva. El vigilante la volverá a intentar; revisa runpod.io/console/pods")
    return False


def crear(gpu, imagen, comando, disco_gb=60):
    return _pedir("POST", "/pods", {
        "name": f"{ETIQUETA}-{int(time.time())}",
        "imageName": imagen,
        "gpuTypeIds": [gpu],
        "gpuCount": 1,
        "cloudType": "SECURE",
        "containerDiskInGb": disco_gb,      # disco que se borra con la máquina
        "volumeInGb": 0,                    # sin volumen persistente: $0 de disco al terminar
        "dockerStartCmd": ["bash", "-lc", comando],
    })


def trabajo(lista, gpu=None, max_min=120):
    """Prende una máquina, corre el trabajo y la borra pase lo que pase."""
    gpus = [gpu] if gpu else GPU_ORDEN
    pod = None
    inicio = time.time()
    try:
        for g in gpus:
            try:
                pod = crear(g, lista["imagen"], lista["comando"])
                print(f"Máquina {pod['id']} con {g}")
                break
            except Exception as e:  # noqa: BLE001  (sin disponibilidad de esa tarjeta: probar la siguiente)
                print(f"  {g} no disponible ({e})")
        if not pod:
            sys.exit("Ninguna tarjeta disponible ahora; intenta más tarde.")
        while True:
            if time.time() - inicio > max_min * 60:
                print(f"LÍMITE de {max_min} min: se borra aunque no haya terminado.")
                break
            estado = _pedir("GET", f"/pods/{pod['id']}")
            if estado.get("desiredStatus") in ("EXITED", "TERMINATED"):
                print("Trabajo terminado.")
                break
            time.sleep(30)
    finally:
        if pod:
            borrar(pod["id"])
        print(f"Tiempo total: {(time.time() - inicio) / 60:.1f} min")


def vigilante(max_min=120):
    """Doble seguridad: borra cualquier máquina nuestra con más de max_min minutos."""
    ahora = time.time()
    for p in maquinas():
        nacio = int(str(p.get("name", "")).rsplit("-", 1)[-1] or 0)
        if ahora - nacio > max_min * 60:
            print(f"Máquina olvidada {p['id']} ({(ahora - nacio) / 60:.0f} min): se borra")
            borrar(p["id"])


if __name__ == "__main__":
    a = sys.argv[1:]
    mx = int(a[a.index("--max-min") + 1]) if "--max-min" in a else 120
    if a[:1] == ["trabajo"] and len(a) > 1:
        trabajo(json.load(open(a[1])), a[a.index("--gpu") + 1] if "--gpu" in a else None, mx)
    elif a[:1] == ["vigilante"]:
        vigilante(mx)
    elif a[:1] == ["estado"]:
        for p in maquinas():
            print(p.get("id"), p.get("name"), p.get("desiredStatus"))
    else:
        sys.exit(__doc__)
