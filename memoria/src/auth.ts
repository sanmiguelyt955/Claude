// One owner, one password (the MEMORIA_PASSWORD secret). The browser gets a
// signed session cookie; scripts send MEMORIA_API_TOKEN as a Bearer token;
// Claude connects through OAuth (see index.ts), whose consent page asks for
// the same password.

export type Env = {
  DB: D1Database
  FILES: R2Bucket
  OAUTH_KV: KVNamespace
  ASSETS: Fetcher
  MEMORIA_PASSWORD?: string
  MEMORIA_API_TOKEN?: string
  OAUTH_PROVIDER: import('@cloudflare/workers-oauth-provider').OAuthHelpers
}

const COOKIE = 'memoria_session'
const SESSION_DAYS = 30
const MAX_FAILURES = 10
const FAILURE_WINDOW_S = 15 * 60

const enc = new TextEncoder()

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(`memoria:${secret}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data)))
  return btoa(String.fromCharCode(...sig)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Constant-time comparison of two strings. */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))])
  const p = new Uint8Array(x)
  const q = new Uint8Array(y)
  let diff = a.length === b.length ? 0 : 1
  for (let i = 0; i < p.length; i++) diff |= p[i]! ^ q[i]!
  return diff === 0
}

export function configured(env: Env): boolean {
  return Boolean(env.MEMORIA_PASSWORD && env.MEMORIA_PASSWORD.length >= 8)
}

export async function sessionCookie(env: Env): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400
  const value = `${exp}.${await hmac(env.MEMORIA_PASSWORD!, `session:${exp}`)}`
  return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`
}

export const clearCookie = `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`

function readCookie(request: Request): string | null {
  const header = request.headers.get('cookie') ?? ''
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === COOKIE) return v.join('=')
  }
  return null
}

export type Caller = { via: 'cookie' | 'token' }

/**
 * Who is calling, or null. A cookie request that changes something must come
 * from the app's own page (Origin check), so another site cannot use the
 * owner's session.
 */
export async function authenticate(request: Request, env: Env): Promise<Caller | null> {
  if (!configured(env)) return null
  const auth = request.headers.get('authorization')
  if (auth?.startsWith('Bearer ')) {
    const token = auth.slice(7).trim()
    if (env.MEMORIA_API_TOKEN && env.MEMORIA_API_TOKEN.length >= 16 && (await safeEqual(token, env.MEMORIA_API_TOKEN))) return { via: 'token' }
    return null
  }
  const cookie = readCookie(request)
  if (!cookie) return null
  const [exp, sig] = cookie.split('.')
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return null
  if (!(await safeEqual(sig, await hmac(env.MEMORIA_PASSWORD!, `session:${exp}`)))) return null
  if (!['GET', 'HEAD'].includes(request.method)) {
    const origin = request.headers.get('origin')
    if (origin && origin !== new URL(request.url).origin) return null
  }
  return { via: 'cookie' }
}

const clientIp = (request: Request) => request.headers.get('cf-connecting-ip') ?? 'local'

/** Checks the password, counting failures per address: after 10 in 15 minutes it refuses until the window passes. */
export async function checkPassword(request: Request, env: Env, password: string): Promise<'ok' | 'wrong' | 'locked' | 'unset'> {
  if (!configured(env)) return 'unset'
  const key = `login-fail:${clientIp(request)}`
  const failures = Number((await env.OAUTH_KV.get(key)) ?? 0)
  if (failures >= MAX_FAILURES) return 'locked'
  if (await safeEqual(password, env.MEMORIA_PASSWORD!)) {
    if (failures) await env.OAUTH_KV.delete(key)
    return 'ok'
  }
  await env.OAUTH_KV.put(key, String(failures + 1), { expirationTtl: FAILURE_WINDOW_S })
  return 'wrong'
}
