export type Modo = 'on' | 'off' | 'auto'

declare module 'claude-code' {
  interface PluginState {
    'modo-privado': { mode: Modo; isObsOpen: boolean }
  }
}
