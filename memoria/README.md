# Memoria

Tus notas y archivos en la nube, enlazados como en Obsidian y conectados a
Claude. Funciona en Cloudflare (plan gratuito): siempre encendida, desde la
computadora, el celular y cualquier chat de Claude.

## Qué hace

- **Notas en Markdown**, compatibles con Obsidian: `[[enlaces]]`, `![[incrustar]]`,
  `#etiquetas`, propiedades entre `---`, avisos `> [!note]`, tareas `- [ ]`, tablas.
- **Conexiones:** qué notas enlazan a cada una, menciones sin enlace, enlaces
  rotos, esquema de títulos, grafo local y mapa de todas las notas.
- **Renombrar o mover** una nota o carpeta arregla los enlaces de las demás.
- **Búsqueda** sin importar acentos, con `tag:`, `path:`, `file:`, `"frase"` y `-palabra`.
- **Nada se pierde:** papelera, historial de cada nota (restaurar con un clic),
  aviso de conflicto si dos sitios editan a la vez, archivos reemplazados guardados aparte.
- **Archivos:** imágenes, PDF, audio, video… (hasta 100 MB cada uno). Se pueden
  pegar o soltar en el editor.
- **Importar:** una carpeta o un `.zip` de Obsidian, o un repositorio público de
  GitHub. **Exportar:** todo en un `.zip` que se abre en Obsidian.
- Nota del día, plantillas, marcadores, selector rápido (Ctrl+O), comandos (Ctrl+P).
- **Conector para Claude** (`/mcp`): en cualquier chat, Claude puede cargar el
  contexto, buscar, leer, escribir, recordar y subir archivos.

## Publicarla (una sola vez)

La base de datos (`memoria`), el almacén de archivos (`memoria-archivos`) y el
registro de accesos (`memoria-oauth`) ya existen en la cuenta de Cloudflare.

1. En <https://dash.cloudflare.com> → **Workers & Pages** → **Create** →
   **Import a repository** → elige `sanmiguelyt955/Claude`.
2. Nombre del proyecto: `memoria`. **Root directory:** `memoria`.
   **Deploy command:** `npx wrangler deploy`. Rama: la que tenga esta carpeta.
3. Cuando termine, en el Worker `memoria` → **Settings** → **Variables and
   Secrets** → **Add** → tipo **Secret**, nombre `MEMORIA_PASSWORD`, y tu
   contraseña (mínimo 8 caracteres). Guarda.
4. Abre `https://memoria.<tu-cuenta>.workers.dev` y entra con esa contraseña.
5. **Ajustes → Importar desde GitHub** → `sanmiguelyt955/memoria-claude` para
   traer la memoria que ya existe.

Cada cambio que se sube a esa rama se publica solo.

## Conectarla a Claude

En claude.ai → **Ajustes → Conectores → Añadir conector personalizado** →
`https://memoria.<tu-cuenta>.workers.dev/mcp`. Pide la misma contraseña. Desde
entonces está en todos los chats y en Claude Code.

## Conectar Video Analyzer

En Memoria → **Ajustes → Claves de acceso → Crear clave**. En el
`.env.local` de Video Analyzer:

```
MEMORIA_URL=https://memoria.<tu-cuenta>.workers.dev
MEMORIA_KEY=mem_…
```

El botón pasa a ser **Guardar en Memoria**.

## Para programar

```bash
npm install
npm run db:local                 # base local
printf 'MEMORIA_PASSWORD=prueba-local-1234\n' > .dev.vars
npm run dev                      # http://127.0.0.1:8787
npm test                         # unitarias
MEMORIA_URL=http://127.0.0.1:8787 MEMORIA_PASSWORD=prueba-local-1234 npm test   # + de punta a punta
```

- `src/index.ts`: OAuth para Claude, rutas.
- `src/api.ts`: API de la app.
- `src/mcp.ts`: herramientas para Claude.
- `src/store.ts`: notas, versiones, enlaces, archivos.
- `src/parse.ts`: Markdown como lo lee Obsidian.
- `public/`: la app web, sin compilar.
- `scripts/importar.mjs`: subir una carpeta desde la terminal.
