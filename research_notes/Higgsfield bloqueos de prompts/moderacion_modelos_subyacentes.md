# Moderación de contenido en los modelos de video subyacentes a Higgsfield (Kling, Seedance, Veo, Sora 2, Hailuo, Wan)

Fecha de la investigación: 15 oct 2026. Alcance: solo reglas documentadas, causas de rechazo y prácticas compatibles; no se recogen técnicas para evadir filtros. Las citas literales se dejan en inglés.

Aviso de calidad de fuentes: para Kling, Sora 2, Hailuo y Wan casi no hay política oficial legible por herramienta; la mayor parte viene de blogs de revendedores o agregadores (Atlas Cloud, CometAPI, AnyCap, apiyi, Segmind, YingTu) que a veces venden acceso al modelo. Se marca en cada punto.

## 1. Capa de moderación propia de Higgsfield (agregador) y relación con los modelos de terceros

### Takeaway
Higgsfield documenta que un bloqueo puede venir de su propio sistema o del proveedor del modelo, con filtros en dos etapas (procesamiento del prompt y subida de imagen de referencia), y que no ve las reglas internas de los proveedores. Los créditos se devuelven "automáticamente para la mayoría de los modelos" en bloqueos NSFW, pero el clasificador no se puede revertir.

### Cited Findings
- "NSFW flags can come from Higgsfield's own safety system or from an external model provider's system"; ambos pueden dar falsos positivos — [Higgsfield Help Center: Content flagged as NSFW](https://higgsfield.ai/creator-hub/help-center/troubleshooting/content-flagged-as-nsfw) (leído 15 oct 2026).
- "Higgsfield uses safety filters at two stages: during prompt processing and during image upload or reference input." Una imagen de referencia límite "can trigger the upload-stage filter even with a safe prompt" — misma página.
- Nombra a Nano Banana, Seedream, Kling, Sora 2, MiniMax, Wan y Veo como proveedores con sistemas de seguridad independientes encima de los de Higgsfield; Higgsfield "doesn't have access to the internal moderation rules of external model providers", por lo que la razón exacta puede no verse — misma página.
- Disparadores de falso positivo listados por Higgsfield: swimwear o ropa reveladora, contenido atlético/fitness, imaginería médica o anatómica, imágenes de referencia con composición límite y redacción ambigua. "Safety systems can trigger on combinations of image and text, not just individual words" — misma página.
- Recomendaciones oficiales: reformular con descripción neutra y específica; cambiar o quitar la imagen de referencia; si se usó solo imagen, añadir prompt descriptivo (suele reducir falsos positivos); probar otro modelo, porque el filtro de uno puede interpretar mal lo que otro acepta — misma página.
- Créditos: "Credits for flagged generations are returned automatically for most models." Verificar en Manage Account > Usage; si no aparece, contactar a Soporte con hora aproximada, modelo y prompt (una generación bloqueada no tiene página de Asset ni ID). Higgsfield puede devolver créditos en falsos positivos confirmados, pero "the classifier decision itself can't be reversed" — misma página. Nota de discrepancia: un resumen de buscador decía "all models", la página leída dice "most models"; se toma la página.
- "Bypassing or circumventing moderation systems is prohibited under the Terms of Use"; Soporte puede ayudar a reformular, no a saltarse filtros — misma página.
- La página oficial no cita códigos ni mensajes de error concretos para estos flags — misma página.
- Página de confianza: cada modelo aplica su propio filtro a prompts, imágenes de referencia y salidas, "so content policies may vary depending on the model being used"; el usuario responde por los derechos sobre subidas y semejanzas ("Users hold all necessary rights for uploaded content and likenesses") — [Higgsfield Trust](https://higgsfield.ai/trust). Esa página no lista contenido prohibido, reglas de menores ni proceso de apelación.
- Reporte de un usuario en Trustpilot: cuenta terminada sin identificar el prompt/imagen, y un prompt inocuo ("A sticker of a human face on a MacBook Pro.") bloqueado; es un caso aislado no verificable — [Trustpilot Higgsfield](https://uk.trustpilot.com/review/higgsfield.ai?page=8).

### Inferences
- Para el usuario hay tres posibles orígenes de un rechazo: filtro de Higgsfield (subida/prompt), filtro de entrada del proveedor y filtro de salida del proveedor. Como el flag no genera Asset ni ID, conviene anotar modelo, hora y prompt de cada intento para poder reclamar créditos.
- Los falsos positivos listados por Higgsfield (ropa ajustada, fitness, anatomía) coinciden con categorías de producto que usa el usuario (manos/piel, ropa, productos de salud).

### Gaps
- No se encontró lista pública de reglas de Higgsfield ni sus Terms of Use leídos aquí; no se pudo confirmar si hay mensajes de error distintos según la capa que bloquea.
- No se encontró dato verificable sobre cuántos bloqueos por modelo ocurren dentro de Higgsfield frente a usar el modelo directamente. No hubo hilos de Reddit recuperables.

## 2. Seedance / Dreamina (ByteDance): extensión del informe previo

### Takeaway
BytePlus describe un sistema de dos capas (filtro de entrada y moderación de salida del modelo) y admite que algunas políticas de plataforma no se pueden desactivar. En terceros hay códigos de error diferenciados para texto, imagen con persona real, video y audio de salida, y aparece una vía de verificación de persona real con consentimiento y prueba de vida.

### Cited Findings
- Artículo de ayuda de BytePlus (18 ago 2026): requests can be blocked by a "two-layer safety system" made of "an input content filter and the model's own output moderation"; hay emparejamiento de figuras públicas/deepfake; "Some platform-level safety policies cannot be disabled"; recomienda optimizar el prompt y "remove sensitive elements from input images, audio, or video"; nombra los códigos SensitiveContentDetected y PolicyViolation. No cubre facturación ni reglas detalladas de caras — [BytePlus: why was my request rejected](https://ai.byteplus.com/en/help/article/why-was-my-request-rejected-for-sensitive-or-non-compliant-content-and-how-do-i-reduce-false-rejections).
- Guía de errores de Segmind (19 abr 2026, sobre Seedance 2.0; tercero que revende acceso): `OutputVideoSensitiveContentDetected` ("The request failed because the output video may contain sensitive information"), que puede ocurrir con prompts limpios porque los fotogramas intermedios pueden activar el filtro; `OutputAudioSensitiveContentDetected` (diálogo o voz que se parezca a música con copyright o a voces reales; sugiere `generate_audio=False`); `OutputVideoSensitiveContentDetected.PolicyViolation` ("related to copyright restrictions", usar descripciones genéricas en vez de personajes o marcas con nombre); entrada de texto sensible ("input text may contain sensitive information"); y "The request failed because the input image may contain real person", descrito como bloqueo duro en imagen a video — [Segmind Seedance 2.0 Error Guide](https://blog.segmind.com/seedance-2-0-error-guide-every-error-explained-with-fixes/).
- Mismo Segmind: "you are not charged for failed generations". Es afirmación de un revendedor, no de BytePlus/Dreamina — misma fuente.
- Una búsqueda sobre la tabla oficial de errores de ModelArk reportó una familia 400 `SensitiveContentDetected` con subtipos (por ejemplo `.SevereViolation`, `.Violence`); la tabla completa no se pudo leer y los nombres exactos `InputTextSensitiveContentDetected` y `OutputVideoSensitiveContentDetected` no aparecieron en esa tabla oficial — resultado de búsqueda sobre [docs.byteplus.com ModelArk error codes](https://docs.byteplus.com/docs/ModelArk/1299023) (página renderizada sin tabla; no verificado).
- Verificación de persona real (doc de YingTu, revendedor, actualizado 25 sep 2026): para videos con una persona real, Seedance exige la autorización de la propia persona y "an ordinary photo is not enough"; consentimiento y prueba de vida en la página de verificación de Volcengine; los personajes ficticios usan una API de "virtual-human asset" aparte; no hay biblioteca pública de retratos autorizados — [YingTu Seedance real-person asset API](https://yingtu.ai/es/blog/seedance-2-0-human-face). Es descripción de un tercero, no de Volcengine.
- Seedance.tv (blog de tercero): un bloqueo puede venir de "the source image, the text prompt, or the combination of both"; riesgos citados: personas reales o reconocibles sin permiso, suplantación o respaldo falso, contexto sensible, imágenes privadas. No cita mensajes exactos ni créditos — [Seedance.tv safety filters](https://www.seedance.tv/blog/seedance-safety-filters-real-faces-image-prompts-2026).

### Inferences
- Para productos con manos y personas: la ruta consistente con las fuentes es personaje ficticio generado por texto o por imagen sintética sin parecido a nadie, y activos de producto sin caras reales. El filtro de salida puede rechazar aunque la entrada pase, así que reintentar con variación legítima del contenido (no del truco) puede ser razonable, y dependiendo de la plataforma se cobra o no.
- El informe previo sobre Dreamina 2.0 ("Real human faces are not supported") encaja con la política de BytePlus de bloquear referencias de caras reales; la nueva información es que existe una vía documentada por terceros de verificación con consentimiento para la propia persona.

### Gaps
- No se leyó la tabla oficial de códigos de ModelArk ni la documentación de Content Pre-filter; los nombres de códigos de salida provienen de Segmind.
- Sin confirmación oficial de si Seedance 2.5 cambió las reglas respecto a 2.0, ni de si Dreamina/Higgsfield descuenta créditos en rechazo de Seedance.
- Sin lista oficial de marcas/logotipos o categorías reguladas (suplementos, cosméticos) para Seedance.

## 3. Kling (Kuaishou)

### Takeaway
No se encontró una política oficial de generación legible; solo guías de terceros, que coinciden en prohibir contenido sexual explícito, violencia gráfica, política sensible, actividades ilegales, desinformación, odio, personajes con marca registrada y mal uso de la semejanza de personas reales. Es el modelo con la documentación de errores más contradictoria entre fuentes.

### Cited Findings
- La página oficial de Kling "Community Guidelines" (12 dic 2024) trata solo de moderación de comentarios (contenido contra principios constitucionales, terrorismo, discriminación, lenguaje vulgar, intimidación, invasión de privacidad), no de generación — [Kling community policy](https://kling.ai/docs/community-policy).
- Guía de Atlas Cloud (revendedor, citada por buscador, página después devolvió HTTP 410 al leerla): seis categorías prohibidas (explícito/adulto, violencia gráfica, sensibilidad política y social, actividad ilegal o dañina, desinformación, discurso de odio), con restricciones políticas más estrictas que en plataformas occidentales; personajes de marca (Mickey Mouse, Spider-Man) restringidos — [Atlas Cloud Kling NSFW policy](https://www.atlascloud.ai/blog/guides/kling-ai-nsfw-policy) (no verificado, tercero).
- AnyCap (tercero): una solicitud marcada devuelve error 400 con `content_policy_violation` y no se crea tarea; no consume créditos pero sí cuota de peticiones; en imagen a video la imagen pasa por moderación antes de generar — [AnyCap Kling policy](https://anycap.ai/page/en-US/ai/kling-ai-nsfw-policy-developers). Contradicción: Atlas Cloud dice que la API devuelve un error genérico, y un archivo de habilidades de desarrollador describe fallos a nivel de tarea con HTTP 200 y mensaje "Content policy violation" — contradichos entre sí según el resumen de búsqueda de [Kling error pages](https://tessl.io/registry/skills/github/jeremylongshore/tons-of-skills-marketplace/klingai-common-errors). Ninguna fuente oficial confirma los códigos 1301/1303.
- Semejanza de personas reales: terceros describen "real person likenesses used in misleading ways" como prohibido y figuras públicas "often flagged" — [Atlas Cloud](https://www.atlascloud.ai/blog/guides/kling-ai-nsfw-policy); [Zilliz FAQ](https://zilliz.com/ai-faq/is-kling-ai-safe-to-use) (resumen de búsqueda, no leído completo).

### Inferences
- Dentro de Higgsfield, Kling estaría sujeto a la capa de Higgsfield más el filtro de Kling; la política de comentarios oficial no sirve como regla de generación.

### Gaps
- No se obtuvo la política oficial de Kling para generación (Terms/Usage Policy), tabla oficial de códigos de error de la API, ni cambios entre Kling 2.x y 3 en cuanto a moderación.
- Sin dato oficial confirmado de créditos en rechazo (solo AnyCap, tercero).

## 4. Google Veo 3 / 3.1

### Takeaway
Veo es el modelo con mejor documentación oficial: filtros sobre prompt, imagen/video de entrada y salida, y códigos de soporte por categoría (menores, celebridades, sexual, violencia, etc.). Las personas y los niños dependen del parámetro `personGeneration` y de la lista de permitidos del proyecto.

### Cited Findings
- "Prompts that are provided to Veo are assessed against a list of safety filters" (texto, imagen y video de entrada); un error "The prompt couldn't be submitted" indica filtro de entrada, y recibir menos videos de los pedidos indica salida bloqueada — [Google Cloud: Responsible AI for Veo](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/video/responsible-ai-and-usage-guidelines) (leído 15 oct 2026).
- Tabla de códigos de soporte (misma página): Child 58061214, 17301594 ("Rejects requests to generate content depicting children", sujeto a `personGeneration` en "allow_all" y a lista de permitidos del proyecto); Celebrity 29310472, 15236754 ("Rejects requests to generate a photorealistic representation of a prominent person" o proyecto sin permiso); Video safety violation 64151117, 42237218; Dangerous content 62263041; Hate 57734940, 22137204; Other 74803281, 29578790, 42876398; Prohibited content (seguridad infantil u otro sensible) 89371032, 49114662, 63429089, 72817394, 60599140; Third-party content 35561574, 35561575 ("Guardrails related to third-party content"); Sexual 90789179, 43188360 ("Sexual or suggestive content"); Toxic 78610348; Violence 61493863, 56562880; Vulgar 32635315.
- La página no dice nada sobre cobro de solicitudes bloqueadas ni incluye categoría de privacidad — misma página.
- Una respuesta de comunidad vincula el código 58061214 a palabras sensibles y sugiere reformular o pedir allowlist; es comunidad, no documentación — [Google Developer forum](https://discuss.google.dev/t/need-assistance/189880).
- Política de uso prohibido generativa de Google: prohíbe, entre otros, contenido sexualmente explícito, violencia, odio, "Impersonating an individual (living or dead) without explicit disclosure, in order to deceive", "Violates the rights of others, including privacy and intellectual property rights", "Circumvention of abuse protections or safety filters", afirmaciones engañosas de experiencia en áreas sensibles y prácticas de salud dañinas; no hay categoría "médica" independiente — [Google Generative AI Prohibited Use Policy](https://policies.google.com/terms/generative-ai/use-policy).

### Inferences
- "Third-party content" es la categoría más probable para logotipos, marcas y personajes con copyright; "Sexual or suggestive" para piel/ropa ajustada; "Child" para productos infantiles con niños visibles. Estas asociaciones son inferencia, la página solo da descripciones breves.
- En Higgsfield, si Veo rechaza, el mensaje puede no mostrar el código de soporte.

### Gaps
- No se leyó el texto previo de la página (las primeras 20 000 caracteres) ni la referencia de `personGeneration` para Veo 3.x; no se confirmó facturación en rechazo ni diferencias entre Veo 3 y 3.1.

## 5. OpenAI Sora 2

### Takeaway
Las reglas sobre semejanza son las más estrictas: cameos con consentimiento y verificación en la app; en la API, según un foro y terceros, se rechazan imágenes con rostros humanos y personas reales. La información oficial no pudo leerse (usage-policies devolvió 403); gran parte viene de terceros. Además hay alertas de retirada de la API.

### Cited Findings
- CometAPI (tercero): moderación en tres capas (entrada, durante generación, salida), prohibiendo sexual explícito, uso no autorizado de semejanza de personas reales, personajes/obras con copyright (incluida imitación clara de estilos), contenido ilícito, odio/extremismo, desinformación médica/legal/financiera de alto riesgo; no cita códigos ni créditos — [CometAPI: Sora 2 moderation](https://www.cometapi.com/what-is-sora-2s-content-moderation-system/) (afirmaciones sin fuentes primarias; la propia página tiene inconsistencias sobre retirada de la API).
- Cobertura de prensa (marzo 2026) sobre salvaguardas de OpenAI: se pueden crear videos desde fotos de familiares/amigos si se atestigua consentimiento y derechos, con moderación más estricta que los personajes antes llamados cameos; imágenes con niños o personas aparentemente jóvenes tienen límites más estrictos; marcas de agua y C2PA — [SecurityBrief UK](https://securitybrief.co.uk/story/openai-details-sora-2-safeguards-on-likeness-teens) (resumen de búsqueda, no leído completo).
- Foro de la comunidad de OpenAI al lanzar la API: personas reales, incluidas figuras públicas, no se pueden generar y las imágenes de entrada con rostros humanos se rechazan actualmente — [OpenAI Community: cameo en la API](https://community.openai.com/t/sora-2-api-are-the-cameo-features-coming-to-the-api/1361267) (foro, puede haber cambiado).
- apiyi (revendedor): la comprobación previa de imágenes (rostro humano real, copyright, términos sensibles) devuelve `sentinel_block`, mientras `moderation_blocked` viene de una comprobación a mitad de generación sobre fotogramas intermedios — [apiyi Sora 2 errors](https://help.apiyi.com/fr?p=7133) (no verificado). Un hilo de comunidad dice que prompts oficiales también pueden dar `moderation_blocked` — [OpenAI Community: Sora moderation](https://community.openai.com/t/sora-moderation-is-kind-of-absurd/1361515).
- Una guía de julio 2026 y CometAPI indican que OpenAI lista la API de videos y alias de Sora 2 para retirada el 24 de septiembre de 2026; de ser cierto, Sora 2 por API ya estaría retirada, a verificar en la página de deprecaciones de OpenAI — [YingTu](https://yingtu.ai/ko/blog/sora2-api-size-error).

### Inferences
- Para el usuario: en Sora 2 evitar rostros reales en referencias; personajes ficticios descritos por texto; evitar marcas y personajes con nombre. Dado el posible retiro, comprobar si Higgsfield aún ofrece Sora 2.

### Gaps
- No se leyeron las Usage Policies ni el system card de OpenAI; sin confirmación oficial de códigos, créditos en rechazo ni del estado actual de la API.

## 6. MiniMax Hailuo

### Takeaway
Hay códigos específicos de moderación de entrada (1026) y salida (1027) según un sitio independiente que cita la referencia de MiniMax; el resto (filtro en tres etapas) proviene de un revendedor.

### Cited Findings
- `1026` = "input new_sensitive" (la entrada activó restricción de sensibilidad) y `1027` = "output new_sensitive" (la salida activó restricción); la guía dice no reintentar igual ni intentar saltar el filtro. Sitio independiente no afiliado a MiniMax; las columnas de interpretación son del autor — [minimax-ai.chat error codes](https://minimax-ai.chat/guide/minimax-api-error-codes/) (verificado 20 jul 2026 según la página).
- Atlas Cloud (revendedor): filtro en tres etapas (palabras clave antes de procesar, vigilancia durante renderizado, comprobación final del archivo), con falsos positivos por umbral — [Atlas Cloud Hailuo](https://www.atlascloud.ai/blog/guides/hailuo-ai-nsfw-content-restrictions-guide) (resumen de búsqueda; la página devolvió 410 al leerla).

### Inferences
- Los códigos 1026/1027 permiten distinguir en la API si falló la entrada o la salida; en Higgsfield probablemente no se muestren.

### Gaps
- No se leyó la política oficial de MiniMax/Hailuo ni la tabla oficial en platform.minimax.io; sin datos de créditos en rechazo ni de categorías prohibidas oficiales (menores, personas reales, marcas).

## 7. Alibaba Wan

### Takeaway
Alibaba Model Studio documenta un servicio de Guardrails con el error HTTP 400 `data_inspection_failed`/`DataInspectionFailed` y mensaje "Output data may contain inappropriate content", pero la página leída no cubre video ni Wan específicamente.

### Cited Findings
- Documentación de Guardrails de Model Studio: la inspección se activa con el encabezado `X-DashScope-DataInspection` (`"input": "cip"`, `"output": "cip"`); ejemplo de salida marcada: HTTP 400, código `data_inspection_failed` (SDK DashScope: `DataInspectionFailed`), mensaje "Output data may contain inappropriate content"; imágenes de entrada y salida tienen servicios aparte; facturación por tokens con mínimo de 1 000. La página no menciona video — [Alibaba Cloud Guardrails for Model Studio](https://help.aliyun.com/en/document_detail/2923687.html).
- Discusión en Hugging Face: el Space de Wan2.1 usa la API original de DashScope, que aplica censura de contenido; ejecutar local evita el filtrado. Un hilo de mayo 2026 reporta bloqueos en Wan 2.2 14B imagen a video por un ajuste de "safety filter" activado automáticamente — [Hugging Face Wan2.1 discussion](https://huggingface.co/spaces/Wan-AI/Wan2.1/discussions/15); [hilo Reddit espejo](https://reddit.sentinel-team.org/posts/1t2c8mj/snapshots/2026-05-08T22%3A27%3A28.91308Z) (comunidad, baja fiabilidad).
- Pesos abiertos: un filtro opcional de NSFW en fal.ai está desactivado por defecto en su ejemplo de Wan2.1 — [fal.ai docs](https://docs.fal.ai/serverless/tutorials/text-to-video-model). Implica que el filtro depende de quién aloja el modelo, no del modelo.

### Inferences
- Wan es el caso donde la moderación depende totalmente del host; en Higgsfield aplica la capa de Higgsfield más la del hosting que use. Por ser inferencia, no hay fuente.

### Gaps
- No se encontró política de contenido oficial de Wan, mensaje IP/marca (el código `IPInfringementSuspect` no apareció en ninguna fuente), ni confirmación de cobro en rechazo. Wan 2.5-2.7 no se compararon.

## 8. Categorías propensas a falsos positivos en videos de producto y buenas prácticas compatibles

### Takeaway
Las fuentes oficiales apuntan a ropa ajustada/swimwear, fitness, anatomía y combinaciones imagen+texto; la semejanza de personas reales es el bloqueo más duro. Las demás categorías (mascotas, cosméticos, suplementos, armas, espejos/baños) solo se pueden inferir.

### Cited Findings
- Higgsfield lista swimwear/ropa reveladora, fitness, imaginería médica/anatómica, composición límite en referencias y redacción ambigua — [Higgsfield Help Center](https://higgsfield.ai/creator-hub/help-center/troubleshooting/content-flagged-as-nsfw).
- Seedance: audio con voces o música reconocibles y marcas/personajes con nombre disparan filtros de salida y copyright — [Segmind](https://blog.segmind.com/seedance-2-0-error-guide-every-error-explained-with-fixes/).
- Veo: categorías "Sexual or suggestive", "Child", "Celebrity" y "Third-party content" — [Google Cloud](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/video/responsible-ai-and-usage-guidelines).
- Google prohíbe además afirmaciones engañosas de salud y de experiencia — [Google Prohibited Use Policy](https://policies.google.com/terms/generative-ai/use-policy).

### Inferences
- Prácticas compatibles: usar avatares ficticios sin parecido real; referencias de producto sin rostros; descripciones neutras y específicas; incluir prompt de texto junto a la imagen; evitar marcas/logotipos de terceros en el encuadre y personajes con nombre; evitar claims de salud en suplementos/cosméticos y mostrar la piel de manos como contexto de producto; en ropa, preferir prendas con descripción funcional. Son recomendaciones derivadas, no reglas oficiales.

### Gaps
- Sin fuente fiable sobre mascotas, cosméticos, suplementos, productos tipo arma, texto/logotipos y espejos/baños como categorías específicas de falsos positivos; no se encontraron hilos de Reddit/GitHub recuperables.

## 9. Entrada frente a salida, códigos y créditos (resumen comparativo)

### Takeaway
Veo, Seedance, Hailuo y Wan distinguen filtros de entrada y salida; Sora 2 añade una comprobación a mitad de generación. Sobre créditos solo hay afirmación oficial en Higgsfield ("most models") y afirmaciones de terceros para Seedance y Kling.

### Cited Findings
- Veo: "prompt couldn't be submitted" (entrada) vs menos videos (salida) con códigos de soporte — [Google Cloud](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/video/responsible-ai-and-usage-guidelines).
- Seedance: `SensitiveContentDetected`/`Input...` vs `OutputVideoSensitiveContentDetected`, `OutputAudioSensitiveContentDetected`, "input image may contain real person" — [Segmind](https://blog.segmind.com/seedance-2-0-error-guide-every-error-explained-with-fixes/); BytePlus confirma las dos capas — [BytePlus](https://ai.byteplus.com/en/help/article/why-was-my-request-rejected-for-sensitive-or-non-compliant-content-and-how-do-i-reduce-false-rejections).
- Hailuo: 1026 entrada, 1027 salida — [minimax-ai.chat](https://minimax-ai.chat/guide/minimax-api-error-codes/).
- Wan: `DataInspectionFailed` 400 — [Alibaba Guardrails](https://help.aliyun.com/en/document_detail/2923687.html).
- Sora 2: `sentinel_block` frente a `moderation_blocked` — [apiyi](https://help.apiyi.com/fr?p=7133) (tercero).
- Kling: sin tabla oficial; AnyCap menciona 400 `content_policy_violation` sin tarea — [AnyCap](https://anycap.ai/page/en-US/ai/kling-ai-nsfw-policy-developers).
- Créditos: Higgsfield devuelve "automatically for most models"; Segmind dice que Seedance no cobra fallos; AnyCap que Kling no consume créditos en rechazos de API; Google y Sora sin dato — fuentes arriba.

### Inferences
- Como Higgsfield es el intermediario y el reembolso es "most models", conviene verificar el saldo antes y después de cada rechazo, especialmente con un rechazo de salida (el modelo ya generó).

### Gaps
- Nada documentado oficialmente sobre cuánto se cobra cuando el filtro de salida rechaza un video ya generado en la API de cada proveedor.
- Cambios 2025-2026 por versión (Kling 3, Seedance 2.5, Veo 3.1, Sora 2): solo hay evidencia sobre rostros reales en Seedance 2.x (BytePlus/Segmind/YingTu), personas en Sora 2 (foro/prensa) y `personGeneration` en Veo; el resto no se pudo confirmar.
