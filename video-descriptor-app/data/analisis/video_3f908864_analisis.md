# Análisis: "how i make ai videos that print me $30,482/week" — Smith

**Job ID:** 3f908864-9eed-4ca1-9a8b-b9a20d428bc1
**Duración:** 582.44s (9:42)
**Bloques procesados:** 0-6 completos (audio + visual), 7-8 solo visual (cuota Gemini agotada)
**Creador:** "Smith" (organic e-com / dropshipping vía videos generados con IA)

## Resumen

Video tutorial donde el creador enseña su **framework de 5 pasos** para estructurar
anuncios UGC generados con IA, usando como caso de estudio real un producto propio
(banda/máscara de dormir con cancelación de ruido para viajes). A diferencia del
video anterior analizado (Esteban Poudrier, patrón T-ECOM), este NO usa Discord
como prueba social en vivo — usa una metáfora pedagógica (el "puente") y menciona
cifras de alumnos verbalmente sin mostrar capturas.

## Estructura temporal (bloques de 65s)

| Bloque | Rango | Contenido |
|---|---|---|
| 0 | 0-65s | Hook conversacional ("$30k/semana") + modelo de negocio (e-com orgánico sin ads pagados) + reveal del producto |
| 1 | 65-130s | Explicación teórica del Paso 1 (Hook): relatabilidad, problema-consciencia |
| 2 | 130-195s | Paso 2 (Bridge/Context): "infinite retention" como criterio de calidad, texto puente "but..." |
| 3 | 195-260s | Filosofía de copywriting: "clips y copy coexisten", mínimo texto necesario |
| 4 | 260-325s | Paso 3 (USPs, breve) + Paso 4 (Bridge) + **metáfora del puente** (dibujo en vivo) |
| 5 | 325-390s | Paso 5 (CTA): resultado + "comenta X" + mención de **ManyChat** para DM automático |
| 6 | 390-455s | Cierre del framework + prueba social verbal ($21k/sem, $37k/sem, $8k/día alumnos) + transición a demo de IA (Pinterest → Claude → Higgsfield) |
| 7 | 455-520s | *(solo visual)* Demo de Higgsfield: imágenes (Nano Banana Pro) y animación (Kling 3.0) con prompts completos visibles en pantalla |
| 8 | 520-582s | *(solo visual)* Cierre — vuelve a mostrar el tablero completo del framework |

## El framework de 5 pasos (equivalente a T-ECOM pero para el anuncio-producto, no para el video-tutorial)

1. **Hook** — visual & text hook (llorando + "I had a panic attack on my flight") → muestra el problema
2. **Bridge/Context** — showcase clip (producto = "la solución") + contexto/bridge con "but..." que empuja al siguiente clip
3. **USPs** — lista de características (mencionado brevemente, no detallado en el audio capturado)
4. **Bridge** — producto en uso, mantiene retención hacia el CTA
5. **CTA** — resultado + solución + "comenta 'mask' para más info" → automatizado con ManyChat

### Metáfora del "puente" (dispositivo pedagógico)

El creador dibuja en vivo un puente: los pilares son el **Hook** y el **CTA**; los
clips intermedios son el refuerzo estructural (representado como una X, como el
arriostramiento de un puente real) que sostiene la retención del espectador.
Advierte explícitamente: *"a lot of people leave this space empty... there's no
room for bridging"* — el error más común es tener gancho y CTA pero nada de
contenido de conexión en medio.

## Prompts documentados (capturados directo de pantalla, Higgsfield)

**Imagen — hook (Nano Banana Pro, 2K, 1536x2752):**
> "Candid iPhone selfie photo, low-quality vertical shot taken on an airplane at
> night. the woman sits in an economy seat, cabin completely dark except for the
> harsh direct flash from her phone camera illuminating her face from
> below/front, creating hard shadows and blown-out highlights on her skin. She
> looks visibly exhausted and VERY tired — puffy under-eyes, messy hair. Her
> eyes are glassy and watery, tears streaking down her cheeks, expression raw
> and emotional like she's mid-cry. Slightly grainy, slightly overexposed flash
> photography, visible sensor noise, authentic amateur phone photo aesthetic,
> not posed, off-center candid framing, motion blur hint on the edges, airplane
> window and seatback visible in blurred dark background, 9:16 vertical aspect
> ratio, realistic skin texture with pores and flash shine, no studio lighting,
> no professional retouching, looks like a real TikTok/Instagram [photo]"

**Imagen — producto (Nano Banana Pro, 2K):**
> "Realistic iPhone selfie-style photo, POV looking down, taken in a dark
> airplane cabin at night. A woman's hand holds a dark grey Bluetooth sleep
> mask up between her legs, presenting it toward the camera at a slight angle,
> fingers gripping one side of the mask naturally. Harsh direct phone camera
> flash..."

**Animación — Kling 3.0 (1080p, 7s, con audio) — clip de llanto:**
> "...hoarse, emotionally worn voice, then looks down and away from camera,
> breathing shakily, shoulders lightly shuddering in a quiet sob, no loud
> crying. Ambient low airplane hum in background. Lighting stays consistent —
> harsh flash-lit foreground, dark blurred cabin behind her. Natural, subtle,
> low-fi handheld motion throughout, no dramatic camera moves"

**Animación — Kling 3.0 — clip de colocarse la máscara:**
> "Animate this image as a quick, natural handheld clip. Recording hand stays
> fixed holding the phone. The other hand brings the sleep mask up and pulls
> the strap over her head in one smooth, quick motion, mask settling into
> place"

**Animación — Kling 3.0 — clip de resultado (amanecer, sonriendo):**
> "Animate this image as a natural handheld POV selfie clip in the sunrise-lit
> airplane cabin. Recording hand stays fixed holding the phone at selfie
> distance. Warm golden morning light stays consistent throughout, soft and
> natural on her skin..."

## Flujo de producción confirmado

**Pinterest → Claude → Higgsfield (Nano Banana Pro + Kling 3.0)**

Coincide exactamente con el patrón ya documentado en el análisis del video de
Esteban Poudrier: se busca una imagen de referencia en Pinterest, se le da a
Claude una idea simple (*"I wanted a girl crying, saying 'I can't sleep',
looking super tired... then using the product, then showing the solution"*)
para que redacte el prompt detallado, y ese prompt se ejecuta en Higgsfield.
Este es el segundo caso independiente que confirma el mismo flujo — refuerza
la validez del patrón IHE (Integración Higgsfield Enablement) ya registrado.

## Implicaciones para PATTERN_LIBRARY.json y skills

1. **No es un patrón nuevo de estructura viral** — es una variante del framework
   de anuncio-producto (parecido a Store/Gifting/3-2-1 de la skill
   `guion-produccion-detallado`), mejor descrito como un **5º concepto de
   guion**: "Hook-Bridge-USP-Bridge-CTA" o "framework del puente".
2. **La metáfora del puente es un dispositivo pedagógico reutilizable** — útil
   para explicarle a un cliente/alumno por qué un anuncio con solo hook+CTA
   falla (sin transición, la retención se cae).
3. **Segunda confirmación independiente del flujo Claude→Higgsfield** — sube la
   confianza del patrón IHE de "candidato" a más validado.
4. **Prompts de imagen "candid/amateur phone photo"** son un patrón de estilo
   visual reutilizable (grano, flash duro, sin retoque) — valdría documentarlo
   como técnica en `patron-store-reveal` o una nueva nota de estilo visual.

## Limitación de esta sesión

Bloques 7-8 (455-582s) no tienen transcripción de audio — se agotó la cuota
diaria gratuita de Gemini (20 solicitudes/día) tras procesar 8 bloques. El
contenido visual de esos bloques (demo de Higgsfield, cierre) sí se capturó y
está reflejado arriba. Si se necesita el audio exacto de esos 127s, reintentar
mañana cuando se resetee la cuota.
