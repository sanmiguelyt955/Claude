#!/usr/bin/env python3
"""repos_de_videos.py — de videos de YouTube a la lista de repos, ahorrando créditos.

Flujo automático (lo aprendido el 2026-11-27):
  1. Firecrawl (scrapecreators/youtube/video, 1 crédito) → título, duración, vistas, DESCRIPCIÓN.
     Los links github.com de la descripción son los nombres EXACTOS: no hace falta vidIQ para leerlos.
  2. Firecrawl (youtube-com/videos/video_transcript, ~5 créditos, no cobra si falla) → lo que dice.
     Si la descripción no trae links, saca nombres probables de la transcripción y los marca «dudosos».
  3. Verifica cada repo en GitHub (estrellas, descripción) con `gh api`.
  4. Elige el MEJOR video (repos que te sirven × vistas × cuántos nombres quedaron dudosos) y deja lista
     la llamada a vidIQ para que Claude la haga por el conector (un script no puede usar MCP):
       Short → vidiq_watch_shortform_content (10) · ≤20 min → vidiq_video_watch (25) ·
       largo → NO video_watch (ubica mal los minutos): transcripción + storyboard.
     Cuenta sugerida: la del nicho (mapa NICHOS abajo).

Uso:
  python3 repos_de_videos.py <link> [<link> ...] [--tema "editar video con Claude"] [--buscar "título de un video"]
  python3 repos_de_videos.py --buscar "Insane GitHub Repos To Actually 10x Claude Video Editing" --tema video
  --sin-transcripcion   ahorra ~5 créditos por video cuando la descripción ya trae los links
  --json                salida para agentes

La clave de Firecrawl la pone el proxy (FIRECRAWL_API_KEY=proxy-injected); en otra máquina, pon tu clave.
"""
import argparse, json, os, re, subprocess, sys, urllib.request

API = "https://api.firecrawl.dev/v2/scrape"
KEY = os.environ.get("FIRECRAWL_API_KEY", "proxy-injected")
NICHOS = {  # palabra en el título/tema → cuenta de vidIQ (conector VidIQ-<cuenta>)
    "github": "Mejoresreposdegithub777", "repo": "Mejoresreposdegithub777", "open source": "Mejoresreposdegithub777",
    "automat": "Automatizaciones777", "n8n": "Automatizaciones777", "agent": "Automatizaciones777",
    "short": "Viewshortsfactory777", "news": "Noticiasia777", "noticia": "Noticiasia777", "ia ": "Noticiasia777",
    "trading": "Aprendertrading777", "crypto": "Aprendertrading777", "anime": "Luffybloom777", "one piece": "Luffybloom777",
}
gastado = {"firecrawl": 0}


def alexandria(provider, capability, options):
    body = json.dumps({"alexandria": {"provider": provider, "capability": capability, "options": options}}).encode()
    req = urllib.request.Request(API, data=body, headers={"Authorization": f"Bearer {KEY}", "content-type": "application/json"})
    try:
        d = json.load(urllib.request.urlopen(req, timeout=120))
    except Exception as e:
        return None, f"{type(e).__name__}: {e}"
    r = (d.get("data") or {}).get("alexandria", [{}])[0]
    gastado["firecrawl"] += r.get("creditsCost") or 0
    return r.get("data"), (r.get("error") or {}).get("message")


def vid_id(link):
    m = re.search(r"(?:v=|youtu\.be/|shorts/|embed/)([A-Za-z0-9_-]{11})", link)
    return m.group(1) if m else (link if re.fullmatch(r"[A-Za-z0-9_-]{11}", link) else None)


def gh_repo(full):
    """Estrellas y descripción de owner/name con la búsqueda de GitHub (gh api)."""
    try:
        out = subprocess.run(["gh", "api", "-X", "GET", "search/repositories", "-f", f"q=repo:{full}",
                              "--jq", ".items[0] | [.stargazers_count, .description, .full_name] | @json"],
                             capture_output=True, text=True, timeout=30).stdout.strip()
        st, desc, name = json.loads(out) if out and out != "null" else (None, None, None)
        return {"stars": st, "desc": (desc or "")[:110], "exists": name is not None}
    except Exception:
        return {"stars": None, "desc": "", "exists": None}


def gh_guess(name):
    """Nombre dicho en voz alta («Scrapling», «Huashu Motion») → repo más probable en GitHub."""
    try:
        out = subprocess.run(["gh", "api", "-X", "GET", "search/repositories", "-f", f"q={name}", "-f", "sort=stars",
                              "-f", "per_page=1", "--jq", ".items[0] | [.full_name, .stargazers_count, .description] | @json"],
                             capture_output=True, text=True, timeout=30).stdout.strip()
        full, st, desc = json.loads(out)
        return {"repo": full, "stars": st, "desc": (desc or "")[:110]}
    except Exception:
        return None


def nombres_dichos(texto):
    """Nombres propios cerca de «number N / número N / #N / at number» (para videos sin links)."""
    pats = [r"(?:number|n[úu]mero|#)\s*\w+(?:\s+is|\s*[:,])?\s+([A-Z][\w.+-]*(?:\s+[A-Z][\w.+-]*){0,2})",
            r"(?:called|llamado|chamado|meet|next up is|repo(?:sitory|sitório|sitorio)?(?: that we're going to go over)? is|o repositório)\s+([A-Za-z][\w.+-]*(?:\s+[A-Z][\w.+-]*){0,2})"]
    out = []
    for p in pats:
        for m in re.findall(p, texto):
            m = m.strip(" .,")
            if m.lower() not in ("this", "the", "it", "coming", "one", "a", "an", "basically", "actually") and m not in out:
                out.append(m)
    return out[:25]


def analizar(vid, tema, con_transcripcion):
    det, err = alexandria("scrapecreators", "youtube/video", {"url": f"https://www.youtube.com/watch?v={vid}"})
    if not det:
        return {"id": vid, "error": err or "sin datos"}
    desc = det.get("description") or ""
    links = []
    for o, n in re.findall(r"github\.com/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)", desc):
        full = f"{o}/{re.sub(r'(\.git|\.\.\.)$', '', n)}"
        if full not in links and not n.endswith("..."):
            links.append(full)
    # githubrepo.cloud y similares cortan el link con «...»: completar con el texto «#N owner/repo» de la descripción
    for full in re.findall(r"#\d+\s+([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)", desc):
        if full not in links:
            links.append(full)
    texto, dudosos = "", []
    if con_transcripcion or not links:
        tr, err2 = alexandria("youtube-com", "videos/video_transcript", {"video_id": vid})
        texto = (tr or {}).get("full_text", "") if tr else ""
        if texto:   # nombres dichos que NO están en los links de la descripción → dudosos (vidIQ los lee en pantalla)
            clave = lambda t: re.sub(r"[^a-z0-9]", "", t.lower())
            en_links = [clave(l.split("/")[1]) for l in links]
            dudosos = [n for n in nombres_dichos(texto) if not any(clave(n) in k or k in clave(n) for k in en_links if k)]
    repos = [dict(repo=r, fuente="descripción", **gh_repo(r)) for r in links[:20]]
    for nombre in dudosos[:12]:
        g = gh_guess(nombre)
        if g and g.get("repo") and g["repo"] not in {x["repo"] for x in repos}:
            repos.append(dict(g, dicho=nombre, fuente="transcripción (dudoso)", exists=True))
    dur = (det.get("durationMs") or 0) / 1000
    tema_w = [w for w in re.findall(r"\w{4,}", (tema or "").lower())]
    utiles = sum(1 for x in repos if any(w in ((x.get("desc") or "") + (x.get("repo") or "")).lower() for w in tema_w)) if tema_w else len(repos)
    return {"id": vid, "url": f"https://www.youtube.com/watch?v={vid}", "titulo": det.get("title"),
            "canal": (det.get("channel") or {}).get("title"), "vistas": det.get("viewCountInt") or 0, "duracion_s": dur,
            "repos": repos, "utiles": utiles, "dudosos": sum(1 for x in repos if "dudoso" in x["fuente"]),
            "transcripcion": texto[:4000]}


def plan_vidiq(v, tema):
    """Qué llamada a vidIQ hace falta (o si no hace falta) para el video elegido."""
    if v["dudosos"] == 0 and v["repos"]:
        return {"hace_falta": False, "por_que": "la descripción ya trae los nombres exactos; vidIQ no hace falta"}
    d = v["duracion_s"]
    herramienta, costo = (("vidiq_watch_shortform_content", 10) if d <= 180 else
                          ("vidiq_video_watch", 25) if d <= 1200 else (None, 0))
    texto = ((v.get("titulo") or "") + " " + (tema or "")).lower()
    cuenta = next((c for k, c in NICHOS.items() if k in texto), "Mejoresreposdegithub777")
    if not herramienta:
        return {"hace_falta": True, "herramienta": None, "por_que": "video largo: video_watch ubica mal los minutos; usar "
                "transcripción + storyboard + Gemini por tramos", "cuenta": cuenta}
    prompt = ("For EACH GitHub repo/tool shown, with its timestamp: the exact repo name and owner/URL exactly as written on "
              "screen, the install command if shown, stars if shown, and what the screen shows about it.")
    return {"hace_falta": True, "herramienta": f"mcp__VidIQ-{cuenta}__{herramienta}", "costo": costo, "cuenta": cuenta,
            "argumentos": {("url" if "shortform" in herramienta else "video"): v["url"], "prompt": prompt}}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("links", nargs="*")
    ap.add_argument("--buscar", action="append", default=[], help="título de un video (1 crédito: scrapecreators search)")
    ap.add_argument("--tema", default="", help="qué te interesa (sube los videos con repos de ese tema)")
    ap.add_argument("--sin-transcripcion", action="store_true")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    ids = [vid_id(l) for l in a.links if vid_id(l)]
    for q in a.buscar:
        res, _ = alexandria("scrapecreators", "youtube/search", {"query": q})
        vids = (res or {}).get("videos") or []
        if vids:
            ids.append(vids[0]["id"])
    if not ids:
        sys.exit("Dame al menos un link o --buscar «título».")
    videos = [analizar(v, a.tema, not a.sin_transcripcion) for v in dict.fromkeys(ids)]
    ok = [v for v in videos if not v.get("error")]
    for v in ok:
        v["puntos"] = round(v["utiles"] * 10 + min(v["vistas"], 300000) / 10000 + len(v["repos"]) - v["dudosos"] * 0.5, 1)
    ok.sort(key=lambda v: -v["puntos"])
    mejor = ok[0] if ok else None
    plan = plan_vidiq(mejor, a.tema) if mejor else None
    if a.json:
        print(json.dumps({"videos": videos, "mejor": mejor and mejor["id"], "vidiq": plan, "firecrawl_creditos": gastado["firecrawl"]},
                         ensure_ascii=False, indent=1)); return
    print(f"# Repos de {len(ok)} video(s) · Firecrawl: {gastado['firecrawl']} créditos\n")
    for v in videos:
        if v.get("error"):
            print(f"## ❌ {v['id']}: {v['error']}\n"); continue
        print(f"## {'⭐ ' if v is mejor else ''}{v['titulo']} — {v['canal']} ({int(v['duracion_s']//60)}:{int(v['duracion_s']%60):02d}, "
              f"{v['vistas']:,} vistas, {v['puntos']} pts)\n{v['url']}\n")
        for x in v["repos"]:
            st = f"{x['stars']:,}⭐" if isinstance(x.get("stars"), int) else "?"
            print(f"- {x['repo']} · {st} · {x.get('desc','')}" + (f" · 🔎 dicho «{x['dicho']}» (dudoso)" if x.get("dicho") else ""))
        print()
    if plan:
        print("## Siguiente paso con vidIQ")
        if not plan["hace_falta"]:
            print(f"✅ No hace falta: {plan['por_que']}.")
        elif not plan.get("herramienta"):
            print(f"⚠️ {plan['por_que']}.")
        else:
            print(f"Claude: llama `{plan['herramienta']}` ({plan['costo']} créditos, cuenta {plan['cuenta']}) con:\n"
                  f"```json\n{json.dumps(plan['argumentos'], ensure_ascii=False, indent=1)}\n```\n"
                  "Antes: revisa el saldo (vidiq_balance, gratis) y después guarda la foto con "
                  "`herramientas/vidiq_presupuesto.py --agregar …`.")


if __name__ == "__main__":
    main()
