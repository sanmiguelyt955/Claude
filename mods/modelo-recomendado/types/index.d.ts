export type Reco = { model: string; effort: string; why: string }

declare module 'claude-code' {
  interface PluginState {
    'modelo-recomendado': { last: Reco | null }
  }
}
