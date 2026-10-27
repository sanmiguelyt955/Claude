// The MCP server Claude connects to (claude.ai connector, Claude Code): JSON-RPC
// over Streamable HTTP, stateless (each POST is answered with JSON).
import type { Env } from './auth'
import { notePath } from './parse'
import {
  appendToNote,
  backlinks,
  dailyNote,
  findNote,
  getVersion,
  listFiles,
  listNotes,
  localDate,
  outgoingLinks,
  putFile,
  renameNote,
  saveNote,
  search,
  tagCounts,
  trashNote,
  versions,
  ConflictError,
} from './store'

export const SERVER_INFO = { name: 'memoria', title: 'Memoria', version: '0.1.0' }

const INSTRUCTIONS = `Memoria es la memoria permanente del usuario y de Claude: notas en Markdown tipo Obsidian ([[enlaces]], #etiquetas), en la nube.
- Al empezar una conversación de trabajo, llama a memoria_contexto y ten en cuenta lo que diga.
- Antes de responder sobre proyectos, decisiones o preferencias pasadas, busca con buscar.
- Cuando se decida algo, se aprenda algo o termine un trabajo, guárdalo: recordar para apuntes rápidos, agregar_a_nota o escribir_nota para notas completas. Usa [[enlaces]] a las notas relacionadas.
- Nada se borra del todo: borrar_nota la manda a la papelera y cada versión anterior queda en el historial.
- Nunca guardes contraseñas, claves de API ni tokens.`

type Tool = { name: string; title: string; description: string; inputSchema: Record<string, unknown>; annotations?: Record<string, boolean> }

const str = (description: string) => ({ type: 'string', description })

export const TOOLS: Tool[] = [
  {
    name: 'memoria_contexto',
    title: 'Contexto de la memoria',
    description: 'Lo que hay que saber al empezar: objetivos, preferencias del usuario, decisiones y tropiezos, más las notas cambiadas hace poco. Llamar al inicio de cada conversación de trabajo.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'buscar',
    title: 'Buscar en la memoria',
    description: 'Busca en todas las notas (título y texto; acentos y mayúsculas no importan; "impres" encuentra "impresora"). Admite "frase exacta", tag:etiqueta, path:carpeta, file:nombre y -palabra para excluir.',
    inputSchema: { type: 'object', properties: { consulta: str('Qué buscar'), limite: { type: 'number', description: 'Máximo de resultados (20 por defecto)' } }, required: ['consulta'] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'leer_nota',
    title: 'Leer una nota',
    description: 'Contenido completo de una nota, por su ruta ("Carpeta/Nota") o su nombre como en un [[enlace]], con las notas que la enlazan y las que enlaza.',
    inputSchema: { type: 'object', properties: { nota: str('Ruta o nombre de la nota') }, required: ['nota'] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'listar_notas',
    title: 'Listar notas',
    description: 'Lista las notas (ruta y fecha de cambio), opcionalmente solo de una carpeta.',
    inputSchema: { type: 'object', properties: { carpeta: str('Carpeta, por ejemplo "Proyectos" (opcional)') } },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'escribir_nota',
    title: 'Crear o reemplazar una nota',
    description: 'Crea una nota o reemplaza todo su contenido (la versión anterior queda en el historial). Markdown con [[enlaces]] y #etiquetas. Para añadir sin reemplazar, usa agregar_a_nota.',
    inputSchema: {
      type: 'object',
      properties: {
        nota: str('Ruta de la nota, por ejemplo "Proyectos/Video Analyzer"'),
        contenido: str('Contenido completo en Markdown'),
        version_base: str('updated_at que tenía la nota al leerla: si cambió desde entonces no se sobrescribe (opcional)'),
      },
      required: ['nota', 'contenido'],
    },
  },
  {
    name: 'agregar_a_nota',
    title: 'Añadir a una nota',
    description: 'Añade texto al final de una nota, o al final de una de sus secciones (encabezado). Si la nota no existe, la crea.',
    inputSchema: { type: 'object', properties: { nota: str('Ruta o nombre de la nota'), texto: str('Texto en Markdown'), seccion: str('Título del encabezado bajo el que añadir (opcional; se crea si no existe)') }, required: ['nota', 'texto'] },
  },
  {
    name: 'recordar',
    title: 'Recordar algo',
    description: 'Apunte rápido con fecha y hora en la nota del día (sección "Memorias"). Para decisiones, aprendizajes, preferencias o el estado de un trabajo.',
    inputSchema: { type: 'object', properties: { texto: str('Qué recordar, en una o pocas frases; puede llevar [[enlaces]]') }, required: ['texto'] },
  },
  {
    name: 'renombrar_nota',
    title: 'Renombrar o mover una nota',
    description: 'Cambia el nombre o la carpeta de una nota y actualiza todos los [[enlaces]] que apuntan a ella.',
    inputSchema: { type: 'object', properties: { nota: str('Ruta actual'), nueva_ruta: str('Nueva ruta, por ejemplo "Archivo/Nota vieja"') }, required: ['nota', 'nueva_ruta'] },
  },
  {
    name: 'borrar_nota',
    title: 'Mandar una nota a la papelera',
    description: 'Manda la nota a la papelera (se puede recuperar desde la app).',
    inputSchema: { type: 'object', properties: { nota: str('Ruta o nombre de la nota') }, required: ['nota'] },
    annotations: { destructiveHint: true },
  },
  {
    name: 'historial_nota',
    title: 'Historial de una nota',
    description: 'Versiones anteriores de una nota. Con id, devuelve el contenido de esa versión.',
    inputSchema: { type: 'object', properties: { nota: str('Ruta o nombre de la nota'), id: { type: 'number', description: 'Versión a leer (opcional)' } }, required: ['nota'] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'etiquetas',
    title: 'Etiquetas',
    description: 'Todas las #etiquetas con cuántas notas tiene cada una.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'nota_del_dia',
    title: 'Nota del día',
    description: 'La nota diaria de hoy (o de una fecha AAAA-MM-DD), creada si no existe.',
    inputSchema: { type: 'object', properties: { fecha: str('AAAA-MM-DD (opcional, hoy por defecto)') } },
  },
  {
    name: 'subir_archivo',
    title: 'Guardar un archivo',
    description: 'Guarda un archivo (imagen, PDF, texto…) en la memoria, en base64. Máximo 10 MB. Para enlazarlo desde una nota: ![[ruta]].',
    inputSchema: {
      type: 'object',
      properties: { ruta: str('Ruta del archivo, por ejemplo "Adjuntos/captura.png"'), base64: str('Contenido en base64'), tipo: str('Tipo MIME, por ejemplo image/png') },
      required: ['ruta', 'base64'],
    },
  },
  {
    name: 'listar_archivos',
    title: 'Listar archivos',
    description: 'Archivos guardados (ruta, tamaño, tipo).',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
  },
]

/** The notes read first at the start of a conversation, when they exist. */
const CONTEXT_NOTES = ['brain/North Star', 'org/people/Usuario', 'brain/Memories', 'brain/Key Decisions', 'brain/Gotchas', 'brain/Patterns']

class ToolError extends Error {}

const text = (s: string) => ({ content: [{ type: 'text', text: s }] })

async function callTool(env: Env, name: string, args: Record<string, unknown>, origin: string): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  const db = env.DB
  const arg = (k: string, required = true): string => {
    const v = args[k]
    if (typeof v === 'string' && v.trim()) return v
    if (required) throw new ToolError(`Falta el parámetro «${k}».`)
    return ''
  }
  switch (name) {
    case 'memoria_contexto': {
      const parts: string[] = []
      for (const n of CONTEXT_NOTES) {
        const note = await findNote(db, n)
        if (note) parts.push(`=== ${note.path} ===\n${note.content.trim()}`)
      }
      const recent = (await listNotes(db)).sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 15)
      parts.push(`=== Notas cambiadas hace poco ===\n${recent.map((r) => `- ${r.path} (${r.updated_at.slice(0, 16).replace('T', ' ')} UTC)`).join('\n') || '(ninguna)'}`)
      const today = await findNote(db, `Diario/${localDate()}`)
      if (today) parts.push(`=== Nota de hoy: ${today.path} ===\n${today.content.trim()}`)
      parts.push(`App: ${origin}`)
      return text(parts.join('\n\n'))
    }
    case 'buscar': {
      const limit = Math.min(50, Math.max(1, Number(args.limite) || 20))
      const hits = await search(db, arg('consulta'), limit)
      return text(hits.length ? hits.map((h) => `- ${h.path}\n  ${h.snippet}`).join('\n') : 'Sin resultados.')
    }
    case 'leer_nota': {
      const note = await findNote(db, arg('nota'))
      if (!note) throw new ToolError(`No existe la nota «${arg('nota')}».`)
      const [back, out] = await Promise.all([backlinks(db, note.path), outgoingLinks(db, note.path)])
      return text(
        [
          `Ruta: ${note.path}\nCambiada: ${note.updated_at} (usa este valor como version_base al reescribirla)`,
          note.content,
          `--- La enlazan: ${back.map((b) => b.path).join(', ') || 'ninguna'}`,
          `--- Enlaza a: ${out.map((o) => (o.path ? o.path : `${o.target} (no existe)`)).join(', ') || 'nada'}`,
        ].join('\n\n'),
      )
    }
    case 'listar_notas': {
      const folder = arg('carpeta', false).replace(/^\/+|\/+$/g, '')
      const notes = (await listNotes(db)).filter((n) => !folder || n.path.startsWith(`${folder}/`))
      return text(notes.map((n) => `- ${n.path} (${n.updated_at.slice(0, 10)})`).join('\n') || 'No hay notas.')
    }
    case 'escribir_nota': {
      try {
        const note = await saveNote(db, arg('nota'), arg('contenido'), { source: 'mcp', baseUpdatedAt: arg('version_base', false) || null })
        return text(`Guardada: ${note.path} (${note.updated_at})`)
      } catch (err) {
        if (err instanceof ConflictError && err.current) {
          throw new ToolError(`La nota cambió desde que la leíste (ahora: ${err.current.updated_at}). Léela otra vez y combina los cambios.`)
        }
        throw err
      }
    }
    case 'agregar_a_nota': {
      const note = await appendToNote(db, arg('nota'), arg('texto'), { source: 'mcp', heading: arg('seccion', false) || undefined })
      return text(`Añadido a ${note.path}.`)
    }
    case 'recordar': {
      const day = await dailyNote(db, 'mcp')
      const time = new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date())
      const note = await appendToNote(db, day.path, `- ${time} — ${arg('texto').trim()}`, { source: 'mcp', heading: 'Memorias' })
      return text(`Recordado en ${note.path}.`)
    }
    case 'renombrar_nota': {
      const note = await findNote(db, arg('nota'))
      if (!note) throw new ToolError(`No existe la nota «${arg('nota')}».`)
      const r = await renameNote(db, note.path, arg('nueva_ruta'), 'mcp')
      return text(`Ahora es ${r.path}.${r.updatedLinks.length ? ` Enlaces actualizados en: ${r.updatedLinks.join(', ')}.` : ''}`)
    }
    case 'borrar_nota': {
      const note = await findNote(db, arg('nota'))
      if (!note) throw new ToolError(`No existe la nota «${arg('nota')}».`)
      await trashNote(db, note.path)
      return text(`${note.path} está en la papelera.`)
    }
    case 'historial_nota': {
      const note = (await findNote(db, arg('nota'))) ?? null
      const path = note?.path ?? notePath(arg('nota'))
      if (typeof args.id === 'number') {
        const v = await getVersion(db, args.id)
        if (!v || v.path !== path) throw new ToolError(`No existe la versión ${args.id} de ${path}.`)
        return text(`Versión ${v.id} de ${v.path}, guardada ${v.saved_at} (${v.source}):\n\n${v.content}`)
      }
      const list = await versions(db, path)
      return text(list.length ? list.map((v) => `- id ${v.id}: ${v.saved_at} (${v.source}, ${v.size} caracteres)`).join('\n') : `${path} no tiene versiones anteriores.`)
    }
    case 'etiquetas': {
      const tags = await tagCounts(db)
      return text(tags.map((t) => `#${t.tag} (${t.count})`).join('\n') || 'No hay etiquetas.')
    }
    case 'nota_del_dia': {
      const note = await dailyNote(db, 'mcp', arg('fecha', false) || undefined)
      return text(`Ruta: ${note.path}\n\n${note.content}`)
    }
    case 'subir_archivo': {
      const b64 = arg('base64').replace(/^data:[^,]*,/, '').replace(/\s+/g, '')
      const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
      if (bin.length > 10 * 1024 * 1024) throw new ToolError('El archivo pasa de 10 MB; súbelo desde la app.')
      const file = await putFile(db, env.FILES, arg('ruta'), bin.buffer, arg('tipo', false) || guessType(arg('ruta')), bin.length)
      return text(`Guardado ${file.path} (${file.size} bytes). Enlázalo con ![[${file.path}]].`)
    }
    case 'listar_archivos': {
      const files = await listFiles(db)
      return text(files.map((f) => `- ${f.path} (${f.content_type}, ${f.size} bytes)`).join('\n') || 'No hay archivos.')
    }
    default:
      throw new ToolError(`Herramienta desconocida: ${name}`)
  }
}

export function guessType(path: string): string {
  const ext = path.toLowerCase().split('.').pop() ?? ''
  const map: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
    pdf: 'application/pdf', txt: 'text/plain; charset=utf-8', json: 'application/json', csv: 'text/csv; charset=utf-8',
    mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', ogg: 'audio/ogg',
    zip: 'application/zip', canvas: 'application/json', html: 'text/plain; charset=utf-8',
  }
  return map[ext] ?? 'application/octet-stream'
}

type RpcRequest = { jsonrpc: '2.0'; id?: string | number | null; method: string; params?: Record<string, unknown> }

async function handleOne(env: Env, msg: RpcRequest, origin: string): Promise<Record<string, unknown> | null> {
  const isNotification = msg.id === undefined || msg.id === null
  const reply = (result: unknown) => ({ jsonrpc: '2.0', id: msg.id, result })
  const fail = (code: number, message: string) => ({ jsonrpc: '2.0', id: msg.id ?? null, error: { code, message } })
  if (msg?.jsonrpc !== '2.0' || typeof msg.method !== 'string') return fail(-32600, 'Invalid Request')
  switch (msg.method) {
    case 'initialize': {
      const asked = typeof msg.params?.protocolVersion === 'string' ? msg.params.protocolVersion : '2025-06-18'
      return reply({ protocolVersion: asked, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO, instructions: INSTRUCTIONS })
    }
    case 'ping':
      return isNotification ? null : reply({})
    case 'tools/list':
      return reply({ tools: TOOLS })
    case 'tools/call': {
      const name = String(msg.params?.name ?? '')
      const args = (msg.params?.arguments ?? {}) as Record<string, unknown>
      try {
        return reply(await callTool(env, name, args, origin))
      } catch (err) {
        return reply({ content: [{ type: 'text', text: (err as Error).message }], isError: true })
      }
    }
    default:
      if (msg.method.startsWith('notifications/')) return null
      return isNotification ? null : fail(-32601, `Method not found: ${msg.method}`)
  }
}

export async function handleMcp(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: { allow: 'POST' } })
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, { status: 400 })
  }
  const origin = new URL(request.url).origin
  const batch = Array.isArray(body)
  const replies = (await Promise.all((batch ? (body as unknown[]) : [body]).map((m: unknown) => handleOne(env, m as RpcRequest, origin)))).filter(Boolean)
  if (!replies.length) return new Response(null, { status: 202 })
  return Response.json(batch ? replies : replies[0])
}

