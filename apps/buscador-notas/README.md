# Buscar notas (prueba de PWA con Obsidian 2.0)

Prueba de una app web que se instala en el iPhone desde Safari, sin App Store.
Busca en notas tomadas de **Obsidian 2.0** (4 notas de `proyectos/` e `indice.md`).

## Qué contiene
- `index.html`: la app (buscador con resaltado, modo oscuro, diseño para celular).
- `data/notas.json`: índice de notas (ruta, título, texto). Se copió de Obsidian 2.0 a mano.
- `manifest.webmanifest` + `icon-*.png`: nombre e icono para la pantalla de inicio.
- `sw.js`: service worker, para que abra sin internet.

## Probar en el iPhone
1. Publicar la carpeta en un sitio con HTTPS (por ejemplo GitHub Pages, Netlify o Cloudflare Pages).
   **Ojo:** eso hace públicas las notas del índice. Si la publicas, usa un repositorio privado y un hosting que lo permita, o no subas las notas reales.
2. En el iPhone, abre el enlace en **Safari**.
3. Toca **Compartir** → **Añadir a pantalla de inicio** → **Añadir**.
4. Abre el icono **Notas**: se abre a pantalla completa, como app.

## Limitaciones de esta prueba
- El índice es una copia. Si cambias una nota en Obsidian 2.0, hay que volver a generar `data/notas.json`.
- No se conecta en vivo a Obsidian 2.0. Para eso habría que exponer una ruta de búsqueda con CORS y guardar la llave de acceso de forma segura (no dentro de la página).
