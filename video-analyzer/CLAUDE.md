# CLAUDE.md

Instrucciones permanentes para Claude Code en este repositorio.

## Qué es este proyecto

App web local que analiza videos de forma exhaustiva (video + audio sincronizados, texto en pantalla, objetos, acciones), guarda ese análisis como memoria estructurada y semánticamente buscable, y detecta procesos reutilizables en el video para generar o mejorar Skills de Claude.

**`PROJECT.md` es la fuente de verdad.** Léelo completo antes de escribir código y consúltalo ante cualquier duda de alcance, arquitectura o comportamiento esperado.

## Stack — bloqueado

No cambiar sin preguntar primero:

- **Next.js (App Router) + React + Tailwind** — frontend y backend en un solo proyecto
- **SQLite** vía `better-sqlite3` + extensión **`sqlite-vec`** para embeddings y búsqueda semántica
- **FFmpeg** local para preprocesamiento y segmentación de video
- **`@google/genai`** → Gemini 3.8 Flash (fallback a 3.7 Flash si el modo `agentic` no está disponible en 3.8)
- **Motor de Skills:** el mismo `@google/genai` en el MVP (una sola API key, coste cero). Aíslalo tras una interfaz `SkillEngineProvider` para poder cambiar a Claude más adelante sin tocar el resto del código.
- **Cola de tareas:** tabla `jobs` en SQLite + worker Node con polling. Nada de Redis ni BullMQ.
- **Sin autenticación** (uso personal, local)

## Reglas de trabajo

1. **Confirma antes de avanzar de bloque.** El orden de construcción está en `PROJECT.md` sección 28. Termina un bloque, muéstramelo funcionando, y espera mi visto bueno antes de pasar al siguiente.
2. **No construyas la Fase 2 todavía** (servidor MCP, empaquetado `.mcpb`, Claude Desktop) ni nada listado como "Excluido" en `PROJECT.md` sección 23.
3. **No inventes alcance.** Si algo no está en `PROJECT.md`, pregúntame antes de implementarlo.
4. **Respeta el free tier.** Límites: 10 peticiones/min, **250.000 tokens/min**, 1.500 peticiones/día. El TPM es el que se rompe primero con video. Antes de cada envío, estima tokens (duración × resolución) y, si excede, baja el sampling o segmenta con FFmpeg. Maneja los 429 con backoff exponencial con jitter, nunca reintentos inmediatos. Loguea tokens consumidos por análisis.
5. **Nada bloqueante en la UI.** El análisis corre en el worker; la interfaz muestra progreso en vivo y sigue navegable.
6. **Sincronización audio-video es requisito, no extra.** Todo evento del análisis lleva su timestamp y relaciona lo visual con lo hablado.

## Cómo trabajar (adaptado de andrej-karpathy-skills, MIT)

- Di tus suposiciones en voz alta. Si algo no está claro, pregunta.
- Nada de funciones que no se pidieron ni abstracciones para código de un solo uso.
- Toca solo lo necesario: no "mejores" código, comentarios o formato vecinos. Cada línea cambiada debe venir de lo que se pidió.
- "Arregla el bug" → primero un test que lo reproduzca, luego hazlo pasar. En tareas de varios pasos: "1. [paso] → verificar: [comprobación]".
- **Todo cambio se prueba antes de darlo por terminado.** La mejora es prueba y error: tests automáticos, y además una prueba real del comportamiento (la app corriendo, un análisis real o una captura con REA) que muestre que funciona. Si algo no se puede probar aquí (p. ej. la tarjeta gráfica), se prueba lo más cercano y se dice qué quedó sin probar.
- No pegues archivos o logs enteros en la conversación: referéncialos con Read o pega solo las últimas ~50 líneas del error (de ahorra-tokens-claude, MIT).

## Convenciones

- Código, nombres de variables y comentarios en **inglés**. Textos de la interfaz en **español**.
- TypeScript en todo el proyecto.
- Nada de secretos hardcodeados: todo por `.env.local`, y `.env.example` siempre actualizado.
- Commits pequeños y descriptivos, uno por unidad de trabajo terminada.

## Variables de entorno

```
GEMINI_API_KEY=       # ai.google.dev — única key necesaria en el MVP
```

## Antes de dar algo por terminado

- ¿Funciona con un video real, no solo con un caso de prueba sintético?
- ¿Los timestamps del análisis coinciden con lo que realmente pasa en el video?
- ¿Se guardó en SQLite y se puede recuperar después?
- ¿La UI sigue respondiendo mientras se procesa?
