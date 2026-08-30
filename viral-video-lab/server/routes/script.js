const express = require('express');
const path = require('path');
const store = require('../lib/store');

const PATTERN_LIBRARY_PATH = path.join(require('os').homedir(), '.claude', 'PATTERN_LIBRARY.json');

// This route never calls any AI. It just assembles a ready-to-paste prompt that
// carries the chosen pattern's exact structure + your product context, so you bring
// it into this chat and agente-lider -> pattern-manager/guion-experto-dropshipping
// generate the actual script - matching how the rest of the skill stack works.
module.exports = function buildScriptRouter() {
  const router = express.Router();

  router.post('/script/prepare', (req, res) => {
    const { patternId, producto, contexto, duracionObjetivo } = req.body || {};
    if (!patternId || !producto) {
      return res.status(400).json({ error: 'Se requiere patternId y producto.' });
    }
    const library = store.readJSON(PATTERN_LIBRARY_PATH, { patrones: [] });
    const pattern = (library.patrones || []).find((p) => p.id === patternId);
    if (!pattern) return res.status(404).json({ error: `No se encontró el patrón "${patternId}" en PATTERN_LIBRARY.json` });

    const prompt = `Usa el agente-lider para clonar el patrón "${pattern.nombre}" (${pattern.duracion_segundos}s, ${pattern.tipo_contenido}) aplicado a este producto:

PRODUCTO: ${producto}
CONTEXTO/ÁNGULO: ${contexto || '(sin especificar, propón uno)'}
DURACIÓN OBJETIVO: ${duracionObjetivo || pattern.duracion_segundos}s

Mantén las proporciones (%) de la estructura original, no los segundos absolutos:
- HOOK: ${pattern.estructura.hook.porcentaje}% — ${pattern.tecnicas.hook}
- DEMO: ${pattern.estructura.demo.porcentaje}% — ${pattern.tecnicas.demo}
- CLIMAX: ${pattern.estructura.climax.porcentaje_posicion}% posición — ${pattern.tecnicas.climax}
- CTA: ${pattern.estructura.cta.porcentaje}% — ${pattern.tecnicas.cta}

Quiero la estructura adaptada (pattern-manager Modo 2) y después el guion de venta (guion-experto-dropshipping) sobre esa estructura.`;

    res.json({ prompt, pattern });
  });

  return router;
};
