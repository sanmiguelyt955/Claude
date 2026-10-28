import { expect, test } from 'claude-code/testing'

test('la tarjeta de /privado se dibuja en celular, escritorio y terminal', async $ => {
  for (const surface of ['mobile', 'desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({
      plugin: 'modo-privado',
      surface,
      component: 'CommandOutput',
      requestId: 'r1',
      props: { command: 'privado', args: '', text: '**1.** hola', isErrored: false },
    })
    expect((await ui.find({ type: 'Text', text: /Modo privado/ }))?.text).toContain('Modo privado')
    await ui.unmount()
  }
})
