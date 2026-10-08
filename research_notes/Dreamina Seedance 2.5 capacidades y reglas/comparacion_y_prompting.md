# Dreamina Seedance 2.5 vs Gemini Omni 1.1 Flash vs Veo 3.1 (Google Flow): comparación y prompting para anuncios de producto 9:16 de 10 s

Estado de la información: octubre 2026. Enfoque: video orgánico de dropshipping, 9:16, 10 s.

Advertencia de calidad de fuentes: casi todo lo disponible son blogs SEO, agregadores y reseñas de plataformas que venden estos mismos modelos (sobre todo Krea, que vende Seedance y Veo). No encontré documentación oficial de ByteDance/Dreamina para Seedance 2.5, ni reseñas independientes con pruebas repetidas. Las etiquetas usadas: **[Verificado oficial]** = página del proveedor/Google; **[Secundario]** = blog, agregador o reseña; **[Opinión]** = recomendación sin prueba; **[Sin dato]** = no encontrado.

---

## Pregunta 1: Calidad de salida en anuncios de producto cortos

### Takeaway
No hay una comparación de calidad independiente y repetida. La única prueba de producto disponible (una sola toma de hero y una de transformación, una muestra por modelo) dice que la diferencia es pequeña, que Veo es más expresivo y que Seedance es más literal con los fotogramas planeados.

### Cited Findings
- Prueba de un solo producto: ambos modelos dieron material usable para un hero shot simple; la diferencia fue pequeña. Seedance 2.5 salió a 1080p de 4 s, Veo 3.1 a 4K de 8 s — [Astorie](https://astorie.ai/blog/seedance-2-5-vs-veo-3-1) [Secundario]
- En la misma prueba, Veo 3.1 añadió movimiento secundario de agua en las tomas hero y de transformación; Seedance se mantuvo más cerca del brief — [Astorie](https://astorie.ai/blog/seedance-2-5-vs-veo-3-1) [Secundario]
- Reseña de Krea (prueba de dos tomas con audio: un plano de hablante y un plano de panadero): Seedance tuvo mezcla de audio más fuerte (media -27 dB frente a -31,9 dB de Veo); Krea lo presenta como observación de una sola toma, no como medida general — [Krea](https://www.krea.ai/blog/seedance-2-5-vs-veo-3-1-which-is-better-full-comparison-2026) [Secundario, con conflicto de interés]
- Según la reseña de The Hype Magazine, Veo 3.1 es visiblemente más nítido para pantallas grandes; Seedance a 720p "se ve bien" en móvil vertical — [The Hype Magazine](https://www.thehypemagazine.com/2026/08/12/seedance-2-5-vs-veo-3-1-which-ai-video-workflow-fits-music-and-entertainment-creators/) [Secundario, opinión]

### Inferences
- Para anuncios verticales vistos en móvil, la resolución de 720p de Seedance probablemente no sea un problema decisivo; para hero spots en pantalla grande, Veo gana. [Opinión, basada en reseñas]
- Veo tiende a interpretar más la cámara; Seedance tiende a seguir el plan. Eso importa más que la nitidez para una prueba de producto.

### Gaps
- Sin pruebas repetidas de calidad con productos pequeños de dropshipping ni con Omni 1.1 Flash en formato vertical. [Sin dato]

---

## Pregunta 2: Límites de duración y relaciones de aspecto (10 s, 9:16)

### Takeaway
Seedance 2.5 es el único de los tres con un rango documentado que incluye 10 s en una sola generación y con 9:16 confirmado. Veo 3.1 no tiene 10 s nativos (solo 4, 6 u 8 s). Para Omni 1.1 Flash no encontré confirmación de 9:16 ni de 10 s nativos.

### Cited Findings
- **Seedance 2.5, duración:** cualquier duración de 4 a 30 s — [Krea](https://www.krea.ai/blog/seedance-2-5-vs-veo-3-1-which-is-better-full-comparison-2026) [Secundario]. La página oficial de Dreamina solo dice que el modelo "ha sido discutido" alrededor de 30 s nativos; no lo confirma como límite — [Dreamina access guide](https://dreamina.capcut.com/seedance/how-to-access-seedance-2-5) [Oficial de acceso, sin specs]
- **Seedance 2.5, relaciones de aspecto:** seis formatos, desde 21:9 hasta vertical, incluido 9:16 y cuadrado — [Krea](https://www.krea.ai/blog/seedance-2-5-vs-veo-3-1-which-is-better-full-comparison-2026) [Secundario]. La página oficial de Dreamina no lista relaciones de aspecto — [Dreamina](https://dreamina.capcut.com/seedance/how-to-access-seedance-2-5) [Oficial, sin dato]
- **Seedance 2.5, resolución:** 480p o 720p; no hay 1080p — [Krea](https://www.krea.ai/blog/seedance-2-5-vs-veo-3-1-which-is-better-full-comparison-2026) [Secundario]. (Ojo: la prueba de Astorie reporta una salida de Seedance 2.5 a 1080p; ver conflicto abajo.)
- **Veo 3.1, duración:** 4, 6 u 8 s — [Krea](https://www.krea.ai/blog/seedance-2-5-vs-veo-3-1-which-is-better-full-comparison-2026) [Secundario]; el Vertex AI doc dice lo mismo: "4, 6 u 8 segundos", y que la referencia imagen-a-video solo admite 8 s — [Vertex AI, Veo 3.1 preview](https://cloud.google.com/vertex-ai/generative-ai/docs/models/veo/3-1-generate-preview?hl=es) [Oficial]
- **Veo 3.1, relaciones de aspecto:** 16:9 (por defecto) y 9:16 vía el parámetro `aspect_ratio`; la página oficial de la Gemini API lo describe así. Vertex lo marca como soportado excepto en referencia imagen-a-video — [Gemini API video docs](https://ai.google.dev/gemini-api/docs/video?hl=zh-CN) [Oficial, versión localizada] y [Vertex AI](https://cloud.google.com/vertex-ai/generative-ai/docs/models/veo/3-1-generate-preview?hl=es) [Oficial]
- **Veo 3.1, resolución:** 720p, 1080p o 4K — [Gemini API video docs](https://ai.google.dev/gemini-api/docs/video?hl=zh-CN) [Oficial]
- **Veo 3.1, extensión:** un proveedor (Atlas Cloud) dice que se puede extender con saltos de 8 s hasta 148 s, pero que no aplica a Veo 3.1 Lite y que el video fuente debe ser de 720p y 141 s o menos. El título de esa página no coincide con su contenido; lo tomo con reservas — [Atlas Cloud](https://www.atlascloud.ai/es/blog/guides/veo-3.1-length-limit-max-duration-guide) [Secundario, baja confianza]
- **Gemini Omni 1.1 Flash, extensión:** un agregador dice que extiende un clip en bloques de 10 s hasta 40 s acumulados, con control de primer y último fotograma y referencias de video — [myclaw.ai](https://myclaw.ai/es/blog/gemini-omni-1-1-flash) [Secundario]
- **Gemini Omni 1.1 Flash, resolución:** draft 360p, salida estándar 720p, "hasta 4K" (un fuente dice vía upscaling y otra dice nativo; conflicto) — [myclaw.ai](https://myclaw.ai/es/blog/gemini-omni-1-1-flash) y [aitoolly](https://aitoolly.com/es/product/gemini-omni-1-1-flash) [Secundario]
- **Google Flow:** no encontré documentación de Flow (la interfaz de consumo) que confirme límites distintos a los de la API. Puede diferir. [Sin dato]

### Conflicto a tener en cuenta
- Resolución de Seedance 2.5: Krea dice que "tops out at 720p" [Secundario]; Astorie reporta una salida de 1080p [Secundario]. No puedo confirmar cuál es. Trátalo como 720p hasta que lo pruebes.

### Inferences
- Para una toma de 10 s en 9:16 en una sola generación, solo Seedance 2.5 aparece como candidato documentado. Veo exige 8 s + extensión o dos tomas que luego se unen; Omni necesita confirmar su duración base.

### Gaps
- Omni 1.1 Flash: duración base y 9:16 no confirmados por fuente oficial. [Sin dato]
- Ningún documento oficial de Dreamina lista las relaciones de aspecto de Seedance 2.5. [Sin dato]

---

## Pregunta 3: Movimiento de cámara, cámara fija, audio/ASMR, consistencia (personajes y objetos, 10 s)

### Takeaway
Veo 3.1 interpreta los movimientos de cámara con más energía (push-in y órbita); Seedance 2.5 es más lineal y restringido. No hay prueba documentada de cámara fija en ninguno. El audio se genera nativo en Veo y, según Krea, también en Seedance; ASMR no está probado. Seedance tiene mucha más capacidad de referencias (30 imágenes, 10 videos, 10 audios); Veo acepta 3 imágenes de referencia más primer y último fotograma. No encontré datos sobre escala de objetos pequeños (ej. un carrito de 7,5 cm).

### Cited Findings
- **Cámara:** Veo 3.1 aplicó push-in y órbita de forma más agresiva; Seedance 2.5 fue más lento y lineal — [Astorie](https://astorie.ai/blog/seedance-2-5-vs-veo-3-1) [Secundario]
- **Cámara fija:** Krea describe el "frame más estable" de Veo como observación informal, no como control documentado — [Krea](https://www.krea.ai/blog/seedance-2-5-vs-veo-3-1-which-is-better-full-comparison-2026) [Secundario]. Ningún proveedor documenta un parámetro de cámara fija en la fuente consultada. [Sin dato]
- **Consejo de movimiento (sitio de terceros):** no combinar dos movimientos de cámara a la vez; describir un movimiento claro por segmento — [Seedance.tv](https://www.seedance.tv/blog/seedance-2-5-timestamp-prompts) [Secundario, opinión]
- **Audio, Veo 3.1:** audio nativo; el precio publicado por Google incluye audio por defecto — [Google Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing) [Oficial]
- **Audio, Seedance 2.5:** Krea dice que genera audio en la misma pasada que el video — [Krea](https://www.krea.ai/blog/seedance-2-5-vs-veo-3-1-which-is-better-full-comparison-2026) [Secundario]. **Conflicto:** la página de Dreamina no lista audio como función; solo dice que el "audio complejo" debe evitarse en la primera prueba — [Dreamina](https://dreamina.capcut.com/seedance/how-to-access-seedance-2-5) [Oficial de acceso]
- **Audio, Omni 1.1 Flash:** un agregador dice que genera video con audio; no está claro si el precio lo incluye — [Google pricing](https://ai.google.dev/gemini-api/docs/pricing) [Oficial, sin confirmar audio]
- **ASMR:** no encontré ninguna fuente que pruebe ASMR ni silencio controlado en ninguno de los tres. [Sin dato]
- **Referencias de Seedance 2.5:** hasta 30 imágenes, 10 videos y 10 audios, 50 materiales en total — [Krea](https://www.krea.ai/blog/seedance-2-5-vs-veo-3-1-which-is-better-full-comparison-2026) [Secundario]
- **Referencias de Veo 3.1:** hasta 3 imágenes de referencia más primer y último fotograma — [Krea](https://www.krea.ai/blog/seedance-2-5-vs-veo-3-1-which-is-better-full-comparison-2026) [Secundario]
- **Consistencia (prueba de Astorie):** Seedance 2.5 pudo referenciar directamente un elemento guardado (@AURELIA) dentro de la herramienta; Veo dependió más de los fotogramas proporcionados. Una sola prueba, un solo producto — [Astorie](https://astorie.ai/blog/seedance-2-5-vs-veo-3-1) [Secundario]
- **Consistencia (consejo de terceros):** repetir anclas de identidad (rostro, vestuario, forma del producto, colores, texto de la etiqueta) y usar una imagen fija del producto. Es recomendación del sitio, no garantía — [Seedance.tv](https://www.seedance.tv/blog/seedance-2-5-timestamp-prompts) [Secundario, opinión]
- **Escala de objetos pequeños:** el mismo artículo de Astorie no prueba escala; solo menciona forma y proporciones de una lata en una toma. [Astorie](https://astorie.ai/blog/seedance-2-5-vs-veo-3-1) [Secundario, sin dato de escala]

### Inferences
- Para un producto pequeño que debe conservar su tamaño, Seedance es el candidato lógico por las referencias de producto (imágenes y elemento guardado). Esto es inferencia, no prueba.
- Para cámara fija, probablemente haya que pedirla en el prompt ("cámara fija, sin movimiento") en los tres, y comprobarlo. [Opinión]

### Gaps
- Consistencia de un objeto de 7,5 cm a lo largo de 10 s: sin dato en ninguno de los tres. Hay que probarlo.
- ASMR y audio sin voz: sin prueba independiente. [Sin dato]

---

## Pregunta 4: Costo por clip de 10 s

### Takeaway
Con precios publicados, un clip de 10 s cuesta aproximadamente: Seedance API ~$0.65 (precio de entrada de API, no verificado por el proveedor), Omni 720p ~$1.01, Veo 3.1 Fast 720p ~$1.00, Veo 3.1 Standard 720p con audio ~$4.00 (pero sin 10 s nativos, así que habría que sumar dos generaciones). Los precios de Seedance para consumo no están publicados en USD.

### Cited Findings
- **Veo 3.1 (precio oficial, USD por segundo, con audio por defecto, pago):** Standard $0.40 (720p), $0.40 (1080p), $0.60 (4K); Fast $0.10 (720p), $0.12 (1080p), $0.30 (4K); Lite $0.05 (720p), $0.08 (1080p), 4K no soportado. Plan gratuito: no disponible — [Google Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing) [Oficial]
- **Omni 1.1 Flash:** precio por token; salida de video $17.50 por 1M tokens; según la nota de Google, 5.792 tokens por segundo de 720p, lo que da ~$0.10/s (cálculo propio: 5.792 × 17,50 / 1.000.000 ≈ $0.101/s). No hay tarifa para 1080p ni 4K; no dice si incluye audio; plan gratuito no disponible — [Google Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing) [Oficial]. Un proveedor calcula ~$1 por 10 s a 720p — [myclaw.ai](https://myclaw.ai/es/blog/gemini-omni-1-1-flash) [Secundario]
- **Seedance 2.5 (API):** $0.0645 por segundo como precio de entrada de API — [Krea](https://www.krea.ai/blog/seedance-2-5-vs-veo-3-1-which-is-better-full-comparison-2026) [Secundario]. Krea dice que el consumo se mide en "unidades de cómputo del plan", sin precio por segundo para usuario final.
- **Seedance 2.5 vs Veo, créditos (sin unidad definida):** una comparación dice 200 créditos para Seedance y 400 para Veo; la unidad no está explicada, así que no sirve para comparar — [Secundario, sin dato]
- **Costo de Veo en la prueba de Krea:** un clip silencioso de 6 s cuesta $1.26 (720p/1080p), con audio $2.52; un clip de 8 s, $1.68 silencioso y $3.36 con audio. **Conflicto:** $3.36 para 8 s con audio implica $0.42/s, frente a $0.40/s del precio oficial de Google (que daría $3.20). Usaría el precio oficial. — [Krea](https://www.krea.ai/blog/seedance-2-5-vs-veo-3-1-which-is-better-full-comparison-2026) [Secundario]

### Tabla de referencia (USD por clip de 10 s, cálculo propio, solo API o precio publicado)

| Modelo | Precio por segundo | 10 s aprox. | Nota |
|---|---|---|---|
| Seedance 2.5 (API) | $0.0645/s | ~$0.65 | Precio de entrada según Krea; sin verificar en Dreamina; 720p máx. |
| Omni 1.1 Flash, 720p | ~$0.10/s | ~$1.01 | Calculado desde tokens; audio no confirmado |
| Veo 3.1 Lite, 720p | $0.05/s | ~$0.50 | Pero 8 s nativos máximo; 10 s = 2 generaciones |
| Veo 3.1 Fast, 720p | $0.10/s | ~$1.00 | Igual: 10 s = 2 generaciones |
| Veo 3.1 Standard, 720p | $0.40/s | ~$4.00 | Igual: 10 s = 2 generaciones (~$3.20 + ~$3.20 si son 8 s) |

### Inferences
- Por costo por intento, Seedance y Omni son los más baratos; Veo Standard es el más caro. El costo de Veo sube si cada 10 s requiere dos generaciones.
- Para la fase de pruebas (muchos intentos), Veo Fast o Lite son la opción más económica documentada. [Opinión]

### Gaps
- Costo real en Dreamina/Flow (créditos o planes de consumo): sin dato público.
- Si el audio está incluido en el precio de Omni: sin confirmar.

---

## Pregunta 5: ¿Qué modelo sigue mejor los beats con timestamps (0-2 s, 2-4 s…)?

### Takeaway
No hay prueba comparativa. Los datos disponibles: Seedance 2.5 tiene una sintaxis de timestamps descrita por un sitio de terceros (no por el proveedor), y en una prueba fue más literal con los fotogramas planeados. Veo no tiene sintaxis de timestamps documentada en lo que consulté. Omni no tiene datos. Lo más probable es que Seedance 2.5 sea mejor para beats con tiempos, pero es inferencia.

### Cited Findings
- **Sintaxis de Seedance 2.5 (sitio de terceros, no el proveedor):** marcadores en segundos enteros como [0s], [2s], [4s], o rangos como 0–3s; en orden cronológico, empezando en 0 — [Seedance.tv](https://www.seedance.tv/blog/seedance-2-5-timestamp-prompts) [Secundario, opinión]
- **Recomendación de beats (Seedance.tv):** 2–3 marcas para un clip de 5 s; 3–5 para 8–10 s; unos 2–3 s por acción visible; no poner un marcador por segundo — [Seedance.tv](https://www.seedance.tv/blog/seedance-2-5-timestamp-prompts) [Secundario, opinión]
- **Advertencia del mismo sitio:** los timestamps no son frame-exactos; el movimiento puede empezar un poco antes o después — [Seedance.tv](https://www.seedance.tv/blog/seedance-2-5-timestamp-prompts) [Secundario]
- **Sintaxis "multi-shot" de Seedance 2.0 (no 2.5):** bloques "Shot 1 / Shot 2", una acción y un movimiento de cámara por bloque, máximo cinco tomas — [VideoAI.me](https://videoai.me/blog/seedance-2-0-multi-shot-prompts) [Secundario, opinión]; Runway dice que tanto 2.0 como 2.5 usan prompts estructurados por tomas etiquetadas — [Runway](https://runway.com/resources/seedance-2-0-prompt-guide) [Secundario]. Las fuentes no coinciden sobre si 2.0 también admite timestamps.
- **Seguimiento de fotogramas:** en la prueba de Astorie, Seedance 2.5 siguió más literalmente los fotogramas planeados (primero y último); Veo fue más interpretativo — [Astorie](https://astorie.ai/blog/seedance-2-5-vs-veo-3-1) [Secundario]
- **Parte de Runway:** Runway lista la edición parcial con timestamps como función de Seedance 2.5, y da a 2.0 un límite de 15 s con 9 imágenes, 3 videos y 3 audios de referencia — [Runway](https://runway.com/resources/seedance-2-0-prompt-guide) [Secundario]
- **Veo 3.1:** no encontré una sintaxis de timestamps documentada en la página de la Gemini API consultada. [Oficial, sin dato]
- **Omni 1.1 Flash:** sin datos sobre timestamps. [Sin dato]

### Inferences
- Seedance 2.5 parece el más prometedor para beats con tiempos, por la sintaxis documentada por terceros y por la fidelidad a fotogramas en la prueba de Astorie. [Inferencia, una sola prueba]
- Veo puede interpretar más de lo pedido; para beats estrictos, es más arriesgado. [Opinión]

### Gaps
- Ninguna prueba comparativa de beats con timestamps en los tres modelos.
- No confirmado en documentación oficial de ByteDance/Dreamina.

---

## Pregunta 6: Prompts cortos vs largos; prompts negativos; personas descritas en texto

### Takeaway
Las fuentes no coinciden sobre la longitud: una dice "menos de 100 palabras" y otra no pone límite pero pide una acción por segmento y dividir la escena si parece un plano de 5 s. La recomendación práctica es de longitud media: una acción y una cámara por beat, y un bloque de restricciones globales al final. No hay campo de prompt negativo documentado en Seedance 2.5; Veo y Omni no tienen datos. Para personas descritas en texto, no encontré documentación; las referencias de rostro restringidas están documentadas solo para Seedance 2.0.

### Cited Findings
- **Longitud (corto):** "funciona bien en pocas palabras", con sujeto, acción, cámara y sonido, en orden, en menos de 100 palabras — [Dreampixelforge](https://www.dreampixelforge.com/blog/seedance-prompts) [Secundario, opinión]
- **Longitud (sin límite, pero una acción por segmento):** cada segmento con cuatro partes: sujeto, acción, cámara e iluminación; si el prompt parece un guion de cinco tomas en cinco segundos, alargar el clip o dividir en generaciones — [Seedance.tv](https://www.seedance.tv/blog/seedance-2-5-timestamp-prompts) [Secundario, opinión]
- **Prompt negativo:** Seedance.tv dice que no hay campo ni sintaxis de prompt negativo; en su lugar, usar una línea de "restricciones globales" fuera de los beats, por ejemplo "sin deformación ni texto añadido" — [Seedance.tv](https://www.seedance.tv/blog/seedance-2-5-timestamp-prompts) [Secundario, opinión]. Veo y Omni: sin datos. [Sin dato]
- **Audio en el prompt:** Seedance.tv recomienda una restricción global de audio, asignar hablante (ej. "Sujeto A habla a la izquierda") y una instrucción de personaje en silencio. No trata ASMR. — [Seedance.tv](https://www.seedance.tv/blog/seedance-2-5-timestamp-prompts) [Secundario, opinión]
- **Personas descritas en texto:** Seedance.tv recomienda repetir las anclas de identidad en cada beat ("mismo rostro y encuadre en todo momento") — [Seedance.tv](https://www.seedance.tv/blog/seedance-2-5-timestamp-prompts) [Secundario, opinión]. No encontré una fuente que confirme que la consistencia de un personaje descrito solo en texto funcione en 10 s.
- **Restricciones de rostro (Seedance 2.0, no 2.5):** la guía dice que un filtro de visión por computadora revisa cada referencia, incluido el video, y que un rostro visible puede bloquear el clip completo; además, hay un chequeo por parecido con figuras públicas — [seedance2pro](https://seedance2pro.io/en/blog/why-is-seedance-2-rejecting-reference-video) [Secundario, afirmación de terceros para 2.0]

### Inferences
- Para anuncios de 10 s, un prompt de 60–120 palabras con 3–4 beats parece el punto de equilibrio entre control y riesgo. Es una síntesis de las fuentes, no una prueba. [Opinión]
- Describir a la persona en texto (sin subir foto de persona) evita el filtro de referencias de rostro documentado en 2.0; si el modelo mantiene la persona entre generaciones, es algo que hay que probar. [Inferencia, sin prueba]

### Gaps
- Ningún experimento que compare prompts cortos y largos en los tres modelos.
- Prompt negativo en Veo 3.1 y Omni 1.1 Flash: sin dato.
- Restricciones de personas en Seedance 2.5, Veo 3.1 y Omni: sin dato oficial.

---

## Pregunta 7: Marcas de agua, consistencia de caras y rechazos (refusals)

### Takeaway
No encontré documentación sobre marcas de agua visibles, SynthID ni rechazos para Seedance 2.5, Veo 3.1 u Omni 1.1 Flash. Lo único documentado son reglas de filtrado de referencias en Seedance 2.0 (por terceros), que pueden no aplicar a 2.5. Trata cualquier afirmación sobre marcas de agua como no verificada.

### Cited Findings
- **Marcas de agua Seedance:** Dreamina dice que la política de marca de agua no está especificada en la página de acceso — [Dreamina](https://dreamina.capcut.com/seedance/how-to-access-seedance-2-5) [Oficial de acceso, sin dato]
- **Marca de agua Veo / SynthID:** la página de precios y la de video de la Gemini API no mencionan marca de agua — [Google Gemini API docs](https://ai.google.dev/gemini-api/docs/video) [Oficial, sin dato]. Ningún documento consultado confirma si hay SynthID en la salida.
- **Omni:** no encontré datos sobre marca de agua ni sobre consistencia; las fuentes son previas al lanzamiento o agregadores. [Sin dato] — [Google Omni coverage](https://www.llmreference.com/model-family/gemini-omni) [Secundario]
- **Rechazos Seedance 2.0 (filtro de referencias):** la guía de seedance2pro dice que los rechazos vienen de rostros visibles en videos de referencia, de parecidos con figuras públicas y de artefactos por fotograma que parecen marcas de agua (aunque no sean visibles para el espectador) — [seedance2pro](https://seedance2pro.io/en/blog/why-is-seedance-2-rejecting-reference-video) [Secundario, afirmación de terceros]. Ni la guía ni otra fuente lo confirma para 2.5.
- **Problema de disponibilidad (Seedance 2.5):** una reseña dice que la versión estable salió el 31 de julio de 2026, que la API internacional aún dice "próximamente" y que las superficies de consumo están bloqueadas en EE. UU., Canadá y Australia — [The Hype Magazine](https://www.thehypemagazine.com/2026/08/12/seedance-2-5-vs-veo-3-1-which-ai-video-workflow-fits-music-and-entertainment-creators/) [Secundario; un solo fuente]. Dreamina dice que el acceso depende de cuenta, región y despliegue — [Dreamina](https://dreamina.capcut.com/seedance/how-to-access-seedance-2-5) [Oficial de acceso]
- **Acceso Veo 3.1:** Veo 3.1 está en vista previa en la Gemini API — [Krea](https://www.krea.ai/blog/seedance-2-5-vs-veo-3-1-which-is-better-full-comparison-2026) [Secundario]. Un proveedor de API tiene un artículo llamado "google flow access restricted", pero no pude abrirlo; no lo tomo como verificado. — [apiyi](https://help.apiyi.com/ko/google-flow-access-restricted-veo-3-1-api-alternative-solution-ko.html) [Secundario, no leído]
- **Omni, disponibilidad:** un agregador dice que el ID estable gemini-omni-1.1-flash salió el 27 de agosto de 2026 y que el endpoint de vista previa gemini-omni-flash-preview se retira el 30 de septiembre de 2026 — [myclaw.ai](https://myclaw.ai/es/blog/gemini-omni-1-1-flash) [Secundario; fecha no verificada en la página oficial]

### Inferences
- Antes de producir en serie, conviene probar un clip con personas y un logo de producto visible para ver si pasa el filtro; el riesgo documentado está en las referencias de Seedance 2.0. [Opinión]

### Gaps
- Marca de agua, SynthID y rechazos en los tres: sin dato verificado.
- Consistencia de caras entre generaciones en los tres: sin prueba independiente.

---

## Resumen para decidir (basado en lo anterior)

- **Toma de 10 s en una sola generación, 9:16:** Seedance 2.5 es el único con evidencia documentada. Veo 3.1 requiere dos tomas o extensión. Omni: sin confirmar.
- **Beats con timestamps:** Seedance 2.5 tiene la sintaxis más documentada, aunque sea por terceros. Probar antes de confiar.
- **Calidad de resolución alta (1080p/4K):** Veo 3.1. Seedance: 720p como máximo según Krea.
- **Costo por intento:** Seedance (API ~$0.65/10 s, no verificado) y Omni (~$1.01/10 s) son los más baratos; Veo Standard el más caro. Veo Fast ~$1.00 por 10 s equivalente en dos tomas.
- **Producto pequeño (7,5 cm):** sin dato en ninguno. Prueba obligatoria: 3 generaciones por modelo con el mismo prompt y referencia del producto, y medir el tamaño frame a frame.

## Prueba mínima recomendada (para cerrar los huecos)
1. Mismo prompt de 10 s, 9:16, con 3 beats con timestamps y restricción global, en Seedance 2.5 y Veo 3.1 (dos tomas de 8 s y 2 s, o extensión), y en Omni 1.1 Flash.
2. Producto de 7,5 cm como referencia de imagen fija, medir tamaño en 0–2 s, 4–6 s y 8–10 s.
3. Revisar marca de agua visible, rostro y audio en cada salida.
4. Anotar costo real por clip en la cuenta del usuario (los precios publicados no coinciden con las fuentes secundarias).
