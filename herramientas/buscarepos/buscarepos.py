#!/usr/bin/env python3
"""buscarepos: dile qué quieres hacer y te da los MEJORES repos de GitHub para eso, del mejor al peor.

    python3 buscarepos.py "hacer videos 3D con código"                  # automático: Gemini escribe las búsquedas
    python3 buscarepos.py "hacer videos 3D" --consultas "three.js video" "blender python animation"
    python3 buscarepos.py "..." --cpu --gratis --comercial --top 15     # filtros duros
    python3 buscarepos.py --veredicto owner/repo bueno "lo usamos en Kubo"   # le enseñas: sube/baja en búsquedas futuras
    python3 buscarepos.py --historial                                    # búsquedas y veredictos guardados

Cómo trabaja:
 1. TRADUCE tu necesidad (español) a 4-6 búsquedas de GitHub en inglés con sinónimos (Gemini; si no hay, diccionario).
 2. BUSCA y junta candidatos (búsqueda oficial de GitHub; 1 caché de 24 h para no gastar cuota).
 3. DESCARTA: archivados, forks, listas «awesome», sin código, sin descripción, muertos (>18 meses), juguetes.
 4. LEE EL README de los mejores 25 y saca señales: ¿se instala fácil?, ¿tiene demo?, ¿necesita GPU?,
    ¿necesita una API de pago?, ¿tiene pruebas? y qué tanto habla de TU tarea (relevancia por texto).
 5. JUEZ (opcional, Gemini): califica 0-10 qué tan bien sirve cada uno de los 10 primeros para tu tarea Y para ti
    (lee datos/perfil.json: tu equipo, tus reglas y lo que ya tienes), con una razón en español.
 6. PUNTÚA 0-100 = relevancia 35 + juez 15 + popularidad 15 + actividad 15 + salud 10 + licencia 10 + lo que tú le enseñaste.
 7. ENTREGA: ranking con nivel (Usar ya / Adaptar / Estudiar), avisos (GPU, pago, licencia no comercial, muy nuevo,
    en tendencia) y 3 recomendaciones: el mejor, el mejor gratis sin GPU y la promesa nueva.
Solo LEE datos públicos. No clona, no instala y no corre nada de lo que encuentra.
"""
import argparse
import json
import math
import os
import re
import subprocess
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

AQUI = Path(__file__).resolve().parent
DATOS = AQUI / "datos"
INDICE, CACHE = DATOS / "indice.json", DATOS / "cache"
VACIAS = set("de la el los las un una y o en con para por que a del al sin como hacer crear mi mis tu quiero necesito "
             "the a an of for to and or in on with using make create build tool tools".split())
LIBRES = {"mit", "apache-2.0", "bsd-2-clause", "bsd-3-clause", "isc", "mpl-2.0", "unlicense", "0bsd", "cc0-1.0", "zlib"}
COPYLEFT = {"gpl-2.0", "gpl-3.0", "agpl-3.0", "lgpl-2.1", "lgpl-3.0"}
SINONIMOS = {"video": ["video", "motion graphics", "animation"], "3d": ["3d", "three.js", "blender", "webgl"],
             "audio": ["audio", "sound", "sfx"], "voz": ["tts", "voice", "speech"], "subtitulos": ["subtitles", "captions"],
             "editar": ["editing", "editor"], "imagen": ["image", "diffusion"], "musica": ["music", "audio generation"],
             "animacion": ["animation", "animated"], "personajes": ["character", "rig"], "descargar": ["download", "downloader"],
             "transcribir": ["transcription", "whisper", "speech to text"], "efectos": ["effects", "vfx"],
             "agente": ["agent", "claude code", "skill", "mcp"], "automatizar": ["automation", "workflow"]}
UA = {"User-Agent": "buscarepos/1.0"}


def palabras(t):
    return [w for w in re.findall(r"[a-z0-9áéíóúñ.+#-]{2,}", (t or "").lower()) if w not in VACIAS]


def dias(fecha):
    return (datetime.now(timezone.utc) - datetime.fromisoformat(fecha.replace("Z", "+00:00"))).days


def cargar(ruta, defecto):
    try:
        return json.loads(Path(ruta).read_text())
    except Exception:  # noqa: BLE001
        return defecto


# ---------- Gemini (opcional): escribir búsquedas y juzgar ----------
def _clave_gemini():
    if os.environ.get("GEMINI_API_KEY"):
        return os.environ["GEMINI_API_KEY"]
    env = Path.home() / ".config/watch/.env"
    if env.exists():
        for l in env.read_text().splitlines():
            if l.startswith("GEMINI_API_KEY="):
                return l.split("=", 1)[1].strip().strip('"')
    return "proxy-injected"


def gemini_json(prompt):
    cuerpo = json.dumps({"contents": [{"parts": [{"text": prompt}]}],
                         "generationConfig": {"responseMimeType": "application/json"}}).encode()
    for modelo in ("gemini-3-flash-preview", "gemini-flash-latest"):
        req = urllib.request.Request(f"https://generativelanguage.googleapis.com/v1beta/models/{modelo}:generateContent",
                                     cuerpo, {**UA, "Content-Type": "application/json", "x-goog-api-key": _clave_gemini()})
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                res = json.loads(r.read())
            return json.loads(res["candidates"][0]["content"]["parts"][0]["text"])
        except Exception:  # noqa: BLE001
            continue
    return None


def consultas_auto(tarea):
    base = palabras(tarea)
    extra = [s for w in base for s in SINONIMOS.get(w, [])]
    dicc = [x for x in dict.fromkeys([" ".join(extra[:2]), " ".join(extra[1:3])]) if x.strip()]
    g = gemini_json("Convierte esta necesidad en búsquedas de la API de GitHub. La búsqueda de GitHub exige que TODAS las palabras "
                    "aparezcan en nombre/descripción/README, así que cada búsqueda debe tener SOLO 2 o 3 palabras concretas y "
                    "populares que aparecerían en un repo real (nombres de librerías y herramientas: three.js, remotion, blender, "
                    "ffmpeg, whisper, claude code, skill, mcp...), nunca frases abstractas. Devuelve JSON {\"consultas\": [6 "
                    "cadenas], \"clave\": [6-10 palabras en inglés que un buen repo para esto mencionaría]}. Necesidad: " + tarea)
    if g and g.get("consultas"):
        return list(dict.fromkeys(g["consultas"][:6] + dicc))[:8], g.get("clave", []) + extra, "gemini + diccionario"
    return dicc or [" ".join(base[:3])], extra, "diccionario"


# ---------- GitHub (solo lectura) ----------
def buscar(consulta):
    CACHE.mkdir(parents=True, exist_ok=True)
    f = CACHE / (re.sub(r"[^a-z0-9]+", "_", consulta.lower())[:80] + ".json")
    if f.exists() and time.time() - f.stat().st_mtime < 86400:
        return json.loads(f.read_text())
    r = subprocess.run(["gh", "api", "-X", "GET", "search/repositories", "-f", f"q={consulta}", "-f", "per_page=40"],
                       capture_output=True, text=True, timeout=60)
    if r.returncode != 0:
        print(f"  (búsqueda falló: {consulta}: {r.stderr.strip()[:100]})", file=sys.stderr)
        return []
    items = json.loads(r.stdout).get("items", [])
    f.write_text(json.dumps(items))
    return items


def readme(repo):
    for nombre in ("README.md", "readme.md", "README.MD", "README.rst", "README"):
        try:
            with urllib.request.urlopen(urllib.request.Request(
                    f"https://raw.githubusercontent.com/{repo}/HEAD/{nombre}", headers=UA), timeout=20) as r:
                return r.read(200_000).decode("utf-8", "ignore")
        except Exception:  # noqa: BLE001
            continue
    return ""


def senales_readme(txt, terminos):
    t = txt.lower()
    tiene = lambda *ws: any(w in t for w in ws)  # noqa: E731
    s = {
        "instalacion": tiene("pip install", "npm install", "npx ", "uv ", "docker run", "brew install", "## install", "## instal"),
        "demo": tiene(".gif", ".mp4", ".webm", "demo", "screenshot", "gallery"),
        "gpu": tiene("cuda", "nvidia gpu", "vram", "requires a gpu", "rtx ", "a100", "h100") and not tiene("cpu only", "no gpu"),
        "pago": tiene("openai_api_key", "api key required", "paid plan", "subscription", "credits") and not tiene("free", "open source"),
        "pruebas": tiene("pytest", "npm test", "vitest", "jest", "## test", "ci badge", "actions/workflows"),
        "agente": tiene("claude code", "skill.md", "mcp", "agent skill", "codex"),
    }
    pal = palabras(txt[:60_000])
    total = max(1, len(pal))
    rel = sum(min(1.0, pal.count(w) / total * 400) for w in terminos) / max(1, len(terminos))
    s["relevancia_readme"] = round(min(1.0, rel), 3)
    return s


# ---------- Evaluación ----------
def descartar(r):
    if r.get("archived"): return "archivado"
    if r.get("fork"): return "fork"
    if "awesome" in r["full_name"].lower(): return "lista awesome"
    if not r.get("language"): return "sin código"
    if not r.get("description"): return "sin descripción"
    if dias(r["pushed_at"]) > 540: return "muerto"
    if r["stargazers_count"] < 5 and dias(r["created_at"]) > 180: return "juguete"
    return None


def puntuar(r, terminos, senales, juez, veredictos):
    texto = set(palabras(r["full_name"].replace("/", " ").replace("-", " ") + " " + (r.get("description") or "") + " "
                         + " ".join(r.get("topics") or [])))
    rel_meta = sum(1 for t in terminos if t in texto or any(t in w for w in texto)) / max(1, len(terminos))
    rel = 0.6 * rel_meta + 0.4 * senales.get("relevancia_readme", rel_meta) if senales else rel_meta
    pop = min(1, math.log10(r["stargazers_count"] + 1) / 4.5)
    act = max(0, 1 - dias(r["pushed_at"]) / 365)
    salud = (0.4 * senales.get("instalacion", 0) + 0.3 * senales.get("demo", 0) + 0.3 * senales.get("pruebas", 0)) if senales else 0.3
    lic = ((r.get("license") or {}).get("spdx_id") or "").lower()
    plic = 1 if lic in LIBRES else 0.6 if lic in COPYLEFT else 0.2 if lic and lic != "noassertion" else 0
    pj = (juez["nota"] / 10) if juez else rel
    v = veredictos.get(r["full_name"], {}).get("ajuste", 0)
    return round(35 * rel + 15 * pj + 15 * pop + 15 * act + 10 * salud + 10 * plic + v), lic


def avisos(r, lic, s):
    a = []
    if not lic or lic == "noassertion": a.append("⚠️ sin licencia clara")
    elif lic in COPYLEFT: a.append("ℹ️ copyleft")
    elif "nc" in lic: a.append("⚠️ no comercial")
    if s.get("gpu"): a.append("🎮 necesita GPU")
    if s.get("pago"): a.append("💳 usa API de pago")
    if s.get("agente"): a.append("🤖 hecho para agentes")
    edad = max(1, dias(r["created_at"]))
    if edad < 60: a.append("🆕 muy nuevo")
    if r["stargazers_count"] / edad > 20: a.append(f"🔥 en tendencia ({round(r['stargazers_count'] / edad)}⭐/día)")
    return a


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("tarea", nargs="?")
    ap.add_argument("--consultas", nargs="+")
    ap.add_argument("--top", type=int, default=15)
    ap.add_argument("--sin-juez", action="store_true", help="no usar Gemini para juzgar")
    ap.add_argument("--cpu", action="store_true", help="solo los que no piden GPU")
    ap.add_argument("--gratis", action="store_true", help="solo los que no piden API de pago")
    ap.add_argument("--comercial", action="store_true", help="solo licencias que dejan ganar dinero (MIT, Apache, BSD…)")
    ap.add_argument("--md", help="guardar la tabla en Markdown")
    ap.add_argument("--perfil", default=str(DATOS / "perfil.json"), help="JSON con quién eres, tu equipo y tus reglas ('' = sin perfil)")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--veredicto", nargs="+", metavar=("REPO", "bueno|malo"))
    ap.add_argument("--historial", action="store_true")
    a = ap.parse_args()
    DATOS.mkdir(parents=True, exist_ok=True)
    indice = cargar(INDICE, {"busquedas": [], "veredictos": {}})

    if a.veredicto:
        repo, cal = a.veredicto[0], a.veredicto[1] if len(a.veredicto) > 1 else "bueno"
        indice["veredictos"][repo] = {"veredicto": cal, "nota": " ".join(a.veredicto[2:]), "ajuste": 8 if cal == "bueno" else -15,
                                      "fecha": f"{datetime.now():%Y-%m-%d}"}
        INDICE.write_text(json.dumps(indice, ensure_ascii=False, indent=1)); print(f"Guardado: {repo} = {cal}"); return
    if a.historial or not a.tarea:
        print(json.dumps(indice, ensure_ascii=False, indent=1)); return

    consultas, clave, origen = (a.consultas, [], "tuyas") if a.consultas else consultas_auto(a.tarea)
    terminos = list(dict.fromkeys(palabras(a.tarea + " " + " ".join(consultas) + " " + " ".join(clave))))
    print(f"Búsquedas ({origen}): {consultas}", file=sys.stderr)
    cand, descartes = {}, {}
    for i, q in enumerate(consultas):
        if i: time.sleep(2.2)
        for r in buscar(q):
            n = r["full_name"]
            if n in cand or n in descartes: continue
            m = descartar(r)
            (descartes.__setitem__(n, m) if m else cand.__setitem__(n, r))
    # primera pasada sin README para elegir a quién leer
    previa = sorted(cand.values(), key=lambda r: -puntuar(r, terminos, None, None, indice["veredictos"])[0])[:25]
    senales = {r["full_name"]: senales_readme(readme(r["full_name"]), terminos) for r in previa}
    juez = {}
    if not a.sin_juez:
        lista = sorted(previa, key=lambda r: -puntuar(r, terminos, senales[r["full_name"]], None, indice["veredictos"])[0])[:10]
        perfil = cargar(a.perfil, {}) if a.perfil else {}
        g = gemini_json("Eres un experto que elige repos de GitHub para UNA persona concreta. Tarea: «" + a.tarea + "». "
                        + (f"Su perfil (equipo, reglas y lo que ya tiene): {json.dumps(perfil, ensure_ascii=False)}. " if perfil else "")
                        + "Califica de 0 a 10 qué tan bien sirve cada repo como base para ESA tarea Y para ESA persona (no su fama; "
                        "baja la nota si no cabe en su equipo, si cuesta dinero o si repite algo que ya tiene). Devuelve JSON {\"repos\": [{\"repo\": \"owner/name\", "
                        "\"nota\": 0-10, \"razon\": \"una frase en español\"}]}.\n" +
                        "\n".join(f"- {r['full_name']}: {r.get('description')}" for r in lista))
        for x in (g or {}).get("repos", []):
            if isinstance(x, dict) and x.get("repo") in senales:
                juez[x["repo"]] = {"nota": float(x.get("nota", 5)), "razon": x.get("razon", "")}
    filas = []
    for r in previa:
        s = senales[r["full_name"]]
        pts, lic = puntuar(r, terminos, s, juez.get(r["full_name"]), indice["veredictos"])
        if (a.cpu and s.get("gpu")) or (a.gratis and s.get("pago")) or (a.comercial and lic not in LIBRES):
            continue
        filas.append({"repo": r["full_name"], "url": r["html_url"], "puntos": max(0, min(100, pts)),
                      "nivel": "Usar ya" if pts >= 70 else "Adaptar" if pts >= 55 else "Estudiar",
                      "estrellas": r["stargazers_count"], "lenguaje": r.get("language"), "licencia": lic or "ninguna",
                      "cambio_dias": dias(r["pushed_at"]), "descripcion": (r.get("description") or "")[:150],
                      "juez": juez.get(r["full_name"]), "avisos": avisos(r, lic, s),
                      "veredicto": indice["veredictos"].get(r["full_name"], {}).get("veredicto"), "senales": s})
    filas.sort(key=lambda x: -x["puntos"]); filas = filas[:a.top]
    rec = {"mejor": filas[0]["repo"] if filas else None,
           "mejor_gratis_sin_gpu": next((x["repo"] for x in filas if not x["senales"]["gpu"] and not x["senales"]["pago"]
                                         and x["licencia"] in LIBRES), None),
           "promesa_nueva": next((x["repo"] for x in filas if any(v.startswith(("🆕", "🔥")) for v in x["avisos"])), None)}
    indice["busquedas"].append({"fecha": f"{datetime.now():%Y-%m-%d %H:%M}", "tarea": a.tarea, "consultas": consultas,
                                "top": [x["repo"] for x in filas[:5]], "recomendacion": rec})
    INDICE.write_text(json.dumps(indice, ensure_ascii=False, indent=1))
    if a.json:
        print(json.dumps({"tarea": a.tarea, "candidatos": len(cand) + len(descartes), "descartados": len(descartes),
                          "recomendacion": rec, "ranking": filas}, ensure_ascii=False, indent=1)); return
    out = [f"# Mejores repos para: {a.tarea}", f"{len(cand) + len(descartes)} candidatos · {len(descartes)} descartados · "
           f"{len(previa)} READMEs leídos · juez: {'Gemini' if juez else 'no'} · {datetime.now():%Y-%m-%d}", "",
           f"**El mejor:** {rec['mejor']} · **Mejor gratis sin GPU:** {rec['mejor_gratis_sin_gpu']} · **Promesa nueva:** {rec['promesa_nueva']}", "",
           "| # | Repo | Puntos | Nivel | ⭐ | Licencia | Cambió | Qué es | Juez | Avisos |", "|---|---|---|---|---|---|---|---|---|---|"]
    for i, x in enumerate(filas, 1):
        j = f"{x['juez']['nota']:.0f}/10 {x['juez']['razon']}" if x["juez"] else ""
        out.append(f"| {i} | [{x['repo']}]({x['url']}) | {x['puntos']} | {x['nivel']} | {x['estrellas']} | {x['licencia']} | "
                   f"{x['cambio_dias']} d | {x['descripcion'].replace('|', '/')} | {j.replace('|', '/')} | {' '.join(x['avisos'])} |")
    texto = "\n".join(out)
    if a.md: Path(a.md).write_text(texto + "\n", encoding="utf-8")
    print(texto)


if __name__ == "__main__":
    main()
