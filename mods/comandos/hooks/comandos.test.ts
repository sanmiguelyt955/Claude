import { expect, test } from 'claude-code/testing'

test('/comandos lista la tabla en el chat', async ($, on) => {
  on('command.register', () => ({ value: { command: 'comandos' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'mobile', isInteractive: true })

  const r = await $.command.run({ command: 'comandos', args: '' })
  expect(r.text).toContain('/notas')
  expect(r.text).toContain('/privado on')
  expect(r.text).toContain('/guardar')
})
