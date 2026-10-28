import type { Register } from 'claude-code'

const PANE = 'comandos'

type Cmd = { text: string; what: string }
type Group = { mod: string; cmds: Cmd[] }

// Al agregar un mod nuevo, agrega aquí sus comandos.
const GROUPS: Group[] = [
  {
    mod: '📝 Notas',
    cmds: [
      { text: '/notas', what: 'abre el panel de notas' },
      { text: '/nota ', what: 'guarda una nota rápida' },
    ],
  },
  {
    mod: '🔒 Modo privado',
    cmds: [
      { text: '/privado on', what: 'tapa datos sensibles' },
      { text: '/privado off', what: 'deja de taparlos' },
      { text: '/privado auto', what: 'solo con OBS abierto' },
    ],
  },
  {
    mod: '⏱️ Caché',
    cmds: [
      { text: '/cache 5m', what: 'la caché dura 5 minutos' },
      { text: '/cache 1h', what: 'la caché dura 1 hora' },
    ],
  },
  {
    mod: '🧠 Modelo',
    cmds: [{ text: '/modelo ', what: 'qué modelo y esfuerzo usar' }],
  },
  {
    mod: '☁️ GitHub',
    cmds: [
      { text: '/guardar', what: 'sube todo ahora' },
      { text: '/autoguardar on', what: 'sube solo al final de cada turno' },
      { text: '/autoguardar aviso', what: 'solo avisa' },
      { text: '/autoguardar off', what: 'apagado' },
    ],
  },
]

const KNOWN = ['notas', 'cache-timer', 'modo-privado', 'modelo-recomendado', 'autoguardado', 'comandos']

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
      description: 'Muestra o esconde el panel con tus comandos',
    })

    return next(e)
  })

  on('command.run', { command: 'comandos' }, async $ => {
    await toggle($)

    return { text: (await isOpen($)) ? 'Panel de comandos abierto.' : 'Panel de comandos escondido.' }
  })

  on('ui.close', async ($, e, next) => {
    const closed = await next(e)
    $.ui.invalidate('ui.render')

    return closed
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    // Comandos de otros mods que aún no estén en la tabla.
    const others = (await $.command.list()).filter(
      (c: any) => c.plugin !== undefined && !KNOWN.includes(c.plugin),
    )

    return (
      <Box flexDirection="column">
        <Text dimColor>Toca uno y se escribe en el cuadro de texto.</Text>
        {GROUPS.map(g => (
          <Box key={g.mod} flexDirection="column" marginTop={1}>
            <Text bold>{g.mod}</Text>
            {g.cmds.map(c => (
              <Box key={c.text}>
                <Button
                  key={`cmd-${c.text}`}
                  label={c.text.trim()}
                  onPress={() => $.prompt.fill({ text: c.text })}
                />
                <Text dimColor> {c.what}</Text>
              </Box>
            ))}
          </Box>
        ))}
        {others.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Text bold>🧩 Otros mods</Text>
            {others.map((c: any) => (
              <Box key={c.name}>
                <Button
                  key={`otro-${c.name}`}
                  label={`/${c.name}`}
                  onPress={() => $.prompt.fill({ text: `/${c.name} ` })}
                />
                <Text dimColor> {c.description}</Text>
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
          onPress={() => toggle($)}
        />
      </Box>
    )
  })
}
