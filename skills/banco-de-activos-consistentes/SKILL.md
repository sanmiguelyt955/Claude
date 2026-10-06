---
name: banco-de-activos-consistentes
description: Crea, fija y reutiliza los activos de un video de dropshipping hecho con IA (avatar/personaje, fondo/escenario, producto con su hoja de detalles, artículos secundarios y recursos como primer cuadro o últimos fotogramas) para que NO cambien entre clips. Úsala SIEMPRE que el usuario pida crear o "fijar" un avatar, personaje, fondo, producto, prop, "recurso" o "referencia", cuando diga que el personaje o el producto "cambia", "se pierde el detalle" o "no sale igual" entre clips, antes de generar cualquier video en Google Flow, Firefly, Kling o Seedance, o cuando quiera una biblioteca/banco/bible de activos de un producto. Orquesta las skills casting-avatar-para-video-viral, creacion-de-backgrounds, fondos-producto, diferentes-planos-y-angulos y descripcion-por-imagen-de-producto, y agrega el flujo operativo probado en Flow (9:16, 2K, ingredientes, encadenar fotogramas).
---

# Banco de Activos Consistentes

Un activo es una imagen maestra que se genera UNA vez, se revisa, se sube a 2K y se reutiliza como referencia en todos los prompts. El prompt de video ya no vuelve a describir al personaje ni al producto: solo dice "el hombre de la referencia 1", "el calendario de la referencia 2". Eso es lo que evita que cambien.

## Reglas fijas del usuario (no reinterpretar)

- **Formato SIEMPRE 9:16 vertical** en imágenes y videos de dropshipping. Si una herramienta no ofrece 9:16, avisar ANTES de generar y proponer otra (en Firefly, GPT Image 2.5 no lo ofrece; Nano Banana Pro sí).
- **Calidad: descargar siempre la versión 2K** de cada activo final (icono de descarga del editor → "2K Reescalado", 1536x2752 en 9:16, incluido en el plan Plus). El 4K requiere subir de plan: no tocarlo.
- **Guion SIEMPRE hablado** (voz en off); el precio no aparece en el video.
- **Pipeline completo antes de generar video:** validar producto → guion + hook → activos y ángulos → shot list → recién ahí el prompt de video. Nunca improvisar el prompt de generación.
- **Sin marcas, emblemas, logos ni letras de terceros** en autos, productos o ropa. Describir el objeto, no nombrar marca ni modelo. Revisar el activo a 2K: a esa resolución aparecen insignias diminutas (fender, parrilla, centro del rin) que a 1K no se ven; si aparecen, quitarlas con una edición dirigida y volver a descargar.
- **Look orgánico, no anuncio, y sin efectos.** El video debe parecer grabado con un celular. Nada de destellos, transiciones generadas, "cinematic" ni "movie trailer", salvo que el usuario lo pida y se vea bien.
- **El tamaño de los objetos es parte del activo** (ver "Escala de los objetos"): un objeto no cambia de tamaño ni aparece de la nada.
- **Mostrar el costo en créditos antes de generar video** y confirmar. Las imágenes en Flow con Nano Banana Pro costaron 0 créditos.
- El producto real manda: si el activo es una recreación o render, avisar al usuario y contrastar con la ficha del proveedor (riesgo de reclamos por publicidad engañosa).

## Tipos de activo y cómo se crea cada uno

Para cada tipo: 1) definir la ficha, 2) generar la maestra, 3) revisar con el checklist, 4) descargar 2K, 5) registrar en `ACTIVOS.md` (plantilla en `references/plantilla-ACTIVOS.md`). Los prompts maestros en inglés están en `references/prompts-maestros.md`.

### 1. Avatar / personaje
Delegar la elección del perfil en `casting-avatar-para-video-viral`. Después:
- **Ficha fija** (no cambia nunca): edad aproximada (adulto), rasgos de rostro, pelo, ropa exacta, accesorios, postura base. Anotarla en el registro.
- **Maestra:** retrato de cintura para arriba, 9:16, fondo neutro, luz suave, expresión neutra. Opcional: una segunda imagen con sus expresiones clave (sorpresa contenida, sonrisa suave) para reutilizar.
- **Nunca** describir al avatar de nuevo en el prompt de video: adjuntarlo como ingrediente y escribir "the same man from the reference".
- **Una persona por clip** siempre que se pueda. Las escenas con dos personas en cuadro fallaron (composición rara, tono menos natural). La segunda persona puede entrar solo como brazo o mano.
- **Menores:** nunca con edad exacta ni contacto físico con un adulto; ponerlos a distancia, reaccionando.
- **Continuidad entre clips:** el último fotograma del clip anterior es el primer cuadro del siguiente (ver "Encadenar clips").

### 2. Fondo / escenario
Delegar el estilo en `creacion-de-backgrounds` y `fondos-producto`. Reglas:
- Generar el fondo vacío (sin personas), 9:16, con la luz definida (hora, temperatura, fuentes). Un solo escenario por activo.
- Si el fondo va a coincidir con un producto de temporada (Navidad), fijar los elementos (árbol, luces, mesa).
- Mantener el mismo fondo en todos los clips de la misma historia; si el video cambia de lugar, crear otro activo con su propio id.

### 3. Producto + hoja de detalles
Primero describir el producto con `descripcion-por-imagen-de-producto`, y los ángulos con `diferentes-planos-y-angulos`. Lecciones comprobadas:
- **Productos con texto o números** (calendarios, cajas con título, paneles numerados): generar la imagen **solo con texto, sin imagen adjunta**, dictando el contenido fila por fila ("top row 1 2 3 4 5 6, second row 7 8 9 10 11 12…") y repitiendo "only four rows high, never five" y "every number appears exactly once". Con la imagen original adjunta el modelo copió sus errores (fila de más, números repetidos).
- **No editar en cadena** para corregir números: tres ediciones seguidas arrastraron el mismo error. Regenerar desde texto.
- **Portada o arte original:** recortar del original SOLO esa pieza (con ffmpeg), subirla y pedir "replace only the front cover artwork with the cover design from the attached image, keep everything else identical". Así se conserva la portada real sin heredar los errores del resto.
- **No usar la imagen promocional completa** (banner, texto, muchos objetos) como referencia: el modelo la copia literal como toma final.
- **Hoja de detalles** (recursos de detalle): imágenes macro de la textura, los números, la portada, el mecanismo (cajón abierto) y el producto en uso. Se generan igual que el producto, una por detalle, y se guardan como activos tipo `DETALLE`. Sirven de inserts en los clips con cambios de plano.
- Cuando el producto se abre o transforma, generar un activo por estado (cerrado, abierto).

### 4. Artículos secundarios / props
Miniaturas, cajas, herramientas, ropa. Mismo flujo: generar solo, fondo neutro, 9:16, sin marcas, a 2K. Si el prop es la versión pequeña de otro activo (mini y auto real), generar el grande primero y describir el pequeño a partir de él, para que sean idénticos.

### Escala de los objetos y objetos que "aparecen de la nada"
- **Fijar el tamaño real en el activo y en el prompt.** Ejemplo del proyecto del calendario: el mini es un auto de colección a escala 1:64, de unos 7 cm, que cabe en la palma de la mano y en un cajón de la misma medida que sus vecinos. Escribirlo así: "a small 1:64 die-cast car, about 7 cm long, fits in the palm of the hand". Sin la medida, el modelo lo infla hasta el largo de un antebrazo.
- **El cajón o el empaque no cambia de tamaño** al abrirse: "the drawer is the same width as the neighboring drawers".
- **Un objeto nunca debe aparecer de la nada.** Si el clip lo muestra en la mano, el primer cuadro ya debe tenerlo. Crear una imagen de activo con el objeto en la mano a la escala correcta (edición del último fotograma del clip anterior: "he holds a small 1:64 die-cast black car in his open palm") y usarla como primer cuadro. Si el objeto sale de un cajón, que ese gesto esté dentro del mismo clip.
- **No mezclar el producto con números junto a otras referencias en el modo Ingredientes:** con calendario + hombre + auto, la cuadrícula salió con más columnas y números repetidos. Los planos del producto numerado se generan en modo Fotogramas, con la maestra 2K como primer cuadro, solos y cortos.
- Revisar cada clip a velocidad normal y fotograma por fotograma: tamaño del objeto, números, objetos que entran o salen, destellos.

### 5. Recursos de continuidad
- **Último fotograma** de un clip aprobado, usado como primer cuadro del siguiente.
- **Primer cuadro** de producto: la maestra 2K del producto cuando el clip muestra números o detalles impresos (el modelo anima la foto en vez de redibujarla).
- **Recortes** de portada u otras piezas originales.

## Flujo operativo en Google Flow (probado)

1. Abrir el proyecto, modo imagen: **Nano Banana Pro, 9:16, x1 o x2**. El chip de ajustes muestra el costo.
2. Generar y revisar. Para ajustar: usar el editor ("¿Qué quieres cambiar?") con instrucciones dirigidas y "keep everything else identical".
3. **Descargar 2K** (icono de descarga → 2K Reescalado) y revisar a ese tamaño antes de aprobar.
4. Subir las referencias aprobadas al proyecto (botón "+" → "Cargar contenido"). Esa acción abre el selector nativo del sistema, que Claude no puede manejar: lo más seguro es que **el usuario suba los archivos**. Alternativa probada: servir el archivo desde un servidor local con CORS e interceptar el clic del input en el navegador. Esa alternativa activó una vez el aviso "unusual activity"; si se repite, parar y pedir que el usuario suba.
5. Video: modo **Video, Omni 1.1 Flash, 9:16, 720p**. Costos observados: 4 s = 7 créditos, 6 s = 10, 8 s = 12.
   - **Ingredientes:** hasta tres imágenes de referencia (personaje, producto, auto). Usar para escenas con varios activos o varios planos.
   - **Fotogramas:** primer cuadro (y último). Usar cuando el detalle impreso debe mantenerse (el calendario con números).
6. Revisar el clip fotograma por fotograma antes de seguir (descargar y extraer con ffmpeg, o recorrer la línea de tiempo).

### Firefly (plan B)
En una sesión, GPT Image 2.5 (Sunburst y Flare) devolvió 408 "system under load" en todos los intentos, no ofrece 9:16 y limita el prompt a 1024 caracteres; Nano Banana Pro en Firefly también falló ese día. Si pasa, pasar a Flow en vez de reintentar a ciegas.

## Encadenar clips y planos múltiples

- **Encadenar:** `ffmpeg -sseof -0.05 -i clip.mp4 -frames:v 1 -q:v 2 ultimo.jpg`, subirlo y usarlo como primer cuadro del siguiente clip. Mantiene al mismo personaje, el mismo lugar y los mismos objetos.
- **Más energía, pero orgánica:** el usuario quiere variedad de ángulos para no aburrir, y que se vea como un video casero, NO como un anuncio. Probado: un solo prompt de 6 tomas con "movie trailer, whip pans, punch-ins" dio look de anuncio, destellos de luz, números deformados, cambios de escala y objetos que aparecen de la nada. Lo que sí funciona: **un clip corto por plano** (4 s), cada uno con su primer cuadro fijo y UNA acción, y los cortes cada 1 a 1.5 s se hacen en la edición (CapCut). Si se usa un prompt multi-toma, máximo 2 o 3 tomas, sin el producto numerado.
- **Look orgánico:** pedir "shot on a phone, handheld with natural small shakes, slightly off-center framing, mixed indoor lighting, a bit underexposed, no cinematic bokeh, slight grain". NO escribir "cinematic", "movie trailer", "trailer", "lens flare", "light leak", "slow motion", "whip pan" ni "punch-in". Ningún efecto de luz ni transición generada, salvo que el usuario lo pida y quede bien.
- **Cámara en mano estable:** pedir "keep the framing stable, no tilting up to the ceiling"; sin esa frase el balanceo llegó a mostrar el techo.
- **Reacciones:** pedir "believable, restrained surprise: eyebrows up, mouth slightly open, not exaggerated, not cartoonish". Para que mire a otra persona, decir hacia dónde mira.
- **Objetos que cambian de tamaño o se abren:** el modelo puede abrir otro cajón u ocupar varias columnas. Revisar y, si importa, regenerar o recortar.

## Checklist antes de aprobar un activo

- [ ] 9:16 y descargado en 2K.
- [ ] Sin marcas, emblemas, logos ni letras en ninguna superficie (revisar parrilla, salpicaderas, rines, camisas, cajas).
- [ ] Números y texto correctos (contar filas y columnas, leer cada número).
- [ ] Un solo sujeto principal y fondo limpio, salvo que sea un fondo/escenario.
- [ ] Coincide con la ficha fija (avatar) o con el producto real (color, forma, estructura).
- [ ] Registrado en `ACTIVOS.md` con su prompt maestro.

## Orden de trabajo para un producto nuevo

1. `busqueda-productos-ganadores-ia` (validar) → `guion-experto-dropshipping` y `hook-1/2/3` (guion y hook).
2. **Esta skill:** crear avatar, fondo, producto y detalles; descargar 2K; subir; registrar.
3. `guion-produccion-detallado` (shot list con varios planos).
4. Prompts de video por clip usando las referencias, y cadena de fotogramas.
5. Montaje: recortar cada clip, añadir texto en pantalla, voz en off y audio.

## Errores que ya costaron tiempo

- Prompt de 9 paneles en 9:16 para un producto con números: los números salieron mal.
- Editar la misma imagen tres veces para quitar una fila: el error se arrastró.
- Subir la imagen original completa como referencia: se copió su desorden.
- Escenas con dos personas: peor composición y reacción menos natural.
- Empezar a generar video sin shot list y sin referencias fijas.
