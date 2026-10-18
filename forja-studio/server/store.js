// Persistencia mínima en un archivo JSON (escritura atómica con rename).
// Suficiente para un solo nodo; para producción, cambiar por Postgres/SQLite.
const fs = require('fs');
const path = require('path');

function createStore(dataDir, { initialCredits = 500 } = {}) {
  fs.mkdirSync(path.join(dataDir, 'files'), { recursive: true });
  const dbPath = path.join(dataDir, 'db.json');

  let db = { user: { id: 'local', credits: initialCredits }, media: {}, jobs: {} };
  if (fs.existsSync(dbPath)) {
    db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  }

  let timer = null;
  function flush() {
    timer = null;
    const tmp = dbPath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, dbPath);
  }
  function save() {
    if (!timer) timer = setTimeout(flush, 50);
  }

  return {
    db,
    save,
    flush() {
      if (timer) clearTimeout(timer);
      flush();
    },
    filesDir: path.join(dataDir, 'files'),
  };
}

module.exports = { createStore };
