import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Modo } from '../types'

const mode = atom({ plugin: 'modo-privado', key: 'mode' } as const, 'on' as Modo)
const isObsOpen = atom({ plugin: 'modo-privado', key: 'isObsOpen' } as const, false)

// Orden importa: lo más específico primero.
const RULES: Array<[RegExp, string]> = [
  [/\b(?:sk-ant-|sk-|ghp_|gho_|github_pat_|xox[abprs]-|AKIA|AIza|hf_|r8_)[A-Za-z0-9_\-]{8,}/g, '🔑 ••••••••'],
  [/\bBearer\s+[A-Za-z0-9._\-]{12,}/g, 'Bearer 🔑 ••••••••'],
  [/\b[A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD)\s*=\s*\S+/g, m => `${m.split('=')[0]}=🔑 ••••••••`] as unknown as [RegExp, string],
  [/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '✉ ••••@••••'],
  [/\b\d(?:[ -]?\d){12,18}\b/g, '💳 •••• •••• •••• ••••'],
  [/\b[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d\b/g, 'CURP ••••••••'],
  [/\b[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}\b/g, 'RFC ••••••••'],
  [/(?<!\d)(?:\+\d{1,3}[ .-]?)?(?:\(?\d{2,3}\)?[ .-]?)\d{3,4}[ .-]?\d{4}(?!\d)/g, '📞 ••••••••'],
]

export const mask = (text: string): string => {
  let out = text
  for (const [re, to] of RULES) {
    out = out.replace(re, to as any)
  }
  return out
}

async function isActive($: any) {
  const m = await read($, mode)
  return m === 'on' || (m === 'auto' && (await read($, isObsOpen)))
}

async function refreshObs($: any) {
  try {
    const r = await $.process.run(['pgrep', '-ix', 'obs|obs64|obs-studio'])
    const open = r.exitCode === 0
    if (open !== (await read($, isObsOpen))) {
      await update($, isObsOpen, () => open)
      $.ui.invalidate('ui.render')
    }
  } catch {
    // Sin acceso a procesos (p. ej. sesión en la nube): auto no detecta OBS.
  }
}

// Una tarjeta: borde redondeado del color del mod, título y una pista abajo.
function card(ui: any, c: { icon: string; title: string; accent: string; hint?: string; body: any }) {
  const { Box, Text } = ui

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={c.accent} paddingX={1} gap="xs">
      <Text size="heading" weight="semibold" bold color={c.accent}>
        {c.icon} {c.title}
      </Text>
      {c.body}
      {c.hint !== undefined && (
        <Text size="footnote" color="subtle" italic>
          {c.hint}
        </Text>
      )}
    </Box>
  )
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'privado',
      description: 'Modo privado: /privado on, /privado off o /privado auto (solo con OBS abierto)',
    })
    void refreshObs($)
    $.clock.every(5000, () => void refreshObs($))

    return next(e)
  })

  on('command.run', { command: 'privado' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === '') {
      return { text: `Modo privado: ${await read($, mode)} (${(await isActive($)) ? '🔒 tapando ahora' : 'sin tapar ahora'}).` }
    }
    if (arg !== 'on' && arg !== 'off' && arg !== 'auto') {
      return { text: 'Uso: /privado on | off | auto' }
    }
    await update($, mode, () => arg as Modo)
    $.ui.toast(`🔒 Modo privado: ${arg}`)
    $.ui.invalidate('ui.render')

    return { text: `Modo privado: **${arg}**.` }
  })

  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    if (!(await isActive($))) return next(e)

    return next({ ...e, props: { ...e.props, text: mask(e.props.text) } })
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (!(await isActive($))) return next(e)

    return next({ ...e, props: { ...e.props, text: mask(e.props.text) } })
  })

  on('ui.render', { component: 'CommandOutput' }, async ($, e, next) => {
    if (!(await isActive($))) return next(e)

    return next({ ...e, props: { ...e.props, text: mask(e.props.text) } })
  })

  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    const out = e.props.output as any
    if (!(await isActive($)) || out === null || typeof out !== 'object') return next(e)
    const clean = { ...out }
    for (const k of ['stdout', 'stderr']) {
      if (typeof clean[k] === 'string') clean[k] = mask(clean[k])
    }

    return next({ ...e, props: { ...e.props, output: clean } })
  })

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const input = e.props.input as any
    if (!(await isActive($)) || input === null || typeof input !== 'object') return next(e)
    const clean = { ...input }
    if (typeof clean.command === 'string') clean.command = mask(clean.command)

    return next({ ...e, props: { ...e.props, input: clean } })
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || !(await isActive($))) return next(e)
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box>
        <Text color="green">🔒 privado</Text>
      </Box>
    )
  })

  on('ui.render', { component: 'CommandOutput' }, async ($, e, next) => {
    if (e.props.command !== 'privado' || e.props.isErrored) return next(e)
    const ui = $.ui.resolve(e)
    const { Text } = ui
    const m = await read($, mode)
    const active = await isActive($)
    const label = { on: 'Siempre activo', off: 'Apagado', auto: 'Solo con OBS abierto' }[m]

    return card(ui, {
      icon: active ? '🔒' : '🔓',
      title: 'Modo privado',
      accent: active ? 'success' : 'subtle',
      hint: 'Tapa llaves, correos, teléfonos, tarjetas, CURP y RFC en pantalla',
      body: [
        <Text key="estado" size="title" weight="bold" bold color={active ? 'success' : 'subtle'}>
          {active ? 'Tapando ahora' : 'Sin tapar'}
        </Text>,
        <Text key="modo" color="subtle">
          Modo: {label}
        </Text>,
      ],
    })
  })
}
