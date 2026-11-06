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
- O **banda sonora propia** con `--banda` (`scripts/sonido.py`): música sintetizada que cambia por `animo` de escena + efectos `sfx` + whoosh en las transiciones + ducking bajo la voz. Sin derechos de autor ni conectores.
- **Voz gratis**: Cloudflare Workers AI `@cf/deepgram/aura-2-es` (voces `alvaro`, `javier`, `nestor`, `sirio`, `aquila`…; `alvaro` = narrador grave y expresivo) con la cuenta de Cloudflare del usuario: `POST /accounts/<id>/ai/run/@cf/deepgram/aura-2-es` con `{"text", "speaker", "encoding": "mp3"}`.
- **Salida para celular**: el MP4 final siempre sale en H.264 yuv420p (rango tv), máx. 4 Mbps, faststart y -14 LUFS (`para_movil`), porque el `yuvj420p` que saca Remotion no abre en el iPhone.

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
- **Golpes visuales (retención)**: `titular` (palabra-sello roja que cae con sacudida y sonido justo cuando la voz dice la *clave*: «ROBADA», «1913», «¿Picasso?»), `efecto` (`flash` al entrar, `flashClave` en la clave, `sacudida` al entrar). Cada *clave* da además un pequeño golpe de zoom. Úsalos cada 2-3 escenas, no en todas.
- **Sonido por escena** (con `--banda`): `animo` (`misterio`, `robo`, `panico`, `investigacion`, `giro`, `final`: la música cambia de estilo al cambiar el ánimo) y `sfx` (`["pasos", {"tipo": "sello", "en": "clave"}, {"tipo": "tren", "en": 1.2, "dur": 3, "vol": 0.4}]`). Efectos: whoosh, impacto, sello, camara, pasos, puerta, llave, silbato, multitud, maquina, papel, tren, riser (termina en el momento indicado), latido, reloj, campana, revelacion, caja. Los whoosh de cada transición y el golpe de cada titular se ponen solos, y la música baja sola bajo la voz.
- **Historias largas (1-2 min)**: escena nueva cada 2-5 s (una frase por escena), ánimo que cambia cada 3-5 escenas, un titular o flash cada 2-3 escenas y un giro (`giro`: casi silencio) antes de cada revelación.
- **Capa**: `src` (ruta relativa al guion), `z` (0 = fondo lejano … 1 = pegado a la cámara), `x`, `y` (centro 0-1), `ancho` (fracción del ancho del video), `mov` (`flotar`, `respirar`, `balanceo`), `croma` (true/false; por defecto se detecta solo el fondo verde o azul y se recorta). El recorte va por **tono** (no solo «verde puro»): quita también las sombras verde oscuro que pinta la IA, las sombras de contacto casi negras, las manchas lima del croma mal iluminado y la viñeta oscura de las esquinas; elimina islas sueltas y trozos cortados por el borde, encoge 1 px el borde y quita el reflejo verde. Revisa siempre los recortes sobre magenta antes del render.
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
- **Generar las capas tú mismo** (en este orden):
  1. **`imagenes-flux`** (conector propio, gratis con la cuota diaria de Cloudflare): `generar_capas(estilo, fondo, elementos[], formato)` devuelve el fondo y cada elemento sobre croma, listos para el guion. Descarga las URLs junto al guion (`curl -o capa.jpg <url>`). Mira `cuota_imagenes` antes de escenas largas. Para un proyecto entero usa `scripts/flux_lote.py lista.json carpeta` (lee la URL del MCP con clave de `IMAGENES_FLUX_URL`; nunca la guardes en el repo).
  2. **Google Flow con Claude in Chrome**, solo cuando el usuario tenga **su computadora conectada** (Remote Control / navegador): usa la web normal de Flow en su sesión, como lo haría él, respetando sus reglas y límites (nada de llamadas internas ni de saltarse controles). Descarga cada imagen en 2K y súbela/pásala al guion.
  3. Higgsfield (conector, gasta créditos: di el precio antes) o Canva (`generate-image`).
- Si una persona tiene que moverse de verdad (parpadear, escribir), hace falta un clip corto de video con IA (créditos); úsalo solo ahí.
