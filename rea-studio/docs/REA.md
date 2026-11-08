# Usar REA (morluto/rea) con REA Studio

REA es un servidor MCP para ingeniería inversa (binarios, apps Electron/JS, .NET, web). Aquí sirve para
**entender cómo funciona OBS** y decidir dónde enganchar cada plugin.

## Instalar (en tu equipo, no en el contenedor de la nube)
    npx rea-agents setup        # registra REA en Claude Code y reinicia el agente

Para análisis nativo hace falta Hopper, Ghidra o IDA. Como tenemos el **código fuente** (`base/`), la mayor parte
se entiende leyéndolo; REA se usa sobre el binario compilado cuando algo no está claro (flujo de audio real, símbolos, UI).

## Preguntas útiles para el agente
- "Con REA, traza el camino del audio en libobs desde la fuente hasta el mezclador (`libobs/obs-audio.c`) y dime dónde insertar un filtro."
- "Explica cómo carga OBS los plugins (`obs_load_all_modules`) y los scripts Python (`plugins/frontend-tools`)."
- "Dónde se guarda la configuración de perfil y de escenas, y qué claves usa SimpleOutput/AdvOut."
- "Cómo funciona la salida de captions (`obs_output_output_caption_text2`) para integrar subtítulos nativos."

## Mapa rápido del código
- `base/libobs/` núcleo (audio: `obs-audio.c`, `media-io/audio-io.c`; filtros de fuente: `obs-source.c`).
- `base/plugins/obs-filters/` filtros de audio existentes (compresor, puerta, limitador, ganancia): ejemplo para copiar.
- `base/frontend/` interfaz Qt (menús, docks, atajos).
- `base/plugins/frontend-tools/` scripting Lua/Python.

## Ideas siguientes (audio libre)
- Ecualizador paramétrico de N bandas y de-esser en `plugins/rea-audio-lab`.
- Mezclador por escena con presets guardados.
- Integrar `obs-localvocal` (GPL, plugin de transcripción) como alternativa nativa a `subtitulos_whisper.py`.
