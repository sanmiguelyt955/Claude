import argparse, json, sys
from . import core


def main(argv=None):
    ap = argparse.ArgumentParser(prog="gemini_vision", description="Ver videos/imágenes, oír audio y preguntar a Gemini (robusto ante 503/429).")
    sub = ap.add_subparsers(dest="cmd", required=True)
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--model", help="modelo(s) separados por coma; por defecto la cadena con respaldo")
    common.add_argument("--json", action="store_true", help="salida JSON {text, model}")
    v = sub.add_parser("video", parents=[common], help="archivo local, URL directa o YouTube")
    v.add_argument("src"); v.add_argument("prompt", nargs="?")
    v.add_argument("--start"); v.add_argument("--end"); v.add_argument("--fps", type=float)
    v.add_argument("--res", choices=list(core.RES), help="low = menos tokens, más barato y menos 429")
    v.add_argument("--compress", action="store_true", help="reducir a 480p antes de subir")
    i = sub.add_parser("image", parents=[common]); i.add_argument("src", nargs="+"); i.add_argument("--prompt")
    a = sub.add_parser("audio", parents=[common]); a.add_argument("src"); a.add_argument("prompt", nargs="?")
    q = sub.add_parser("ask", parents=[common]); q.add_argument("prompt"); q.add_argument("--system"); q.add_argument("--search", action="store_true")
    sub.add_parser("doctor", help="comprueba la clave y qué modelos existen")
    n = ap.parse_args(argv)
    models = [m.strip() for m in n.model.split(",")] if getattr(n, "model", None) else None
    try:
        if n.cmd == "doctor":
            return doctor()
        if n.cmd == "video":
            text, m = core.see_video(n.src, n.prompt, start=n.start, end=n.end, fps=n.fps, resolution=n.res, compress=n.compress, models=models)
        elif n.cmd == "image":
            text, m = core.see_image(n.src, n.prompt, models=models)
        elif n.cmd == "audio":
            text, m = core.hear_audio(n.src, n.prompt, models=models)
        else:
            text, m = core.ask(n.prompt, system=n.system, search=n.search, models=models)
    except core.GeminiError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 1
    print(json.dumps({"text": text, "model": m}, ensure_ascii=False) if n.json else text)
    core.log(f"modelo: {m}")
    return 0


def doctor():
    core.api_key()
    r = core._json("GET", f"{core.base()}/v1beta/models?pageSize=200")
    have = {m["name"].split("/")[-1] for m in r.get("models", []) if "generateContent" in m.get("supportedGenerationMethods", [])}
    print(f"Clave válida. {len(have)} modelos con generateContent.")
    for m in core.default_models():
        print(f"  {'OK ' if m in have else 'NO EXISTE'}  {m}")
    print("Disponibles (flash/lite):", ", ".join(sorted(x for x in have if "flash" in x))[:600])
    return 0


if __name__ == "__main__":
    sys.exit(main())
