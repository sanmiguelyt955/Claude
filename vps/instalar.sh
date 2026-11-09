#!/usr/bin/env bash
# Instalador del VPS de Sanmi (Contabo Cloud VPS, Ubuntu 24.04). Se corre UNA vez como root:
#   curl -fsSL https://raw.githubusercontent.com/sanmiguelyt955/claude/claude/video-editing-skill-6wybxb/vps/instalar.sh -o instalar.sh
#   less instalar.sh        (léelo si quieres; «q» para salir)
#   bash instalar.sh
# Se puede volver a correr sin romper nada (cada paso revisa si ya está hecho).
#
# Qué deja listo:
#   1. Seguridad: actualizaciones automáticas, firewall (solo SSH abierto a internet), fail2ban, swap de 4 GB.
#   2. Tailscale: red privada entre tu iPhone/laptop y el VPS (el escritorio solo se ve por ahí).
#   3. Escritorio (XFCE) + escritorio remoto (xrdp) → Windows App en tu iPhone, solo por Tailscale.
#   4. Docker + n8n (automatizaciones), con dirección https pública por Tailscale Funnel (puerto 443).
#   5. El taller (servidor MCP para Claude y las Muses), https por Funnel (puerto 8443).
#   6. Herramientas de video y Kubo: ffmpeg, Tesseract (es/en), Whisper, yt-dlp + deno, Blender 4.2, el repo.
set -euo pipefail
RAMA="${RAMA:-claude/video-editing-skill-6wybxb}"
REPO_URL="https://github.com/sanmiguelyt955/claude.git"
RAW="https://raw.githubusercontent.com/sanmiguelyt955/claude/$RAMA"
VENV=/opt/taller/venv
export DEBIAN_FRONTEND=noninteractive

paso() { echo; echo "════ $* ════"; }
[ "$(id -u)" -eq 0 ] || { echo "Córrelo como root (en Termius entraste como root)."; exit 1; }
grep -q "24.04" /etc/os-release || echo "AVISO: está pensado para Ubuntu 24.04; sigo de todos modos."

paso "1/7 Actualizar el sistema y seguridad básica"
apt-get update -q
apt-get -y -q -o Dpkg::Options::=--force-confold upgrade
apt-get install -y -q curl git unzip jq ufw fail2ban unattended-upgrades ca-certificates htop \
  ffmpeg tesseract-ocr tesseract-ocr-spa tesseract-ocr-eng python3-venv python3-pip \
  libegl1 libgl1 libgles2 libxi6 libxxf86vm1 libxfixes3 libxrender1 libxkbcommon0 libsm6 fonts-inter
dpkg-reconfigure -f noninteractive unattended-upgrades
if [ ! -f /swapfile ]; then
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo "/swapfile none swap sw 0 0" >> /etc/fstab
fi
timedatectl set-timezone America/Monterrey || true
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow OpenSSH >/dev/null
ufw --force enable >/dev/null
systemctl enable --now fail2ban >/dev/null
# Entrar solo con llave SSH (más seguro) — SOLO si ya hay una llave guardada, para no dejarte afuera.
if [ -s /root/.ssh/authorized_keys ]; then
  sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
  rm -f /etc/ssh/sshd_config.d/50-cloud-init.conf
  systemctl reload ssh || systemctl reload sshd || true
  echo "SSH: ahora solo se entra con llave (contraseña desactivada)."
else
  echo "SSH: sigue con contraseña (no hay llave guardada). Lo cambiamos después."
fi

paso "2/7 Tailscale (red privada)"
command -v tailscale >/dev/null || curl -fsSL https://tailscale.com/install.sh | sh
if ! tailscale status >/dev/null 2>&1; then
  echo ">>> Abre el link que sale abajo en tu celular o laptop e inicia sesión con tu cuenta de Tailscale."
  tailscale up --ssh=false --hostname=sanmi-vps
fi
ufw allow in on tailscale0 >/dev/null
HOST=$(tailscale status --json | jq -r '.Self.DNSName' | sed 's/\.$//')
echo "Nombre del VPS en Tailscale: $HOST"

paso "3/7 Escritorio (XFCE) + escritorio remoto (solo por Tailscale)"
apt-get install -y -q xfce4 xfce4-goodies xrdp dbus-x11 >/dev/null || apt-get install -y -q xfce4 xrdp dbus-x11
id sanmi >/dev/null 2>&1 || { useradd -m -s /bin/bash -G sudo sanmi; echo "Usuario de escritorio creado: sanmi"; }
echo "xfce4-session" > /home/sanmi/.xsession && chown sanmi:sanmi /home/sanmi/.xsession
adduser xrdp ssl-cert >/dev/null 2>&1 || true
systemctl enable --now xrdp >/dev/null
echo ">>> Ponle contraseña al usuario del escritorio (la usarás en Windows App):"
passwd sanmi || true

paso "4/7 Docker + n8n"
command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh
mkdir -p /opt/n8n && chown 1000:1000 /opt/n8n
if ! docker ps -a --format '{{.Names}}' | grep -qx n8n; then
  docker run -d --name n8n --restart unless-stopped -p 127.0.0.1:5678:5678 \
    -e N8N_HOST="$HOST" -e N8N_PROTOCOL=https -e WEBHOOK_URL="https://$HOST/" \
    -e GENERIC_TIMEZONE=America/Monterrey -e TZ=America/Monterrey -e N8N_SECURE_COOKIE=true \
    -e N8N_RUNNERS_ENABLED=true -v /opt/n8n:/home/node/.n8n docker.n8n.io/n8nio/n8n:latest
fi

paso "5/7 Herramientas de video y Kubo"
id taller >/dev/null 2>&1 || useradd -m -s /bin/bash taller
mkdir -p /opt/taller /etc/taller /var/log/taller /home/taller/trabajo
python3 -m venv "$VENV"
"$VENV/bin/pip" install -q --upgrade pip
"$VENV/bin/pip" install -q "fastmcp==4.1.6" uvicorn "yt-dlp[default]" faster-whisper numpy soundfile pillow \
  "scenedetect[opencv-headless]" auto-editor
# earshot (la IA «escucha» el audio): torch para procesador + earshot fijado en su versión 0.4.1
"$VENV/bin/pip" install -q torch --index-url https://download.pytorch.org/whl/cpu
"$VENV/bin/pip" install -q "git+https://github.com/Leonxlnx/earshot@v0.4.1" || echo "AVISO: earshot no se instaló"
# HyperFrames (videos con HTML) — necesita Node 22
if ! command -v node >/dev/null || [ "$(node -v | cut -c2- | cut -d. -f1)" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y -q nodejs
fi
npm install -g -s hyperframes@0.9.26 || echo "AVISO: HyperFrames no se instaló"
# MCP for Blender: su addon corre dentro de Blender (pantalla virtual) y el taller le habla por el puerto 9876
apt-get install -y -q xvfb
"$VENV/bin/pip" install -q "mcp-for-blender==2.2.7"
ADDON=$("$VENV/bin/python" -c "import blender_mcp,os;print(os.path.join(os.path.dirname(blender_mcp.__file__),'bundled','addon.py'))")
cp "$ADDON" /opt/taller/blender_mcp_addon.py
if ! command -v deno >/dev/null; then   # yt-dlp necesita un motor de JavaScript para YouTube
  curl -fsSL -o /tmp/deno.zip https://github.com/denoland/deno/releases/latest/download/deno-x86_64-unknown-linux-gnu.zip
  unzip -o -q /tmp/deno.zip -d /usr/local/bin && rm /tmp/deno.zip
fi
if [ ! -d /home/taller/claude/.git ]; then
  git clone -q --depth 1 --branch "$RAMA" "$REPO_URL" /home/taller/claude
else
  git -C /home/taller/claude pull -q || true
fi
if [ ! -x /home/taller/blender-4.2.3-linux-x64/blender ]; then
  curl -fL --progress-bar https://download.blender.org/release/Blender4.2/blender-4.2.3-linux-x64.tar.xz -o /tmp/blender.tar.xz
  tar -xJf /tmp/blender.tar.xz -C /home/taller && rm /tmp/blender.tar.xz
fi
mkdir -p /home/taller/claude/datos/kubo && ln -sfn /home/taller/claude/datos/kubo /home/taller/trabajo/kubo
chown -R taller:taller /home/taller /var/log/taller
echo 'export KUBO_BLENDER=/home/taller/blender-4.2.3-linux-x64/blender; export PATH=/opt/taller/venv/bin:$PATH' \
  > /home/taller/.bash_profile && chown taller:taller /home/taller/.bash_profile

paso "6/7 El taller (servidor MCP para Claude y las Muses)"
curl -fsSL "$RAW/vps/taller/taller.py" -o /opt/taller/taller.py
[ -f /etc/taller/llaves.json ] || echo '{}' > /etc/taller/llaves.json
touch /etc/taller/claves.env
chown taller:taller /etc/taller/llaves.json /etc/taller/claves.env && chmod 600 /etc/taller/llaves.json /etc/taller/claves.env
cat > /etc/systemd/system/taller.service <<EOF
[Unit]
Description=Taller MCP de Sanmi
After=network-online.target
[Service]
User=taller
WorkingDirectory=/home/taller/trabajo
EnvironmentFile=/etc/taller/claves.env
Environment=TALLER_PY=$VENV/bin/python KUBO_BLENDER=/home/taller/blender-4.2.3-linux-x64/blender PATH=$VENV/bin:/usr/local/bin:/usr/bin:/bin
ExecStart=$VENV/bin/python /opt/taller/taller.py
Restart=always
[Install]
WantedBy=multi-user.target
EOF
cat > /opt/taller/iniciar_blender.py <<'PYEOF'
import bpy, addon_utils
bpy.ops.preferences.addon_install(filepath="/opt/taller/blender_mcp_addon.py", overwrite=True)
addon_utils.enable("blender_mcp_addon", default_set=True)
PYEOF
cat > /etc/systemd/system/blender-vivo.service <<UNIT
[Unit]
Description=Blender en vivo con MCP for Blender (pantalla virtual)
After=network-online.target
[Service]
User=taller
Environment=DISABLE_TELEMETRY=true
ExecStart=/usr/bin/xvfb-run -a -s "-screen 0 1600x900x24" /home/taller/blender-4.2.3-linux-x64/blender --factory-startup -P /opt/taller/iniciar_blender.py
Restart=on-failure
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload && systemctl enable --now blender-vivo >/dev/null || true
# Comandos de ayuda (se usan en Termius):
cat > /usr/local/bin/taller-llave <<'EOF'
#!/usr/bin/env bash
# taller-llave <Nombre> [admin] → crea la llave de una IA para el taller y muestra su dirección (una sola vez).
set -e; n="${1:?Uso: taller-llave Nombre}"; f=/etc/taller/llaves.json
k=$(python3 -c "import secrets;print(secrets.token_hex(24))")
python3 - "$n" "$k" "$f" <<'PY'
import json,sys; n,k,f=sys.argv[1:]; d=json.load(open(f)); d[n]=k; json.dump(d,open(f,"w"),indent=1)
PY
[ "${2:-}" = admin ] && { grep -q '^TALLER_ADMINS=' /etc/taller/claves.env && sed -i "s/^TALLER_ADMINS=.*/&,$n/" /etc/taller/claves.env || echo "TALLER_ADMINS=Claude,$n" >> /etc/taller/claves.env; systemctl restart taller; }
h=$(tailscale status --json | jq -r '.Self.DNSName' | sed 's/\.$//')
echo "Dirección del taller para $n (pégala como conector; no la compartas):"
echo "https://$h:8443/$k/mcp"
EOF
cat > /usr/local/bin/taller-clave <<'EOF'
#!/usr/bin/env bash
# taller-clave GEMINI_API_KEY → la pide sin mostrarla y la guarda para el taller (p. ej. GEMINI_API_KEY, MISTRAL_API_KEY).
set -e; v="${1:?Uso: taller-clave NOMBRE_DE_LA_CLAVE}"; read -rsp "Pega la clave y Enter: " c; echo
sed -i "/^$v=/d" /etc/taller/claves.env; echo "$v=$c" >> /etc/taller/claves.env; systemctl restart taller; echo "Guardada."
EOF
chmod +x /usr/local/bin/taller-llave /usr/local/bin/taller-clave
systemctl daemon-reload && systemctl enable --now taller >/dev/null && systemctl restart taller

paso "7/7 Direcciones https públicas (Tailscale Funnel)"
echo ">>> Si sale un link para «habilitar Funnel», ábrelo, acéptalo y vuelve a correr este instalador."
tailscale funnel --bg --https=443 http://127.0.0.1:5678 || true
tailscale funnel --bg --https=8443 http://127.0.0.1:8765 || true
tailscale funnel status || true

paso "LISTO"
cat <<EOF
• n8n (automatizaciones):     https://$HOST/        (la primera vez te pide crear usuario)
• Escritorio (Windows App):   PC = $HOST   usuario = sanmi   (con Tailscale prendido en tu iPhone)
• Taller para Claude:         corre  taller-llave Claude    y pega la dirección como conector en Claude
• Taller para una Muse:       corre  taller-llave Astro     (una por IA)
• Clave de Gemini/Mistral:    corre  taller-clave GEMINI_API_KEY   /   taller-clave MISTRAL_API_KEY
• Estado rápido:              systemctl status taller   ·   docker ps
EOF
