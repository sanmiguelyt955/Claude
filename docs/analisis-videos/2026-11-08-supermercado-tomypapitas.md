# «Pusiste 10 estantes, ¡felicidades!, ahora tienes un súper» — TomyPapitas

- Link: https://youtube.com/shorts/W_OoW5WwXLQ · 76.8 s · 1080x1920 · 24 fps · llegó por el buzón (atajo «Bajar para IAs»).
- Herramientas: extraer_video.py (154 cuadros, 10 hojas, Whisper, mapa de volumen) + conector Gemini Video (fps 2).
  youtube_gemini.py falló (clave Gemini no válida en este entorno). Sin Tesseract: texto leído en los cuadros.

## Qué es
Explicador de neuromarketing de supermercado como si fuera un **videojuego de construcción** (tycoon): tú eres el dueño
y el espectador es un **peón de ajedrez** que cae en 7 trampas. Remate: «¿Y tú? ¿Seguro que solo ibas por leche?».

## Guion (Whisper, palabra por palabra en el original)
Gancho (0–4 s): «Pusiste 10 estantes. Felicidades. Ahora tienes un súper. Pero nadie va a comprar nada.»
Bucle ×7: **«Pero [problema]. Entonces [truco + comparación cotidiana]. Ese es [nombre del concepto].»**
1. Ruta forzada (leche al fondo, «tesoro al final de un laberinto») 0:10
2. Marketing sensorial (música lenta, «al ritmo de tus audífonos») 0:17
3. El carrito (enorme, «plato gigante en un buffet») 0:24
4. Planograma (caro a la altura de los ojos, «protagonista en un póster») 0:32
5. Anclaje (uno carísimo al lado, «el amigo feo en la foto») 0:40
6. Precio psicológico ($9.99, «el cerebro lee como un libro») 0:47
7. Fatiga de decisión (fila entre chocolates y chicles, «tú a medianoche con hambre») 0:56–1:10
Cierre 1:11: «Abres las puertas… felicidades, construiste un supermercado. ¿Y tú? ¿Seguro que solo ibas por leche?»

## Recursos visuales (verificados en los cuadros)
- **0 cortes de escena en 77 s**: es UNA sola toma de cámara que vuela, gira y hace zoom sobre el mismo mundo 3D.
- Mundo 3D **gris/blanco low-poly** sobre negro con **trama de puntos (halftone)**; único acento **verde neón**
  (= lo que funciona/compra) y **rojo** (= dolor, arrepentimiento, engañar).
- **Cursor blanco** = la mano del jugador/dueño; cada acción lleva **anillo verde de clic**.
- Personaje: **peón de ajedrez** (cliente manipulable). Cerebro 3D gris que cambia a verde al decir «sí».
- **Subtítulo de UNA palabra** grande arriba al centro, blanco con borde; palabras clave en verde o rojo
  (ENGAÑAR en rojo, CEREBRO/SÚPER en verde).
- **Etiqueta del concepto** abajo a la izquierda, estilo UI de juego: ■ PRECIO PSICOLÓGICO / ■ ARREPENTIMIENTO.
- Números gigantes ($9,99 con el 9 en verde), letreros 3D («SÚPER»), cajas que se pintan de rojo en el carrito.

## Audio
Voz rápida, segunda persona, irónica, sin pausas. Música electrónica tipo arcade de fondo. SFX de clic en cada acción,
«pop» al volverse GANGA, caja registradora al cambiar el precio. Golpes de volumen en 0:03.5, 0:17.5, 0:48, 1:05, 1:09.5;
silencio en 1:14.5 justo antes de la pregunta final (corte de música = énfasis).

## Por qué retiene / se comparte
- Problema → solución → nombre técnico, 7 veces: cada 7 s hay una recompensa (aprendes un término).
- Comparaciones cotidianas para cada concepto (audífonos, buffet, póster, amigo feo).
- Giro de rol al final: el espectador era el peón → comentarios («yo siempre caigo») y compartidos.
- Gamificación (estética de tycoon) + cursor que señala dónde mirar → cero esfuerzo visual.
- Dura >61 s (cuenta para monetización) sin sentirse largo.

## Para Kubo Studio (ideas que se pueden copiar como FORMATO, no el contenido)
- Formato «**Construye un X y descubre sus trucos**» (casino, restaurante de comida rápida, app de citas, parque de diversiones).
- Toma única con cámara que vuela por un diorama 3D (Blender ya lo hace).
- Subtítulo de 1 palabra + etiqueta-concepto abajo; paleta gris + 1 color de acento.
- Cursor/mano del jugador + anillo de clic como efecto nuevo.
