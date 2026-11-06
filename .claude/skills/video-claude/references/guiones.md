# Guiones virales (ingeniería inversa de guiones, no de software)

## 1. Estudiar videos que ya funcionan
1. Junta 3-10 videos virales del mismo formato (links de YouTube/Shorts).
2. Transcripción con Firecrawl (`youtube-com/videos/video_transcript`, idioma original) y, para lo visual,
   `scripts/youtube_gemini.py <link> --pregunta "estructura: gancho, giros, ritmo de cortes, remate"`.
3. Saca la ESTRUCTURA (no copies frases): duración, nº de palabras, palabras por segundo, dónde cae el gancho,
   cada cuánto hay un giro o una pregunta, cómo termina y qué pide al final.

## 2. Fórmulas que vimos funcionar
- **Gancho con regla** (shorts de bloques): la 1.ª frase plantea una regla o un «¿qué pasaría si…?» («En este pueblo,
  si mientes, te crece una cola»). El resto del video rompe esa regla.
- **Historia con ironía** (estilo cabezón): situación cotidiana → error → escalada → giro irónico en la última línea.
  Narración seca (deadpan), ~200-250 palabras por minuto, sin silencios.
- **Explicativo** (estilo informativo 3D): gancho de peligro o curiosidad → UN solo objeto → se explica por partes
  (cada parte brilla cuando se nombra) → recompensa visual al final (explosión, revelación). A menudo sin música.
- **Suspenso / misterio** (collage): dato increíble → contexto → 2-3 giros → revelación → CTA.

## 3. Reglas de ritmo
- Una idea por frase; una frase por escena o toma.
- Pon la palabra clave al final de la frase (ahí caen el corte, el golpe y el sello).
- Cada 3-5 s algo nuevo: giro, pregunta, dato, cambio de lugar.
- Lee el guion en voz alta con `scripts/voz.py`: si sobra aire, recorta.

## Banco de ideas para pruebas A/B (formatos que llevan a 10-70M en canales de animación)
Probar 2 versiones del MISMO tema cambiando UNA sola cosa (gancho, formato, duración, con/sin voz) y quedarse con la que
retenga más (YouTube Studio → retención a los 3 s y % que vio completo). Estudiar antes el canal con `canal_viral.py`.

| Formato | Plantilla | Ideas para Kubo |
|---|---|---|
| Contraste A/B | «Con mamá / con papá», «Lo que ven mis papás / lo que veo yo» | dormir, la bici, el súper, la tarea, el parque |
| Línea de tiempo | «Objeto 2000 vs 2026 vs 2050» | celular, escuela, cumpleaños, pizza, puerta |
| Escalera | «1s / 10s / 1min / 1h» (barra de opciones) | malvavisco, palomitas, siesta, pensar una respuesta |
| Tipos de personas | «Tipos de personas cuando…» | batería al 10 %, examen, se va la luz, wifi lento |
| Cómo funciona (absurdo) | «Cómo funciona X por dentro» | impresora, microondas, cajero, elevador |
| Historia de 20 s | Situación → error → caos → remate que contradice | papá chef, el perro y la tarea, el primo influencer |
| Pregunta al público | «¿Cuál elegirías?» (empuja comentarios) | poderes, mascotas, dulces |
| Serie con continuidad | Episodios con los mismos personajes y un gag fijo | la cabeza de Kubo que sale volando |

Desencadenantes que más se repiten: identificación («eso me pasa»), contraste, escalada hasta el exceso, sorpresa en
el último 30 %, humor físico, baja carga cognitiva (se entiende sin idioma) y final cortado en seco (loop).

## Plantilla Kubo: guion monetizable (61-75 s, para cobrar en TikTok y retener en Shorts/Reels)
Duración mínima **61 s** (TikTok Creator Rewards paga solo videos de más de 1 minuto). ~190-210 palabras en inglés con
narración de ritmo medio y pausas cortas (pedirlo en `--estilo-voz`). Cada bloque = 1-3 tomas de 1.5-5 s.

| Bloque | % del video | Qué va | Ejemplo («la fila lenta») |
|---|---|---|---|
| 1. Gancho | 0-6 % | Premisa imposible, pregunta cotidiana o acusación al espectador, en la primera frase | «You always pick the slowest line at the supermarket.» |
| 2. Promesa | 6-10 % | Rompe la creencia («no es suerte») → abre la brecha de curiosidad | «And no, it's not bad luck.» |
| 3. Historia | 10-40 % | El personaje vive el problema, con escalada (pasos, día a día, «luego…») | Kubo elige la fila, la señora y su cupón, las otras avanzan, el del pastel |
| 4. Explicación | 40-65 % | El dato real, **muy visual**: etiquetas (1/3, 2/3), barras de color, flechas, comparaciones | 3 filas → solo una gana → 1/3 → 2/3 pierdes; el cerebro nota solo las derrotas |
| 5. Giro | 65-80 % | Lo inesperado, con el gag de Kubo (se le sale la cabeza) | Se cambia de fila y la vieja sale volando |
| 6. Remate | 80-87 % | La lección en una frase | «Switching just gives you twice as many chances to lose.» |
| 7. CTA compartir | 87-92 % | «Send this to the friend who…» (concreto: alguien que el espectador conoce) | «…who always switches lines.» |
| 8. Reto final | 92-100 % | Pregunta que se responde en comentarios + promesa («fijaré la primera correcta») | «With four lines, what are the chances…?» |

Reglas visuales:
- Cada idea abstracta tiene su **metáfora de color** (rojo = malo/lento, verde = bueno/rápido) o una **etiqueta**.
- Textos en 3D (etiquetas, signos) **neutros de idioma**: números, símbolos, «x2», «1/3», «?», «OK». Las palabras van
  en subtítulos o cabeceras (que cambian por idioma).
- Un efecto con sonido en cada acción importante (sale solo con `sfx_auto`).
- Termina con la firma sonora y un último cuadro que conecte con el primero (loop).
