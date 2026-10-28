import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Reco } from '../types'

const last = atom({ plugin: 'modelo-recomendado', key: 'last' } as const, null)

const has = (text: string, words: string[]) =>
  words.some(w => text.includes(w))

export const recommend = (raw: string): Reco => {
  const t = raw.toLowerCase()
  const long = t.length > 600
  const code = (raw.match(/```/g) ?? []).length / 2

  if (
    has(t, [
      'arquitectura', 'architecture', 'diseña el sistema', 'design the system',
      'auditoría', 'audit', 'vulnerab', 'seguridad', 'security', 'migrar', 'migrate',
      'rediseñ', 'redesign', 'demostr', 'prueba matem', 'proof', 'estrategia', 'strategy',
      'investiga a fondo', 'deep research', 'trade-off', 'compar', 'planifica',
    ]) ||
    (long && code >= 2)
  ) {
    return {
      model: 'Opus',
      effort: long ? 'xhigh' : 'high',
      why: 'diseño, seguridad, análisis profundo o varios pasos encadenados',
    }
  }
  if (
    has(t, [
      'bug', 'error', 'falla', 'no funciona', 'debug', 'traceback', 'exception',
      'refactor', 'tests', 'pruebas', 'optimiza', 'performance', 'implementa',
      'crea un mod', 'crea una app', 'varios archivos', 'integra',
    ]) ||
    code >= 1
  ) {
    return {
      model: 'Sonnet',
      effort: 'high',
      why: 'depurar, probar o implementar algo con varias piezas',
    }
  }
  if (
    t.length < 120 ||
    has(t, [
      'traduce', 'translate', 'resume', 'summarize', 'corrige', 'ortograf', 'formato',
      'qué es', 'what is', 'cómo se dice', 'define', 'lista', 'renombra', 'hola',
    ])
  ) {
    return {
      model: 'Haiku',
      effort: 'low',
      why: 'pregunta corta o tarea simple (traducir, resumir, formato, datos puntuales)',
    }
  }

  return {
    model: 'Sonnet',
    effort: 'medium',
    why: 'tarea general: explicar, escribir, cambios de código normales',
  }
}

const line = (r: Reco) => `${r.model} · esfuerzo ${r.effort} (${r.why})`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'modelo',
      description: 'Recomienda modelo y esfuerzo para una pregunta: /modelo <tu pregunta>',
    })

    return next(e)
  })

  on('command.run', { command: 'modelo' }, async ($, e) => {
    if (e.args.trim() === '') return { text: 'Uso: /modelo <tu pregunta>' }
    const r = recommend(e.args)
    await update($, last, () => r)

    return {
      text: `Recomendado: ${line(r)}\nCámbialo con /model ${r.model.toLowerCase()}`,
    }
  })

  on('prompt.submit', async ($, e, next) => {
    if (!e.command && !e.isMeta && e.text.trim() !== '') {
      const r = recommend(e.text)
      await update($, last, () => r)
      $.ui.status(`Recomendado: ${r.model} · ${r.effort}`)
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const r = await read($, last)
    if (e.props.hasSurvey || r === null) return next(e)
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box>
        <Text dimColor>Modelo recomendado: {line(r)}</Text>
      </Box>
    )
  })
}
