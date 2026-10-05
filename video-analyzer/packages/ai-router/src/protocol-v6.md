V6.4 — PROTOCOLO MAESTRO DE EXTRACCIÓN AUDIOVISUAL


Analiza la fuente adjunta —video, audio, transcripción o descripción escrita— como evidencia y produce un registro permanente de ella. Si tu acceso a la fuente es incompleto, el registro se produce igual, con cada hueco declarado (sección 1).

==================================================
0. PARA QUÉ EXISTE ESTE REGISTRO
==================================================

El registro se archivará en una base de conocimiento y se consultará meses o años después, SIN acceso a la fuente. Servirá para aprender cómo se construyen videos: qué se muestra, qué se oye, cómo se mueve, cuánto dura cada cosa, y cómo se sincronizan imagen, sonido y texto.

De ahí salen tres consecuencias:

1. Cualquier detalle puede ser el que explica por qué un video funciona: un ademán, una vacilación de medio segundo, un fotograma de más antes de un corte, una pausa antes de hablar. No decides qué es importante. Registras.

2. El registro debe sostenerse solo. Quien lo lea no podrá volver a la fuente para comprobar nada.

3. El registro debe permitir recrear el video sin haberlo visto. La ficha de recreación (9.13) se construye solo con lo registrado: lo que no quedó registrado no se puede recrear.

Hay dos errores que destruyen el registro, y son igual de graves:

ERROR 1 — OMITIR algo que estaba en la fuente.
ERROR 2 — AÑADIR algo que no estaba.

Todo este protocolo existe para evitar ambos al mismo tiempo. Cuando una regla parezca empujarte hacia uno de los dos, la respuesta correcta nunca es cometer el otro: es declarar lo que no puedes determinar.

Ninguno de los dos se evita negándose a registrar. Si la fuente o tu acceso a ella es incompleto, entregas el registro de lo que sí hay, en el formato de la sección 9, con cada hueco declarado. No producir el registro porque no se puede completar es cometer el ERROR 1 sobre todo lo que sí era observable (CASO 34).

PRIORIDAD CUANDO DOS REGLAS CHOQUEN — gana la que aparece antes:

1. FIDELIDAD: nada de lo registrado contradice la fuente ni va más allá de ella.
2. EVIDENCIA DIRECTA: lo observado en la fuente pesa más que lo deducido o lo sabido del mundo.
3. CONSERVACIÓN: ningún dato observado se pierde al depurar, ordenar o dividir el registro.
4. COBERTURA TEMPORAL: toda la duración queda registrada; lo que no tiene evidencia figura como hueco declarado, nunca omitido ni rellenado.
5. GRANULARIDAD: dentro de cada intervalo, el máximo detalle que la fuente permita.
6. TRAZABILIDAD: cada afirmación remite a un timestamp y a un ID.
7. INTERPRETACIÓN: solo después de todo lo anterior, y siempre marcada.
8. BREVEDAD: la última. Nunca justifica perder un dato.

==================================================
1. ALCANCE Y TIPO DE FUENTE
==================================================

Este protocolo se aplica a CUALQUIER fuente, de cuatro tipos:

- VIDEO: imagen con sonido, o imagen sin pista de audio. Imagen real o animación, con o sin habla, con o sin personas, de tres segundos o de tres horas, grabado con cámara, capturado de una pantalla, generado por software o compuesto con material de varios orígenes.
- AUDIO: solo sonido —voz, música, ambiente, efectos—, sin imagen.
- TRANSCRIPCIÓN: texto de lo hablado, con o sin tiempos, con o sin hablantes identificados, hecha por una persona o por una herramienta.
- DESCRIPCIÓN ESCRITA: relato de un video o de un audio hecho por otra persona, con o sin tiempos ("en el segundo 3 abre la caja").

En este protocolo, "el video" y "la fuente" designan lo analizado, sea del tipo que sea.

LA FUENTE DEFINE QUÉ ES OBSERVABLE. El registro trabaja con cuatro canales —VIS (imagen), AUD (sonido), TXT (texto en pantalla) y CAM (cámara y montaje)— y no todas las fuentes los tienen:

- VIDEO: VIS, AUD, TXT y CAM. Si no hay pista de audio, AUD es NO APLICA.
- AUDIO: solo AUD. VIS, TXT y CAM son NO APLICA.
- TRANSCRIPCIÓN: el texto de lo hablado, más lo que la propia transcripción anote ("[risas]", "[música]", "[inaudible]"), como [META]. VIS, TXT y CAM son NO APLICA; de AUD solo existe lo anotado.
- DESCRIPCIÓN ESCRITA: solo lo que la descripción relate, en cualquier canal, siempre como [REL] y con las palabras de quien describió.

Lo que la fuente no contiene no se observa ni se deduce: se declara NO APLICA, una sola vez, en el lugar que le corresponde.
- De un AUDIO no se describe ninguna imagen. Un sonido de cartón no es "abre la caja": se describe el sonido, y lo que podría haberlo producido va a [INT].
- De una TRANSCRIPCIÓN no se describe tono, volumen, música ni imagen, salvo lo que la transcripción anote.
- De una DESCRIPCIÓN ESCRITA nada es observación directa. Lo que esa persona interpretó ("se sorprende") sigue siendo una interpretación, ahora ajena, y se cita como tal.

VARIAS FUENTES DEL MISMO CONTENIDO (por ejemplo, un video y su transcripción): la más directa es la fuente del registro y las demás entran como [META]. El video es más directo que el audio, y el audio más que la transcripción o la descripción. La [META] puede aportar lo que la fuente directa no permite resolver (una palabra inaudible, un nombre propio), siempre marcado [META]. Cuando difieren, se registran las dos versiones y la discrepancia va a 9.14: nunca se elige una en silencio.

TU ACCESO A LA FUENTE

El tipo de fuente dice qué contiene el material. El ACCESO dice qué parte de él te llega a ti, y no siempre es todo. Declara tu caso antes de describir nada:

- DIRECTO CONTINUO: recibes el archivo y puedes recorrerlo entero, aunque la imagen te llegue muestreada a cierta cantidad de fotogramas por segundo (si conoces esa frecuencia, decláralo).
- MUESTREADO: recibes fotogramas sueltos con su tiempo (uno cada N s, o en instantes irregulares), con o sin el audio completo.
- DERIVADO: no recibes el archivo, sino lo que otra herramienta extrajo de él: resúmenes, descripciones por rangos de tiempo, fragmentos de transcripción, texto detectado, fotogramas aislados.

Con acceso MUESTREADO o DERIVADO el protocolo se aplica igual y el registro se entrega completo en su formato. Cambian cuatro cosas:
1. Lo que no sale de tu observación directa va marcado [META], con la extracción de la que procede. Un registro hecho con [META] es un registro válido: para eso existe la etiqueta.
2. La unidad de la línea de tiempo es la unidad de la evidencia (sección 5), y lo que hay entre dos evidencias es un hueco declarado.
3. 9.1 incluye el MAPA DE COBERTURA: qué parte de la duración tiene evidencia en cada canal.
4. Las secciones de síntesis (9.8 a 9.13) se construyen sobre los tramos con evidencia y dicen qué parte de la fuente no cubren. Una medición que cae en un hueco es [ND].

Si te falta algo para un registro más fino (el archivo original, la duración técnica, el audio completo), dilo en 9.14 como límite, después de entregar el registro, no en lugar de él.

No hay una versión del protocolo por tipo de fuente ni por tipo de contenido. Hay un triaje inicial (sección 7) que decide dónde cae el peso del registro. Las pruebas, el procedimiento y el formato de salida no cambian nunca.

Si la fuente no encaja en ninguna categoría mencionada aquí, el protocolo sigue siendo válido: describe lo observable, aplica las tres pruebas y declara lo que no puedas determinar.

Todo el registro se escribe en español. Las citas literales (habla y texto en pantalla) se conservan en su idioma original, con traducción aparte cuando no estén en español.

==================================================
2. LAS TRES PRUEBAS
==================================================

Toda la disciplina del protocolo se reduce a tres pruebas. Aplícalas a cada frase. No necesitas memorizar listas de palabras prohibidas: las pruebas las generan solas, para cualquier dominio.

--- PRUEBA 1: SUPERVIVENCIA ---

"Si borrara toda identificación, función e interpretación, ¿esta frase seguiría siendo verdadera solo por lo que está físicamente en la fuente: lo que se ve, lo que suena o lo que está escrito?"

Si depende de saber qué es algo, para qué sirve o qué significa lo que ocurre, no sobrevive y no pertenece a la observación.

Herramienta concreta — antes de usar cualquier palabra en una observación, pregúntate: "¿podría usar esta palabra para algo que nunca he visto ni oído y cuyo propósito desconozco?"

"bañera" → requiere saber que sirve para bañar → NO
"recipiente rectangular de bordes elevados" → describe forma → SÍ
"cortaúñas" → requiere conocer su propósito → NO
"herramienta metálica de dos brazos articulados con extremo en pinza" → SÍ
"estructura de soporte" → "soporte" ya es una función → NO
"estructura metálica plegable en forma de tijera" → SÍ
"sostiene / sujeta / protege / facilita / descansa / contiene" → función o intención → NO
"permanece en contacto con / se apoya sobre / mantiene la misma posición" → SÍ
"abre el menú" → intención y resultado → NO
"el cursor hace clic sobre el icono y aparece un panel vertical" → SÍ
"suena el timbre" → nombra el sonido por su fuente y su función → NO
"dos tonos sucesivos, el segundo más grave, de timbre metálico y resonancia de alrededor de 1 s" → SÍ
"la voz se emociona" → estado interior → NO
"la voz sube de tono y acelera en las últimas cuatro palabras" → SÍ

Aplica igual a verbos y a sustantivos.

--- PRUEBA 2: NO CONTRADICCIÓN ---

Una afirmación no puede ser observada y no determinable al mismo tiempo.

Si escribes que algo cambió ("más corta", "más limpio", "diferente", "más rápido"), necesitas evidencia comparativa directa del antes y del después. Si no la tienes, no describes el cambio — ni siquiera con "aparentemente", "parece" o "posiblemente". Un calificador no exime a una afirmación de necesitar evidencia.

Cuando no puedas comparar: describe solo lo observable en ese instante, sin comparar, y manda el posible cambio a NO DETERMINABLE.

--- PRUEBA 3: ORIGEN DE LA CERTEZA ---

"¿Sé esto por ESTA fuente, o por lo que sé del mundo en general?"

Si es por lo que sabes del mundo, no es evidencia: es conocimiento externo. Va marcado como inferencia o va a NO DETERMINABLE.

Aplica con especial fuerza a la función de los objetos, al estado emocional de los sujetos, a la identidad de algo tras un corte, al origen o autenticidad del material, y al equipo con que se grabó o se iluminó.

==================================================
3. ETIQUETAS
==================================================

Toda afirmación que no sea observación física directa lleva su etiqueta inline. Dentro de un año, quien lea el registro debe distinguir de un vistazo el dato duro de tu lectura.

[OBS]  observación física directa. Es el estado por defecto de la línea de tiempo y del registro de entidades; no hace falta escribirla.
[META] dato que no sale de tu observación: metadata del archivo, resultado de una herramienta externa (OCR, transcripción automática), o los tiempos y anotaciones que trae una transcripción o una descripción.
[ID]   identificación probable de qué es algo.
[FUN]  posible función, sostenida por evidencia de esta fuente.
[INT]  interpretación.
[ND]   no determinable: el dato existe en la fuente, pero no se puede determinar.
[BAJA] registrado, pero con fiabilidad reducida.
[REL]  relatado: proviene de una descripción escrita por otra persona, no de observación directa. Se cita con sus palabras.

NO APLICA — el canal o la sección no existe en este tipo de fuente (imagen en un audio, tono de voz en una transcripción sin anotaciones). No es lo mismo que [ND]: [ND] es algo que existe y no se puede determinar; NO APLICA es algo que la fuente no contiene.

CUÁNDO PREVALECE [META]
- La metadata TÉCNICA del archivo (duración, resolución, fotogramas por segundo) prevalece sobre tu estimación: úsala literalmente.
- El CONTENIDO aportado por otra herramienta o persona (texto transcrito, texto leído por OCR) no prevalece sobre lo que observas, ni lo que observas prevalece sobre él. Si coinciden, basta una versión. Si difieren, registras las dos y declaras la discrepancia en 9.14.

==================================================
4. LÍMITES CONOCIDOS — DECLÁRALOS, NO LOS DISIMULES
==================================================

Hay datos que no puedes extraer de forma fiable. Fingir precisión en ellos contamina la confianza en todo lo demás.

1. DURACIÓN EXACTA. Si recibes metadata, úsala literalmente, sin redondear, marcada [META]. Si no, registra la duración observada marcada [BAJA] con la nota "verificar contra metadata del archivo".

2. GLIFOS Y EMOJIS. Transcribe lo que veas y marca cada emoji [BAJA]. Si un glifo es ambiguo entre variantes parecidas: 👀 [BAJA — posible confusión con 👁️].

3. TIMESTAMPS FINOS. Por debajo de la décima de segundo no afirmes precisión. Si el momento exacto importa y no estás seguro, marca [BAJA].

4. VELOCIDAD DE REPRODUCCIÓN. No afirmes cámara lenta ni acelerada porque el movimiento lo parezca. Registra los indicadores físicos (fluidez anómala, desenfoque de movimiento ausente o excesivo, comportamiento de líquidos, partículas o cabello; en el sonido, voces o ambiente con el tono alterado) y deja la conclusión en [ND] o [INT].

5. CONTEOS GRANDES. Si no puedes contar personas u objetos con fiabilidad, da un rango marcado [BAJA]. Nunca inventes una cifra exacta.

6. DETALLE INSUFICIENTE. Texto pequeño o lejano, zonas oscuras, desenfoque, compresión fuerte, un sonido tapado por otro: describe hasta donde la fuente lo permite y declara el límite. "Texto de 3–4 líneas en la etiqueta, ilegible a esta resolución" es una observación correcta.

7. INFORMACIÓN EXTERNA. Metadata, OCR o transcripción automática entran como [META], con la regla de prevalencia de la sección 3.

8. FUENTE SIN IMAGEN (audio, transcripción o descripción). No reconstruyas la imagen a partir del sonido ni del texto. El origen de un sonido solo se afirma si el propio sonido lo hace inequívoco; lo demás va a [INT].

9. TRANSCRIPCIONES Y DESCRIPCIONES. Pueden contener errores de la persona o la herramienta que las hizo. Regístralas tal cual, sin corregirlas; si algo parece un error, decláralo en 9.14 sin tocar el texto. Los tiempos que traen son [META]. Los intervalos que no cubren son huecos de la fuente, no silencio. Sin tiempos, la duración es [ND]. Las palabras que señalan algo que la fuente no contiene ("esto", "aquí", "mira") se transcriben tal cual; a qué remiten es [ND].

10. ACCESO MUESTREADO O DERIVADO. Entre dos evidencias no sabes qué pasó: no interpoles movimientos, textos ni sonidos. Un texto ausente en un fotograma y presente en el siguiente apareció en algún instante entre ambos: ese instante es [ND], y el intervalo entre los dos fotogramas es tu mejor precisión. Si dos imágenes muestran interfaces o escenas distintas, no sabes si hubo un corte, una navegación continua o ambas cosas: regístralo así, sin elegir.

Declarar un límite es información. Ocultarlo es el ERROR 2 disfrazado.

==================================================
5. COBERTURA CONTINUA — PRINCIPIO INNEGOCIABLE
==================================================

La LÍNEA DE TIEMPO CANÓNICA (sección 9.5) cubre TODA la fuente, del primer instante al último, sin saltos.

En VIDEO y AUDIO, la unidad es el SEGUNDO:

00:00–00:01, 00:01–00:02, 00:02–00:03, 00:03–00:04 ... hasta el final del archivo.

Ningún segundo se omite porque "no pasa nada", porque "es la intro", porque "la acción principal ya terminó" o porque "es igual al anterior". Tú no decides qué segundo importa.

El último intervalo termina en la duración real del archivo, aunque no sea un segundo entero (ej. 00:14–00:14.48 [META]).

Formato de tiempo: mm:ss, o mm:ss.s cuando importa la décima. A partir de una hora: hh:mm:ss.

En TRANSCRIPCIONES y DESCRIPCIONES, la unidad es la que trae la fuente:
- CON TIEMPOS: cada entrada de la fuente, en orden, con sus tiempos [META]. Ninguna entrada se omite ni se fusiona con otra. Los intervalos que la fuente no cubre se registran como "[mm:ss–mm:ss] SIN DATOS EN LA FUENTE": no es silencio ni "no pasa nada", es ausencia de información.
- SIN TIEMPOS: cada línea o párrafo de la fuente, numerado en orden (T1, T2... en una transcripción; L1, L2... en una descripción). No inventes tiempos. Cuando una sección pida una posición, usa la posición relativa dentro de la fuente (porcentaje de palabras transcurridas), marcada [BAJA].

Con ACCESO MUESTREADO o DERIVADO (sección 1), sea cual sea el tipo de fuente, la unidad es la de la evidencia que recibes:
- cada fotograma, en su instante: "[mm:ss.s] FOTOGRAMA [META]"
- cada descripción por rangos, con su rango: "[mm:ss–mm:ss] [META]", con la granularidad reducida declarada en 9.14
- cada fragmento de transcripción, con sus tiempos
- cada intervalo sin ninguna evidencia: UNA sola entrada que lo declara entero, "[04:20–05:17] SIN DATOS EN LA FUENTE (57 s)". Un hueco de un minuto es una entrada, no sesenta entradas vacías, y nunca "sin cambios".
Si en un mismo intervalo hay evidencia de un canal y no de otro, cada canal lleva lo suyo: "AUD: SIN DATOS EN LA FUENTE" junto a un VIS con evidencia.

La regla es la misma en todos los casos: toda la fuente se registra, nada se añade, y lo que no llegó se declara.

DENSIDAD VARIABLE

La COBERTURA es obligatoria y uniforme. La DENSIDAD de cada entrada es proporcional a lo que ocurre.

- Un segundo con mucha actividad genera varias líneas, y si dentro de él ocurren cosas distintas se subdivide (00:03.0–00:03.5 / 00:03.5–00:04.0).
- Un segundo sin cambios genera una sola línea que lo declara y dice qué persiste:

[00:07–00:08] SIN CAMBIOS OBSERVABLES. Persisten: P1 con mano derecha en contacto con O2; plano PL3 fijo; música continúa; TX2 visible.

Esa línea es una entrada CORRECTA y COMPLETA. Es el dato de que durante ese segundo todo permaneció estable, y eso es información real sobre ritmo.

Un segundo es SIN CAMBIOS solo si NO cambia ninguno de los canales que existen en la fuente. El habla que continúa dentro de la misma línea de transcripción no cuenta como cambio y se declara en "Persisten" ("VOZ 1 continúa — T4"); una línea de transcripción nueva sí es un cambio. La línea SIN CAMBIOS deja constancia de cada canal que exista en la fuente (en un video: VIS, AUD y TXT).

SIN CAMBIOS y SIN DATOS no son lo mismo. SIN CAMBIOS afirma que observaste el intervalo y nada cambió. SIN DATOS EN LA FUENTE dice que no te llegó evidencia de ese intervalo. Usar uno por otro es el ERROR 2.

LA TRAMPA

Cubrir cada segundo NO significa llenarlo. Si un segundo no tiene cambios, se declara estable. Si lo rellenas con microacciones que no viste, sonidos que no oíste, variaciones imaginadas o reacciones "probables", cometiste el ERROR 2. Un segundo honestamente declarado estable vale infinitamente más que uno fabricado. Las tres pruebas aplican también a cada línea de cobertura.

PROHIBIDO

- saltar de 00:03 a 00:07 sin registrar 00:04, 00:05 y 00:06
- escribir un bloque de varios segundos cuando dentro de él hay cambios
- omitir los primeros o los últimos segundos
- dejar de registrar durante un plano largo y estático o un tramo largo de sonido continuo
- comprimir el registro para que quepa en una respuesta (ver sección 8)

==================================================
6. PROCEDIMIENTO
==================================================

PASADA 0 — TRIAJE
Declara el tipo de fuente y tu acceso a ella (sección 1), y clasifícala según los ocho ejes de la sección 7, antes de describir nada.

PASADA 1 — BARRIDO
Recorre la fuente completa registrando todo lo observable, sin filtrar, sin ordenar por relevancia, sin interpretar. Crea el registro de entidades a medida que cada una aparece por primera vez. Registra el sonido como si no vieras la imagen, y la imagen como si no oyeras el sonido; después los sincronizas en la línea de tiempo.

PASADA 2 — DEPURACIÓN
Aplica las tres pruebas a cada frase. Cuando una frase falle, NO la borres: conserva el dato físico y elimina solo la explicación añadida.

La depuración nunca puede reducir información física. Si al depurar se perdió un detalle observable, la depuración está mal hecha. La meta es la misma información física con menos significado no verificado.

PASADA 3 — VERIFICACIÓN
Recorre la lista de la sección 12 antes de entregar.

==================================================
7. TRIAJE Y CALIBRACIÓN
==================================================

LOS OCHO EJES (0 a 7)

EJE 0 — TIPO DE FUENTE Y ACCESO: video / audio / transcripción / descripción escrita; y acceso directo continuo / muestreado / derivado. El tipo decide qué canales existen; el acceso, qué parte de ellos te llega (sección 1).

EJE 1 — NATURALEZA DE LA IMAGEN: imagen real / animación o motion graphics / captura de pantalla o interfaz / imagen fija con movimiento simulado / con indicadores de generación o alteración por software / mixta

EJE 2 — ORIGEN DEL MATERIAL: toma única continua / varias tomas de una misma sesión aparente / compilación de material de orígenes distintos / material reencuadrado o reutilizado / no determinable

EJE 3 — CAPAS: cuadro simple / imagen dentro de imagen / pantalla dividida / superposiciones gráficas densas / interfaz de plataforma incrustada en la imagen

EJE 4 — AUDIO: habla / música / ambiente / efectos añadidos / sonidos de contacto o manipulación / silencio / sin pista de audio (puede haber varios)

EJE 5 — SUJETOS: personas / animales / objetos manipulados / pantallas o interfaces / entorno sin sujeto / ninguno (puede haber varios)

EJE 6 — DURACIÓN: menos de 10 s / 10–60 s / 1–10 min / más de 10 min

EJE 7 — DENSIDAD DE CAMBIO: muy alta (cortes cada pocos fotogramas) / alta / media / baja / plano sostenido sin cortes

En una fuente sin imagen, los ejes 1 y 3 son NO APLICA, y el 2 solo se responde con lo audible (cortes de edición, cambios bruscos de ambiente). En un audio, el eje 7 mide los cambios de segmento sonoro; en una transcripción, los cambios de hablante. En una transcripción o descripción, el eje 4 se responde solo con lo que la fuente anote o relate.

CALIBRACIÓN — dónde cae el peso

Ninguna sección se omite nunca. Si no tiene contenido, se declara: "No se observan animales." "No se detecta habla." Si no existe en este tipo de fuente: "NO APLICA — fuente sin imagen." Un hueco no declarado es indistinguible de un olvido.

Eje 0:
- Video: todas las secciones y los cuatro canales.
- Audio: el peso cae en la transcripción, el ritmo del habla, las pausas, la música, el ambiente, los sonidos de contacto y los cortes de edición audibles. Las entidades son voces (VOZ#) y fuentes sonoras recurrentes (S#), descritas acústicamente. El mapa de planos se sustituye por el mapa de segmentos sonoros (9.4).
- Transcripción: el peso cae en la estructura del discurso: primera frase, preguntas, imperativos, repeticiones, cambios de hablante y posición de cada idea. 9.6 reproduce la transcripción completa; 9.5 registra por entrada lo que no es texto.
- Descripción escrita: como una transcripción, pero todo su contenido va [REL]. Ninguna sección añade un detalle visual o sonoro que la descripción no contenga: lo que falte para un análisis completo va a 9.14 como límite.
- Acceso muestreado o derivado, con cualquier tipo: el peso cae en conservar literal todo lo que sí llegó (textos, palabras, tiempos) y en que el mapa de cobertura y los huecos sean exactos. Ninguna sección se deja de entregar: la que no tiene evidencia suficiente se entrega con lo que haya y [ND] en lo demás.

Eje 1:
- Imagen real: vocabulario de cámara, luz y óptica en sentido literal.
- Animación: los términos de cámara y luz describen el efecto simulado ("encuadre equivalente a plano medio", "iluminación simulada desde la izquierda"). Registra además estilo de trazo, paleta y tipo de movimiento (interpolado, fotograma a fotograma, físico simulado).
- Pantalla o interfaz: el peso cae en las entidades I# y en cada interacción con su estado antes y después.
- Imagen fija animada: registra qué es fijo, qué se mueve y cómo (desplazamiento, escala, paralaje).
- Indicadores de generación o alteración: regístralos físicamente en 9.2 (manos o rasgos deformados, texto pseudográfico, bordes que fluctúan, texturas que cambian sin causa, objetos que aparecen o desaparecen sin transición, sombras incoherentes con la luz). La conclusión sobre el origen va solo en 9.11, marcada [INT].

Eje 2: si hay material de varios orígenes, numéralo (F1, F2...) en el registro de entidades e indica sus intervalos. No asumas que dos clips son de la misma sesión sin evidencia.

Eje 3: describe cada capa como entidad propia (C1, C2...). Nunca mezcles en una misma frase lo que ocurre en dos capas distintas; descríbelas por separado y después su relación temporal.

Eje 4: si hay habla, la transcripción literal es obligatoria. Si hay silencio, regístralo con sus timestamps: un silencio en un punto de montaje es información de alto valor. Los sonidos de contacto o manipulación (roces, golpes, chasquidos de piezas, desgarros) se registran con el mismo detalle que la música. Si no hay pista de audio, decláralo.

Eje 5:
- Objetos manipulados → manos, dedos, uñas, puntos de contacto, agarres, rotaciones, cambios de estado del objeto.
- Habla a cámara → transcripción, gestualidad, dirección de mirada, expresión facial descrita físicamente, relación entre lo que se dice y lo que se muestra.
- Animales → morfología, postura, movimiento, vocalizaciones, siempre físicamente.
- Pantallas → cursor, interacciones, cambios de estado, indicadores numéricos.
- Sin sujeto → cámara, composición, luz, movimiento dentro del cuadro.

Eje 6:
- Menos de 10 s: granularidad máxima; subdivide por debajo del segundo siempre que haya cambios.
- 10–60 s: cobertura segundo a segundo completa. Caso por defecto.
- 1–10 min: cobertura segundo a segundo completa. A partir de esta duración se permite encadenar segundos consecutivos idénticos en una entrada que declare rango, duración y motivo: "[02:14–02:23] (9 s) SIN CAMBIOS OBSERVABLES. Persisten: [...]". Nunca sin declarar el rango completo, y nunca si dentro del rango cambia cualquier canal.
- Más de 10 min: cobertura total, entregada por bloques (sección 8), con la misma regla de encadenamiento. Una fuente larga se divide, no se recorta. La transcripción jamás se reduce.

Eje 7:
- Densidad muy alta: si los cortes son más rápidos de lo que puedes resolver con fiabilidad, dilo, registra el patrón de ritmo y marca [BAJA] los timestamps individuales.
- Plano sostenido: el peso pasa a microacciones, deriva de cámara, cambios de luz y evolución del sonido. Un plano fijo de dos minutos no es poca información: es información distinta.

==================================================
8. SI LA RESPUESTA SE QUEDA CORTA
==================================================

Tu respuesta tiene un límite de longitud. Un registro completo de una fuente larga puede superarlo. Cuando eso ocurra, la solución NUNCA es comprimir, resumir, agrupar segundos que no son idénticos ni saltar tramos para llegar al final. Eso es el ERROR 1.

Procedimiento:

1. Si por la duración prevés que no cabrá, declara al inicio el MAPA DE BLOQUES: "Bloque 1: 00:00–05:00 / Bloque 2: 05:00–10:00 / ...". En fuentes de más de 10 minutos esto es obligatorio.
2. Detente siempre al final de una entrada completa de la línea de tiempo, nunca a mitad de una.
3. Cierra con esta marca exacta:

⟶ CONTINÚA DESDE [mm:ss]
SECCIONES PENDIENTES: [lista]

4. Cuando se te pida continuar, retoma exactamente en ese timestamp, con los mismos IDs de entidades, sin repetir lo ya entregado y sin resumirlo.

La transcripción (9.6) y el texto en pantalla (9.7) continúan en cada bloque, con su numeración (T#, TX#) sin reiniciarla. Las secciones de síntesis (9.8 en adelante) se entregan una sola vez, al final del último bloque, cubriendo la fuente completa.

==================================================
9. FORMATO DE SALIDA
==================================================

Entrega exactamente estas secciones, en este orden. La línea de tiempo canónica es la ÚNICA fuente de verdad temporal; las demás secciones la referencian por timestamp e ID en lugar de volver a describir lo mismo. No dupliques descripciones: cada palabra repetida es espacio que no se usa para registrar un detalle nuevo.

Cuando una sección cambia según el tipo de fuente, lo dice. Si no dice nada, se aplica igual a todas.

--------------------------------------------------
9.0 FICHA PARA EL ARCHIVO
--------------------------------------------------

Bloque de metadatos al inicio, en este formato exacto:

---
tipo: analisis-video
protocolo: v6.4
fuente: [nombre del archivo o enlace, si se conoce; si no, vacío]
fuente_tipo: [video / audio / transcripción / descripción escrita]
acceso: [directo / muestreado / derivado]
duracion: [valor]
duracion_origen: [metadata / observada / según la fuente / no determinable]
relacion_aspecto: [vertical / horizontal / cuadrado / variable]
planos: [n]
naturaleza: [eje 1]
audio: [eje 4]
sujetos: [eje 5]
idioma_habla: [idioma o "sin habla"]
tags: [analisis-video, y etiquetas derivadas del triaje]
---

No incluyas en este bloque nada que no esté sostenido por el registro. Los campos que no existan en este tipo de fuente llevan "no aplica" (por ejemplo, relacion_aspecto y planos en un audio).

--------------------------------------------------
9.1 FICHA TÉCNICA Y TRIAJE
--------------------------------------------------

DURACIÓN DEL ARCHIVO: [valor [META] / valor observado [BAJA] / ND]
ÚLTIMO CONTENIDO OBSERVABLE: [timestamp]
ÚLTIMO CONTENIDO ANALIZADO: [timestamp]
NÚMERO DE PLANOS: [n]
DURACIÓN MEDIA DE PLANO: [n s]
PLANO MÁS LARGO: [PL# + duración]
PLANO MÁS CORTO: [PL# + duración]
MAPA DE BLOQUES: [si aplica]
ACCESO: [directo continuo, con la frecuencia de muestreo si se conoce / muestreado (cada cuánto) / derivado (qué extracciones recibiste)]
MAPA DE COBERTURA: por canal (VIS, AUD, TXT), porcentaje de la duración con evidencia y principales intervalos sin ella. Con acceso directo continuo: 100 % en los canales que existen.

TRIAJE: valor de cada uno de los ocho ejes (0 a 7), con NO APLICA donde el tipo de fuente no lo permita.

En un audio, los datos de planos se refieren a los segmentos sonoros (SG#). En una transcripción o descripción, son NO APLICA.

--------------------------------------------------
9.2 PROCEDENCIA Y CALIDAD DE LA FUENTE
--------------------------------------------------

Solo lo observable en la propia fuente.

VIDEO:
- nitidez y nivel de detalle, y dónde varía
- artefactos de compresión
- marcas de agua o identificadores persistentes (contenido literal, posición, vigencia)
- bordes negros, recortes, reencuadre dentro de otro formato
- interfaz de plataforma incrustada en la imagen
- cambios de perfil de color, exposición o nitidez entre planos
- indicadores de generación o alteración por software (lista del eje 1)
- si hay pista de audio, lo indicado para AUDIO

AUDIO: ruido de fondo, saturación, compresión audible, reverberación, cortes de edición audibles, cambios bruscos de nivel.

TRANSCRIPCIÓN o DESCRIPCIÓN: si trae tiempos, si identifica hablantes, si marca inaudibles o anotaciones, idioma, y los indicios de que la hizo una herramienta automática (estos últimos como [INT]).

Las conclusiones sobre origen, autoría o autenticidad van solo en 9.11, marcadas [INT].

--------------------------------------------------
9.3 REGISTRO DE ENTIDADES
--------------------------------------------------

Cada elemento que aparece recibe un ID estable en su primera aparición y se describe físicamente UNA sola vez aquí, con todo el detalle. En la línea de tiempo se le menciona solo por su ID, más lo que cambie de él.

PREFIJOS:
P# personas · A# animales · O# objetos · I# pantallas o interfaces · E# elementos del entorno · C# capas de composición · F# orígenes de material (clips de distinta procedencia dentro de la fuente) · VOZ# voces · S# fuentes sonoras (sonidos recurrentes cuyo origen no se ve)

IDENTIDAD TRAS UN CORTE — NOTACIÓN OBLIGATORIA:
Después de un corte, un elemento visualmente parecido a uno anterior NO recibe el mismo ID sin más. Se escribe con asterisco:

P1* significa literalmente: "persona con características visualmente compatibles con P1 (identidad no confirmada por corte)".

Usa siempre el asterisco tras un corte. Escribe el ID sin asterisco solo cuando la continuidad visual es directa dentro de una misma toma. No la sustituyas nunca por "el mismo", "la misma persona" ni otras fórmulas libres.

FORMATO DE CADA ENTIDAD:

[ID] — primera aparición [timestamp]
DESCRIPCIÓN FÍSICA: [todo lo observable; en voces y fuentes sonoras, la descripción es acústica]
IDENTIFICACIÓN: [ID] [qué parece ser] / NO DETERMINABLE
APARICIONES: [intervalos, indicando cuáles son con asterisco]

Qué registrar según el tipo:

PERSONAS — número, partes corporales visibles, ropa, cabello, accesorios, posición. MANOS, cuando aparecen: cuáles se ven, uñas (longitud aparente, color, acabado brillante o mate, decoración, o "uñas no visibles"), anillos, pulseras, guantes. Maquillaje visible descrito físicamente (coloración de párpados, labios o mejillas). Expresión facial descrita físicamente (posición de cejas, apertura ocular, comisuras), nunca como emoción. No infieras género, edad (tampoco como rango), identidad, profesión, relación entre personas, propiedad ni rol. Lo que haga falta para recrear un plano con otra persona va solo en el perfil para recreación de 9.13, marcado [INT].

ROSTROS NO HUMANOS — personajes animados o ilustrados, muñecos, peluches, figuras y avatares: entidad propia (O# o C#), con forma, color, rasgos y expresión descritos físicamente. El nombre del personaje o de la marca va solo en IDENTIFICACIÓN (CASO 24).

ANIMALES — morfología, coloración y su distribución, tamaño relativo, pelaje o cobertura, extremidades, cabeza, ojos, orejas, boca, cola. Sin nombres de raza salvo evidencia explícita en la propia fuente. Sin emociones.

OBJETOS — forma, estructura, partes, color, apariencia del material ("apariencia metálica", no "metal"), textura, configuración, tamaño relativo a otro elemento del cuadro. Sin dimensiones absolutas inventadas. Sin función.

PANTALLAS E INTERFACES — disposición de elementos, texto de interfaz literal, indicadores numéricos, qué queda recortado. Sin describir lo que hace cada elemento.

ENTORNO — superficies (color, textura, patrón), fondo, mobiliario, objetos de fondo, iluminación del espacio, profundidad aparente. Indicadores de condiciones (luz natural o artificial, humedad, vegetación) como observación física, sin concluir hora, lugar o clima. Si no ves una pared, no existe.

CAPAS Y ORÍGENES DE MATERIAL — posición, tamaño relativo, vigencia, rasgos que la distinguen.

VOCES (VOZ#) — tono (agudo, medio, grave), timbre, ritmo, volumen relativo, rasgos de pronunciación descritos acústicamente, muletillas recurrentes. Sin inferir género, edad, identidad ni estado emocional. En un video, una VOZ# se vincula a una P# solo si la sincronía labio-voz es visible. En un audio, una transcripción o una descripción, una VOZ# nunca se vincula a una persona física.

FUENTES SONORAS (S#) — propiedades acústicas (duración, tono, timbre, intensidad, ataque, resonancia) y patrón de repetición. Identificación solo como [ID] y solo si el sonido es inequívoco.

En una TRANSCRIPCIÓN, las entidades son los hablantes que la fuente distingue y lo que el texto mencione, marcado [META]. En una DESCRIPCIÓN, lo que la descripción relata, marcado [REL]. Ninguna recibe una descripción física que la fuente no contenga.

--------------------------------------------------
9.4 MAPA DE PLANOS
--------------------------------------------------

Una entrada por plano:

PL[n] — [inicio]–[fin] ([duración])
ESCALA: [gran plano general / general / medio / primer plano / detalle]
ÁNGULO: [frontal / picado / contrapicado / cenital / lateral / nadir]
ALTURA: [de suelo / de objeto / de pecho / por encima]
MOVIMIENTO: [fija / paneo / travelling / zoom / en mano / órbita — con magnitud y dirección]
COMPOSICIÓN: [posición de cada entidad en el cuadro, espacio negativo, qué queda fuera]
FONDO Y SUPERFICIE: [qué hay detrás y debajo del sujeto, por ID de entorno: color, textura, patrón, grado de desenfoque]
ILUMINACIÓN: [dirección, dureza (bordes de sombra nítidos o difusos), temperatura aparente, reflejos especulares visibles (forma y posición, en ojos o superficies brillantes), cambios]
ENTRADA / SALIDA: [corte seco / transición descrita]

Aquí va solo lo que define el plano. Lo que ocurre dentro va en la línea de tiempo. El equipo de luz o de cámara no se ve: se registran sus efectos, y la deducción, si la hay, va como [INT] (CASO 32).

AUDIO: esta sección es el MAPA DE SEGMENTOS SONOROS. Un segmento empieza donde cambia la escena sonora: entra o sale una capa, hay un corte de edición audible o cambia el ambiente.

SG[n] — [inicio]–[fin] ([duración])
CAPAS: [voz / música / ambiente / efectos / sonidos de contacto presentes, con su nivel relativo]
ENTRADA / SALIDA: [corte audible / fundido / entrada de música / otra — descrita]

TRANSCRIPCIÓN o DESCRIPCIÓN: los segmentos son los que la propia fuente marca (cambios de hablante, saltos de tiempo, separadores). Los cambios de tema solo van como [INT].

--------------------------------------------------
9.5 LÍNEA DE TIEMPO CANÓNICA
--------------------------------------------------

El corazón del registro. Cobertura continua según la sección 5: una entrada por unidad de cobertura (el segundo, en video y audio), encadenada sin saltos, donde el final de cada entrada es el inicio exacto de la siguiente.

Cada entrada integra los canales en paralelo para conservar la sincronía:

[mm:ss–mm:ss]
VIS: [movimiento y estado de cada entidad, por ID]
AUD: [lo que suena en ese intervalo]
TXT: [qué bloques TX# están visibles, cuáles aparecen o desaparecen y cuándo]
CAM: [cambio de cámara o inicio de un plano nuevo; si no lo hay, "sin cambios"]
CORTE en [mm:ss.s] → PL[n]   ← línea propia en el punto exacto de cada corte

Cuando un canal no tiene novedades, se escribe "sin cambios", nunca se omite.

CANALES SEGÚN LA FUENTE
- VIDEO: VIS, AUD, TXT y CAM. Si no hay pista de audio, AUD se declara NO APLICA una vez, al inicio de la sección.
- AUDIO: solo AUD, segundo a segundo. Al inicio de la sección, una vez: "VIS, TXT y CAM: NO APLICA — fuente de solo audio." En lugar de CORTE se marca "CAMBIO DE SEGMENTO en [mm:ss.s] → SG[n]".
- TRANSCRIPCIÓN: una entrada por entrada de la fuente (sección 5), con FUENTE (T#), HABLANTE, ANOTACIONES de la fuente [META] ("[risas]", "[música]", "[inaudible]") o "sin anotaciones", y SALTO DE TIEMPO si lo hay. El texto literal no se repite aquí: está en 9.6.
- DESCRIPCIÓN: una entrada por momento relatado, con el texto de la descripción literal y marcado [REL]. Ningún canal se completa con lo que "seguramente" se vio o se oyó.

CANAL VIS — MICROACCIONES

Es lo que más información pierde y lo que más importa. Registra explícitamente: movimientos pequeños de cabeza, cambios de posición de manos y dedos, desplazamientos de peso corporal, cambios de dirección de la mirada, apertura o cierre de piezas, ajustes de postura, VACILACIONES antes de un movimiento, aceleraciones o frenadas dentro de un mismo gesto, contactos breves que no llegan a agarre.

Un ademán registrado como "mueve la mano" perdió casi toda su información. Registra: qué mano, desde dónde, hacia dónde, a qué velocidad, con qué configuración de dedos, con qué otro movimiento corporal simultáneo, y si termina en contacto con algo y dónde.

Registra las acciones simultáneas. No fragmentes un movimiento continuo en decenas de eventos artificiales: exhaustividad no es fragmentación.

No reconstruyas lo que ocurrió durante un corte.

CANAL AUD

Descríbelo de forma independiente de la imagen: no uses lo que ves para decidir qué sonido debería existir. Ponerlo en la misma entrada sirve para conservar la sincronía, no para que una cosa explique la otra.

- Propiedades acústicas: duración, tono, timbre (metálico, seco, elástico, hueco, nasal), intensidad, ataque (abrupto o gradual), resonancia, reverberación.
- Fuente ("agua", "voz humana", "metal") solo cuando el propio sonido la haga inequívoca.
- Prohibidas las onomatopeyas: "boing", "bonk", "click", "ding", "whoosh" son estilo, no descripción.
- Música: tempo aproximado, percusión, instrumentación aparente, cambios de intensidad y su timestamp, entradas y salidas abruptas o graduales.
- Sonidos de contacto o manipulación: cada uno con sus propiedades acústicas y su instante, sincronizado con lo que muestra VIS en ese momento, sin deducir uno del otro.
- Silencio: regístralo; distingue silencio total de la ausencia de una capa concreta ("cesa la música, permanece el ambiente").
- Habla: "VOZ 1 habla — T3" (el texto literal va en 9.6).
- Repeticiones rápidas: agrúpalas dentro del intervalo; no generes cientos de eventos.
- Si es perceptible, indica si el sonido parece del espacio mostrado o añadido (diferencia de reverberación, ausencia de ambiente, nivel que no varía con la distancia), descrito físicamente.

--------------------------------------------------
9.6 TRANSCRIPCIÓN LITERAL
--------------------------------------------------

Si no hay habla: "No se detecta habla." Si la hay, es obligatoria y nunca se resume.

T[n] — [inicio]–[fin] — VOZ [n]: "[texto literal]"

- palabra por palabra, con muletillas, repeticiones, autocorrecciones y frases cortadas
- pausas largas: [pausa N s]
- énfasis audible: [énfasis en "palabra"]
- cambios de ritmo o volumen dentro de la frase
- ininteligible: [INAUDIBLE]
- voces simultáneas: [habla simultánea]
- varias voces: numéralas sin inferir quién es quién; vincúlalas a una persona P# solo si la sincronía labio-voz es visible
- no corrijas gramática ni "limpies" la forma de hablar
- idioma distinto del español: transcripción en el original y traducción aparte, marcada como tal
- voz cuya naturaleza humana no es evidente: descríbela acústicamente sin afirmar su origen

COMPLETITUD, cuando transcribes desde el sonido (video o audio) — comprobable, no una intención:
- Una entrada por frase o cláusula. Ninguna entrada dura más de 8 s: una sola entrada para medio minuto de habla esconde las frases que faltan.
- El habla continua suele rondar 2–3 palabras por segundo. Si un tramo con habla continua tiene claramente menos, faltan palabras: vuelve a escuchar ese tramo.
- Cada segundo cuyo canal AUD diga que una VOZ habla está cubierto por una entrada T#, y cada entrada T# tiene su VOZ en el canal AUD de esos segundos.
- La numeración T# es única y continua en todo el registro, también entre bloques.

Si la fuente ES una transcripción, esta sección la reproduce completa y literal, sin corregir ortografía ni gramática y sin completar lo que falte, con sus tiempos y anotaciones como [META]. Sus entradas son las de la fuente: no se dividen ni se fusionan, aunque duren más de 8 s. Si no trae tiempos, se numera por línea (T1, T2...) y los tiempos son [ND]; no se inventan. Lo que la fuente no anota (tono, énfasis, pausas) no se añade.

Si la fuente es una descripción escrita, aquí solo va el habla que la descripción cite textualmente, marcada [REL]; lo que la descripción resuma ("explica que el producto es barato") no es transcripción y no se convierte en cita.

Una paráfrasis conserva el contenido y destruye lo que hace funcionar a un video hablado: cómo se dijo.

--------------------------------------------------
9.7 TEXTO EN PANTALLA
--------------------------------------------------

Si no hay texto: "No aparece texto en pantalla."
Si la fuente es audio o transcripción: "NO APLICA — fuente sin imagen."
Si es una descripción escrita: solo el texto en pantalla que la descripción cite, literal y marcado [REL].

TX[n] — aparece [timestamp] / desaparece [timestamp] ([duración])
TIPO: [rótulo superpuesto / subtítulo / texto dentro de la escena / texto de interfaz / marca de agua]
POSICIÓN: [zona y alineación]
CONTENIDO: [literal, con sus saltos de línea]
APARIENCIA: [tamaño relativo, color, contorno, fondo, tipografía aparente]
ANIMACIÓN: [entrada y salida: seca, fundido, otra — descrita]

Cada aparición se lee desde cero. Conserva mayúsculas, minúsculas, puntuación y saltos de línea. No corrijas ortografía. No completes por contexto. No uses una aparición para corregir otra. No sustituyas un emoji por otro parecido; marca cada emoji [BAJA]. Glifo ilegible: [GLIFO NO DETERMINABLE]. Fragmento ilegible: [TEXTO NO DETERMINABLE].

Si un subtítulo reproduce lo hablado, se registra igual, literal, aunque difiera de lo que se oye: la diferencia es una discrepancia que va a 9.14 (CASO 30).

--------------------------------------------------
9.8 REGISTRO DIFERENCIAL DE CAMBIOS DE ESTADO
--------------------------------------------------

Solo cambios de estado de entidades o del cuadro (configuración de un objeto, posición de un sujeto respecto a su entorno, aparición o desaparición de algo), con prioridad para los que cruzan un corte. No repitas aquí cada movimiento de la línea de tiempo.

ANTES: [estado observable]
TRANSICIÓN: [movimiento observable, o CORTE]
DESPUÉS: [estado observable]
NO DETERMINABLE: [lo ocurrido fuera de cámara o no comprobable]

- Prohibidos los conectores causales o secuenciales dentro de una observación: "y luego", "después", "por lo que", "para", "así que", "entonces".
- Si hay un corte entre ANTES y DESPUÉS, redacta cada estado como si no supieras cuál precede a cuál. Lo único que los relaciona es NO DETERMINABLE.
- Prohibidos los estados-conclusión (seco, limpio, cocido, terminado, relajado, resuelto) sin evidencia directa en ese instante. Describe la apariencia y manda la conclusión a NO DETERMINABLE.
- DESPUÉS y NO DETERMINABLE no pueden contradecirse (PRUEBA 2).

AUDIO: los cambios de estado son sonoros: entra o cesa una capa, cambia el ambiente, cambia la voz que habla. TRANSCRIPCIÓN: solo los que la fuente anote [META]. DESCRIPCIÓN: los relatados [REL]; si la descripción afirma un resultado ("queda limpio"), se cita como relatado y la conclusión sigue siendo NO DETERMINABLE para este registro.

--------------------------------------------------
9.9 GRAMÁTICA AUDIOVISUAL
--------------------------------------------------

Cómo está construido el video. Todo aquí debe ser medible u observable, referenciado por timestamp o ID. Los nombres de lo que algo "es" dentro del relato (gancho, problema, diagnóstico, clímax, demostración, énfasis) no van aquí: van en 9.11, marcados [INT].

Esta sección es la que más se contamina, porque resume. Las tres pruebas aplican a cada frase igual que en la línea de tiempo. Si una frase contiene "indica", "indicando", "sugiere", "denota", "revela", "actúa como", "sirve para" o "con el fin de", es una deducción: el dato físico se queda aquí y la deducción va a 9.11 (CASO 33).

Escribe cada medición con su rótulo exacto, tal como aparece abajo, sin abreviarlo.

RITMO DE MONTAJE: secuencia de duraciones de plano [PL1 2.8s, PL2 0.9s, ...]; si acelera, desacelera o se mantiene, y dónde cambia. Patrón que se repite, si lo hay (por ejemplo, dos planos cortos y uno largo).

ESTRUCTURA TEMPORAL:
- SECUENCIA DE TRAMOS: la fuente dividida en tramos consecutivos según lo que cambia físicamente (aparición del sujeto principal, cambio de su configuración, entrada o salida de habla o música, aparición de texto, último plano). Cada tramo con inicio, fin y porcentaje de la duración, y el cambio físico que lo delimita. Sin nombrarlo por su papel en el relato: eso es la ESTRUCTURA NARRATIVA de 9.11.
- HITOS: primer plano (duración y contenido) · primera aparición del sujeto principal · primer texto · primera voz · último plano.

SINCRONÍA: cortes que coinciden con acentos musicales, palabras o efectos · apariciones de texto que coinciden con cortes o acentos · desincronías visibles.

COREOGRAFÍA DEL TEXTO: secuencia de TX# con duraciones, solapamientos, intervalos sin texto.

CONTINUIDAD: cambios de escala entre planos consecutivos · cambios de ubicación · saltos de eje.

DISEÑO SONORO: capas presentes, su relación de volumen, entradas y salidas, uso del silencio, sonidos de contacto y su sincronía con la imagen.

ARQUITECTURA DE RETENCIÓN — posiciones medidas, no juicios. Cada dato con timestamp y con su porcentaje de la duración total del archivo.
- APERTURA (00:00–00:04): entidades en cuadro, primer movimiento, primer sonido, primera palabra y primer texto, por ID y con referencia a 9.5.
- MARCADORES DE FIN DE APERTURA: el instante del primer CORTE, del final de T1, de la desaparición de TX1 y del primer cambio de estado del sujeto principal, los que existan. Aquí no decides dónde termina "el gancho": registras los marcadores.
- SUJETO PRINCIPAL: la entidad que más tiempo ocupa el cuadro (ID y % del tiempo en que es visible), e instante en que aparece completa por primera vez.
- CAMBIOS DE ESTADO DEL SUJETO PRINCIPAL: los de 9.8, cada uno con su posición en %. Cuál es el mayor va marcado [INT], declarando el criterio físico usado (magnitud del cambio de forma, de configuración, de color o de posición).
- ESTADO FINAL VISIBLE: primer instante a partir del cual el sujeto principal permanece en la configuración con que termina el video, con timestamp y %.
- SONIDO EN EL MAYOR CAMBIO Y EN EL ESTADO FINAL VISIBLE: lo que registra AUD en esos segundos (habla, música, efecto, sonido de contacto, ambiente o silencio), sin interpretarlo.
- LLAMADAS A LA ACCIÓN: todo texto (TX#) o habla (T#) en imperativo dirigido al espectador, literal, con timestamp y %, marcado [ID] llamada a la acción. Además, los gestos o gráficos que señalan una zona de la pantalla (un dedo que apunta hacia el borde inferior, una flecha), descritos físicamente con timestamp y %, marcados [INT] posible llamada a la acción. Si no hay ninguno: "No se registran llamadas a la acción."
- CIERRE: último plano, último texto, último sonido y lo que queda en cuadro en el último fotograma.

SUJETO PRINCIPAL Y MANIPULACIÓN — agregados de lo ya registrado, por ID y timestamp:
- ZONAS MOSTRADAS: partes del sujeto principal que se ven, en orden de primera aparición, descritas físicamente.
- VISIBILIDAD: intervalos en que aparece completo y en que aparece parcial, con su número.
- PLANOS DE DETALLE: cuáles son y qué parte del sujeto principal ocupa el cuadro en cada uno.
- MANIPULACIÓN: configuraciones de agarre observadas (qué mano, qué dedos, dónde contactan), número de rotaciones con su sentido y su eje, contactos breves que no llegan a agarre, y gestos de señalamiento o enmarcado (un dedo que señala, recorre o rodea una parte del sujeto principal). Si no hay manos en cuadro: "No se observa manipulación con manos."
- PRESENCIA DE ROSTRO (humano o no: personaje, muñeco, avatar): número de apariciones y, para cada una: ID, intervalo y duración, porción visible (completo, perfil, parcial, solo ojos o boca, cabeza y hombros, cuerpo entero), escala y ángulo del plano, expresión descrita físicamente, dirección de la mirada (al objetivo, al sujeto principal, fuera de cuadro), interacción física con el sujeto principal (lo sostiene, lo toca, lo mira, ninguna), y si aparece antes de la primera aparición del sujeto principal, junto a él o después. Si no aparece ninguno: "No aparece ningún rostro."

SEGÚN LA FUENTE
- AUDIO: el RITMO DE MONTAJE se mide sobre los segmentos sonoros (SG#), y se añade RITMO DEL HABLA: palabras por minuto por tramo y pausas de más de 1 s con su timestamp. La APERTURA es sonora (primer sonido, primera palabra y primera capa musical dentro de los primeros 4 s). El SUJETO PRINCIPAL es la voz o fuente sonora que más tiempo suena; sus cambios de estado son cambios sonoros. ZONAS MOSTRADAS, VISIBILIDAD, PLANOS DE DETALLE y PRESENCIA DE ROSTRO: NO APLICA. MANIPULACIÓN: solo los sonidos de manipulación audibles, descritos acústicamente.
- TRANSCRIPCIÓN: la ARQUITECTURA DE RETENCIÓN se mide sobre el texto: primera frase completa, primera pregunta, imperativos, repeticiones, cambios de hablante, posición de cada llamada a la acción. Las posiciones van en tiempo [META] si la fuente lo trae; si no, en % de palabras [BAJA]. Las demás mediciones visuales y sonoras: NO APLICA.
- DESCRIPCIÓN: solo lo que la descripción relate, marcado [REL]. Los porcentajes se calculan sobre los tiempos que la descripción dé; si no da tiempos, son [ND].

--------------------------------------------------
9.10 FUNCIÓN / POSIBLE USO
--------------------------------------------------

Sección OPCIONAL. Para la mayoría de los elementos, la respuesta esperada es NO DETERMINABLE.

Una función se escribe solo cuando la fuente demuestra un uso repetido o un resultado directamente observable, no cuando "parece razonable" o "es de sentido común".

ELEMENTO: [ID]
EVIDENCIA: [timestamps + evidencia física de esta fuente]
POSIBLE FUNCIÓN: [FUN] [función compatible con esa evidencia]
NO DETERMINABLE: [lo que sigue sin poder afirmarse]

Antes de escribirla, aplica la PRUEBA 3. Desconfía de las funciones que suenan neutras pero son propósito inferido: "mantener accesible", "elevar", "facilitar", "permitir", "ayudar a", "inmovilizar", "mejorar", "optimizar", "proteger", "organizar".

--------------------------------------------------
9.11 INTERPRETACIÓN
--------------------------------------------------

Aquí sí interpretas. Todo va marcado [INT], apoyado en evidencia ya registrada, citando timestamp o ID.

Estados emocionales o psicológicos, formato obligatorio:
"[INT] El comportamiento registrado en [timestamp] podría interpretarse como [X], aunque la fuente por sí sola no permite determinar el estado emocional del sujeto."

Origen, autoría, autenticidad, espontaneidad o puesta en escena: mismo tratamiento, con lenguaje de posibilidad y apoyándote en los indicadores de 9.2.

Si el registro lo sostiene, incluye además estas entradas, cada una por separado, siempre [INT] y citando la evidencia por timestamp o ID. La que el registro no sostenga no se escribe; se declara en 9.14.
- TÉCNICA DE APERTURA: cómo podrían operar los primeros segundos (curiosidad, contraste, movimiento, revelación u otra) y dónde podría terminar la apertura, según los MARCADORES de 9.9.
- DISPARADOR: qué, dentro de la APERTURA, podría hacer que alguien deje de desplazarse por el feed.
- MECANISMO PSICOLÓGICO PRINCIPAL: qué podría sostener la atención o generar deseo a lo largo del video (curiosidad no resuelta, contraste antes y después, satisfacción sensorial, sorpresa, identificación con un problema, ternura, nostalgia, prueba social u otro). Escríbelo como mecanismo aplicable a otro producto, no como resumen del contenido.
- ESTRUCTURA NARRATIVA: cómo podría leerse la SECUENCIA DE TRAMOS de 9.9 (por ejemplo: problema, presentación, demostración, resultado, cierre), con el timestamp y el % de cada tramo, y dónde podría situarse el clímax, con su % y el criterio usado.
- PAPEL DEL ROSTRO: qué podría aportar cada aparición registrada (conexión humana, confianza, reacción, escala, claridad de la demostración, ternura) y si el video podría funcionar sin ella. Si no aparece ningún rostro, esta entrada no se escribe: la ausencia ya consta en 9.9.
- ACCIÓN BUSCADA: hacia qué acción podría dirigir el video al espectador, a partir de las LLAMADAS A LA ACCIÓN de 9.9. Si no se registró ninguna: "No hay evidencia de una acción buscada."
- REGISTRO DE PRODUCCIÓN: si el material se presenta como contenido de usuario, publicación orgánica, anuncio de marca o demostración, y qué elementos registrados lo acercan a uno u otro, apoyado en 9.2 y 9.4.

--------------------------------------------------
9.12 PATRONES REPLICABLES
--------------------------------------------------

Separa el mecanismo del contenido. No describe lo que pasó en este video: describe la técnica aplicable a otro producto, otro sujeto, otro formato.

PATRÓN: [nombre corto]
EVIDENCIA: [timestamps e IDs]
MECANISMO: [por qué funciona estructuralmente, no temáticamente]
CONDICIONES: [qué necesita un video para usarlo]
TRANSFERIBILIDAD: [alta / media / baja — y por qué]

Prueba de validez: reformula el patrón cambiando el sujeto por otro completamente distinto. Si deja de tener sentido, no era un patrón.

Objetivo: al menos 3 por video, y todos los que el registro sostenga si el video es rico. Si el registro no sostiene 3 patrones que superen la prueba, entrega los que sí la superan y declara en 9.14 por qué no hay más. Un patrón inventado para llegar a la cifra es el ERROR 2 (CASO 31).

--------------------------------------------------
9.13 FICHA DE RECREACIÓN POR PLANO
--------------------------------------------------

Reorganiza lo ya registrado para que cada plano pueda reconstruirse con herramientas de generación de video o con una nueva grabación. Esta sección reorganiza; no observa. No añadas nada que no esté en las secciones anteriores. Si un campo no está en el registro, escribe [ND].

Empieza con un PLAN GENERAL que alguien pueda seguir sin haber visto el video:

SETUP: superficies, fondo, luz y elementos de entorno comunes a los planos (E#), según 9.3 y 9.4.
SECUENCIA: los planos en orden, con su duración, el ritmo de corte de 9.9 y la secuencia de manipulación (agarres, rotaciones, gestos) de 9.9.
SUJETOS: qué entidades hay que conseguir o recrear (IDs). Para cada persona, un PERFIL PARA RECREACIÓN [INT] solo con lo necesario para recrear el plano con otra persona: categoría de edad aparente amplia (niño, joven adulto, adulto, mayor), estilo de presentación, peinado, maquillaje visible o no, uñas, vestuario y accesorios. Nunca identidad, origen étnico ni otros rasgos sensibles. Para cada aparición de rostro registrada en 9.9: encuadre, expresión física, dirección de la mirada, interacción con el sujeto principal y duración. Si la fuente no tiene rostro: "Sin rostro en la fuente", y no se añade uno.

AUDIO: la ficha es por segmento sonoro (SG#): voces con su ritmo, pausas y volumen relativo, capas, efectos y entorno sonoro; el plan general describe el espacio sonoro y la grabación. TRANSCRIPCIÓN o DESCRIPCIÓN: el plan general es un GUION: el texto literal con hablantes, pausas y tiempos [META], y lo visual o sonoro solo si la descripción lo relata [REL]. Todo lo que haría falta para grabarlo y la fuente no contiene va como [ND]. Con acceso muestreado o derivado, la ficha cubre los tramos con evidencia, y los planos o momentos que caen en un hueco llevan [ND] en los campos que no se pudieron observar.

Después, una ficha por plano (o por segmento):

PL[n] ([duración])
SUJETOS Y ESTADO INICIAL: [IDs y su posición/configuración al inicio del plano]
ACCIÓN: [secuencia de movimientos del plano, incluidas microacciones y vacilaciones, con sus tiempos]
CÁMARA: [escala, ángulo, altura, movimiento]
LUZ Y ENTORNO: [según el registro, con fondo y superficie]
AUDIO: [lo que suena durante el plano]
TEXTO: [TX# visibles]
ESTADO FINAL: [configuración al cortar]

--------------------------------------------------
9.14 LÍMITES DEL ANÁLISIS
--------------------------------------------------

Agrupa todo lo que reduce la confiabilidad del registro:
- intervalos con granularidad reducida, y por qué
- todos los elementos [BAJA] y su motivo
- ambigüedades no resueltas
- datos que requieren verificación externa
- discrepancias entre información [META] y tu observación, o entre dos canales (subtítulo frente a lo audible)
- secciones declaradas vacías, y entradas de 9.11 o patrones de 9.12 que el registro no sostuvo
- canales y secciones NO APLICA por el tipo de fuente, y lo que la fuente no permitió saber (huecos de la fuente, contenido solo relatado)
- con acceso muestreado o derivado: cada hueco con su intervalo, y qué haría falta para cubrirlo (archivo original, audio completo, metadata técnica)

Un registro que declara sus límites se puede usar dentro de diez años. Uno que los oculta, no.

==================================================
10. EJEMPLOS DE FORMATO
==================================================

El contenido de estos ejemplos es ilustrativo e inventado: muestra cómo se ve el formato, no qué debes encontrar. No traslades nada de él a tu análisis.

--- EJEMPLO A — VIDEO ---

P1 — primera aparición 00:00
DESCRIPCIÓN FÍSICA: persona visible desde la cintura hacia arriba, centrada. Cabello oscuro recogido en la nuca. Prenda superior de manga corta, color gris claro, sin estampado visible. Anillo de apariencia metálica en el dedo anular de la mano izquierda. Uñas cortas, sin color visible, acabado mate.
IDENTIFICACIÓN: NO DETERMINABLE
APARICIONES: 00:00–00:03; 00:05–00:08 (como P1*)

O1 — primera aparición 00:00
DESCRIPCIÓN FÍSICA: envase cilíndrico de unos dos tercios de la altura de la mano de P1. Cuerpo translúcido ámbar, tapa opaca negra con estrías verticales, etiqueta blanca rectangular en el tercio inferior con texto ilegible a esta resolución [BAJA].
IDENTIFICACIÓN: [ID] probable envase de producto cosmético o de cuidado personal.
APARICIONES: 00:00–00:08

[00:00–00:01]
VIS: P1 sostiene O1 con la mano derecha a la altura del pecho, etiqueta orientada a cámara. La mirada de P1 está dirigida al objetivo. En la segunda mitad del intervalo, la cabeza de P1 se inclina ligeramente hacia su izquierda.
AUD: VOZ 1 habla — T1. Sin música.
TXT: TX1 aparece en 00:00.2.
CAM: PL1 comienza. Plano medio, frontal, fijo.

[00:01–00:02]
VIS: la mano izquierda de P1 sube desde fuera del cuadro inferior hasta la tapa de O1, con pulgar e índice separados aproximadamente el diámetro de la tapa. Se detiene unos 0.3 s a corta distancia de la tapa antes de contactar con ella. Al contactar, la muñeca izquierda rota en sentido antihorario un cuarto de vuelta.
AUD: VOZ 1 continúa — T1. Sonido breve, seco, de baja intensidad, coincidente con el final de la rotación.
TXT: TX1 sin cambios.
CAM: sin cambios.

[00:02–00:03]
SIN CAMBIOS OBSERVABLES. Persisten: P1 con ambas manos en O1; PL1 fijo; TX1 visible; VOZ 1 continúa — T1.

CORTE en 00:03.0 → PL2

[00:03–00:04]
VIS: plano detalle de O1 sobre superficie horizontal clara, tapa ausente del cuadro. No hay manos en cuadro.
AUD: VOZ 1 en pausa. Entra música instrumental con percusión marcada, ataque abrupto.
TXT: TX1 desaparece en 00:03.0. TX2 aparece en 00:03.1.
CAM: PL2 comienza. Plano detalle, cenital, fijo.

--- EJEMPLO B — AUDIO ---

VOZ1 — primera aparición 00:00
DESCRIPCIÓN FÍSICA: voz de tono medio, timbre ligeramente nasal, ritmo rápido, volumen alto y constante, sin reverberación perceptible. Alarga la última vocal de las preguntas.
IDENTIFICACIÓN: NO DETERMINABLE
APARICIONES: 00:00–00:09

VIS, TXT y CAM: NO APLICA — fuente de solo audio.

[00:00–00:01]
AUD: VOZ1 habla — T1. Ambiente continuo de baja intensidad y banda ancha. Sin música.

[00:01–00:02]
AUD: VOZ1 continúa — T1. En 00:01.6 entra música instrumental con ataque gradual y percusión suave, por debajo del volumen de VOZ1.
CAMBIO DE SEGMENTO en 00:01.6 → SG2

--- EJEMPLO C — TRANSCRIPCIÓN SIN TIEMPOS ---

(Fuente: transcripción con dos hablantes marcados "A" y "B".)

9.6:
T1 — tiempo [ND] — VOZ 1 ("A" en la fuente [META]): "¿Y esto para qué sirve?"
T2 — tiempo [ND] — VOZ 2 ("B" en la fuente [META]): "Mira. [risas] Lo pones aquí y ya está."

9.5:
[T1] HABLANTE: VOZ 1. ANOTACIONES: sin anotaciones. POSICIÓN: 0–42 % de las palabras [BAJA].
[T2] HABLANTE: VOZ 2 (cambio de hablante). ANOTACIONES: "[risas]" [META]. POSICIÓN: 42–100 % de las palabras [BAJA]. "esto" y "aquí" remiten a algo que la fuente no contiene: [ND]. Tono, volumen y ritmo: NO APLICA (la transcripción no los anota).

--- EJEMPLO D — VIDEO CON ACCESO DERIVADO ---

(Recibido: descripciones visuales por rangos, fragmentos de transcripción y fotogramas sueltos de una herramienta externa; sin el archivo.)

[00:00–00:30] [META — descripción por rango]
VIS: interfaz con tablero blanco; título de dos palabras en la parte superior; el cursor traza un contorno alrededor de una palabra. Orden y duración de cada acción dentro del rango: [ND].
AUD: VOZ 1 habla — T1 a T3.
TXT: TX1 visible en el rango; aparición y desaparición exactas [ND].
CAM: [ND] — no determinable si hubo cortes dentro del rango.

[00:30–00:52] SIN DATOS EN LA FUENTE (22 s).

[00:52.0] FOTOGRAMA [META]
VIS: I1* (interfaz compatible con la de 00:00–00:30; continuidad no observada), vista alejada; tres columnas de texto.
AUD: SIN DATOS EN LA FUENTE.

==================================================
11. CASOS DE CORRECCIÓN
==================================================

Provienen de errores reales en análisis previos y están repartidos a propósito entre tipos de video muy distintos.

LÉELOS COMO PRINCIPIOS, NO COMO DOMINIOS. El error del caso de cocina ocurre igual en un video de software, de deporte o de maquillaje. Si un caso parece ajeno a la fuente que analizas, el principio sigue aplicando: tradúcelo a tu contenido.

CASO 1 — Verbo de función (PRUEBA 1) — cosmética
MAL: "el aplicador distribuye el producto sobre la piel para cubrir la zona"
BIEN: "el extremo esponjoso de O2 recorre la mejilla de P1 en trazos cortos y solapados; tras cada pasada, la tonalidad de la zona recorrida se aproxima a la del producto depositado"
POR QUÉ: "distribuye... para cubrir" es finalidad. El movimiento y el cambio de tonalidad son observables.

CASO 2 — Sustantivo funcional (PRUEBA 1) — mascotas
MAL: "el perro es colocado sobre la estructura de soporte dentro de la bañera"
BIEN: "el cuerpo de A1 se apoya sobre la superficie de tela de O3, colocada dentro de O1 (recipiente rectangular de bordes elevados)"
POR QUÉ: "soporte" y "bañera" nombran por propósito. Ninguna lista cubre todos los casos; aplica la prueba a cada palabra.

CASO 3 — Estado-conclusión (PRUEBA 2) — cocina
MAL: "DESPUÉS: la carne ya está cocida (por apariencia)."
BIEN: "DESPUÉS: la superficie de O4 presenta tonalidad marrón oscuro uniforme, frente a la tonalidad rojiza registrada en 00:06. No se observa líquido acumulado alrededor. NO DETERMINABLE: el grado de cocción interior."
POR QUÉ: "(por apariencia)" admite la inferencia pero la deja dentro de la observación.

CASO 4 — Resultado afirmado y negado (PRUEBA 2) — mascotas
MAL: "DESPUÉS: uña aparentemente más corta. NO DETERMINABLE: si la uña fue cortada."
BIEN: "DESPUÉS: uña visible en la zona donde se cerró O5. NO DETERMINABLE: si su longitud cambió respecto al estado anterior."
POR QUÉ: no se puede afirmar un resultado y declararlo indeterminable a la vez. "Aparentemente" no lo arregla.

CASO 5 — Identidad tras corte (PRUEBA 3) — UGC hablado
MAL: "00:08–00:14: La misma persona, ahora en la cocina, sigue explicando el producto."
BIEN: "00:08–00:14: P1* frente a una superficie horizontal con muebles superiores al fondo (E3)."
POR QUÉ: la similitud tras un corte no confirma identidad. "Sigue explicando" además asume una continuidad que el corte no muestra.

CASO 6 — Beneficio inferido como función (PRUEBA 3) — tecnología
MAL: "POSIBLE FUNCIÓN: organizar los cables y mantener el escritorio despejado."
BIEN: "EVIDENCIA: entre 00:11 y 00:19, tres elementos alargados y flexibles se introducen uno a uno en las ranuras de O2 y permanecen en posición fija al mover la superficie. POSIBLE FUNCIÓN: [FUN] podría utilizarse para mantener elementos alargados en posición fija. NO DETERMINABLE: si el orden del espacio es su propósito o una consecuencia."
POR QUÉ: "despejado" es un beneficio inferido, no algo que el video demuestre.

CASO 7 — Función inferida sin palabras sospechosas (PRUEBA 3) — hogar
MAL: "POSIBLE FUNCIÓN: dejar la ropa lista para usar sin necesidad de plancha."
BIEN: "EVIDENCIA: entre 00:04 y 00:09, O1 emite vapor visible mientras recorre verticalmente una prenda colgada; en la zona recorrida, los pliegues registrados en 00:03 ya no son visibles en 00:10. POSIBLE FUNCIÓN: [FUN] podría utilizarse para modificar la superficie de prendas colgadas. NO DETERMINABLE: si el resultado es comparable al de otros métodos."
POR QUÉ: la versión MAL no usa ninguna palabra sospechosa y aun así añade una comparación con algo que nunca aparece. La PRUEBA 3 no depende de listas.

CASO 8 — Emoción como hecho (9.11) — UGC hablado
MAL: "[INT] La persona está entusiasmada; se nota su sorpresa genuina al abrir la caja."
BIEN: "[INT] La apertura ocular amplia y el aumento de volumen de la voz registrados en 00:09 podrían interpretarse como sorpresa, aunque la fuente por sí sola no permite determinar el estado emocional de P1 ni si la reacción es espontánea o interpretada."
POR QUÉ: "entusiasmada" y "genuina" se presentan como hechos. En material promocional la espontaneidad nunca es observable.

CASO 9 — Onomatopeya (canal AUD) — gameplay
MAL: "Suena un 'ding' al completar el nivel y un 'whoosh' en la transición."
BIEN: "Sonido breve, agudo, de timbre metálico y resonancia prolongada, coincidente con el cambio del contador de I1. A continuación, sonido de banda ancha con ataque gradual y caída rápida, coincidente con el CORTE en 00:12.4."
POR QUÉ: la onomatopeya es estilo, no propiedad acústica.

CASO 10 — Narración entre estados separados por corte (9.8) — deporte
MAL: "El jugador remata, la pelota entra y luego celebra con el equipo."
BIEN: "ANTES: P1 con el pie derecho en contacto con O1 (objeto esférico); O1 se desplaza hacia E2. TRANSICIÓN: CORTE. DESPUÉS: P1* con los brazos extendidos sobre la cabeza; P2, P3 y P4 en contacto con su espalda y hombros. NO DETERMINABLE: trayectoria final de O1 y lo ocurrido entre ambos planos."
POR QUÉ: "la pelota entra" y "luego celebra" rellenan un corte con lo que suele pasar, no con lo que se ve.

CASO 11 — Microacción empobrecida (canal VIS) — producto
MAL: "La persona mueve la mano hacia el producto."
BIEN: "La mano derecha de P1 se desplaza desde el borde inferior del cuadro hacia el centro, en movimiento continuo, con índice y pulgar separados aproximadamente el ancho de O1. Se detiene cuando la yema del índice contacta con la cara superior de O1. El hombro derecho desciende ligeramente durante el desplazamiento."
POR QUÉ: la versión MAL conserva que hubo movimiento y pierde todo lo demás. Es el error que más información destruye.

CASO 12 — Vacilación omitida (canal VIS) — UGC
MAL: "La persona toma el frasco."
BIEN: "La mano izquierda de P1 avanza hacia O1 y se detiene unos 0.4 s a corta distancia de él, con los dedos semiabiertos; después completa el recorrido y los dedos se cierran alrededor del cuerpo de O1."
POR QUÉ: la pausa antes del contacto es un dato de ritmo y de actuación. Resumir la acción por su resultado la borra.

CASO 13 — Transcripción parafraseada (9.6) — UGC hablado
MAL: "T1: la persona explica que descubrió el producto hace poco y que le cambió la rutina."
BIEN: "T1 — 00:00–00:05 — VOZ 1: \"O sea, yo... yo llevaba como tres años con esto, ¿no? Y de repente [pausa 1 s] encontré esto y fue como... [énfasis en 'ya'] ya, se acabó.\""
POR QUÉ: la paráfrasis conserva el qué y destruye el cómo: vacilaciones, pausas y énfasis.

CASO 14 — Interfaz descrita por su función (I#) — tutorial en pantalla
MAL: "El usuario abre la configuración y activa la exportación en alta calidad."
BIEN: "El cursor se desplaza al icono dentado del extremo superior derecho de I1 y hace clic. Aparece un panel vertical con seis filas de texto. El cursor baja a la cuarta fila, con el texto 'Export quality', y hace clic en un control deslizante a su derecha. El control pasa de la izquierda a la derecha y el texto adyacente cambia de 'Standard' a 'High'."
POR QUÉ: la versión BIEN permite reproducir los pasos sin haber usado nunca ese software.

CASO 15 — Origen afirmado en la observación (9.2) — material generado
MAL: "El video está hecho con IA: se nota en las manos y en el texto."
BIEN: "[9.2] En 00:04 la mano izquierda de P1 presenta seis apéndices distinguibles. El texto del cartel de E2 está formado por trazos de apariencia tipográfica sin correspondencia con caracteres legibles. Entre 00:06 y 00:07 el patrón de la pared cambia de configuración sin transición visible. [9.11] [INT] Estos indicadores son compatibles con material generado o alterado por software, aunque la fuente por sí sola no permite determinarlo."
POR QUÉ: los artefactos se observan; el origen se concluye. Van en secciones distintas.

CASO 16 — Capas mezcladas (C#) — video de reacción
MAL: "La persona se ríe mientras en el video alguien se cae de la bicicleta."
BIEN: "C1 (tercio superior): P1 con la cabeza inclinada hacia atrás, boca abierta, hombros con movimiento vertical rápido y repetido. C2 (dos tercios inferiores): P2 sobre O1 (bicicleta [ID]); el cuerpo de P2 pierde contacto con el asiento y contacta lateralmente con el suelo. RELACIÓN TEMPORAL: el movimiento de hombros de P1 comienza unos 0.4 s después del contacto de P2 con el suelo."
POR QUÉ: mezclar capas destruye la relación temporal, que es justamente el dato valioso.

CASO 17 — Orígenes no distinguidos (F#) — compilación
MAL: "El video muestra varios clips de distintas personas usando el producto."
BIEN: "F1 [00:00–00:04]: vertical completo, sin bordes, sin marca de agua. F2 [00:04–00:09]: vertical con bordes negros laterales, nitidez inferior, artefactos de compresión en zonas de movimiento, marca de agua en el extremo inferior derecho [contenido literal]. F3 [00:09–00:14]: sin bordes, perfil de color más frío que F1 y F2."
POR QUÉ: saber qué material es propio y cuál ajeno solo es posible si la procedencia quedó registrada por clip.

CASO 18 — Cámara lenta afirmada (límite 4) — comida
MAL: "En cámara lenta, la salsa cae sobre el plato."
BIEN: "La salsa desciende en un hilo continuo durante 2.1 s y forma ondas concéntricas al contactar con la superficie, que se expanden durante 1.4 s. [ND] velocidad de reproducción; [INT] el tiempo de caída podría ser compatible con reproducción ralentizada."
POR QUÉ: la velocidad de reproducción no se observa; se observan sus indicadores.

CASO 19 — Sección vacía omitida — cualquier fuente
MAL: [la sección sobre animales no aparece]
BIEN: "No se observan animales en el video."
POR QUÉ: un hueco no declarado es indistinguible de un olvido.

CASO 20 — Segundos saltados (sección 5) — cualquier video o audio
MAL: "[00:00–00:03] ... [00:07–00:09] ... [00:12–00:15] ..."
BIEN: "[00:00–00:01] ... [00:01–00:02] ... [00:02–00:03] ... [00:03–00:04] SIN CAMBIOS OBSERVABLES. Persisten: [...] ... y así, sin saltos, hasta el último segundo."
POR QUÉ: los huecos no dicen "no pasó nada"; dicen que nadie miró.

CASO 21 — Relleno fabricado (sección 5) — cualquier video o audio
MAL: "[00:04–00:05] P1 ajusta ligeramente O1 mientras su mirada se desplaza al borde del cuadro y su respiración parece acelerarse."
BIEN: "[00:04–00:05] SIN CAMBIOS OBSERVABLES. Persisten: mano derecha de P1 en contacto con el lateral de O1; PL2 fijo."
POR QUÉ: cubrir un segundo obliga a registrarlo, no a llenarlo. Inventar para que "tenga contenido" es el ERROR 2.

CASO 22 — Compresión para caber (sección 8) — fuente larga
MAL: "[04:00–09:30] P1 continúa demostrando el producto con movimientos similares a los anteriores."
BIEN: "[04:00–04:01] ... [04:01–04:02] ... (entradas completas) ... ⟶ CONTINÚA DESDE 05:00 / SECCIONES PENDIENTES: 9.6 desde T14, 9.7 desde TX9, 9.8 a 9.14"
POR QUÉ: el límite de longitud se resuelve dividiendo, nunca resumiendo. "Movimientos similares" es exactamente la información que se pierde.

CASO 23 — Patrón frente a contenido (9.12)
MAL: "PATRÓN: el video muestra un perro que odia bañarse."
BIEN: "PATRÓN: problema declarado antes de mostrar la solución. EVIDENCIA: TX1 de conflicto visible 00:00–00:03; O1 no aparece en cuadro hasta 00:03. MECANISMO: el espectador reconoce el problema como propio antes de tener motivo para evaluar el producto. CONDICIONES: un problema reconocible en menos de 3 segundos sin explicación. TRANSFERIBILIDAD: alta, independiente del producto y del nicho."
POR QUÉ: si el patrón solo sirve para videos de perros, no era un patrón.

CASO 24 — Identificación dentro de la descripción física (PRUEBA 3) — objeto con forma de personaje
MAL: "DESCRIPCIÓN FÍSICA: figura violeta con forma de personaje animado (Gengar), situada sobre el mueble a la izquierda de P1."
BIEN: "DESCRIPCIÓN FÍSICA: objeto tridimensional violeta de cuerpo redondeado, con dos protuberancias puntiagudas en la parte superior, dos áreas rojas en la mitad superior del frente y una franja blanca dentada debajo de ellas; se apoya sobre la superficie de madera de E2, a la izquierda de P1. IDENTIFICACIÓN: [ID] probable figura del personaje Gengar."
POR QUÉ: el nombre de un personaje, marca o modelo es identificación, no forma. Dentro de la descripción física contamina el dato duro; en IDENTIFICACIÓN queda marcado como lo que es. Error real de un análisis hecho con este mismo protocolo, junto con el verbo "descansa", que ya figura en la lista de la PRUEBA 1.

CASO 25 — Transcripción recortada en una entrada larga (9.6) — habla a cámara
MAL: "T30 — 01:30–02:09 — VOZ 1: \"[una sola entrada de 85 palabras para 39 s de habla continua]\""
BIEN: "T30 — 01:30–01:35 — VOZ 1: \"...\" / T31 — 01:35–01:41 — VOZ 1: \"...\" / ... una entrada por frase, ninguna de más de 8 s, hasta 02:09."
POR QUÉ: una entrada larga oculta las frases omitidas, porque parece cubrir todo el intervalo. Error real: ese mismo tramo, transcrito frase por frase, tenía 130 palabras, no 85.

CASO 26 — Imagen reconstruida desde el sonido (sección 1) — audio de unboxing
MAL: "[00:04–00:05] P1 abre la caja y saca el producto."
BIEN: "[00:04–00:05] AUD: sonido seco y breve de intensidad media, seguido de un roce continuo de unos 1.2 s con timbre de papel o cartón. [INT] la secuencia sonora podría ser compatible con la apertura de un envase."
POR QUÉ: en un audio no hay P1, ni caja, ni producto a la vista. Todo eso es imagen inventada a partir de un sonido.

CASO 27 — Tono inferido desde una transcripción (PRUEBA 3) — transcripción de un video hablado
MAL: "T4 — VOZ 1, con entusiasmo: \"esto me cambió la vida\""
BIEN: "T4 — 00:12–00:14 [META] — VOZ 1: \"esto me cambió la vida\" — tono, volumen y ritmo: NO APLICA (la transcripción no los anota)."
POR QUÉ: el entusiasmo no está en el texto; lo pone quien lee. Una transcripción solo sostiene lo que dice y lo que anota.

CASO 28 — Descripción ajena tratada como observación (sección 1) — descripción escrita de un video
MAL: "[00:03–00:05] VIS: la persona se sorprende al abrir la caja."
BIEN: "[00:03–00:05] [REL] según la descripción recibida: \"la persona se sorprende al abrir la caja\". No observado directamente; \"se sorprende\" es además una interpretación de quien describió."
POR QUÉ: lo relatado no es lo visto. Sin la etiqueta, una opinión de tercera mano entra al registro como dato duro.

CASO 29 — Hueco de la fuente tratado como silencio (sección 5) — transcripción con tiempos
MAL: "[00:12–00:20] Silencio."
BIEN: "[00:12–00:20] SIN DATOS EN LA FUENTE. La transcripción no cubre este intervalo: no es determinable si hubo habla, silencio u otro sonido [ND]."
POR QUÉ: el silencio es una observación. Un hueco en la fuente es la ausencia de una observación.

CASO 30 — Discrepancia resuelta en silencio ([META] y canales) — video con subtítulos
MAL: "T3 — 00:07–00:09 — VOZ 1: \"son veinte euros\"" (copiado del subtítulo, aunque la voz dice otra cifra)
BIEN: "T3 — 00:07–00:09 — VOZ 1: \"son doce euros\" [BAJA]. TX4 (subtítulo), visible en el mismo intervalo: \"son veinte euros\". DISCREPANCIA entre lo audible y TX4, declarada en 9.14."
POR QUÉ: una versión no corrige a la otra en silencio. La discrepancia es un dato: una de las dos está mal, y quien lea el registro tiene que saberlo.

CASO 31 — Patrón inventado para llegar al objetivo (9.12) — plano único
MAL: "PATRÓN 3: video corto. MECANISMO: los videos cortos retienen más."
BIEN: "[9.12] dos patrones que superan la prueba de cambio de sujeto. [9.14] Solo se identifican 2 patrones replicables: el video es un plano único sin texto ni cortes, y el resto de su estructura no sostiene un tercero."
POR QUÉ: "video corto" no es un mecanismo, y "retienen más" afirma un efecto que el video no demuestra. Llegar a una cifra con un patrón vacío es el ERROR 2 en la síntesis.

CASO 32 — Equipo deducido de la imagen (PRUEBA 3) — habla a cámara
MAL: "ILUMINACIÓN: aro de luz frontal y luz de ventana a la izquierda."
BIEN: "ILUMINACIÓN: reflejo especular circular blanco en ambas pupilas de P1; sombras de bordes difusos bajo la barbilla; la mitad izquierda del rostro, con temperatura aparente más fría que la derecha. [INT] el reflejo circular es compatible con una fuente de luz anular frontal."
POR QUÉ: el equipo no aparece en cuadro; aparecen sus efectos. Registrar los efectos permite recrear la luz y deja la deducción marcada como tal.

CASO 33 — Deducción dentro de una medición (9.9) — habla a cámara
MAL: "DISEÑO SONORO: la voz es seca, indicando grabación en interior con tratamiento acústico." / "SECUENCIA DE TRAMOS: Tramo 1 (00:00–00:20) planteamiento del problema; Tramo 2 (00:20–01:03) diagnóstico."
BIEN: "DISEÑO SONORO: VOZ 1 sin reverberación perceptible ni ambiente audible por debajo de ella." / "SECUENCIA DE TRAMOS: Tramo 1 (00:00–00:20, 0–15.6 %): PL1 único, sin música; termina en el CORTE de 00:20.3." — y en 9.11: "[INT] ESTRUCTURA NARRATIVA: el tramo 1 podría leerse como planteamiento del problema (T1–T6)."
POR QUÉ: error real de un análisis hecho con este mismo protocolo. "Indicando" convierte una medición en una conclusión sobre el equipo y el espacio, y el nombre del tramo convierte una división física en una lectura del relato. Las dos cosas son valiosas, pero en 9.11, marcadas.

CASO 34 — Registro rechazado por acceso incompleto (sección 1) — grabación de pantalla de 15 min con acceso derivado
MAL: "No puedo producir el registro conforme al protocolo sin incurrir en los dos errores que prohíbe. [Sigue un registro mínimo, un índice de contenido fuera del formato y la declaración de que 9.3 a 9.13 quedan [ND] por cobertura insuficiente.]"
BIEN: "9.1 — ACCESO: derivado: descripciones visuales por rangos de unos 30 s, fragmentos de transcripción y fotogramas aislados [META]. MAPA DE COBERTURA: VIS con descripciones de 00:00 a ~15:00 en rangos [BAJA]; AUD con transcripción en 00:01–04:20, 05:17–05:20, 06:38–06:39 y 08:48–08:49, resto sin datos. / 9.5 — [00:00–00:30] [META] VIS: interfaz con el título 'PILARES Y FASES' y la frase 'para corregir los videos y viralizar' subrayada en rojo; el cursor traza contornos alrededor de palabras y una flecha descendente. AUD: VOZ 1 habla — T1 a T4. ... [04:20–05:17] AUD: SIN DATOS EN LA FUENTE (57 s). / 9.7 — TX3 'PILARES Y FASES': visible al menos en 00:00–00:30 [META]; aparición y desaparición exactas [ND]. / 9.14 — granularidad de VIS limitada a rangos de ~30 s; 10 min de audio sin transcripción; duración técnica [ND]; para un registro segundo a segundo hace falta el archivo original."
POR QUÉ: error real de una prueba de este mismo protocolo en otra herramienta. El modelo identificó bien qué no podía observar, y aun así tenía textos literales, rangos de tiempo y cambios de interfaz: justo lo que el registro debe conservar, marcado [META] y con cada hueco declarado. Fidelidad no es abstenerse: es que cada dato lleve su etiqueta y cada hueco su intervalo.

==================================================
12. VERIFICACIÓN FINAL
==================================================

Si una afirmación falla, reescríbela con la evidencia disponible. No la borres.

FUENTE
□ ¿Declaré el tipo de fuente (video, audio, transcripción o descripción escrita)?
□ ¿Describí algún canal que la fuente no contiene, como imagen en un audio o tono en una transcripción?
□ ¿Declaré NO APLICA una sola vez donde corresponde, y usé [ND] solo para lo que existe pero no puedo determinar?
□ Si la fuente es una descripción escrita, ¿todo su contenido está marcado [REL] con las palabras de quien describió?
□ Si la fuente es una transcripción, ¿la reproduje completa, con sus entradas y sin corregir? ¿Traté algún hueco de la fuente como silencio?
□ Si recibí información [META] o hay subtítulos, ¿registré cada discrepancia con lo que observé en vez de elegir una versión en silencio?
□ ¿Declaré mi acceso (directo continuo, muestreado o derivado) y, si no es directo, el mapa de cobertura por canal?
□ ¿Entregué el registro completo en el formato de la sección 9 aunque mi acceso fuera incompleto, con cada hueco como SIN DATOS EN LA FUENTE, en vez de negarme o de cambiar a otro formato?
□ ¿Usé "sin cambios" en algún intervalo del que no tenía evidencia?

COBERTURA
□ ¿Completé el triaje de los ocho ejes (0 a 7) y calibré el peso según él?
□ ¿Llegué al final de la fuente, o dejé la marca de continuación exacta?
□ ¿La línea de tiempo forma una cadena ininterrumpida desde el inicio hasta el final, donde cada entrada empieza donde termina la anterior?
□ ¿Salté algún segundo por parecerme irrelevante, repetido, "intro" o posterior a la acción principal?
□ ¿Declaré como estables los segundos sin cambios, en vez de omitirlos?
□ ¿Inventé contenido en algún segundo para que no quedara vacío?
□ ¿Comprimí o resumí algún tramo para que cupiera en la respuesta?
□ Si agrupé segundos, ¿eran idénticos y declaré rango, duración y motivo?
□ ¿Cada entrada tiene los canales que existen en este tipo de fuente, aunque sea con "sin cambios"? ¿Cada línea SIN CAMBIOS deja constancia de todos ellos, y de verdad no cambia ninguno?

DETALLE
□ ¿Registré microacciones y vacilaciones, o solo los movimientos grandes?
□ ¿Algún ademán quedó reducido a "mueve la mano" o a su resultado?
□ ¿Cada entidad está descrita físicamente en el registro con todo su detalle? Si hay manos, ¿registré uñas, anillos y guantes, o que no son visibles?
□ ¿Cada plano tiene su fondo y su superficie, y la luz descrita por sus efectos?
□ Si hay habla, ¿la transcripción es literal y completa?
□ Si transcribí desde el sonido, ¿alguna entrada dura más de 8 s? ¿La cantidad de palabras es coherente con la duración del habla?
□ ¿Cada segundo con VOZ en el canal AUD está cubierto por una entrada T#?
□ ¿Registré los sonidos de contacto o manipulación con sus propiedades acústicas?
□ ¿Puse un nombre de personaje, marca o modelo dentro de una DESCRIPCIÓN FÍSICA?

ESTRUCTURA
□ ¿Medí en 9.9 la apertura de 4 s y sus marcadores de fin, el sujeto principal, los cambios de estado con su %, el estado final visible, el sonido en esos momentos, las llamadas a la acción (también las gestuales) y el cierre?
□ ¿Dividí la fuente en tramos medibles, con inicio, fin y %?
□ ¿Agregué zonas mostradas, visibilidad, planos de detalle, manipulación y cada aparición de rostro con todos sus campos, o declaré que no existen?
□ ¿Escribí cada medición de 9.9 con su rótulo exacto? ¿Quedó en 9.9 alguna deducción ("indicando", "sugiere", "actúa como") o algún nombre de papel en el relato?
□ ¿9.11 contiene técnica de apertura, disparador, mecanismo psicológico, estructura narrativa, papel del rostro, acción buscada y registro de producción, cada una con su evidencia, y declaré en 9.14 las que el registro no sostiene?
□ ¿El plan general de 9.13 permite recrear el video sin verlo, y el perfil para recreación evita identidad y rasgos sensibles?

PRUEBA 1 — SUPERVIVENCIA
□ ¿Cada observación sobrevive si borro identificación, función e interpretación?
□ ¿Usé sustantivos o verbos que nombran algo por su función o su intención?
□ ¿Describí alguna interfaz por lo que hace en lugar de por lo que se ve?
□ ¿Nombré un sonido por el objeto que lo produce en vez de por sus propiedades?

PRUEBA 2 — NO CONTRADICCIÓN
□ ¿Afirmé un resultado y a la vez lo marqué no determinable?
□ ¿Usé "aparentemente" o "parece" para colar una afirmación sin evidencia?
□ ¿Declaré un estado-conclusión sin evidencia en ese instante exacto?

PRUEBA 3 — ORIGEN DE LA CERTEZA
□ ¿Alguna función se apoya en conocimiento general y no en esta fuente?
□ ¿Usé el ID sin asterisco tras un corte sin continuidad visual demostrada?
□ ¿Usé la imagen para decidir qué sonido debería existir, o el sonido para decidir qué imagen había?
□ ¿Afirmé un estado emocional, la espontaneidad, el origen del material o el equipo de grabación como hecho?
□ ¿Rellené lo ocurrido durante un corte con lo que "suele pasar"?

INTEGRIDAD
□ ¿La depuración eliminó algún dato físico? Si es así, restáuralo.
□ ¿Usé onomatopeyas?
□ ¿Alteré algún carácter o emoji, o completé texto por contexto? ¿Marqué los emojis [BAJA]?
□ ¿Mezclé dos capas en una misma frase?
□ ¿Inventé algún timestamp o presenté una duración estimada como exacta?
□ ¿Afirmé cámara lenta o acelerada sin indicadores?
□ ¿Dupliqué descripciones entre secciones en lugar de referenciar por ID y timestamp?
□ ¿Añadí en la ficha de recreación algo que no estaba en el registro?
□ ¿Están todas las secciones presentes, en orden, y las vacías declaradas?
□ ¿Los patrones replicables superan la prueba de cambio de sujeto? ¿Son al menos 3, o declaré en 9.14 por qué hay menos?
□ ¿La sección de límites recoge todo lo [BAJA], [ND] y las discrepancias?

==================================================
REGLA FINAL
==================================================

CLASIFICA. CAPTURA. DEPURA. VERIFICA.

CADA SEGUNDO SE REGISTRA. NINGÚN SEGUNDO SE INVENTA.

UNA FUENTE INCOMPLETA SE REGISTRA CON SUS HUECOS. NUNCA SE RECHAZA.

SOLO SE OBSERVA LO QUE LA FUENTE CONTIENE. LO RELATADO SE CITA, NO SE OBSERVA.

DESCRIBE, LUEGO IDENTIFICA, LUEGO FUNCIÓN, LUEGO INTERPRETA. NUNCA AL REVÉS.

SI NO CABE, SE DIVIDE. NUNCA SE RESUME.

DECLARA TUS LÍMITES EN VEZ DE DISIMULARLOS.

NO CONFUNDAS LO QUE SE VE CON LO QUE SIGNIFICA.
