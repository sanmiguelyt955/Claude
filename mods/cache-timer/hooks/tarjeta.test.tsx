import { expect, test } from 'claude-code/testing'

test('la tarjeta de /cache se dibuja en celular, escritorio y terminal', async $ => {
  for (const surface of ['mobile', 'desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({
      plugin: 'cache-timer',
      surface,
      component: 'CommandOutput',
      requestId: 'r1',
      props: { command: 'cache', args: '', text: '**1.** hola', isErrored: false },
    })
    expect((await ui.find({ type: 'Text', text: /Caché/ }))?.text).toContain('Caché')
    await ui.unmount()
  }
})
