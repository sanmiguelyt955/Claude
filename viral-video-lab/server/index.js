const express = require('express');
const path = require('path');
const os = require('os');

const store = require('./lib/store');
const buildVideosRouter = require('./routes/videos');
const buildAnalyzeRouter = require('./routes/analyze');
const buildStructureRouter = require('./routes/structure');
const buildPatternsRouter = require('./routes/patterns');
const buildScriptRouter = require('./routes/script');
const buildLessonsRouter = require('./routes/lessons');

const PORT = process.env.PORT || 4500;

// Carpetas que se escanean por defecto al abrir la app, una por sección. Ajusta aquí
// si mueves tus videos fuente a otro lugar. "viral" son clips cortos ganadores para
// clonar su estructura; "aprendizaje" son videos largos de YouTube de los que se
// extraen lecciones/técnicas (no tienen que cumplir el algoritmo viral).
const DEFAULT_FOLDERS = {
  viral: [],
  aprendizaje: [
    path.join('C:', 'Users', 'Sanmi', 'OneDrive', 'Documentos', 'Dropshipping', 'Videos de youtube cortados en partes para crear skills'),
  ],
};

const app = express();

// Body-size limits apply only to small JSON payloads (structure, script prompts,
// path registration) - actual video bytes never go through this parser, so nothing
// here caps video size. Upload uses busboy directly on the raw request stream.
app.use(express.json({ limit: '2mb' }));

app.use('/library', express.static(store.LIBRARY_DIR));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api', buildVideosRouter({ defaultFolders: DEFAULT_FOLDERS }));
app.use('/api', buildAnalyzeRouter());
app.use('/api', buildStructureRouter());
app.use('/api', buildPatternsRouter());
app.use('/api', buildScriptRouter());
app.use('/api', buildLessonsRouter());

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

const server = app.listen(PORT, () => {
  console.log(`\nViral Video Lab corriendo en http://localhost:${PORT}\n`);
  console.log(`PATTERN_LIBRARY.json: ${path.join(os.homedir(), '.claude', 'PATTERN_LIBRARY.json')}`);
  console.log(`Carpeta por defecto (aprendizaje): ${DEFAULT_FOLDERS.aprendizaje[0]}\n`);
});

// No request/header/socket timeouts - a 24h video streamed for playback or a very
// long ffmpeg analysis job must never be cut off by a default Node timeout.
server.requestTimeout = 0;
server.headersTimeout = 0;
server.timeout = 0;
