// Buzón de videos para IAs (Cloudflare Worker + R2).
//   PUT    /subir?nombre=…&origen=<link>   cuerpo = el video   → {ok, clave, bytes}
//   GET    /lista                          → [{clave, bytes, subido, origen}] (más nuevo primero)
//   GET    /video/<clave>                  → el video
//   DELETE /video/<clave>                  → lo borra (las IAs lo hacen EN CUANTO terminan de analizarlo)
//   Videos grandes (>100 MB) en pedazos de 50 MB (multipart de R2, hasta ~5 TB):
//   POST /partes/crear?nombre=…&origen=…            → {clave, id}
//   PUT  /partes/subir?clave=…&id=…&n=1..10000      cuerpo = el pedazo → {n, etag}
//   POST /partes/terminar?clave=…&id=…  [{n, etag}] → {ok, clave, bytes}
//   POST /partes/cancelar?clave=…&id=…
// Todo pide  Authorization: Bearer <CLAVE>.  NO se borra por tiempo: solo red de seguridad diaria si el buzón pasa de
// 9 GB (se borran los más viejos para no salir del plan gratis de 10 GB).
interface Env { VIDEOS: R2Bucket; CLAVE: string }

const TOPE_BYTES = 9e9;
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
    if (url.pathname.startsWith("/partes/")) {
      const accion = url.pathname.slice("/partes/".length);
      if (req.method === "POST" && accion === "crear") {
        const nombre = (url.searchParams.get("nombre") || "video").replace(/[^\w.-]/g, "_").slice(0, 60);
        const clave = `videos/${new Date().toISOString().replace(/[:.]/g, "-")}_${nombre}`;
        const mp = await env.VIDEOS.createMultipartUpload(clave, {
          httpMetadata: { contentType: "video/mp4" },
          customMetadata: { origen: (url.searchParams.get("origen") || "").slice(0, 500) },
        });
        return json({ clave: mp.key, id: mp.uploadId });
      }
      const clave = url.searchParams.get("clave") || "", id = url.searchParams.get("id") || "";
      if (!clave.startsWith("videos/") || !id) return json({ error: "falta clave o id" }, 400);
      const mp = env.VIDEOS.resumeMultipartUpload(clave, id);
      if (req.method === "PUT" && accion === "subir") {
        const n = Number(url.searchParams.get("n"));
        if (!req.body || !(n >= 1 && n <= 10000)) return json({ error: "pedazo inválido" }, 400);
        const parte = await mp.uploadPart(n, req.body);
        return json({ n: parte.partNumber, etag: parte.etag });
      }
      if (req.method === "POST" && accion === "terminar") {
        const partes = (await req.json()) as { n: number; etag: string }[];
        const obj = await mp.complete(partes.map((p) => ({ partNumber: p.n, etag: p.etag })));
        return json({ ok: true, clave: obj.key, bytes: obj.size });
      }
      if (req.method === "POST" && accion === "cancelar") {
        await mp.abort();
        return json({ ok: true });
      }
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
    // Red de seguridad: los videos se borran al analizarse. Solo si el buzón pasa de 9 GB se borran los más viejos.
    const objs = (await todos(env)).sort((a, b) => a.uploaded.getTime() - b.uploaded.getTime());
    let total = objs.reduce((t, o) => t + o.size, 0);
    const borrar: string[] = [];
    for (const o of objs) {
      if (total <= TOPE_BYTES) break;
      borrar.push(o.key);
      total -= o.size;
    }
    for (let i = 0; i < borrar.length; i += 1000) await env.VIDEOS.delete(borrar.slice(i, i + 1000));
  },
};
