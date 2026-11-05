# Motion graphics con código (sin video de IA)

Dos modos, los dos con Remotion y `scripts/motion.py`. Todo se anima con código: el texto sale perfecto, cada cambio es gratis y se vuelve a renderizar sin generar nada nuevo.

| Modo | Para qué | Qué necesita |
|---|---|---|
| `reel` | Tips, listas, datos, gráficas, promos, explicativos | Un guion (y opcional: voz, música, marca) |
| `collage` | Historias de marca/producto, storytelling, curiosidades, anuncios con estilo | Guion + imágenes por capas (fotos del usuario o generadas con IA) |

## Flujo (siempre con revisión)
1. **Guion corto**: frases cortas, una idea por escena y algo que se pueda VER en cada una. Marca la palabra clave con `*asterisco*`.
2. Escribe el JSON (plantillas en `plantillas/`). Con voz, **el `texto` de cada escena debe ser exactamente lo que se dice en ella** (en una `lista`, los `items`).
3. **Control**: `python3 scripts/motion.py <modo> guion.json --control [--voz v.mp3] [--musica m.mp3] [--marca brands/x.json]` → render rápido a baja resolución + `control.jpg` (inicio, mitad y final de cada escena). **Míralo (Read) y enséñaselo al usuario antes del final.** Revisa: letras que asoman antes de entrar, recortes mal hechos, cámara demasiado tímida, texto ilegible en el celular.
4. Ajusta lo que pida «como a un editor» (más fuerza de cámara, otra palabra destacada, otra transición) y repite el control.
5. **Final**: el mismo comando sin `--control` (opcional `--salida`, `--formato 9:16|16:9|1:1|4:5`). Normaliza a -14 LUFS si hay audio. Entrega el MP4 con la herramienta de enviar archivos.
- Tiempos medidos en este servidor: unos 2 min por cada 15 s de video en el final; el control tarda bastante menos.
- Música: elígela con `recomendar_musica` (ver `musica.md`) y pásala con `--musica`; con voz se baja sola.

## Modo `reel`: escenas
| `tipo` | Campos | Qué hace |
|---|---|---|
| `gancho` | `texto`, `emoji` | Título grande palabra a palabra |
| `frase` | `texto` | Frase al ritmo de la voz |
| `lista` | `titulo`, `items[]` | Puntos que entran uno a uno, numerados |
| `dato` | `titulo`, `valor`, `prefijo`, `sufijo`, `etiqueta` | Contador animado (p. ej. 3 s, 71 %, $1,200) |
| `grafica` | `titulo`, `barras[{etiqueta, valor}]` | Barras; la mayor va en color acento |
| `cta` | `texto`, `etiqueta` | Llamada a la acción con botón que late |
Cada escena: `dur` en segundos (con voz se calcula sola). Global: `estilo` = `bold` (degradado + círculos), `neon` (oscuro con brillos y chispas) o `minimal`; `marca` o `--marca brands/x.json`; `progreso` (barra inferior).

## Modo `collage`: escenas por capas (2.5D)
Cada escena: `dur`, `capas[]`, `camara`, `fuerza`, `foco`, `texto`, `posTexto`, `transicion`, `particulas`.
- **Capa**: `src` (ruta relativa al guion), `z` (0 = fondo lejano … 1 = pegado a la cámara), `x`, `y` (centro 0-1), `ancho` (fracción del ancho del video), `mov` (`flotar`, `respirar`, `balanceo`), `croma` (true/false; por defecto se detecta solo el fondo verde o azul y se recorta).
- **Cámara**: `avanzar`, `retroceder`, `izquierda`, `derecha`, `subir`, `bajar`, `fija`; `fuerza` 1 normal, 2 «métete con fuerza». Las capas cercanas se mueven más que las lejanas (paralaje) y el fondo y el primerísimo plano se desenfocan un poco (profundidad).
- **Transición a la siguiente**: `hueco` (la cámara se mete por el `foco` y la escena nueva aparece por un círculo que crece desde ahí: ideal con una ventana, una puerta o un cristal en primer plano), `tapa` (se descubre detrás de una franja oscura), `fundido`, `corte`.
- **Algo que siempre se mueve**: `particulas` = `nieve`, `polvo`, `chispas`; y la luz cálida que cruza (global).
- **Textura** (global `textura`): `grano`, `papel`, `vineta`, `luz`, `colorLuz`. `serif: true` da letras de estilo archivo con la clave en cursiva; `colorClave` cambia su color.

### Las 4 cosas que más se notan (pídelas así)
1. **Profundidad**: cada capa a su distancia (`z`), el fondo con `ancho` > 1.1 para que no se vean bordes al moverse.
2. **Transiciones con sentido**: un objeto de la escena lleva a la siguiente (`hueco` por una ventana; `tapa` con algo que pasa por delante).
3. **Algo siempre en movimiento**: partículas, luz, `mov` en la capa del medio.
4. **Letras al ritmo de la voz**, con la palabra clave destacada.

### Imágenes por capas (si el usuario las genera con IA)
Para cada escena, dale los prompts listos:
- **Frase de estilo** igual al principio de TODOS los prompts (misma luz, grano y paleta). Ej.: «Vintage archival collage photograph, warm tungsten light, film grain, muted sepia palette, 1900s…».
- **Fondo**: una foto real del lugar (no degradados), vertical 9:16, sin personas.
- **Lo que se mueve** (persona, producto, objeto): sobre **fondo verde liso** (o azul si el objeto es verde), sin sombras en el fondo, encuadre completo.
- **Primer plano** (marco de ventana, rama, farola): sobre verde, con el hueco también en verde.
- **Personas reales**: nunca inventar su cara; de espaldas, en silueta o solo manos, y avisar en pantalla si es una recreación.
- Herramientas de imagen disponibles en esta cuenta: Higgsfield (conector, gasta créditos), Canva (`generate-image`), o las que el usuario use por su cuenta (Google Flow, etc.).
- Si una persona tiene que moverse de verdad (parpadear, escribir), hace falta un clip corto de video con IA (créditos); úsalo solo ahí.
