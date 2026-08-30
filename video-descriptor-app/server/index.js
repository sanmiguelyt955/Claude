const express = require('express');
const path = require('path');
const buildUploadRouter = require('./routes/upload');

const PORT = process.env.PORT || 4501;

const app = express();
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api', buildUploadRouter());

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

const server = app.listen(PORT, () => {
  console.log(`\n🎬 Video Descriptor corriendo en http://localhost:${PORT}`);
  console.log('Deja esta ventana abierta mientras uses la app. Ciérrala para apagarla.\n');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`\n⚠️  El puerto ${PORT} ya está en uso.`);
    console.log('Esto casi siempre significa que la app YA está corriendo en otra ventana —');
    console.log(`abre http://localhost:${PORT} en tu navegador en vez de iniciar otra copia.\n`);
    process.exit(1);
  }
  console.error('\n❌ Error al iniciar el servidor:', err.message, '\n');
  process.exit(1);
});

server.requestTimeout = 0;
server.headersTimeout = 0;
server.timeout = 0;
