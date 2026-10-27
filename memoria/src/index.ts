// Memoria on Cloudflare Workers: /mcp for Claude (behind OAuth), /api for the
// web app and scripts, and the web app itself (public/).
import { OAuthProvider } from '@cloudflare/workers-oauth-provider'
import { authenticate, checkPassword, type Env } from './auth'
import { handleApi } from './api'
import { handleMcp } from './mcp'

const SECURITY_HEADERS: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'same-origin',
  'x-frame-options': 'DENY',
}

function withHeaders(response: Response, extra: Record<string, string> = {}): Response {
  const r = new Response(response.body, response)
  for (const [k, v] of Object.entries({ ...SECURITY_HEADERS, ...extra })) if (!r.headers.has(k)) r.headers.set(k, v)
  return r
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

function consentPage(client: string, error: string | null, needPassword = true): Response {
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Conectar Memoria</title><link rel="stylesheet" href="/app.css"></head>
<body class="center-page"><form method="post" class="card login">
<h1>Conectar Memoria</h1>
<p><strong>${escapeHtml(client)}</strong> quiere leer y escribir en tu memoria.</p>
${needPassword ? '<label>Contraseña de Memoria<input type="password" name="password" autocomplete="current-password" required autofocus></label>' : '<p>Ya iniciaste sesión en Memoria en este navegador.</p>'}
${error ? `<p class="error" role="alert">${escapeHtml(error)}</p>` : ''}
<button type="submit" class="primary">Permitir</button>
<p class="hint">Si no fuiste tú quien pidió conectar, cierra esta página.</p>
</form></body></html>`
  return withHeaders(new Response(html, { status: error ? 401 : 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } }), {
    'content-security-policy': "default-src 'none'; style-src 'self'; form-action 'self' https:; frame-ancestors 'none'",
  })
}

/** Claude's OAuth consent: the password, then the grant. */
async function authorize(request: Request, env: Env): Promise<Response> {
  // The POST carries the same query string: parse the request from it again
  // instead of trusting a copy in the form.
  const parsedFrom = new Request(request.url, { method: 'GET', headers: request.headers })
  let oauthRequest
  try {
    oauthRequest = await env.OAUTH_PROVIDER.parseAuthRequest(parsedFrom)
  } catch (error) {
    const e = error as { redirectUri?: string; code?: string; state?: string; message?: string }
    if (e?.redirectUri) {
      const redirect = new URL(e.redirectUri)
      redirect.searchParams.set('error', e.code ?? 'invalid_request')
      if (e.state) redirect.searchParams.set('state', e.state)
      return Response.redirect(redirect.toString(), 302)
    }
    return new Response(e?.message ?? 'Solicitud de autorización no válida.', { status: 400 })
  }
  const client = (await env.OAUTH_PROVIDER.lookupClient(oauthRequest.clientId))?.clientName ?? 'Una aplicación'
  // Already signed in to the app in this browser: no need to type it again.
  const signedIn = (await authenticate(new Request(request.url, { headers: request.headers }), env))?.via === 'cookie'
  if (request.method === 'GET' && !signedIn) return consentPage(client, null)
  if (request.method === 'POST' && !signedIn) {
    const form = await request.formData()
    const result = await checkPassword(request, env, String(form.get('password') ?? ''))
    if (result !== 'ok') {
      return consentPage(client, result === 'locked' ? 'Demasiados intentos. Espera 15 minutos.' : result === 'unset' ? 'Falta configurar la contraseña de Memoria.' : 'Contraseña incorrecta.')
    }
  } else if (request.method === 'GET' && signedIn) {
    // Signed in: still ask, so a page cannot connect a client silently.
    return consentPage(client, null, false)
  }
  const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
    request: oauthRequest,
    userId: 'owner',
    metadata: { label: client },
    scope: oauthRequest.scope,
    props: {},
  })
  return Response.redirect(redirectTo, 302)
}

const appHandler = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/authorize') return authorize(request, env)
    if (url.pathname.startsWith('/api/')) return withHeaders(await handleApi(request, env), { 'cache-control': 'no-store' })
    // The web app: static files, the page for any other path.
    const asset = await env.ASSETS.fetch(request)
    return withHeaders(asset, {
      'content-security-policy':
        "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    })
  },
}

const mcpHandler = {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleMcp(request, env)
  },
}

// RFC 9728 names this server's one canonical resource: its own /mcp URL, the
// workers.dev address in production and localhost in development.
const providers = new Map<string, OAuthProvider<Env>>()
function providerFor(origin: string): OAuthProvider<Env> {
  let p = providers.get(origin)
  if (!p) {
    p = new OAuthProvider<Env>({
      apiRoute: '/mcp',
      apiHandler: mcpHandler as never,
      defaultHandler: appHandler as never,
      authorizeEndpoint: '/authorize',
      tokenEndpoint: '/oauth/token',
      clientRegistrationEndpoint: '/register',
      scopesSupported: ['memoria'],
      resourceMetadata: { resource: `${origin}/mcp` },
    })
    providers.set(origin, p)
  }
  return p
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return providerFor(new URL(request.url).origin).fetch(request, env, ctx)
  },
}
