"""Genera dist/oracle-video-nube.sh: script de inicio (cloud-init) para Oracle Cloud Always Free.

Se pega en la consola de Oracle al crear la instancia (Ubuntu 24.04, ARM Ampere A1). Instala ffmpeg,
Python, las dependencias y Caddy (HTTPS automático con <ip>.sslip.io), y deja el servidor como
servicio que arranca solo. El código va dentro del script (minificado + xz + base64), porque el repo
es privado. Oracle limita los metadatos a 32 000 bytes una vez codificados en base64, así que el
script en bruto tiene que quedarse por debajo de unos 23 KB.

Uso:  python nube/oracle_generar.py
"""
import ast
import base64
import io
import lzma
import sys
import tarfile
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
ARCHIVOS = ["servidor_nube.py", "vision_local.py", "escucha_local.py", "oido_modelo.py"]
LIMITE_BRUTO = 23_000   # 23 000 * 4/3 ≈ 30 700 en base64 (+ margen para una clave SSH corta)


def minificar(codigo):
    """Quita docstrings (salvo las de herramientas MCP, que Claude lee) y comentarios. No cambia el código."""
    arbol = ast.parse(codigo)
    for n in ast.walk(arbol):
        if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef, ast.Module)) and n.body \
                and isinstance(n.body[0], ast.Expr) and isinstance(getattr(n.body[0], "value", None), ast.Constant) \
                and isinstance(n.body[0].value.value, str):
            if isinstance(n, ast.FunctionDef) and any(getattr(d, "attr", getattr(d, "id", "")) == "tool"
                                                      for d in n.decorator_list):
                continue
            n.body = n.body[1:] or [ast.Pass()]
    return ast.unparse(arbol)


REQUISITOS = """fastmcp==4.1.6
faster-whisper==1.2.1
transformers==5.22.1
huggingface_hub==2.4.0
librosa==1.0.0
soundfile
scikit-learn
numpy
pillow
yt-dlp[default]
"""

PLANTILLA = r'''#!/bin/bash
# video-nube en Oracle Cloud Always Free (Ubuntu 24.04 ARM). CAMBIA SOLO LA LÍNEA DE ABAJO:
CLAVE="CAMBIA-ESTA-CLAVE"
# Instalación: 15-25 min. Registro: /var/log/video-nube-instalacion.log
exec > /var/log/video-nube-instalacion.log 2>&1
set -x
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y python3-venv python3-dev build-essential ffmpeg caddy curl xz-utils
# Las imágenes Ubuntu de Oracle solo abren el puerto 22: abrir 80 y 443 (HTTPS)
iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
netfilter-persistent save || true
IP=$(curl -s https://api.ipify.org || curl -s https://ifconfig.me)
DOMINIO="$(echo "$IP" | tr . -).sslip.io"
# Registro de instalación visible en https://<dominio>/<clave>/instalacion.txt (sin entrar al servidor)
mkdir -p /var/www/estado
systemd-run --unit=copia-registro bash -c 'while true; do cp /var/log/video-nube-instalacion.log /var/www/estado/instalacion.txt; chmod 644 /var/www/estado/instalacion.txt; sleep 15; done'
cat > /etc/caddy/Caddyfile <<CADDY
$DOMINIO {
	request_body {
		max_size 2GB
	}
	handle /$CLAVE/instalacion.txt {
		uri strip_prefix /$CLAVE
		root * /var/www/estado
		file_server
	}
	handle {
		reverse_proxy 127.0.0.1:7860
	}
}
CADDY
systemctl restart caddy
id videonube || useradd -m -s /bin/bash videonube
mkdir -p /opt/video-nube && cd /opt/video-nube
base64 -d <<'B64' | xz -d | tar -xf -
__CODIGO__
B64
python3 -m venv venv
venv/bin/pip install -q --upgrade pip
venv/bin/pip install -q torch torchaudio torchvision
venv/bin/pip install -q -r requirements-nube.txt
venv/bin/pip install -q deno || true
mkdir -p datos && chown -R videonube:videonube /opt/video-nube
cat > /etc/systemd/system/video-nube.service <<EOF
[Unit]
Description=video-nube (MCP que ve y oye videos)
After=network-online.target
[Service]
User=videonube
WorkingDirectory=/opt/video-nube
Environment=MCP_CLAVE=$CLAVE
Environment=PORT=7860
Environment=PRECARGAR_MODELOS=1
Environment=HOME=/home/videonube
Environment=PATH=/opt/video-nube/venv/bin:/usr/local/bin:/usr/bin:/bin
ExecStart=/opt/video-nube/venv/bin/python servidor_nube.py --http
Restart=always
RestartSec=5
[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now video-nube
echo "https://$DOMINIO/$CLAVE/mcp" > /root/URL-CONECTOR.txt
echo "INSTALACION TERMINADA: el servidor arranca y descarga los modelos (unos minutos)."
'''


def main():
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w") as tar:
        for nombre, texto in [(f, minificar((RAIZ / f).read_text(encoding="utf-8"))) for f in ARCHIVOS] + \
                             [("requirements-nube.txt", REQUISITOS)]:
            data = texto.encode("utf-8")
            info = tarfile.TarInfo(nombre)
            info.size = len(data)
            tar.addfile(info, io.BytesIO(data))
    codigo = base64.encodebytes(lzma.compress(buf.getvalue(), preset=9 | lzma.PRESET_EXTREME)).decode().strip()
    script = PLANTILLA.replace("__CODIGO__", codigo)
    destino = RAIZ / "dist" / "oracle-video-nube.sh"
    destino.parent.mkdir(exist_ok=True)
    destino.write_text(script, encoding="utf-8")
    bruto, b64 = len(script.encode()), len(base64.b64encode(script.encode()))
    print(f"{destino}: {bruto} bytes (en base64: {b64} de 32000 permitidos)")
    if bruto > LIMITE_BRUTO:
        print("DEMASIADO GRANDE para los metadatos de Oracle"); return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
