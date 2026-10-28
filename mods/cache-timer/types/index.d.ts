declare module 'claude-code' {
  interface PluginState {
    'cache-timer': { lastAt: number | null; ttlMs: number }
  }
}
