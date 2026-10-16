# BeatForge

DAW (estación de audio digital) para el navegador, escrita desde cero. Corre sin instalación: abre el proyecto en un servidor local y listo.

## Cómo se hizo (y qué no)

BeatForge es una implementación **original** inspirada en el flujo de trabajo general de los DAW de patrones (rack de canales, secuenciador de pasos, piano roll, playlist, mezclador con inserts). Se construyó a partir de conceptos públicos del tipo de software, no a partir del binario ni del código de FL Studio.

- No se descompiló, desensambló ni copió código de FL Studio.
- No se usan su nombre, logotipo, textos, iconos, samples, presets, plugins ni formatos de proyecto propietarios.
- FL Studio es una marca de Image-Line. BeatForge no está afiliado ni respaldado por ellos.

## Puesta en marcha

```bash
cd beatforge
npm test                 # pruebas del núcleo (node, sin dependencias)
python3 -m http.server 8080   # o cualquier servidor estático
# abrir http://localhost:8080
```

Abrir `index.html` directamente con `file://` también suele funcionar, pero el servidor local es más fiable para el audio y la carga de archivos.

## Qué incluye

**Rack de canales**
- Tres tipos de canal: sintetizador, batería (un sonido por canal, estilo step sequencer) y sampler (carga WAV/MP3/OGG).
- Volumen, silenciar, solo, asignación a inserts del mezclador, renombrar y eliminar.

**Sintetizador sustractivo**
- Dos osciladores (seno, triángulo, diente de sierra, cuadrada), desafinado en cents, nivel del segundo oscilador y octava.
- Filtro lowpass / highpass / bandpass con corte en escala logarítmica, resonancia y envolvente de filtro.
- Envolvente ADSR de amplitud.

**Batería sintetizada**: bombo, caja, palmas, hi-hat cerrado y abierto, rim, tom y crash. No usa samples de terceros.

**Patrones y playlist**
- Varios patrones con duración de 1 a 64 compases: crear, duplicar, renombrar y eliminar.
- Secuenciador de pasos con pintado arrastrando el ratón.
- Piano roll: añadir, mover, cambiar el largo, multiselección (Shift), cuantizar, seleccionar todo y borrar. Zoom y snap configurables.
- Playlist: colocar patrones en compases; el modo Canción reproduce la playlist completa.

**Mezclador**: master + 8 inserts. Cada insert tiene volumen, paneo, mute, EQ de 3 bandas, distorsión (waveshaper con sobremuestreo), compresor, delay con feedback y reverb convolutiva con caída ajustable. Medidor de nivel de salida.

**Transporte**: reproducción con programador anticipado (lookahead de 150 ms), metrónomo, loop de patrón o de canción, posición en compás.tiempo.semicorchea.

**Entrada en vivo**
- Teclado de la computadora (`A W S E D F T G Y H U J K O L P ;`) con `Z`/`X` para cambiar de octava.
- MIDI por Web MIDI (si el navegador lo soporta).
- Grabación: `R` graba lo que tocas en el patrón durante la reproducción.

**Exportación**
- **WAV** 16 bits estéreo a 44.1 kHz, renderizado offline con el mismo grafo de audio que la reproducción.
- **MIDI** estándar (SMF tipo 1), con una pista por canal y la batería en el canal 10.
- **Proyecto** en JSON (`.beatforge.json`).

**Edición**: deshacer y rehacer (Ctrl+Z / Ctrl+Shift+Z) con historial de hasta 200 pasos. Autoguardado en el navegador.

## Atajos

| Tecla | Acción |
| --- | --- |
| Espacio | Reproducir / detener |
| `Z` / `X` | Octava abajo / arriba |
| `A`–`;` | Teclado de piano |
| `R` | Grabación on/off |
| `M` | Metrónomo |
| Ctrl+Z / Ctrl+Shift+Z | Deshacer / rehacer |
| Ctrl+S | Guardar archivo de proyecto |
| Ctrl+A (en piano roll) | Seleccionar todas las notas del canal |
| Supr / Retroceso | Borrar notas seleccionadas |

## Límites conocidos

Lo que todavía no está, en orden aproximado de prioridad:

- Automatización de parámetros (curvas por tiempo).
- Velocity editable por nota en el piano roll (hoy es fija por nota; la del paso sí se graba como 0.9).
- Efectos de canal por separado (hoy los efectos son por insert).
- Samples dentro del archivo de proyecto: se pierden al abrir (hay que volver a cargarlos).
- Sin pistas de audio grabado desde micrófono; solo grabación MIDI.
- Sin plugins de terceros (VST, AU, CLAP).
- Sin importación de MIDI.
- Edición de la playlist con arrastre; hoy es clic para colocar o quitar.
- Interfaz optimizada para escritorio; en pantallas pequeñas el rack se apila arriba.
- El metrónomo y el loop se aplican en la siguiente reproducción.

## Estructura

```
beatforge/
├── index.html          interfaz
├── css/style.css       estilos
├── js/core.js          modelo, tiempos, WAV y MIDI (puro, testeable)
├── js/engine.js        grafo de Web Audio, instrumentos, efectos, scheduler, render offline
├── js/ui.js            estado, render, historial, teclado, MIDI, archivos
└── test/core.test.js   pruebas del núcleo (node --test)
```

El núcleo no depende del DOM ni de Web Audio, así que las pruebas corren en node. La prueba de integración en navegador (Playwright) se hizo aparte al desarrollar: carga, pasos, reproducción, piano roll, playlist, exportación WAV/MIDI y deshacer, sin errores de JavaScript.
