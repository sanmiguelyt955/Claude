const express = require('express');
const path = require('path');
const store = require('../lib/store');

function lessonsPath(videoId) {
  return path.join(store.videoDir(videoId), 'lessons.json');
}

// Modo Aprendizaje: no hay reglas fijas que validar aquí (a diferencia del algoritmo
// viral) - esto es solo almacenamiento estructurado de lo que el usuario (o Claude,
// viendo las miniaturas) identificó como valioso en un video educativo.
module.exports = function buildLessonsRouter() {
  const router = express.Router();

  router.get('/videos/:id/lessons', (req, res) => {
    const lessons = store.readJSON(lessonsPath(req.params.id), null);
    if (!lessons) return res.status(404).json({ error: 'Este video todavía no tiene notas guardadas.' });
    res.json(lessons);
  });

  router.put('/videos/:id/lessons', (req, res) => {
    const video = store.getVideo(req.params.id);
    if (!video) return res.status(404).json({ error: 'Video no encontrado' });
    const lessons = {
      video_id: video.id,
      tema_principal: req.body?.tema_principal || '',
      fuente: req.body?.fuente || '',
      resumen_ejecutivo: req.body?.resumen_ejecutivo || '',
      notas: (req.body?.notas || []).map((n) => ({
        tipo: n.tipo || 'otro',
        timestamp: n.timestamp === '' || n.timestamp == null ? null : Number(n.timestamp),
        titulo: n.titulo || '',
        contenido: n.contenido || '',
      })),
      saved_at: Date.now(),
    };
    store.writeJSON(lessonsPath(video.id), lessons);
    res.json(lessons);
  });

  return router;
};
