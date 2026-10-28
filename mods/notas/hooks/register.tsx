import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Nota } from '../types'

const PANE = 'notas'
const STORE = 'notas'
// Cambia la etiqueta si cambian los campos de una nota.
const items = atom({ plugin: 'notas', key: 'items' } as const, [], {
  shape: 'notas-1',
})

async function save($: any, list: Nota[]) {
  await $.store.set(STORE, list)
}

async function add($: any, text: string) {
  const clean = text.trim()
  if (clean === '') return
  const id = String(await $.clock.now())
  await update($, items, list => {
    const next = [...list, { id, text: clean } as Nota]
    void save($, next)
    return next
  })
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
    const saved = await $.store.get(STORE)
    if (Array.isArray(saved) && (await read($, items)).length === 0) {
      await update($, items, () => saved as Nota[])
    }
    await $.command.register({ name: 'notas', description: 'Abre el panel de notas' })
    await $.command.register({
      name: 'nota',
      description: 'Agrega una nota rápida: /nota texto',
    })
    void $.ui.open({ id: PANE, title: 'Notas' })

    return next(e)
  })

  // En el celular no hay panel ni campo de texto: las notas salen en el chat.
  on('command.run', { command: 'notas' }, async ($, e) => {
    const arg = e.args.trim()
    const list = await read($, items)
    if (arg.startsWith('borrar')) {
      const n = Number(arg.split(/\s+/)[1])
      if (!Number.isInteger(n) || n < 1 || n > list.length) {
        return { text: 'Uso: /notas borrar <número>' }
      }
      const next = list.filter((_, i) => i !== n - 1)
      await update($, items, () => next)
      await save($, next)
      return { text: `✓ Nota ${n} borrada.` }
    }
    void $.ui.open({ id: PANE, title: 'Notas' })
    if (list.length === 0) return { text: '_Aún no hay notas._' }

    return {
      text: list.map((n, i) => `**${i + 1}.** ${n.text}`).join('\n\n'),
    }
  })

  on('command.run', { command: 'nota' }, async ($, e) => {
    if (e.args.trim() === '') return { text: 'Uso: /nota texto de la nota' }
    await add($, e.args)

    return { text: `✓ Guardada: _${e.args.trim()}_` }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Input, Text } = $.ui.resolve(e)
    const list = await read($, items)
    const room = Math.max(1, (e.viewport?.rows ?? 24) - 6)

    return (
      <Box flexDirection="column">
        <Input
          key="nueva"
          label="Nota: "
          placeholder="escribe y pulsa Enter"
          submitLabel="guardar"
          onSubmit={value => add($, value)}
        />
        {list.length === 0 && <Text dimColor>Aún no hay notas.</Text>}
        {list.slice(-room).map(nota => (
          <Box key={nota.id}>
            <Text>• {nota.text} </Text>
            <Button
              key={`del-${nota.id}`}
              label="borrar"
              onPress={() =>
                update($, items, all => {
                  const next = all.filter(one => one.id !== nota.id)
                  void save($, next)
                  return next
                })
              }
            />
          </Box>
        ))}
        {list.length > 0 && (
          <Button
            key="todo"
            label="Borrar todo"
            onPress={() =>
              update($, items, () => {
                void save($, [])
                return []
              })
            }
          />
        )}
      </Box>
    )
  })

  on('ui.render', { component: 'CommandOutput' }, async ($, e, next) => {
    if ((e.props.command !== 'notas' && e.props.command !== 'nota') || e.props.isErrored) {
      return next(e)
    }
    const ui = $.ui.resolve(e)
    const { Markdown } = ui

    return card(ui, {
      icon: '📝',
      title: 'Notas',
      accent: 'suggestion',
      hint: 'Agrega con /nota texto · borra con /notas borrar 2',
      body: <Markdown text={e.props.text} />,
    })
  })
}
