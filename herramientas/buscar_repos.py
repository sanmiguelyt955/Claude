"""Buscador de repos: dile lo que necesitas y te da los mejores repos de GitHub, ordenados del mejor al peor.

    python3 herramientas/buscar_repos.py "hacer videos 3D con código" \
        --consultas "three.js video render" "blender python animation" "motion graphics code" [--top 15] [--md salida.md]

Cómo decide (sin IA, con datos públicos de GitHub; usa `gh api` para buscar):
  1. Busca cada consulta (3-6 variantes con sinónimos dan mejores resultados) y junta los candidatos.
  2. DESCARTA: archivados, forks, listas «awesome», sin código (sin lenguaje), sin descripción,
     muertos (más de 18 meses sin cambios) y juguetes (menos de 5 estrellas y más de 6 meses).
  3. PUNTÚA de 0 a 100:  relevancia 45 (palabras de tu tarea en nombre/descripción/temas)
     + popularidad 25 (estrellas, escala logarítmica) + actividad 20 (días desde el último cambio) + licencia 10.
  4. MARCA: licencia que no deja usarlo para ganar dinero (NC) o sin licencia, repos muy nuevos (<60 días).
  5. NIVEL: «Usar ya» (≥70), «Adaptar» (55-69), «Estudiar» (<55).
Límite de GitHub: ~30 búsquedas por minuto; usa pocas consultas buenas.
"""
import argparse
import json
import math
import re
import subprocess
import sys
import time
from datetime import datetime, timezone

VACIAS = set("de la el los las un una y o en con para por que a del al sin como hacer crear mi mis tu the a an of for to and or in on with using make create".split())
LIBRES = {"mit", "apache-2.0", "bsd-2-clause", "bsd-3-clause", "isc", "mpl-2.0", "unlicense", "0bsd", "cc0-1.0", "zlib"}
COPYLEFT = {"gpl-2.0", "gpl-3.0", "agpl-3.0", "lgpl-2.1", "lgpl-3.0"}


def palabras(texto):
    return [w for w in re.findall(r"[a-z0-9áéíóúñ.+#-]{2,}", (texto or "").lower()) if w not in VACIAS]


def buscar(consulta, por_pagina=30):
    r = subprocess.run(["gh", "api", "-X", "GET", "search/repositories", "-f", f"q={consulta}",
                        "-f", f"per_page={por_pagina}"], capture_output=True, text=True, timeout=60)
    if r.returncode != 0:
        print(f"  (búsqueda falló: {consulta}: {r.stderr.strip()[:120]})", file=sys.stderr)
        return []
    return json.loads(r.stdout).get("items", [])


def dias(fecha):
    return (datetime.now(timezone.utc) - datetime.fromisoformat(fecha.replace("Z", "+00:00"))).days


def evaluar(repo, terminos):
    nombre, desc, temas = repo["full_name"], repo.get("description") or "", repo.get("topics") or []
    motivo = None
    if repo.get("archived"): motivo = "archivado"
    elif repo.get("fork"): motivo = "fork"
    elif "awesome" in nombre.lower(): motivo = "lista awesome (no es código)"
    elif not repo.get("language"): motivo = "sin código"
    elif not desc: motivo = "sin descripción"
    elif dias(repo["pushed_at"]) > 540: motivo = f"muerto ({dias(repo['pushed_at'])} días sin cambios)"
    elif repo["stargazers_count"] < 5 and dias(repo["created_at"]) > 180: motivo = "juguete (pocas estrellas)"
    if motivo:
        return None, motivo
    texto = set(palabras(nombre.replace("/", " ").replace("-", " ") + " " + desc + " " + " ".join(temas)))
    rel = sum(1 for t in terminos if t in texto or any(t in w for w in texto)) / max(1, len(terminos))
    pop = min(1, math.log10(repo["stargazers_count"] + 1) / 4.5)          # ~30k estrellas = tope
    act = max(0, 1 - dias(repo["pushed_at"]) / 365)
    lic = ((repo.get("license") or {}).get("spdx_id") or "").lower()
    plic = 1 if lic in LIBRES else 0.6 if lic in COPYLEFT else 0.2 if lic and lic != "noassertion" else 0
    puntos = round(45 * rel + 25 * pop + 20 * act + 10 * plic)
    marcas = []
    if not lic or lic == "noassertion": marcas.append("⚠️ sin licencia clara: no usar para ganar dinero sin revisar")
    elif "nc" in lic: marcas.append("⚠️ licencia no comercial")
    elif lic in COPYLEFT: marcas.append("ℹ️ copyleft: si lo modificas y lo repartes, tu código también debe ser abierto")
    if dias(repo["created_at"]) < 60: marcas.append("🆕 muy nuevo")
    nivel = "Usar ya" if puntos >= 70 else "Adaptar" if puntos >= 55 else "Estudiar"
    return {"repo": nombre, "url": repo["html_url"], "puntos": puntos, "nivel": nivel, "estrellas": repo["stargazers_count"],
            "lenguaje": repo.get("language"), "licencia": lic or "ninguna", "ultimo_cambio_dias": dias(repo["pushed_at"]),
            "descripcion": desc[:160], "marcas": marcas,
            "detalle": {"relevancia": round(rel, 2), "popularidad": round(pop, 2), "actividad": round(act, 2)}}, None


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("tarea", help="lo que necesitas, en tus palabras")
    ap.add_argument("--consultas", nargs="+", help="3-6 búsquedas de GitHub (por defecto, la tarea)")
    ap.add_argument("--top", type=int, default=15)
    ap.add_argument("--md", help="guarda la tabla en un archivo Markdown")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    terminos = list(dict.fromkeys(palabras(a.tarea + " " + " ".join(a.consultas or []))))
    vistos, descartes = {}, {}
    for i, q in enumerate(a.consultas or [a.tarea]):
        if i: time.sleep(2.5)
        for r in buscar(q):
            if r["full_name"] in vistos or r["full_name"] in descartes:
                continue
            ev, motivo = evaluar(r, terminos)
            if ev: vistos[r["full_name"]] = ev
            else: descartes[r["full_name"]] = motivo
    lista = sorted(vistos.values(), key=lambda x: -x["puntos"])[:a.top]
    if a.json:
        print(json.dumps({"tarea": a.tarea, "candidatos": len(vistos) + len(descartes), "descartados": len(descartes),
                          "ranking": lista}, ensure_ascii=False, indent=1)); return
    filas = [f"# Repos para: {a.tarea}", f"Candidatos: {len(vistos) + len(descartes)} · descartados: {len(descartes)} · "
             f"fecha: {datetime.now():%Y-%m-%d}", "", "| # | Repo | Puntos | Nivel | ⭐ | Lenguaje | Licencia | Cambió hace | Qué es | Avisos |",
             "|---|---|---|---|---|---|---|---|---|---|"]
    for i, x in enumerate(lista, 1):
        filas.append(f"| {i} | [{x['repo']}]({x['url']}) | {x['puntos']} | {x['nivel']} | {x['estrellas']} | {x['lenguaje']} | "
                     f"{x['licencia']} | {x['ultimo_cambio_dias']} d | {x['descripcion'].replace('|', '/')} | {' '.join(x['marcas'])} |")
    texto = "\n".join(filas)
    if a.md:
        open(a.md, "w", encoding="utf-8").write(texto + "\n")
    print(texto)


if __name__ == "__main__":
    main()
