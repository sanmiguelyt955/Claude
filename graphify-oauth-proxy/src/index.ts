/**
 * Graphify OAuth Proxy
 * ---------------------
 * Envuelve el endpoint MCP de Graphify (autenticado con un Bearer API Key)
 * detrás de un servidor OAuth 2.1 completo, para que Claude Desktop pueda
 * conectarse como "Custom Connector" (que solo sabe hablar OAuth).
 *
 * Flujo:
 *   Claude Desktop --OAuth--> este Worker --Bearer token--> api.graphify.net/mcp
 *
 * No hay login de terceros: como Graphify es de un solo usuario (tú), el
 * endpoint /authorize aprueba automáticamente cualquier solicitud y emite
 * un token propio del Worker. Ese token interno nunca sale del Worker; la
 * key real de Graphify vive solo como secret (GRAPHIFY_API_KEY).
 */

import OAuthProvider, { type AuthRequest } from "@cloudflare/workers-oauth-provider";

export interface Env {
  OAUTH_KV: KVNamespace;
  OAUTH_PROVIDER: OAuthHelpers;
  GRAPHIFY_API_KEY: string;
  GRAPHIFY_UPSTREAM_URL?: string;
}

const UPSTREAM_DEFAULT = "https://api.graphify.net/mcp";

/**
 * Handler de la ruta protegida /mcp: reenvía la petición tal cual a
 * Graphify, sustituyendo la autenticación por el Bearer real.
 */
const apiHandler: ExportedHandler<Env> = {
  async fetch(request, env) {
    const upstream = env.GRAPHIFY_UPSTREAM_URL || UPSTREAM_DEFAULT;

    const headers = new Headers(request.headers);
    headers.delete("host");
    headers.delete("authorization"); // quitamos el token OAuth del Worker
    headers.set("authorization", `Bearer ${env.GRAPHIFY_API_KEY}`);

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
        userId: "graphify-owner",
        metadata: { label: "Graphify (dueño único)" },
        scope: oauthRequest.scope,
        props: {},
      });

      return Response.redirect(redirectTo, 302);
    }

    if (url.pathname === "/" || url.pathname === "") {
      return new Response(
        "Graphify OAuth Proxy activo. Punto de conexión MCP: /mcp",
        { status: 200 }
      );
    }

    return new Response("Not found", { status: 404 });
  },
};

export default new OAuthProvider<Env>({
  apiRoute: "/mcp",
  apiHandler,
  defaultHandler,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/oauth/token",
  clientRegistrationEndpoint: "/register",
  scopesSupported: ["mcp"],
  resourceMetadata: {
    resource: "https://graphify-oauth-proxy.sanmiguelyt955.workers.dev/mcp",
  },
});
