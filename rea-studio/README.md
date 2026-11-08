# REA Studio (nombre de trabajo)

Copia (fork) de **OBS Studio 33.0.1** (commit `65c320b4`) con extras propios.
Nombre de trabajo: **REA Studio** — se cambia en un solo sitio (`NOMBRE` en `scripts/rea_config.py` y este README).

## Estructura
- `base/` — código fuente de OBS Studio 33.0.1 sin modificar (GPL-2.0-or-later). Mantenemos `base/COPYING` y `base/AUTHORS`.
- `scripts/` — scripts de OBS (Python) que se cargan en *Herramientas → Scripts*:
  - `rea_escenas.py` — plantillas de escenas (16:9 y vertical 9:16, overlays, cámara, texto).
  - `rea_grabacion.py` — nombre de archivo automático, división por tiempo, registro de grabaciones, atajos.
  - `rea_audio.py` — cadenas de filtros de audio (voz limpia, anti-eco, ducking de música, limitador) con parámetros editables.
  - `rea_subtitulos.py` + `subtitulos_whisper.py` — subtítulos en vivo: Whisper local escribe a un archivo y OBS lo muestra.
- `plugins/rea-audio-lab/` — plugin C (filtro de audio propio: pasa‑altos + ganancia + limitador suave) para tener control total del audio.
- `docs/REA.md` — cómo usar REA (morluto/rea) para entender OBS y planear cambios.

## Legalidad (resumen)
OBS es GPL‑2.0+: se puede copiar, modificar, renombrar y redistribuir si:
1. conservas la licencia GPL y los avisos de autor,
2. publicas el código fuente de tus cambios,
3. **no usas el nombre ni el logo "OBS"** (marca registrada del proyecto) → por eso un nombre propio.
Evita "OBS 2.0": sugiere que es el producto oficial.

## Compilar
Ver `base/INSTALL` y `base/CMakePresets.json` (Linux: `cmake --preset ubuntu-x86_64 && cmake --build build_x86_64`).
Los scripts de `scripts/` funcionan también con OBS oficial instalado, sin compilar nada.

## Estado
Sin probar contra una instancia real de OBS (el contenedor no tiene GUI). Los scripts compilan en Python; falta probarlos en tu equipo.
