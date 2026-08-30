const express = require('express');
const path = require('path');
const store = require('../lib/store');

const PATTERN_LIBRARY_PATH = path.join(require('os').homedir(), '.claude', 'PATTERN_LIBRARY.json');

module.exports = function buildPatternsRouter() {
  const router = express.Router();

  // Read-only on purpose: the app never writes to PATTERN_LIBRARY.json. New patterns
  // only get added by pattern-manager (via agente-lider) in chat, after you've
  // confirmed a structure genuinely represents a new content type - keeping this one
  // file as the single source of truth shared with your skills.
  router.get('/patterns', (req, res) => {
    const library = store.readJSON(PATTERN_LIBRARY_PATH, null);
    if (!library) {
      return res.status(404).json({ error: `No se encontró PATTERN_LIBRARY.json en ${PATTERN_LIBRARY_PATH}` });
    }
    res.json({ ...library, _source: PATTERN_LIBRARY_PATH });
  });

  return router;
};
