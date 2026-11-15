# Estudio de pympress y qué se llevó a Proclama

La sección **Presentar PDF** de Proclama parte del estudio de [pympress](https://github.com/Cimbali/pympress), un presentador
de PDF para dos pantallas. Este documento explica cómo se estudió, qué se encontró y qué se hizo con eso.

## 1. Postura legal: se estudió el comportamiento, no se copió código

- pympress es software libre con licencia **GPL-2.0 o posterior** (`setup.cfg`, `LICENSE.txt`). Estudiarlo, usarlo y
  describir lo que hace es lo que esa licencia permite.
- **Proclama no incluye ni traduce ningún fragmento de su código.** Está escrito desde cero, en otro lenguaje (JavaScript para
  la web, no Python/GTK) y con otra arquitectura. Lo único que se tomó son *ideas de funcionamiento* (qué herramientas
  existen, qué atajos usan, cómo cambia el color del cronómetro), que no están protegidas por derechos de autor.
- REA, la herramienta usada para el estudio, rechaza expresamente copiar software propietario o reproducir su código y
  recursos (`DISCLAIMER.md` de morluto/rea). Este caso encaja: el objetivo es libre y no se copia nada.
- Los iconos, textos y estilos de Proclama son propios. No se usó ninguna imagen ni recurso de pympress.

## 2. Método

| Paso | Herramienta | Resultado |
|---|---|---|
| 1. Leer el código y la configuración por defecto | Lectura de `pympress/share/defaults.conf` y de los módulos (`ui`, `talk_time`, `pointer`, `scribble`, `extras`, `deck`) del commit `3750003` (20-mar-2026) | Lista de funciones, atajos y valores por defecto, con su archivo de origen |
| 2. Analizar el código con REA | `rea analyze` (REA 6.9.0, commit `5579890`) | **No sirvió:** REA analiza JavaScript/Electron, binarios, APK, .NET, firmware y sitios web. Sobre una carpeta de Python/GTK solo procesó 2 archivos HTML de la documentación (`ev_04df2718…`). Se descartó para el código fuente. |
| 3. Observar pympress funcionando con REA | `rea capture-desktop-application` sobre pympress 1.8.4 (paquete de Ubuntu), en un escritorio virtual (Xvfb + Openbox) con un PDF de 5 páginas | **Sí sirvió.** Evidencia `ev_e3149422…`: ver abajo |
| 4. Ver su interfaz real | Captura de pantalla de la ventana en ejecución | Distribución del presentador: página actual grande, siguiente pequeña, número de página, tiempo, estimación y reloj |

### Lo que REA observó (evidencia `ev_e314942230618982e74b2f0be452f235b5838143bbaab7a2b2cd646bf650513d`)

- Al abrir un PDF, pympress crea **exactamente dos ventanas** del mismo proceso: *Pympress Presenter* (consola del
  presentador) y *Pympress Content* (lo que ve el público). Ambas son ventanas normales de aplicación.
- Estado que deja en disco: un registro (`~/.cache/pympress.log`, con versiones de Python, GTK y Poppler) y la lista de
  archivos recientes del sistema (`~/.local/share/recently-used.xbel`). Es decir, su «historial» depende del sistema; el de
  Proclama es propio y caduca (ver §4).
- En esa sesión (abrir el PDF y mirarlo, sin tocar nada más) solo cambiaron esos dos archivos: no guardó copias del PDF.

> Nota: la captura se hizo en Linux sin pantalla doble ni sesión de usuario real. Describe qué ventanas y archivos crea, no
> cada pantalla de su interfaz; lo demás sale del código y de la ejecución.

## 3. Mapa de funciones

«Origen» indica dónde se vio la función en pympress.

| Función en pympress | Origen | En Proclama |
|---|---|---|
| Dos ventanas: presentador y contenido | REA (ventanas capturadas) | **Sí.** El presentador es la sección «Presentar PDF»; el contenido es el proyector (`/output`). |
| Página actual grande + siguiente pequeña | Captura de pantalla, `defaults.conf` (`[layout]`, `next_slide_count = 1`) | **Sí.** Tarjeta «Siguiente» con miniatura; al tocarla avanza. |
| Número de página editable «n/N» | Captura, atajo `goto-page = g` | **Sí.** Campo «Página n de N»; tecla `G`. |
| Atajos de avance: `→ ↓ Av Pág espacio` / `← ↑ Re Pág`, `Inicio`, `Fin` | `defaults.conf` `[shortcuts]` | **Sí**, mismos. |
| Cronómetro con pausa y reinicio (`P`, `R`) | `defaults.conf`, `talk_time.py` | **Sí.** Arranca solo al proyectar (en pympress arranca en pausa). |
| Duración prevista y color del tiempo: normal con más de 5 min; en 0 pasa a ámbar; −2,5 min y −5 min más urgente, mezclando colores | `talk_time.py` (`TimeLabelColorer`, `color_map`: 300 / 0 / −150 / −300 s) | **Sí**, mismos umbrales, con colores propios (ámbar → naranja → rojo). Tecla `T`. |
| Reloj de pared | Captura («Clock») | **Sí.** Tarjeta «Hora». |
| Pantalla en negro (`B`) | `defaults.conf` `blank-screen` | **Sí.** Botón «Negro» (ya existía en Proclama). |
| Cuadrícula de páginas (`D`) | `deck.py` (`switch_deck_overview`), `[deck-overview] max-slides-per-row = 6` | **Sí.** Botón «Páginas» y tira de miniaturas siempre visible. |
| Puntero láser (`L`), con color (rojo por defecto) y modos *continuo* / *manual* / *ninguno* | `pointer.py` (`PointerMode`), `[presenter] pointer = red` | **Sí**, modo continuo (sigue al cursor) con 3 colores. El modo manual (solo al hacer clic) no se incluyó: con el continuo basta y es más claro. |
| Resaltador y lápiz con 9 ajustes, borrador, deshacer/rehacer, borrar todo | `scribble.py`, `[highlight]` en `defaults.conf` (4 resaltadores translúcidos y lápices de 5 px) | **Sí.** 4 resaltadores + 3 lápices (teclas `1`–`7`), borrador (`0`), `Ctrl+Z`, `Ctrl+Mayús+Z`, «Borrar todo». Las anotaciones se recuerdan por página. |
| Lupa: recuadro que se acerca en la pantalla pública (`Z`, `U`) | `extras.py` (`start_zooming`, `track_zoom_target`) | **Sí.** Arrastrar un recuadro; `U` o «Quitar lupa». Se acerca la imagen de la página (ver límites). |
| Intercambiar pantallas (`S`) | `ui.py` (`swap_screens`) | **Sí**, con matices: ver §5. |
| Pantalla completa del contenido (`F`, `F11`) | `defaults.conf` | **Sí**, en la ventana del proyector (`F`). |
| Abrir otro archivo (`O`), recientes | `defaults.conf`, REA (archivos recientes) | **Sí, mejorado:** «Mis PDF» con historial propio y arrastrar y soltar. |
| Salir (`Q`, `Esc`) | `defaults.conf` | **Sí.** `Esc` por capas: cierra cuadrícula, luego herramienta, luego lupa y por último quita el PDF del proyector. |
| Notas del presentador (Beamer, LibreOffice, anotaciones del PDF) | README, `[notes position]` | **No, a propósito.** Sanmi indicó que no las necesita. |
| Vídeos, audios y GIF incrustados en el PDF | README | **No.** Fuera del alcance; los PDF de la iglesia son de texto e imágenes. |
| Enlaces dentro del PDF | `document.py` | **No.** Las páginas se convierten en imágenes. |
| Diseños de ventana configurables, temas, archivo de configuración | `[layout]`, `config.py` | **No.** Proclama usa un diseño único, pensado para no tener que configurar nada. |
| Reiniciar sin cerrar al cambiar el PDF | `ui.py` (`swap_document`) | **Sí.** Se cambia de PDF desde «Mis PDF». |

## 4. Lo que Proclama hace distinto (la interfaz)

- **Sin menús ni configuración:** todo está a la vista con nombres claros («Proyectar», «Siguiente», «Terminar», «Negro»…).
  pympress usa menús (Archivo, Presentación, Navegación…) y diálogos de preferencias.
- **Primero «Proyectar»:** antes de empezar, la consola muestra la primera página y solo «Proyectar» es el botón principal; las
  herramientas se activan al proyectar y la pantalla lo explica.
- **Aviso si falta el proyector** y botón para abrirlo; el botón de la cabecera se pone verde cuando está conectado.
- **Historial con caducidad:** los PDF se guardan como imágenes de sus páginas y, si pasan **14 días sin abrirse**, se quitan
  solos junto con sus páginas (cuenta desde la última vez que se abrieron). Cada PDF muestra cuántos días le quedan.
- **Integrado con el culto:** un PDF se puede añadir al programa del culto, se controla también desde el celular (miniaturas
  de las páginas) y comparte proyector, pantalla negra, alertas y cuenta regresiva con el resto de la app.
- **Equipos modestos:** cada página se prepara una sola vez (JPEG de 1920×1080 y miniatura), se precarga la siguiente en el
  proyector y el puntero y los trazos viajan como mensajes pequeños.

## 5. Límites conocidos

- **Lupa:** acerca la imagen de la página (1920 px de ancho como máximo), así que a más de 2–3 aumentos el texto se ve suave.
  pympress vuelve a dibujar el PDF a mayor resolución al acercar.
- **Intercambiar pantallas:** un navegador no puede mover su propia ventana principal. Con dos pantallas, Chrome y Edge dejan
  colocar el *proyector* (piden permiso una vez) y «Intercambiar» lo lleva a la otra pantalla. En otro navegador, o con una
  sola pantalla, se arrastra la ventana. **No se probó con dos monitores reales**, solo que no falle sin ellos.
- **PDF escaneados o con contraseña:** se muestran como imágenes (un escaneado funciona igual); los protegidos con
  contraseña no se abren. Máximo 500 páginas por PDF.
- **Sin notas, vídeo ni enlaces** (ver §3).

## 6. Cómo repetir el estudio

```bash
# pympress y su comportamiento
apt install pympress xvfb openbox x11-utils
git clone https://github.com/Cimbali/pympress
# REA (necesita Node 22.19+)
npx -y rea-agents@latest capture-desktop-application --executable /usr/bin/python3.12 \
  --argument /usr/bin/pympress --argument prueba.pdf --output salida/ --max-duration-seconds 45
# (en Ubuntu 24.04 con otro python3 por defecto, usar el python3.12 del sistema; hace falta un gestor de ventanas EWMH)
```
