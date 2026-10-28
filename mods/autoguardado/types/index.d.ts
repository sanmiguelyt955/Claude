export type Modo = 'on' | 'aviso' | 'off'
export type Estado = { kind: 'ok' | 'pendiente' | 'error'; text: string }

declare module 'claude-code' {
  interface PluginState {
    autoguardado: { mode: Modo; estado: Estado | null }
  }
}
