import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Estado, Modo } from '../types'

const mode = atom({ plugin: 'autoguardado', key: 'mode' } as const, 'on' as Modo)
const estado = atom({ plugin: 'autoguardado', key: 'estado' } as const, null)

// Llaves reales en líneas añadidas: si aparece una, no se sube nada.
const SECRET =
  /^\+.*(?:sk-ant-[\w-]{8,}|\bsk-[\w-]{20,}|ghp_\w{20,}|github_pat_\w{20,}|xox[abprs]-[\w-]{10,}|AKIA[0-9A-Z]{16}|AIza[\w-]{30,}|hf_\w{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/m
const PROTECTED = ['main', 'master', 'HEAD']

async function git($: any, args: string[]) {
  return $.process.run(['git', ...args], { timeoutMs: 120_000 })
}

async function setEstado($: any, next: Estado) {
  await update($, estado, () => next)
  $.ui.status(next.kind === 'ok' ? `☁️ ${next.text}` : `⚠️ ${next.text}`)
  $.ui.invalidate('ui.render')
}

async function hora($: any) {
  const d = new Date(await $.clock.now())
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// Copia los mods de esta sesión a mods/ del repo, para que también se guarden.
async function syncMods($: any) {
  const parent = $.plugin.root.replace(/\/[^/]+\/?$/, '')
  await $.process.run(['mkdir', '-p', 'mods'])
  await $.process.run(['cp', '-r', `${parent}/.`, 'mods/'])
}

async function pushWithRetry($: any, branch: string) {
  let r = await git($, ['push', '-u', 'origin', branch])
  for (const wait of [2000, 4000, 8000, 16000]) {
    if (r.exitCode === 0) break
    await $.clock.sleep(wait)
    r = await git($, ['push', '-u', 'origin', branch])
  }
  return r
}

async function guardar($: any, isForced: boolean) {
  const m = await read($, mode)
  if (m === 'off' && !isForced) return

  const inRepo = await git($, ['rev-parse', '--is-inside-work-tree'])
  if (inRepo.exitCode !== 0) return

  await syncMods($)
  const status = await git($, ['status', '--porcelain'])
  const changed = status.stdout.split('\n').filter((l: string) => l.trim() !== '')
  const branch = (await git($, ['rev-parse', '--abbrev-ref', 'HEAD'])).stdout.trim()
  const ahead = await git($, ['rev-list', '--count', '@{u}..HEAD'])
  const unpushed = ahead.exitCode === 0 ? Number(ahead.stdout.trim()) : changed.length > 0 ? 1 : 0

  if (changed.length === 0 && unpushed === 0) {
    await setEstado($, { kind: 'ok', text: `todo en GitHub (${await hora($)})` })
    return
  }
  if (m === 'aviso' && !isForced) {
    await setEstado($, {
      kind: 'pendiente',
      text: `${changed.length} cambios sin subir: usa /guardar`,
    })
    return
  }
  if (PROTECTED.includes(branch)) {
    await setEstado($, {
      kind: 'error',
      text: `estás en ${branch}: no subo directo ahí, cambia a una rama`,
    })
    return
  }

  if (changed.length > 0) {
    await git($, ['add', '-A'])
    const diff = await git($, ['diff', '--cached', '-U0'])
    if (SECRET.test(diff.stdout)) {
      await git($, ['reset', '-q'])
      $.ui.toast('⚠️ Hay una llave secreta en los cambios: no subí nada')
      await setEstado($, { kind: 'error', text: 'llave secreta detectada: no se subió' })
      return
    }
    const files = changed.slice(0, 8).map((l: string) => `- ${l.slice(3)}`).join('\n')
    const more = changed.length > 8 ? `\n- y ${changed.length - 8} más` : ''
    const msg = `Autoguardado ${await hora($)}: ${changed.length} archivos\n\n${files}${more}`
    const c = await git($, ['commit', '-q', '-m', msg])
    if (c.exitCode !== 0) {
      await setEstado($, { kind: 'error', text: 'no se pudo hacer commit' })
      return
    }
  }

  const p = await pushWithRetry($, branch)
  if (p.exitCode !== 0) {
    $.ui.toast('⚠️ No se pudo subir a GitHub; reintento al terminar el próximo turno')
    await setEstado($, { kind: 'error', text: 'push falló: guardado local, sin subir' })
    return
  }
  await setEstado($, { kind: 'ok', text: `subido a GitHub (${await hora($)})` })
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
  let isBusy = false

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'guardar',
      description: 'Sube ahora todo a GitHub (commit y push)',
    })
    await $.command.register({
      name: 'autoguardar',
      description: 'Autoguardado: /autoguardar on (sube solo), aviso (solo avisa) u off',
    })

    return next(e)
  })

  on('command.run', { command: 'guardar' }, async $ => {
    if (isBusy) return { text: 'Ya estoy guardando, espera un momento.' }
    isBusy = true
    try {
      await guardar($, true)
    } finally {
      isBusy = false
    }
    const now = await read($, estado)

    return { text: now ? now.text : 'Listo.' }
  })

  on('command.run', { command: 'autoguardar' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg !== 'on' && arg !== 'aviso' && arg !== 'off') {
      return { text: 'Uso: /autoguardar on | aviso | off' }
    }
    await update($, mode, () => arg as Modo)

    return { text: `Autoguardado: ${arg}.` }
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId === undefined && !isBusy) {
      isBusy = true
      void guardar($, false).finally(() => {
        isBusy = false
      })
    }

    return done
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const now = await read($, estado)
    if (e.props.hasSurvey || now === null || now.kind === 'ok') return next(e)
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box>
        <Text color={now.kind === 'error' ? 'red' : 'yellow'}>⚠️ GitHub: {now.text}</Text>
      </Box>
    )
  })

  on('ui.render', { component: 'CommandOutput' }, async ($, e, next) => {
    if ((e.props.command !== 'guardar' && e.props.command !== 'autoguardar') || e.props.isErrored) {
      return next(e)
    }
    const ui = $.ui.resolve(e)
    const { Text } = ui
    const now = await read($, estado)
    const m = await read($, mode)
    const accent = now === null || now.kind === 'ok' ? 'success' : now.kind === 'error' ? 'error' : 'warning'
    const label = { on: 'sube solo al final de cada turno', aviso: 'solo avisa', off: 'apagado' }[m]

    return card(ui, {
      icon: '☁️',
      title: 'GitHub',
      accent,
      hint: `Autoguardado: ${label}`,
      body: <Text weight="semibold" bold color={accent}>{e.props.text}</Text>,
    })
  })
}
