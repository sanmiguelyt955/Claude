"""Despliega el servidor en un Space de Hugging Face (lo crea si no existe).

Variables: HF_TOKEN (obligatoria, permiso write), HF_SPACE (opcional, por defecto <usuario>/video-nube),
MCP_CLAVE (opcional pero recomendada: clave secreta de la URL). --dry-run solo lista lo que subiría.
"""
import os
import shutil
import sys
import tempfile
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
ARCHIVOS = ["servidor_nube.py", "vision_local.py", "escucha_local.py", "oido_modelo.py"]
DE_NUBE = ["Dockerfile", "README.md", "requirements-nube.txt"]


def preparar(destino):
    for f in ARCHIVOS:
        shutil.copy2(RAIZ / f, destino / f)
    for f in DE_NUBE:
        shutil.copy2(RAIZ / "nube" / f, destino / f)
    return sorted(p.name for p in destino.iterdir())


def url_space(space_id):
    usuario, nombre = space_id.split("/")
    return f"https://{usuario.lower()}-{nombre.lower().replace('_', '-').replace('.', '-')}.hf.space"


def main():
    dry = "--dry-run" in sys.argv
    with tempfile.TemporaryDirectory() as tmp:
        lista = preparar(Path(tmp))
        print("Archivos del Space:", ", ".join(lista))
        if "--zip" in sys.argv:   # paquete para subir a mano en la web de Hugging Face (Files > Upload files)
            destino = RAIZ / "dist" / "space-video-nube.zip"
            destino.parent.mkdir(exist_ok=True)
            destino.unlink(missing_ok=True)
            shutil.make_archive(str(destino.with_suffix("")), "zip", tmp)
            print("Paquete:", destino)
            return 0
        if dry:
            return 0
        token = os.environ.get("HF_TOKEN")
        if not token:
            print("Falta HF_TOKEN"); return 1
        from huggingface_hub import HfApi
        api = HfApi(token=token)
        usuario = api.whoami()["name"]
        space = os.environ.get("HF_SPACE") or f"{usuario}/video-nube"
        api.create_repo(space, repo_type="space", space_sdk="docker", exist_ok=True)
        clave = os.environ.get("MCP_CLAVE", "").strip()
        if clave:
            api.add_space_secret(space, "MCP_CLAVE", clave)
        api.upload_folder(repo_id=space, repo_type="space", folder_path=tmp,
                          commit_message=f"Despliegue desde GitHub {os.environ.get('GITHUB_SHA', '')[:7]}")
        base = url_space(space)
        print(f"Space: https://huggingface.co/spaces/{space}")
        print(f"Estado: {base}/")
        print(f"Conector MCP: {base}/<MCP_CLAVE>/mcp" if clave else f"Conector MCP: {base}/mcp  (sin clave: cualquiera con la URL puede usarlo)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
