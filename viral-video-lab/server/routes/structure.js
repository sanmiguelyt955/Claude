const express = require('express');
const path = require('path');
const store = require('../lib/store');
const rules = require('../lib/rules');
const { matchPatterns } = require('../lib/patternMatch');

const PATTERN_LIBRARY_PATH = path.join(require('os').homedir(), '.claude', 'PATTERN_LIBRARY.json');

function structurePath(videoId) {
  return path.join(store.videoDir(videoId), 'structure.json');
}

function frameIndexPath(videoId) {
  return path.join(store.videoDir(videoId), 'frame_index.json');
}

function reportPath(videoId) {
  return path.join(store.videoDir(videoId), 'report.json');
}

// Fills in the derived fields (duracion, porcentaje) for each segment so the saved
// structure.json has the same shape as an entry in PATTERN_LIBRARY.json.
function enrichStructure(structure) {
  const total = structure.duracion_segundos;
  const segments = (structure.segments || []).map((s) => ({
    ...s,
    duracion: Math.round((s.fin - s.inicio) * 100) / 100,
    porcentaje: total ? Math.round(((s.fin - s.inicio) / total) * 1000) / 10 : null,
  }));
  return { ...structure, segments };
}

module.exports = function buildStructureRouter() {
  const router = express.Router();

  router.get('/videos/:id/structure', (req, res) => {
    const structure = store.readJSON(structurePath(req.params.id), null);
    if (!structure) return res.status(404).json({ error: 'Este video todavía no tiene una estructura guardada.' });
    res.json(structure);
  });

  router.put('/videos/:id/structure', (req, res) => {
    const video = store.getVideo(req.params.id);
    if (!video) return res.status(404).json({ error: 'Video no encontrado' });
    const structure = enrichStructure({ video_id: video.id, ...req.body });
    store.writeJSON(structurePath(video.id), structure);
    res.json(structure);
  });

  router.post('/videos/:id/validate', (req, res) => {
    const structure = store.readJSON(structurePath(req.params.id), null);
    if (!structure) return res.status(400).json({ error: 'Guarda primero una estructura para este video.' });
    const frameIndex = store.readJSON(frameIndexPath(req.params.id), null);
    const validation = rules.validate(structure, frameIndex);
    const report = store.readJSON(reportPath(req.params.id), {});
    store.writeJSON(reportPath(req.params.id), { ...report, validation, validated_at: Date.now() });
    res.json(validation);
  });

  router.get('/videos/:id/pattern-match', (req, res) => {
    const structure = store.readJSON(structurePath(req.params.id), null);
    if (!structure) return res.status(400).json({ error: 'Guarda primero una estructura para este video.' });
    const library = store.readJSON(PATTERN_LIBRARY_PATH, { patrones: [] });
    const match = matchPatterns(structure, library);
    const report = store.readJSON(reportPath(req.params.id), {});
    store.writeJSON(reportPath(req.params.id), { ...report, pattern_match: match, matched_at: Date.now() });
    res.json(match);
  });

  router.get('/videos/:id/report', (req, res) => {
    const video = store.getVideo(req.params.id);
    const structure = store.readJSON(structurePath(req.params.id), null);
    const report = store.readJSON(reportPath(req.params.id), null);
    if (!video || !structure) return res.status(404).json({ error: 'No hay estructura guardada para este video todavía.' });
    res.json({ video, structure, ...report });
  });

  return router;
};
