#!/usr/bin/env python3
"""Genera INDICE.md: el mapa del repo para cualquier IA (Claude, Muses, Codex…). Un renglón por cosa, con qué es y dónde está.
Lee la primera línea útil de cada README / docstring / encabezado. Volver a correrlo después de cada cambio grande:
    python3 herramientas/indice.py
"""
import ast
import re
from datetime import datetime
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
SALTAR = {".git", "node_modules", "__pycache__", "dist", "datos", "_fx", "cache", ".venv", "venv"}
SECCIONES = [
    ("Skill de video (lo principal)", ".claude/skills/video-claude"),
    ("Proyectos (Kubo Studio y más)", "proyectos"),
    ("Herramientas", "herramientas"),
    ("Servicios en la nube (Workers, servidores, VPS)", None),
    ("Documentos y análisis", "docs"),
]
NUBE = ["buzon-videos", "obsidian-2-0", "nube", "servers", "vps", "gemini-vision", "imagenes-flux", "video-analyzer",
        "video-descriptor-app", "viral-video-lab", "gcp-analysis", "mods", "musica"]


def resumen(p: Path) -> str:
    try:
        if p.is_dir():
            for n in ("README.md", "SKILL.md", "guion.md"):
                if (p / n).exists():
                    return resumen(p / n)
            return f"carpeta ({sum(1 for _ in p.iterdir())} archivos)"
        t = p.read_text(encoding="utf-8", errors="ignore")
        if p.suffix == ".py":
            d = ast.get_docstring(ast.parse(t)) or ""
            return d.strip().splitlines()[0] if d.strip() else ""
        if p.suffix in (".js", ".mjs", ".ts", ".sh"):
            for l in t.splitlines()[:6]:
                l = l.strip().lstrip("/#! ").strip()
                if len(l) > 15 and not l.startswith(("usr/bin", "env ", "import", "set -")):
                    return l
            return ""
        if p.suffix == ".md":
            for l in t.splitlines():
                l = l.strip()
                if l.startswith("description:"):
                    return l.split(":", 1)[1].strip()[:220]
                if l and not l.startswith(("---", "<", "!", "[", "|", "name:")):
                    return re.sub(r"^#+\s*", "", l)[:220]
    except Exception:  # noqa: BLE001
        return ""
    return ""


def listar(base: Path, prof=2, nivel=0):
    filas = []
    for p in sorted(base.iterdir()):
        if p.name in SALTAR or p.name.startswith(".") and p.name != ".claude":
            continue
        if p.suffix in (".png", ".jpg", ".mp4", ".wav", ".mp3", ".json", ".ass", ".glb", ".txt", ".lock") and nivel > 0:
            continue
        rel = p.relative_to(RAIZ)
        filas.append(f"{'  ' * nivel}- `{rel}{'/' if p.is_dir() else ''}` — {resumen(p)}")
        if p.is_dir() and nivel + 1 < prof:
            filas += listar(p, prof, nivel + 1)
    return filas


def main():
    out = ["# ÍNDICE del repo (para IAs)", f"Generado: {datetime.now():%Y-%m-%d %H:%M} con `python3 herramientas/indice.py`.",
           "Cómo usarlo: busca aquí la palabra de lo que necesitas, abre el archivo y lee su encabezado. Reglas en `CLAUDE.md`.",
           "Memoria compartida de todas las IAs: Obsidian 2.0 (`indice.md`, `buzon/`, `aprendizajes/`).", ""]
    for titulo, carpeta in SECCIONES:
        out.append(f"## {titulo}")
        if carpeta:
            base = RAIZ / carpeta
            out += listar(base, prof=3 if carpeta.startswith(".claude") else 2) if base.exists() else []
        else:
            out += [f"- `{n}/` — {resumen(RAIZ / n)}" for n in NUBE if (RAIZ / n).exists()]
        out.append("")
    out.append("## Archivos sueltos en la raíz")
    out += [f"- `{p.name}` — {resumen(p)}" for p in sorted(RAIZ.iterdir()) if p.is_file() and p.suffix in (".py", ".md")]
    (RAIZ / "INDICE.md").write_text("\n".join(out) + "\n", encoding="utf-8")
    print(f"INDICE.md: {len(out)} renglones")


if __name__ == "__main__":
    main()
