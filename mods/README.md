# Mods de Claude

- `notas`: panel de notas junto al chat (`/notas`, `/nota texto`), guardadas entre sesiones.
- `cache-timer`: cuenta regresiva de la caché del prompt (`/cache 5m|1h`).
- `modo-privado`: tapa llaves, correos, teléfonos, tarjetas, CURP y RFC en pantalla (`/privado on|off|auto`). Solo tapa lo que se ve; Claude recibe el texto real.
- `modelo-recomendado`: sugiere modelo y esfuerzo según la pregunta (`/modelo <pregunta>`).
- `autoguardado`: al terminar cada turno copia los mods a `mods/`, hace commit y push de todo a GitHub. No sube si detecta una llave secreta ni empuja directo a `main`/`master` (`/guardar`, `/autoguardar on|aviso|off`).
