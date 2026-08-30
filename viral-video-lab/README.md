# Viral Video Lab

App local (no requiere internet ni deploy) para analizar la estructura temporal de
videos de producto/dropshipping, validarlos contra el algoritmo viral, compararlos
contra tu `PATTERN_LIBRARY.json`, y preparar guiones nuevos basados en esos patrones.

## Por qué no tiene límite de tamaño

El video nunca se "sube" a ningún servidor externo. La app corre en tu propia PC:
- Playback y análisis leen el archivo **directo desde disco por streaming/chunks**
  (Range requests para el reproductor, ffmpeg por pipes para el análisis) — nunca se
  carga el archivo completo en memoria.
- Si arrastras un video nuevo, el "upload" también es streaming directo a disco
  (sin buffering en memoria, sin límite configurado).
- Soporta videos de segundos hasta 24 horas de duración sin cambios de código.

## Instalación y arranque

```bash
npm install
npm start
```

Abre `http://localhost:4500` en tu navegador. La primera vez, `npm install`
descarga binarios estáticos de ffmpeg/ffprobe (vía npm, no toca tu sistema).

## Flujo de uso

1. **Biblioteca**: escanea la carpeta de videos por defecto, pega una ruta, o
   arrastra un archivo. También puedes crear una entrada "Modo B" sin archivo si
   solo vas a describir el video con timestamps.
2. **Análisis**: corre ffmpeg (cortes de escena, silencios, miniaturas) en segundo
   plano. Al terminar, copia el "manifiesto" y pégalo en el chat con Claude Code
   pidiéndole `usa el agente-lider` para que determine hook/demo/climax/cta viendo
   las miniaturas — esto reemplaza el límite de 100MB que tenía el flujo anterior.
3. **Estructura**: guarda los segmentos (a mano, o con lo que te devuelva Claude).
4. **Validación**: PASS/FAIL determinístico contra las reglas fijas del algoritmo
   viral, y comparación contra `PATTERN_LIBRARY.json` (la misma que usan tus skills,
   en `~/.claude/PATTERN_LIBRARY.json` — la app solo la lee, nunca la escribe).
5. **Guion**: arma un prompt listo para pegar en el chat con el patrón elegido +
   tu producto, para que Claude escriba el guion final.

## Notas

- La app solo lee `PATTERN_LIBRARY.json`. Para añadir un patrón nuevo confirmado,
  pídeselo a `agente-lider` en el chat (así queda registrado igual que hoy).
- Los cambios de estado y los "aha moments" no se detectan solos — eso requiere
  criterio (tuyo, o de Claude viendo las miniaturas). ffmpeg solo te da candidatos
  mecánicos (cortes de escena, silencios) para que no tengas que escanear el video
  a ciegas.
