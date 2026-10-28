import { expect, test } from 'claude-code/testing'

const OUTPUT = {
  plugin: 'comandos',
  component: 'CommandOutput',
  requestId: 'r1',
  props: { command: 'comandos', args: '', text: 'x', isErrored: false },
} as const

test('/comandos devuelve la lista como texto', async ($, on) => {
  on('command.register', () => ({ value: { command: 'comandos' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'mobile', isInteractive: true })

  const r = await $.command.run({ command: 'comandos', args: '' })
  expect(r.text).toContain('`/notas`')
  expect(r.text).toContain('`/guardar`')
})

test('la tarjeta se dibuja en celular, escritorio y terminal', async $ => {
  for (const surface of ['mobile', 'desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ ...OUTPUT, surface })
    expect((await ui.find({ type: 'Text', text: /Tus comandos/ }))?.text).toContain('Tus comandos')
    expect(await ui.find({ type: 'Button', key: 'run-/guardar' })).toBeDefined()
    await ui.unmount()
  }
})

test('tocar ▶ ejecuta el comando', async ($, on) => {
  const ran: string[] = []
  on('command.run', (_, e) => {
    ran.push(`${e.command} ${e.args}`.trim())
    return { text: 'ok' }
  })
  const ui = await $.ui.mount({ ...OUTPUT, surface: 'mobile' })
  await ui.press({ key: 'run-/privado on' })
  await ui.press({ key: 'run-/guardar' })
  await ui.unmount()
  expect(ran).toEqual(['privado on', 'guardar'])
})
