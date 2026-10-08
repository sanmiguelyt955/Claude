/**
 * Obsidian OAuth Proxy
 * ---------------------
 * Envuelve el servidor MCP local de Obsidian (plugin Local REST API/MCP,
 * autenticado con Bearer token, accesible solo en 127.0.0.1) detrás de un
 * servidor OAuth 2.1, para que Claude Desktop pueda conectarlo como
 * "Custom Connector" (que solo sabe hablar OAuth).
 *
 * Flujo:
 *   Claude Desktop --OAuth--> este Worker --Bearer--> túnel Cloudflare --> Obsidian local (127.0.0.1:27123)
 *
 * El túnel (cloudflared) expone tu Obsidian local a una URL pública
 * temporal; esa URL se guarda como variable OBSIDIAN_UPSTREAM_URL y hay
 * que actualizarla si el túnel se reinicia (cambia de URL). El token de
 * Obsidian vive solo como secret (OBSIDIAN_API_KEY), nunca en el código.
 *
 * No hay login de terceros: como Obsidian es de un solo usuario (tú), el
 * endpoint /authorize aprueba automáticamente cualquier solicitud.
 */

import OAuthProvider, { type AuthRequest } from "@cloudflare/workers-oauth-provider";

export interface Env {
  OAUTH_KV: KVNamespace;
  OAUTH_PROVIDER: OAuthHelpers;
  OBSIDIAN_API_KEY: string;
  OBSIDIAN_UPSTREAM_URL: string;
}

/**
 * Handler de la ruta protegida /mcp: reenvía la petición tal cual al
 * túnel de Obsidian, sustituyendo la autenticación por el Bearer real.
 */
const apiHandler: ExportedHandler<Env> = {
  async fetch(request, env) {
    const upstream = env.OBSIDIAN_UPSTREAM_URL;

    const headers = new Headers(request.headers);
    headers.delete("host");
    headers.delete("authorization"); // quitamos el token OAuth del Worker
    headers.set("authorization", `Bearer ${env.OBSIDIAN_API_KEY}`);

    const init: RequestInit = {
      method: request.method,
      headers,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
      // @ts-expect-error - requerido por Workers para streaming de body
      duplex: "half",
    };

    const upstreamResponse = await fetch(upstream, init);

    const respHeaders = new Headers(upstreamResponse.headers);
    respHeaders.delete("content-encoding");
    respHeaders.delete("content-length");

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: respHeaders,
    });
  },
};

/**
 * Handler de todo lo que no es la API protegida: la pantalla de
 * autorización OAuth. Como no hay identidad real de usuario, aprobamos
 * automáticamente y redirigimos de vuelta al cliente (Claude Desktop).
 */
const defaultHandler: ExportedHandler<Env> = {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/authorize") {
      let oauthRequest: AuthRequest;
      try {
        oauthRequest = await env.OAUTH_PROVIDER.parseAuthRequest(request);
      } catch (error: any) {
        if (error?.redirectUri) {
          const redirect = new URL(error.redirectUri);
          redirect.searchParams.set("error", error.code ?? "invalid_request");
          if (error?.state) redirect.searchParams.set("state", error.state);
          return Response.redirect(redirect.toString(), 302);
        }
        return new Response(error?.message ?? "Solicitud de autorización inválida", {
          status: 400,
        });
      }

      const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
        request: oauthRequest,
        userId: "obsidian-owner",
        metadata: { label: "Obsidian (dueño único)" },
        scope: oauthRequest.scope,
        props: {},
      });

      return Response.redirect(redirectTo, 302);
    }

    if (url.pathname === "/debug") {
      return new Response(
        JSON.stringify(
          { url: request.url, headers: Object.fromEntries(request.headers) },
          null,
          2
        ),
        { headers: { "content-type": "application/json" } }
      );
    }

    if (url.pathname === "/" || url.pathname === "") {
      return new Response(
        "Obsidian OAuth Proxy activo. Punto de conexión MCP: /mcp",
        { status: 200 }
      );
    }

    return new Response("Not found", { status: 404 });
  },
};

const oauthProvider = new OAuthProvider<Env>({
  apiRoute: "/mcp",
  apiHandler,
  defaultHandler,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/oauth/token",
  clientRegistrationEndpoint: "/register",
  scopesSupported: ["mcp"],
});

/**
 * wrangler dev (detrás del túnel de Cloudflare) recibe la petición como
 * http:// aunque el cliente real habló https:// con el túnel. Reescribimos
 * el esquema a partir de X-Forwarded-Proto/CF-Visitor antes de que
 * OAuthProvider construya URLs de emisor/redirección, para que no emita
 * enlaces http:// que un cliente OAuth estricto rechazaría.
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const forwardedProto = request.headers.get("x-forwarded-proto");
    if (forwardedProto === "https" && request.url.startsWith("http://")) {
      request = new Request("https://" + request.url.slice("http://".length), request);
    }
    return oauthProvider.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
