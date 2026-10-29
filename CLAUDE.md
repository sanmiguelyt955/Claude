# CLAUDE.md

Instrucciones para Claude Code en todo este repositorio. Cada proyecto puede
tener su propio CLAUDE.md (por ejemplo `video-analyzer/CLAUDE.md`).

## REA: SIEMPRE (regla del usuario)

Para revisar, medir, explorar sitios o APIs, recorrer la app en un navegador
y capturar lo que hace un comando, usa **REA** (`morluto/rea`, paquete
`rea-agents`), **siempre**, no solo cuando sea cómodo. Lo pidió el usuario
varias veces ("Usa REA para todo", "haz REA, SIEMPRE").

- Instalar si falta: `cd /tmp/claude-0/rea && npm install rea-agents@6.8.0`
  (en una sesión nueva `/tmp` está vacío; si el disco está lleno, limpiar cachés primero).
- Recorrer una web o la app: `npx rea capture-browser-scenario escenario.json --format json`
  (Chromium en `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`; pasos `goto`,
  `click`, `fill`, `press`, `wait_for`; `capture.events: ["console","page-errors","network"]`).
- Capturar un comando y resumirlo: `node video-analyzer/scripts/rea-capture.mjs -- <comando>`.
- Si REA no puede con algo, dilo y explica por qué; no lo saltes en silencio.

### Ingeniería inversa: siempre este flujo, siempre con REA

Cuando el usuario pida «ingeniería inversa» de una app, página o función:

1. Investigar **una función** (no la app entera) con REA.
2. Reunir **Evidencia** (red, DOM, archivos, binario).
3. Rastrear la función completa.
4. Escribir una **especificación clean-room** (en palabras propias, sin pegar código del original).
5. Construir una **implementación independiente** a partir de ella.
6. **Compararla** con el original autorizado (REA `compare` / `environment-compare`).
7. Dejar **a la vista cada fallo e incógnita**; lo que no se pudo comprobar, se dice.

Solo objetivos autorizados; se estudia el comportamiento, no se copia código ni se quitan protecciones.
Detalle y mapa de recursos: nota «Flujo de ingeniería inversa con REA» en la memoria.

## Repos que menciona el usuario: buscar al autor

Cuando el usuario nombre un repositorio sin dueño (por ejemplo «Claude-Mem»),
**busca tú al autor** (`search_repositories`, la web) antes de usarlo; el
usuario solo da el nombre para que lo busques. No asumas que es suyo:
confirma de quién es y di el dueño completo (`autor/repo`).
Ejemplo ya resuelto: «Claude-Mem» es `thedotmack/claude-mem` (de otra persona).

## Memoria: no olvidar entre sesiones

La memoria permanente del usuario y de Claude vive en **Memoria**
(`memoria/`, publicada en Cloudflare). Se usa desde el conector MCP
«Memoria» de claude.ai, disponible en todos los chats y en Claude Code.

- **Al empezar** una sesión de trabajo, si las herramientas de Memoria
  están disponibles (`memoria_contexto`, `buscar`, `recordar`…), llama a
  `memoria_contexto` y ten en cuenta lo que diga: objetivos, preferencias
  del usuario, decisiones y tropiezos ya conocidos.
- **Antes de responder** sobre trabajo anterior, decisiones o preferencias,
  busca con `buscar`.
- **Durante y al terminar:** guarda lo que valga la pena recordar.
  - Apuntes rápidos con `recordar`: decisiones, mediciones, algo que falló y por qué.
  - Notas completas con `agregar_a_nota` o `escribir_nota`, con `[[enlaces]]`
    a las notas relacionadas (`brain/Key Decisions`, `brain/Gotchas`, la nota del proyecto).
- Nunca guardes claves, tokens ni contraseñas.
- Si el conector no está disponible, usa la copia en GitHub: al empezar
  `bash scripts/memoria-sync.sh start` (baja `sanmiguelyt955/memoria-claude` a
  `~/memoria-claude` y muestra lo esencial); escribe las notas en esa carpeta
  (Markdown con `[[enlaces]]`); y al terminar cada trabajo
  `bash scripts/memoria-sync.sh stop` (la sube a GitHub). Necesita que
  `memoria-claude` esté agregado a la sesión; si no puede subir, lo dice.
- Si ni eso es posible, dilo una vez y ponlo al final de tu respuesta.
