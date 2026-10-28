import type { Register } from 'claude-code'

const PANE = 'comandos'

type Cmd = { text: string; what: string }
type Group = { icon: string; mod: string; accent: string; cmds: Cmd[] }

// Al agregar un mod nuevo, agrega aquí sus comandos. Un comando que termina en
// espacio necesita texto después y no lleva botón.
const GROUPS: Group[] = [
  {
    icon: '📝',
    mod: 'Notas',
    accent: 'suggestion',
    cmds: [
      { text: '/notas', what: 'Ver tus notas' },
      { text: '/nota ', what: 'Guardar una nota: /nota texto' },
    ],
  },
  {
    icon: '🔒',
    mod: 'Modo privado',
    accent: 'success',
    cmds: [
      { text: '/privado', what: 'Ver si está activo' },
      { text: '/privado on', what: 'Tapar datos sensibles' },
      { text: '/privado off', what: 'Dejar de taparlos' },
      { text: '/privado auto', what: 'Solo con OBS abierto' },
    ],
  },
  {
    icon: '⏱️',
    mod: 'Caché',
    accent: 'warning',
    cmds: [
      { text: '/cache', what: 'Cuánto falta para que se enfríe' },
      { text: '/cache 5m', what: 'Dura 5 minutos' },
      { text: '/cache 1h', what: 'Dura 1 hora' },
    ],
  },
  {
    icon: '🧠',
    mod: 'Modelo',
    accent: 'planMode',
    cmds: [{ text: '/modelo ', what: 'Qué modelo usar: /modelo tu pregunta' }],
  },
  {
    icon: '☁️',
    mod: 'GitHub',
    accent: 'ide',
    cmds: [
      { text: '/guardar', what: 'Subir todo ahora' },
      { text: '/autoguardar on', what: 'Subir solo al final de cada turno' },
      { text: '/autoguardar aviso', what: 'Solo avisar' },
      { text: '/autoguardar off', what: 'Apagar' },
    ],
  },
]

const KNOWN = ['notas', 'cache-timer', 'modo-privado', 'modelo-recomendado', 'autoguardado', 'comandos']

// El texto que queda guardado en el chat (y el que se ve si la tarjeta no se dibuja).
function markdown() {
  return GROUPS.map(
    g => `**${g.icon} ${g.mod}**\n${g.cmds.map(c => `- \`${c.text.trim()}\` · ${c.what}`).join('\n')}`,
  ).join('\n\n')
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

function runCommand($: any, text: string) {
  const [command, ...rest] = text.slice(1).split(' ')
  void $.command.run({ command, args: rest.join(' ') })
}

function section(ui: any, $: any, g: Group, isPane: boolean) {
  const { Box, Button, Text } = ui

  return (
    <Box key={g.mod} flexDirection="column" gap="xs" marginTop={1}>
      <Text size="caption" weight="semibold" bold color={g.accent}>
        {g.icon} {g.mod.toUpperCase()}
      </Text>
      {g.cmds.map(c => {
        const needsText = c.text.endsWith(' ')

        return (
          <Box key={c.text} flexDirection="column">
            {needsText && !isPane ? (
              <Text mono color="suggestion">
                {c.text.trim()} …
              </Text>
            ) : (
              <Button
                key={`run-${c.text}`}
                label={needsText ? `✎ ${c.text.trim()} …` : `▶ ${c.text}`}
                variant="secondary"
                onPress={() =>
                  needsText ? $.prompt.fill({ text: c.text }) : runCommand($, c.text)
                }
              />
            )}
            <Text size="footnote" color="subtle">
              {c.what}
            </Text>
          </Box>
        )
      })}
    </Box>
  )
}

async function isOpen($: any) {
  const panes = await $.ui.panes()
  return panes.some((p: any) => p.id === PANE)
}

async function toggle($: any) {
  if (await isOpen($)) {
    await $.ui.close({ id: PANE })
  } else {
    await $.ui.open({ id: PANE, title: 'Comandos' })
  }
  $.ui.invalidate('ui.render')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'comandos',
      description: 'Tus comandos en una tarjeta; /comandos panel abre el panel lateral',
    })

    return next(e)
  })

  on('command.run', { command: 'comandos' }, async ($, e) => {
    if (e.args.trim() === 'panel') {
      await toggle($)
      return { text: (await isOpen($)) ? 'Panel de comandos abierto.' : 'Panel de comandos escondido.' }
    }

    return { text: markdown() }
  })

  // La respuesta de /comandos en el chat: se ve en el celular y en computadora.
  on('ui.render', { component: 'CommandOutput' }, async ($, e, next) => {
    if (e.props.command !== 'comandos' || e.props.isErrored || e.props.args.trim() !== '') {
      return next(e)
    }
    const ui = $.ui.resolve(e)

    return card(ui, {
      icon: '📋',
      title: 'Tus comandos',
      accent: 'claude',
      hint: 'Toca ▶ para ejecutar. Los que llevan … necesitan texto después.',
      body: GROUPS.map(g => section(ui, $, g, false)),
    })
  })

  on('ui.close', async ($, e, next) => {
    const closed = await next(e)
    $.ui.invalidate('ui.render')

    return closed
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Button, Text } = ui
    // Comandos de otros mods que aún no estén en la lista.
    const others = (await $.command.list()).filter(
      (c: any) => c.plugin !== undefined && !KNOWN.includes(c.plugin),
    )

    return (
      <Box flexDirection="column" gap="xs">
        <Text size="footnote" color="subtle" italic>
          ▶ ejecuta · ✎ lo escribe para que lo completes
        </Text>
        {GROUPS.map(g => section(ui, $, g, true))}
        {others.length > 0 && (
          <Box flexDirection="column" gap="xs" marginTop={1}>
            <Text size="caption" weight="semibold" bold color="merged">
              🧩 OTROS MODS
            </Text>
            {others.map((c: any) => (
              <Box key={c.name} flexDirection="column">
                <Button
                  key={`otro-${c.name}`}
                  label={`✎ /${c.name}`}
                  variant="secondary"
                  onPress={() => $.prompt.fill({ text: `/${c.name} ` })}
                />
                <Text size="footnote" color="subtle">
                  {c.description}
                </Text>
              </Box>
            ))}
          </Box>
        )}
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const { Box, Button } = $.ui.resolve(e)
    const open = await isOpen($)

    return (
      <Box>
        <Button
          key="toggle"
          label={open ? '✕ Ocultar comandos' : '📋 Comandos'}
          variant="secondary"
          onPress={() => toggle($)}
        />
      </Box>
    )
  })
}
