// Deterministic pattern comparison - mirrors ~/.claude/agents/pattern-manager.md
// "Modo 1" criteria: hook duration within ~1s is a strong signal, climax type
// (position bucket) matters more than the exact percentage.

function round1(n) {
  return Math.round(n * 10) / 10;
}

function findSegment(structure, nombre) {
  return (structure.segments || []).find((s) => s.nombre === nombre) || null;
}

function scorePattern(structure, pattern) {
  const hook = findSegment(structure, 'hook');
  const climax = findSegment(structure, 'climax');
  if (!hook || !climax || !structure.duracion_segundos) return null;

  const hookDur = hook.fin - hook.inicio;
  const hookDiff = Math.abs(hookDur - pattern.estructura.hook.duracion);
  const climaxPos = (climax.inicio / structure.duracion_segundos) * 100;
  const climaxDiff = Math.abs(climaxPos - pattern.estructura.climax.porcentaje_posicion);

  let similitud;
  if (hookDiff <= 1 && climaxDiff <= 5) similitud = 'alta';
  else if (hookDiff <= 2 && climaxDiff <= 10) similitud = 'media';
  else similitud = 'baja';

  const coincidencias = [];
  const diferencias = [];
  if (hookDiff <= 1) {
    coincidencias.push(`hook: ${round1(hookDur)}s vs ${pattern.estructura.hook.duracion}s del patrón (±1s)`);
  } else {
    diferencias.push(`hook difiere ${round1(hookDiff)}s: ${round1(hookDur)}s vs ${pattern.estructura.hook.duracion}s del patrón`);
  }
  if (climaxDiff <= 5) {
    coincidencias.push(`climax: ${round1(climaxPos)}% vs ${pattern.estructura.climax.porcentaje_posicion}% del patrón`);
  } else {
    diferencias.push(`climax difiere ${round1(climaxDiff)}pp: ${round1(climaxPos)}% vs ${pattern.estructura.climax.porcentaje_posicion}% del patrón`);
  }
  if (structure.tipo_contenido && pattern.tipo_contenido && !pattern.tipo_contenido.includes(structure.tipo_contenido)) {
    diferencias.push(`tipo de contenido: "${structure.tipo_contenido}" (tuyo) vs "${pattern.tipo_contenido}" (patrón)`);
  }

  return {
    id: pattern.id,
    nombre: pattern.nombre,
    duracion_segundos: pattern.duracion_segundos,
    similitud,
    hookDiff: round1(hookDiff),
    climaxDiff: round1(climaxDiff),
    coincidencias,
    diferencias,
  };
}

function matchPatterns(structure, library) {
  const patrones = library.patrones || [];
  const scored = patrones
    .map((p) => scorePattern(structure, p))
    .filter(Boolean)
    .sort((a, b) => a.hookDiff + a.climaxDiff / 5 - (b.hookDiff + b.climaxDiff / 5));

  const patron_mas_cercano = scored[0] || null;
  const es_patron_nuevo = !patron_mas_cercano || patron_mas_cercano.similitud === 'baja';

  return { ranking: scored, patron_mas_cercano, es_patron_nuevo };
}

module.exports = { matchPatterns };
