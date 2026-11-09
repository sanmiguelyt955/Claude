"""El taller: servidor MCP que corre en el VPS para que Claude y las Muses trabajen ahí desde su chat.

Cada IA entra con su propia llave en la dirección:  https://<vps>.ts.net:8443/<LLAVE>/mcp
Llaves en /etc/taller/llaves.json  {"Claude": "…", "Astro": "…"}  (se crean con  taller-llave <Nombre>).
Solo los nombres de TALLER_ADMINS (por defecto «Claude») pueden usar `ejecutar` (comandos libres).
Todo lo que hace cada IA queda en /var/log/taller/registro.log.

Herramientas:
  estado            cómo está el VPS (memoria, disco, procesador, servicios, trabajos)
  analizar_video    baja un video por link (TikTok/IG/FB/X; YouTube suele estar bloqueado en servidores) y saca
                    cuadros, hojas, transcripción, golpes de audio y texto en pantalla (extraer_video.py). Trabajo largo.
  render_kubo       renderiza un proyecto de Kubo Studio (borrador/normal/final) y lo exporta. Trabajo largo.
  ver_trabajo       estado y final del registro de un trabajo largo
  listar / leer_archivo / ver_imagen / borrar      dentro de la carpeta de trabajo
  ejecutar          (solo admins) comando de bash como el usuario «taller», con límite de tiempo
"""
import contextvars
import datetime as dt
import json
import os
import re
import shutil
import subprocess
import uuid
from pathlib import Path

from fastmcp import FastMCP
from fastmcp.utilities.types import Image

LLAVES = Path(os.environ.get("TALLER_LLAVES", "/etc/taller/llaves.json"))
TRABAJO = Path(os.environ.get("TALLER_TRABAJO", "/home/taller/trabajo"))
REPO = Path(os.environ.get("TALLER_REPO", "/home/taller/claude"))
REGISTRO = Path(os.environ.get("TALLER_REGISTRO", "/var/log/taller/registro.log"))
ADMINS = {x.strip() for x in os.environ.get("TALLER_ADMINS", "Claude").split(",") if x.strip()}
PY = os.environ.get("TALLER_PY", "python3")
SKILL = REPO / ".claude/skills/video-claude"
TRABAJOS = TRABAJO / "_trabajos"
quien = contextvars.ContextVar("quien", default="?")


def anotar(texto):
    try:
        REGISTRO.parent.mkdir(parents=True, exist_ok=True)
        with open(REGISTRO, "a", encoding="utf-8") as f:
            f.write(f"{dt.datetime.now():%Y-%m-%d %H:%M:%S} [{quien.get()}] {texto}\n")
    except OSError:
        pass


def dentro(ruta):
    """Ruta segura dentro de la carpeta de trabajo o de los videos de Kubo (trabajo/kubo); no deja salirse con ../."""
    p = (TRABAJO / ruta).resolve()
    for raiz in (TRABAJO.resolve(), (REPO / "datos/kubo").resolve()):
        if p == raiz or raiz in p.parents:
            return p
    raise ValueError("Solo se puede usar la carpeta de trabajo del taller.")


def lanzar(nombre, comando):
    """Trabajo largo en segundo plano: sigue aunque la IA cierre el chat. Devuelve su id."""
    TRABAJOS.mkdir(parents=True, exist_ok=True)
    tid = f"{dt.datetime.now():%m%d-%H%M%S}-{nombre}-{uuid.uuid4().hex[:4]}"
    log = TRABAJOS / f"{tid}.log"
    with open(log, "w") as f:
        f.write(f"# {tid} · pedido por {quien.get()}\n# {comando}\n")
    subprocess.Popen(["bash", "-lc", f"({comando}) >> {log} 2>&1; echo \"__FIN__ $?\" >> {log}"],
                     cwd=TRABAJO, start_new_session=True)
    anotar(f"trabajo {tid}: {comando[:200]}")
    return tid


mcp = FastMCP("Taller del VPS de Sanmi", instructions=(
    "Taller en el VPS (Ubuntu) de Sanmi. Antes de nada usa `estado`. Los trabajos largos (videos, renders) se "
    "lanzan y se consultan con `ver_trabajo`. Nada que gaste dinero, publique o borre cosas de Sanmi sin su sí. "
    "Al terminar de analizar un video, borra su carpeta con `borrar`."))


@mcp.tool
def estado() -> str:
    """Cómo está el VPS: memoria, disco, carga, servicios y trabajos en curso."""
    def sh(c):
        return subprocess.run(["bash", "-lc", c], capture_output=True, text=True, timeout=20).stdout.strip()
    corriendo = []
    for log in sorted(TRABAJOS.glob("*.log"))[-15:] if TRABAJOS.exists() else []:
        fin = "__FIN__" in log.read_text(errors="ignore")[-200:]
        corriendo.append(f"{log.stem}: {'terminado' if fin else 'EN CURSO'}")
    return "\n".join([
        f"Eres: {quien.get()} ({'admin' if quien.get() in ADMINS else 'sin ejecutar'})",
        "Memoria: " + sh("free -h | awk '/Mem/{print $3\" usados de \"$2}'"),
        "Disco: " + sh("df -h / | awk 'NR==2{print $3\" usados de \"$2\" (\"$5\")\"}'"),
        "Carga (1/5/15 min): " + sh("cut -d' ' -f1-3 /proc/loadavg") + f" · núcleos: {os.cpu_count()}",
        "Servicios: " + sh("for s in taller docker tailscaled xrdp; do printf '%s=%s ' $s $(systemctl is-active $s 2>/dev/null || echo ?); done"),
        "n8n: " + ("funcionando" if sh("curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:5678/healthz") == "200"
                   else "no responde"),
        "Trabajos recientes:\n  " + ("\n  ".join(corriendo) or "ninguno"),
    ])


@mcp.tool
def analizar_video(url: str) -> str:
    """Baja un video público por link y prepara TODO para analizarlo sin perder detalles (cuadros cada 0.5 s, hojas
    de contacto, transcripción palabra por palabra, golpes de audio, texto en pantalla). Devuelve el id del trabajo:
    consúltalo con ver_trabajo y luego lee la carpeta con listar / leer_archivo / ver_imagen. YouTube suele bloquear
    servidores: si falla con «bot», usa Gemini por link o pide el atajo del iPhone."""
    if not re.match(r"^https?://", url):
        return "Eso no parece un link (debe empezar con http)."
    carpeta = f"videos/{dt.datetime.now():%Y%m%d-%H%M%S}"
    seguro = url.replace("'", "")
    cmd = (f"mkdir -p {carpeta} && {PY} -m yt_dlp -S 'res:1080,vcodec:h264,ext:mp4:m4a' --merge-output-format mp4 "
           f"--no-playlist -o '{carpeta}/video.%(ext)s' '{seguro}' && "
           f"{PY} {SKILL}/scripts/extraer_video.py {carpeta}/video.mp4 {carpeta}/analisis && "
           f"rm -f {carpeta}/video.mp4 && echo 'LISTO: carpeta {carpeta}/analisis (el video ya se borró)'")
    return f"Trabajo lanzado: {lanzar('video', cmd)}. Carpeta: {carpeta}/analisis. Consulta con ver_trabajo."


@mcp.tool
def render_kubo(proyecto: str, calidad: str = "normal") -> str:
    """Renderiza y exporta un proyecto de Kubo Studio (proyectos/kubo/<proyecto>). calidad: borrador | normal | final.
    Tarda: ~7 s por segundo de video en normal, ~45 s por segundo en final. Devuelve el id del trabajo."""
    if not re.fullmatch(r"[\w-]+", proyecto) or calidad not in ("borrador", "normal", "final"):
        return "Proyecto o calidad inválidos."
    cmd = (f"cd {REPO} && git pull -q || true; cd {SKILL}/kubo && {PY} kubo.py render {proyecto} --calidad {calidad} "
           f"&& {PY} kubo.py exportar {proyecto} && echo 'LISTO: video en {REPO}/datos/kubo/{proyecto}/'")
    return (f"Trabajo lanzado: {lanzar('kubo-' + proyecto, cmd)}. Consulta con ver_trabajo. "
            f"El video queda en kubo/{proyecto}/ (usa listar).")


@mcp.tool
def ver_trabajo(id: str, lineas: int = 40) -> str:
    """Estado de un trabajo largo y las últimas líneas de su registro."""
    log = TRABAJOS / f"{Path(id).name}.log"
    if not log.exists():
        return "No existe ese trabajo. Usa estado para ver los recientes."
    txt = log.read_text(errors="ignore").splitlines()
    fin = next((l for l in reversed(txt) if l.startswith("__FIN__")), None)
    estado_t = "EN CURSO" if not fin else ("TERMINÓ BIEN" if fin.endswith(" 0") else f"FALLÓ (código {fin.split()[-1]})")
    return f"{estado_t}\n" + "\n".join(l for l in txt[-max(5, min(lineas, 200)):] if not l.startswith("__FIN__"))


@mcp.tool
def listar(carpeta: str = ".") -> str:
    """Lista archivos dentro de la carpeta de trabajo del taller."""
    p = dentro(carpeta)
    if not p.exists():
        return "No existe."
    filas = []
    for x in sorted(p.iterdir())[:300]:
        filas.append(f"{'📁' if x.is_dir() else '📄'} {x.relative_to(TRABAJO)}" + ("" if x.is_dir() else f"  {x.stat().st_size / 1e3:.0f} KB"))
    return "\n".join(filas) or "(vacía)"


@mcp.tool
def leer_archivo(ruta: str, desde: int = 0, cuanto: int = 20000) -> str:
    """Lee un archivo de texto de la carpeta de trabajo (por pedazos si es grande)."""
    t = dentro(ruta).read_text(errors="ignore")
    return t[desde:desde + min(cuanto, 60000)] + (f"\n… (sigue: desde={desde + cuanto})" if len(t) > desde + cuanto else "")


@mcp.tool
def ver_imagen(ruta: str) -> Image:
    """Muestra una imagen (por ejemplo una hoja de cuadros) para verla con tus propios ojos."""
    p = dentro(ruta)
    return Image(path=str(p))


@mcp.tool
def borrar(ruta: str) -> str:
    """Borra un archivo o carpeta de la carpeta de trabajo (p. ej. el análisis ya guardado en Obsidian)."""
    p = dentro(ruta)
    if p == TRABAJO.resolve():
        return "No se borra la carpeta de trabajo completa."
    shutil.rmtree(p) if p.is_dir() else p.unlink(missing_ok=True)
    anotar(f"borró {ruta}")
    return f"Borrado: {ruta}"


@mcp.tool
def ejecutar(comando: str, segundos: int = 300) -> str:
    """(Solo admins) Ejecuta un comando de bash como el usuario «taller» en la carpeta de trabajo. Para cosas que
    tarden más de 10 min usa un trabajo largo: este comando con `nohup … &` o pide una herramienta nueva."""
    if quien.get() not in ADMINS:
        return f"{quien.get()} no puede usar ejecutar. Pídeselo a Claude en un recado."
    anotar(f"ejecutar: {comando[:300]}")
    try:
        r = subprocess.run(["bash", "-lc", comando], cwd=TRABAJO, capture_output=True, text=True,
                           timeout=max(5, min(segundos, 600)))
        salida = (r.stdout + ("\n[stderr]\n" + r.stderr if r.stderr.strip() else ""))[-15000:]
        return f"código {r.returncode}\n{salida}"
    except subprocess.TimeoutExpired:
        return "Se pasó del tiempo. Para cosas largas usa nohup o un trabajo largo."


class Llaves:
    """Middleware ASGI: /<LLAVE>/mcp → /mcp y recuerda quién es. Sin llave válida: 404 (no revela nada)."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] not in ("http", "websocket"):
            return await self.app(scope, receive, send)
        partes = scope.get("path", "").split("/", 2)
        try:
            llaves = {v: k for k, v in json.loads(LLAVES.read_text()).items() if len(v) >= 32}
        except (OSError, ValueError):
            llaves = {}
        nombre = llaves.get(partes[1]) if len(partes) > 1 else None
        if not nombre:
            await send({"type": "http.response.start", "status": 404, "headers": [(b"content-type", b"text/plain")]})
            return await send({"type": "http.response.body", "body": b"no"})
        quien.set(nombre)
        resto = "/" + (partes[2] if len(partes) > 2 else "")
        scope = dict(scope, path=resto, raw_path=resto.encode())
        return await self.app(scope, receive, send)


app = Llaves(mcp.http_app(path="/mcp", stateless_http=True, json_response=True))

if __name__ == "__main__":
    import uvicorn
    TRABAJO.mkdir(parents=True, exist_ok=True)
    uvicorn.run(app, host=os.environ.get("TALLER_HOST", "127.0.0.1"), port=int(os.environ.get("TALLER_PUERTO", "8765")))
