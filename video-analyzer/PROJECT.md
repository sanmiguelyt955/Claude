# PROJECT.md — Claude Video Analyzer (nombre provisional)

> Documentación inicial del proyecto — v2 (actualizada tras cerrar la investigación técnica). Fuente de verdad para comenzar el desarrollo con Claude Code. Todas las decisiones técnicas quedaron cerradas; solo quedan micro-decisiones de implementación que Claude Code puede resolver sobre la marcha (marcadas al final).

---

## 0. Nota de investigación importante

Durante la investigación se encontró un proyecto open-source llamado **"claude-video-vision"** (plugin de Claude Code que extrae frames con FFmpeg + transcribe audio con Gemini/Whisper/OpenAI y se los da a Claude como imágenes). Es decir, ya existe *algo* parecido a "hacer que Claude vea video" a nivel básico.

Esto **no invalida el proyecto** — al contrario, confirma que la arquitectura elegida (FFmpeg + motor de video externo + Claude como consumidor) es la correcta. Pero sí significa que el verdadero diferencial de esta app **no es "que Claude vea video"** (eso ya existe de forma básica), sino:

1. La **memoria persistente y semántica** por video (buscar entre cientos de videos analizados).
2. La **biblioteca** con histórico de análisis reutilizable.
3. El motor de **detección y creación de Skills** a partir de procesos explicados en video.
4. El motor de **mejora de Skills existentes**.

Ese es el foco que hay que cuidar más en la construcción, no la simple extracción de frames.

## 1. Descripción del proyecto

Aplicación que permite a Claude trabajar con videos que no puede recibir de forma nativa. Carga un video, lo analiza de forma exhaustiva (video + audio sincronizados, texto en pantalla, escenas, objetos, acciones), lo convierte en una memoria estructurada y semánticamente buscable, y expone esa memoria a Claude — primero como app independiente, después vía MCP hacia Claude Desktop.

## 2. Objetivo

Crear una "memoria audiovisual externa" para Claude, con capacidad adicional de convertir el conocimiento de un video en Skills reutilizables de Claude.

## 3. Problema que resuelve

Claude no acepta video nativamente (solo imágenes JPEG/PNG/GIF/WebP y documentos). No existe hoy una herramienta que combine comprensión exhaustiva de video + memoria semántica persistente + generación automática de Skills.

## 4. Usuario objetivo

Uso personal (Sanmi) en primera instancia. Alguien que quiere que Claude "entienda" un video (ej. un video viral de referencia, un tutorial, una demo) y lo use como conocimiento consultable o como base para una Skill.

## 5. Propuesta de valor

- Memoria de video persistente y buscable semánticamente (no solo un resumen de una sola vez).
- Generación automática de Skills reales (formato `SKILL.md` compatible) a partir de procesos detectados en video.
- Mejora automática de Skills existentes comparándolas contra nuevo contenido en video.
- Arquitectura multi-modelo (no depende de un solo proveedor de IA).

## 6. Flujo principal de uso

```
Abrir app
  → Cargar video (archivo / URL) o pegar link
  → App analiza (metadata → primer análisis → análisis profundo → detección de Skills)
  → Usuario revisa: Resumen, Timeline, Transcripción, Objetos, Texto, Detalles
  → Usuario pulsa "Guardar en memoria" (opt-in)
  → Aparecen "Crear Skill" y "Mejorar Skill" si se detectaron procesos
  → (Fase 2) Claude Desktop consulta la memoria vía MCP y responde usando esa información
```

## 7. Funcionalidades (MVP)

- Cargar video desde archivo local o URL. Formatos: MP4, MOV, MKV, AVI, WebM.
- Aceptar también imágenes, PDFs, documentos y audio como entradas adicionales.
- Botón rápido "Generar análisis del video" + panel de opciones avanzadas.
- Resultados por capas: resumen, timeline, transcripción, objetos, texto en pantalla, acciones, relaciones.
- Guardar (opt-in): video original + análisis + memoria.
- Biblioteca de videos analizados con búsqueda semántica.
- "Crear Skill": detecta uno o varios procesos reutilizables y genera Skills en formato Claude real.
- "Mejorar Skill": compara una Skill existente contra el video y propone mejoras aplicables una por una.
- Permisos explícitos antes de guardar datos o acceder a archivos.

## 8. Sistema de análisis de video — DECISIÓN FINAL

**Motor principal: Gemini 3.8 Flash** (lanzado 2 sept 2026, GA, acepta texto/imagen/video/audio/PDF, contexto 1,048,576 tokens, salida máx. 65,536 tokens, mismo precio que 3.7 Flash: $0.75/M tokens de entrada, $3.75/M de salida, cache read $0.075/M).

**Detalle importante para Claude Code:** el modo **"agentic video understanding"** (el modelo navega el timeline bajo demanda con herramientas `get_transcript`, `get_frames(start,end,fps)`, `get_audio(start,end)`, reduciendo hasta 88% los tokens y 66% el costo) se confirmó oficialmente el 1 de septiembre de 2026 para **Gemini 3.7 Flash, 3.6 Flash y 3.5 Flash-Lite**. Gemini 3.8 Flash se lanzó un día después (2 sept) como modelo hermano de 3.7. **Al momento de construir, verificar si `processing: "agentic"` ya está disponible en `gemini-3.8-flash`; si no, usar `gemini-3.7-flash` para el motor de video** (misma familia, mismo precio, modo agéntico confirmado).

Pipeline por fases (control de coste/velocidad):
1. **Preprocesamiento local (FFmpeg):** duración, resolución, FPS, audio, formato, tamaño → decide si segmentar.
2. **Primer análisis (Gemini, modo agentic):** estructura general, escenas, cambios importantes, transcripción base con timestamps.
3. **Análisis profundo (solo segmentos relevantes):** acciones, objetos, texto en pantalla (OCR vía Gemini, no requiere Tesseract aparte), técnicas, procesos.
4. **Detección de Skills:** ¿hay procedimientos/metodologías reutilizables? (vía Claude, ver Sección 16).
5. **Memory Engine:** todo se estructura, se resume y se indexa (embeddings).

Reglas de calidad no negociables:
- Video y audio se analizan **sincronizados**, con timestamps compartidos: `00:31 — la persona muestra el producto mientras dice "..."`.
- Análisis multinivel: resumen → timeline → detalles visuales → audio → texto (OCR) → elementos → relaciones → memoria consultable.
- Nada de "sin límite de peso" literal. Límite real de referencia: Gemini File API admite hasta 20 GB (tier de pago). Videos más grandes se segmentan localmente con FFmpeg antes de enviarlos.
- Usar **context caching** de Gemini para videos de más de 10 minutos o cuando se harán varias preguntas sobre el mismo video (reduce costo y latencia).

## 9. Sistema de memoria — DECISIÓN FINAL

**Una sola base de datos SQLite** (archivo local, cero infraestructura) con la extensión **`sqlite-vec`** para búsqueda vectorial embebida en la misma base. Se descarta un vector DB separado (Pinecone/Weaviate/Qdrant/ChromaDB/LanceDB): con un solo usuario y un catálogo de videos personal, `sqlite-vec` da búsqueda semántica "suficientemente rápida" sin añadir un servicio más que mantener — coincide con la prioridad de mínima complejidad.

Capas de datos por video:
```
VIDEO
├── Raw            → video.mp4 (opcional conservar; opt-in)
├── Structured      → metadata, scenes, transcript, objects, events (tablas SQLite)
├── Semantic        → chunks + embeddings (tabla vec0 de sqlite-vec)
└── Derived         → resúmenes, skills generadas, mejoras de skills propuestas
```

Consulta típica: `video_memory_search("proceso para crear videos con IA")` → embeddings de la pregunta comparados contra los chunks → se devuelve solo el fragmento relevante (no el análisis completo) a quien pregunte (Claude vía MCP en Fase 2, o la propia UI en Fase 1).

## 10. Integración con Claude

Modelo: **memoria externa** (Opción 1, confirmada). La app mantiene su memoria; Claude la consulta vía MCP cuando la necesita. No se intenta modificar la memoria nativa de Claude.

Autonomía deseada: total (Claude detecta que necesita el video → llama a la tool MCP → recibe el fragmento relevante → responde, sin pasos manuales intermedios).

## 11. Integración MCP — DECISIÓN FINAL

Fase 2. Confirmado: el formato de extensión de un clic para Claude Desktop se llama ahora **MCPB** (renombrado desde "DXT/Desktop Extensions"; los archivos `.dxt` ahora son `.mcpb`). Es un zip con un `manifest.json` + servidor MCP local, corre localmente, transporte **stdio**, funciona offline, sin OAuth. Se instala desde Claude Desktop en Settings → Extensions → Install from file (o arrastrando el `.mcpb`).

Implementación: servidor MCP en **Node.js/TypeScript** usando `@modelcontextprotocol/sdk`, empaquetado con la CLI `mcpb` (paquete `@anthropic-ai/mcpb`).

Tools MCP a exponer:
```
search_videos()
search_video_memory()
get_video()
get_video_scene()
get_video_transcript()
get_video_analysis()
find_video_processes()
find_skill_opportunities()
get_skill_improvements()
```

## 12. Sistema de Skills — "Crear Skill" (formato confirmado)

Formato oficial verificado (Agent Skills spec, estándar abierto de Anthropic — agentskills.io): carpeta con `SKILL.md` = frontmatter YAML + Markdown.

Frontmatter obligatorio:
- `name`: máx. 64 caracteres, solo minúsculas/números/guiones.
- `description`: máx. 200 caracteres.

Opcional: `references/` (documentación cargada bajo demanda), `scripts/` (código ejecutable), `assets/` (plantillas/estáticos).

Flujo:
- Tras el análisis, se identifican tramos que constituyen un proceso/método reutilizable (distinto de opiniones/ejemplos/comentarios incidentales) — en el MVP este paso lo hace Gemini con un prompt de razonamiento dedicado; el codigo queda preparado para cambiarlo a Claude.
- Pueden detectarse varias Skills candidatas en un mismo video, cada una con su rango de tiempo:
  ```
  Skill detectada #1 — Crear videos publicitarios con IA (03:14–05:52) → [Crear Skill]
  Skill detectada #2 — Prompts para X (06:20–08:41) → [Crear Skill]
  ```
- Al pulsar "Crear Skill", se genera la carpeta completa (`SKILL.md` + `references/`/`scripts/` si aplica), lista para copiarse a `~/.claude/skills/` (personal) o `.claude/skills/` (proyecto).

## 13. Sistema de mejora de Skills — "Mejorar Skill"

- Compara una Skill existente (se lee su `SKILL.md`) contra el conocimiento nuevo del video.
- Detecta: pasos nuevos, mejor metodología, herramienta nueva, error a evitar, información faltante/desactualizada.
- Presenta cada mejora individualmente y de forma accionable (`[Aplicar] [Ignorar]`).
- Al aplicar, genera una nueva versión del `SKILL.md`.

## 14. Arquitectura final

```
┌─────────────────────────────────────────────┐
│         FRONTEND + BACKEND (Next.js)         │
│  UI (React/Tailwind) + API routes/actions    │
└───────────────────────┬───────────────────────┘
                        ▼
┌─────────────────────────────────────────────┐
│           WORKER DE PROCESAMIENTO            │
│  Cola de jobs en SQLite + proceso Node        │
│  (no bloquea la UI; progreso vía polling/SSE)│
└─────────┬─────────────────────────┬───────────┘
          ▼                         ▼
   ┌─────────────┐          ┌───────────────────┐
   │   FFmpeg    │          │  Gemini 3.8/3.7    │
   │   (local)   │          │  Flash (video/audio)│
   └─────┬───────┘          └─────────┬──────────┘
        │                            ▼
        │                  ┌───────────────────┐
        │                  │  Motor de Skills   │
        │                  │  (Gemini en MVP,   │
        │                  │  Claude opcional)  │
        │                  └─────────┬──────────┘
        ▼                            ▼
┌─────────────────────────────────────────────┐
│         SQLITE (better-sqlite3 + sqlite-vec) │
│  videos · metadata · analysis · transcripts  │
│  · embeddings (vec0) · skills · jobs         │
└───────────────────────┬───────────────────────┘
                        ▼
┌─────────────────────────────────────────────┐
│         MCP SERVER (Fase 2, Node + SDK)      │
│  empaquetado como .mcpb → Claude Desktop     │
└─────────────────────────────────────────────┘
```

## 15. Stack tecnológico — DECISIÓN FINAL

| Componente | Decisión |
|---|---|
| Frontend | **Next.js (App Router) + React + Tailwind CSS**, estilo iOS/minimalista |
| Backend | **El mismo proyecto Next.js** (API routes / server actions) — un solo lenguaje, mínima complejidad |
| Base de datos | **SQLite** (archivo local) vía `better-sqlite3` |
| Búsqueda semántica | **`sqlite-vec`** (extensión de SQLite) — sin servicio de vector DB separado |
| Procesamiento multimedia | **FFmpeg** (vía `fluent-ffmpeg` o `execa` + binario `ffmpeg-static`) |
| Motor de video understanding | **Gemini 3.8 Flash** (fallback a 3.7 Flash si el modo agentic no está aún disponible en 3.8) vía SDK `@google/genai` |
| Razonamiento / generación y mejora de Skills | **Gemini 3.8 Flash** en el MVP (una sola API key, coste cero en free tier). El código debe aislarse detrás de una interfaz `SkillEngineProvider` para poder cambiar a Claude (`@anthropic-ai/sdk`) sin tocar el resto |
| Transcripción y OCR | Incluidos en el análisis de Gemini (no se añade Whisper/Tesseract en el MVP; posible fallback local en fase futura por privacidad/offline) |
| Cola de tareas (videos grandes) | Tabla `jobs` en SQLite + proceso worker en Node que hace polling — sin Redis/BullMQ, para mantener la complejidad mínima |
| Integración Claude | MCP local (Fase 2), Node + `@modelcontextprotocol/sdk`, empaquetado `.mcpb` |
| Autenticación | Ninguna en Fase 1 (uso personal, local) |
| Almacenamiento | Local en Fase 1; sincronización/cloud en fases futuras |

## 16. IA y modelos — free tier primero

**Decisión: el MVP arranca en el tier gratuito de Gemini, con una sola API key y coste cero.**

Límites del free tier (Gemini 3 Flash, verificados sept 2026): **10 peticiones/minuto, 250.000 tokens/minuto, 1.500 peticiones/día**, contexto completo de 1M tokens, sin tarjeta de crédito. Desde mayo de 2026 el free tier cubre solo modelos Flash y Flash-Lite. Verificar al arrancar si `gemini-3.8-flash` ya está incluido; si no, usar `gemini-3.7-flash`.

**El límite crítico es TPM (250.000 tokens/minuto), no el de peticiones.** El video consume ~100–300 tokens/segundo:

| Duración | Tokens estimados (modo estático) | ¿Cabe en free tier? |
|---|---|---|
| 5 min | ~30.000–90.000 | Sí |
| 10 min | ~60.000–180.000 | Justo |
| 30 min | ~180.000–540.000 | No en resolución alta |
| 60 min | ~360.000–1.080.000 | No |

**Por eso el modo `agentic` no es opcional en este proyecto**: al reducir hasta 88% los tokens, mantiene videos largos dentro del free tier. Si el modo agentic no está disponible, la app debe bajar automáticamente la resolución de muestreo o segmentar el video con FFmpeg antes de enviarlo.

**Requisitos de implementación derivados de esto:**
- Estimar tokens *antes* de enviar (duración × resolución) y avisar al usuario si el video excede el presupuesto por minuto.
- Manejar errores 429 con backoff exponencial con jitter, nunca con reintentos inmediatos.
- Segmentar automáticamente y espaciar las llamadas cuando el video supere el TPM disponible.
- Loguear tokens consumidos por análisis para ver el consumo real.

**Aviso de privacidad:** en el tier gratuito, los prompts y respuestas pueden usarse para mejorar los productos de Google. Aceptable para prototipar; si más adelante se analizan videos sensibles, activar facturación (tier de pago, sin esa cláusula) o migrar el análisis a un modelo local.

### Costes si se pasa al tier de pago

Consumo de tokens de video reportado por Google: ~100 tokens/seg (resolución baja) a ~300 tokens/seg (resolución alta) en modo estático; el modo agentic reduce esto hasta 88%. Estas son cifras reportadas por Google en benchmarks, no una garantía exacta para cualquier video — tratarlas como estimación.

| Duración del video | Estimado modo estático (solo tokens de video, sin audio/output) | Estimado con modo agentic |
|---|---|---|
| 5 min | ~$0.05–0.07 | ~$0.01–0.02 |
| 10 min | ~$0.10–0.14 | ~$0.02–0.05 |
| 30 min | ~$0.30–0.40 | ~$0.05–0.15 |
| 60 min | ~$0.60–0.80 | ~$0.10–0.30 |

A esto hay que sumar tokens de audio y tokens de **salida** (el análisis exhaustivo generado, facturado a $3.75/M — más caro que la entrada), que pueden añadir entre $0.02 y $0.30 adicionales según el nivel de detalle pedido. Para uso personal (unos pocos videos al día), el costo mensual esperado es de unos pocos dólares, no una cifra que deba preocupar en esta fase.

Generación/mejora de Skills vía Claude: costo adicional pequeño por llamada (solo texto, no video), variable según el modelo de Claude usado.

## 17. Gestión de archivos

Entradas: video (múltiples formatos), URL, imágenes, PDFs, documentos, audio. Videos grandes: preprocesamiento y segmentación local vía FFmpeg antes de enviar a Gemini. Límite real de referencia: 20 GB (Gemini File API, tier de pago) — no hay límite artificial impuesto por la app misma.

## 18. Almacenamiento local — estructura de carpetas final

```
/data
  /videos              → archivos originales (si el usuario eligió conservarlos)
  /db
    app.sqlite          → base de datos principal (incluye tablas vec0 de sqlite-vec)
  /skills-generadas      → SKILL.md + references/ + scripts/ generados, listos para copiar
/apps
  /web                  → proyecto Next.js (frontend + backend)
  /mcp-server            → servidor MCP (Fase 2), empaquetable a .mcpb
/packages
  /video-processor       → wrappers de FFmpeg
  /ai-router             → cliente Gemini + cliente Claude, lógica de selección de modelo
  /memory-engine         → capa de acceso a SQLite + sqlite-vec
  /skill-engine          → detección/generación/mejora de Skills
```

## 19. Privacidad y permisos

Por defecto: no guardar → no se conserva nada. Guardar requiere opt-in explícito ("Guardar en memoria"). Acceso a archivos requiere permiso explícito. Uso personal en Fase 1: sin autenticación, todo local.

## 20. Interfaz y diseño

Estilo: tipo iOS, elegante, minimalista, colorido pero sobrio, profesional. Pantallas clave: Inicio/Biblioteca → Cargar video (archivo/URL) → Vista previa + "Generar análisis" → Resultados (Resumen, Timeline, Transcripción, Objetos, Texto, Detalles, Memoria) → Crear Skill / Mejorar Skill.

## 21. Costes

Fase 1: sin coste de infraestructura (todo local); coste variable solo por uso de la API de Gemini (y, en menor medida, Claude para Skills). Ver estimaciones en Sección 16.

## 22. Fases de desarrollo

1. **Fase 1:** App web independiente local — análisis completo + memoria + Skills.
2. **Fase 2:** Servidor MCP (.mcpb) → Claude Desktop, autonomía total de Claude sobre la memoria.
3. **Fase 3:** Extensión de navegador / Claude.ai (evaluar viabilidad después de validar Fases 1 y 2).
4. **Fase 4:** Versión móvil.

## 23. MVP / alcance inicial

**Incluido:** carga de video/audio/URL/imágenes/documentos, pipeline completo de análisis, memoria local (estructurada + semántica), Crear Skill / Mejorar Skill, biblioteca con búsqueda, UI estilo iOS.

**Excluido (fases posteriores):** integración MCP/Claude Desktop, autenticación multi-usuario, sincronización cloud, extensión de navegador, versión móvil.

## 24. Seguridad

Opt-in explícito para guardar datos y acceder a archivos. Todo el procesamiento y almacenamiento es local en Fase 1 (los únicos datos que salen del equipo son los que se envían a las APIs de Gemini/Claude para el análisis).

## 25. Pruebas

Validar con videos reales, midiendo: velocidad de procesamiento, precisión del análisis, calidad de sincronización audio-video, coste real por video, tasa de errores, calidad de las Skills generadas.

## 26. Roadmap

```
🟢 Idea → 🟢 Requisitos → 🟢 Viabilidad técnica → 🟢 Arquitectura →
🟢 Stack → 🟡 Diseño de interfaz detallado → 🟢 Plan para Claude Code →
⚪ Desarrollo → ⚪ Pruebas → ⚪ Documentación final
```

## 27. Micro-decisiones que puede resolver Claude Code sobre la marcha

Estas ya no bloquean el inicio del desarrollo; Claude Code puede decidirlas con criterio técnico durante la construcción:

- Librería de componentes UI exacta sobre Tailwind (p. ej. shadcn/ui) para acelerar el diseño iOS-like.
- Estrategia exacta de chunking de texto para los embeddings (por escena, por rango de tiempo fijo, o híbrido).
- Formato exacto de progreso en vivo (polling simple vs. Server-Sent Events) para la barra "Analizando escena 38/52".
- Nombre final, logo y colores de la app (pendiente de definir con el usuario en la fase de diseño de UI).

---

## 28. Prompt maestro para Claude Code

*(Copiar y pegar tal cual en Claude Code para iniciar la Fase 1)*

```
Vamos a construir la Fase 1 de una aplicación llamada "Claude Video Analyzer" (nombre provisional).
Toda la especificación funcional y técnica está en el archivo PROJECT.md en la raíz del repo —
léelo completo antes de escribir código.

Contexto en una frase: es una app web local que analiza videos de forma exhaustiva (video + audio
sincronizados, texto en pantalla, objetos, acciones) usando Gemini 3.8 Flash (fallback a 3.7 Flash
si el modo "agentic" aún no está disponible en 3.8), guarda ese análisis como memoria estructurada
y semánticamente buscable en SQLite + sqlite-vec, y además detecta procesos reutilizables en el
video para generar o mejorar Skills de Claude (formato SKILL.md real).

Stack ya decidido (no lo cambies sin preguntarme):
- Next.js (App Router) + React + Tailwind para frontend y backend en un solo proyecto.
- SQLite vía better-sqlite3, con la extensión sqlite-vec para embeddings/búsqueda semántica.
- FFmpeg local (fluent-ffmpeg o execa + ffmpeg-static) para preprocesamiento/segmentación de video.
- SDK @google/genai para Gemini (video understanding).
- El mismo SDK @google/genai para el motor de Skills en el MVP (una sola API key, coste cero),
  aislado tras una interfaz para poder cambiar a Claude despues sin tocar el resto.
- Cola de tareas simple: tabla `jobs` en SQLite + worker en Node hecho con polling (nada de Redis/BullMQ).
- Sin autenticación (uso personal, local).

Quiero que trabajemos en este orden, confirmando conmigo antes de pasar al siguiente bloque:

1. Scaffolding del proyecto Next.js + estructura de carpetas de PROJECT.md (sección 18) + esquema
   inicial de SQLite (tablas: videos, jobs, scenes, transcript_chunks, embeddings/vec0, skills).
2. Pipeline de ingesta: subir archivo o pegar URL → FFmpeg extrae metadata → se crea un job.
3. Integración con Gemini: enviar el video (File API), pedir el análisis multinivel descrito en
   PROJECT.md sección 8 (resumen, timeline con timestamps, objetos, texto en pantalla, transcripción
   sincronizada con video). Loguear tokens/costo aproximado por análisis.
4. Guardar el resultado en SQLite + generar embeddings de los fragmentos relevantes con sqlite-vec.
5. UI: pantalla de biblioteca, pantalla de carga, pantalla de resultados por capas (resumen, timeline,
   transcripción, objetos, texto, detalles), con estilo iOS/minimalista/elegante según PROJECT.md
   sección 20. Barra de progreso en vivo del análisis (no bloquear la UI).
6. Función "Crear Skill": detectar tramos con procesos reutilizables y generar
   carpetas Skill válidas (SKILL.md con frontmatter name/description según spec, + references/ o
   scripts/ si aplica), tal como se describe en PROJECT.md sección 12.
7. Función "Mejorar Skill": permitir subir/seleccionar una Skill existente y compararla contra un
   video analizado, proponiendo mejoras aplicables una por una (sección 13).
8. Búsqueda semántica en la biblioteca usando sqlite-vec.

No implementes todavía la Fase 2 (MCP/.mcpb) ni autenticación ni nada de las secciones marcadas
como "Excluido" en PROJECT.md sección 23 — esa es una fase posterior.

Antes de empezar a programar, dime si ves algún problema con alguna decisión de PROJECT.md o si
necesitas que te confirme algo, y luego arranca por el punto 1.
```

---

*Documento actualizado tras cerrar la investigación técnica (motor de video, memoria/vector search, MCP, formato de Skills y estimación de costes). Listo para entregarse a Claude Code.*
