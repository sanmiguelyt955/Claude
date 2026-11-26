// vidIQ Cuentas — un conector MCP por cuenta de vidIQ, cada uno con su propia URL:
//   https://vidiq-cuentas.<tu-subdominio>.workers.dev/<nicho>/mcp/<ACCESO>
// El Worker reenvía la petición tal cual a vidIQ y le pone la clave de API de esa cuenta
// (secreto VIDIQ_<NICHO>). Nunca devuelve ni guarda las claves; no tiene base de datos.

const VIDIQ = "https://mcp.vidiq.com/mcp";
// Inicio de sesión oficial de vidIQ (OAuth 2.1 con PKCE y registro dinámico). El Worker solo hace de
// intermediario: claude.ai inicia sesión "con el Worker" y el Worker lo manda directo a vidIQ.
const VIDIQ_AUTH = "https://mcp.vidiq.com/mcp/authorize";
const VIDIQ_TOKEN = "https://mcp.vidiq.com/mcp/token";
const VIDIQ_REGISTRO = "https://mcp.vidiq.com/mcp/register";
// Encabezados del protocolo MCP que pasan de ida (del cliente a vidIQ)…
const IDA = ["content-type", "accept", "mcp-session-id", "mcp-protocol-version", "last-event-id"];
// …y de vuelta (de vidIQ al cliente).
const VUELTA = ["content-type", "mcp-session-id", "mcp-protocol-version", "cache-control"];

function iguales(a, b) {
  // Comparación en tiempo constante, para no filtrar la llave por tiempos de respuesta.
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function json(status, data) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

function cuentas(env) {
  return [...new Set(Object.keys(env).filter((k) => /^(VIDIQ|ACCESO)_/.test(k) && env[k]).map((k) => k.replace(/^(VIDIQ|ACCESO)_/, "").toLowerCase()))].sort();
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const base = url.origin;

    // ---- Intermediario del inicio de sesión (modo "completo", con TODAS las herramientas) ----
    // Metadatos del recurso protegido, uno por cada URL /<cuenta>/mcp-completo/<llave>.
    if (url.pathname.startsWith("/.well-known/oauth-protected-resource")) {
      const resto = url.pathname.slice("/.well-known/oauth-protected-resource".length);
      return json(200, { resource: base + resto, authorization_servers: [base], scopes_supported: ["api"], bearer_methods_supported: ["header"] });
    }
    // Metadatos del servidor de inicio de sesión: los endpoints son del Worker, que reenvía a vidIQ.
    if (url.pathname.startsWith("/.well-known/oauth-authorization-server") || url.pathname.startsWith("/.well-known/openid-configuration")) {
      return json(200, {
        issuer: base, authorization_endpoint: base + "/oauth/authorize", token_endpoint: base + "/oauth/token",
        registration_endpoint: base + "/oauth/register", response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "refresh_token"], token_endpoint_auth_methods_supported: ["none"],
        code_challenge_methods_supported: ["S256"], scopes_supported: ["api"],
      });
    }
    if (url.pathname === "/oauth/register" && request.method === "POST") {
      const r = await fetch(VIDIQ_REGISTRO, { method: "POST", headers: { "content-type": "application/json" }, body: await request.text() });
      return new Response(r.body, { status: r.status, headers: { "content-type": r.headers.get("content-type") || "application/json" } });
    }
    if (url.pathname === "/oauth/authorize") {
      // Directo a la página oficial de vidIQ; el "resource" se cambia por el de vidIQ.
      const destino = new URL(VIDIQ_AUTH);
      url.searchParams.forEach((v, k) => destino.searchParams.set(k, k === "resource" ? VIDIQ : v));
      return Response.redirect(destino.toString(), 302);
    }
    if (url.pathname === "/oauth/token" && request.method === "POST") {
      const form = new URLSearchParams(await request.text());
      if (form.has("resource")) form.set("resource", VIDIQ);
      const r = await fetch(VIDIQ_TOKEN, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body: form.toString() });
      return new Response(r.body, { status: r.status, headers: { "content-type": r.headers.get("content-type") || "application/json", "cache-control": "no-store" } });
    }

    const partes = url.pathname.split("/").filter(Boolean); // [nicho, "mcp" | "mcp-completo", llave]

    if (partes.length === 0) return new Response("vidIQ Cuentas: ok. Usa /<nicho>/mcp/<llave> (clave de API) o /<nicho>/mcp-completo/<llave> (inicio de sesión, todas las herramientas).\n");

    if (partes.length !== 3 || (partes[1] !== "mcp" && partes[1] !== "mcp-completo")) return json(404, { error: "No encontrado." });
    const completo = partes[1] === "mcp-completo";
    const nicho = partes[0].toUpperCase().replace(/[^A-Z0-9_]/g, "_");
    // Llave de acceso de la cuenta (la que va en la URL): LLAVE_<NICHO>, o la general LLAVE.
    const acceso = env["LLAVE_" + nicho] || env.LLAVE || "";
    if (!acceso || !iguales(partes[2], acceso)) {
      return json(404, { error: "No encontrado." }); // sin pistas para quien adivine URLs
    }

    // Lista de cuentas configuradas (solo nombres, nunca claves): /cuentas/mcp/<ACCESO o ACCESO_CUENTAS>
    if (partes[0] === "cuentas") return json(200, { cuentas: cuentas(env) });

    if (completo) {
      // Modo completo: claude.ai trae su propio permiso de vidIQ (el de la cuenta con la que entraste).
      const token = request.headers.get("authorization");
      const pedirSesion = () => new Response(JSON.stringify({ error: "Inicia sesión con vidIQ." }), { status: 401, headers: {
        "content-type": "application/json", "www-authenticate": `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource${url.pathname}"` } });
      if (!token) return pedirSesion();
      const cab = new Headers();
      for (const h of IDA) { const v = request.headers.get(h); if (v) cab.set(h, v); }
      cab.set("authorization", token);
      const hayCuerpo2 = !["GET", "HEAD"].includes(request.method);
      const r2 = await fetch(VIDIQ, { method: request.method, headers: cab, body: hayCuerpo2 ? request.body : undefined });
      if (r2.status === 401) return pedirSesion(); // permiso vencido: claude.ai lo renueva solo
      const v2 = new Headers();
      for (const h of VUELTA) { const v = r2.headers.get(h); if (v) v2.set(h, v); }
      return new Response(r2.body, { status: r2.status, headers: v2 });
    }

    // Clave de API de vidIQ de la cuenta: VIDIQ_<NICHO>, o ACCESO_<NICHO> (ahí la pegó Sanmi el 2026-11-26).
    const clave = env["VIDIQ_" + nicho] || env["ACCESO_" + nicho];
    if (!clave) return json(503, { error: `No hay clave para la cuenta «${partes[0]}». Agrega el secreto VIDIQ_${nicho}.`, cuentas: cuentas(env) });

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
