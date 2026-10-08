# Opciones de capacidad para reducir/evitar errores 503 de Gemini (y su costo) — usuario de bajo presupuesto

Fecha de investigación: 2026-10-05. Workload de referencia: generateContent con video del Files API, segmentos de ~2 min a fps 2, prompt ~25k tokens, salida hasta ~30k tokens, 10–60 llamadas/día.

Nota de alcance: los modelos vigentes en la página de precios (actualizada 2026-10-01) son Gemini 3.8 / 3.7 / 3.6 / 3.5 Flash y 3.5 / 3.1 Flash-Lite. Varias páginas de docs.cloud.google.com (Vertex, ahora renombrado "Gemini Enterprise Agent Platform") devolvieron solo navegación al hacer fetch; esos datos vienen de snippets de búsqueda y fuentes secundarias, señalado en cada caso.

## 1. Gemini Developer API tier de pago (Tier 1 vía billing): ¿mejora disponibilidad? Precios

### Takeaway
Activar billing (prepago mínimo $5) sube los rate limits (menos 429) pero la documentación oficial NO promete mejor prioridad ni menos 503 frente al tier gratuito; los 503 son por capacidad compartida. Lo que sí da prioridad explícita es el tier "Priority" (requiere Tier 2 = $100 pagados + 3 días). Precio por llamada del workload: ~$0.15–0.18 con 3.8 Flash estándar, ~$0.06–0.07 con 3.1 Flash-Lite.

### Cited Findings
- Para pasar a pago hay que "link a billing account and prepay a minimum of $5"; Prepay $5–$5,000, créditos expiran a 12 meses; alternativa Postpay con spend cap automático — [Gemini API Billing, act. 2026-09-28](https://ai.google.dev/gemini-api/docs/billing)
- La doc de billing no afirma que el tier pago tenga mejor disponibilidad/prioridad; solo mayores rate limits y que los prompts no se usan para mejorar productos — [Gemini API Billing](https://ai.google.dev/gemini-api/docs/billing)
- Tiers: Free (sin billing); Tier 1 = billing activo, spending cap $250; Tier 2 = "Paid $100 + 3 days from first successful payment", cap $2,000; Tier 3 = $1,000 + 30 días, cap $20k–$100k+. Free→Tier 1 instantáneo; siguientes upgrades ~10 min. La página no contrasta confiabilidad free vs pago ni menciona 503 — [Rate limits, act. 2026-09-02](https://ai.google.dev/gemini-api/docs/rate-limits)
- Guía oficial ante 503 UNAVAILABLE/overloaded y 429: backoff exponencial con jitter (1s, 2s, 4s, 8s); el SDK de Python reintenta automáticamente hasta 4 veces (~1s inicial). No menciona pasar a pago como solución — [Troubleshooting, act. 2026-10-01](https://ai.google.dev/gemini-api/docs/troubleshooting)
- Precios pago (por 1M tokens, vigentes hasta 2026-12-31) — [Pricing, act. 2026-10-01](https://ai.google.dev/gemini-api/docs/pricing):
  - Gemini 3.8 Flash: input $0.75, output $3.75; caching $0.075 + $0.50/h almacenamiento; Batch/Flex $0.375 / $1.875; Priority $1.35 / $6.75. Free tier "con limitaciones".
  - Gemini 3.7 Flash y 3.6 Flash: misma estructura que 3.8. Gemini 3.5 Flash: $1.50 / $9.00.
  - Gemini 3.5 Flash-Lite: input $0.30 (texto/imagen/video/audio), output $2.50; caching $0.03 + $1.00/h; Batch/Flex $0.15 / $1.25; Priority $0.54 / $4.50.
  - Gemini 3.1 Flash-Lite: input $0.25 texto/imagen/video, $0.50 audio; output $1.50; caching $0.025 (audio $0.05) + $1.00/h; Batch/Flex $0.125 (audio $0.25) / $0.75; Priority $0.45 (audio $0.90) / $2.70.
  - Subida de precios el 2027-01-01 (ej. 3.8 Flash pasa a $1.50 input / $7.50 output).
- Tokens de video: 66 tokens/frame a resolución baja, 258 tokens/frame a resolución alta; audio 32 tokens/s; ~100 tok/s (baja) o ~300 tok/s (alta) a 1 fps por defecto; el fps personalizado escala proporcionalmente. Files API: 20GB (pago) / 2GB (gratis) — [Video understanding, act. 2026-09-23](https://ai.google.dev/gemini-api/docs/video-understanding)

### Inferences
- Cálculo por segmento de 2 min a fps 2 (240 frames + 120 s audio): resolución baja = 240×66 + 120×32 ≈ 19.7k tokens; alta = 240×258 + 3,840 ≈ 65.8k tokens. Con prompt de 25k: input total ≈ 44.7k (baja) o ≈ 90.8k (alta). Salida máx. 30k.
- Costo por llamada (con salida máx. 30k; real probablemente menor):
  - 3.8 Flash estándar: ≈ $0.146 (baja) / ≈ $0.181 (alta). Flex/Batch: ≈ $0.073 / $0.090. Priority: ≈ $0.263 / $0.326.
  - 3.1 Flash-Lite estándar: ≈ $0.056 / $0.068. Flex/Batch: ≈ $0.028 / $0.034.
- Costo diario/mensual (10–60 llamadas/día):
  - 3.8 Flash estándar: ≈ $1.5–$10.9/día → ≈ $44–$327/mes.
  - 3.8 Flash Flex: ≈ $0.7–$5.4/día → ≈ $22–$163/mes.
  - 3.1 Flash-Lite estándar: ≈ $0.56–$4.1/día → ≈ $17–$122/mes.
- El spending cap de Tier 1 ($250) podría alcanzarse con 3.8 Flash estándar a 60 llamadas/día en resolución alta; un usuario de bajo presupuesto puede usarlo como tope de seguridad.
- Bajar `media_resolution` a baja reduce el input de video ~3×; es la palanca de costo más grande después de elegir modelo.

### Gaps
- No encontré documentación oficial que cuantifique tasas de 503 free vs pago. La evidencia de que pago "no ayuda con 503" es por omisión, no por afirmación explícita.
- Los límites RPM/RPD exactos del free tier no se publican en la página (remite a AI Studio).

## 2. Batch API (Gemini Developer API y Vertex AI batch prediction)

### Takeaway
Batch cuesta 50% del estándar, objetivo de entrega 24 h (normalmente mucho antes), JSONL hasta 2GB, jobs expiran a 48 h. Evita el 503 en la llamada del usuario porque la cola la gestiona Google, pero la doc no promete nada sobre sobrecarga, y el uso de video del Files API dentro del JSONL no está documentado de forma explícita en la página.

### Cited Findings
- Batch = "50% of the standard cost"; objetivo de turnaround "24 hours", "in majority of cases, it is much quicker"; archivo JSONL de entrada hasta 2GB; requests inline < 20MB total; jobs expiran a 48 h (JOB_STATE_EXPIRED) — [Batch mode, act. 2026-09-17](https://ai.google.dev/gemini-api/docs/batch-mode)
- Formato de línea JSONL: `{"key": "request-1", "request": {"contents": [{"parts": [{"text": "..."}]}]}}` (solo ejemplos de texto en la página) — [Batch mode](https://ai.google.dev/gemini-api/docs/batch-mode)
- La página de batch no menciona evitar 503 ni restricciones de free tier — [Batch mode](https://ai.google.dev/gemini-api/docs/batch-mode)
- El blog oficial contrasta Flex (síncrono) con Batch, que requiere "file management or job polling" — [Google blog, 2026-04-02](https://blog.google/innovation-and-ai/technology/developers-tools/introducing-flex-and-priority-inference/)

### Inferences
- Como el campo `request` es un GenerateContentRequest, previsiblemente acepta `{"file_data": {"file_uri": "...", "mime_type": "video/mp4"}}` y `video_metadata` (fps) igual que la llamada interactiva; debe verificarse con una prueba pequeña. Ojo: los archivos del Files API caducan (históricamente 48 h), así que el batch debe enviarse justo tras subir los videos.
- Para un flujo interactivo (usuario esperando el análisis), Batch es inadecuado por la latencia; Flex da el mismo 50% con interfaz síncrona.

### Gaps
- No hay confirmación explícita en la doc fetchada de video+fileData en JSONL, ni de que Batch esté disponible en free tier.
- No pude extraer detalles de Vertex AI batch prediction (la página de docs.cloud.google.com devolvió solo navegación).

## 3. Flex / Priority / service tiers; Vertex Provisioned Throughput, DSQ, global endpoint

### Takeaway
Existen desde el 1–2 abr 2026: Flex (50% desc., "sheddable", puede devolver 503, latencia objetivo 1–15 min) y Priority (1.8×, máxima prioridad, si hay overflow degrada a Standard en vez de fallar; solo Tier 2/3). En Vertex hay Standard/Priority/Flex PayGo sobre Dynamic Shared Quota; Priority PayGo y el endpoint global reducen pero no eliminan 429. Provisioned Throughput es inviable para bajo presupuesto (≈$5k/mes mínimo).

### Cited Findings
- Flex: parámetro `service_tier: 'flex'`; 50% del estándar; latencia objetivo "1–15 min", recomendar timeouts ≥10 min; las peticiones son "sheddable" y pueden ser preemptadas; devuelve 503 cuando se agota capacidad y 429 por rate limit; no se sube automáticamente a Standard; hay que implementar reintentos con backoff; en Preview; soporta 11 modelos incl. 3.8 Flash — [Flex inference, act. 2026-09-23](https://ai.google.dev/gemini-api/docs/flex-inference)
- Flex disponible para "all paid tiers"; Priority solo Tier 2/3; Priority = "Highest criticality leading to higher reliability, even during peak load"; "Overflow requests are automatically served at the Standard tier instead of failing"; la respuesta indica qué tier la sirvió; ambos en GenerateContent e Interactions API — [Google blog, 2026-04-02](https://blog.google/innovation-and-ai/technology/developers-tools/introducing-flex-and-priority-inference/)
- Precios Priority = 1.8× (3.8 Flash: $1.35 / $6.75) — [Pricing](https://ai.google.dev/gemini-api/docs/pricing)
- Vertex: Standard PayGo 1.0×, Priority PayGo 1.8×, Flex PayGo 0.5×, sin compromiso; Flex PayGo solo en endpoint global; Priority PayGo "can significantly reduce the chance of 429s" pero no eliminarlos, solo en endpoint global (snippets de búsqueda) — [Vertex Priority PayGo](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/priority-paygo?hl=it); [LiteLLM: Vertex PayGo and Priority](https://docs.litellm.ai/docs/tutorials/vertex_ai_pay_go)
- Dynamic Shared Quota: sin límite fijo, pool compartido asignado según disponibilidad; un 429 indica contención temporal, no cuota agotada; el endpoint global enruta a la región con capacidad y hace fallback si una región está sobrecargada (snippets) — [Vertex Throughput quota](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/resources/throughput-quota); [Google Cloud blog: robust gen AI strategy](https://cloud.google.com/blog/products/ai-machine-learning/build-a-robust-and-cost-effective-gen-ai-strategy)
- "Ghost 429s" cuando la demanda regional sube y el pool best-effort se contrae (fuente secundaria/foro) — [Google Developer forums](https://discuss.google.dev/t/which-specific-limit-did-we-exceed-error-429-message-resource-exhausted-please-try-again-later/334310)
- Provisioned Throughput: mínimo 1 GSU; ≈ $7.14/GSU-hora (1 semana), ≈ $3.70 (1 mes), ≈ $3.29 (3 meses), ≈ $2.74 (1 año); 1 GSU semana ≈ $1,200/semana; mes ≈ $2,700/GSU (fuentes secundarias, no verificado en la página oficial) — [nOps](https://www.nops.io/blog/vertex-ai-cost-optimization-guide/); [drpranayjha](https://drpranayjha.com/vertex-ai-pricing-provisioned-throughput-caching/); página oficial: [Agent Platform Pricing](https://docs.cloud.google.com/vertex-ai/generative-ai/pricing)

### Inferences
- Para 503 "high demand" en el Developer API, Flex es la opción MÁS propensa a 503 (es la primera que se descarta); sirve solo para ahorrar, no para fiabilidad.
- Priority es la única opción del Developer API con promesa explícita de fiabilidad en picos; cuesta 1.8× pero llegar a Tier 2 solo requiere $100 pagados acumulados + 3 días (con prepago, esos $100 se consumen en uso real).
- En Vertex, Standard PayGo + endpoint global es la forma barata (1.0×) de acceder a un pool multirregión más grande; es probable que reduzca 429/503 frente a un endpoint regional o al Developer API, pero no hay cifras.
- Provisioned Throughput (≈$2.7k–$5k/mes por 1 GSU) está ~10–100× por encima del gasto del workload; descartado.

### Gaps
- No obtuve el texto oficial de la página de DSQ ni de Provisioned Throughput (docs devolvieron navegación). Precios GSU solo de terceros.
- Los docs de Vertex hablan de 429; no encontré mención explícita de cómo se comportan los 503 "overloaded" en Vertex.
- No confirmé si Priority PayGo de Vertex exige algún umbral de gasto como el Tier 2 del Developer API.

## 4. Vertex AI express mode y créditos $300

### Takeaway
Los $300 de prueba de Google Cloud ya NO pagan el Gemini API de AI Studio (desde marzo 2026), pero según fuentes secundarias sí cubren Gemini en Vertex AI (90 días). Express mode de Vertex permite uso sin billing con cuotas limitadas durante 90 días.

### Cited Findings
- "Gemini API usage costs are specifically excluded from the $300 Google Cloud Free Trial program" desde marzo 2026; los créditos "can't be used to pay for AI Studio usage" — [Gemini API Billing, act. 2026-09-28](https://ai.google.dev/gemini-api/docs/billing)
- El trial de $300 / 90 días ya no paga Gemini API en AI Studio para cuentas abiertas tras el 2 de marzo de 2026, "but it still covers Gemini on Vertex AI" (fuente secundaria) — [klymentiev.com](https://klymentiev.com/blog/gemini-free-credits)
- Express mode: Vertex AI Studio / Agent Builder con cuotas limitadas, sin billing, 90 días; Pro salió del free tier de AI Studio el 2026-04-01 (fuentes secundarias) — [klymentiev.com free credits](https://klymentiev.com/blog/free-google-cloud-credits); [pecollective](https://pecollective.com/tools/gemini-free-tier-guide/)

### Inferences
- $300 en Vertex con 3.8 Flash estándar (≈$0.15–0.18/llamada) ≈ 1,650–2,000 llamadas; con 3.1 Flash-Lite ≈ 4,400–5,400 llamadas. A 60 llamadas/día alcanza para todo el periodo de 90 días con Flash-Lite y ~1 mes con 3.8 Flash. Es el camino más barato a corto plazo, requiere migrar a Vertex (SDK google-genai con `vertexai=True`, video vía GCS en lugar de Files API).
- Express mode probablemente no sirve para mejorar fiabilidad (cuotas limitadas).

### Gaps
- No verifiqué en fuente primaria de Google Cloud que el $300 cubra Gemini en Vertex en 2026, ni las cuotas concretas de express mode ni si soporta video.

## 5. Context caching

### Takeaway
Implicit caching es automático en Gemini 2.5+ (sin coste ni acción). Explicit caching cuesta 10% del input ($0.075/M en 3.8 Flash) + almacenamiento por hora; mínimo 4,096 tokens en 3.x Flash. Ahorra dinero en el prompt de 25k si se reutiliza ≥1 vez/hora, pero no hay evidencia de que reduzca 503.

### Cited Findings
- Implicit caching "enabled by default for all Gemini 2.5 and newer models"; ahorro pasado automáticamente; hits visibles en `usage.total_cached_tokens`; Interactions API solo soporta implicit — [Caching, act. 2026-09-02](https://ai.google.dev/gemini-api/docs/caching)
- Mínimo de tokens: 4,096 para 3.8/3.7/3.6/3.5 Flash y 3.1 Pro Preview; 2,048 para 2.5 Flash/Pro — [Caching](https://ai.google.dev/gemini-api/docs/caching)
- Precio cache: 3.8 Flash $0.075/M + $0.50/h; 3.1 Flash-Lite $0.025/M + $1.00/h; 3.5 Flash-Lite $0.03/M + $1.00/h — [Pricing](https://ai.google.dev/gemini-api/docs/pricing)

### Inferences
- Prompt de 25k en 3.8 Flash: almacenamiento ≈ 0.025M × $0.50 = $0.0125/h; ahorro por llamada ≈ 0.025 × ($0.75 − $0.075) ≈ $0.017. Rentable si hay ≥1 llamada por hora de TTL. En 3.1 Flash-Lite: almacenamiento $0.025/h vs ahorro ≈ $0.0056/llamada → necesita ≥5 llamadas/h; poco útil.
- Cachear el video no tiene sentido si cada segmento se analiza una sola vez. Para el prompt, poner el texto fijo AL PRINCIPIO de la petición maximiza hits de implicit caching gratis.

### Gaps
- No hay datos de que el caching reduzca la probabilidad de 503. Discount % de implicit caching y TTL por defecto no aparecieron en el extracto.

## 6. Mejor fiabilidad por dólar para ~10–60 llamadas de video/día

### Takeaway
Ranking práctico: (1) pagar Tier 1 con prepago chico + reintentos con backoff + fallback de modelo (3.8 Flash → 3.1 Flash-Lite) es lo más barato; (2) si los 503 persisten, el salto de fiabilidad documentado es Priority (Tier 2, 1.8×, degradación a Standard en vez de fallar) o Vertex Standard/Priority PayGo en endpoint global (pagable con los $300 de prueba); (3) Flex/Batch solo para ahorrar en trabajos que pueden esperar; (4) Provisioned Throughput descartado.

### Cited Findings
- Priority degrada a Standard en vez de fallar; Tier 2/3 — [Google blog](https://blog.google/innovation-and-ai/technology/developers-tools/introducing-flex-and-priority-inference/)
- Flex puede devolver 503 y no escala a Standard — [Flex inference](https://ai.google.dev/gemini-api/docs/flex-inference)
- Tier 2 = $100 pagados + 3 días — [Rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)
- Global endpoint de Vertex hace fallback entre regiones — [Google Cloud blog](https://cloud.google.com/blog/products/ai-machine-learning/build-a-robust-and-cost-effective-gen-ai-strategy)
- Backoff exponencial con jitter es la solución oficial para 503 — [Troubleshooting](https://ai.google.dev/gemini-api/docs/troubleshooting)

### Inferences
- Tabla de costos mensuales estimados (30 días, salida 30k, resolución baja → alta):

| Opción | Requisito | $/llamada | 10/día | 60/día | Efecto sobre 503 |
|---|---|---|---|---|---|
| Free tier | nada | $0 | $0 | $0 | Peor (cuotas bajas, sin garantía) |
| 3.1 Flash-Lite Standard | Tier 1 ($5 prepago) | $0.056–0.068 | ~$17–20 | ~$101–122 | Sin promesa documentada |
| 3.8 Flash Standard | Tier 1 | $0.146–0.181 | ~$44–54 | ~$263–327 | Sin promesa documentada |
| 3.8 Flash Flex | Tier 1 | $0.073–0.090 | ~$22–27 | ~$131–163 | Peor: sheddable, 503 explícito |
| 3.8 Flash Batch | Tier 1 | $0.073–0.090 | ~$22–27 | ~$131–163 | Sin 503 al usuario; hasta 24 h |
| 3.8 Flash Priority | Tier 2 ($100 + 3 días) | $0.263–0.326 | ~$79–98 | ~$473–587 | Mejor: degrada a Standard |
| 3.1 Flash-Lite Priority | Tier 2 | $0.101–0.122 | ~$30–37 | ~$182–220 | Mejor: degrada a Standard |
| Vertex Standard PayGo, endpoint global | proyecto GCP; $300 trial | ≈ igual a Standard | cubierto por $300 al principio | idem | Pool multirregión + fallback |
| Vertex Provisioned Throughput | ≥1 GSU | — | ~$2.7k–5k/mes | idem | Capacidad reservada |

- Mejor relación fiabilidad/dólar para bajo presupuesto: Vertex con endpoint global usando el crédito de $300 (coste efectivo $0 durante 1–3 meses), o en el Developer API, Tier 1 + reintentos + fallback de modelo; reservar Priority (idealmente con Flash-Lite, ~$30–37/mes a 10 llamadas/día) para cuando la fiabilidad importe más que el costo.
- Reducir salida (30k es el máximo; limitar `max_output_tokens`/thinking) y usar resolución baja de video recorta el costo más que cualquier cambio de tier.

### Gaps
- Sin datos públicos de tasa de 503 por tier/endpoint; la comparación de fiabilidad es cualitativa.
- Precios de Vertex por token no verificados en página oficial para 3.x (asumido ≈ igual al Developer API).
