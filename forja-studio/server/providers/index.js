const { createMockProvider } = require('./mock');
const { createFalProvider } = require('./fal');
const { createKieProvider } = require('./kie');

// PROVIDER explícito, o el primero con clave configurada, o mock.
function selectProvider(env, { filesDir }) {
  const name = env.PROVIDER || (env.FAL_KEY ? 'fal' : env.KIE_API_KEY ? 'kie' : 'mock');
  if (name === 'fal') {
    if (!env.FAL_KEY) throw new Error('PROVIDER=fal requiere FAL_KEY');
    return createFalProvider({ apiKey: env.FAL_KEY });
  }
  if (name === 'kie') {
    if (!env.KIE_API_KEY) throw new Error('PROVIDER=kie requiere KIE_API_KEY');
    return createKieProvider({ apiKey: env.KIE_API_KEY });
  }
  if (name === 'mock') return createMockProvider({ filesDir, delayMs: Number(env.MOCK_DELAY_MS || 2500) });
  throw new Error(`Proveedor desconocido: ${name}`);
}

module.exports = { selectProvider };
