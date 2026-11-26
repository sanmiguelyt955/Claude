// vidIQ Cuentas — un conector MCP por cuenta de vidIQ, cada uno con su propia URL:
//   https://vidiq-cuentas.<tu-subdominio>.workers.dev/<nicho>/mcp/<ACCESO>
// El Worker reenvía la petición tal cual a vidIQ y le pone la clave de API de esa cuenta
// (secreto VIDIQ_<NICHO>). Nunca devuelve ni guarda las claves; no tiene base de datos.

const VIDIQ = "https://mcp.vidiq.com/mcp";
// Encabezados del protocolo MCP que pasan de ida (del cliente a vidIQ)…
const IDA = ["content-type", "accept", "mcp-session-id", "mcp-protocol-version", "last-event-id"];
// …y de vuelta (de vidIQ al cliente).
const VUELTA = ["content-type", "mcp-session-id", "mcp-protocol-version", "cache-control"];

type Env = Record<string, string | undefined>;

function iguales(a: string, b: string): boolean {
  // Comparación en tiempo constante, para no filtrar la llave por tiempos de respuesta.
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function json(status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

export function cuentas(env: Env): string[] {
  return Object.keys(env).filter((k) => k.startsWith("VIDIQ_") && env[k]).map((k) => k.slice(6).toLowerCase()).sort();
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const partes = url.pathname.split("/").filter(Boolean); // [nicho, "mcp", llave]

    if (partes.length === 0) return new Response("vidIQ Cuentas: ok. Usa /<nicho>/mcp/<llave>.\n");

    const acceso = env.ACCESO ?? "";
    if (partes.length !== 3 || partes[1] !== "mcp" || !acceso || !iguales(partes[2], acceso)) {
      return json(404, { error: "No encontrado." }); // sin pistas para quien adivine URLs
    }

    // Lista de cuentas configuradas (solo nombres, nunca claves): /cuentas/mcp/<llave>
    if (partes[0] === "cuentas") return json(200, { cuentas: cuentas(env) });

    const nicho = partes[0].toUpperCase().replace(/[^A-Z0-9_]/g, "_");
    const clave = env["VIDIQ_" + nicho];
    if (!clave) return json(404, { error: `No hay clave para la cuenta «${partes[0]}». Agrega el secreto VIDIQ_${nicho}.`, cuentas: cuentas(env) });

    const cabeceras = new Headers();
    for (const h of IDA) { const v = request.headers.get(h); if (v) cabeceras.set(h, v); }
    cabeceras.set("authorization", "Bearer " + clave);

    const hayCuerpo = !["GET", "HEAD"].includes(request.method);
    const r = await fetch(VIDIQ, { method: request.method, headers: cabeceras, body: hayCuerpo ? request.body : undefined });

    if (r.status === 401 || r.status === 403) {
      // No reenviamos el "www-authenticate" de vidIQ: el cliente intentaría OAuth contra vidIQ.
      return json(502, { error: `vidIQ rechazó la clave de la cuenta «${partes[0]}» (HTTP ${r.status}). Revisa o cambia el secreto VIDIQ_${nicho}.` });
    }
    const vuelta = new Headers();
    for (const h of VUELTA) { const v = r.headers.get(h); if (v) vuelta.set(h, v); }
    return new Response(r.body, { status: r.status, headers: vuelta }); // pasa en streaming (SSE)
  },
};
