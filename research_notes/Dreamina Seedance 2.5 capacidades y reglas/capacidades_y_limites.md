# Dreamina Seedance 2.5 (ByteDance): capacidades y límites

Estado a 8 de octubre de 2026. Enfoque: clips de 10 s en 9:16 para anuncios de dropshipping.

Nota de fuentes: no encontré documentación oficial de Dreamina/CapCut ni de ModelArk/Volcano Engine que liste de forma completa los límites de Seedance 2.5. Las cifras de esta nota proceden de PiAPI, Replicate, ofox.ai y otros sitios de terceros (revendedores de API y blogs). Están marcadas como "terceros" cuando corresponde. La página oficial de Dreamina sobre la relación de aspecto (dreamina.capcut.com) no publica duración, resolución ni número de referencias. La página de BytePlus sobre activos de personas reales se capturó sin cuerpo de texto. La frase "no permite generar videos a partir de imágenes de personas reales" que indicó el usuario no aparece textualmente en ninguna fuente encontrada; la regla existe, pero su redacción exacta no está verificada.

## Duración máxima por clip (y si 10 s y 12 s están soportados)

### Takeaway
Según varias fuentes de terceros, la API acepta duraciones enteras de 4 a 30 s (o -1 para que el modelo decida). Los 10 s están dentro de ese rango y son válidos según esas fuentes. Los 12 s no aparecen en ninguna lista de duraciones de ejemplo, así que no están confirmados.

### Cited Findings
- Duración entera de 4 a 30 s, o -1 para duración inteligente (parámetro `duration` en Replicate) — [Replicate, Seedance 2.5 readme](https://replicate.com/bytedance/seedance-2.5/readme) (dato obtenido de la página, en terceros de la API de Replicate)
- Duración de 4 a 30 s; "Generate 5, 8, 10, 15, 20, 25, or 30-second clips, with 5 seconds as the default" — [PiAPI, Seedance 2.5](https://piapi.ai/seedance-2-5) (terceros)
- Rango de 4 a 30 s o -1 para la edición de video, que requiere `duration` en -1; la guía de terceros cita "Source: ByteDance's Seedance 2.5 tutorial" sin enlazarlo — [ofox.ai, guía de Seedance 2.5](https://ofox.ai/blog/how-to-use-seedance-2-5-prompts-timestamps-cost-2026/) (terceros)
- Seedance 2.0 estaba limitado a 15 s; el mensaje de error citado es "duration 30 out of range [4, 15]" — [ofox.ai](https://ofox.ai/blog/how-to-use-seedance-2-5-prompts-timestamps-cost-2026/) (terceros)
- Hasta 30 s por generación, sin fuente citada — [MindStudio](https://www.mindstudio.ai/blog/what-is-seedance-25-bytedance-video-model) (terceros, afirmación no respaldada)
- Un resumen de búsqueda atribuye a un artículo de Beijing Business Today (10 ago 2026) la frase "native 30-second video output" en el lanzamiento de la API de Volcano Engine; no pude abrir la página (403) — [Beijing Business Today](https://www.bbtnews.com.cn/2026/0810/601734.shtml) (solo vista del resumen, no verificado)

### Inferences
- Para un anuncio de 10 s, la configuración más segura es `duration: 10` explícito. Según las fuentes de terceros, es un valor válido. Un valor fijo evita depender de `-1`.
- Para 12 s, no hay evidencia suficiente. Si se usa 12 s, conviene probarlo en la interfaz antes de planificar la producción. Si no se puede, generar 15 s y recortar a 10 s es una alternativa razonable, aunque esto no está verificado en ninguna fuente.

### Gaps
- No encontré una lista oficial de duraciones válidas en Dreamina (la app de consumo), ni en Dola. Los valores de arriba se refieren a la API. Puede haber restricciones distintas en la interfaz de Dreamina.
- No verifiqué si 12 s es válido. Ninguna fuente lo menciona.
- La página de layer3labs, que trataba los límites de 2.5, describe el modelo como un modelo de lenguaje con ventana de contexto. No la uso como fuente de límites de video.

## Relaciones de aspecto (9:16) y resoluciones (480p/720p/1080p)

### Takeaway
La relación 9:16 está soportada según PiAPI y ofox.ai, que listan 21:9, 16:9, 9:16, 4:3, 1:1, 3:4 y "adaptive". Dreamina recomienda 9:16 para Shorts, Reels, TikTok y anuncios móviles. La resolución confirmada es 480p y 720p. El soporte de 1080p está anunciado pero es dudoso, y 4K no figura en las fuentes fiables.

### Cited Findings
- Relaciones de aspecto de 2.5: 21:9, 16:9, 9:16, 4:3, 1:1, 3:4; "When an image reference is supplied, its aspect ratio takes precedence over the requested one" — [PiAPI](https://piapi.ai/seedance-2-5) (terceros)
- Tabla de capacidades de ofox: "output ratios from 21:9 through 9:16, plus 'adaptive'"; según ofox, la tabla es idéntica en 2.0 y 2.5 — [ofox.ai](https://ofox.ai/blog/how-to-use-seedance-2-5-prompts-timestamps-cost-2026/) (terceros)
- Ratios "in [0.4, 2.5] via input assets"; la edición, la extensión y el primer fotograma requieren `ratio: "adaptive"` — [ofox.ai](https://ofox.ai/blog/how-to-use-seedance-2-5-prompts-timestamps-cost-2026/) (terceros)
- Dreamina recomienda "use 9:16 for Shorts, Reels, TikTok, and mobile ads" (el texto es de la página oficial de Dreamina, pero es una recomendación de uso, no una lista de opciones) — [Dreamina, aspect ratio de Seedance 2.5](https://dreamina.capcut.com/seedance/seedance-2-5-aspect-ratio) (oficial, sin lista de valores)
- Resoluciones: 480p, 720p, 1080p en PiAPI; la API de PiAPI devolvió "resolution '1080p' not supported; allowed: [480p 720p]" — [PiAPI](https://piapi.ai/seedance-2-5); [ofox.ai](https://ofox.ai/blog/how-to-use-seedance-2-5-prompts-timestamps-cost-2026/) (terceros)
- Según ofox, ByteDance anunció en su aviso de precios: "will officially support 1080p output starting from August 17, 2026, Beijing time." La misma guía indica que 4K no está en 2.5 y que sigue siendo exclusivo de 2.0 — [ofox.ai](https://ofox.ai/blog/how-to-use-seedance-2-5-prompts-timestamps-cost-2026/) (terceros citando al aviso de ByteDance; el aviso no lo pude abrir)
- Sitios de terceros afirman salida 4K nativa en 2.5 (MindStudio) o "up to 4K" (resumen de búsqueda); esto contradice a ofox y PiAPI — [MindStudio](https://www.mindstudio.ai/blog/what-is-seedance-25-bytedance-video-model) (terceros, sin fuente citada)

### Inferences
- 9:16 es la relación de aspecto correcta para el formato del proyecto y está soportada por la lista de terceros. Hay que confirmarla en la interfaz antes de producir en serie.
- 720p es la resolución más segura para generar hoy. Para anuncios móviles de 9:16, 720p suele ser suficiente, pero esto es una opinión de producción, no un dato de las fuentes.
- No conviene planificar 1080p ni 4K hasta confirmar en la propia interfaz que están activos. La fecha del 17 de agosto de 2026 ya pasó y el test de PiAPI era anterior a esa fecha, así que el estado actual está sin verificar.

### Gaps
- No encontré una lista oficial de relaciones de aspecto para Dreamina en 2.5. La lista de PiAPI y ofox viene de API de terceros.
- No hay confirmación de que 1080p esté activo a fecha de octubre de 2026.
- No verifiqué si la salida con audio es opcional o siempre activa (ver sección de entradas).

## Número máximo de imágenes de referencia y otras entradas

### Takeaway
La cifra más citada es de hasta 50 referencias por generación: 30 imágenes, 10 videos y 10 audios. Varias fuentes coinciden en esta cifra, pero todas son de terceros. Según ofox, las imágenes pueden tener hasta 4K cada una; hay recomendaciones de 1 a 8 sujetos.

### Cited Findings
- Hasta 30 imágenes, 10 clips de video (30 s en total) y 10 audios (30 s en total) por generación; referencias en el prompt como @image1, @video1, @audio1 — [Replicate](https://replicate.com/bytedance/seedance-2.5/readme) y [PiAPI](https://piapi.ai/seedance-2-5) (terceros; PiAPI no publica el límite por tipo, solo confirma que existen imagen, video y audio)
- Límite total de 50 activos por tarea (30 imágenes, 10 videos, 10 audios); hasta 15 paneles de storyboard; imágenes hasta 4K cada una; recomendado de 1 a 8 sujetos, con 9 a 12 descrito como inestable; videos de 5 a 10 s cada uno — [ofox.ai](https://ofox.ai/blog/how-to-use-seedance-2-5-prompts-timestamps-cost-2026/) (terceros, cita "ByteDance's Seedance 2.5 prompt guide")
- Frente a 2.0, que tenía 15 activos — [ofox.ai](https://ofox.ai/blog/how-to-use-seedance-2-5-prompts-timestamps-cost-2026/) (terceros)
- Cifras de "50 multimodal inputs" y tipos de referencia (imagen, estilo, texto, dirección de escena, activos de marca), sin límites por tipo — [MindStudio](https://www.mindstudio.ai/blog/what-is-seedance-25-bytedance-video-model) (terceros)
- Entrada de audio: MindStudio dice que la salida es silenciosa y que la sincronía de audio se hace después; PiAPI y ofox citan audio de referencia; Zalify y videoai.me afirman que el audio se genera siempre — [MindStudio](https://www.mindstudio.ai/blog/what-is-seedance-25-bytedance-video-model); [PiAPI](https://piapi.ai/seedance-2-5) (terceros, en conflicto)

### Inferences
- Para un anuncio de 10 s con un producto, un número de referencias moderado (1 a 3 imágenes del producto más una del modelo) es suficiente y se mantiene dentro del rango recomendado de sujetos. No hace falta llegar a 50.
- El conflicto sobre el audio importa para el guion: si el modelo genera audio propio, hay que decidir si se usa o se reemplaza con voz en off. Esto debe confirmarse en una prueba.

### Gaps
- No hay límite oficial de referencias por tipo en fuentes primarias.
- No hay límite de tamaño de archivo ni formatos aceptados. PiAPI y Replicate tampoco lo publican.
- No está claro si el audio de salida es siempre generado o es opcional.

## Regla de personas reales: qué bloquea y cuál es la alternativa documentada

### Takeaway
Hay una restricción vigente para rostros humanos reales en las imágenes o videos de referencia. Según varias fuentes, ModelArk la documenta para la serie Seedance 2.5 y 2.0. Dreamina la muestra con la nota "Real human faces are not supported" en la versión 2.0, según usuarios que lo reportan. Las vías oficiales son: bibliotecas de personajes virtuales predefinidos, activos de persona real autorizada (con verificación) y reutilizar salidas generadas por la propia cuenta. No hay evidencia de un método de evasión aceptado, y las fuentes lo desaconsejan.

### Cited Findings
- En Dreamina, el modelo Seedance 2.0 muestra la nota "Real human faces are not supported", y la subida de un rostro devuelve "Face detected in your media. Try another one." — [Vicsee](https://vicsee.com/blog/seedance-2-0-face-workaround) (terceros; resumen de búsqueda). Un usuario lo documenta en X con una captura de la nota — [Alisa Qian en X](https://x.com/alisaqqt/status/2020877903102460321) (testimonio de usuario, 2.0)
- Afirmación de ModelArk: "Seedance 2.5 and 2.0 series models do not accept uploaded reference images or videos that contain real human faces." Esta frase aparece en un resumen de búsqueda que cita documentación de ByteDance. No pude abrir la página de BytePlus (solo navegación) — [BytePlus ModelArk, "Add real-human assets to asset library"](https://docs.byteplus.com/en/docs/ModelArk/2315856) (oficial, sin cuerpo de texto; la frase no está verificada)
- En PiAPI, el modo estándar de 2.5 no menciona reglas sobre rostros, y dice "Content policies and reference-asset review still apply." En el modo "less-restriction", los rostros deben subirse a la biblioteca de activos y verificarse antes de usarse, y el activo debe estar en estado Active — [PiAPI](https://piapi.ai/seedance-2-5) (terceros)
- Desde el lado de los bloqueos: la pantalla puede bloquear por "recognizable likeness without clear permission", y el bloqueo puede venir de la imagen, del texto o de la combinación; un personaje genérico se trata como más seguro — [Seedance.tv](https://www.seedance.tv/blog/seedance-safety-filters-real-faces-image-prompts-2026) (terceros, sin fuente oficial citada)
- Alternativas que mencionan las fuentes: (1) personajes virtuales de la biblioteca de la plataforma, referenciados como `asset://<ID>`; (2) un retrato generado (Seedream) como referencia; (3) personas reales que autorizan su uso a través de la biblioteca de activos de ModelArk, con autenticación de cuenta. Además, las salidas generadas por la propia cuenta pueden reutilizarse como entrada durante 30 días, pero no entre cuentas — [Vicsee](https://vicsee.com/blog/seedance-2-0-face-workaround); [seedance2.so](https://seedance2.so/blog/seedance-2-real-face-workaround) (terceros; "documented" solo en su texto)
- Un retrato sintético todavía puede activar la verificación de semejanza — [Seedance.tv](https://www.seedance.tv/blog/seedance-safety-filters-real-faces-image-prompts-2026) (terceros)
- Adobe Firefly, que integra Seedance, bloquea rostros humanos reales en referencias de imagen y video, pero permite que los prompts de texto generen rostros — [Adobe Community](https://community.adobe.com/questions-404/reference-content-can-t-include-real-human-faces-when-using-seedance-2-0-and-seedance-2-0-fast-1631867) (terceros de integración)
- Se afirma que el bloqueo de subidas de personas reales en 2.0 empezó poco después del lanzamiento viral de la versión (febrero 2026) — [Trivium China](https://triviumchina.com/2026/02/10/bytedance-stops-uploads-of-human-photos-for-seedance-2-0/) (solo se vio el resumen; artículo de pago)

### Inferences
- Para anuncios con modelos de dropshipping, la vía práctica es un personaje ficticio (no basado en una persona real) o un avatar de la biblioteca de la plataforma. Usar una foto de una persona real, incluida la del propio usuario, probablemente bloqueará la subida.
- Las fuentes desaconsejan explícitamente las técnicas de evasión (cambiar el formato, recortar, reescribir el prompt, deletrear palabras). Esto es consistente con las reglas de uso de ByteDance tal como se describen. No recomiendo intentarlas.
- Conviene confirmar en la interfaz de Dreamina (o Dola) si la nota de 2.5 existe. Solo hay evidencia de la nota en 2.0.

### Gaps
- No pude leer la página oficial de BytePlus sobre activos de persona real. Los requisitos de consentimiento y de verificación ("liveness") que indica un revendedor (apiyi) no están verificados con fuente primaria.
- No se sabe si el bloqueo cubre rostros generados por IA. Las fuentes no coinciden: unas dicen que sí, otras que un retrato generado pasa el filtro.
- La frase exacta "no permite generar videos a partir de imágenes de personas reales" no aparece en ninguna fuente consultada. Recomiendo no citarla como texto oficial hasta verla en la interfaz.
- No hay documentación oficial de Dreamina sobre la regla de personas reales para 2.5.

## Límites de longitud de prompt

### Takeaway
No encontré ningún límite de caracteres o palabras para el prompt de Seedance 2.5 en ninguna fuente, ni oficial ni de terceros. Es un punto sin resolver.

### Cited Findings
- "The page states no character or word limit." — [ofox.ai](https://ofox.ai/blog/how-to-use-seedance-2-5-prompts-timestamps-cost-2026/) (terceros)
- Replicate y PiAPI tampoco publican límite de prompt — [Replicate](https://replicate.com/bytedance/seedance-2.5/readme); [PiAPI](https://piapi.ai/seedance-2-5)
- Las guías de escritura de prompts indican que el formato es el mismo que en 2.0: planos numerados, diálogo entre llaves, y que un hueco en la línea de tiempo se considera un error — [búsqueda de guías de prompts](https://www.atlascloud.ai/fr/blog/guides/how-to-write-seedance-2.5-prompts) (terceros, solo resumen)

### Inferences
- Para un guion de 10 s, la longitud práctica del prompt no debería ser un problema. Los límites de referencia y de duración son más relevantes que la longitud del texto.

### Gaps
- Ninguna fuente publica el límite de caracteres de 2.5. Hay que medirlo en la interfaz o por la API con un prompt largo de prueba.

## Preguntas que quedan abiertas (para verificar en la interfaz)

- Si Dreamina y Dola aceptan 10 s y 12 s en Seedance 2.5 (la API ya acepta 4 a 30 s según terceros).
- Si 1080p está activo a octubre de 2026 (anunciado para el 17 de agosto de 2026, sin confirmación).
- Si la nota "real human faces are not supported" aplica a Seedance 2.5 en Dreamina.
- Si el audio de salida es siempre generado o puede desactivarse.
- Qué fechas de lanzamiento son correctas. Las fuentes dan distintas fechas (31 jul, 7 ago y 10 ago de 2026). Hay una fuente de Dola en vietnamita (FPT Shop) que indica que el modelo está disponible allí, pero sin fuente oficial. Dola no fue verificado con fuente primaria.

## Fuentes de baja fiabilidad o descartadas

- MindStudio (afirma 4K nativo, silencio en la salida, y no cita fuentes): usado solo para contrastar.
- Layer3labs (describe 2.5 como modelo de lenguaje): descartado para límites de video.
- seedance2.so y vicsee.com: sitios de terceros que venden acceso a Seedance y que anuncian un "modo Portrait" para saltarse el filtro. No usar como guía.
- Zalify, videoai.me y GLBGPT: precios de terceros en conflicto (por ejemplo, 720p entre 0,23 y 0,48 USD/s según la fuente). Fuera del alcance de esta nota.
