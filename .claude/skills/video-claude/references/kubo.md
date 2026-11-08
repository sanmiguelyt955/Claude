# Kubo Studio: animaciones 3D virales con Blender (estilo cabezón)

App propia (clean room, inspirada en lo que hacen públicamente Creatorize y canales como Capybluh, sin su código ni sus
personajes). Todo gratis y en la nube: Blender 4.2 sin interfaz + Python. Carpeta: `kubo/`.

## Flujo
```
python3 kubo/kubo.py nuevo NOMBRE --guion "texto" [--voz-nombre Puck --estilo-voz "…"] [--voz mi_audio.mp3] | --sin-voz
python3 kubo/kubo.py plan NOMBRE        # borrador automático; CLAUDE lo dirige editando proyectos/kubo/NOMBRE/plan.json
python3 kubo/kubo.py revisar NOMBRE     # 1 cuadro por toma → datos/kubo/NOMBRE/control.jpg (5-10 s). Míralo SIEMPRE.
python3 kubo/kubo.py render NOMBRE --calidad borrador|normal|final [--tomas 3-4]
python3 kubo/kubo.py exportar NOMBRE [--musica caricatura|pulso|…|ninguna] [--densidad pocos|medios|muchos] [--lufs -18]
```
Voz: Gemini TTS (gratis; Puck = niño/divertido, Charon = grave) o Aura de respaldo. Whisper da el tiempo de cada
palabra y se corrige contra el guion (acentos, «la estufa»). Idioma: el del guion (inglés por defecto para alcance
mundial; el modo `--sin-voz` sirve para todos los idiomas).

Tiempos medidos (4 CPU, sin GPU): `normal` (720p, animado en dos) ≈ 7 s de render por segundo de video;
`final` (1080p, 24 cuadros/s, antialias 16) ≈ 50 s por segundo de video (17 s → 15 min). Exportar ≈ 15 s.

## Cómo funciona el conector de Blender (`kubo/blender_escena.py`)
1. `kubo.py` calcula los cuadros exactos de cada toma (sin acumular error con la voz) y escribe `_plan.json`.
2. Lanza `blender -b --factory-startup -P blender_escena.py -- _plan.json carpeta caras --calidad …`.
3. Por cada toma el script de Blender (bpy): borra la escena → arma el **escenario** con figuras básicas → los
   **objetos** → los **personajes** (cubos con bisel + contorno de tinta por casco invertido) → pega las **caras 2D**
   (PNG con transparencia de `caras.py`, una por expresión × boca abierta/cerrada × parpadeo) → **anima** cada cuadro con
   keyframes (pose de la acción, transición elástica, gesticulación al hablar, boca según las palabras, parpadeo,
   antena con resorte, sombra de contacto) → **cámara** con su movimiento → render Workbench a PNG.
4. `exportar` une los PNG con ffmpeg, quema los subtítulos ASS (libass), mezcla voz + música + efectos y sale el MP4
   (H.264, yuv420p, faststart, -18 LUFS: se oye bien en iPhone).

## Formato del plan
```json
{"formato": "9:16", "musica": "caricatura", "firma": true, "sfx_auto": true,
 "personajes": {"kubo": {"piel": "#3dd6c6", "ropa": "#ff8c1a", "pantalon": "#24304a", "antena": true}},
 "tomas": [{
   "rango": [0, 10],              // palabras de la voz que cubre (→ duración, subtítulos, boca). Sin voz: "dur": 2.0
   "clave": "cook",               // palabra en amarillo + «punch-in» de cámara (golpe_clave: false lo quita)
   "escenario": "cocina", "cielo": "#ffd166",
   "camara": "medio+empuje",      // cerca|medio|lejos|plano_general|detalle + empuje|alejar|orbita|paneo|picado|contrapicado|lateral|temblor|golpe
   "objetivo": "papa",            // a quién mira la cámara (si no, al grupo)
   "cabecera": "WHEN I'M WITH DAD",   // texto arriba: SOLO si el formato lo pide
   "barra": {"opciones": ["1s", "10s", "1m"], "activa": 1},   // barra de opciones: SOLO en formatos de escalera
   "animo": "alegre",             // alegre|caos|misterio|panico|giro|final… (la música cambia con el ánimo)
   "sfx": [{"tipo": "vine_boom", "en": "clave"}],
   "actores": [{"id": "kubo", "pos": [1, -0.4], "mira": -20,
                "caras": [[0, "sospecha"], [1.5, "miedo"]],            // cambian en el tiempo (con «pop»)
                "gestos": [[0, "quieto"], [1.5, "sorpresa"], [2.2, "miedo"]],  // acciones encadenadas, transición elástica
                "habla": true, "salto_en": 0.3, "hasta": [2, 0]}],
   "props": [{"tipo": "fogata", "pos": [-0.6, 2], "z": 1.25, "escala": 1.3, "giro": 90, "color": "#ff7f11"}]}]}
```
- **Escenarios**: cuarto, cocina, parque, calle, escuela, tienda, noche, estudio (fondo liso de color).
- **Objetos**: mesa, silla, cama, arbol, caja_regalo, fogata, tele, puerta, coche, sofa, bici, dinero, nube, bloque,
  castillo, columpio, malvavisco, libro, humo, estufa.
- **Caras**: normal, feliz, risa, triste, enojado, sorpresa, miedo, extasis, malvado, sospecha, grito, dormido, mareado,
  ko, enamorado, pensando.
- **Acciones**: quieto, agitar, senalar, pensar, comer, celebrar, bailar, saltar, sorpresa, temblar/miedo, susto (se le
  sale la cabeza), golpe (reacción a impacto), zapatear (enojo), caminar, correr (con «hasta»), volar, caer.
- **Personajes**: piel, ropa, mangas, pantalon, altura, cabeza (cubo|esfera), pelo, gorra, gorro_chef, orejas, antena.

## Efectos visuales (`"efectos"` por toma; cada uno suena solo y sacude la cámara si toca)
```json
{"tipo": "signo", "texto": "!|?|!?|$|zzz|♥|+|x|ok|idea", "sobre": "kubo", "en": 0.4, "dur": 1.2, "lado": 1}
{"tipo": "etiqueta", "texto": "1/3", "pos": [0, 0.2, 4.2], "en": 0.4, "hasta": 3.0, "fondo": "#2ecc71", "tam": 0.9}
{"tipo": "particulas", "clase": "monedas|estrellas|chispas|polvo|confeti|corazones|gotas|humo|fuego", "sobre": "kubo", "en": 0.5, "n": 18}
{"tipo": "estallido", "texto": "POW!", "sobre": "kubo", "en": 1.0, "tam": 1.2, "color": "#ffd23f"}
{"tipo": "grieta", "pos": [0, -0.6], "plano": "piso|pared", "z": 1.5, "en": 1.8, "dur": 0.4, "tam": 1.6}
{"tipo": "indicador", "forma": "esfera|barra|panel", "pos": [x, y, z], "poste": true, "colores": [[0, "#e74c3c"], [1.5, "#2ecc71"]]}
{"tipo": "flecha", "de": [x, y, z], "a": [x, y, z], "en": 0.5, "dur": 2, "color": "#ff3b3b"}
{"tipo": "lineas", "sobre": "kubo", "en": 0.8, "dur": 1.4, "sentido": -1}
```
Sonidos automáticos: signo ! → pop, ? → burbuja, idea → destello, $ → monedas, x → error, ok/+ → correcto;
monedas → ka-ching, estrellas → destello, confeti → tada; estallido → remate + golpe; grieta → crujido; indicador →
correcto (verde) / error (rojo); flecha → swoosh. Más un swoosh en cada corte y la firma al inicio y al final.
`"control_en": 1.5` en una toma = qué instante muestra `revisar` (para ver los efectos).

Otros: `"frases": [a, b]` (la toma cubre las frases a..b del guion: más fácil que `rango`), `"lleva": "pastel"`
(objeto en la mano que sigue al brazo), `"mirar_a"` / `"cuanto_gira"` / `"max_giro"` / `"mirada": "i|d"` (miradas de
3/4 con los ojos hacia el otro, nunca de perfil), `"angulo"` de cámara (80 = de lado). Objetos nuevos: caja_cobro,
pastel, cupon.

## Idiomas: una pista de audio por idioma (`kubo.py idiomas NOMBRE`)
En el plan: `"idioma": "en"` (el del render) y `"idiomas": {"es": {"voz": "Puck", "estilo": "…", "tomas": [un texto
por toma], "claves": [palabra amarilla por toma], "cabeceras": [opcional]}, "pt": {…}, …}`. Claude escribe las
traducciones (naturales, no literales, mismo sentido por toma). Para cada idioma: voz (Gemini TTS) → Whisper → cada
frase se coloca donde empezaba la original y se acelera hasta 1.35× si no cabe → banda con ducking → salen
`audio_<idioma>.m4a` (subir en YouTube Studio → Idiomas → Agregar audio), `subtitulos_<idioma>.srt` y
`NOMBRE_<idioma>.mp4` con subtítulos quemados (TikTok/Reels/Facebook). Además `NOMBRE_global.mp4`: el video sin
subtítulos quemados, para subir a YouTube con todas las pistas y los .srt.

## El personaje de la marca: Kubo
Cubo turquesa con sudadera naranja y **antena con foco que cambia de color con la emoción** (amarillo feliz, rojo
enojo, azul triste, blanco miedo, verde idea, morado sospecha). Gag fijo: **se le sale la cabeza del susto**. Por qué se
recuerda: silueta única (cubo + antena), color propio (no amarillo, para no parecerse a avatares de juegos), un rasgo
que cuenta la emoción sin idioma y un gag repetible que la audiencia espera.

## Sonido con intención (marketing y psicología)
- **Firma sonora** «bip-bip-DING» (el foco que se prende) al inicio y al final: reconocimiento de marca por el oído
  (efecto de mera exposición) y cierre que invita a repetir (loop).
- **Tema del canal**: la música `caricatura` (Fa mayor, 128 BPM) repite las mismas 3 notas de la firma cada 2 compases:
  el canal suena igual en todos los videos → al oírlo en el feed, el cerebro lo reconoce antes de verlo.
- **Efectos pegados al movimiento** (`sfx_auto`): cada salto suena al despegar, el susto con grito + boing al salir la
  cabeza, la caída al tocar el piso, comer, pisotones… La coherencia imagen-sonido hace que se sienta «bien hecho».
- Ánimo `caos` (más rápido) en el clímax; `alegre` para la presentación y el remate.

## Reglas de dirección (lo que hace bueno un video)
1. Gancho en 0-2 s: acción o cara fuerte desde el primer cuadro, nunca un personaje quieto.
2. Una toma por idea (1-3 s). Corta en cada frase; el clímax hacia el 70 %.
3. Cada toma tiene movimiento: `gestos` encadenados, `caras` que cambian, cámara que se mueve.
3b. Guion con la plantilla de `references/guiones.md` (≥ 61 s, gancho → explicación visual → giro → CTA → reto).
4. Revisar con `revisar` antes de renderizar; render `normal` para probar y `final` para publicar.
5. Textos en pantalla (`cabecera`, `barra`) solo cuando el formato los necesita.

## Formato «maqueta» (toma única con cámara que vuela) — 2026-11-08
- `"escenario": "maqueta"`: tablero tipo juego de construir (pasillos de estantes en x ∈ {-3.2,0,3.2}, y ∈ {-2.5,0.5,3.5};
  caja de cobro en (4.2,-5.2); puerta al frente). Personaje chico: `"altura": 0.45` en el personaje.
- `"vuelo": [{"t", "pos":[x,y,z], "mira":[x,y,z]}, …]` en la toma: la cámara pasa por cada clave (curva suave que frena
  al llegar). Pon una clave en el segundo de cada clic, mirando al punto del clic. Respeta sacudidas y golpe_en.
- Efecto `"cursor"`: `{"tipo":"cursor","desde":0.3,"clics":[{"en":1.2,"pos":[x,y,z]} | {"en":…,"sobre":"kubo"}],
  "tam":0.75,"color":"#ffffff","anillo":"#38d94a"}`. Viaja en arco entre clics, se hunde al hacer clic, anillo verde
  que se expande, tamaño constante en pantalla, sonido «clic» automático.
- Etiqueta de concepto estilo juego (abajo a la izquierda, se traduce por idioma): `"concepto": "PLANOGRAM"` o lista
  `[{"texto":"ROUTE","en":1.2,"color":"#38d94a"}, …]` (cada una dura hasta la siguiente). En `idiomas.<l>.conceptos`
  va la traducción por toma (texto o lista).
- Prueba: proyectos/kubo/prueba_maqueta (10 s, 1.1 min de render normal).
