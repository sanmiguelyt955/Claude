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

  on('command.run', { command: 'notas' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Notas' })

    return { text: 'Panel de notas abierto.' }
  })

  on('command.run', { command: 'nota' }, async ($, e) => {
    if (e.args.trim() === '') return { text: 'Uso: /nota texto de la nota' }
    await add($, e.args)

    return { text: 'Nota guardada.' }
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
}
