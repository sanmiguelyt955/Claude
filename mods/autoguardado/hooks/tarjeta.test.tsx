import { expect, test } from 'claude-code/testing'

test('la tarjeta de /guardar se dibuja en celular, escritorio y terminal', async $ => {
  for (const surface of ['mobile', 'desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({
      plugin: 'autoguardado',
      surface,
      component: 'CommandOutput',
      requestId: 'r1',
      props: { command: 'guardar', args: '', text: '**1.** hola', isErrored: false },
    })
    expect((await ui.find({ type: 'Text', text: /GitHub/ }))?.text).toContain('GitHub')
    await ui.unmount()
  }
})
