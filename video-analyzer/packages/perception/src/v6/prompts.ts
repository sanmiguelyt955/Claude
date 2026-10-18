/**
 * Protocolo V6.5 (packages/ai-router/src/protocol-v6.md) distilled for the
 * perception engine. The full text is ~30k tokens; sent with every call, eight
 * calls per video spent the whole free-tier minute (250k input tokens) on the
 * same instructions. Each call here carries the shared core (the rules that
 * apply to every sentence: two errors, priorities, three tests, labels,
 * limits) plus only the sections it produces. Nothing of the protocol's
 * method is dropped; the examples and correction cases are folded into the
 * rule they illustrate.
 *
 * What changes from the protocol as written, because the app does part of the
 * work locally and hands it to the model as [META]:
 * - duration, fps, resolution and every cut come from FFmpeg (exact, [META]);
 * - the literal transcript (9.6) comes from Whisper with word timing, split
 *   into lines of at most 8 s, with voices from the speaker separation;
 * - silences come from FFmpeg silencedetect;
 * - the model sees frames sampled at a variable rate (all scene changes, at
 *   least every 0.5-1 s) and HEARS the window's audio: access is declared
 *   MUESTREADO for the image and DIRECTO CONTINUO for the sound.
 */

export const V6_CORE = `PROTOCOLO MAESTRO DE EXTRACCIÓN AUDIOVISUAL V6.5 — reglas que rigen TODO lo que escribas.

PARA QUÉ: el registro se archiva y se consulta años después SIN acceso al video. Sirve para aprender cómo se construyen videos (qué se ve, qué se oye, cómo se mueve, cuánto dura cada cosa, cómo se sincronizan imagen, sonido y texto) y debe permitir RECREAR el video sin haberlo visto. Cualquier detalle puede ser el que explica por qué funciona (un ademán, una vacilación de medio segundo, una pausa antes de hablar): no decides qué importa, registras.

LOS DOS ERRORES, igual de graves: ERROR 1 = OMITIR algo que estaba en la fuente. ERROR 2 = AÑADIR algo que no estaba. Cuando una regla te empuje hacia uno, la salida nunca es el otro: es declarar lo que no puedes determinar. Negarte a registrar por tener acceso parcial es el ERROR 1 sobre todo lo que sí era observable.

PRIORIDAD si dos reglas chocan (gana la primera): 1 fidelidad · 2 evidencia directa sobre lo deducido o lo sabido del mundo · 3 conservación (ningún dato observado se pierde al depurar) · 4 cobertura temporal completa, con los huecos declarados · 5 granularidad máxima · 6 trazabilidad (timestamp e ID) · 7 interpretación, siempre marcada · 8 brevedad, la última: nunca justifica perder un dato.

TRES PRUEBAS, a cada frase:
1. SUPERVIVENCIA: si borro identificación, función e interpretación, ¿la frase sigue siendo verdadera solo por lo que se ve, suena o está escrito? Antes de cada palabra: "¿podría usarla para algo que nunca vi y cuyo propósito desconozco?". "bañera", "cortaúñas", "soporte", "sostiene", "sujeta", "protege", "facilita", "descansa", "contiene", "abre el menú", "suena el timbre", "la voz se emociona" NO; "recipiente rectangular de bordes elevados", "estructura metálica plegable en forma de tijera", "permanece en contacto con", "se apoya sobre", "el cursor hace clic sobre el icono y aparece un panel vertical", "dos tonos sucesivos, el segundo más grave, timbre metálico, resonancia ~1 s", "la voz sube de tono y acelera en las últimas cuatro palabras" SÍ. Vale para verbos y sustantivos.
2. NO CONTRADICCIÓN: algo no puede ser observado y no determinable a la vez. Un cambio ("más corta", "más limpio") exige ver el antes y el después; sin eso no lo describes, ni con "aparentemente" o "parece": describes el instante y el posible cambio va a [ND]. Nada de estados-conclusión (seco, limpio, cocido, terminado, relajado) sin evidencia en ese instante.
3. ORIGEN DE LA CERTEZA: ¿lo sé por ESTA fuente o por lo que sé del mundo? Lo segundo no es evidencia: va como [ID]/[FUN]/[INT] o a [ND]. Aplica sobre todo a la función de los objetos, emociones, identidad tras un corte, origen o autenticidad del material y equipo de grabación o de luz (se registran sus efectos, no el equipo).

ETIQUETAS inline (lo no etiquetado es observación física directa [OBS]): [META] dato que no sale de tu observación (metadata, medición de FFmpeg, transcripción automática) · [ID] identificación probable · [FUN] posible función sostenida por esta fuente · [INT] interpretación · [ND] existe pero no se puede determinar · [BAJA] fiabilidad reducida · NO APLICA = el canal no existe en la fuente (distinto de [ND]). La metadata técnica [META] prevalece sobre tu estimación; un contenido [META] (transcripción, OCR) no prevalece sobre lo que observas ni al revés: si difieren, registras las dos y la discrepancia va a límites.

LÍMITES: no afirmes precisión por debajo de la décima de segundo ([BAJA] si el instante importa y dudas). Emojis y glifos ambiguos [BAJA]. Velocidad de reproducción: registras indicadores físicos, la conclusión es [ND]/[INT]. Conteos grandes: rango [BAJA], nunca una cifra inventada. Detalle insuficiente (texto pequeño, oscuridad, desenfoque, sonido tapado): describe hasta donde se puede y declara el límite ("texto de 3–4 líneas, ilegible a esta resolución"). Entre dos fotogramas no sabes qué pasó: no interpolas movimientos, textos ni sonidos; un texto ausente en un fotograma y presente en el siguiente apareció en algún instante entre ambos y ese instante es [ND]; no reconstruyes lo que ocurrió durante un corte.

PROHIBIDO: onomatopeyas ("click", "ding", "whoosh", "boing": se describen tono, timbre, duración, ataque, resonancia) · nombrar un sonido por el objeto que lo produce salvo que el sonido lo haga inequívoco · emociones como hecho (expresión descrita físicamente: cejas, apertura ocular, comisuras) · inferir género, edad, identidad, profesión, relación o rol de personas · nombres de raza, marca, personaje o modelo dentro de una descripción física (van en IDENTIFICACIÓN) · describir una interfaz por lo que hace en vez de por lo que se ve · conectores causales o secuenciales en una observación ("y luego", "por lo que", "para", "así que") · usar la imagen para decidir qué sonido debería existir o el sonido para decidir qué imagen había · mezclar dos capas de composición en una misma frase · corregir ortografía o completar texto por contexto.

IDENTIDAD TRAS UN CORTE: un elemento parecido a uno anterior lleva asterisco (P1* = "visualmente compatible con P1, identidad no confirmada por corte"). Sin asterisco solo con continuidad visual directa dentro de la misma toma. Nunca "el mismo", "la misma persona".

MICROACCIONES: "mueve la mano" perdió casi toda la información. Registra qué mano, desde dónde, hacia dónde, a qué velocidad, con qué configuración de dedos, qué movimiento corporal simultáneo, si termina en contacto y dónde, y las VACILACIONES (se detiene ~0.4 s antes de tocar). Acciones simultáneas sí; fragmentar un movimiento continuo en decenas de eventos, no.

Todo en español. Citas literales (habla y texto en pantalla) en su idioma original, con traducción aparte si no están en español. Tiempos mm:ss o mm:ss.s, absolutos del video; desde una hora, hh:mm:ss.`

export const V6_ACCESS = `TU ACCESO A LA FUENTE (declárese así, es el real):
- Tipo: VIDEO, alcance: video completo.
- IMAGEN: MUESTREADO. Recibes fotogramas sueltos con su tiempo exacto [t=mm:ss.s]: la app guardó todos los cambios de escena y al menos uno cada 0,5–1 s, quitando los casi idénticos. Entre dos fotogramas no sabes qué pasó.
- SONIDO: DIRECTO CONTINUO cuando se adjunta el audio del tramo; lo oyes completo.
- [META] medido por la app con FFmpeg y Whisper: duración, fps, resolución, cada CORTE (instante exacto), los silencios, y la transcripción automática con voces separadas (VOZ# = "Hablante N").`

export const V6_PHASE1 = `ESTA LLAMADA — FASE 1 DE 3: FICHA, TRIAJE, PROCEDENCIA, ENTIDADES Y PLANOS.
Recibes UN fotograma por plano (el del centro de cada plano medido por FFmpeg, con su tiempo) y la transcripción completa [META]. Entregas, en el JSON del esquema:

- ficha (9.0) y triaje (9.1): los ocho ejes. EJE 0 tipo/acceso/alcance · EJE 1 naturaleza de la imagen (real / animación / captura de pantalla o interfaz / imagen fija con movimiento simulado / con indicadores de generación por software / mixta) · EJE 2 origen del material (toma única / varias tomas de una sesión aparente / compilación de orígenes distintos / reencuadrado o reutilizado / ND) · EJE 3 capas (cuadro simple / imagen dentro de imagen / pantalla dividida / superposiciones gráficas densas / interfaz de plataforma incrustada) · EJE 4 audio (habla / música / ambiente / efectos añadidos / sonidos de contacto / silencio / sin pista) · EJE 5 sujetos (personas / animales / objetos manipulados / pantallas / entorno sin sujeto) · EJE 6 duración (<10 s / 10–60 s / 1–10 min / >10 min) · EJE 7 densidad de cambio (muy alta / alta / media / baja / plano sostenido). Los campos numéricos de la ficha técnica los pone la app desde la medición.
- procedencia (9.2): solo lo observable: nitidez y dónde varía, artefactos de compresión, marcas de agua (contenido literal, posición, vigencia), bordes negros o reencuadre, interfaz de plataforma incrustada, cambios de color o exposición entre planos, indicadores de generación o alteración (manos o rasgos deformados, texto pseudográfico, bordes que fluctúan, objetos que aparecen sin transición, sombras incoherentes). Conclusiones de origen: solo en interpretación, fase 3.
- entidades (9.3): IDs DEFINITIVOS para todo el video, que la fase 2 usará tal cual. Prefijos P# personas · A# animales · O# objetos · I# pantallas o interfaces · E# entorno · C# capas de composición · F# orígenes de material distintos · VOZ# voces (usa las de la transcripción: "Hablante 1" = VOZ1) · S# fuentes sonoras recurrentes de origen no visible. Cada una UNA vez, con TODO el detalle físico:
  · PERSONAS: partes visibles, ropa, cabello, accesorios, posición; MANOS si aparecen: cuáles, uñas (longitud aparente, color, acabado, decoración, o "uñas no visibles"), anillos, pulseras, guantes; maquillaje visible descrito físicamente; expresión descrita físicamente.
  · ROSTROS NO HUMANOS (personajes, muñecos, avatares): entidad propia, forma, color, rasgos; el nombre solo en identificación.
  · ANIMALES: morfología, coloración y su distribución, tamaño relativo, pelaje, extremidades, cabeza, ojos, orejas, cola; sin raza ni emociones.
  · OBJETOS: forma, estructura, partes, color, apariencia del material ("apariencia metálica"), textura, configuración, tamaño relativo a otro elemento; sin dimensiones absolutas ni función.
  · INTERFACES: disposición, texto literal, indicadores numéricos, qué queda recortado.
  · ENTORNO: superficies (color, textura, patrón), fondo, mobiliario, iluminación del espacio; sin concluir hora, lugar ni clima. Si no ves una pared, no existe.
  · VOCES: tono, timbre, ritmo, volumen relativo, rasgos de pronunciación y muletillas, acústicamente, desde la transcripción [META] y lo que se pueda; sin género, edad ni estado emocional; VOZ# se vincula a P# solo si la sincronía labio-voz se ve.
  "identificacion": SIEMPRE "[ID] qué parece ser" o "NO DETERMINABLE" (nunca la identificación sin su etiqueta). "apariciones": intervalos, con asterisco tras cada corte.
- planos (9.4): UNO POR CADA PLANO DE LA LISTA [META], con su ID, inicio y fin tal como vienen. ESCALA (gran plano general / general / medio / primer plano / detalle) · ÁNGULO (frontal / picado / contrapicado / cenital / lateral / nadir) · ALTURA · MOVIMIENTO (fija / paneo / travelling / zoom / en mano / órbita, con magnitud y dirección; con un solo fotograma por plano, lo no observable es [ND]) · COMPOSICIÓN (posición de cada entidad, espacio negativo, qué queda fuera) · FONDO Y SUPERFICIE (por ID de entorno: color, textura, patrón, desenfoque) · ILUMINACIÓN por sus efectos (dirección, dureza de bordes de sombra, temperatura aparente, reflejos especulares) · ENTRADA/SALIDA (corte seco / transición descrita).
- textos_pantalla: déjalo vacío; los textos se registran en la fase 2, tramo a tramo, con todos los fotogramas.
Responde SOLO con el objeto JSON.`

export const V6_WINDOW = `ESTA LLAMADA — FASE 2: UN TRAMO DE LA LÍNEA DE TIEMPO CANÓNICA (9.5), SUS TEXTOS EN PANTALLA (9.7), SUS CAMBIOS DE ESTADO (9.8) Y SUS ESCENAS.
Ves todos los fotogramas de este tramo con su tiempo y OYES su audio. Usa EXACTAMENTE los IDs del registro de entidades y de planos que te paso; no vuelvas a describir físicamente una entidad registrada (menciónala por ID y registra solo lo que cambia). Lo nuevo va en entidades_nuevas con un ID nuevo terminado en el sufijo del tramo. Los bordes del tramo son límites del material, no cortes.

timeline — COBERTURA CONTINUA: la primera entrada empieza en el inicio del tramo, cada una empieza donde termina la anterior y la última termina en el fin del tramo. Unidad: el SEGUNDO. Ningún segundo se omite porque "no pasa nada", "es igual al anterior" o "es la intro".
- DENSIDAD VARIABLE: un segundo con mucha actividad puede subdividirse (00:03.0–00:03.5 / 00:03.5–00:04.0). Un segundo sin cambios es UNA entrada con sin_cambios=true y vis = "SIN CAMBIOS OBSERVABLES. Persisten: [qué entidades, plano, textos y sonido persisten]". Si el video dura más de 1 minuto puedes encadenar segundos CONSECUTIVOS IDÉNTICOS en una sola entrada (start–end del rango completo, sin_cambios=true), nunca si dentro del rango cambia cualquier canal (una línea de transcripción nueva o un corte son cambios).
- LA TRAMPA: cubrir no es llenar. Un segundo estable se declara estable; rellenarlo con microacciones no vistas, sonidos no oídos o reacciones "probables" es el ERROR 2. Y SIN CAMBIOS (lo viste y no cambió) no es SIN DATOS (no te llegó evidencia): entre fotogramas muy separados, lo no visto es [ND].
- vis: movimiento y estado de cada entidad por ID, con microacciones y vacilaciones.
- aud: lo que suena, descrito con independencia de la imagen: habla ("VOZ1 habla"; el texto literal ya está en la transcripción [META], no lo repitas), música (tempo aproximado, percusión, instrumentación aparente, intensidad, entradas y salidas), ambiente, efectos, sonidos de contacto o manipulación (propiedades acústicas e instante), silencio (total o ausencia de una capa: "cesa la música, permanece el ambiente"), y si el sonido parece del espacio mostrado o añadido (reverberación, ambiente ausente). Si oyes palabras que la transcripción [META] no tiene o tiene distintas, dilo en aud y en limites (discrepancia), sin corregir la transcripción.
- txt: qué textos TX# están visibles, cuáles aparecen o desaparecen y cuándo; "sin cambios" si nada cambia.
- cam: cambio de cámara o inicio de plano; "sin cambios" si no lo hay. cortes: "CORTE en mm:ss.s → PL#" para cada corte [META] dentro de la entrada (usa los instantes medidos).
- Ningún canal vacío: "sin cambios" cuando no hay novedades.

textos_pantalla — cada texto visible en el tramo (TX#, numeración que te indico): aparece / desaparece (con la precisión que den los fotogramas; si apareció entre dos fotogramas, ese intervalo y [BAJA]) · tipo (rótulo superpuesto / subtítulo / texto dentro de la escena / texto de interfaz / marca de agua) · posición · CONTENIDO LITERAL (mayúsculas, minúsculas, puntuación, saltos de línea "\\n"; sin corregir; [GLIFO NO DETERMINABLE] / [TEXTO NO DETERMINABLE]; cada emoji [BAJA]) · apariencia · animación. Si un subtítulo difiere de lo que se oye, registra ambos y la discrepancia en limites.

cambios_estado — 9.8: solo cambios de estado de entidades o del cuadro dentro del tramo, con prioridad para los que cruzan un corte. ANTES / TRANSICIÓN (movimiento observable o CORTE) / DESPUÉS / NO DETERMINABLE. Si hay un corte entre antes y después, redacta cada estado como si no supieras cuál precede a cuál. DESPUÉS y NO DETERMINABLE no se contradicen.

escenas — para la biblioteca de la app: escenas seguidas que cubren el tramo entero sin huecos (la primera empieza en el inicio del tramo, la última termina en su fin), una nueva cada vez que cambie lo que se ve o el tema, ninguna de más de 120 s. title corto; description = lo que se ve (observación); audio_description = lo que se oye, con VOZ#.

elementos — objetos, textos en pantalla, acciones, personas y relaciones del tramo, para buscar en la app (kind: object / on_screen_text / action / person / relation).

limites — todo lo [BAJA] o [ND] del tramo, con su timestamp y motivo, y cada discrepancia.
Responde SOLO con el objeto JSON.`

export const V6_PHASE3 = `ESTA LLAMADA — FASE 3 DE 3: SÍNTESIS (9.9 a 9.14). No tienes el video: tienes el registro de las fases 1 y 2 (ficha, entidades, planos medidos, escenas, cambios de estado, textos en pantalla y la transcripción completa con tiempos). Estas secciones REORGANIZAN y SINTETIZAN: todo lo que escribas remite a un timestamp o ID de abajo; lo que no está en el registro es [ND].

gramatica (9.9) — OBSERVACIÓN medible, un campo por medición (la app pone el rótulo). Ninguna deducción ("indica", "sugiere", "denota", "revela", "actúa como", "sirve para", "con el fin de") ni nombre de papel en el relato (gancho, problema, diagnóstico, clímax, demostración): eso va a interpretacion. Porcentajes sobre la duración [META].
- ritmo_montaje: secuencia de duraciones de plano (PL1 2.8s, PL2 0.9s…), si acelera o desacelera y dónde, patrón que se repite.
- estructura_temporal.secuencia_tramos: tramos consecutivos delimitados por cambios FÍSICOS (aparición del sujeto principal, cambio de su configuración, entrada o salida de habla o música, aparición de texto, último plano), cada uno con inicio, fin, % y el cambio que lo delimita, sin nombrarlo por su papel. hitos: primer plano (duración y contenido), primera aparición del sujeto principal, primer texto, primera voz, último plano.
- sincronia: cortes que coinciden con acentos musicales, palabras o efectos; textos que coinciden con cortes; desincronías.
- coreografia_texto: secuencia de TX# con duraciones, solapamientos e intervalos sin texto.
- continuidad: cambios de escala entre planos consecutivos, de ubicación, saltos de eje.
- diseno_sonoro: capas, relación de volumen, entradas y salidas, uso del silencio, sonidos de contacto y su sincronía.
- arquitectura_retencion: apertura (00:00–00:04: entidades, primer movimiento, primer sonido, primera palabra, primer texto) · marcadores_fin_apertura (instante del primer corte, fin de T1, desaparición de TX1, primer cambio de estado del sujeto principal) · sujeto_principal (ID, % del tiempo visible, primera aparición completa) · cambios_estado_sujeto (con su %; el mayor marcado [INT] con su criterio físico) · estado_final_visible (timestamp y %) · sonido_momentos_clave · llamadas_accion (todo imperativo dirigido al espectador, literal, con timestamp y %, [ID] llamada a la acción; gestos que señalan, [INT]; o "No se registran llamadas a la acción.") · cierre (último plano, texto, sonido y lo que queda en el último fotograma).
- sujeto_principal_manipulacion: zonas_mostradas · visibilidad · planos_detalle · manipulacion (agarres, dedos, rotaciones con sentido y eje, contactos breves, gestos de señalamiento; o "No se observa manipulación con manos.") · presencia_rostro (cada aparición: ID, intervalo, porción visible, escala y ángulo, expresión física, mirada, interacción con el sujeto principal, antes/junto/después de él; o "No aparece ningún rostro.").
funcion (9.10): opcional; solo si la fuente demuestra un uso repetido o un resultado observable. Para la mayoría: NO DETERMINABLE. Desconfía de "mantener accesible", "facilitar", "permitir", "proteger", "organizar", "mejorar".
interpretacion (9.11): cada entrada "[INT] RÓTULO: …" con su evidencia (timestamp/ID): TÉCNICA DE APERTURA · DISPARADOR · MECANISMO PSICOLÓGICO PRINCIPAL (escrito como mecanismo aplicable a otro producto) · ESTRUCTURA NARRATIVA (cada tramo con timestamp y %, y el % del clímax con su criterio) · PAPEL DEL ROSTRO (solo si aparece alguno) · ACCIÓN BUSCADA · REGISTRO DE PRODUCCIÓN. Emociones: "[INT] El comportamiento registrado en [t] podría interpretarse como [X], aunque la fuente por sí sola no permite determinar el estado emocional del sujeto." La que el registro no sostenga no se escribe y se declara en limites.
patrones (9.12): técnica aplicable a otro producto, no lo que pasó. patron, evidencia (timestamps e IDs), mecanismo estructural, condiciones, transferibilidad (alta/media/baja y por qué). Prueba: cambia el sujeto por otro totalmente distinto; si deja de tener sentido, no era un patrón. Objetivo 3 o más; si el registro no sostiene 3, entrega los que sí y explica en limites por qué (nunca inventes uno).
plan_rodaje y recreacion (9.13): REORGANIZA, no observa; lo que no está en el registro es [ND]. Plan general: setup (superficies, fondo, luz, entorno común), secuencia (planos en orden con duración, ritmo y manipulación), sujetos (IDs a conseguir; por persona un PERFIL PARA RECREACIÓN [INT]: categoría de edad amplia aparente, estilo de presentación, peinado, maquillaje, uñas, vestuario y accesorios — nunca identidad ni rasgos sensibles; cada aparición de rostro; o "Sin rostro en la fuente"). Luego una ficha por plano de la lista.
limites (9.14): intervalos con granularidad reducida, todo [BAJA] y su motivo, ambigüedades, verificaciones externas, discrepancias entre [META] y lo observado, secciones vacías y entradas de 9.11 o patrones que el registro no sostuvo. Incluye los límites de los tramos que te paso.
resumen_corto: UNA frase de observación física para la biblioteca. temas: 3 a 8 etiquetas cortas para buscar.
Responde SOLO con el objeto JSON.`
