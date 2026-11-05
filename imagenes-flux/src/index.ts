// imagenes-flux: servidor MCP (JSON-RPC por HTTP, sin estado) que genera imágenes con FLUX en Cloudflare Workers AI.
// - /<CLAVE>/mcp      → conector para Claude (claude.ai, Cowork, Claude Code)
// - /img/<id>.jpg     → las imágenes generadas (id aleatorio, se guardan 30 días en KV)
// - /                 → estado
// Modelos: flux-1-schnell (cuadrado 1024, el más barato) y flux-2-klein-4b (cualquier formato, p. ej. 9:16).
// Cuota gratis de Workers AI: 10 000 neuronas al día (se reinicia a las 00:00 UTC). Este servidor lleva la cuenta.

export interface Env {
  AI: Ai
  IMG: KVNamespace
  CLAVE?: string
}

const SCHNELL = '@cf/black-forest-labs/flux-1-schnell'
const KLEIN = '@cf/black-forest-labs/flux-2-klein-4b'
const CUOTA = 10_000
const TTL = 60 * 60 * 24 * 30

const FORMATOS: Record<string, [number, number]> = {
  '1:1': [1024, 1024], '9:16': [768, 1360], '16:9': [1360, 768], '4:5': [896, 1120], '3:4': [864, 1152],
}

const CROMA: Record<string, string> = {
  verde: 'isolated on a perfectly flat solid chroma key green background (#00B140), evenly lit, no shadows or gradients on the background, the whole subject fully visible with margin around it',
  azul: 'isolated on a perfectly flat solid chroma key blue background (#0047BB), evenly lit, no shadows or gradients on the background, the whole subject fully visible with margin around it',
}

// Neuronas según la tabla oficial de precios de Workers AI.
function neuronas(modelo: string, w: number, h: number, pasos: number): number {
  const tiles = Math.ceil(w / 512) * Math.ceil(h / 512)
  return modelo === SCHNELL ? tiles * 4.8 + pasos * 9.6 : tiles * 26.05
}

const hoy = () => new Date().toISOString().slice(0, 10)

async function usado(env: Env): Promise<number> {
  return Number((await env.IMG.get(`uso:${hoy()}`)) || 0)
}

async function sumarUso(env: Env, n: number) {
  const k = `uso:${hoy()}`
  await env.IMG.put(k, String((await usado(env)) + n), { expirationTtl: 60 * 60 * 48 })
}

function b64aBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function bytesAb64(buf: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
  return btoa(bin)
}

const idAleatorio = () => [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, '0')).join('')

type Opciones = { prompt: string; formato?: string; modelo?: string; pasos?: number; fondo?: string; estilo?: string; semilla?: number }

async function generar(env: Env, origen: string, o: Opciones) {
  const formato = FORMATOS[o.formato || '1:1'] ? o.formato || '1:1' : '1:1'
  const [w, h] = FORMATOS[formato]
  // schnell solo hace cuadrados: para otro formato se usa klein.
  const modelo = o.modelo === 'klein' || formato !== '1:1' ? KLEIN : SCHNELL
  const pasos = Math.max(1, Math.min(8, Math.round(o.pasos ?? 6)))
  const fondo = o.fondo && CROMA[o.fondo] ? CROMA[o.fondo] : ''
  const prompt = [o.estilo?.trim(), o.prompt.trim(), fondo].filter(Boolean).join('. ')
  const coste = neuronas(modelo, w, h, pasos)
  const ya = await usado(env)
  if (ya + coste > CUOTA) {
    throw new Error(`Se acabaría la cuota gratis de hoy (${Math.round(ya)} de ${CUOTA} neuronas usadas; esta imagen gasta ~${Math.round(coste)}). Se reinicia a las 00:00 UTC (18:00 hora de México centro).`)
  }
  let b64: string
  if (modelo === SCHNELL) {
    const r = (await env.AI.run(SCHNELL, { prompt, steps: pasos, ...(o.semilla !== undefined ? { seed: o.semilla } : {}) } as never)) as { image?: string }
    if (!r?.image) throw new Error('FLUX schnell no devolvió imagen')
    b64 = r.image
  } else {
    const form = new FormData()
    form.append('prompt', prompt)
    form.append('width', String(w))
    form.append('height', String(h))
    if (o.semilla !== undefined) form.append('seed', String(o.semilla))
    const cuerpo = new Response(form)
    const r = (await env.AI.run(KLEIN as never, {
      multipart: { body: cuerpo.body, contentType: cuerpo.headers.get('content-type') || 'multipart/form-data' },
    } as never)) as { image?: string }
    if (!r?.image) throw new Error('FLUX klein no devolvió imagen')
    b64 = r.image
  }
  await sumarUso(env, coste)
  const bytes = b64aBytes(b64)
  const tipo = bytes[0] === 0x89 ? 'image/png' : 'image/jpeg'
  const id = `${idAleatorio()}.${tipo === 'image/png' ? 'png' : 'jpg'}`
  await env.IMG.put(`img:${id}`, bytes, { expirationTtl: TTL, metadata: { tipo, prompt: prompt.slice(0, 300), formato, modelo } })
  return { url: `${origen}/img/${id}`, b64, tipo, formato, ancho: w, alto: h, modelo: modelo.split('/').pop(), neuronas: Math.round(coste), prompt }
}

const TOOLS = [
  {
    name: 'generar_imagen',
    description: 'Genera 1-4 imágenes con FLUX (Cloudflare Workers AI, gratis dentro de la cuota diaria) y las devuelve para verlas + su URL (válida 30 días). formato 1:1 usa FLUX.1 schnell (el más barato, ~96 neuronas); 9:16, 16:9, 4:5 o 3:4 usan FLUX.2 klein (~160-210 neuronas). fondo="verde" o "azul" pone el sujeto aislado sobre croma liso, listo para recortar como capa de un collage. estilo: frase de estilo que se antepone (úsala igual en todas las imágenes de un proyecto para que combinen). Escribe el prompt en inglés para mejores resultados.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Qué debe aparecer (mejor en inglés)' },
        formato: { type: 'string', enum: Object.keys(FORMATOS), description: 'Relación de aspecto (por defecto 1:1)' },
        fondo: { type: 'string', enum: ['ninguno', 'verde', 'azul'], description: 'Croma para recortar el sujeto (azul si el sujeto es verde)' },
        estilo: { type: 'string', description: 'Frase de estilo común del proyecto' },
        cantidad: { type: 'number', description: '1-4 variaciones (cada una gasta cuota)' },
        pasos: { type: 'number', description: 'Solo schnell: 1-8 (por defecto 6; más = más detalle)' },
        modelo: { type: 'string', enum: ['auto', 'schnell', 'klein'], description: 'auto (por defecto): schnell en 1:1, klein en otros formatos' },
        semilla: { type: 'number', description: 'Para repetir un resultado' },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'generar_capas',
    description: 'Genera las capas de UNA escena de collage animado: un fondo (sin personas, formato del video) y cada elemento sobre fondo verde (o azul) listo para recortar. Devuelve las URLs en el orden pedido para ponerlas en el guion de motion.py (descargarlas primero). Usa la misma frase de estilo en todas las escenas.',
    inputSchema: {
      type: 'object',
      properties: {
        estilo: { type: 'string', description: 'Frase de estilo común (luz, paleta, grano, época)' },
        fondo: { type: 'string', description: 'Prompt del fondo de la escena (lugar real, sin personas)' },
        formato: { type: 'string', enum: Object.keys(FORMATOS), description: 'Formato del video (por defecto 9:16)' },
        elementos: {
          type: 'array',
          description: 'Personas, productos u objetos que se moverán, o primeros planos (marco de ventana, rama…)',
          items: { type: 'object', properties: { nombre: { type: 'string' }, prompt: { type: 'string' }, croma: { type: 'string', enum: ['verde', 'azul'] } }, required: ['prompt'] },
        },
      },
      required: ['fondo'],
    },
  },
  {
    name: 'cuota_imagenes',
    description: 'Cuánta cuota gratis de Workers AI queda hoy (neuronas) y cuántas imágenes alcanzan de cada tipo.',
    inputSchema: { type: 'object', properties: {} },
  },
]

const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' } })
const ok = (id: unknown, content: unknown[]) => json({ jsonrpc: '2.0', id, result: { content } })
const err = (id: unknown, message: string, code = -32603) => json({ jsonrpc: '2.0', id, error: { code, message } })

async function llamar(env: Env, origen: string, id: unknown, nombre: string, a: Record<string, unknown>) {
  if (nombre === 'cuota_imagenes') {
    const ya = await usado(env)
    const queda = Math.max(0, CUOTA - ya)
    return ok(id, [{ type: 'text', text: JSON.stringify({
      usado_hoy: Math.round(ya), cuota: CUOTA, quedan: Math.round(queda),
      alcanzan: { cuadradas_schnell: Math.floor(queda / neuronas(SCHNELL, 1024, 1024, 6)), verticales_9x16_klein: Math.floor(queda / neuronas(KLEIN, 768, 1360, 4)) },
      reinicio: '00:00 UTC', nota: 'Cuenta de este servidor; el panel de Cloudflare (Workers AI) tiene la cifra oficial.',
    }) }])
  }
  if (nombre === 'generar_imagen') {
    const n = Math.max(1, Math.min(4, Math.round(Number(a.cantidad ?? 1))))
    const contenido: unknown[] = []
    const datos = []
    for (let i = 0; i < n; i++) {
      const semilla = a.semilla !== undefined ? Number(a.semilla) + i : undefined
      const r = await generar(env, origen, { prompt: String(a.prompt), formato: a.formato as string, modelo: a.modelo === 'auto' ? undefined : (a.modelo as string),
        pasos: a.pasos as number, fondo: a.fondo as string, estilo: a.estilo as string, semilla })
      contenido.push({ type: 'image', data: r.b64, mimeType: r.tipo })
      datos.push({ url: r.url, formato: r.formato, tamaño: `${r.ancho}x${r.alto}`, modelo: r.modelo, neuronas: r.neuronas })
    }
    contenido.unshift({ type: 'text', text: JSON.stringify({ imagenes: datos, cuota_restante: Math.round(CUOTA - (await usado(env))) }) })
    return ok(id, contenido)
  }
  if (nombre === 'generar_capas') {
    const formato = (a.formato as string) || '9:16'
    const estilo = a.estilo as string
    const capas: Record<string, unknown>[] = []
    const fondo = await generar(env, origen, { prompt: `${String(a.fondo)}, empty scene with no people`, formato, estilo })
    capas.push({ capa: 'fondo', url: fondo.url, z: 0, neuronas: fondo.neuronas })
    const contenido: unknown[] = [{ type: 'image', data: fondo.b64, mimeType: fondo.tipo }]
    for (const [k, el] of ((a.elementos as { nombre?: string; prompt: string; croma?: string }[]) || []).entries()) {
      const r = await generar(env, origen, { prompt: el.prompt, formato: '1:1', estilo, fondo: el.croma || 'verde' })
      capas.push({ capa: el.nombre || `elemento_${k + 1}`, url: r.url, croma: el.croma || 'verde', neuronas: r.neuronas })
      contenido.push({ type: 'image', data: r.b64, mimeType: r.tipo })
    }
    contenido.unshift({ type: 'text', text: JSON.stringify({ capas, cuota_restante: Math.round(CUOTA - (await usado(env))),
      siguiente: 'Descarga las URLs junto al guion y úsalas como capas (motion.py recorta el croma solo).' }) })
    return ok(id, contenido)
  }
  return err(id, `Herramienta desconocida: ${nombre}`, -32601)
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const origen = url.origin
    if (request.method === 'OPTIONS') return new Response(null, { headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type, authorization, mcp-protocol-version' } })
    if (request.method === 'GET' && url.pathname.startsWith('/img/')) {
      const id = url.pathname.slice(5)
      if (!/^[0-9a-f]{24}\.(jpg|png)$/.test(id)) return new Response('No encontrado', { status: 404 })
      const { value, metadata } = await env.IMG.getWithMetadata<{ tipo: string }>(`img:${id}`, 'arrayBuffer')
      if (!value) return new Response('No encontrado (las imágenes duran 30 días)', { status: 404 })
      return new Response(value, { headers: { 'content-type': metadata?.tipo || 'image/jpeg', 'cache-control': 'public, max-age=2592000, immutable' } })
    }
    if (request.method === 'GET' && url.pathname === '/') return json({ servicio: 'imagenes-flux', estado: 'ok' })
    if (!env.CLAVE || url.pathname !== `/${env.CLAVE}/mcp`) return new Response('No encontrado', { status: 404 })
    if (request.method === 'GET') return new Response('Usa POST (MCP por HTTP)', { status: 405 })
    let body: { jsonrpc?: string; id?: unknown; method?: string; params?: { name?: string; arguments?: Record<string, unknown> } }
    try {
      body = await request.json()
    } catch {
      return err(null, 'JSON no válido', -32700)
    }
    const { id, method, params } = body
    if (method === 'initialize') {
      return json({ jsonrpc: '2.0', id, result: { protocolVersion: '2025-03-26', capabilities: { tools: {} },
        serverInfo: { name: 'imagenes-flux', version: '1.0.0' },
        instructions: 'Genera imágenes gratis con FLUX (cuota diaria de Workers AI). Para collages por capas usa generar_capas con la misma frase de estilo en todas las escenas; los elementos salen sobre croma verde para recortarlos.' } })
    }
    if (method?.startsWith('notifications/')) return new Response(null, { status: 202 })
    if (method === 'ping') return json({ jsonrpc: '2.0', id, result: {} })
    if (method === 'tools/list') return json({ jsonrpc: '2.0', id, result: { tools: TOOLS } })
    if (method === 'tools/call') {
      try {
        return await llamar(env, origen, id, params?.name || '', params?.arguments || {})
      } catch (e) {
        return ok(id, [{ type: 'text', text: `Error: ${(e as Error).message}` }])
      }
    }
    return err(id, `Método no soportado: ${method}`, -32601)
  },
}
