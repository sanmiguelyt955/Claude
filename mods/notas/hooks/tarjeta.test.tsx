import { expect, test } from 'claude-code/testing'

test('la tarjeta de /notas se dibuja en celular, escritorio y terminal', async $ => {
  for (const surface of ['mobile', 'desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({
      plugin: 'notas',
      surface,
      component: 'CommandOutput',
      requestId: 'r1',
      props: { command: 'notas', args: '', text: '**1.** hola', isErrored: false },
    })
    expect((await ui.find({ type: 'Text', text: /Notas/ }))?.text).toContain('Notas')
    await ui.unmount()
  }
})
