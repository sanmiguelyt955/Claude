export type Nota = { id: string; text: string }

declare module 'claude-code' {
  interface PluginState {
    notas: { items: Shaped<Nota[]> }
  }
}
