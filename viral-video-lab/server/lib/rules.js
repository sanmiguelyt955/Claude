// Deterministic rule engine - mirrors ~/.claude/agents/validator.md exactly, so the
// app's verdicts always agree with what the validator subagent would say in chat.
// This needs no AI: it's arithmetic over a structure the user (or Claude, via chat)
// already filled in.

const CLIMAX_RANGES = {
  producto: { min: 68, max: 71, optimo: 70 },
  tutorial: { min: 85, max: 90, optimo: 87.5 },
};

function findSegment(structure, nombre) {
  return (structure.segments || []).find((s) => s.nombre === nombre) || null;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function validateHook(structure) {
  const hook = findSegment(structure, 'hook');
  if (!hook) return { verdict: 'NO-DETERMINABLE', razon: 'No hay segmento "hook" en la estructura.' };
  const duracion = round1(hook.fin - hook.inicio);
  if (duracion > 4.0) {
    return {
      verdict: 'FAIL',
      duracion,
      razon: `El hook dura ${duracion}s, excede el máximo de 4.0s por ${round1(duracion - 4.0)}s — recorta la presentación inicial.`,
    };
  }
  if (duracion < 1.5) {
    return {
      verdict: 'FAIL',
      duracion,
      razon: `El hook dura ${duracion}s, por debajo del mínimo de 1.5s — es probable que no dé tiempo a comunicar el gancho.`,
    };
  }
  const enOptimo = duracion >= 2.5 && duracion <= 3.0;
  return {
    verdict: 'PASS',
    duracion,
    razon: enOptimo
      ? `${duracion}s, dentro del óptimo (2.5–3.0s).`
      : `${duracion}s, dentro de rango aceptable (1.5–4.0s) pero fuera del óptimo (2.5–3.0s).`,
  };
}

function validateClimax(structure) {
  const climax = findSegment(structure, 'climax');
  if (!climax) return { verdict: 'NO-DETERMINABLE', razon: 'No hay segmento "climax" en la estructura.' };
  const tipo = structure.tipo_contenido;
  const posicion = Math.round((climax.inicio / structure.duracion_segundos) * 1000) / 10;
  const range = CLIMAX_RANGES[tipo];
  if (!range) {
    return {
      verdict: 'NO-DETERMINABLE',
      porcentaje_posicion: posicion,
      tipo_contenido: tipo || 'otro/sin especificar',
      razon: 'Tipo de contenido "otro" o sin especificar — la posición óptima del climax no está documentada en PATTERN_LIBRARY.json todavía. Documéntala ahí cuando se confirme.',
    };
  }
  if (posicion < range.min || posicion > range.max) {
    return {
      verdict: 'FAIL',
      porcentaje_posicion: posicion,
      tipo_contenido: tipo,
      razon: `El climax está al ${posicion}% del video; para "${tipo}" debe estar entre ${range.min}–${range.max}% (óptimo ${range.optimo}%).`,
    };
  }
  return {
    verdict: 'PASS',
    porcentaje_posicion: posicion,
    tipo_contenido: tipo,
    razon: `${posicion}%, dentro del rango ${range.min}–${range.max}% para "${tipo}".`,
  };
}

function validateCambioEstado(structure) {
  const ce = structure.cambio_estado;
  if (!ce || typeof ce.presente !== 'boolean') {
    return { verdict: 'NO-DETERMINABLE', razon: 'No se especificó si hay cambio de estado antes/después.' };
  }
  if (!ce.presente) {
    return { verdict: 'FAIL', razon: 'No se describe un cambio de estado visible (antes ≠ después).' };
  }
  if (!ce.descripcion || !ce.descripcion.trim()) {
    return { verdict: 'NO-DETERMINABLE', razon: 'Se marcó cambio de estado como presente pero sin descripción.' };
  }
  return { verdict: 'PASS', razon: ce.descripcion };
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart <= bEnd && bStart <= aEnd;
}

function validateAudioSync(structure, frameIndex) {
  const climax = findSegment(structure, 'climax');
  const tipo = structure.tipo_contenido;
  if (!climax) return { verdict: 'NO-DETERMINABLE', razon: 'No hay segmento "climax" para evaluar el audio.' };

  if (tipo === 'tutorial') {
    if (!climax.audio || !climax.audio.trim()) {
      return { verdict: 'NO-DETERMINABLE', razon: 'No se describió el audio del climax (en tutoriales sí puede haber narración).' };
    }
    return { verdict: 'PASS', razon: `Narración/voiceover permitido en tutoriales: "${climax.audio}".` };
  }

  if (tipo !== 'producto') {
    return { verdict: 'NO-DETERMINABLE', razon: 'Tipo de contenido no es "producto" ni "tutorial" — regla de audio no documentada para este caso.' };
  }

  const silenceIntervals = frameIndex?.silence_intervals || [];
  const overlapping = silenceIntervals.find((s) => overlaps(s.start, s.end, climax.inicio, climax.fin));
  if (overlapping) {
    return {
      verdict: 'PASS',
      razon: `Confirmado automáticamente por ffmpeg: silencio detectado ${round1(overlapping.start)}s–${round1(overlapping.end)}s, que se solapa con el climax.`,
    };
  }

  const audioText = (climax.audio || '').toLowerCase();
  if (audioText.includes('asmr') || audioText.includes('silencio')) {
    return { verdict: 'PASS', razon: `Descrito como ASMR/silencio: "${climax.audio}".` };
  }
  if (audioText.includes('música') || audioText.includes('musica') || audioText.includes('voz')) {
    return {
      verdict: 'FAIL',
      razon: `El audio del climax se describe como "${climax.audio}" — para contenido de producto debe ser ASMR puro o silencio, nunca música o voz en ese instante.`,
    };
  }
  return { verdict: 'NO-DETERMINABLE', razon: 'No se detectó silencio automáticamente ni se describió el audio del climax; falta información para confirmar.' };
}

function validateCTA(structure) {
  const cta = findSegment(structure, 'cta');
  if (!cta) return { verdict: 'NO-DETERMINABLE', razon: 'No hay segmento "cta" en la estructura.' };
  const posicion = Math.round((cta.inicio / structure.duracion_segundos) * 1000) / 10;
  if (posicion < 70) {
    return {
      verdict: 'FAIL',
      porcentaje_inicio: posicion,
      razon: `El CTA empieza al ${posicion}% del video — debe estar en el último 30% (a partir del 70%).`,
    };
  }
  if (!cta.contenido || !cta.contenido.trim()) {
    return { verdict: 'NO-DETERMINABLE', porcentaje_inicio: posicion, razon: 'El CTA está posicionalmente bien pero no se describió su contenido explícito.' };
  }
  return { verdict: 'PASS', porcentaje_inicio: posicion, razon: `Empieza al ${posicion}% (dentro del último 30%): "${cta.contenido}".` };
}

function validate(structure, frameIndex) {
  const result = {
    hook: validateHook(structure),
    climax: validateClimax(structure),
    cambio_estado: validateCambioEstado(structure),
    audio_sync: validateAudioSync(structure, frameIndex),
    cta: validateCTA(structure),
  };

  const verdicts = Object.values(result).map((r) => r.verdict);
  const fails = verdicts.filter((v) => v === 'FAIL').length;
  const incompletos = verdicts.filter((v) => v === 'NO-DETERMINABLE').length;

  let veredicto_global;
  if (incompletos > 0) veredicto_global = 'INCOMPLETO';
  else if (fails > 0) veredicto_global = 'NO_CUMPLE';
  else veredicto_global = 'VIRAL_COMPLIANT';

  return { ...result, veredicto_global, fails, incompletos };
}

module.exports = { validate, CLIMAX_RANGES };
