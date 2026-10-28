import { expect, test } from 'claude-code/testing'

test('la tarjeta de /modelo se dibuja en celular, escritorio y terminal', async $ => {
  for (const surface of ['mobile', 'desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({
      plugin: 'modelo-recomendado',
      surface,
      component: 'CommandOutput',
      requestId: 'r1',
      props: { command: 'modelo', args: 'hay un bug en mi app', text: '**1.** hola', isErrored: false },
    })
    expect((await ui.find({ type: 'Text', text: /Modelo recomendado/ }))?.text).toContain('Modelo recomendado')
    await ui.unmount()
  }
})
