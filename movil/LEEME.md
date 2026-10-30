# Móvil: widget de pantalla de bloqueo + web app

Todo se usa desde el iPhone. Los dos leen el mismo archivo: `pwa/estado.json`.
Para cambiar lo que muestran, se edita ese archivo (título, líneas y pendientes).

## 1. Widget de pantalla de bloqueo (Scriptable)
1. Instala **Scriptable** (gratis, App Store).
2. En Scriptable toca **+**, pega el contenido de `scriptable/pantalla-bloqueo.js` y ponle de nombre «Panel».
3. Mantén pulsada la pantalla de bloqueo, toca **Personalizar**, **Bloquear pantalla**, y añade el widget **Scriptable**
   (circular, rectangular o en línea). Tócalo, elige **Script: Panel**.
- Necesita que el repo sea público (lee `estado.json` desde raw.githubusercontent.com). Si no hay red, usa el último dato guardado.
- iOS decide cada cuánto se actualiza un widget; pide cada 15 min, pero puede tardar más.

## 2. Web app (PWA)
La carpeta `pwa/` es una página estática: tareas guardadas en el teléfono y el estado de `estado.json`.
Publícala gratis (por ejemplo en Cloudflare Pages, carpeta raíz `movil/pwa`) y ábrela en **Safari**.
Toca **Compartir** y luego **Añadir a pantalla de inicio**.
