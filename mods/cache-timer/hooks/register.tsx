import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

const lastAt = atom({ plugin: 'cache-timer', key: 'lastAt' } as const, null)
const ttlMs = atom({ plugin: 'cache-timer', key: 'ttlMs' } as const, 5 * 60_000)

const clock = (ms: number) => {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(total / 60)
  const s = String(total % 60).padStart(2, '0')
  return `${m}:${s}`
}

export const register: Register = on => {
  let warned = false

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'cache',
      description: 'Duración de la caché del timer: /cache 5m o /cache 1h',
    })
    $.clock.every(1000, async () => {
      const at = await read($, lastAt)
      if (at === null) return
      const left = at + (await read($, ttlMs)) - (await $.clock.now())
      if (left <= 60_000 && left > 0 && !warned) {
        warned = true
        $.ui.toast('La caché se enfría en menos de 1 minuto')
      }
      $.ui.invalidate('ui.render')
    })

    return next(e)
  })

  on('command.run', { command: 'cache' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg !== '5m' && arg !== '1h') {
      return { text: 'Uso: /cache 5m  o  /cache 1h' }
    }
    await update($, ttlMs, () => (arg === '1h' ? 60 * 60_000 : 5 * 60_000))

    return { text: `Timer de caché en ${arg}.` }
  })

  // Cada turno que llega a la API renueva la caché.
  on('turn.complete', async ($, e, next) => {
    warned = false
    const now = await $.clock.now()
    await update($, lastAt, () => now)

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const at = await read($, lastAt)
    if (e.props.hasSurvey || at === null) return next(e)

    const left = at + (await read($, ttlMs)) - (await $.clock.now())
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box>
        {left > 0 ? (
          <Text dimColor={left > 60_000} color={left > 60_000 ? undefined : 'yellow'}>
            Caché: se enfría en {clock(left)}
          </Text>
        ) : (
          <Text color="red">Caché fría: el próximo mensaje la vuelve a escribir</Text>
        )}
      </Box>
    )
  })
}
