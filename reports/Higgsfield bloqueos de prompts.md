# Higgsfield: por qué bloquea prompts y cómo redactarlos dentro de la política

Fecha: octubre 2026. Alcance: causas de bloqueo de videos de producto en 9:16 (personas, avatares, manos, productos, fondos) y redacción conforme a las normas. Este informe no describe cómo evadir ni engañar los filtros.

## Resumen ejecutivo

1. Un bloqueo puede venir de **tres sitios**: el filtro de Higgsfield (prompt y/o imagen de referencia), el filtro del **proveedor del modelo** (Kling, Seedance, Veo, Sora, MiniMax, Wan) y el **detector de propiedad intelectual / likeness**. Higgsfield dice que aplica moderación "at the model level", así que no siempre sabe ni muestra cuál de las tres capas actuó.
2. Las causas **oficialmente documentadas** son pocas: contenido ilegal o abusivo, menores, personas reales sin consentimiento, imágenes íntimas no consentidas y marcas o personajes protegidos. Lo demás (ropa de baño, fitness, imágenes médicas, referencias en el límite) aparece como ejemplo de falsos positivos del filtro NSFW, sin reglas detalladas.
3. Lo más probable para tu contenido de producto es un **falso positivo** del filtro NSFW o de likeness, disparado por la combinación de imagen de referencia + texto, no por el prompt en sí.
4. Los créditos de una generación bloqueada **se devuelven automáticamente en la mayoría de modelos** (según Higgsfield; comprobable en Manage Account → Usage). Un bloqueo no siempre deja ID de generación, así que soporte necesita hora, modelo y prompt.
5. No hay apelación formal. Soporte puede devolver créditos y orientar; no puede anular el clasificador.

## 1. Qué dice Higgsfield oficialmente

Fuente: Términos de Uso (higgsfield.ai/terms-of-use-agreement, actualizados el 26 jul 2026) y página Trust.

- **Prohibido:** contenido ilegal, abusivo, engañoso, autolesiones y trastornos alimentarios, y cualquier representación de menores (§5.1).
- **Personas reales:** usar el parecido (likeness) de alguien exige su consentimiento (§4.2b). Las imágenes íntimas no consentidas están prohibidas (§6.5).
- **Eludir filtros:** prohibido (§5.2xiii). Este informe no lo recomienda.
- **Moderación:** "applied at the model level" (página Trust), es decir, dos capas (Higgsfield y proveedor).
- **Lo que no está publicado:** no hay política de uso aceptable separada ni reglas detalladas sobre violencia, armas, claims médicos o suplementos, ni lista de celebridades.

## 2. Causas de bloqueo, por tipo

| Tipo | Ejemplos | Fuente | Riesgo para tu contenido |
|---|---|---|---|
| Menores | Niños o bebés como protagonistas, o rasgos infantiles | Términos §5.1 | Alto si aparecen niños. Evítalos o usa adultos claramente adultos |
| Personas reales | Rostro o parecido de alguien sin consentimiento | Términos §4.2b; Seedance: "Not eligible" si la imagen tiene cara real | **Alto** si subes fotos de personas reales |
| Imágenes íntimas | Cualquier desnudez no consentida | Términos §6.5 | Muy alto. No aplica a producto normal |
| Propiedad intelectual | Personajes de franquicias, logos, marcas, equipos deportivos, artistas vivos citados por estilo | Página Trust y detector de IP | **Alto** si el producto lleva marca o logo visible, incluso en la imagen de referencia |
| NSFW (falso positivo) | Ropa de baño, ropa reveladora, fitness, imágenes médicas o anatómicas, composiciones límite | Higgsfield lo reconoce como falsos positivos | **Medio-alto** para productos de moda, belleza, deporte o salud |
| Combinación imagen + texto | Imagen y prompt que juntos disparan el filtro aunque cada uno pase solo | Higgsfield | Medio. Puede explicar bloqueos "sin sentido" |
| Salida (video generado) | El video ya renderizado se marca aunque el prompt sea limpio; audio con voces parecidas a reales | Seedance (BytePlus y terceros) | Medio. Fuera de tu control al escribir el prompt |
| Redacción escueta | Prompts muy cortos, sin contexto de escena | Blog de tercero (sin validar) | Bajo. Pero conviene dar contexto |

**Qué no pude confirmar:** mascotas, cosméticos, suplementos, productos con forma de arma, espejos o baños como causas de bloqueo. No hay fuente fiable; si te pasa, es un caso a reportar a soporte.

## 3. Diferencias por modelo (resumen)

- **Seedance (ByteDance/Dreamina):** dos capas (entrada y salida). El chequeo de propiedad intelectual y de rostros reales no se puede desactivar. Códigos documentados por terceros: `InputImageSensitiveContentDetected.PrivacyInformation`, `OutputVideoSensitiveContentDetected`. Sin confirmar en la tabla oficial de BytePlus.
- **Veo (Google):** es el mejor documentado. Tiene categorías de bloqueo (Child, Celebrity, Sexual, Violence, Third-party content). Distingue el rechazo de entrada del de salida.
- **Sora 2 (OpenAI):** reglas más estrictas sobre parecido con personas. Verifica si Higgsfield aún lo ofrece antes de planear con él; hay avisos de retirada de la API, no confirmados.
- **Kling, Hailuo (MiniMax), Wan (Alibaba):** documentación oficial escasa; los códigos que circulan vienen de terceros (por ejemplo 1026/1027 en Hailuo, `DataInspectionFailed` en Wan). No los uses como verdad sin verificar.

Para tu contenido, **Seedance 2.0** y **Kling 3.0** son los modelos con más documentación y consistencia de identidad; **Veo** tiene la política más clara, pero hay que verificar si Higgsfield lo ofrece en tu plan.

## 4. Redacción conforme a la política (recomendaciones priorizadas)

**Prioridad 1: no subir personas reales ni marcas**
- Usa **avatares ficticios o generados** por ti (no fotos de personas reales conocidas ni de terceros sin consentimiento).
- Usa **productos sin marca visible**, o ten derechos sobre la imagen. Si el producto tiene logo, tapa o recorta la marca en la referencia.
- Nunca nombres celebridades, franquicias, equipos o artistas vivos en el prompt.

**Prioridad 2: contexto neutro y preciso en el prompt**
- Describe la **escena** (lugar, luz, cámara, acción, propósito) en vez de adjetivos sueltos. Ejemplo: "Mujer adulta con ropa casual de algodón sostiene el producto frente a una encimera de cocina, luz natural, plano medio, formato vertical 9:16."
- Evita describir **cuerpos o piel** de forma enfática. Si el producto es ropa, di la prenda y el uso ("camiseta de algodón holgada") sin enfatizar el cuerpo.
- Si el producto es de salud, belleza o suplementos, **no hagas claims médicos** ("cura", "elimina"); describe el uso y el contexto de forma neutra.

**Prioridad 3: consistencia entre imagen y texto**
- La imagen de referencia y el prompt tienen que decir lo mismo. Si la referencia es un plano de producto, no pidas en el prompt una persona usándolo a menos que la referencia lo muestre.
- Si el producto aparece con persona, la persona y el producto deben estar en la misma escena de la referencia.

**Prioridad 4: formato y duración**
- Usa **9:16** y duraciones de los modelos documentados: Seedance 2.0 (4–15 s), Kling 3.0 (3–15 s), Marketing Studio (12–15 s).

**Plantilla de prompt conforme (ejemplo)**
> Escena: [lugar] con luz [natural/cálida/de estudio]. Sujeto: [persona adulta ficticia o producto sin marca], con [prenda neutra]. Acción: [acción concreta y breve]. Cámara: [plano medio/primer plano], [movimiento suave o estático], formato vertical 9:16, duración [X] s. Audio: [ambiente / sin voz].

## 5. Qué hacer cuando te bloquea (sin evadir)

1. **Lee el mensaje de error** y anota modelo, hora y prompt. Distingue si el bloqueo fue de entrada (antes de generar) o de salida (después).
2. **Revisa lo básico de la política:** ¿hay una persona real, un logo, un menor o una prenda que pueda resultar sensible? Corrígelo según la sección 4.
3. **Si el bloqueo persiste con un caso que cumple la política, escribe a soporte** (support@higgsfield.ai o higgsfield.ai/contact) con: hora aproximada, modelo, prompt, imagen de referencia (o descripción) y el mensaje de error. Pide revisión y devolución de créditos si no se devuelven.
4. **No repitas variaciones del mismo prompt hasta que pase.** Eso puede leerse como intento de evasión y, según los Términos (§5.2xiii), arriesgar la cuenta. Si necesitas probar, cambia algo concreto que hayas corregido según la política, y documenta cada intento.
5. **Usa un modelo alternativo que sí te sirva** si el problema es de un proveedor concreto y tu caso cumple la política.

## 6. Lo que no está verificado

- Política oficial de generación de Kling, Hailuo y Wan.
- Estado actual de Sora 2 en Higgsfield.
- Tabla oficial de errores de BytePlus para Seedance 2.5.
- Cambios de moderación por versión (Kling 3, Seedance 2.5, Veo 3.1).
- Opiniones reales de usuarios: Reddit y Discord no se pudieron leer.
- Algunas cifras y códigos vienen de revendedores o blogs de terceros, marcados como tales en las notas.

## Fuentes principales

- Términos de Uso de Higgsfield: https://higgsfield.ai/terms-of-use-agreement
- Página Trust de Higgsfield (moderación a nivel de modelo)
- Documentación de errores de Higgsfield API: https://docs.higgsfield.ai/docs/concepts/errors.md
- Documentación de moderación de Google Veo (códigos por categoría)
- BytePlus (18 ago 2026) sobre filtros de Seedance; resúmenes de revendedores (marcados como terceros)

Notas completas con URLs por afirmación: `research_notes/Higgsfield bloqueos de prompts/`.
