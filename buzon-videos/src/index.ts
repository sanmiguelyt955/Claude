// Buzón de videos para IAs (Cloudflare Worker + R2).
//   PUT    /subir?nombre=…&origen=<link>   cuerpo = el video   → {ok, clave, bytes}
//   GET    /lista                          → [{clave, bytes, subido, origen}] (más nuevo primero)
//   GET    /video/<clave>                  → el video
//   DELETE /video/<clave>                  → lo borra
// Todo pide  Authorization: Bearer <CLAVE>.  Un cron borra lo que tenga más de 7 días.
interface Env { VIDEOS: R2Bucket; CLAVE: string }

const DIAS = 7;
const json = (d: unknown, status = 200) =>
  new Response(JSON.stringify(d, null, 1), { status, headers: { "content-type": "application/json; charset=utf-8" } });

function iguales(a: string, b: string) {          // comparación en tiempo constante
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function todos(env: Env) {
  const out: R2Object[] = [];
  let cursor: string | undefined;
  do {
    const r = await env.VIDEOS.list({ prefix: "videos/", cursor, include: ["customMetadata"] });
    out.push(...r.objects);
    cursor = r.truncated ? r.cursor : undefined;
  } while (cursor);
  return out;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/") return new Response("Buzón de videos para IAs. Pide clave.\n");
    const auth = req.headers.get("authorization") || "";
    const k = (env.CLAVE || "").trim();               // por si se pegó con un salto de línea
    if (!k || !iguales(auth.trim(), `Bearer ${k}`)) return json({ error: "clave incorrecta" }, 401);

    if (req.method === "PUT" && url.pathname === "/subir") {
      if (!req.body) return json({ error: "no llegó el video" }, 400);
      const nombre = (url.searchParams.get("nombre") || "video").replace(/[^\w.-]/g, "_").slice(0, 60);
      const clave = `videos/${new Date().toISOString().replace(/[:.]/g, "-")}_${nombre}`;
      const obj = await env.VIDEOS.put(clave, req.body, {
        httpMetadata: { contentType: req.headers.get("content-type") || "video/mp4" },
        customMetadata: { origen: (url.searchParams.get("origen") || "").slice(0, 500) },
      });
      return json({ ok: true, clave, bytes: obj?.size ?? 0 });
    }
    if (req.method === "GET" && url.pathname === "/lista") {
      const lista = (await todos(env))
        .sort((a, b) => b.uploaded.getTime() - a.uploaded.getTime())
        .map((o) => ({ clave: o.key, bytes: o.size, subido: o.uploaded.toISOString(), origen: o.customMetadata?.origen || "" }));
      return json(lista);
    }
    if (url.pathname.startsWith("/video/")) {
      const clave = decodeURIComponent(url.pathname.slice("/video/".length));
      if (!clave.startsWith("videos/")) return json({ error: "clave inválida" }, 400);
      if (req.method === "GET") {
        const obj = await env.VIDEOS.get(clave);
        if (!obj) return json({ error: "no existe" }, 404);
        return new Response(obj.body, {
          headers: { "content-type": obj.httpMetadata?.contentType || "video/mp4", "content-length": String(obj.size) },
        });
      }
      if (req.method === "DELETE") {
        await env.VIDEOS.delete(clave);
        return json({ ok: true, borrado: clave });
      }
    }
    return json({ error: "no existe esa ruta" }, 404);
  },

  async scheduled(_c: ScheduledController, env: Env) {
    const limite = Date.now() - DIAS * 86400_000;
    const viejos = (await todos(env)).filter((o) => o.uploaded.getTime() < limite).map((o) => o.key);
    for (let i = 0; i < viejos.length; i += 1000) await env.VIDEOS.delete(viejos.slice(i, i + 1000));
  },
};
