# Ingeniería inversa de Google Cloud a partir de información pública

Fecha del análisis: 2026-10-16. Fuentes: directorio público de APIs de Google (discovery documents), el SDK de gcloud instalado en el contenedor (v570.0.0), y publicaciones técnicas públicas sobre la infraestructura interna. Todo lo que aparece aquí sale de esas fuentes; no hay acceso a sistemas internos.

---

## 1. Qué expone Google Cloud al mundo: el catálogo de APIs

El directorio público (`googleapis.com/discovery/v1/apis`) lista **536 entradas**, que corresponden a **315 nombres de servicio** únicos (las demás son versiones no preferidas o APIs antiguas).

### Superficie de API por servicio (discovery docs, versión preferida)

| Servicio | Métodos | Recursos | Esquemas | Versión |
|---|---:|---:|---:|---|
| Vertex AI (`aiplatform`) | 1128 | 275 | 1497 | v1 |
| Compute Engine (`compute`) | 1018 | 131 | 1065 | v1 |
| Apigee | 374 | 99 | 349 | v1 |
| Discovery Engine (Vertex AI Search) | 278 | 85 | 990 | v1 |
| Cloud Logging | 254 | 63 | 94 | v2 |
| Dataplex | 206 | 40 | 292 | v1 |
| Network Security | 185 | 37 | 136 | v1 |
| Security Command Center | 172 | 62 | 384 | v1 |
| Dialogflow CX | 158 | 31 | 695 | v3 |
| Healthcare API | 154 | 27 | 177 | v1 |
| Dataproc | 136 | 17 | 277 | v1 |
| Network Services | 122 | 29 | 134 | v1 |
| Network Connectivity | 108 | 24 | 109 | v1 |
| Cloud Spanner | 99 | 21 | 180 | v1 |
| Dataform | 88 | 11 | 139 | v1 |
| Cloud KMS | 87 | 15 | 96 | v1 |
| Cloud Storage | 87 | 14 | 38 | v1 |
| Cloud SQL | 85 | 14 | 159 | v1 |
| Bigtable Admin | 82 | 16 | 154 | v2 |
| Resource Manager | 78 | 18 | 79 | v3 |
| GKE (`container`) | 71 | 12 | 262 | v1 |
| Cloud Run | 59 | 13 | 145 | v2 |
| Dataflow | 57 | 24 | 202 | v1b3 |
| Cloud Monitoring | 56 | 20 | 131 | v3 |
| Cloud DNS | 51 | 12 | 78 | v1 |
| BigQuery | 47 | 8 | 227 | v2 |
| Pub/Sub | 46 | 7 | 76 | v1 |
| Secret Manager | 36 | 6 | 42 | v1 |
| Cloud Functions | 21 | 5 | 51 | v2 |
| Cloud Build | 22 | 5 | 79 | v2 |
| Artifact Registry | 69 | 21 | 128 | v1 |
| Firestore | 60 | 12 | 143 | v1 |
| Cloud IAM | 6 | 2 | 20 | v2 |

Observaciones:
- **Un único patrón de host**: casi todos los servicios viven en `https://{servicio}.googleapis.com/`. La excepción observada es Translate, que usa `translation.googleapis.com`.
- **Tamaño desigual**: Compute y Vertex AI pesan unas diez veces más que servicios como Cloud Functions. Compute tiene 1018 métodos y gcloud tiene 1008 comandos de compute, así que la correspondencia CLI↔API es casi uno a uno.
- **Discovery y realidad no coinciden del todo**: un servicio muy grande en discovery (Vertex AI, con más de 1100 métodos) aparece en parte como servicios separados en la documentación de producto. Los conteos miden la superficie pública de la API, no los productos comerciales.

---

## 2. Convenciones de diseño (lo que se repite en todas las APIs)

Muestreé 4702 métodos de compute, run, spanner, bigquery y aiplatform, además de los 85 discovery docs de servicios principales.

### 2.1 Jerarquía de recursos
Todas las rutas siguen un esquema de nombre jerárquico:
```
projects/{project}/locations/{location}/{recurso}/{id}
projects/{project}/regions/{region}/{recurso}/{id}     (compute)
projects/{project}/global/{recurso}/{id}              (compute, recursos globales)
```
La jerarquía de organización es **Organization → Folder → Project**. Resource Manager v3 lo expone con `organizations`, `folders`, `projects`, además de `tagKeys`, `tagValues`, `tagBindings`, `liens` y `effectiveTags`. Los tags y los liens son mecanismos de gobernanza que cuelgan de esa jerarquía.

### 2.2 Verbos personalizados (AIP-136 style)
Los métodos que no encajan en CRUD usan sufijo `:verbo` en la URL:
- Vertex AI: `:wait` (252 usos), `:cancel` (238), `:purge` (10), `:directWrite`, `:queryDeployedModels`, `:fetchPredictOperation`.
- Spanner: `:cancel`.

### 2.3 IAM uniforme
En todos los servicios aparecen `getIamPolicy`, `setIamPolicy` y `testIamPermissions` con la misma forma. Es un contrato común, no una decisión por servicio.

### 2.4 Operaciones de larga duración (LRO)
Muchas mutaciones devuelven un objeto `Operation` que se consulta después:

| Servicio | Métodos que devuelven Operation |
|---|---:|
| compute | 1034 |
| aiplatform | 846 |
| run | 42 |
| spanner | 40 |

La consecuencia práctica es que casi todo lo que crea o modifica recursos es asíncrono, y el cliente hace polling sobre `operations.get`.

### 2.5 Parámetros estándar
Se repiten en miles de métodos: `project` (1962), `name` (1824), `requestId` (982, idempotencia), `pageToken` (866), `filter` (798), `region` (726), `returnPartialSuccess` (644), `orderBy` (490), `pageSize` (444), `maxResults` (422).

---

## 3. El CLI como segundo mapa del producto

Está instalado en `/opt/google-cloud-sdk` (gcloud 570.0.0, bq 2.1.32, core 2026.05.22):

- **169 grupos de primer nivel** (`compute`, `run`, `bq`, `spanner`, `iam`, etc.).
- **~4169 archivos de comando** en `lib/surface`. Por grupo: compute ≈ 1008, run ≈ 116, spanner ≈ 80, bq ≈ 14.
- **142 módulos** en `lib/googlecloudsdk/api_lib`, que son la capa que habla con las APIs.

Esto confirma la arquitectura por capas: gcloud (comando) → `api_lib` (cliente) → API REST (`*.googleapis.com`) → operación/LRO. El CLI es prácticamente un generador de comandos a partir de la misma definición de la API.

---

## 4. Arquitectura interna: lo que está documentado públicamente

Esta sección depende de publicaciones de Google, no de la superficie de API. Lo que pude confirmar y lo que no:

| Componente | Función inferida | Fuente pública | Estado |
|---|---|---|---|
| **Borg** | Planificador de clusters y contenedores; antecesor de Kubernetes | Paper Borg (EuroSys 2015); SRE book | Confirmado |
| **Colossus** | Sistema de archivos distribuido, sucesor de GFS | SRE book (cap. 2) | Confirmado |
| **Bigtable** | Base NoSQL a escala de petabytes, sobre Colossus | SRE book; paper Bigtable | Confirmado |
| **Spanner** | SQL con consistencia fuerte global; guarda tablets sobre Colossus | Paper OSDI 2012; SRE book; blog de Google Cloud | Confirmado |
| **Dremel** | Motor de consulta columnar; base de BigQuery | Paper Dremel (2010); blog "BigQuery under the hood" | Confirmado |
| **Jupiter** | Red de centros de datos; usada en el shuffle de Dremel | Blog de Google Cloud (menciona el shuffle sobre Jupiter) | Confirmado a nivel de mención |
| **Andromeda** | Virtualización de red de Google Cloud | No encontré fuente primaria en la búsqueda | **No verificado** |

Cadena de datos típica que se deduce de estas piezas: una consulta de BigQuery se planifica en Borg, las hojas del árbol leen de Colossus, los nodos intermedios agregan y el shuffle usa la red Jupiter.

Las piezas de la capa de control (Service Control, Service Management, ESF) tampoco aparecen en fuentes públicas fuertes en esta sesión; sí se infieren de la existencia de `servicecontrol`, `servicemanagement` y `serviceusage` en el directorio.

---

## 5. Limitaciones

1. **No es Google Cloud completo.** Discovery documenta la API pública. Hay productos que no aparecen aquí (o aparecen como alpha/beta sin discovery público).
2. **La arquitectura interna es inferencia.** Solo está confirmada la parte publicada en papers y el SRE book. Andromeda y las capas de control no están verificadas.
3. **Los conteos cambian.** Son una foto del día de hoy (2026-10-16).
4. **No se intentó acceder a nada no público.** El análisis usa sólo discovery, SDK instalado y documentación pública.

---

## 6. Qué haría después (si quieres profundizar)

- Generar un grafo completo de dependencias entre servicios a partir de los `parameters` que referencian otros recursos (por ejemplo, un `network` de compute referenciado por GKE o Cloud SQL).
- Extraer el árbol completo de comandos de gcloud (`gcloud meta` o leer `lib/surface`) y compararlo con el discovery para encontrar comandos sin API pública.
- Revisar el repositorio público `google-cloud-python`/`googleapis` para ver los proto/IDL de algunos servicios (gRPC), que a veces tienen más detalle que el JSON REST.
