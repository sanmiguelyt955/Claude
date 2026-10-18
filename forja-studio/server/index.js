const path = require('path');
const { createStore } = require('./store');
const { selectProvider } = require('./providers');
const { createJobService } = require('./jobs');
const { createApp } = require('./app');

const env = process.env;
const dataDir = env.DATA_DIR || path.join(__dirname, '..', 'data');
const store = createStore(dataDir, { initialCredits: Number(env.INITIAL_CREDITS || 500) });
const provider = selectProvider(env, { filesDir: store.filesDir });
const jobs = createJobService({
  store,
  provider,
  concurrency: Number(env.CONCURRENCY || 2),
  publicBaseUrl: env.PUBLIC_BASE_URL || '',
});
const app = createApp({ store, jobs, provider, apiToken: env.API_TOKEN || '', maxUploadMb: Number(env.MAX_UPLOAD_MB || 100) });

jobs.start();
const port = Number(env.PORT || 4600);
app.listen(port, () => {
  console.log(`Forja Studio en http://localhost:${port} · proveedor: ${provider.name}`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    jobs.stop();
    store.flush();
    process.exit(0);
  });
}
