import { getGeminiClient } from './client.js'
import { isQuotaExhaustedError } from './analyze-video.js'
import { estimateCostUsd } from './cost.js'
import type { TokenUsage } from './types.js'

/**
 * Both calls here are text-only (no video re-upload): they run over the
 * transcript/scenes/summary already extracted and persisted by the 'analyze'
 * job. That keeps the marginal cost of "Detectar Skills"/"Crear Skill" small
 * relative to a full video analysis — but PROJECT.md §12 and .env.example
 * are explicit that GEMINI_SKILL_MODEL still shares the account's 20 RPD
 * ceiling with video analysis, so every call here still spends real quota.
 */
const MAX_OUTPUT_TOKENS = 16384

function usageFromGenerateContent(usage: {
  promptTokenCount?: number
  candidatesTokenCount?: number
  cachedContentTokenCount?: number
  thoughtsTokenCount?: number
}): TokenUsage {
  const inputTokens = usage.promptTokenCount ?? 0
  const outputTokens = usage.candidatesTokenCount ?? 0
  const cachedTokens = usage.cachedContentTokenCount ?? 0
  const thoughtTokens = usage.thoughtsTokenCount ?? 0
  return {
    inputTokens,
    outputTokens,
    cachedTokens,
    thoughtTokens,
    estimatedCostUsd: estimateCostUsd({ inputTokens, outputTokens, cachedTokens, thoughtTokens }),
  }
}

/**
 * Runs the prompt against the first model in `models` that answers. Same
 * reasoning as analyzeVideo's rotation: Gemini's free-tier daily cap is per
 * model, so one model being out of quota is a reason to try the next, not to
 * fail the job. Skill detection/generation share that cap with video
 * analysis, which is exactly why they need the rotation too.
 */
async function runTextJson<T>(
  models: string[],
  prompt: string,
  schema: object,
): Promise<{ result: T; usage: TokenUsage; rawResponseText: string; modelUsed: string }> {
  if (!models.length) throw new Error('Se requiere al menos un modelo.')

  for (const [index, model] of models.entries()) {
    try {
      return { ...(await runTextJsonOnce<T>(model, prompt, schema)), modelUsed: model }
    } catch (error) {
      if (index === models.length - 1) throw error
      const reason = isQuotaExhaustedError(error) ? 'sin cupo diario' : 'fallo'
      console.warn(`[ai-router] ${model} ${reason}, probando ${models[index + 1]}...`)
    }
  }

  throw new Error('No se pudo completar la llamada con ninguno de los modelos configurados.')
}

async function runTextJsonOnce<T>(
  model: string,
  prompt: string,
  schema: object,
): Promise<{ result: T; usage: TokenUsage; rawResponseText: string }> {
  const ai = getGeminiClient()
  const response = await ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      responseMimeType: 'application/json',
      responseSchema: schema,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    },
  })

  if (response.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
    throw new Error(`Gemini corto la respuesta por exceder ${MAX_OUTPUT_TOKENS} tokens de salida.`)
  }

  const text = response.text
  if (!text) throw new Error('Gemini no devolvio texto.')

  let parsed: T
  try {
    parsed = JSON.parse(text.trim()) as T
  } catch {
    throw new Error('Gemini no devolvio JSON valido.')
  }

  return { result: parsed, usage: usageFromGenerateContent(response.usageMetadata ?? {}), rawResponseText: text }
}

// ── Deteccion de Skills (PROJECT.md §12) ───────────────────────────────────

export type SkillCandidate = {
  name: string
  description: string
  start_seconds: number
  end_seconds: number
  rationale: string
  confidence: number
}

const SKILL_CANDIDATES_SCHEMA = {
  type: 'object',
  properties: {
    candidates: {
      type: 'array',
      description: 'Procesos/metodos reutilizables detectados en el video. Puede ser un array vacio.',
      items: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description:
              'Identificador de la skill: minusculas, numeros y guiones unicamente, maximo 64 caracteres (ej. "crear-videos-publicitarios-con-ia").',
          },
          description: {
            type: 'string',
            description: 'Que hace la skill y cuando usarla, en espanol, maximo 200 caracteres.',
          },
          start_seconds: { type: 'number' },
          end_seconds: { type: 'number' },
          rationale: {
            type: 'string',
            description: 'Por que este tramo es un proceso/metodo reutilizable y no una opinion o ejemplo incidental.',
          },
          confidence: { type: 'number', description: '0.0 a 1.0' },
        },
        required: ['name', 'description', 'start_seconds', 'end_seconds', 'rationale', 'confidence'],
      },
    },
  },
  required: ['candidates'],
} as const

const SKILL_DETECTION_PROMPT_HEADER = `Eres un analista que revisa la transcripcion y el timeline de un video para encontrar procesos o metodos reutilizables — algo que alguien podria seguir como una receta paso a paso en otro contexto, distinto de opiniones, anecdotas o comentarios incidentales del video.

Para cada proceso reutilizable que encuentres, define una "Skill" (en el sentido de Claude Agent Skills): un nombre identificador corto, una descripcion de que hace y cuando usarla, y el rango de tiempo exacto (en segundos) donde el video explica ese proceso.

Reglas:
- Solo cuenta como Skill un METODO o PROCESO reutilizable explicado con suficiente detalle para seguirlo (pasos, herramientas, orden). Una mencion de pasada, una opinion, o un ejemplo sin explicar el "como" no cuentan.
- Puede haber cero, una o varias Skills candidatas en el mismo video, cada una con su propio rango de tiempo (pueden solaparse si el video entrelaza dos procesos).
- "name": solo minusculas, numeros y guiones (regex: ^[a-z0-9]+(-[a-z0-9]+)*$), maximo 64 caracteres.
- "description": maximo 200 caracteres, en espanol.
- Si genuinamente no hay ningun proceso reutilizable en el video, devuelve "candidates": [].
- Responde SOLO el JSON. Sin markdown, sin comentarios.

CONTENIDO DEL VIDEO:
`

export async function detectSkillCandidates(input: {
  models: string[]
  videoDigest: string
}): Promise<{ candidates: SkillCandidate[]; usage: TokenUsage; rawResponseText: string; modelUsed: string }> {
  const prompt = SKILL_DETECTION_PROMPT_HEADER + input.videoDigest
  const { result, usage, rawResponseText, modelUsed } = await runTextJson<{ candidates: SkillCandidate[] }>(
    input.models,
    prompt,
    SKILL_CANDIDATES_SCHEMA,
  )
  return { candidates: result.candidates ?? [], usage, rawResponseText, modelUsed }
}

// ── Generacion de SKILL.md (PROJECT.md §12) ────────────────────────────────

export type GeneratedSkillContent = {
  name: string
  description: string
  body_markdown: string
  references: { filename: string; contents: string }[]
  scripts: { filename: string; contents: string }[]
}

const SKILL_GENERATION_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Igual al name candidato, minusculas/numeros/guiones, <=64 caracteres.' },
    description: { type: 'string', description: 'Frontmatter description, <=200 caracteres, en espanol.' },
    body_markdown: {
      type: 'string',
      description:
        'Cuerpo completo del SKILL.md en Markdown (sin el frontmatter): que hace, cuando usarla, y el proceso paso a paso extraido literalmente del video, en espanol, con el detalle suficiente para seguirlo sin haber visto el video.',
    },
    references: {
      type: 'array',
      description: 'Archivos de referencia opcionales (documentacion extensa que no cabe en el cuerpo). Normalmente vacio.',
      items: {
        type: 'object',
        properties: { filename: { type: 'string' }, contents: { type: 'string' } },
        required: ['filename', 'contents'],
      },
    },
    scripts: {
      type: 'array',
      description: 'Scripts ejecutables opcionales solo si el proceso literalmente incluye codigo/comandos reutilizables. Normalmente vacio.',
      items: {
        type: 'object',
        properties: { filename: { type: 'string' }, contents: { type: 'string' } },
        required: ['filename', 'contents'],
      },
    },
  },
  required: ['name', 'description', 'body_markdown', 'references', 'scripts'],
} as const

function buildSkillGenerationPrompt(input: {
  name: string
  description: string
  rationale: string
  segmentDigest: string
}): string {
  return `Vas a escribir el archivo SKILL.md completo (formato Agent Skills de Anthropic) para la siguiente skill, detectada previamente en un video:

Nombre candidato: ${input.name}
Descripcion candidata: ${input.description}
Por que es reutilizable: ${input.rationale}

Usa EXACTAMENTE este tramo del video (transcripcion + escenas) como fuente del proceso — no inventes pasos que no esten aqui, y no omitas ningun paso que si este:

${input.segmentDigest}

Instrucciones:
- "name" debe ser igual o una version corregida (minusculas/numeros/guiones, <=64 caracteres) del nombre candidato.
- "description" <=200 caracteres, en espanol, describiendo que hace la skill y cuando activarla.
- "body_markdown" es el cuerpo del SKILL.md: explica el proceso paso a paso con el detalle exacto que el video da (herramientas, orden, decisiones, valores concretos si los hay), de forma que alguien que nunca vio el video pueda seguirlo.
- Genera "references" o "scripts" SOLO si el video realmente da contenido para eso (una plantilla larga, un script literal). Si no, deja ambos arrays vacios.
- Responde SOLO el JSON, sin markdown ni comentarios.`
}

export async function generateSkillContent(input: {
  models: string[]
  name: string
  description: string
  rationale: string
  segmentDigest: string
}): Promise<{ skill: GeneratedSkillContent; usage: TokenUsage; rawResponseText: string; modelUsed: string }> {
  const prompt = buildSkillGenerationPrompt(input)
  const { result, usage, rawResponseText, modelUsed } = await runTextJson<GeneratedSkillContent>(
    input.models,
    prompt,
    SKILL_GENERATION_SCHEMA,
  )
  return { skill: result, usage, rawResponseText, modelUsed }
}

// ── Mejora de Skills (PROJECT.md §13) ──────────────────────────────────────

export type ProposedSkillImprovement = {
  kind: 'new_step' | 'better_method' | 'new_tool' | 'pitfall' | 'missing_info' | 'outdated'
  title: string
  rationale: string
  start_seconds: number | null
  end_seconds: number | null
  proposed_diff: string
}

const SKILL_IMPROVEMENTS_SCHEMA = {
  type: 'object',
  properties: {
    improvements: {
      type: 'array',
      description:
        'Mejoras concretas encontradas al comparar la Skill existente contra el conocimiento nuevo del video. Puede ser un array vacio si el video no aporta nada nuevo.',
      items: {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
            enum: ['new_step', 'better_method', 'new_tool', 'pitfall', 'missing_info', 'outdated'],
            description:
              'new_step: paso que faltaba. better_method: forma mas eficiente de hacer un paso ya existente. new_tool: herramienta/recurso nuevo. pitfall: error a evitar que el video muestra. missing_info: dato/contexto que faltaba. outdated: algo en la skill que el video contradice o que ya no aplica.',
          },
          title: { type: 'string', description: 'Titulo corto de la mejora, en espanol.' },
          rationale: { type: 'string', description: 'Por que esto es una mejora real, citando lo que dice/muestra el video.' },
          start_seconds: { type: ['number', 'null'] },
          end_seconds: { type: ['number', 'null'] },
          proposed_diff: {
            type: 'string',
            description:
              'El texto Markdown exacto a anadir al SKILL.md (una seccion, un paso, una advertencia) — se anexa tal cual al final del documento al aplicar, asi que debe ser autocontenido y legible por si solo, sin depender de contexto que no incluya.',
          },
        },
        required: ['kind', 'title', 'rationale', 'start_seconds', 'end_seconds', 'proposed_diff'],
      },
    },
  },
  required: ['improvements'],
} as const

function buildSkillImprovementPrompt(input: { existingSkillMd: string; videoDigest: string }): string {
  return `Vas a comparar una Skill (SKILL.md) ya existente contra el contenido de un video nuevo, para encontrar mejoras concretas y accionables (PROJECT.md §13).

SKILL.md ACTUAL:
---
${input.existingSkillMd}
---

CONTENIDO DEL VIDEO NUEVO:
---
${input.videoDigest}
---

Busca especificamente:
- Pasos nuevos que el video muestra y la skill no cubre (new_step).
- Una forma mejor/mas eficiente de hacer algo que la skill ya describe (better_method).
- Herramientas o recursos nuevos que el video usa y la skill no menciona (new_tool).
- Errores o problemas que el video muestra y que valdria la pena advertir (pitfall).
- Informacion que falta en la skill y el video si da (missing_info).
- Algo que la skill dice y el video contradice o vuelve obsoleto (outdated).

Reglas:
- Cada mejora debe ser real y especifica al contenido del video, no una generica de sentido comun.
- Si el video no aporta nada genuinamente nuevo o distinto, devuelve "improvements": [].
- "proposed_diff" es el texto Markdown que se anexara literalmente al final del SKILL.md si el usuario aprueba la mejora — escribelo autocontenido (con su propio encabezado si aplica), en espanol.
- Responde SOLO el JSON, sin markdown ni comentarios.`
}

export async function proposeSkillImprovements(input: {
  models: string[]
  existingSkillMd: string
  videoDigest: string
}): Promise<{ improvements: ProposedSkillImprovement[]; usage: TokenUsage; rawResponseText: string; modelUsed: string }> {
  const prompt = buildSkillImprovementPrompt(input)
  const { result, usage, rawResponseText, modelUsed } = await runTextJson<{ improvements: ProposedSkillImprovement[] }>(
    input.models,
    prompt,
    SKILL_IMPROVEMENTS_SCHEMA,
  )
  return { improvements: result.improvements ?? [], usage, rawResponseText, modelUsed }
}
